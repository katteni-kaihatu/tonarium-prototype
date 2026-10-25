import { t as tr } from '../i18n/index.ts';
import { useEffect, useRef, useState } from 'react';
import { useStore, set, sessionOf } from '../store.ts';
import { Icon } from '../world/Icon.tsx';
import { Home, Sidebar } from './Home.tsx';
import { touchOnly } from '../phone.ts';

/** セッション中に、背面を暗くぼかしてホームをシートで重ねる。Esc か背面のクリックで閉じる */
function HomeOverlay() {
  const sessionName = useStore((s) => sessionOf(s.session)?.name);
  const count = useStore((s) => s.participants.length);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') set({ hubOpen: false }); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <div className="hoverlay">
      <div className="hoverlaybg" onClick={() => set({ hubOpen: false })} />
      <div className="hnow"><i />{tr("ui325")}<strong>{sessionName}</strong><span>· {count} {tr("ui125")}</span></div>
      <button className="hoverlayclose" aria-label={tr("ui73")} onClick={() => set({ hubOpen: false })}><Icon name="close" size={18} /></button>
      <Home sheet />
    </div>
  );
}

/** セッション中の左上のメニュー。ホバーで項目が左から出て、ボタンを押すと最後に開いたページを重ねて開く */
export function SessionMenu() {
  const hubOpen = useStore((s) => s.hubOpen);
  const [hover, setHover] = useState(false);
  // 項目へ動かす途中で一瞬外れても閉じないよう、少し待ってから閉じる
  const timer = useRef(0);
  const enter = () => { if (!touchOnly) { clearTimeout(timer.current); setHover(true); } };
  const leave = () => { timer.current = window.setTimeout(() => setHover(false), 180); };
  const show = hover && !hubOpen;
  return (
    <>
      {hubOpen && <HomeOverlay />}
      <div className="smenu" onMouseEnter={enter} onMouseLeave={leave}>
        <button
          className={`smenubtn ${hubOpen ? 'on' : ''}`} aria-label={tr("ui326")} title={tr("ui327")} aria-expanded={hubOpen}
          onClick={() => { set({ hubOpen: !hubOpen }); setHover(false); }}
        ><Icon name="menu" size={20} /></button>
        <div className="smenubridge" aria-hidden="true" style={{ pointerEvents: show ? 'auto' : 'none' }} />
        <div className={`smenunav ${show ? 'show' : ''}`} aria-hidden={!show}>
          <Sidebar inSession onPick={() => { set({ hubOpen: true }); setHover(false); }} />
        </div>
      </div>
    </>
  );
}
