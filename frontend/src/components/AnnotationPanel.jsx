function fmtTs(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return iso; }
}

export default function AnnotationPanel({ annotations, onClickAnnotation, onDeleteAnnotation }) {
  const sorted = [...(annotations || [])].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  return (
    <aside className="w-56 flex flex-col bg-white border-l border-gray-200 shrink-0">
      <div className="px-3 py-2 border-b border-gray-200 shrink-0">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Annotations{' '}
          {sorted.length > 0 && (
            <span className="text-gray-400 font-normal normal-case">({sorted.length})</span>
          )}
        </h3>
      </div>

      {sorted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4 text-center">
          <p className="text-xs text-gray-400 leading-relaxed">
            No annotations yet.<br />
            Click{' '}
            <span className="font-medium text-amber-600">+ Annotation</span>
            {' '}while a plot is shown to add one.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {sorted.map(ann => (
            <div
              key={ann.id}
              onClick={() => onClickAnnotation(ann)}
              className="group px-3 py-2.5 border-b border-gray-100 hover:bg-amber-50 cursor-pointer transition-colors">
              <div className="flex items-start justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-400 font-mono leading-none mb-1">
                    {fmtTs(ann.timestamp)}
                  </p>
                  <p className="text-xs text-gray-700 leading-snug break-words">{ann.note}</p>
                  {ann.pvs?.length > 0 && (
                    <p className="text-[10px] text-gray-400 mt-1 truncate" title={ann.pvs.join(', ')}>
                      {ann.pvs.length} PV{ann.pvs.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onDeleteAnnotation(ann.id); }}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs shrink-0 mt-0.5 transition-opacity leading-none">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
