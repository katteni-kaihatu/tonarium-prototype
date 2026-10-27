import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import './mode-help.css';

export function ModeButton({ explanation, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { explanation: string }) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!anchor.current?.contains(document.activeElement)) setOpen(false);
    }, 100);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const button = anchor.current!.getBoundingClientRect();
      const help = tooltip.current!.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(button.left, window.innerWidth - help.width - 8)),
        top: Math.max(8, Math.min(button.bottom + 4 + help.height <= window.innerHeight - 8 ? button.bottom + 4 : button.top - help.height - 4, window.innerHeight - help.height - 8)),
      });
    };
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); event.stopPropagation(); }
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('keydown', dismiss, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('keydown', dismiss, true);
    };
  }, [open, explanation]);
  return <span ref={anchor} className="mode-option" tabIndex={props.disabled ? 0 : undefined}
    role={props.disabled ? 'group' : undefined} aria-disabled={props.disabled || undefined}
    aria-label={props.disabled ? props['aria-label'] : undefined} aria-describedby={props.disabled ? id : undefined}
    onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={() => setOpen(false)}>
    <button {...props} aria-describedby={id}>{children}</button>
    {createPortal(<span ref={tooltip} id={id} role="tooltip" className="mode-tooltip" hidden={!open}
      style={position} onMouseEnter={show} onMouseLeave={hide}>{explanation}</span>, document.body)}
  </span>;
}
