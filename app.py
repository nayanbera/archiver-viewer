import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

app = FastAPI(title="Archiver Viewer")

ARCHIVER_MGMT_URL      = os.getenv("ARCHIVER_MGMT_URL",      "http://164.54.169.92:17665")
ARCHIVER_RETRIEVAL_URL = os.getenv("ARCHIVER_RETRIEVAL_URL",  "http://164.54.169.92:17668")
CONFIG_PATH            = Path(os.getenv("CONFIG_PATH", "config/overrides.json"))

DEFAULT_CONFIG = {
    "pvOverrides":   {},
    "stationLabels": {},
    "deviceTypes":   {},
    "hiddenPVs":     [],
    "annotations":   [],
    "annotationPassword": "",
    "viewerBaseUrl":    f"{ARCHIVER_RETRIEVAL_URL}/retrieval/ui/viewer/archViewer.html",
    "viewerUrlFormat":  "query",
}


def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except Exception as exc:
            log.warning("Could not parse config file: %s", exc)
    return DEFAULT_CONFIG.copy()


@app.get("/api/pvs")
async def get_all_pvs():
    """Return every archived PV. AA defaults to 500; limit=999999 fetches all."""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.get(
                f"{ARCHIVER_MGMT_URL}/mgmt/bpl/getAllPVs",
                params={"limit": 999999},
            )
            r.raise_for_status()
            log.info("getAllPVs returned %d PVs", len(r.json()))
            return r.json()
    except httpx.RequestError as exc:
        log.error("getAllPVs failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"Cannot reach archiver: {exc}")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=str(exc))


@app.get("/api/data")
async def get_pv_data(request: Request):
    """Fetch PV samples as JSON for Plotly rendering.

    Uses AA's mean_N operator (N seconds per bin) for server-side decimation so
    the archiver returns ~points samples regardless of raw sample count.  N is
    computed from the requested time range so the output resolution matches.
    Pass raw=true to fetch every sample (slower but exact).
    """
    import asyncio
    from datetime import datetime, timezone

    pvs    = request.query_params.getlist("pv")
    from_  = request.query_params.get("from")
    to     = request.query_params.get("to")
    points = int(request.query_params.get("points", "1000"))
    raw    = request.query_params.get("raw", "false").lower() == "true"

    if not pvs or not from_ or not to:
        raise HTTPException(status_code=400, detail="Provide pv=, from=, and to= params")

    # Compute bin size from the requested time range.  mean_N(PV) asks the
    # archiver to return one mean value per N-second interval, giving ~points
    # samples over the range.  We only apply it when N >= 2 (i.e. the range is
    # long enough that decimation is worth it); shorter ranges get raw data.
    try:
        from_dt = datetime.fromisoformat(from_.replace("Z", "+00:00"))
        to_dt   = datetime.fromisoformat(to.replace("Z", "+00:00"))
        bin_s   = int((to_dt - from_dt).total_seconds() / points)
    except Exception:
        bin_s = 0
    use_mean = not raw and bin_s >= 2

    async def fetch_one(client: httpx.AsyncClient, pv: str):
        try:
            pv_query = f"mean_{bin_s}({pv})" if use_mean else pv
            r = await client.get(
                f"{ARCHIVER_RETRIEVAL_URL}/retrieval/data/getData.json",
                params={"pv": pv_query, "from": from_, "to": to},
            )
            r.raise_for_status()
            payload = r.json()
            timestamps, values = [], []
            if payload and isinstance(payload, list) and payload[0].get("data"):
                for d in payload[0]["data"]:
                    ts = datetime.fromtimestamp(
                        d["secs"] + d.get("nanos", 0) / 1e9,
                        tz=timezone.utc,
                    ).isoformat()
                    val = d.get("val")
                    if val is None:
                        continue
                    timestamps.append(ts)
                    values.append(val[0] if isinstance(val, list) else val)
            mode = "raw" if not use_mean else f"mean_{bin_s}"
            log.info("api/data: %s → %d samples (%s)", pv, len(timestamps), mode)
            return {"pv": pv, "timestamps": timestamps, "values": values}
        except Exception as exc:
            log.warning("api/data failed for %s: %s", pv, exc)
            return {"pv": pv, "timestamps": [], "values": [], "error": str(exc)}

    async with httpx.AsyncClient(timeout=120.0) as client:
        results = await asyncio.gather(*[fetch_one(client, pv) for pv in pvs])

    return list(results)


@app.get("/api/csv")
async def download_csv(request: Request):
    """Fetch PV data in parallel, merge into wide-format CSV.

    Uses the same mean_N decimation as /api/data by default so the exported
    values match what is plotted.  Pass raw=true to get every archived sample.
    """
    import asyncio, csv, io
    from collections import defaultdict
    from datetime import datetime, timezone

    pvs    = request.query_params.getlist("pv")
    from_  = request.query_params.get("from")
    to     = request.query_params.get("to")
    points = int(request.query_params.get("points", "1200"))
    raw    = request.query_params.get("raw", "false").lower() == "true"
    if not pvs or not from_ or not to:
        raise HTTPException(status_code=400, detail="Provide at least one pv=, from=, and to= param")

    # Same decimation logic as /api/data
    try:
        from_dt = datetime.fromisoformat(from_.replace("Z", "+00:00"))
        to_dt   = datetime.fromisoformat(to.replace("Z", "+00:00"))
        bin_s   = int((to_dt - from_dt).total_seconds() / points)
    except Exception:
        bin_s = 0
    use_mean = not raw and bin_s >= 2

    async def fetch_one_csv(client: httpx.AsyncClient, pv: str):
        try:
            pv_query = f"mean_{bin_s}({pv})" if use_mean else pv
            r = await client.get(
                f"{ARCHIVER_RETRIEVAL_URL}/retrieval/data/getData.json",
                params={"pv": pv_query, "from": from_, "to": to},
            )
            r.raise_for_status()
            payload = r.json()
            rows: list[tuple[str, object]] = []
            if payload and isinstance(payload, list) and payload[0].get("data"):
                for d in payload[0]["data"]:
                    ts = datetime.fromtimestamp(
                        d["secs"] + d.get("nanos", 0) / 1e9,
                        tz=timezone.utc,
                    ).isoformat()
                    val = d.get("val")
                    if val is None:
                        continue
                    rows.append((ts, val[0] if isinstance(val, list) else val))
            mode = "raw" if not use_mean else f"mean_{bin_s}"
            log.info("CSV fetch: %s → %d samples (%s)", pv, len(rows), mode)
            return pv, rows
        except Exception as exc:
            log.warning("CSV fetch failed for %s: %s", pv, exc)
            return pv, []

    async with httpx.AsyncClient(timeout=300.0) as client:
        fetched = await asyncio.gather(*[fetch_one_csv(client, pv) for pv in pvs])

    pv_data = dict(fetched)

    # Wide-format merge: one row per timestamp, one column per PV
    merged: dict[str, dict[str, object]] = defaultdict(dict)
    for pv, rows in pv_data.items():
        for ts, val in rows:
            merged[ts][pv] = val

    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["Timestamp (UTC)"] + pvs)
    for ts in sorted(merged):
        writer.writerow([ts] + [merged[ts].get(pv, "") for pv in pvs])

    log.info("CSV download: %d PVs, %d rows", len(pvs), len(merged))
    return Response(
        content=out.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=archiver_data.csv"},
    )


