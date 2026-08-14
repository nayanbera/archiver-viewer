import { useState } from 'react';

function fmtTs(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return iso; }
}

// Prompts for the current password before running onSuccess.
// If no password is configured, runs onSuccess immediately.
function PasswordGate({ password, onSuccess, onCancel }) {
  const [pw,  setPw]  = useState('');
  const [err, setErr] = useState('');

  if (!password) { onSuccess(); return null; }

  const check = () => {
    if (pw === password) { onSuccess(); }
    else { setErr('Incorrect password'); setPw(''); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-80 border border-gray-200 p-5 space-y-3">
        <h3 className="font-semibold text-gray-700 text-sm">Password required</h3>
        <input
          type="password" autoFocus
          value={pw} onChange={e => { setPw(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && check()}
          placeholder="Annotation password"
          className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-blue-400"
        />
        {err && <p className="text-red-500 text-xs">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel}
            className="text-sm px-3 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={check}
            className="text-sm px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal to set or change the annotation password.
function ChangePasswordModal({ currentPassword, onSave, onCancel }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [conf,  setConf]  = useState('');
  const [err,   setErr]   = useState('');

  const save = () => {
    if (currentPassword && oldPw !== currentPassword) {
      setErr('Current password is incorrect'); return;
    }
    if (newPw !== conf) { setErr('New passwords do not match'); return; }
    onSave(newPw);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-80 border border-gray-200 p-5 space-y-3">
        <h3 className="font-semibold text-gray-700 text-sm">
          {currentPassword ? 'Change annotation password' : 'Set annotation password'}
        </h3>
        {currentPassword && (
          <input type="password" autoFocus value={oldPw} onChange={e => { setOldPw(e.target.value); setErr(''); }}
            placeholder="Current password"
            className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-blue-400" />
        )}
        <input type="password" autoFocus={!currentPassword} value={newPw} onChange={e => { setNewPw(e.target.value); setErr(''); }}
          placeholder="New password (leave blank to remove)"
          className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-blue-400" />
        <input type="password" value={conf} onChange={e => { setConf(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && save()}
          placeholder="Confirm new password"
          className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-blue-400" />
        {err && <p className="text-red-500 text-xs">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel}
            className="text-sm px-3 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={save}
            className="text-sm px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AnnotationPanel({
  annotations, annotationPassword,
  onClickAnnotation, onDeleteAnnotation, onEditAnnotation, onChangePassword,
}) {
  const [gate,        setGate]        = useState(null);
  const [editingId,   setEditingId]   = useState(null);
  const [editNote,    setEditNote]    = useState('');
  const [showChgPw,   setShowChgPw]   = useState(false);
  const [search,      setSearch]      = useState('');

  const sorted = [...(annotations || [])].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  const filtered = search.trim()
    ? sorted.filter(ann =>
        ann.note.toLowerCase().includes(search.toLowerCase()) ||
        fmtTs(ann.timestamp).toLowerCase().includes(search.toLowerCase())
      )
    : sorted;

  const pw = annotationPassword || '';

  const trigger = (action, ann) => {
    if (!pw) {
      applyAction(action, ann);
    } else {
      setGate({ action, ann });
    }
  };

  const applyAction = (action, ann) => {
    if (action === 'delete') {
      onDeleteAnnotation(ann.id);
    } else {
      setEditingId(ann.id);
      setEditNote(ann.note);
    }
  };

  const saveEdit = () => {
    if (!editNote.trim()) return;
    onEditAnnotation(editingId, editNote.trim());
    setEditingId(null);
    setEditNote('');
  };

  return (
    <aside className="w-56 flex flex-col bg-white border-l border-gray-200 shrink-0">

      {/* Password gate overlay */}
      {gate && (
        <PasswordGate
          password={pw}
          onSuccess={() => { const g = gate; setGate(null); applyAction(g.action, g.ann); }}
          onCancel={() => setGate(null)}
        />
      )}

      {/* Edit note modal */}
      {editingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-80 border border-gray-200 p-5 space-y-3">
            <h3 className="font-semibold text-gray-700 text-sm">Edit annotation</h3>
            <textarea
              autoFocus value={editNote} onChange={e => setEditNote(e.target.value)}
              rows={4}
              className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-blue-400 resize-none" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setEditingId(null); setEditNote(''); }}
                className="text-sm px-3 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={saveEdit} disabled={!editNote.trim()}
                className="text-sm px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors disabled:opacity-40">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change password modal */}
      {showChgPw && (
        <ChangePasswordModal
          currentPassword={pw}
          onSave={newPw => { onChangePassword(newPw); setShowChgPw(false); }}
          onCancel={() => setShowChgPw(false)}
        />
      )}

      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200 shrink-0 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Annotations{' '}
          {sorted.length > 0 && (
            <span className="text-gray-400 font-normal normal-case">({sorted.length})</span>
          )}
        </h3>
        <button
          onClick={() => setShowChgPw(true)}
          title={pw ? 'Change annotation password' : 'Set annotation password'}
          className="text-gray-400 hover:text-gray-600 text-sm leading-none transition-colors">
          {pw ? '🔒' : '🔓'}
        </button>
      </div>

      {/* Search box — only shown when there are annotations */}
      {sorted.length > 0 && (
        <div className="px-2 py-1.5 border-b border-gray-100 shrink-0">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search annotations…"
            className="w-full text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400 placeholder-gray-400"
          />
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4 text-center">
          <p className="text-xs text-gray-400 leading-relaxed">
            No annotations yet.<br /><br />
            <span className="font-medium text-gray-500">Double-click on the plot</span>
            {' '}to add an annotation at that timestamp.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4 text-center">
          <p className="text-xs text-gray-400">No annotations match <span className="font-mono">"{search}"</span></p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filtered.map(ann => (
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
                {/* Edit / Delete — visible on hover */}
                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); trigger('edit', ann); }}
                    title="Edit note"
                    className="text-blue-400 hover:text-blue-600 text-xs leading-none px-0.5">
                    ✏
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); trigger('delete', ann); }}
                    title="Delete annotation"
                    className="text-red-400 hover:text-red-600 text-xs leading-none px-0.5">
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
