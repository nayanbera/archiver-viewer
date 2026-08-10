export function groupPVs(pvList, config = {}) {
  const { pvOverrides = {}, hiddenPVs = [] } = config;
  const hiddenSet = new Set(hiddenPVs);
  const groups = {};
  for (const pv of pvList) {
    if (hiddenSet.has(pv)) continue;
    const ov = pvOverrides[pv];
    let station, device;
    if (ov) {
      station = ov.station || '_Ungrouped';
      device  = ov.device  || pv;
    } else {
      const parts = pv.split(':');
      station = parts.length >= 1 ? parts[0] : '_Ungrouped';
      device  = parts.length >= 2 ? parts[1] : '_Direct';
    }
    if (!groups[station]) groups[station] = {};
    if (!groups[station][device]) groups[station][device] = [];
    groups[station][device].push(pv);
  }
  return groups;
}

export function filterGroups(groups, query) {
  if (!query.trim()) return groups;
  const q = query.toLowerCase();
  const out = {};
  for (const [st, devs] of Object.entries(groups)) {
    const matchDevs = {};
    for (const [dev, pvs] of Object.entries(devs)) {
      const hits = pvs.filter(p =>
        p.toLowerCase().includes(q) ||
        dev.toLowerCase().includes(q) ||
        st.toLowerCase().includes(q)
      );
      if (hits.length) matchDevs[dev] = hits;
    }
    if (Object.keys(matchDevs).length) out[st] = matchDevs;
  }
  return out;
}

export function buildViewerUrl(pvNames, from, to, cfg = {}) {
  const base   = cfg.viewerBaseUrl  || 'http://164.54.169.92:17668/retrieval/ui/viewer/archViewer.html';
  const format = cfg.viewerUrlFormat || 'query';
  const pvStr  = pvNames.map(p => `pv=${encodeURIComponent(p)}`).join('&');
  const fromS  = (from instanceof Date ? from : new Date(from)).toISOString();
  const toS    = (to   instanceof Date ? to   : new Date(to)).toISOString();
  const params = `${pvStr}&from=${encodeURIComponent(fromS)}&to=${encodeURIComponent(toS)}`;
  return format === 'hash' ? `${base}#${params}` : `${base}?${params}`;
}

export function fmtDTLocal(d) {
  const dt = new Date(d);
  const p  = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth()+1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
}
