"""EPICS CA helpers for the snapshot feature.

All reads/writes run in a single dedicated thread to avoid libca threading
issues — pyepics is not safe to call from multiple threads simultaneously.
"""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

log = logging.getLogger(__name__)

READONLY_FIELDS = {".RBV", ".DESC", ".EGU", ".RRBV", ".MRES", ".ERES", ".RRES"}

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

# Single worker thread — all CA calls run here sequentially to keep libca happy.
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ca-snap")


def _read_all(pvnames: list[str]) -> dict[str, float | str | None]:
    """Read all PVs sequentially in the CA thread."""
    try:
        import epics
    except ImportError:
        return {pv: None for pv in pvnames}
    result: dict[str, float | str | None] = {}
    for pv in pvnames:
        try:
            val = epics.caget(pv, timeout=0.5, use_monitor=False)
            result[pv] = val
        except Exception as exc:
            log.debug("caget %s failed: %s", pv, exc)
            result[pv] = None
    return result


def _write_all(pv_value_map: dict[str, float | str]) -> dict[str, bool]:
    """Write PVs sequentially in the CA thread, skipping read-only fields."""
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


async def read_pvs(pv_field_pairs: list[str]) -> dict[str, float | str | None]:
    """Read a list of full PV+field strings in the CA thread."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_executor, _read_all, list(pv_field_pairs))


async def write_pvs(pv_value_map: dict[str, float | str]) -> dict[str, bool]:
    """Write {pvfield: value} pairs in the CA thread."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_executor, _write_all, dict(pv_value_map))
