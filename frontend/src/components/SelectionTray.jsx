export default function SelectionTray({ selPVs, onClear, onPlot }) {
  const arr = [...selPVs];
  if (arr.length === 0) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border-t border-blue-200 shrink-0">
      <span className="text-sm font-semibold text-blue-700 shrink-0">
        {arr.length} PV{arr.length !== 1 ? 's' : ''} selected
      </span>
      <div className="flex gap-1 flex-1 overflow-hidden">
        {arr.slice(0, 6).map(pv => (
          <span key={pv} className="text-[10px] font-mono bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded shrink-0">
            {pv}
          </span>
        ))}
        {arr.length > 6 && <span className="text-xs text-blue-500 shrink-0">+{arr.length - 6} more</span>}
      </div>
      <button onClick={onClear}
        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 border border-gray-200 transition-colors shrink-0">
        Clear
      </button>
      <button onClick={onPlot}
        className="text-sm font-semibold px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-1.5 shrink-0">
        ▶ Plot
      </button>
    </div>
  );
}
