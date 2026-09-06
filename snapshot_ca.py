"""EPICS CA helpers for the snapshot feature.

Reads and writes PV fields using pyepics.  All public functions are async-safe:
they run synchronous epics calls in a thread-pool executor so FastAPI's event
loop is never blocked.
"""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

log = logging.getLogger(__name__)

# Fields that are purely informational — read at snapshot time but never written
# back during a restore.
READONLY_FIELDS = {".RBV", ".DESC", ".EGU", ".RRBV", ".MRES", ".ERES", ".RRES"}

# Default set of motor-record fields to capture when the user hasn't customised
# a PV's field list.
DEFAULT_MOTOR_FIELDS = [
    ".VAL",   # setpoint / user position
    ".RBV",   # readback (read-only)
    ".OFF",   # user offset
    ".LLM",   # low soft limit
    ".HLM",   # high soft limit
    ".VELO",  # slew velocity
    ".VBAS",  # base velocity
    ".ACCL",  # acceleration time
    ".BDST",  # backlash distance
    ".BVEL",  # backlash velocity
    ".MRES",  # motor resolution (steps/EGU) — read-only display
    ".ERES",  # encoder resolution — read-only display
    ".RDBD",  # retry deadband
    ".EGU",   # engineering units (read-only)
    ".DESC",  # description (read-only)
]

_executor = ThreadPoolExecutor(max_workers=32, thread_name_prefix="ca-snap")


def _ca_get(pvname: str) -> float | str | None:
    """Synchronous single PV read via pyepics."""
    try:
        import epics
        val = epics.caget(pvname, timeout=2.0, use_monitor=False)
        return val
    except Exception as exc:
        log.warning("caget %s failed: %s", pvname, exc)
        return None


def _ca_put(pvname: str, value) -> bool:
    """Synchronous single PV write via pyepics. Returns True on success."""
    try:
        import epics
        status = epics.caput(pvname, value, timeout=5.0, wait=True)
        return status == 1
    except Exception as exc:
        log.warning("caput %s failed: %s", pvname, exc)
        return False


async def read_pvs(pv_field_pairs: list[str]) -> dict[str, float | str | None]:
    """Read a list of full PV+field strings (e.g. '15IDA:m1.VAL') in parallel.

    Returns {pvfield: value} dict.  Missing / disconnected PVs map to None.
    """
    loop = asyncio.get_running_loop()
    tasks = {
        pvf: loop.run_in_executor(_executor, _ca_get, pvf)
        for pvf in pv_field_pairs
    }
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    return {
        pvf: (None if isinstance(v, Exception) else v)
        for pvf, v in zip(tasks.keys(), results)
    }


async def write_pvs(pv_value_map: dict[str, float | str]) -> dict[str, bool]:
    """Write {pvfield: value} pairs in parallel.

    Skips read-only fields silently.  Returns {pvfield: success} dict.
    """
    loop = asyncio.get_running_loop()
    writable = {
        pvf: val for pvf, val in pv_value_map.items()
        if not any(pvf.endswith(ro) for ro in READONLY_FIELDS)
    }
    tasks = {
        pvf: loop.run_in_executor(_executor, _ca_put, pvf, val)
        for pvf, val in writable.items()
    }
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    return {
        pvf: (False if isinstance(v, Exception) else bool(v))
        for pvf, v in zip(tasks.keys(), results)
    }
