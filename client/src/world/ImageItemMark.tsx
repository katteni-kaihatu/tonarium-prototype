import { useEffect, useId, useState } from 'react';
import type { Item } from '../../../shared/items.ts';
import { ItemMark, Popover } from './common.tsx';

export function ImageItemMark({ item, size, label }: {
  item: Extract<Item, { kind: 'image' }>; size: number; label: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [imageSize, setImageSize] = useState({ width: item.w, height: item.h });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const tooltipId = useId();
  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    const resize = () => setViewport({
      width: window.visualViewport?.width ?? window.innerWidth,
      height: window.visualViewport?.height ?? window.innerHeight,
    });
    resize();
    // スクロールで行が移動したら古い位置にプレビューを残さない。
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
    };
  }, [anchor]);
  const fail = () => { setFailed(true); setAnchor(null); };
  const scale = Math.min(640 / imageSize.width, 640 / imageSize.height,
    Math.max(0, viewport.width - 48) / imageSize.width, Math.max(0, viewport.height - 48) / imageSize.height);
  if (failed) return <ItemMark item={item} size={size} />;
  return <span
    className="image-item-mark"
    style={{ width: size, height: size, borderRadius: size * 0.3 }}
    onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
    onMouseLeave={() => setAnchor(null)}
    aria-describedby={anchor && loaded ? tooltipId : undefined}
  >
    <ItemMark item={item} size={size} />
    <img className="image-item-thumbnail" src={item.url} alt="" onLoad={(e) => {
      setImageSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight });
      setLoaded(true);
    }} onError={fail} />
    {anchor && loaded && viewport.width > 0 && <Popover anchor={anchor} onClose={() => setAnchor(null)} className="image-item-preview">
      <img id={tooltipId} role="tooltip" src={item.url} alt={label} onError={fail}
        style={{ width: imageSize.width * scale, height: imageSize.height * scale }} />
    </Popover>}
  </span>;
}
