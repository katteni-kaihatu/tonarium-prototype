import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';
import type { CanvasTexture } from 'three';

type HTMLMap = CanvasTexture & { update(): void; observer: MutationObserver; _scheduleUpdate: EventListener };

// HTMLMesh の簡易 HTML 描画を使い、ゲームの Canvas と同じ DOM を操作する。
export class TerminalSurface {
  constructor(readonly root: HTMLElement = document.body, readonly width = 1.25) {}
  mesh: HTMLMesh | null = null;
  private vectors = new WeakMap<SVGSVGElement, { source: string; image: HTMLImageElement }>();
  private imgOrigins = new WeakMap<HTMLImageElement, { src: string; crossOrigin: boolean }>();
  /** img が別オリジンか（従来は refresh のたびに new URL で判定していた。origin は URL 文字列だけで決まるためキャッシュできる） */
  private isCrossOriginImg(el: HTMLImageElement): boolean {
    const src = el.currentSrc || el.src;
    const cached = this.imgOrigins.get(el);
    if (cached && cached.src === src) return cached.crossOrigin;
    const crossOrigin = new URL(src, location.href).origin !== location.origin && !el.src.startsWith('data:') && !el.src.startsWith('blob:');
    this.imgOrigins.set(el, { src, crossOrigin });
    return crossOrigin;
  }
  refresh() {
    const hidden: [HTMLElement, string][] = [];
    const hide = (el: HTMLElement) => { hidden.push([el, el.style.display]); el.style.display = 'none'; };
    this.root.querySelectorAll<HTMLElement>('.view3d, script, style, link').forEach(hide);
    this.root.querySelectorAll<HTMLElement>('*').forEach(el => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') hide(el);
    });
    this.root.querySelectorAll<HTMLImageElement>('img').forEach(el => {
      if (!el.complete || !el.naturalWidth || this.isCrossOriginImg(el)) hide(el);
    });
    try {
      if (!this.mesh) {
        this.mesh = new HTMLMesh(this.root);
        const map = this.mesh.material.map as HTMLMap;
        map.observer.disconnect();
        this.root.removeEventListener('input', map._scheduleUpdate);
        this.root.removeEventListener('change', map._scheduleUpdate);
        this.mesh.userData.noRay = true;
        this.mesh.material.depthTest = false;
        this.mesh.material.depthWrite = false;
        this.mesh.renderOrder = 1000;
      } else (this.mesh.material.map as HTMLMap).update();
      const texture = this.mesh.material.map as HTMLMap;
      const canvas = texture.image as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const offset = this.root.getBoundingClientRect();
      const label = (el: Element, text: string) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return;
        ctx.save();
        ctx.beginPath(); ctx.rect(r.x - offset.x, r.y - offset.y, r.width, r.height); ctx.clip();
        ctx.fillStyle = getComputedStyle(el).backgroundColor;
        ctx.fillRect(r.x - offset.x, r.y - offset.y, r.width, r.height);
        ctx.fillStyle = getComputedStyle(el).color;
        const size = parseFloat(getComputedStyle(el).fontSize) || 14;
        ctx.font = `${size}px sans-serif`;
        text.split('\n').forEach((line, i) => ctx.fillText(line, r.x - offset.x + 4, r.y - offset.y + size + 4 + i * (size + 4), r.width - 8));
        ctx.restore();
      };
      this.root.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(el => label(el, el.value || el.placeholder));
      this.root.querySelectorAll<HTMLSelectElement>('select').forEach(el => label(el, el.selectedOptions[0]?.text ?? ''));
      this.root.querySelectorAll<HTMLInputElement>('input[type=date],input[type=time],input[type=datetime-local]').forEach(el => label(el, el.value));
      this.root.querySelectorAll<HTMLElement>('button[aria-label], button[title]').forEach(el => {
        if (!el.innerText.trim()) label(el, el.getAttribute('aria-label') || el.title);
      });
      this.root.querySelectorAll<HTMLVideoElement>('video').forEach(el => {
        if (el.readyState < 2 || (el.currentSrc && new URL(el.currentSrc, location.href).origin !== location.origin && !el.srcObject)) return;
        const r = el.getBoundingClientRect();
        if (r.width && r.height) ctx.drawImage(el, r.x - offset.x, r.y - offset.y, r.width, r.height);
      });
      this.root.querySelectorAll<SVGSVGElement>('svg').forEach(el => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || el.querySelector('image,foreignObject,use')) return;
        const clone = el.cloneNode(true) as SVGSVGElement;
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('width', String(r.width)); clone.setAttribute('height', String(r.height));
        [el, ...el.querySelectorAll('*')].forEach((source, i) => {
          const target = i === 0 ? clone : clone.querySelectorAll('*')[i - 1];
          const style = getComputedStyle(source);
          for (const key of ['fill', 'stroke', 'stroke-width', 'opacity', 'font-size', 'font-family', 'color']) target.setAttribute(key, style.getPropertyValue(key));
        });
        const source = new XMLSerializer().serializeToString(clone);
        let cached = this.vectors.get(el);
        if (cached?.source !== source) {
          const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
          cached = { source, image }; this.vectors.set(el, cached);
        }
        if (cached.image.complete && cached.image.naturalWidth) ctx.drawImage(cached.image, r.x - offset.x, r.y - offset.y, r.width, r.height);
      });
      this.root.querySelectorAll('iframe').forEach(el => label(el, '外部プレーヤー: VR終了後にブラウザで操作'));
      texture.needsUpdate = true;
      const aspect = canvas.width / Math.max(1, canvas.height);
      this.mesh.scale.set(this.width / Math.max(.001, canvas.width * .001), this.width / aspect / Math.max(.001, canvas.height * .001), 1);
    } finally { hidden.reverse().forEach(([el, display]) => { el.style.display = display; }); }
  }
  dispose() { this.mesh?.removeFromParent(); this.mesh?.dispose(); this.mesh = null; this.vectors = new WeakMap(); this.imgOrigins = new WeakMap(); }
}
