import { useState, useMemo } from 'react';
import Checkbox from './Checkbox';

const EXAMPLES = ['15IDA:*', '*:M1:*', '*BeamPos*', '15ID*:*:RBV'];

export default function SearchModal({ onAddToSelection, onClose }) {
  const [pattern, setPattern] = useState('');
  const [results, setResults] = useState(null);
  const [checked, setChecked] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const runSearch = async () => {
    if (!pattern.trim()) return;
    setLoading(true); setError(''); setResults(null); setChecked(new Set());
    try {
      const r = await fetch(`/api/search?pattern=${encodeURIComponent(pattern.trim())}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setResults(Array.isArray(data) ? data.sort() : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const togglePV  = pv => setChecked(prev => { const n = new Set(prev); n.has(pv) ? n.delete(pv) : n.add(pv); return n; });
  const toggleAll = ()  => setChecked(prev => (results && prev.size === results.length) ? new Set() : new Set(results));

  const allChecked  = results && checked.size === results.length && results.length > 0;
  const someChecked = checked.size > 0 && !allChecked;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] border border-gray-200">

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
          <h2 className="font-bold text-gray-800 text-lg">Search Archiver PVs</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 border-b border-gray-100 shrink-0 space-y-2">
          <div className="flex gap-2">
            <input value={pattern} onChange={e => setPattern(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              placeholder="Glob pattern, e.g.  15IDA:*  or  *:M1:*  or  *BeamPos*"
              autoFocus
              className="flex-1 text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-blue-400 font-mono" />
            <button onClick={runSearch} disabled={loading || !pattern.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {loading ? '…' : 'Search'}
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">Examples:</span>
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => setPattern(ex)}
                className="text-xs font-mono px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border border-gray-200 transition-colors">
                {ex}
              </button>
            ))}
            <span className="text-xs text-gray-400 ml-1">— <code className="bg-gray-100 px-1 rounded">*</code> is wildcard</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {error && <div className="m-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">{error}</div>}
          {results === null && !loading && (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              Enter a pattern and press Search or Enter
            </div>
          )}
          {results !== null && results.length === 0 && (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              No PVs matched <span className="font-mono ml-1 text-gray-600">"{pattern}"</span>
            </div>
          )}
          {results !== null && results.length > 0 && (
            <div>
              <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-100 sticky top-0">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox checked={allChecked} partial={someChecked} onChange={toggleAll} />
                  <span className="text-xs text-gray-600 font-medium">
                    {checked.size > 0
                      ? `${checked.size} of ${results.length} selected`
                      : `${results.length} result${results.length !== 1 ? 's' : ''}`}
                  </span>
                </label>
              </div>
              <div className="px-3 py-1">
                {results.map(pv => (
                  <div key={pv} onClick={() => togglePV(pv)}
                    className={`flex items-center gap-2 px-2 py-[3px] rounded cursor-pointer hover:bg-blue-50 ${checked.has(pv) ? 'bg-blue-50' : ''}`}>
                    <Checkbox checked={checked.has(pv)} partial={false} onChange={() => togglePV(pv)} />
                    <span className="font-mono text-xs text-gray-600 truncate" title={pv}>{pv}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 shrink-0">
          <span className="text-xs text-gray-400">
            {checked.size > 0
              ? `${checked.size} PV${checked.size !== 1 ? 's' : ''} will be added to selection`
              : 'Check PVs above, then click Add to Selection'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="text-sm px-4 py-1.5 text-gray-600 hover:text-gray-800 rounded hover:bg-gray-100 border border-gray-200 transition-colors">
              Cancel
            </button>
            <button onClick={() => { onAddToSelection([...checked]); onClose(); }}
              disabled={checked.size === 0}
              className="text-sm font-semibold px-5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              + Add to Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
