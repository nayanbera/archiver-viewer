"""EPICS CA helpers for the snapshot feature.

Uses persistent PV subscriptions (camonitor style) so live-value reads are
instant — the cache is updated by CA callbacks in the background rather than
by sequential caget calls per request.

Write (restore) still uses caput via a single dedicated thread.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from concurrent.futures import ThreadPoolExecutor

log = logging.getLogger(__name__)

READONLY_FIELDS = {".RBV", ".RRBV", ".RRES"}

DEFAULT_MOTOR_FIELDS = [
    ".VAL",
    ".RBV",
    ".OFF",
    ".LLM",
    ".HLM",
    ".VELO",
    ".VBAS",
    ".ACCL",
    ".BDST",
    ".BVEL",
    ".MRES",
    ".ERES",
    ".RDBD",
    ".EGU",
    ".DESC",
]

# ── Live value cache ──────────────────────────────────────────────────────────

_cache: dict[str, float | str | None] = {}
_pv_objects: dict[str, object] = {}   # pvname → epics.PV
_cache_lock = threading.Lock()

# Single thread for caput (writes still need sequential CA access)
_write_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ca-write")


def _make_callback(pvname: str):
    def _cb(value=None, **_kw):
        with _cache_lock:
            _cache[pvname] = value
    return _cb


def _subscribe_one(pvname: str) -> None:
    """Connect and subscribe to one PV in the CA background thread."""
    try:
        import epics
        if pvname in _pv_objects:
            return
        pv = epics.PV(pvname, callback=_make_callback(pvname), auto_monitor=True)
        _pv_objects[pvname] = pv
    except Exception as exc:
        log.warning("subscribe %s failed: %s", pvname, exc)


def _unsubscribe_one(pvname: str) -> None:
    pv = _pv_objects.pop(pvname, None)
    if pv is not None:
        try:
            pv.disconnect()
        except Exception:
            pass
    with _cache_lock:
        _cache.pop(pvname, None)


def update_subscriptions(pvnames: list[str]) -> None:
    """
    Sync subscriptions to match pvnames.
    Called at startup and whenever the PV config changes.
    Runs in the calling thread — pyepics PV() handles its own CA thread.
    """
    try:
        import epics  # noqa: F401 — ensure libca is loaded before any PV()
    except ImportError:
        log.warning("pyepics not available — live CA monitoring disabled")
        return

    wanted = set(pvnames)
    current = set(_pv_objects.keys())

    for pv in current - wanted:
        _unsubscribe_one(pv)

    for pv in wanted - current:
        _subscribe_one(pv)

    log.info("CA subscriptions: %d active", len(_pv_objects))


def get_cached_values(pvnames: list[str]) -> dict[str, float | str | None]:
    """Return latest cached values for the given PVs — no network I/O."""
    with _cache_lock:
        return {pv: _cache.get(pv) for pv in pvnames}


# ── Write (restore) ───────────────────────────────────────────────────────────

def _write_all(pv_value_map: dict[str, float | str]) -> dict[str, bool]:
    """Write PVs sequentially in the dedicated CA thread."""
    try:
        import epics
    except ImportError:
        return {pv: False for pv in pv_value_map}
    out: dict[str, bool] = {}
    for pv, val in pv_value_map.items():
        if any(pv.endswith(ro) for ro in READONLY_FIELDS):
            continue
        try:
            status = epics.caput(pv, val, timeout=5.0, wait=True)
            out[pv] = status == 1
        except Exception as exc:
            log.warning("caput %s failed: %s", pv, exc)
            out[pv] = False
    return out


async def write_pvs(pv_value_map: dict[str, float | str]) -> dict[str, bool]:
    """Write {pvfield: value} pairs via the dedicated CA write thread."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_write_executor, _write_all, dict(pv_value_map))


# ── Snapshot read (uses cache, falls back to nothing for unknown PVs) ─────────

async def read_pvs(pv_field_pairs: list[str]) -> dict[str, float | str | None]:
    """Return cached values for the requested PVs.

    If a PV isn't subscribed yet (e.g. newly added), its value will be None
    until the CA callback fires — typically within a second of subscription.
    """
    return get_cached_values(pv_field_pairs)
