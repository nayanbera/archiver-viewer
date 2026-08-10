import Checkbox from './Checkbox';

export default function PVItem({ pv, selected, onToggle, label }) {
  return (
    <div onClick={onToggle}
      className={`flex items-center gap-2 px-2 py-[3px] rounded cursor-pointer
        hover:bg-blue-50 group ${selected ? 'bg-blue-50' : ''}`}>
      <Checkbox checked={selected} partial={false} onChange={onToggle} />
      <span className="font-mono truncate text-xs text-gray-600 group-hover:text-gray-900"
            title={pv}>
        {label || pv}
      </span>
    </div>
  );
}
