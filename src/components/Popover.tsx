import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface Props {
  /** Accessible name of the button, also shown as its tooltip. */
  label: string;
  icon: ReactNode;
  /** Shown next to the icon, e.g. a short status text. */
  text?: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Highlights the button, e.g. while the feature it controls is switched on. */
  active?: boolean;
}

/** A toolbar button that opens a small panel. Clicking elsewhere or pressing Escape closes it. */
export function Popover({ label, icon, text, children, active = false }: Props) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className="popover-host" ref={host}>
      <button
        type="button"
        className={`icon-button${text ? ' icon-button--text' : ''}${active || open ? ' is-on' : ''}`}
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {icon}
        {text}
      </button>
      {open && (
        <div className="panel popover" role="dialog" aria-label={label}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}
