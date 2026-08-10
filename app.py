import json
import os
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="AR Viewer")

ARCHIVER_MGMT_URL = os.getenv("ARCHIVER_MGMT_URL", "http://164.54.169.92:17665")
CONFIG_PATH = Path("config/overrides.json")

DEFAULT_CONFIG = {
    "pvOverrides": {},
    "stationLabels": {},
    "deviceTypes": {},
    "hiddenPVs": [],
    "viewerBaseUrl": f"{ARCHIVER_MGMT_URL}/viewer/index.html",
    "viewerUrlFormat": "query",
}


def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except Exception:
            pass
    return DEFAULT_CONFIG.copy()


@app.get("/api/pvs")
async def get_all_pvs():
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(f"{ARCHIVER_MGMT_URL}/mgmt/bpl/getAllPVs")
            r.raise_for_status()
            return r.json()
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Cannot reach archiver: {exc}")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=str(exc))


@app.get("/api/config")
async def get_config():
    return load_config()


@app.post("/api/config")
async def save_config(request: Request):
    body = await request.json()
    CONFIG_PATH.parent.mkdir(exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(body, indent=2))
    return {"status": "ok"}


# Proxy the archiver viewer to strip X-Frame-Options (handles iframe embedding)
@app.get("/archiver-proxy/{path:path}")
async def proxy_archiver(path: str, request: Request):
    qs = str(request.query_params)
    target = f"{ARCHIVER_MGMT_URL}/{path}"
    if qs:
        target += f"?{qs}"
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.get(target)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    skip = {"x-frame-options", "content-security-policy", "transfer-encoding", "connection"}
    headers = {k: v for k, v in resp.headers.items() if k.lower() not in skip}
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=headers,
        media_type=resp.headers.get("content-type", "application/octet-stream"),
    )


app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
