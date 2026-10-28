import { sourceText as uiSource } from '../i18n/core.ts';
import { useTranslatedText } from '../TranslatedText.tsx';
import { t as tr, localized } from '../i18n/index.ts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChatMessage } from '../../../shared/protocol.ts';
import { ITEM_INFO } from '../i18n/static.ts';
import { type Item } from '../../../shared/items.ts';
import { localizedVariantInfo } from '../items/metadata.ts';
import { NEAR_RANGE, VOICE_RANGE } from '../../../shared/places.ts';
import { bandOf, type Band, type ListedPlayer } from '../nearby.ts';
import { useStore, set, colorOf, heldHammer } from '../store.ts';
import { iconUrl } from '../icon.ts';
import { useNearby, useNearbyItems } from '../spatial.ts';
import { popoverPosition } from './popoverPosition.ts';

/** アイコンがあれば画像、無ければ頭文字 */
export function Face({ id, name, size = 32, ring }: { id: string; name: string; size?: number; ring?: string }) {
  // オフラインの人は名簿の版を使う
  const icon = useStore((s) => s.users.find((u) => u.id === id)?.icon ?? s.directory[id]?.icon);
  const style: React.CSSProperties = { width: size, height: size, background: colorOf(id), fontSize: size * 0.44, boxShadow: ring };
  if (icon) return <img className="face" style={style} src={iconUrl(id, icon)} alt="" />;
  return <span className="face" style={style}>{name.slice(0, 1)}</span>;
}

export function ItemMark({ item, size = 32, by }: { item: Item; size?: number; by?: { id: string; name: string } }) {
  const info = itemInfo(item);
  return (
    <span
      className="itemmark"
      style={{ width: size, height: size, background: info.tint, color: info.ink, fontSize: info.mark.length > 2 ? size * 0.3 : size * 0.44, borderRadius: size * 0.3 }}
    >
      {info.mark}
      {by && <span className="byface" style={{ background: colorOf(by.id) }}>{by.name.slice(0, 1)}</span>}
    </span>
  );
}

export const Badge3D = () => <span className="b3d" title={tr("ui552")}>3D</span>;

export function Viewers({ keyName, dark = false }: { keyName: string; dark?: boolean }) {
  const viewers = useStore((s) => s.participants).filter((u) => u.viewing.includes(keyName));
  if (!viewers.length) return null;
  const shown = viewers.slice(0, 3);
  return (
    <span className={`viewers ${dark ? 'dark' : ''}`} title={tr("ui553", viewers.map((v) => v.name).join('、'))} aria-label={tr("ui554", viewers.length)}>
      <span className="vlabel">{tr("ui555")}</span>
      {shown.map((v) => <Face key={v.id} id={v.id} name={v.name} size={22} />)}
      {viewers.length > 3 && <span className="vmore">+{viewers.length - 3}</span>}
    </span>
  );
}

export type { Band };
export { bandOf };
export const BANDS: { band: Band; label: string; range: string; dot: string }[] = localized([
  { band: 'near', label: uiSource('ui556'), range: `〜${NEAR_RANGE}m`, dot: '#2E9A64' },
  { band: 'mid', label: uiSource('ui557'), range: `〜${VOICE_RANGE}m`, dot: '#D9A02B' },
  { band: 'far', label: uiSource('ui558'), range: `${VOICE_RANGE}m〜`, dot: '#9A98A2' },
]);

export type PlayerEntry = ListedPlayer;

/** 自分以外を近い順に。ついていっている人は相手の直後にぶら下げる */
export function usePlayers(): PlayerEntry[] {
  return useNearby();
}

/** 近づいている人はオレンジ、離れていく人は水色にぼんやり光らせる */
export const glowStyle = (trend: number) => ({
  '--glow': trend < 0 ? 'rgba(255, 150, 60, .6)' : 'rgba(80, 185, 240, .55)',
  '--glowa': Math.abs(trend),
}) as React.CSSProperties;

export function useItemsNear() {
  return useNearbyItems();
}

/** そのアイテムを開くウィンドウ。無ければ null */
export function windowKeyOf(item: Item, camFeeds: Record<string, number>) {
  if (item.mapPlacement?.mode === 'system') return `item:${item.id}`;
  if (item.kind === 'hammer') return null;
  if (item.kind === 'camera') return item.live && camFeeds[item.id] ? `cam:${item.id}` : null;
  return `item:${item.id}`;
}

