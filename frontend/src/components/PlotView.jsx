import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import { fmtDTLocal } from '../utils';

const DEFAULT_LIVE_WINDOW_MS = 2 * 60 * 1000; // fallback when no range is captured yet
const LIVE_REFRESH_MS        = 5_000;          // re-fetch every 5 s

// Format a millisecond duration for the Live indicator (e.g. "5 min", "1.5 h", "7 d")
function fmtWindow(ms) {
  const s = Math.round(ms / 1000);
  if (s < 3600)  return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${+(s / 3600).toFixed(1)} h`;
  return `${Math.round(s / 86400)} d`;
}

const COLORS = [
  '#2563eb','#dc2626','#16a34a','#9333ea','#ea580c',
  '#0891b2','#be185d','#ca8a04','#166534','#1e40af',
];

// Build extra Y-axis layout entries for Split-Y mode.
// Each extra axis is placed at an explicit paper-coordinate position on the right
// so tick labels from different axes never overlap.
// Returns { axes, xEnd, marginR, marginB }.
function buildSplitYAxes(pvNames, colors, fontSize) {
  const n = pvNames.length;
  if (n <= 1) return { axes: {}, xEnd: undefined, marginR: 12, marginB: 52 };

  // Paper-unit step per extra right axis; scales with font so tick labels still fit.
  const STEP     = Math.max(0.06, 0.04 + fontSize * 0.003);
  const numExtra = n - 1;
  const xEnd     = Math.max(0.35, 1.0 - numExtra * STEP);
  const marginR  = 15 + numExtra * (50 + fontSize * 2);  // pixels

  // Short label: last ':'-delimited segment of the PV name.
  const short = pv => pv.split(':').pop();

  const axes = {};
  for (let i = 1; i < n; i++) {
    const pos   = xEnd + (i - 1) * STEP;
    const color = colors[i % colors.length];
    axes[`yaxis${i + 1}`] = {
      title: { text: short(pvNames[i]), font: { size: fontSize, color } },
      overlaying: 'y',
      side: 'right',
      anchor: 'free',
      position: pos,
      showgrid: false,
      zeroline: false,
      showline: true,
      tickfont:  { color, size: fontSize },
      tickcolor: color,
      linecolor: color,
    };
  }
  return { axes, xEnd, marginR, marginB: 20 };
}

function buildShapes(annotations) {
  return (annotations || []).map(ann => ({
    type: 'line',
    x0: ann.timestamp, x1: ann.timestamp,
    y0: 0, y1: 1, yref: 'paper',
    line: { color: 'rgba(220,38,38,0.55)', width: 1.5, dash: 'dot' },
  }));
}

function buildAnnLabels(annotations, fontSize = 11) {
  const sz = Math.max(7, fontSize - 2);
  return (annotations || []).map(ann => ({
    x: ann.timestamp, y: 1.01, yref: 'paper',
    text: ann.note.length > 18 ? ann.note.slice(0, 18) + '…' : ann.note,
    showarrow: false, xanchor: 'left',
    font: { size: sz, color: 'rgb(185,28,28)' },
    bgcolor: 'rgba(255,255,255,0.85)', borderpad: 2,
  }));
}

// ── correlation helpers ────────────────────────────────────────────────────

// Linear interpolation of vals at targetMs given parallel epochMs/vals arrays.
function interpolateAt(epochMs, vals, targetMs) {
  if (!epochMs.length) return null;
  if (targetMs <= epochMs[0]) return vals[0];
  if (targetMs >= epochMs[epochMs.length - 1]) return vals[epochMs.length - 1];
  let lo = 0, hi = epochMs.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (epochMs[mid] <= targetMs) lo = mid; else hi = mid;
  }
  const dt = epochMs[hi] - epochMs[lo];
  return dt === 0 ? vals[lo] : vals[lo] + (vals[hi] - vals[lo]) * (targetMs - epochMs[lo]) / dt;
}

function pearsonR(x, y) {
  const n = x.length;
  if (n < 2) return NaN;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, sx = 0, sy = 0;
  for (let k = 0; k < n; k++) {
    const dx = x[k] - mx, dy = y[k] - my;
    num += dx * dy; sx += dx * dx; sy += dy * dy;
  }
  const den = Math.sqrt(sx * sy);
  return den === 0 ? 0 : num / den;
}

function CorrelationView({ plotData }) {
  const refs = useRef([]);

  const pairs = useMemo(() => {
    const ps = [];
    for (let i = 0; i < plotData.length; i++)
      for (let j = i + 1; j < plotData.length; j++)
        ps.push([i, j]);
    return ps;
  }, [plotData]);

  useEffect(() => {
    pairs.forEach(([i, j], k) => {
      const div = refs.current[k];
      if (!div) return;
      const d0 = plotData[i], d1 = plotData[j];
      const ts1 = d1.timestamps.map(t => Date.parse(t));
      const x = [], y = [];
      d0.timestamps.forEach((ts, idx) => {
        const v = interpolateAt(ts1, d1.values, Date.parse(ts));
        if (v !== null) { x.push(d0.values[idx]); y.push(v); }
      });
      const r = pearsonR(x, y);
      const rLabel = Number.isFinite(r) ? `r = ${r.toFixed(3)}` : '';
      Plotly.react(div, [{
        x, y, type: 'scatter', mode: 'markers',
        marker: { size: 4, color: COLORS[i % COLORS.length], opacity: 0.65 },
        hovertemplate: `x: %{x:.4g}<br>y: %{y:.4g}<extra>${d0.pv} vs ${d1.pv}</extra>`,
      }], {
        annotations: rLabel ? [{
          x: 0.02, y: 0.98, xref: 'paper', yref: 'paper',
          text: rLabel, showarrow: false, xanchor: 'left', yanchor: 'top',
          font: { size: 12, color: '#374151' },
          bgcolor: 'rgba(255,255,255,0.82)', borderpad: 3,
        }] : [],
        margin: { t: 12, r: 12, b: 58, l: 68 },
        xaxis: { title: { text: d0.pv, font: { size: 9 } }, automargin: true },
        yaxis: { title: { text: d1.pv, font: { size: 9 } }, automargin: true },
        plot_bgcolor: '#f9fafb', paper_bgcolor: '#ffffff',
      }, {
        responsive: true, displayModeBar: true, displaylogo: false,
        modeBarButtonsToRemove: ['sendDataToCloud'],
      });
      // Resize after browser lays out the grid so Plotly fills the cell correctly.
      requestAnimationFrame(() => { if (div) Plotly.Plots.resize(div); });
    });
  }, [plotData, pairs]);

  // Purge on unmount
  useEffect(() => () => {
    refs.current.forEach(div => { if (div) Plotly.purge(div); });
  }, []);

  if (pairs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm select-none">
        {plotData.length < 2
          ? 'Select at least 2 PVs and click Plot to see correlations'
          : 'No data to correlate'}
      </div>
    );
  }

  const cols = pairs.length === 1 ? 1 : pairs.length <= 4 ? 2 : 3;
  return (
    <div className="h-full overflow-auto p-2 grid gap-2"
         style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: 'minmax(300px, 1fr)' }}>
      {pairs.map(([i, j], k) => (
        <div key={`${i}-${j}`}
             ref={el => { refs.current[k] = el; }}
             className="border border-gray-200 rounded bg-white min-h-0" />
      ))}
    </div>
  );
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
  const [normMode,  setNormMode]  = useState(false);  // normalize each trace to [0,1]
  const [splitY,    setSplitY]    = useState(false);  // independent Y-axis per PV
  const [fontSize,  setFontSize]  = useState(11);     // global plot font size
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

    // Normalize each trace to [0, 1] over its own plotted range.
    const normalize = vals => {
      const finite = vals.filter(v => v != null && isFinite(v));
      if (!finite.length) return vals;
      const mn = Math.min(...finite), mx = Math.max(...finite);
      const rng = mx - mn || 1;
      return vals.map(v => (v == null || !isFinite(v)) ? null : (v - mn) / rng);
    };

    const usingSplit = splitY && !normMode && plotData.length > 1;
    const usingNorm  = normMode;

    const splitInfo  = usingSplit
      ? buildSplitYAxes(plotData.map(d => d.pv), COLORS, fontSize)
      : { axes: {}, xEnd: undefined, marginR: 12, marginB: 52 };

    const traces = plotData.map((d, i) => {
      const yVals = usingNorm ? normalize(d.values) : d.values;
      return {
        x: d.timestamps,
        y: yVals,
        name: d.pv,
        type: 'scatter',
        mode: 'lines',
        line: { color: COLORS[i % COLORS.length], width: 1.5, shape: 'hv' },
        ...(usingSplit && i > 0 ? { yaxis: `y${i + 1}` } : {}),
        // In norm mode show actual value in hover; normalised value is secondary.
        ...(usingNorm ? {
          customdata: d.values,
          hovertemplate: `${d.pv}: %{customdata:.6g}<extra></extra>`,
        } : {}),
      };
    });

    // In Split-Y mode the first left axis also gets a short coloured title;
    // the bottom legend is hidden because each axis already labels its PV.
    const firstShort = plotData[0]?.pv.split(':').pop() ?? 'Value';

    const layout = {
      font: { size: fontSize },   // global default — cascades to all text not explicitly overridden
      margin: { t: 24, r: splitInfo.marginR, b: splitInfo.marginB, l: 64 },
      xaxis: {
        type: 'date',
        range: cap ? [cap.from.toISOString(), cap.to.toISOString()] : undefined,
        ...(splitInfo.xEnd !== undefined ? { domain: [0, splitInfo.xEnd] } : {}),
        title: { text: 'Time (UTC)', font: { size: fontSize } },
        tickfont: { size: fontSize },
      },
      yaxis: {
        title: usingSplit
          ? { text: firstShort, font: { size: fontSize, color: COLORS[0] } }
          : { text: usingNorm ? 'Normalized [0 – 1]' : 'Value', font: { size: fontSize } },
        automargin: true,
        type: logY && !usingNorm ? 'log' : 'linear',
        range: usingNorm ? [-0.05, 1.05] : undefined,
        tickfont:  usingSplit ? { color: COLORS[0], size: fontSize } : { size: fontSize },
        tickcolor: usingSplit ? COLORS[0] : undefined,
        linecolor: usingSplit ? COLORS[0] : undefined,
        showline:  usingSplit ? true : undefined,
      },
      ...splitInfo.axes,
      showlegend: !usingSplit,
      legend: { orientation: 'h', y: -0.18, font: { size: fontSize } },
      hovermode: 'x unified',
      hoverlabel: { namelength: -1, font: { size: fontSize } },
      plot_bgcolor: '#f9fafb',
      paper_bgcolor: '#ffffff',
      shapes: buildShapes(annotations),
      annotations: buildAnnLabels(annotations, fontSize),
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
  }, [plotData, logY, normMode, splitY, fontSize]); // reruns when data or display mode changes


  // ── annotation-only update — preserves zoom ────────────────────────────
  useEffect(() => {
    if (!readyRef.current || !divRef.current) return;
    Plotly.relayout(divRef.current, {
      shapes: buildShapes(annotations),
      annotations: buildAnnLabels(annotations, fontSize),
    });
  }, [annotations, fontSize]);

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
      // Derive rolling window from the last plotted range; fall back to default.
      const cap = capturedRef.current;
      const windowMs = cap ? (cap.to - cap.from) : DEFAULT_LIVE_WINDOW_MS;
      const now  = new Date();
      const from = new Date(now - windowMs);
      capturedRef.current = { pvs: currentPvs, from, to: now };
      try {
        const params = new URLSearchParams();
        currentPvs.forEach(pv => params.append('pv', pv));
        params.set('from', from.toISOString());
        params.set('to',   now.toISOString());
        if (rawMode) {
          params.set('raw', 'true');
        } else {
          params.set('points', '1200');
        }
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
  }, [liveMode, plotKey, rawMode]);

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
          {liveMode && (
            <span className="text-green-600 font-medium animate-pulse">
              ● {fmtWindow(capturedRef.current ? capturedRef.current.to - capturedRef.current.from : DEFAULT_LIVE_WINDOW_MS)} live
            </span>
          )}
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
          onClick={() => setViewTab(v => v === 'corr' ? 'chart' : 'corr')}
          disabled={plotData.length < 2}
          title={plotData.length < 2
            ? 'Need at least 2 PVs plotted'
            : viewTab === 'corr' ? 'Switch to chart view' : 'Show pairwise XY scatter (correlation)'}
          className={`text-xs px-2.5 py-1 rounded border transition-colors font-medium disabled:opacity-30 ${
            viewTab === 'corr'
              ? 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
          }`}>
          {viewTab === 'corr' ? '📊 Chart' : '🔗 Corr'}
        </button>
        <button
          onClick={() => setLogY(v => !v)}
          disabled={normMode}
          title={normMode ? 'Log scale unavailable in Normalize mode'
            : logY ? 'Y-axis: log scale — click for linear' : 'Y-axis: linear — click for log scale'}
          className={`text-xs px-2.5 py-1 rounded border transition-colors font-medium disabled:opacity-30 ${
            logY
              ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
          }`}>
          {logY ? 'Log Y' : 'Lin Y'}
        </button>
        <button
          onClick={() => { setNormMode(v => !v); setSplitY(false); }}
          title={normMode
            ? 'Normalize mode — each trace scaled to [0,1]. Click to show absolute values.'
            : 'Normalize all traces to [0,1] so very different-scale PVs are visible together. Hover shows actual value.'}
          className={`text-xs px-2.5 py-1 rounded border transition-colors font-medium ${
            normMode
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
          }`}>
          Norm
        </button>
        <button
          onClick={() => { setSplitY(v => !v); setNormMode(false); }}
          disabled={plotData.length < 2}
          title={splitY
            ? 'Split Y — each PV on its own axis. Click for shared axis.'
            : 'Give each PV an independent Y-axis (right side, colour-coded)'}
          className={`text-xs px-2.5 py-1 rounded border transition-colors font-medium disabled:opacity-30 ${
            splitY
              ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
          }`}>
          Split Y
        </button>
        {/* Font size control */}
        <div className="flex items-center rounded border border-gray-200 overflow-hidden shrink-0"
             title="Plot font size">
          <button
            onClick={() => setFontSize(s => Math.max(8, s - 1))}
            className="px-1.5 py-1 text-[11px] text-gray-500 bg-gray-50 hover:bg-gray-100 leading-none select-none">
            A−
          </button>
          <span className="px-1.5 text-[11px] font-mono text-gray-600 bg-white select-none border-x border-gray-200">
            {fontSize}
          </span>
          <button
            onClick={() => setFontSize(s => Math.min(22, s + 1))}
            className="px-1.5 py-1 text-[11px] text-gray-500 bg-gray-50 hover:bg-gray-100 leading-none select-none">
            A+
          </button>
        </div>
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
            ? `Live — rolling ${fmtWindow(capturedRef.current ? capturedRef.current.to - capturedRef.current.from : DEFAULT_LIVE_WINDOW_MS)} window, refreshing every 5 s. Click to stop.`
            : `Start live plot — rolls the currently plotted time range forward every 5 s`}
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

      {/* content area — chart is always absolute/full-size so Plotly keeps correct dimensions;
           table and corr views overlay it rather than replacing it */}
      <div className="flex-1 min-h-0 relative">

        {/* chart — always mounted at full size; never display:none */}
        <div ref={divRef} className="absolute inset-0" />

        {/* correlation overlay */}
        {viewTab === 'corr' && (
          <div className="absolute inset-0 z-10 bg-white">
            <CorrelationView plotData={plotData} />
          </div>
        )}

        {/* table overlay */}
        {viewTab === 'table' && (
          <div className="absolute inset-0 z-10 overflow-auto bg-white">
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
    </div>
  );
}
