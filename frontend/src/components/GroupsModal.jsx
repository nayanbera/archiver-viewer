import { useState, useMemo } from 'react';

const TABS = [
  { id: 'stations',    label: 'Station Labels' },
  { id: 'assignments', label: 'PV Assignments' },
  { id: 'devtypes',    label: 'Device Types' },
];

export default function GroupsModal({ config, pvList, onSave, onClose }) {
  const [cfg, setCfg] = useState(() => JSON.parse(JSON.stringify(config)));
  const [tab, setTab] = useState('stations');
  const [pvSearch, setPvSearch] = useState('');

  const stationLabels = cfg.stationLabels || {};
  const pvOverrides   = cfg.pvOverrides   || {};
  const deviceTypes   = cfg.deviceTypes   || {};

  const update = patch => setCfg(prev => ({ ...prev, ...patch }));

  // Stations tab
  const [newStName,  setNewStName]  = useState('');
  const [newStLabel, setNewStLabel] = useState('');

  const autoStations = useMemo(() => {
    const s = new Set(pvList.map(pv => pv.split(':')[0]).filter(Boolean));
    return [...s].sort();
  }, [pvList]);

  const allStations = useMemo(() => {
    return [...new Set([...autoStations, ...Object.keys(stationLabels)])].sort();
  }, [autoStations, stationLabels]);

  const addStation = () => {
    if (!newStName.trim()) return;
    update({ stationLabels: { ...stationLabels, [newStName.trim()]: newStLabel.trim() || newStName.trim() } });
    setNewStName(''); setNewStLabel('');
  };
  const removeStationLabel = st => { const n = { ...stationLabels }; delete n[st]; update({ stationLabels: n }); };

  // PV Assignments tab
  const [assignPV,  setAssignPV]  = useState('');
  const [assignSt,  setAssignSt]  = useState('');
  const [assignDev, setAssignDev] = useState('');

  const filteredPVs = useMemo(() => {
    const q = pvSearch.toLowerCase();
    return (q ? pvList.filter(p => p.toLowerCase().includes(q)) : pvList).slice(0, 100);
  }, [pvList, pvSearch]);

  const addOverride = () => {
    if (!assignPV || !assignSt.trim() || !assignDev.trim()) return;
    update({ pvOverrides: { ...pvOverrides, [assignPV]: { station: assignSt.trim(), device: assignDev.trim() } } });
    setAssignPV(''); setAssignSt(''); setAssignDev('');
  };
  const removeOverride = pv => { const n = { ...pvOverrides }; delete n[pv]; update({ pvOverrides: n }); };

  // Device Types tab
  const [dtKey, setDtKey] = useState('');
  const [dtType, setDtType] = useState('motor');

  const allDeviceKeys = useMemo(() => {
    const keys = new Set(Object.keys(deviceTypes));
    pvList.forEach(pv => { const p = pv.split(':'); if (p.length >= 2) keys.add(`${p[0]}:${p[1]}`); });
    return [...keys].sort();
  }, [pvList, deviceTypes]);

  const setDeviceType = (key, type) => {
    if (!type) { const n = { ...deviceTypes }; delete n[key]; update({ deviceTypes: n }); }
    else update({ deviceTypes: { ...deviceTypes, [key]: type } });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] border border-gray-200">

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
          <h2 className="font-bold text-gray-800 text-lg">Manage Groups</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="flex border-b border-gray-200 shrink-0 px-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
                ${tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">

          {tab === 'stations' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">Add a human-readable label to any station, or define a new custom station to group non-standard PVs into.</p>
              {Object.keys(stationLabels).length > 0 && (
                <table className="w-full text-sm border border-gray-200 rounded overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium text-xs">Station key</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium text-xs">Display label</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(stationLabels).map(([st, lbl]) => (
                      <tr key={st} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 font-mono text-xs text-gray-700">{st}</td>
                        <td className="px-3 py-1.5">
                          <input value={lbl}
                            onChange={e => update({ stationLabels: { ...stationLabels, [st]: e.target.value } })}
                            className="w-full text-sm border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:border-blue-400" />
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <button onClick={() => removeStationLabel(st)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-gray-600">Add / rename a station</p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">Station key (e.g. 15IDA)</label>
                    <input value={newStName} onChange={e => setNewStName(e.target.value)} placeholder="15IDA"
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">Display label</label>
                    <input value={newStLabel} onChange={e => setNewStLabel(e.target.value)} placeholder="Station A — White Beam"
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400" />
                  </div>
                  <div className="flex items-end">
                    <button onClick={addStation}
                      className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors">Add</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'assignments' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">Assign non-standard PVs to a custom station and device group, overriding auto-detection.</p>
              {Object.keys(pvOverrides).length > 0 && (
                <table className="w-full text-xs border border-gray-200 rounded overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">PV</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">Station</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">Device</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(pvOverrides).map(([pv, ov]) => (
                      <tr key={pv} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 font-mono text-gray-700 max-w-[160px] truncate" title={pv}>{pv}</td>
                        <td className="px-3 py-1.5 text-gray-600">{ov.station}</td>
                        <td className="px-3 py-1.5 text-gray-600">{ov.device}</td>
                        <td className="px-2 py-1.5 text-center">
                          <button onClick={() => removeOverride(pv)} className="text-red-400 hover:text-red-600">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-gray-600">Add PV assignment</p>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    Select a PV {assignPV && <span className="font-medium text-blue-600 ml-1">✓ {assignPV}</span>}
                  </label>
                  <input value={pvSearch} onChange={e => setPvSearch(e.target.value)} placeholder="Search PVs…"
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-1 focus:outline-none focus:border-blue-400" />
                  <div className="border border-gray-200 rounded bg-white max-h-28 overflow-y-auto">
                    {filteredPVs.map(pv => (
                      <div key={pv} onClick={() => setAssignPV(pv)}
                        className={`px-2 py-1 text-xs font-mono cursor-pointer hover:bg-blue-50 ${assignPV === pv ? 'bg-blue-100 text-blue-700' : 'text-gray-600'}`}>
                        {pv}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">Station</label>
                    <input value={assignSt} onChange={e => setAssignSt(e.target.value)} list="station-list" placeholder="e.g. 15IDA"
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400" />
                    <datalist id="station-list">{allStations.map(s => <option key={s} value={s} />)}</datalist>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">Device / subgroup</label>
                    <input value={assignDev} onChange={e => setAssignDev(e.target.value)} placeholder="e.g. Motors"
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400" />
                  </div>
                  <div className="flex items-end">
                    <button onClick={addOverride} disabled={!assignPV || !assignSt.trim() || !assignDev.trim()}
                      className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      Assign
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'devtypes' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">Tag a device with a type to show a colored badge (MOT / AI/O / BI/O / WF) in the sidebar.</p>
              {Object.keys(deviceTypes).length > 0 && (
                <table className="w-full text-sm border border-gray-200 rounded overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">Device key</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">Type</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(deviceTypes).map(([k, t]) => (
                      <tr key={k} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 font-mono text-xs text-gray-700">{k}</td>
                        <td className="px-3 py-1.5">
                          <select value={t} onChange={e => setDeviceType(k, e.target.value)}
                            className="text-xs border border-gray-200 rounded px-1 py-0.5">
                            {['motor','analog','binary','waveform'].map(tp => <option key={tp} value={tp}>{tp}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button onClick={() => setDeviceType(k, null)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-gray-600">Tag a device</p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">Device key (STATION:DEVICE)</label>
                    <input value={dtKey} onChange={e => setDtKey(e.target.value)} list="device-key-list" placeholder="15IDA:M1"
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400" />
                    <datalist id="device-key-list">{allDeviceKeys.map(k => <option key={k} value={k} />)}</datalist>
                  </div>
                  <div className="w-36">
                    <label className="text-xs text-gray-500 block mb-1">Type</label>
                    <select value={dtType} onChange={e => setDtType(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400">
                      {['motor','analog','binary','waveform'].map(tp => <option key={tp} value={tp}>{tp}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button onClick={() => { if (dtKey.trim()) { setDeviceType(dtKey.trim(), dtType); setDtKey(''); } }}
                      className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors">Tag</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 shrink-0">
          <button onClick={onClose}
            className="text-sm px-4 py-1.5 text-gray-600 hover:text-gray-800 rounded hover:bg-gray-100 border border-gray-200 transition-colors">
            Cancel
          </button>
          <button onClick={() => onSave(cfg)}
            className="text-sm font-semibold px-5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors">
            Save & Apply
          </button>
        </div>
      </div>
    </div>
  );
}
