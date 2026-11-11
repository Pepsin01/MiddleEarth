import { Download, History, RotateCcw, Save, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api.ts';
import { Popover } from '../components/Popover.tsx';
import { useStore } from '../store.ts';

const when = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const LABELS: Record<string, string> = {
  'create-event': 'before adding an event',
  'update-event': 'before changing an event',
  'delete-events': 'before deleting an event',
  'edit-saga': 'before changing episodes',
  'before-restore': 'before a restore',
  'before-import': 'before an import',
  manual: 'made by hand',
};

function BackupList() {
  const reload = useStore((state) => state.reload);
  const [backups, setBackups] = useState<Array<{ name: string; createdAt: string; label: string }> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pictures, setPictures] = useState(true);
  const [mapPictures, setMapPictures] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const refresh = () => api.backups().then(setBackups, (failure) => setMessage(errorText(failure)));
  useEffect(() => void refresh(), []);

  const run = async (task: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await task());
      await refresh();
    } catch (failure) {
      setMessage(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const exportAll = () =>
    run(async () => {
      const blob = await api.exportZip(pictures, mapPictures);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `chronicle-${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
      return `Exported ${(blob.size / 1e6).toFixed(1)} MB.`;
    });

  return (
    <>
      <h3>Export and import</h3>
      <label className="check">
        <input type="checkbox" checked={pictures} onChange={(event) => setPictures(event.target.checked)} />
        Include pictures
      </label>
      <label className="check">
        <input type="checkbox" checked={mapPictures} onChange={(event) => setMapPictures(event.target.checked)} />
        Include the map picture (large)
      </label>
      <div className="form__row">
        <button type="button" className="button" disabled={busy} onClick={() => void exportAll()}>
          <Download aria-hidden="true" /> Export as zip
        </button>
        <input
          ref={input}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file && window.confirm('Import this file? Entries in it replace the current ones. A backup is made first.')) {
              void run(async () => {
                const result = await api.importZip(file);
                await reload();
                return `Imported ${result.dataFiles} data files and ${result.pictures} pictures.`;
              });
            }
          }}
        />
        <button type="button" className="button" disabled={busy} onClick={() => input.current?.click()}>
          <Upload aria-hidden="true" /> Import a zip
        </button>
      </div>

      <h3>Automatic backups</h3>
      <button type="button" className="button" disabled={busy} onClick={() => void run(async () => ((await api.backupNow()).name ? 'Backup made.' : 'There is nothing to back up yet.'))}>
        <Save aria-hidden="true" /> Back up now
      </button>
      {backups === null && <p className="muted">Loading…</p>}
      {backups?.length === 0 && <p className="muted">None yet. One is made before every change.</p>}
      <ul className="backup-list">
        {backups?.slice(0, 30).map((backup) => (
          <li key={backup.name}>
            <span>
              {when.format(new Date(backup.createdAt))} <small>{LABELS[backup.label] ?? backup.label.replaceAll('-', ' ')}</small>
            </span>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Bring all data back to this point? The current state is backed up first.')) {
                  void run(async () => {
                    await api.restoreBackup(backup.name);
                    await reload();
                    return 'Restored.';
                  });
                }
              }}
            >
              <RotateCcw aria-hidden="true" /> Restore
            </button>
          </li>
        ))}
      </ul>
      {message && <p className="notice">{message}</p>}
    </>
  );
}

/** Toolbar button (edit mode): backups, restore, export and import. */
export function BackupTools() {
  return (
    <Popover label="Backups, export and import" icon={<History aria-hidden="true" />}>
      <BackupList />
    </Popover>
  );
}
