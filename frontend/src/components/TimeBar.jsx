import { fmtDTLocal } from '../utils';

const PRESETS = [
  { label: '1h',  ms: 3_600_000 },
  { label: '8h',  ms: 28_800_000 },
  { label: '24h', ms: 86_400_000 },
  { label: '7d',  ms: 604_800_000 },
  { label: '30d', ms: 2_592_000_000 },
];

export default function TimeBar({ tr, onChange }) {
  const apply = ms => {
    const to = new Date(), from = new Date(to.getTime() - ms);
    onChange({ from, to });
  };
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PRESETS.map(p => (
        <button key={p.label} onClick={() => apply(p.ms)}
          className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border border-gray-200 transition-colors">
          {p.label}
        </button>
      ))}
      <span className="text-gray-300 mx-1">|</span>
      <input type="datetime-local" value={fmtDTLocal(tr.from)}
        onChange={e => onChange({ ...tr, from: new Date(e.target.value) })}
        className="text-xs bg-white border border-gray-300 text-gray-700 rounded px-2 py-1 focus:outline-none focus:border-blue-400" />
      <span className="text-gray-400 text-xs">→</span>
      <input type="datetime-local" value={fmtDTLocal(tr.to)}
        onChange={e => onChange({ ...tr, to: new Date(e.target.value) })}
        className="text-xs bg-white border border-gray-300 text-gray-700 rounded px-2 py-1 focus:outline-none focus:border-blue-400" />
    </div>
  );
}
