import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { NpcLocale } from '../../../shared/npc.ts';

export function FantasyLastDawnConfirmation({ locale, onCancel, onConfirm }: { locale: NpcLocale; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null);
  const copy = {
    ko: { title: '마지막 새벽을 사용하시겠습니까?', warning: '시전자는 즉시 빈사(실신)에 빠집니다. 이 전투에서 승리하면 이 캐릭터는 반드시 영구 사망합니다. 구조·회복·기적으로도 이 대가를 되돌릴 수 없습니다.', cancel: '사용하지 않기', confirm: '영구 사망을 감수하고 사용' },
    en: { title: 'Cast the Last Dawn?', warning: 'The caster immediately collapses. Winning this battle permanently kills this character. Rescue, healing and miracles cannot undo this price.', cancel: 'Do not cast', confirm: 'Accept permanent death and cast' },
    ja: { title: '最後の夜明けを使いますか？', warning: '術者は即座に瀕死（失神）になります。この戦闘に勝利すると、この人物は必ず永久に死亡します。救助・回復・奇跡でも、この代償は覆せません。', cancel: '使わない', confirm: '永久死亡を受け入れて使う' },
  }[locale];
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement;
    element?.showModal(); cancel.current?.focus();
    return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="fr-last-dawn-confirm" aria-labelledby="fr-last-dawn-confirm-title" aria-describedby="fr-last-dawn-confirm-warning" onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id="fr-last-dawn-confirm-title">{copy.title}</h2>
    <p id="fr-last-dawn-confirm-warning">{copy.warning}</p>
    <div><button ref={cancel} type="button" className="fr-btn" onClick={onCancel}>{copy.cancel}</button><button type="button" className="fr-btn fr-last-dawn-sacrifice" onClick={onConfirm}>{copy.confirm}</button></div>
  </dialog>, document.body);
}
