import Checkbox from './Checkbox';
import PVItem from './PVItem';

const TYPE_BADGE = {
  motor:    { cls: 'bg-blue-100 text-blue-700 border border-blue-200',    label: 'MOT'  },
  analog:   { cls: 'bg-green-100 text-green-700 border border-green-200', label: 'AI/O' },
  binary:   { cls: 'bg-amber-100 text-amber-700 border border-amber-200', label: 'BI/O' },
  waveform: { cls: 'bg-purple-100 text-purple-700 border border-purple-200', label: 'WF' },
};

export default function DeviceNode({ stName, devName, pvs, selPVs, onTogglePV,
                                     expanded, onToggleExp, devType, pvLabels,
                                     pvAliases, onPVContextMenu }) {
  const devKey = `${stName}::${devName}`;
  const total  = pvs.length;
  const selCnt = pvs.filter(p => selPVs.has(p)).length;
  const all    = selCnt === total && total > 0;
  const some   = selCnt > 0 && !all;
  const badge  = devType ? TYPE_BADGE[devType] : null;

  const toggleAll = e => {
    e.stopPropagation();
    if (all) pvs.forEach(p => onTogglePV(p, false));
    else     pvs.forEach(p => onTogglePV(p, true));
  };

  return (
    <div className="ml-3 mt-px">
      <div onClick={() => onToggleExp(devKey)}
        className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-100 group">
        <span className="text-gray-400 text-[10px] w-3 shrink-0">{expanded ? '▼' : '▶'}</span>
        <Checkbox checked={all} partial={some} onChange={toggleAll} />
        <span className="text-sm text-gray-700 font-medium truncate flex-1" title={devName}>{devName}</span>
        {badge && (
          <span className={`text-[9px] px-1 py-0.5 rounded font-semibold shrink-0 ${badge.cls}`}>
            {badge.label}
          </span>
        )}
        <span className="text-[10px] text-gray-400 shrink-0 ml-1">{total}</span>
      </div>
      {expanded && (
        <div className="ml-5 border-l border-gray-200 pl-1 pb-1">
          {pvs.map(pv => (
            <PVItem key={pv} pv={pv} selected={selPVs.has(pv)}
              onToggle={() => onTogglePV(pv)}
              label={pvAliases?.[pv] || pvLabels?.[pv]}
              onPVContextMenu={onPVContextMenu} />
          ))}
        </div>
      )}
    </div>
  );
}
