import { AlertTriangle, CalendarDays, LogOut, MapPin, Pencil, Plus, Star, User, X } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, errorText } from '../api.ts';
import { Popover } from '../components/Popover.tsx';
import { useStore } from '../store.ts';
import { BackupTools } from './BackupTools.tsx';
import { CharacterForm, EventForm, PlaceForm, SagaForm } from './forms.tsx';

const TITLES = { event: 'event', character: 'character', place: 'place', saga: 'Episodes and storylines' } as const;

/** The form shown in the side panel while something is being added or edited. */
export function EditorPanel() {
  const target = useStore((state) => state.editorTarget);
  const openEditor = useStore((state) => state.openEditor);
  if (!target) return null;
  const title = target.kind === 'saga' ? TITLES.saga : `${target.id ? 'Edit' : 'New'} ${TITLES[target.kind]}`;
  return (
    <>
      <header className="detail__header">
        <span className="detail__kicker">{title}</span>
        <button type="button" className="icon-button" onClick={() => openEditor(null)} aria-label="Close without saving">
          <X aria-hidden="true" />
        </button>
      </header>
      <div className="detail__scroll">
        {target.kind === 'event' && <EventForm key={target.id ?? 'new'} id={target.id} />}
        {target.kind === 'character' && <CharacterForm key={target.id ?? 'new'} id={target.id} />}
        {target.kind === 'place' && <PlaceForm key={target.id ?? 'new'} id={target.id} />}
        {target.kind === 'saga' && <SagaForm />}
      </div>
    </>
  );
}

function LoginDialog({ onClose }: { onClose: () => void }) {
  const setSession = useStore((state) => state.setSession);
  const setEditing = useStore((state) => state.setEditing);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSession(await api.login(password));
      setEditing(true);
      onClose();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="panel dialog" role="dialog" aria-modal="true" aria-label="Log in to edit" onSubmit={(event) => void submit(event)}>
        <h2>Log in to edit</h2>
        <p>Editing is protected by a password on this server.</p>
        <input type="password" value={password} autoFocus autoComplete="current-password" placeholder="Password" aria-label="Password" onChange={(event) => setPassword(event.target.value)} />
        {error && <p className="form-error">{error}</p>}
        <div className="form__buttons">
          <button type="submit" className="button button--primary" disabled={busy || !password}>
            {busy ? 'Checking…' : 'Log in'}
          </button>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/** Toolbar buttons for editing: the edit-mode switch, "Add", data problems, log out. */
export function EditTools() {
  const session = useStore((state) => state.session);
  const editing = useStore((state) => state.editing);
  const setEditing = useStore((state) => state.setEditing);
  const setSession = useStore((state) => state.setSession);
  const openEditor = useStore((state) => state.openEditor);
  const problems = useStore((state) => state.bundle?.problems ?? []);
  const [loggingIn, setLoggingIn] = useState(false);

  if (session.readOnly) return null;

  const toggle = () => {
    if (editing) setEditing(false);
    else if (session.canEdit) setEditing(true);
    else setLoggingIn(true);
  };

  return (
    <>
      {editing && (
        <Popover label="Add something" icon={<Plus aria-hidden="true" />} text="Add">
          {(close) => (
            <>
              <h3>Add or change</h3>
              {(
                [
                  ['event', 'An event', Star],
                  ['character', 'A character', User],
                  ['place', 'A place', MapPin],
                  ['saga', 'Episodes, seasons, storylines', CalendarDays],
                ] as const
              ).map(([kind, label, Icon]) => (
                <button
                  key={kind}
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    openEditor({ kind, id: null });
                    close();
                  }}
                >
                  <Icon aria-hidden="true" /> {label}
                </button>
              ))}
              <p className="muted">To change something that exists, select it on the map and press Edit.</p>
            </>
          )}
        </Popover>
      )}
      {editing && <BackupTools />}
      {editing && problems.length > 0 && (
        <Popover label={`${problems.length} problem${problems.length === 1 ? '' : 's'} in the data files`} icon={<AlertTriangle aria-hidden="true" />} active>
          <h3>Problems in the data files</h3>
          <ul className="problem-list">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Popover>
      )}
      <button type="button" className={`icon-button${editing ? ' is-on' : ''}`} onClick={toggle} aria-pressed={editing} aria-label={editing ? 'Leave edit mode' : 'Edit'} title={editing ? 'Leave edit mode' : 'Edit'}>
        <Pencil aria-hidden="true" />
      </button>
      {session.authenticated && (
        <button
          type="button"
          className="icon-button"
          aria-label="Log out"
          title="Log out"
          onClick={() => {
            void api.logout().then(async () => {
              setEditing(false);
              setSession(await api.session());
            });
          }}
        >
          <LogOut aria-hidden="true" />
        </button>
      )}
      {loggingIn && <LoginDialog onClose={() => setLoggingIn(false)} />}
    </>
  );
}
