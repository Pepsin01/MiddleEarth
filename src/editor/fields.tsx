import { ImagePlus, Link2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import type { ImageRef } from '../../shared/schema.ts';
import { api, errorText } from '../api.ts';
import { focusPosition, imageUrl } from '../lib/media.ts';

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <small className="field__hint">{hint}</small>}
    </label>
  );
}

interface TextProps {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  hint?: ReactNode;
  placeholder?: string;
  type?: 'text' | 'url' | 'date' | 'color';
  required?: boolean;
}

export function TextField({ label, value, onChange, hint, placeholder, type = 'text', required }: TextProps) {
  return (
    <Field label={label} hint={hint}>
      <input type={type} value={value ?? ''} placeholder={placeholder} required={required} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

export function TextArea({ label, value, onChange, hint, rows = 4 }: { label: string; value: string | undefined; onChange: (value: string) => void; hint?: ReactNode; rows?: number }) {
  return (
    <Field label={label} hint={hint}>
      <textarea rows={rows} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  hint?: ReactNode;
}

export function SelectField({ label, value, onChange, options, hint }: SelectProps) {
  return (
    <Field label={label} hint={hint}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** "" -> undefined, so empty form fields are left out of the saved data. */
export const blank = (text: string | undefined): string | undefined => (text && text.trim() ? text.trim() : undefined);

interface ImageFieldProps {
  label: string;
  value: ImageRef | undefined;
  onChange: (value: ImageRef | undefined) => void;
  /** Show the picture as a round portrait. */
  round?: boolean;
  /** A page with a fitting picture, offered as a shortcut. */
  suggestion?: string;
}

/**
 * Picture of an entry. A picture can be chosen from disk, dropped onto the field,
 * pasted from the clipboard (Ctrl+V), or fetched from a web address if that site allows it.
 * Clicking the preview marks the point that must stay visible when the picture is cropped.
 */
export function ImageField({ label, value, onChange, round = false, suggestion }: ImageFieldProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  const upload = async (file: Blob, name: string) => {
    setBusy(true);
    setError(null);
    try {
      const stored = await api.uploadPicture(file, name);
      latest.current.onChange({ file: stored.file, credit: latest.current.value?.credit });
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  // Ctrl+V anywhere in the form pastes a copied picture into this field.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((entry) => entry.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      void upload(file, file.name || 'pasted-picture.png');
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const fetchFromWeb = async () => {
    if (!address.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const stored = await api.fetchPicture(address.trim());
      onChange({ file: stored.file, source: stored.source, credit: value?.credit });
      setAddress('');
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const setFocus = (event: ReactMouseEvent<HTMLImageElement>) => {
    if (!value) return;
    const box = event.currentTarget.getBoundingClientRect();
    const clamp = (number: number) => Math.round(Math.min(1, Math.max(0, number)) * 100) / 100;
    onChange({ ...value, focus: [clamp((event.clientX - box.left) / box.width), clamp((event.clientY - box.top) / box.height)] });
  };

  const url = imageUrl(value, 480);
  return (
    <div
      className={`field image-field${over ? ' is-over' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = [...event.dataTransfer.files].find((entry) => entry.type.startsWith('image/'));
        if (file) void upload(file, file.name);
      }}
    >
      <span className="field__label">{label}</span>
      {url ? (
        <div className={`image-field__preview${round ? ' image-field__preview--round' : ''}`}>
          <img src={url} alt="" onClick={setFocus} style={{ objectPosition: focusPosition(value) }} title="Click the most important point (for example the face)" />
          {value?.focus && <i style={{ left: `${value.focus[0] * 100}%`, top: `${value.focus[1] * 100}%` }} />}
        </div>
      ) : (
        <p className="image-field__empty">No picture yet. Choose a file, drop one here, or paste one with Ctrl+V.</p>
      )}
      <div className="image-field__actions">
        <input ref={input} type="file" accept="image/*" hidden onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0], event.target.files[0].name)} />
        <button type="button" className="button" disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlus aria-hidden="true" /> {busy ? 'Working…' : 'Choose a file'}
        </button>
        {value && (
          <button type="button" className="button" onClick={() => onChange(undefined)}>
            <Trash2 aria-hidden="true" /> Remove
          </button>
        )}
      </div>
      <div className="image-field__web">
        <input type="url" value={address} placeholder="or a picture's web address" onChange={(event) => setAddress(event.target.value)} aria-label="Web address of a picture" />
        <button type="button" className="button" disabled={busy || !address.trim()} onClick={() => void fetchFromWeb()}>
          <Link2 aria-hidden="true" /> Fetch
        </button>
      </div>
      {suggestion && (
        <small className="field__hint">
          Suggested:{' '}
          <a href={suggestion} target="_blank" rel="noreferrer">
            open a fitting still
          </a>
          , copy the picture there (right-click, Copy image) and press Ctrl+V here.
        </small>
      )}
      {value && <input type="text" value={value.credit ?? ''} placeholder="Credit, e.g. © Amazon Studios" aria-label="Picture credit" onChange={(event) => onChange({ ...value, credit: blank(event.target.value) })} />}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
