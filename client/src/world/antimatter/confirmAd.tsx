import { useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { t } from '../../i18n/index.ts';
import { s } from './styles.ts';
import './antimatter-panel.css';

interface Open { root: Root; host: HTMLElement; settle: (ok: boolean) => void }
let current: Open | null = null;

function Dialog({ message, done }: { message: string; done: (ok: boolean) => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancel.current?.focus();
    // 3D のポインターロック中などフォーカスが外れていても Esc で閉じられるようにする
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const buttons = box.current?.querySelectorAll('button');
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        const active = document.activeElement;
        if (!box.current!.contains(active)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
        return;
      }
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      done(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      // 続けて次の確認が開いているときはそちらのフォーカスを奪わない
      const active = document.activeElement;
      if (!active || active === document.body || box.current?.contains(active)) before?.focus?.();
    };
  }, [done]);
  return (
    <div className="ad-confirm" style={s.modal} data-xr-surface="ad-confirm" data-xr-layout="dialog" data-xr-min-width="512" data-xr-title={t('mergeAdLab')} onClick={() => done(false)}>
      <div ref={box} className="ad-confirm-box" style={s.modalBox} role="alertdialog" aria-modal="true" aria-label={message} onClick={(e) => e.stopPropagation()}>
        <p className="ad-confirm-message">{message}</p>
        <div className="ad-confirm-actions">
          <button ref={cancel} type="button" style={s.btn} onClick={() => done(false)}>{t('ui338')}</button>
          <button type="button" style={s.btnDanger} onClick={() => done(true)}>{t('adConfirmOk')}</button>
        </div>
      </div>
    </div>
  );
}

/** window.confirm の代わり。XR でも出せるよう body 直下へ描く。開いたままもう一度呼ぶと前の確認は取り消し扱いになる */
export function confirmAd(message: string): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  current?.settle(false);
  return new Promise<boolean>((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    let settled = false;
    const open: Open = {
      root, host,
      settle: (ok) => {
        if (settled) return;
        settled = true;
        if (current === open) current = null;
        resolve(ok);
        // 描画中に同期 unmount すると React が警告するため、イベントの外へ回す
        queueMicrotask(() => { root.unmount(); host.remove(); });
      },
    };
    current = open;
    root.render(<Dialog message={message} done={open.settle} />);
  });
}
