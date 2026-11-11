import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { searchWiki, wikiPage } from '../lib/wiki.ts';
import type { WikiInfo } from '../lib/wiki.ts';

interface Props {
  /** The wiki link currently in the form. */
  value: string;
  onChange: (value: string) => void;
  /** Called with what was found, so the form can fill in its empty fields. Returns a note about what it did. */
  onFill: (info: WikiInfo) => string;
  hint?: string;
}

/**
 * The "Wiki link" field. Type a name to search the LOTR wiki, or paste a wiki
 * address and press Fill in: link, opening paragraph and a suggested picture
 * are fetched for the form.
 */
export function WikiField({ value, onChange, onFill, hint }: Props) {
  const [query, setQuery] = useState('');
  const [titles, setTitles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const latest = useRef(0);

  // Search while typing, a moment after the last keystroke.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2 || text.includes('://')) {
      setTitles([]);
      return;
    }
    const ticket = ++latest.current;
    const timer = window.setTimeout(() => {
      searchWiki(text).then(
        (found) => ticket === latest.current && setTitles(found),
        () => ticket === latest.current && setTitles([]),
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const fill = async (input: string) => {
    if (!input.trim()) return;
    setBusy(true);
    setNote(null);
    setTitles([]);
    latest.current++;
    try {
      const info = await wikiPage(input);
      setNote(onFill(info));
      setQuery('');
    } catch (failure) {
      setNote(failure instanceof Error ? failure.message : 'The wiki could not be reached.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field wiki-field">
      <span className="field__label">Wiki link</span>
      <input type="url" value={value} placeholder="https://lotr.fandom.com/wiki/…" aria-label="Wiki link" onChange={(event) => onChange(event.target.value)} />
      <div className="wiki-field__search">
        <Search aria-hidden="true" />
        <input
          type="text"
          value={query}
          placeholder="Find on the wiki: type a name"
          aria-label="Find a page on the wiki"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void fill(query);
            }
          }}
        />
        <button type="button" className="button" disabled={busy || !(query.trim() || value.trim())} onClick={() => void fill(query.trim() || value)}>
          {busy ? 'Looking…' : 'Fill in'}
        </button>
      </div>
      {titles.length > 0 && (
        <ul className="wiki-field__results">
          {titles.map((title) => (
            <li key={title}>
              <button type="button" className="menu-item" onClick={() => void fill(title)}>
                {title}
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && <small className="field__hint">{note}</small>}
      {hint && <small className="field__hint">{hint}</small>}
    </div>
  );
}
