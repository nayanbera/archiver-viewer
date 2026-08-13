import { useState, useEffect, useMemo, useCallback } from 'react';
import { groupPVs, filterGroups, buildViewerUrl } from './utils';
import StationNode from './components/StationNode';
import TimeBar from './components/TimeBar';
import SelectionTray from './components/SelectionTray';
import SearchModal from './components/SearchModal';
import GroupsModal from './components/GroupsModal';

function JsonModal({ config, onSave, onClose }) {
  const [text, setText] = useState(JSON.stringify(config, null, 2));
  const [err,  setErr]  = useState('');
  const save = () => {
    try { onSave(JSON.parse(text)); }
    catch (e) { setErr(`JSON error: ${e.message}`); }
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[85vh] border border-gray-200">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
          <h2 className="font-bold text-gray-800">Raw JSON Config</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <textarea value={text} onChange={e => { setText(e.target.value); setErr(''); }} spellCheck={false}
            className="w-full h-72 bg-gray-950 text-green-400 font-mono text-xs p-3 rounded border border-gray-300 focus:outline-none focus:border-blue-400 resize-y" />
          {err && <p className="text-red-500 text-xs mt-1">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 shrink-0">
          <button onClick={onClose} className="text-sm px-4 py-1.5 text-gray-600 hover:text-gray-800 rounded hover:bg-gray-100 border border-gray-200 transition-colors">Cancel</button>
          <button onClick={save} className="text-sm font-semibold px-5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors">Save & Apply</button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ selCount }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none bg-gray-50">
      <div className="text-7xl mb-5 opacity-30">📈</div>
      {selCount === 0 ? (
        <>
          <p className="text-lg font-semibold text-gray-500">Select PVs to plot</p>
          <p className="text-sm mt-1 text-gray-400">Browse the sidebar, check PVs, then click ▶ Plot</p>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold text-gray-500">{selCount} PVs ready</p>
          <p className="text-sm mt-1 text-gray-400">Click ▶ Plot to open the Archiver Viewer</p>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [pvList,    setPvList]    = useState([]);
  const [config,    setConfig]    = useState({});
  const [selPVs,    setSelPVs]    = useState(new Set());
  const [search,    setSearch]    = useState('');
  const [expSt,     setExpSt]     = useState(new Set());
  const [expDev,    setExpDev]    = useState(new Set());
  const [tr,        setTr]        = useState(() => ({
    from: new Date(Date.now() - 3_600_000), to: new Date(),
  }));
  const [viewerUrl, setViewerUrl] = useState(null);
  const [viewerKey, setViewerKey] = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [fetchErr,  setFetchErr]  = useState(null);
  const [modal,     setModal]     = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/pvs').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      fetch('/api/config').then(r => r.json()),
    ]).then(([pvs, cfg]) => {
      setPvList(Array.isArray(pvs) ? pvs.slice().sort() : []);
      setConfig(cfg || {});
      setLoading(false);
    }).catch(e => { setFetchErr(e.message); setLoading(false); });
  }, []);

  const grouped  = useMemo(() => groupPVs(pvList, config), [pvList, config]);
  const filtered = useMemo(() => filterGroups(grouped, search), [grouped, search]);
  const stations = useMemo(() => Object.keys(filtered).sort(), [filtered]);

  useEffect(() => {
    if (!search.trim()) return;
    setExpSt(new Set(Object.keys(filtered)));
    const devs = new Set();
    for (const [st, devMap] of Object.entries(filtered))
      for (const dev of Object.keys(devMap)) devs.add(`${st}::${dev}`);
    setExpDev(devs);
  }, [search]);

  const togglePV  = useCallback((pv, forceOn) => {
    setSelPVs(prev => {
      const n = new Set(prev);
      const on = forceOn === undefined ? !n.has(pv) : forceOn;
      if (on) n.add(pv); else n.delete(pv);
      return n;
    });
  }, []);

  const toggleSt  = useCallback(st => setExpSt(prev => { const n=new Set(prev); n.has(st)?n.delete(st):n.add(st); return n; }), []);
  const toggleDev = useCallback(dk => setExpDev(prev => { const n=new Set(prev); n.has(dk)?n.delete(dk):n.add(dk); return n; }), []);

  const handlePlot = useCallback(() => {
    if (selPVs.size === 0) return;
    setViewerUrl(buildViewerUrl([...selPVs], tr.from, tr.to, config));
    setViewerKey(k => k + 1);
  }, [selPVs, tr, config]);

  const saveConfig = useCallback(async newCfg => {
    try {
      await fetch('/api/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCfg),
      });
      setConfig(newCfg);
      setModal(null);
    } catch (e) { alert(`Failed to save: ${e.message}`); }
  }, []);

  const addToSelection = useCallback(pvs => {
    setSelPVs(prev => { const n = new Set(prev); pvs.forEach(p => n.add(p)); return n; });
  }, []);

  const handleDownloadCsv = useCallback(() => {
    if (selPVs.size === 0) return;
    const params = new URLSearchParams();
    [...selPVs].forEach(pv => params.append('pv', pv));
    params.set('from', tr.from.toISOString());
    params.set('to',   tr.to.toISOString());
    const a = document.createElement('a');
    a.href = `/api/csv?${params}`;
    a.download = 'archiver_data.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [selPVs, tr]);

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* Header */}
      <header className="flex items-center gap-4 px-4 py-2 bg-white border-b border-gray-200 shrink-0 shadow-sm">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-blue-600 font-bold text-base tracking-tight">⚛ Archiver Viewer</span>
          <span className="hidden lg:block text-gray-400 text-xs">Beamline PV Browser</span>
        </div>
        <div className="flex-1 flex items-center"><TimeBar tr={tr} onChange={setTr} /></div>
        <div className="flex items-center gap-2 shrink-0">
          {viewerUrl && (
            <a href={viewerUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 border border-gray-200 transition-colors">
              ↗ New Tab
            </a>
          )}
          <a href="http://164.54.169.92:17665/mgmt/ui/index.html" target="_blank" rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 transition-colors">
            + AA Mgmt
          </a>
          <button onClick={() => setModal('search')}
            className="text-xs px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 transition-colors font-medium">
            🔎 Search PVs
          </button>
          <button onClick={() => setModal('groups')}
            className="text-xs px-3 py-1 bg-white hover:bg-gray-50 text-gray-600 rounded border border-gray-200 transition-colors">
            ⊞ Groups
          </button>
          <button onClick={() => setModal('json')}
            className="text-xs px-3 py-1 bg-white hover:bg-gray-50 text-gray-600 rounded border border-gray-200 transition-colors">
            ⚙ JSON
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* Sidebar */}
        <aside className="w-80 flex flex-col bg-white border-r border-gray-200 shrink-0">
          <div className="px-3 py-2 border-b border-gray-100 shrink-0">
            <div className="relative">
              <span className="absolute left-2.5 top-1.5 text-gray-400 text-xs pointer-events-none">🔍</span>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter PVs…"
                className="w-full bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-400 text-sm rounded px-3 py-1 pl-7 focus:outline-none focus:border-blue-400" />
            </div>
            <div className="flex justify-between mt-1 px-0.5">
              <span className="text-[10px] text-gray-400">{pvList.length.toLocaleString()} PVs archived</span>
              {selPVs.size > 0 && (
                <button onClick={() => setSelPVs(new Set())} className="text-[10px] text-blue-500 hover:text-blue-700">
                  Clear {selPVs.size} selected
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loading && <div className="flex items-center justify-center h-32"><span className="text-gray-400 text-sm animate-pulse">Loading PVs…</span></div>}
            {fetchErr && (
              <div className="m-2 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-xs">
                <p className="font-semibold mb-1">Could not reach archiver</p>
                <p className="opacity-80">{fetchErr}</p>
              </div>
            )}
            {!loading && !fetchErr && stations.length === 0 && (
              <p className="text-gray-400 text-sm text-center p-6">{search ? 'No matching PVs' : 'No PVs found'}</p>
            )}
            {stations.map(st => (
              <StationNode key={st} stName={st} devices={filtered[st]}
                selPVs={selPVs} onTogglePV={togglePV}
                expanded={expSt.has(st)} onToggleExp={toggleSt}
                expandedDevs={expDev} onToggleDev={toggleDev}
                stLabel={config?.stationLabels?.[st]} config={config} />
            ))}
          </div>
        </aside>

        {/* Viewer */}
        <main className="flex-1 flex flex-col min-w-0 bg-gray-50">
          {viewerUrl
            ? <iframe key={viewerKey} src={viewerUrl} title="Archiver Viewer"
                className="flex-1 w-full border-none bg-white"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" />
            : <EmptyState selCount={selPVs.size} />
          }
        </main>
      </div>

      <SelectionTray selPVs={selPVs} onClear={() => setSelPVs(new Set())} onPlot={handlePlot} onDownloadCsv={handleDownloadCsv} />

      {modal === 'search' && <SearchModal pvList={pvList} onAddToSelection={addToSelection} onClose={() => setModal(null)} />}
      {modal === 'groups' && <GroupsModal config={config} pvList={pvList} onSave={saveConfig} onClose={() => setModal(null)} />}
      {modal === 'json'   && <JsonModal config={config} onSave={saveConfig} onClose={() => setModal(null)} />}
    </div>
  );
}
