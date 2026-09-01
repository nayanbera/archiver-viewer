import Checkbox from './Checkbox';
import DeviceNode from './DeviceNode';

export default function StationNode({ stName, devices, selPVs, onTogglePV,
                                      expanded, onToggleExp, expandedDevs, onToggleDev,
                                      stLabel, config, pvAliases, onPVContextMenu }) {
  const allPVs  = Object.values(devices).flat();
  const selCnt  = allPVs.filter(p => selPVs.has(p)).length;
  const all     = selCnt === allPVs.length && allPVs.length > 0;
  const some    = selCnt > 0 && !all;
  const devKeys = Object.keys(devices).sort();

  const toggleAll = e => {
    e.stopPropagation();
    if (all) allPVs.forEach(p => onTogglePV(p, false));
    else     allPVs.forEach(p => onTogglePV(p, true));
  };

  return (
    <div className="mb-1">
      <div onClick={() => onToggleExp(stName)}
        className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer
          bg-gray-100 hover:bg-gray-200 border border-gray-200">
        <span className="text-gray-500 text-[11px] w-3 shrink-0">{expanded ? '▼' : '▶'}</span>
        <Checkbox checked={all} partial={some} onChange={toggleAll} />
        <span className="text-sm font-bold text-gray-800 flex-1 truncate" title={stLabel || stName}>
          {stLabel || stName}
        </span>
        <span className="text-[10px] text-gray-400 shrink-0">{devKeys.length}d · {allPVs.length}p</span>
      </div>
      {expanded && (
        <div className="mt-0.5 ml-1">
          {devKeys.map(dev => (
            <DeviceNode
              key={dev} stName={stName} devName={dev} pvs={devices[dev]}
              selPVs={selPVs} onTogglePV={onTogglePV}
              expanded={expandedDevs.has(`${stName}::${dev}`)}
              onToggleExp={onToggleDev}
              devType={config?.deviceTypes?.[`${stName}:${dev}`]}
              pvLabels={config?.pvLabels}
              pvAliases={pvAliases}
              onPVContextMenu={onPVContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}
