import { useState, useEffect, useCallback, useRef } from 'react';

const DEFAULT_FIELDS = ['.VAL','.RBV','.OFF','.LLM','.HLM','.VELO','.VBAS','.ACCL','.BDST','.BVEL','.MRES','.ERES','.RDBD','.EGU','.DESC'];
const READONLY_FIELDS = new Set(['.RBV','.DESC','.EGU','.RRBV','.MRES','.ERES','.RRES']);

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function fmtVal(v) {
  if (v === null || v === undefined) return <span className="text-gray-300 italic">—</span>;
  if (typeof v === 'number') return parseFloat(v.toPrecision(7)).toString();
  return String(v);
}

function diffColor(snap, live) {
  if (snap === null || snap === undefined || live === null || live === undefined)
    return 'bg-gray-50';
  const sv = parseFloat(snap), lv = parseFloat(live);
  if (isNaN(sv) || isNaN(lv)) return snap === live ? 'bg-green-50' : 'bg-red-50';
  if (sv === lv) return 'bg-green-50';
  const rel = Math.abs(sv - lv) / (Math.abs(sv) || 1);
  return rel < 0.001 ? 'bg-yellow-50' : 'bg-red-50';
}

// ── Station configurator ───────────────────────────────────────────────────

function StationConfigurator({ station, config, onSave }) {
  const [pvs, setPvs] = useState(() =>
    (config?.pvs || []).map(e => ({ ...e, fields: e.fields || DEFAULT_FIELDS }))
  );
  const [newPV, setNewPV] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState('');

  useEffect(() => {
    setPvs((config?.pvs || []).map(e => ({ ...e, fields: e.fields || DEFAULT_FIELDS })));
  }, [station, config]);

  const addPV = () => {
    const pv = newPV.trim();
    if (!pv || pvs.some(e => e.pv === pv)) return;
    setPvs(prev => [...prev, { pv, fields: [...DEFAULT_FIELDS] }]);
    setNewPV('');
  };

  const removePV = pv => setPvs(prev => prev.filter(e => e.pv !== pv));

  const toggleField = (pv, field) => setPvs(prev =>
    prev.map(e => e.pv !== pv ? e : {
      ...e,
      fields: e.fields.includes(field)
        ? e.fields.filter(f => f !== field)
        : [...e.fields, field],
    })
  );

  const save = async () => {
    setSaving(true); setMsg('');
    try { await onSave(pvs); setMsg('Saved.'); }
    catch (e) { setMsg(`Error: ${e.message}`); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      {/* Add PV row */}
      <div className="flex gap-2">
        <input value={newPV} onChange={e => setNewPV(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addPV()}
          placeholder="Add PV (e.g. 15IDA:m1)"
          className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400 font-mono" />
        <button onClick={addPV} disabled={!newPV.trim()}
          className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-40">
          Add
        </button>
      </div>

      {/* PV table */}
      {pvs.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">No PVs configured for this station.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-2 py-1.5 font-semibold text-gray-600 w-48">PV</th>
                {DEFAULT_FIELDS.map(f => (
                  <th key={f} className="px-1 py-1.5 font-mono text-gray-500 text-center"
                      title={READONLY_FIELDS.has(f) ? `${f} (read-only)` : f}>
                    {f}<br/>
                    {READONLY_FIELDS.has(f) && <span className="text-[9px] text-gray-400">ro</span>}
                  </th>
                ))}
                <th className="w-6"></th>
              </tr>
            </thead>
            <tbody>
              {pvs.map(entry => (
                <tr key={entry.pv} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-2 py-1 font-mono text-gray-700 truncate max-w-[12rem]" title={entry.pv}>
                    {entry.pv}
                  </td>
                  {DEFAULT_FIELDS.map(f => (
                    <td key={f} className="px-1 py-1 text-center">
                      <input type="checkbox"
                        checked={entry.fields.includes(f)}
                        onChange={() => toggleField(entry.pv, f)}
                        className="accent-blue-600 cursor-pointer" />
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center">
                    <button onClick={() => removePV(entry.pv)}
                      className="text-red-400 hover:text-red-600 text-base leading-none">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="text-sm px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-40">
          {saving ? 'Saving…' : 'Save Configuration'}
        </button>
        {msg && <span className={`text-xs ${msg.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>{msg}</span>}
      </div>
    </div>
  );
}

// ── Restore password modal ─────────────────────────────────────────────────

function RestoreModal({ snapName, selected, onConfirm, onClose, needsPassword }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const submit = () => {
    if (needsPassword && !pw.trim()) { setErr('Password required.'); return; }
    onConfirm(pw);
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-gray-200 p-5 space-y-4">
        <h2 className="font-bold text-gray-800">Restore Snapshot</h2>
        <p className="text-sm text-gray-600">
          Restore <strong>{selected}</strong> value{selected !== 1 ? 's' : ''} from
          "<em>{snapName}</em>" to the live EPICS motor records?
        </p>
        <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2 border border-amber-200">
          This will write directly to motor PVs. Make sure motion is safe before proceeding.
        </p>
        {needsPassword && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">Password</label>
            <input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(''); }}
              onKeyDown={e => e.key === 'Enter' && submit()}
              autoFocus placeholder="Enter password…"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400" />
            {err && <p className="text-red-500 text-xs mt-1">{err}</p>}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="text-sm px-4 py-1.5 text-gray-600 hover:text-gray-800 rounded hover:bg-gray-100 border border-gray-200">
            Cancel
          </button>
          <button onClick={submit}
            className="text-sm font-semibold px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded">
            Restore
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Comparison table ───────────────────────────────────────────────────────

function CompareTable({ snapshot, liveValues, liveLoading, selected, onToggle, onToggleAll, onRestore, annotationPassword }) {
  const [restoreModal, setRestoreModal] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);

  const rows = Object.entries(snapshot.values || {});
  const writableRows = rows.filter(([pvf]) => !Array.from(READONLY_FIELDS).some(ro => pvf.endsWith(ro)));
  const allSel = writableRows.length > 0 && writableRows.every(([pvf]) => selected.has(pvf));
  const someSel = writableRows.some(([pvf]) => selected.has(pvf)) && !allSel;

  const doRestore = async (password) => {
    setRestoreModal(false);
    const result = await onRestore(snapshot.id, [...selected], password);
    setRestoreResult(result);
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500">
          <strong>{snapshot.name}</strong> · {fmtDate(snapshot.created_at)}
        </span>
        <div className="flex-1" />
        {liveLoading && <span className="text-xs text-blue-500 animate-pulse">Refreshing live values…</span>}
        <button onClick={() => setRestoreModal(true)}
          disabled={selected.size === 0}
          className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-40 font-medium">
          Restore {selected.size > 0 ? `${selected.size} selected` : ''}
        </button>
      </div>

      {/* Restore result banner */}
      {restoreResult && (
        <div className={`text-xs rounded px-3 py-2 border ${restoreResult.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          {restoreResult.error
            ? `Restore failed: ${restoreResult.error}`
            : `Restored ${restoreResult.written}/${restoreResult.total} PVs successfully.`}
          <button onClick={() => setRestoreResult(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto max-h-[calc(100vh-18rem)]">
        <table className="text-xs w-full border-collapse">
          <thead className="sticky top-0 bg-white z-10 shadow-sm">
            <tr className="border-b-2 border-gray-200">
              <th className="px-2 py-1.5 text-left">
                <input type="checkbox" checked={allSel}
                  ref={el => { if (el) el.indeterminate = someSel; }}
                  onChange={onToggleAll}
                  className="accent-blue-600 cursor-pointer" />
              </th>
              <th className="px-2 py-1.5 text-left font-semibold text-gray-600">PV · Field</th>
              <th className="px-2 py-1.5 text-right font-semibold text-gray-600">Snapshot</th>
              <th className="px-2 py-1.5 text-right font-semibold text-gray-600">Live</th>
              <th className="px-2 py-1.5 text-center font-semibold text-gray-600">Match</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([pvf, snapVal]) => {
              const liveVal = liveValues?.[pvf];
              const isRO = Array.from(READONLY_FIELDS).some(ro => pvf.endsWith(ro));
              const color = diffColor(snapVal, liveVal);
              return (
                <tr key={pvf} className={`border-b border-gray-100 hover:brightness-95 ${color}`}>
                  <td className="px-2 py-1">
                    {!isRO ? (
                      <input type="checkbox"
                        checked={selected.has(pvf)}
                        onChange={() => onToggle(pvf)}
                        className="accent-blue-600 cursor-pointer" />
                    ) : (
                      <span className="text-[10px] text-gray-400 italic">ro</span>
                    )}
                  </td>
                  <td className="px-2 py-1 font-mono text-gray-700">{pvf}</td>
                  <td className="px-2 py-1 text-right font-mono">{fmtVal(snapVal)}</td>
                  <td className="px-2 py-1 text-right font-mono">{fmtVal(liveVal)}</td>
                  <td className="px-2 py-1 text-center">
                    {snapVal === null || liveVal === null ? '—'
                      : String(snapVal) === String(liveVal) ? '✓'
                      : '≠'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {restoreModal && (
        <RestoreModal
          snapName={snapshot.name}
          selected={selected.size}
          needsPassword={!!annotationPassword}
          onConfirm={doRestore}
          onClose={() => setRestoreModal(false)} />
      )}
    </div>
  );
}

// ── Main SnapshotTab ───────────────────────────────────────────────────────

export default function SnapshotTab({ annotationPassword }) {
  const [stationsCfg,  setStationsCfg]  = useState({});
  const [station,      setStation]      = useState('');
  const [snapshots,    setSnapshots]    = useState([]);
  const [activeSnap,   setActiveSnap]   = useState(null);
  const [liveValues,   setLiveValues]   = useState({});
  const [liveLoading,  setLiveLoading]  = useState(false);
  const [selected,     setSelected]     = useState(new Set());
  const [tab,          setTab]          = useState('snapshots');
  const [snapName,     setSnapName]     = useState('');
  const [taking,       setTaking]       = useState(false);
  const [msg,          setMsg]          = useState('');
  const [newStation,   setNewStation]   = useState('');
  const [caStatus,     setCaStatus]     = useState(null); // null | {ok, version?, error?, hint?}
  const liveRef = useRef(null);

  // Load config + check CA status on mount
  useEffect(() => {
    fetch('/api/snapshots/config')
      .then(r => r.json())
      .then(d => {
        setStationsCfg(d || {});
        const first = Object.keys(d || {})[0] || '';
        setStation(first);
      });
    fetch('/api/snapshots/ca-status')
      .then(r => r.json())
      .then(setCaStatus)
      .catch(() => setCaStatus({ ok: false, error: 'Could not reach server' }));
  }, []);

  // Load snapshots when station changes
  useEffect(() => {
    if (!station) { setSnapshots([]); return; }
    fetch(`/api/snapshots?station=${encodeURIComponent(station)}`)
      .then(r => r.json())
      .then(d => setSnapshots(Array.isArray(d) ? d.slice().reverse() : []));
  }, [station]);

  // Poll live values every 5s when a snapshot is loaded
  const fetchLive = useCallback(async () => {
    if (!activeSnap || !station) return;
    setLiveLoading(true);
    try {
      const r = await fetch(`/api/snapshots/live?station=${encodeURIComponent(station)}`);
      setLiveValues(await r.json());
    } finally {
      setLiveLoading(false);
    }
  }, [activeSnap, station]);

  useEffect(() => {
    if (!activeSnap) { setLiveValues({}); return; }
    fetchLive();
    liveRef.current = setInterval(fetchLive, 5000);
    return () => clearInterval(liveRef.current);
  }, [activeSnap, fetchLive]);

  // Select all writable PVs when snapshot is loaded
  useEffect(() => {
    if (!activeSnap) { setSelected(new Set()); return; }
    const writable = Object.keys(activeSnap.values || {}).filter(
      pvf => !Array.from(READONLY_FIELDS).some(ro => pvf.endsWith(ro))
    );
    setSelected(new Set(writable));
  }, [activeSnap]);

  const toggleSelected = pvf => setSelected(prev => {
    const n = new Set(prev);
    n.has(pvf) ? n.delete(pvf) : n.add(pvf);
    return n;
  });

  const toggleAll = () => {
    if (!activeSnap) return;
    const writable = Object.keys(activeSnap.values || {}).filter(
      pvf => !Array.from(READONLY_FIELDS).some(ro => pvf.endsWith(ro))
    );
    const allSel = writable.every(pvf => selected.has(pvf));
    setSelected(allSel ? new Set() : new Set(writable));
  };

  const takeSnapshot = async () => {
    if (!snapName.trim() || !station) return;
    setTaking(true); setMsg('');
    try {
      const r = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: snapName.trim(), station }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || r.status); }
      const snap = await r.json();
      setSnapshots(prev => [snap, ...prev]);
      setSnapName('');
      setMsg(`Snapshot "${snap.name}" saved.`);
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setTaking(false);
    }
  };

  const deleteSnapshot = async (id) => {
    if (!confirm('Delete this snapshot?')) return;
    const r = await fetch(`/api/snapshots/${id}`, { method: 'DELETE' });
    if (!r.ok) {
      alert(`Delete failed: ${r.status} ${r.statusText}`);
      return;
    }
    // Re-fetch from server to confirm deletion persisted
    fetch(`/api/snapshots?station=${encodeURIComponent(station)}`)
      .then(r2 => r2.json())
      .then(d => setSnapshots(Array.isArray(d) ? d.slice().reverse() : []));
    if (activeSnap?.id === id) setActiveSnap(null);
  };

  const doRestore = async (snapId, selectedPVFs, password) => {
    try {
      const r = await fetch(`/api/snapshots/${snapId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, selected: selectedPVFs }),
      });
      const data = await r.json();
      if (!r.ok) return { error: data.detail || r.status };
      fetchLive();
      return data;
    } catch (e) {
      return { error: e.message };
    }
  };

  const saveStationConfig = async (pvs) => {
    const updated = { ...stationsCfg, [station]: { pvs } };
    const r = await fetch('/api/snapshots/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    setStationsCfg(updated);
  };

  const addStation = () => {
    const name = newStation.trim();
    if (!name || stationsCfg[name]) return;
    setStationsCfg(prev => ({ ...prev, [name]: { pvs: [] } }));
    setStation(name);
    setNewStation('');
  };

  const removeStation = (name) => {
    if (!confirm(`Remove station "${name}" and all its PV configuration?`)) return;
    const updated = { ...stationsCfg };
    delete updated[name];
    fetch('/api/snapshots/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    setStationsCfg(updated);
    if (station === name) setStation(Object.keys(updated)[0] || '');
  };

  const stationNames = Object.keys(stationsCfg).sort();

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white shrink-0 flex-wrap">
        <span className="font-semibold text-gray-700 text-sm shrink-0">📷 Snapshots</span>

        {/* Station selector */}
        <select value={station} onChange={e => { setStation(e.target.value); setActiveSnap(null); }}
          className="text-sm border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-blue-400">
          {stationNames.length === 0 && <option value="">— no stations —</option>}
          {stationNames.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Tab toggle */}
        <div className="flex rounded border border-gray-200 overflow-hidden">
          {[['snapshots','Snapshots'],['config','Configure PVs']].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs px-2.5 py-1 transition-colors ${
                tab === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50 border-l border-gray-200 first:border-l-0'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Take snapshot (only on snapshots tab) */}
        {tab === 'snapshots' && station && (
          <div className="flex items-center gap-2 ml-auto">
            {msg && <span className={`text-xs ${msg.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>{msg}</span>}
            <input value={snapName} onChange={e => setSnapName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && takeSnapshot()}
              placeholder="Snapshot name…"
              className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400 w-44" />
            <button onClick={takeSnapshot} disabled={taking || !snapName.trim()}
              className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-40 shrink-0">
              {taking ? 'Taking…' : '📷 Take Snapshot'}
            </button>
          </div>
        )}
      </div>

      {/* ── CA status banner ── */}
      {caStatus && !caStatus.ok && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-xs flex items-start gap-2 shrink-0">
          <span className="shrink-0 font-bold">⚠ CA not available:</span>
          <span>{caStatus.error}</span>
          {caStatus.hint && (
            <span className="ml-1 text-red-500 italic">{caStatus.hint}</span>
          )}
        </div>
      )}
      {caStatus && caStatus.ok && caStatus.ca_connected === false && (
        <div className="px-4 py-2 bg-orange-50 border-b border-orange-200 text-orange-800 text-xs shrink-0">
          <span className="font-bold">⚠ pyepics {caStatus.version} installed but cannot reach IOCs</span>
          {caStatus.test_pv && <span className="ml-2 font-mono">(tested: {caStatus.test_pv})</span>}
          <span className="block mt-0.5">
            EPICS_CA_ADDR_LIST={caStatus.epics_ca_addr_list || <em>not set</em>} &nbsp;|&nbsp;
            EPICS_CA_AUTO_ADDR_LIST={caStatus.epics_ca_auto_addr_list || 'YES'}
          </span>
          <span className="block mt-0.5 italic">
            Add <code>Environment="EPICS_CA_ADDR_LIST=&lt;subnet&gt;"</code> to the systemd service unit and restart.
          </span>
        </div>
      )}
      {caStatus && caStatus.ok && caStatus.ca_connected === true && (
        <div className="px-4 py-1 bg-green-50 border-b border-green-200 text-green-700 text-xs shrink-0">
          ✓ pyepics {caStatus.version} — CA connected
          {caStatus.test_pv && <span className="ml-2 font-mono opacity-60">(tested: {caStatus.test_pv} = {caStatus.test_val})</span>}
        </div>
      )}
      {caStatus && caStatus.ok && caStatus.ca_connected === null && (
        <div className="px-4 py-1 bg-green-50 border-b border-green-200 text-green-700 text-xs shrink-0">
          ✓ pyepics {caStatus.version} — CA ready (configure PVs to test connectivity)
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">

        {tab === 'config' ? (
          /* ── Config panel ── */
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Add station */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Stations</p>
              <div className="flex gap-2 mb-3">
                <input value={newStation} onChange={e => setNewStation(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addStation()}
                  placeholder="New station name (e.g. 15IDA)"
                  className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400 w-56" />
                <button onClick={addStation} disabled={!newStation.trim()}
                  className="text-xs px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-40">
                  Add Station
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {stationNames.map(s => (
                  <div key={s} className={`flex items-center gap-1 px-2.5 py-1 rounded border text-xs cursor-pointer transition-colors ${
                    station === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    onClick={() => setStation(s)}>
                    {s}
                    <button onClick={e => { e.stopPropagation(); removeStation(s); }}
                      className="ml-1 opacity-60 hover:opacity-100">×</button>
                  </div>
                ))}
              </div>
            </div>

            {station ? (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                  PVs for station: <span className="text-blue-600">{station}</span>
                </p>
                <StationConfigurator
                  key={station}
                  station={station}
                  config={stationsCfg[station]}
                  onSave={saveStationConfig} />
              </div>
            ) : (
              <p className="text-xs text-gray-400">Select or add a station above to configure its PVs.</p>
            )}
          </div>
        ) : (
          /* ── Snapshots panel ── */
          <div className="flex flex-1 min-h-0">

            {/* Snapshot list */}
            <div className="w-72 shrink-0 border-r border-gray-200 flex flex-col bg-white">
              <div className="px-3 py-2 border-b border-gray-100 shrink-0">
                <span className="text-xs font-semibold text-gray-500 uppercase">
                  {station ? `${station} — ${snapshots.length} snapshot${snapshots.length !== 1 ? 's' : ''}` : 'No station selected'}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {!station && (
                  <p className="text-xs text-gray-400 text-center p-6">Select a station to view snapshots.</p>
                )}
                {station && snapshots.length === 0 && (
                  <p className="text-xs text-gray-400 text-center p-6">No snapshots yet. Use "Take Snapshot" above.</p>
                )}
                {snapshots.map(snap => (
                  <div key={snap.id}
                    onClick={() => setActiveSnap(activeSnap?.id === snap.id ? null : snap)}
                    className={`px-3 py-2.5 border-b border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors ${
                      activeSnap?.id === snap.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}>
                    <div className="font-medium text-sm text-gray-800 truncate">{snap.name}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{fmtDate(snap.created_at)}</div>
                    <div className="text-[10px] text-gray-400">
                      {Object.keys(snap.values || {}).length} PV fields
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteSnapshot(snap.id); }}
                      className="text-[10px] text-red-400 hover:text-red-600 mt-1">
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Comparison / restore table */}
            <div className="flex-1 overflow-auto p-4 bg-gray-50">
              {!activeSnap ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none">
                  <div className="text-5xl mb-3 opacity-20">📷</div>
                  <p className="text-sm font-medium text-gray-500">Select a snapshot to compare</p>
                  <p className="text-xs mt-1 text-gray-400">Live values update every 5 s · Green = match · Red = differs</p>
                </div>
              ) : (
                <CompareTable
                  snapshot={activeSnap}
                  liveValues={liveValues}
                  liveLoading={liveLoading}
                  selected={selected}
                  onToggle={toggleSelected}
                  onToggleAll={toggleAll}
                  onRestore={doRestore}
                  annotationPassword={annotationPassword} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