export function itemInfo(item: Item) {
  return localizedVariantInfo(item.kind === 'camera' ? item.variant : undefined) ?? ITEM_INFO[item.kind];
}

export const itemLabel = (item: Item, imageCreatorName?: string) =>
  item.kind === 'image' && imageCreatorName?.trim() ? tr('imageItemBy', imageCreatorName.trim())
    : item.kind === 'note' ? (item.text.split('\n')[0].slice(0, 16) || tr("ui559"))
    : item.kind === 'youtube' && item.title ? item.title.slice(0, 24)
    : itemInfo(item).name;

/** 直近 30 秒の発言。上部の顔と 3D の頭の上の吹き出しに出す */
const BUBBLE_MS = 30_000;
const NO_CHAT: ChatMessage[] = [];

export function useLastSaid(id: string) {
  const chat = useStore((s) => (s.session ? s.chats[s.session] ?? NO_CHAT : NO_CHAT));
  const [, tick] = useState(0);
  const last = [...chat].reverse().find((m) => m.from === id && m.text);
  const fresh = last && Date.now() - last.at < BUBBLE_MS;
  const translated = useTranslatedText(fresh ? last.text : '');
  useEffect(() => {
    if (!fresh || !last) return;
    const t = setTimeout(() => tick((n) => n + 1), BUBBLE_MS - (Date.now() - last.at) + 50);
    return () => clearTimeout(t);
  }, [fresh, last]);
  return fresh ? translated?.text ?? last.text : null;
}

export function ChatImage({ src }: { src?: string }) {
  if (!src) return null;
  return <img className="chatimg" src={src} alt="" onClick={() => set({ lightbox: src })} />;
}

export function Lightbox() {
  const src = useStore((s) => s.lightbox);
  if (!src) return null;
  return (
    <div className="lightbox" onClick={() => set({ lightbox: null })}>
      <img src={src} alt="" />
      <a className="dl" href={src} download="tonarium.jpg" onClick={(e) => e.stopPropagation()}>{tr("ui560")}</a>
    </div>
  );
}

export function HammerCursor() {
  const on = useStore((s) => s.mode === '2d' && !!s.session && !!heldHammer(s));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!on) return;
    const move = (e: MouseEvent) => {
      if (ref.current) ref.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    };
    const down = () => {
      const el = ref.current?.firstElementChild as HTMLElement | null;
      if (!el) return;
      el.classList.remove('swing');
      void el.offsetWidth; // reflow してアニメーションをやり直す
      el.classList.add('swing');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mousedown', down);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mousedown', down); };
  }, [on]);
  if (!on) return null;
  return <div ref={ref} className="hammercursor"><div>🔨</div></div>;
}

/** ボタンの位置に合わせて出すポップオーバー。外側クリックで閉じる */
export function Popover({ anchor, onClose, children, side = 'right', className = '' }: {
  anchor: DOMRect; onClose: () => void; children: React.ReactNode; side?: 'right' | 'up' | 'down'; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // 自分の開閉ボタンだけはクリックで切り替え、別のメニューを開いたら閉じる
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      const button = t.closest?.('[data-popanchor]')?.getBoundingClientRect();
      const ownAnchor = button && button.left === anchor.left && button.top === anchor.top;
      if (!ref.current?.contains(t) && !ownAnchor) close.current();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    // 開いたクリック自体で閉じないよう、次のイベントから見る
    const t = setTimeout(() => { window.addEventListener('pointerdown', down); window.addEventListener('keydown', key); });
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key); };
  }, [anchor]);
  // 実際の大きさが分かってから画面内に収める
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const viewport = window.visualViewport;
      const bounds = { left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0, width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight };
      el.style.maxWidth = `${Math.max(0, bounds.width - 24)}px`;
      el.style.maxHeight = `${Math.max(0, bounds.height - 24)}px`;
      setStyle(popoverPosition(anchor, el.getBoundingClientRect(), bounds, side));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [anchor, side]);
  // パネルの backdrop-filter が fixed の基準になって切れてしまうので body に出す
  return createPortal(<div ref={ref} className={`popover ${className}`} style={style}>{children}</div>, document.body);
}
