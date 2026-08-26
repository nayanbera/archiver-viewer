import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import { fmtDTLocal } from '../utils';

const LIVE_WINDOW_MS  = 2 * 60 * 1000; // rolling 2-min window
const LIVE_REFRESH_MS = 5_000;          // re-fetch every 5 s

const COLORS = [
  '#2563eb','#dc2626','#16a34a','#9333ea','#ea580c',
  '#0891b2','#be185d','#ca8a04','#166534','#1e40af',
];

function buildShapes(annotations) {
  return (annotations || []).map(ann => ({
    type: 'line',
    x0: ann.timestamp, x1: ann.timestamp,
    y0: 0, y1: 1, yref: 'paper',
    line: { color: 'rgba(220,38,38,0.55)', width: 1.5, dash: 'dot' },
  }));
}

function buildAnnLabels(annotations) {
  return (annotations || []).map(ann => ({
    x: ann.timestamp, y: 1.01, yref: 'paper',
    text: ann.note.length > 18 ? ann.note.slice(0, 18) + '…' : ann.note,
    showarrow: false, xanchor: 'left',
    font: { size: 9, color: 'rgb(185,28,28)' },
    bgcolor: 'rgba(255,255,255,0.85)', borderpad: 2,
  }));
}

export default function PlotView({ pvs, from, to, plotKey, annotations, onAddAnnotation, onTimeRangeChange }) {
  const divRef      = useRef(null);
  const readyRef    = useRef(false);
  const capturedRef = useRef(null); // {pvs, from, to} at last Plot click
  const pvsRef      = useRef(pvs);
  useEffect(() => { pvsRef.current = pvs; }, [pvs]);

  const [plotData,  setPlotData]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [annNote,   setAnnNote]   = useState('');
  const [annTs,     setAnnTs]     = useState('');
  const [rawMode,   setRawMode]   = useState(false);
  const [logY,      setLogY]      = useState(false);
  const [ptCount,   setPtCount]   = useState(null);
  const [viewTab,   setViewTab]   = useState('chart'); // 'chart' | 'table'
  const [liveMode,  setLiveMode]  = useState(false);

  // ── Merge plotData into wide-format rows for the table view ───────────
  const tableData = useMemo(() => {
    if (!plotData.length) return { pvNames: [], rows: [] };
    const pvNames = plotData.map(d => d.pv);
    const tsMap = new Map();
    plotData.forEach(({ pv, timestamps, values }) => {
      timestamps.forEach((ts, i) => {
        if (!tsMap.has(ts)) tsMap.set(ts, {});
        tsMap.get(ts)[pv] = values[i];
      });
    });
    const rows = [...tsMap.entries()]
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([ts, vals]) => ({ ts, vals }));
    return { pvNames, rows };
  }, [plotData]);

  const fmtVal = v => {
    if (v == null) return '—';
    const n = Number(v);
    if (isNaN(n)) return String(v);
    if (Number.isInteger(n)) return n.toLocaleString();
    return parseFloat(n.toPrecision(6)).toString();
  };

  // ── ResizeObserver so Plotly always fills its container ────────────────
  useLayoutEffect(() => {
    if (!divRef.current) return;
    const ro = new ResizeObserver(() => {
      if (readyRef.current && divRef.current) Plotly.Plots.resize(divRef.current);
    });
    ro.observe(divRef.current);
    return () => ro.disconnect();
  }, []);

  // ── fetch on Plot click (plotKey bump) ─────────────────────────────────
  useEffect(() => {
    if (!plotKey || !pvs?.length) return;
    capturedRef.current = { pvs, from, to };
    const ctrl = new AbortController();
    (async () => {
      setLoading(true); setError(''); setPtCount(null);
      try {
        const params = new URLSearchParams();
        pvs.forEach(pv => params.append('pv', pv));
        params.set('from', from.toISOString());
        params.set('to',   to.toISOString());
        if (rawMode) {
          params.set('raw', 'true');
        } else {
          // request ~1200 points — matches typical chart pixel width
          params.set('points', '1200');
        }
        const r = await fetch(`/api/data?${params}`, { signal: ctrl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        setPlotData(data);
        setPtCount(data.reduce((s, d) => s + (d.timestamps?.length ?? 0), 0));
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [plotKey, rawMode]); // refetch on plotKey bump or Raw/Fast toggle

  // ── full re-render when data arrives (resets zoom to fetched range) ────
  useEffect(() => {
    if (!divRef.current || !plotData.length) return;
    const cap = capturedRef.current;

    const traces = plotData.map((d, i) => ({
      x: d.timestamps, y: d.values,
      name: d.pv, type: 'scatter', mode: 'lines',
      line: { color: COLORS[i % COLORS.length], width: 1.5, shape: 'hv' },
    }));

    const layout = {
      margin: { t: 24, r: 12, b: 52, l: 64 },
      xaxis: {
        type: 'date',
        range: cap ? [cap.from.toISOString(), cap.to.toISOString()] : undefined,
        title: { text: 'Time (UTC)', font: { size: 11 } },
      },
      yaxis: { title: { text: 'Value', font: { size: 11 } }, automargin: true, type: logY ? 'log' : 'linear' },
      legend: { orientation: 'h', y: -0.18, font: { size: 10 } },
      hovermode: 'x unified',
      plot_bgcolor: '#f9fafb',
      paper_bgcolor: '#ffffff',
      shapes: buildShapes(annotations),
      annotations: buildAnnLabels(annotations),
    };

    const cfg = {
      responsive: true, displayModeBar: true, displaylogo: false,
      modeBarButtonsToRemove: ['sendDataToCloud'],
      scrollZoom: true,
      doubleClick: false, // we handle double-click ourselves for annotation
    };

    if (!readyRef.current) {
      Plotly.newPlot(divRef.current, traces, layout, cfg);
      readyRef.current = true;
      // sync zoom/pan back to TimeBar
      divRef.current.on('plotly_relayout', ed => {
        if (ed['xaxis.range[0]'] && ed['xaxis.range[1]']) {
          onTimeRangeChange?.({
            from: new Date(ed['xaxis.range[0]']),
            to:   new Date(ed['xaxis.range[1]']),
          });
        }
      });

      // single click: store the point timestamp for use on double-click
      const lastClickTs = { current: null };
      divRef.current.on('plotly_click', ed => {
        if (!ed.points?.length) return;
        const x = ed.points[0].x;
        const d = typeof x === 'number'
          ? new Date(x)
          : new Date(String(x).replace(' ', 'T') +
              (String(x).includes('Z') || String(x).includes('+') ? '' : 'Z'));
        lastClickTs.current = fmtDTLocal(d);
      });

      // double-click: open annotation form with the stored timestamp
      divRef.current.on('plotly_doubleclick', () => {
        setAnnTs(lastClickTs.current || '');
        setShowForm(true);
      });
    } else {
      Plotly.react(divRef.current, traces, layout, cfg);
    }
  }, [plotData, logY]); // reruns when data changes or log/linear is toggled

  // ── annotation-only update — preserves zoom ────────────────────────────
  useEffect(() => {
    if (!readyRef.current || !divRef.current) return;
    Plotly.relayout(divRef.current, {
      shapes: buildShapes(annotations),
      annotations: buildAnnLabels(annotations),
    });
  }, [annotations]);

  // ── cleanup ────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (divRef.current) { Plotly.purge(divRef.current); readyRef.current = false; }
  }, []);

  // ── live mode ──────────────────────────────────────────────────────────
  // Turn live off whenever the user requests a new plot (plotKey bump).
  useEffect(() => { setLiveMode(false); }, [plotKey]);

  useEffect(() => {
    if (!liveMode || !plotKey) return;
    let active = true;

    const tick = async () => {
      const currentPvs = pvsRef.current;
      if (!currentPvs?.length) return;
      const now  = new Date();
      const from = new Date(now - LIVE_WINDOW_MS);
      capturedRef.current = { pvs: currentPvs, from, to: now };
      try {
        const params = new URLSearchParams();
        currentPvs.forEach(pv => params.append('pv', pv));
        params.set('from', from.toISOString());
        params.set('to',   now.toISOString());
        params.set('raw', 'true');
        const r = await fetch(`/api/data?${params}`);
        if (!r.ok || !active) return;
        const data = await r.json();
        if (!active) return;
        setPlotData(data);
        setPtCount(data.reduce((s, d) => s + (d.timestamps?.length ?? 0), 0));
        setError('');
      } catch (e) {
        if (active) setError(e.message);
      }
    };

    tick();
    const id = setInterval(tick, LIVE_REFRESH_MS);
    return () => { active = false; clearInterval(id); };
  }, [liveMode, plotKey]);

  const handleSave = () => {
    if (!annNote.trim()) return;
    const cap = capturedRef.current;
    onAddAnnotation({
      id: Date.now().toString(),
      timestamp: annTs ? new Date(annTs).toISOString() : new Date().toISOString(),
      note: annNote.trim(),
      pvs:  cap?.pvs  || [],
      timeRange: cap ? { from: cap.from.toISOString(), to: cap.to.toISOString() } : null,
      createdAt: new Date().toISOString(),
    });
    setAnnNote(''); setAnnTs(''); setShowForm(false);
  };

  // ── empty state ────────────────────────────────────────────────────────
  if (!plotKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none bg-gray-50">
        <div className="text-7xl mb-5 opacity-30">📈</div>
        <p className="text-lg font-semibold text-gray-500">Select PVs to plot</p>
        <p className="text-sm mt-1 text-gray-400">
          Check PVs in the sidebar, then click a time preset or ▶ Plot
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-white shrink-0">
        <span className="text-xs text-gray-400 flex-1 flex items-center gap-2">
          <span>{pvs?.length} PV{pvs?.length !== 1 ? 's' : ''}</span>
          {ptCount !== null && !loading && (
            <span className={`font-mono ${rawMode ? 'text-orange-500' : 'text-gray-400'}`}>
              {ptCount.toLocaleString()} pts
            </span>
          )}
          {loading && !liveMode && <span className="text-blue-500 animate-pulse">Fetching…</span>}
          {liveMode && <span className="text-green-600 font-medium animate-pulse">● 2 min live</span>}
          {error   && <span className="text-red-500 truncate">{error}</span>}
        </span>
        <span className="text-[10px] text-gray-400 hidden sm:inline">
          Double-click on the plot to add annotation · Zoom: scroll or box-select · Pan: drag
        </span>
        <button
          onClick={() => setViewTab(v => v === 'table' ? 'chart' : 'table')}
          disabled={!plotData.length}
          title={viewTab === 'table' ? 'Switch to chart view' : 'Switch to table view'}
          className={`text-xs px-2.5 py-1 rounded border transition-colors font-medium disabled:opacity-30 ${
            viewTab === 'table'
              ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
          }`}>
          {viewTab === 'table' ? '📊 Chart' : '📋 Table'}
        </button>
        <button
          onClick={() => setLogY(v => !v)}
          title={logY ? 'Y-axis: log scale — click for linear' : 'Y-axis: linear — click for log scale'}
          className={`text-xs px-2.5 py-1 rounded border transition-colors font-medium ${
            logY
              ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
          }`}>
          {logY ? 'Log Y' : 'Lin Y'}
        </button>
        <button
          onClick={() => setRawMode(v => !v)}
          title={rawMode
            ? 'Showing all raw samples — click to switch to fast optimized mode'
            : 'Showing optimized ~1200 pts (fast) — click for all raw samples'}
          className={`text-xs px-2.5 py-1 rounded border transition-colors font-medium ${
            rawMode
              ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
          }`}>
          {rawMode ? 'Raw' : 'Fast'}
        </button>
        <button
          onClick={() => setLiveMode(v => !v)}
          title={liveMode
            ? 'Live — last 2 min, refreshing every 5 s. Click to stop.'
            : 'Start live plot — last 2 min window, auto-refreshes every 5 s'}
          className={`text-xs px-2.5 py-1 rounded border transition-colors font-medium ${
            liveMode
              ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100'
              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
          }`}>
          {liveMode ? <span className="animate-pulse">● Live</span> : 'Live'}
        </button>
        <button onClick={() => setShowForm(v => !v)}
          title="Add a timestamped note to this plot"
          className="text-xs px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded border border-amber-200 transition-colors font-medium">
          + Annotation
        </button>
      </div>

      {/* annotation form */}
      {showForm && (
        <div className="flex items-end gap-2 px-3 py-2 border-b border-amber-200 bg-amber-50 shrink-0 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="text-[10px] text-gray-500 block mb-1">Note</label>
            <input value={annNote} onChange={e => setAnnNote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus placeholder="Describe the event…"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Timestamp (defaults to now)</label>
            <input type="datetime-local" value={annTs} onChange={e => setAnnTs(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400" />
          </div>
          <button onClick={handleSave} disabled={!annNote.trim()}
            className="text-sm px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors disabled:opacity-40 shrink-0">
            Save
          </button>
          <button onClick={() => setShowForm(false)}
            className="text-sm px-2 py-1 text-gray-500 hover:text-gray-700 border border-gray-200 rounded shrink-0">✕
          </button>
        </div>
      )}

      {/* chart — kept mounted even when table is shown to preserve Plotly state */}
      <div ref={divRef} className={`flex-1 min-h-0 min-w-0 ${viewTab === 'table' ? 'hidden' : ''}`} />

      {/* table view */}
      {viewTab === 'table' && (
        <div className="flex-1 min-h-0 overflow-auto bg-white">
          {tableData.rows.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              No data to display
            </div>
          ) : (
            <table className="text-xs w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-white shadow-sm">
                <tr className="border-b-2 border-gray-200">
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap border-r border-gray-200 bg-gray-50">
                    Timestamp (UTC)
                  </th>
                  {tableData.pvNames.map((pv, i) => (
                    <th key={pv}
                      title={pv}
                      style={{ color: COLORS[i % COLORS.length] }}
                      className="px-3 py-2 text-left font-semibold whitespace-nowrap border-r border-gray-200 bg-gray-50 max-w-[160px]">
                      <span className="block truncate">{pv}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.rows.map(({ ts, vals }, i) => (
                  <tr key={ts} className={`border-b border-gray-100 hover:bg-blue-50 ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                    <td className="px-3 py-1 font-mono text-gray-500 whitespace-nowrap border-r border-gray-100">
                      {ts.replace('T', ' ').replace(/\.\d+Z$/, ' Z')}
                    </td>
                    {tableData.pvNames.map(pv => (
                      <td key={pv} className="px-3 py-1 font-mono text-gray-700 whitespace-nowrap border-r border-gray-100 text-right">
                        {fmtVal(vals[pv])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
