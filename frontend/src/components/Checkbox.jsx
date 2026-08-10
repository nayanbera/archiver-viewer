import { useRef, useEffect } from 'react';

export default function Checkbox({ checked, partial, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial && !checked;
  }, [partial, checked]);
  return (
    <input ref={ref} type="checkbox" checked={checked} onChange={onChange}
      onClick={e => e.stopPropagation()}
      className="w-3.5 h-3.5 rounded cursor-pointer accent-blue-500 shrink-0" />
  );
}
