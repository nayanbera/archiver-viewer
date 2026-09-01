import Checkbox from './Checkbox';

export default function PVItem({ pv, selected, onToggle, label, onPVContextMenu }) {
  const display = label || pv;
  const hasAlias = label && label !== pv;

  const handleContextMenu = e => {
    e.preventDefault();
    e.stopPropagation();
    onPVContextMenu?.(pv, e.clientX, e.clientY);
  };

  return (
    <div onClick={onToggle} onContextMenu={handleContextMenu}
      className={`flex items-center gap-2 px-2 py-[3px] rounded cursor-pointer
        hover:bg-blue-50 group ${selected ? 'bg-blue-50' : ''}`}>
      <Checkbox checked={selected} partial={false} onChange={onToggle} />
      <span className={`font-mono truncate text-xs group-hover:text-gray-900 ${
                        hasAlias ? 'text-blue-700 font-semibold' : 'text-gray-600'}`}
            title={hasAlias ? pv : undefined}>
        {display}
      </span>
    </div>
  );
}
