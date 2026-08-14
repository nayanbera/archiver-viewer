import { useState, useEffect, useMemo, useCallback } from 'react';
import { groupPVs, filterGroups, buildViewerUrl } from './utils';
import StationNode      from './components/StationNode';
import TimeBar          from './components/TimeBar';
import SelectionTray    from './components/SelectionTray';
import GroupsModal      from './components/GroupsModal';
import PlotView         from './components/PlotView';
import AnnotationPanel  from './components/AnnotationPanel';
import Checkbox         from './components/Checkbox';

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

function CsvDialog({ defaultFilename, onDownload, onClose }) {
  const [filename, setFilename] = useState(defaultFilename);
  const [rawData,  setRawData]  = useState(false);
  const submit = () => {
    const name = filename.trim() || defaultFilename;
    onDownload(name.endsWith('.csv') ? name : name + '.csv', rawData);
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-gray-200 p-5 space-y-4">
        <h2 className="font-bold text-gray-800">Save CSV</h2>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Filename</label>
          <input value={filename} onChange={e => setFilename(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} autoFocus
            className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-blue-400 font-mono" />
          <p className="text-[11px] text-gray-400 mt-1">Your browser will ask where to save the file.</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={rawData} onChange={e => setRawData(e.target.checked)}
            className="accent-blue-600" />
          <span className="text-sm text-gray-700">Export all raw samples</span>
          <span className="text-[11px] text-gray-400">(default: matches plot decimation)</span>
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-4 py-1.5 text-gray-600 hover:text-gray-800 rounded hover:bg-gray-100 border border-gray-200 transition-colors">Cancel</button>
          <button onClick={submit} className="text-sm font-semibold px-5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded transition-colors">Download</button>
        </div>
      </div>
    </div>
  );
}

const GLOB_EXAMPLES  = ['15IDA:*', '*:M1:*', '*BeamPos*'];
const REGEX_EXAMPLES = ['15IDA:.*', '.*:M\\d+:.*', '.*BeamPos.*'];

export default function App() {
  const [pvList,   setPvList]   = useState([]);
  const [config,   setConfig]   = useState({});
  const [selPVs,   setSelPVs]   = useState(new Set());
  const [expSt,    setExpSt]    = useState(new Set());
  const [expDev,   setExpDev]   = useState(new Set());
  const [tr,       setTr]       = useState(() => ({
    from: new Date(Date.now() - 3_600_000), to: new Date(),
  }));
  const [loading,  setLoading]  = useState(true);
  const [fetchErr, setFetchErr] = useState(null);
  const [modal,    setModal]    = useState(null);

  // ── unified sidebar search ─────────────────────────────────────────────
  const [searchMode,    setSearchMode]    = useState('filter'); // 'filter'|'glob'|'regex'
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState(null);    // null = not yet searched
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError,   setSearchError]   = useState('');

  // ── view mode ──────────────────────────────────────────────────────────
  const [viewMode,  setViewMode]  = useState('plotly');
  const [plotPvs,   setPlotPvs]   = useState([]);
  const [plotKey,   setPlotKey]   = useState(0);
  const [viewerUrl, setViewerUrl] = useState(null);
  const [viewerKey, setViewerKey] = useState(0);
  const [csvDialog, setCsvDialog] = useState(false);

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

  // ── filter-mode tree ───────────────────────────────────────────────────
  const filterQuery = searchMode === 'filter' ? searchQuery : '';
  const grouped  = useMemo(() => groupPVs(pvList, config), [pvList, config]);
  const filtered = useMemo(() => filterGroups(grouped, filterQuery), [grouped, filterQuery]);
  const stations = useMemo(() => Object.keys(filtered).sort(), [filtered]);

  useEffect(() => {
    if (searchMode !== 'filter' || !filterQuery.trim()) return;
    setExpSt(new Set(Object.keys(filtered)));
    const devs = new Set();
    for (const [st, devMap] of Object.entries(filtered))
      for (const dev of Object.keys(devMap)) devs.add(`${st}::${dev}`);
    setExpDev(devs);
  }, [filterQuery, searchMode]);

  // ── regex: live filtering ──────────────────────────────────────────────
  useEffect(() => {
    if (searchMode !== 'regex') return;
    if (!searchQuery.trim()) { setSearchResults(null); setSearchError(''); return; }
    try {
      const re = new RegExp(searchQuery.trim(), 'i');
      setSearchResults(pvList.filter(pv => re.test(pv)).sort());
      setSearchError('');
    } catch (e) {
      setSearchError(`Invalid regex: ${e.message}`);
      setSearchResults([]);
    }
  }, [searchQuery, searchMode, pvList]);

  // ── glob: search on Enter / button ────────────────────────────────────
  const runGlobSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true); setSearchError(''); setSearchResults(null);
    try {
      const r = await fetch(`/api/search?pattern=${encodeURIComponent(searchQuery.trim())}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSearchResults(await r.json());
    } catch (e) {
      setSearchError(e.message);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery]);

  const changeMode = useCallback(m => {
    setSearchMode(m);
    setSearchQuery('');
    setSearchResults(null);
    setSearchError('');
  }, []);

  // ── PV toggle helpers ──────────────────────────────────────────────────
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

  const toggleAllResults = useCallback(() => {
    if (!searchResults?.length) return;
    const allSel = searchResults.every(pv => selPVs.has(pv));
    setSelPVs(prev => {
      const n = new Set(prev);
      if (allSel) searchResults.forEach(pv => n.delete(pv));
      else        searchResults.forEach(pv => n.add(pv));
      return n;
    });
  }, [searchResults, selPVs]);

  // ── plot ───────────────────────────────────────────────────────────────
  const handlePlot = useCallback(() => {
    if (selPVs.size === 0) return;
    if (viewMode === 'plotly') {
      setPlotPvs([...selPVs]); setPlotKey(k => k + 1);
    } else {
      setViewerUrl(buildViewerUrl([...selPVs], tr.from, tr.to, config));
      setViewerKey(k => k + 1);
    }
  }, [selPVs, tr, config, viewMode]);

  const handlePresetClick = useCallback(() => {
    if (viewMode !== 'plotly') return;
    const pvsToPlot = selPVs.size > 0 ? [...selPVs] : plotPvs;
    if (!pvsToPlot.length) return;
    setPlotPvs(pvsToPlot); setPlotKey(k => k + 1);
  }, [viewMode, selPVs, plotPvs]);

  // ── config ─────────────────────────────────────────────────────────────
  const persistConfig = useCallback(async newCfg => {
    await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newCfg) });
    setConfig(newCfg);
  }, []);
  const saveConfig = useCallback(async newCfg => {
    try { await persistConfig(newCfg); setModal(null); }
    catch (e) { alert(`Failed to save: ${e.message}`); }
  }, [persistConfig]);

  // ── annotations ────────────────────────────────────────────────────────
  const annotations = config.annotations || [];
  const addAnnotation = useCallback(async ann => {
    try { await persistConfig({ ...config, annotations: [...annotations, ann] }); }
    catch (e) { alert(`Failed to save annotation: ${e.message}`); }
  }, [config, annotations, persistConfig]);
  const deleteAnnotation = useCallback(async id => {
    try { await persistConfig({ ...config, annotations: annotations.filter(a => a.id !== id) }); }
    catch (e) { alert(`Failed to delete annotation: ${e.message}`); }
  }, [config, annotations, persistConfig]);
  const editAnnotation = useCallback(async (id, newNote) => {
    const updated = annotations.map(a => a.id === id ? { ...a, note: newNote } : a);
    try { await persistConfig({ ...config, annotations: updated }); }
    catch (e) { alert(`Failed to update annotation: ${e.message}`); }
  }, [config, annotations, persistConfig]);
  const changeAnnotationPassword = useCallback(async newPw => {
    try { await persistConfig({ ...config, annotationPassword: newPw }); }
    catch (e) { alert(`Failed to save password: ${e.message}`); }
  }, [config, persistConfig]);
  const clickAnnotation = useCallback(ann => {
    if (!ann.timeRange) return;
    setTr({ from: new Date(ann.timeRange.from), to: new Date(ann.timeRange.to) });
    setPlotPvs(ann.pvs || []); setPlotKey(k => k + 1);
    if (viewMode !== 'plotly') setViewMode('plotly');
  }, [viewMode]);

  // ── CSV ────────────────────────────────────────────────────────────────
  const handleDownloadCsv = useCallback(() => { if (selPVs.size) setCsvDialog(true); }, [selPVs]);
  const triggerCsvDownload = useCallback((filename, raw = false) => {
    const params = new URLSearchParams();
    [...selPVs].forEach(pv => params.append('pv', pv));
    params.set('from', tr.from.toISOString());
    params.set('to',   tr.to.toISOString());
    params.set('points', '1200');
    if (raw) params.set('raw', 'true');
    const a = document.createElement('a');
    a.href = `/api/csv?${params}`; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }, [selPVs, tr]);

  // ── derived search UI ──────────────────────────────────────────────────
  const allResultsSel  = searchResults?.length > 0 && searchResults.every(pv => selPVs.has(pv));
  const someResultsSel = searchResults?.some(pv => selPVs.has(pv)) && !allResultsSel;

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* Header */}
      <header className="flex items-center gap-4 px-4 py-2 bg-white border-b border-gray-200 shrink-0 shadow-sm">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-blue-600 font-bold text-base tracking-tight">⚛ Archiver Viewer</span>
          <span className="hidden lg:block text-gray-400 text-xs">Beamline PV Browser</span>
        </div>
        <div className="flex-1 flex items-center">
          <TimeBar tr={tr} onChange={setTr} onPresetClick={handlePresetClick} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex rounded border border-gray-200 overflow-hidden">
            {[['plotly','📊 Plotly'],['aa','🔗 AA Viewer']].map(([m, label]) => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`text-xs px-2.5 py-1 transition-colors ${
                  viewMode === m ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50 border-l border-gray-200 first:border-l-0'}`}>
                {label}
              </button>
            ))}
          </div>
          {viewMode === 'aa' && viewerUrl && (
            <a href={viewerUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 border border-gray-200 transition-colors">
              ↗ New Tab
            </a>
          )}
          <a href="http://164.54.169.92:17665/mgmt/ui/index.html" target="_blank" rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 transition-colors">
            + AA Mgmt
          </a>
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

          {/* Search controls */}
          <div className="px-3 pt-2 pb-1.5 border-b border-gray-100 shrink-0 space-y-1.5">

            {/* Mode toggle */}
            <div className="flex gap-1">
              {[['filter','Filter'],['glob','Glob'],['regex','Regex']].map(([m, label]) => (
                <button key={m} onClick={() => changeMode(m)}
                  className={`text-xs px-2.5 py-0.5 rounded border font-medium transition-colors ${
                    searchMode === m
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                  {label}
                </button>
              ))}
              <span className="text-[10px] text-gray-400 self-center ml-1">
                {searchMode === 'filter' ? 'live tree filter'
                  : searchMode === 'glob'   ? 'archiver pattern · Enter'
                  : 'local regex · live'}
              </span>
            </div>

            {/* Input row */}
            <div className="flex gap-1">
              <div className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">🔍</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => searchMode === 'glob' && e.key === 'Enter' && runGlobSearch()}
                  placeholder={
                    searchMode === 'filter' ? 'Filter station · device · PV…'
                    : searchMode === 'glob'  ? 'e.g. 15IDA:* or *BeamPos*'
                    :                          'e.g. .*:M\\d+:.* (case-insensitive)'}
                  className="w-full bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-400 text-sm rounded px-3 py-1 pl-7 focus:outline-none focus:border-blue-400"
                />
              </div>
              {searchMode === 'glob' && (
                <button onClick={runGlobSearch} disabled={searchLoading || !searchQuery.trim()}
                  className="text-xs px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-40 shrink-0">
                  {searchLoading ? '…' : 'Search'}
                </button>
              )}
            </div>

            {/* Example chips for glob/regex */}
            {searchMode !== 'filter' && (
              <div className="flex gap-1 flex-wrap">
                {(searchMode === 'glob' ? GLOB_EXAMPLES : REGEX_EXAMPLES).map(ex => (
                  <button key={ex} onClick={() => setSearchQuery(ex)}
                    className="text-[10px] font-mono px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border border-gray-200 transition-colors">
                    {ex}
                  </button>
                ))}
              </div>
            )}

            {/* Status row */}
            <div className="flex justify-between px-0.5">
              <span className="text-[10px] text-gray-400">{pvList.length.toLocaleString()} PVs archived</span>
              {selPVs.size > 0 && (
                <button onClick={() => setSelPVs(new Set())} className="text-[10px] text-blue-500 hover:text-blue-700">
                  Clear {selPVs.size} selected
                </button>
              )}
            </div>
          </div>

          {/* Sidebar body */}
          {searchMode === 'filter' ? (
            <div className="flex-1 overflow-y-auto p-2">
              {loading && <div className="flex items-center justify-center h-32"><span className="text-gray-400 text-sm animate-pulse">Loading PVs…</span></div>}
              {fetchErr && (
                <div className="m-2 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-xs">
                  <p className="font-semibold mb-1">Could not reach archiver</p>
                  <p className="opacity-80">{fetchErr}</p>
                </div>
              )}
              {!loading && !fetchErr && stations.length === 0 && (
                <p className="text-gray-400 text-sm text-center p-6">{filterQuery ? 'No matching PVs' : 'No PVs found'}</p>
              )}
              {stations.map(st => (
                <StationNode key={st} stName={st} devices={filtered[st]}
                  selPVs={selPVs} onTogglePV={togglePV}
                  expanded={expSt.has(st)} onToggleExp={toggleSt}
                  expandedDevs={expDev} onToggleDev={toggleDev}
                  stLabel={config?.stationLabels?.[st]} config={config} />
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* Error */}
              {searchError && (
                <div className="m-2 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-xs">{searchError}</div>
              )}
              {/* Loading */}
              {searchLoading && (
                <div className="flex items-center justify-center h-24">
                  <span className="text-gray-400 text-sm animate-pulse">Searching archiver…</span>
                </div>
              )}
              {/* Empty prompt */}
              {!searchLoading && !searchError && searchResults === null && (
                <div className="flex items-center justify-center h-24 px-4">
                  <p className="text-xs text-gray-400 text-center">
                    {searchMode === 'glob' ? 'Enter a pattern and press Search or Enter'
                      : 'Start typing to filter all archived PVs'}
                  </p>
                </div>
              )}
              {/* No results */}
              {!searchLoading && searchResults?.length === 0 && (
                <p className="text-xs text-gray-400 text-center p-6">No PVs matched</p>
              )}
              {/* Results */}
              {searchResults?.length > 0 && (
                <>
                  <div className="sticky top-0 bg-gray-50 border-b border-gray-100 px-3 py-1.5 flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox checked={allResultsSel} partial={someResultsSel} onChange={toggleAllResults} />
                      <span className="text-xs text-gray-600 font-medium">
                        {searchResults.some(pv => selPVs.has(pv))
                          ? `${searchResults.filter(pv => selPVs.has(pv)).length} of ${searchResults.length} selected`
                          : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
                      </span>
                    </label>
                  </div>
                  <div className="px-2 py-1">
                    {searchResults.map(pv => (
                      <div key={pv} onClick={() => togglePV(pv)}
                        className={`flex items-center gap-2 px-2 py-[3px] rounded cursor-pointer hover:bg-blue-50 ${selPVs.has(pv) ? 'bg-blue-50' : ''}`}>
                        <Checkbox checked={selPVs.has(pv)} partial={false} onChange={() => togglePV(pv)} />
                        <span className="font-mono text-xs text-gray-600 truncate" title={pv}>{pv}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </aside>

        {/* Main plot area */}
        <main className="flex-1 flex flex-col min-w-0 bg-gray-50">
          {viewMode === 'plotly' ? (
            <PlotView pvs={plotPvs} from={tr.from} to={tr.to} plotKey={plotKey}
              annotations={annotations} onAddAnnotation={addAnnotation} onTimeRangeChange={setTr} />
          ) : (
            viewerUrl
              ? <iframe key={viewerKey} src={viewerUrl} title="AA Viewer"
                  className="flex-1 w-full border-none bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" />
              : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none bg-gray-50">
                  <div className="text-7xl mb-5 opacity-30">📈</div>
                  <p className="text-lg font-semibold text-gray-500">Select PVs to plot</p>
                  <p className="text-sm mt-1 text-gray-400">Browse the sidebar, check PVs, then click ▶ Plot</p>
                </div>
              )
          )}
        </main>

        <AnnotationPanel
          annotations={annotations}
          annotationPassword={config.annotationPassword || ''}
          onClickAnnotation={clickAnnotation}
          onDeleteAnnotation={deleteAnnotation}
          onEditAnnotation={editAnnotation}
          onChangePassword={changeAnnotationPassword}
        />
      </div>

      <SelectionTray selPVs={selPVs} onClear={() => setSelPVs(new Set())} onPlot={handlePlot} onDownloadCsv={handleDownloadCsv} />

      {csvDialog && (
        <CsvDialog
          defaultFilename={`archiver_${tr.from.toISOString().slice(0,10)}_${tr.to.toISOString().slice(0,10)}.csv`}
          onDownload={triggerCsvDownload} onClose={() => setCsvDialog(false)} />
      )}
      {modal === 'groups' && <GroupsModal config={config} pvList={pvList} onSave={saveConfig} onClose={() => setModal(null)} />}
      {modal === 'json'   && <JsonModal config={config} onSave={saveConfig} onClose={() => setModal(null)} />}
    </div>
  );
}