@app.get("/api/search")
async def search_pvs(pattern: str, limit: int = 5000):
    """Search archived PVs by glob pattern, e.g. 15IDA:* or *:M1:*"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(
                f"{ARCHIVER_RETRIEVAL_URL}/retrieval/bpl/getMatchingPVs",
                params={"pv": pattern, "limit": limit},
            )
            r.raise_for_status()
            return r.json()
    except httpx.RequestError as exc:
        log.error("getMatchingPVs failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"Cannot reach archiver: {exc}")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=str(exc))


@app.get("/api/config")
async def get_config():
    return load_config()


@app.post("/api/config")
async def save_config(request: Request):
    body = await request.json()
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(body, indent=2))
    log.info("Config saved to %s", CONFIG_PATH)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Snapshot config + data file
# ---------------------------------------------------------------------------

SNAPSHOT_PATH = Path(os.getenv("SNAPSHOT_PATH", "config/snapshots.json"))

DEFAULT_SNAPSHOT_CONFIG: dict[str, Any] = {
    "stations": {},   # { stationName: { pvs: [ {pv, fields: [".VAL", ...]} ] } }
    "snapshots": [],  # [ {id, name, station, created_at, values: {pvfield: val}} ]
}


def load_snapshots() -> dict:
    if SNAPSHOT_PATH.exists():
        try:
            return json.loads(SNAPSHOT_PATH.read_text())
        except Exception as exc:
            log.warning("Could not parse snapshots file: %s", exc)
    return {k: v for k, v in DEFAULT_SNAPSHOT_CONFIG.items()}


def save_snapshots(data: dict) -> None:
    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_PATH.write_text(json.dumps(data, indent=2))


# ---------------------------------------------------------------------------
# Snapshot API
# ---------------------------------------------------------------------------

@app.get("/api/snapshots/ca-status")
async def ca_status():
    """Check whether pyepics is importable on this server."""
    try:
        import epics
        return {"ok": True, "version": getattr(epics, "__version__", "unknown")}
    except ImportError as exc:
        return {"ok": False, "error": str(exc),
                "hint": "Run: pip install pyepics  in the archiver-viewer conda environment, then restart the service."}


@app.get("/api/snapshots/config")
async def get_snapshot_config():
    """Return the per-station PV configuration."""
    return load_snapshots()["stations"]


@app.post("/api/snapshots/config")
async def save_snapshot_config(request: Request):
    """Replace the per-station PV configuration."""
    body = await request.json()
    data = load_snapshots()
    data["stations"] = body
    save_snapshots(data)
    log.info("Snapshot config saved")
    return {"status": "ok"}


@app.get("/api/snapshots/live")
async def read_live_values(station: str = ""):
    """Read live CA values for all PVs in the given station (or all stations)."""
    from snapshot_ca import read_pvs, DEFAULT_MOTOR_FIELDS
    data = load_snapshots()
    stations = data.get("stations", {})

    pv_field_pairs: list[str] = []
    for st_name, st_cfg in stations.items():
        if station and st_name != station:
            continue
        for entry in st_cfg.get("pvs", []):
            pv = entry["pv"]
            fields = entry.get("fields") or DEFAULT_MOTOR_FIELDS
            for f in fields:
                pv_field_pairs.append(pv + f)

    if not pv_field_pairs:
        return {}

    values = await read_pvs(pv_field_pairs)
    return values


@app.get("/api/snapshots")
async def list_snapshots(station: str = ""):
    """List saved snapshots, optionally filtered by station."""
    data = load_snapshots()
    snaps = data.get("snapshots", [])
    if station:
        snaps = [s for s in snaps if s.get("station") == station]
    return snaps


@app.post("/api/snapshots")
async def take_snapshot(request: Request):
    """Take a new snapshot: read live CA values and persist."""
    from snapshot_ca import read_pvs, DEFAULT_MOTOR_FIELDS
    body = await request.json()
    name    = (body.get("name") or "").strip()
    station = (body.get("station") or "").strip()
    if not name or not station:
        raise HTTPException(400, "name and station are required")

    data     = load_snapshots()
    st_cfg   = data.get("stations", {}).get(station)
    if not st_cfg:
        raise HTTPException(404, f"Station '{station}' not configured")

    pv_field_pairs = []
    for entry in st_cfg.get("pvs", []):
        pv = entry["pv"]
        fields = entry.get("fields") or DEFAULT_MOTOR_FIELDS
        for f in fields:
            pv_field_pairs.append(pv + f)

    values = await read_pvs(pv_field_pairs)

    snap = {
        "id":         str(uuid.uuid4())[:8],
        "name":       name,
        "station":    station,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "values":     values,
    }
    data.setdefault("snapshots", []).append(snap)
    save_snapshots(data)
    log.info("Snapshot saved: %s / %s (%d PVs)", station, name, len(values))
    return snap


@app.delete("/api/snapshots/{snap_id}")
async def delete_snapshot(snap_id: str):
    data = load_snapshots()
    before = len(data.get("snapshots", []))
    data["snapshots"] = [s for s in data.get("snapshots", []) if s["id"] != snap_id]
    if len(data["snapshots"]) == before:
        raise HTTPException(404, "Snapshot not found")
    save_snapshots(data)
    return {"status": "ok"}


@app.post("/api/snapshots/{snap_id}/restore")
async def restore_snapshot(snap_id: str, request: Request):
    """Restore selected PV values.  Requires the annotation password."""
    from snapshot_ca import write_pvs, READONLY_FIELDS
    body = await request.json()

    # Password check — reuse annotationPassword from overrides.json
    cfg      = load_config()
    required = cfg.get("annotationPassword", "")
    provided = body.get("password", "")
    if required and provided != required:
        raise HTTPException(403, "Incorrect password")

    # Find the snapshot
    data = load_snapshots()
    snap = next((s for s in data.get("snapshots", []) if s["id"] == snap_id), None)
    if not snap:
        raise HTTPException(404, "Snapshot not found")

    # selected: list of pvfield keys to restore; if empty restore all writable
    selected: list[str] | None = body.get("selected")
    values = snap["values"]
    if selected is not None:
        values = {k: v for k, v in values.items() if k in selected}

    # Filter out None values and read-only fields
    to_write = {
        k: v for k, v in values.items()
        if v is not None and not any(k.endswith(ro) for ro in READONLY_FIELDS)
    }

    if not to_write:
        return {"results": {}, "message": "Nothing to restore"}

    results = await write_pvs(to_write)
    success = sum(1 for v in results.values() if v)
    log.info("Restore snapshot %s: %d/%d PVs written", snap_id, success, len(results))
    return {"results": results, "written": success, "total": len(results)}


@app.get("/archiver-proxy/{path:path}")
async def proxy_archiver(path: str, request: Request):
    """Proxy archiver viewer, stripping X-Frame-Options so it embeds in the iframe."""
    qs     = str(request.query_params)
    target = f"{ARCHIVER_RETRIEVAL_URL}/{path}"
    if qs:
        target += f"?{qs}"
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.get(target)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    skip = {"x-frame-options", "content-security-policy", "transfer-encoding", "connection"}
    headers = {k: v for k, v in resp.headers.items() if k.lower() not in skip}
    return Response(content=resp.content, status_code=resp.status_code,
                    headers=headers, media_type=resp.headers.get("content-type"))


app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8091"))
    log.info("=" * 50)
    log.info("  Archiver Viewer running at http://localhost:%d", port)
    log.info("=" * 50)
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False, workers=1)
