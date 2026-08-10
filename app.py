import json
import logging
import os
from pathlib import Path

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

def find_free_port(start: int, retries: int = 20) -> int:
    import socket
    for port in range(start, start + retries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("", port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"No free port found in range {start}–{start + retries - 1}")


if __name__ == "__main__":
    import uvicorn
    requested = int(os.getenv("PORT", "8080"))
    port = find_free_port(requested)
    if port != requested:
        log.warning("Port %d is in use — using port %d instead", requested, port)
    log.info("=" * 50)
    log.info("  Archiver Viewer running at http://localhost:%d", port)
    log.info("=" * 50)
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False, workers=1)
