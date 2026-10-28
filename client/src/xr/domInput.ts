import { replaceSelection } from './input.ts';

export type TextField = HTMLInputElement | HTMLTextAreaElement;
export function writeField(field: TextField, text: string, backspace = false) {
  if (!field.isConnected || field.disabled || field.readOnly) return;
  let start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  if (backspace && start === end) start -= Array.from(field.value.slice(0, start)).at(-1)?.length ?? 0;
  const next = replaceSelection(field.value, start, end, backspace ? '' : text, field.maxLength);
  // React の値追跡を更新せずに DOM の setter を呼び、通常の入力イベントで状態へ反映する。
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, next.value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  try { field.setSelectionRange(next.cursor, next.cursor); } catch { /* 数値・日付欄には選択範囲がない */ }
}

export class TerminalPointer {
  root: HTMLElement | null = null;
  private down: Element | null = null;
  private hover: Element | null = null;
  private x = 0;
  private y = 0;
  private start = [0, 0];
  button = 0;
  move(x: number, y: number) {
    this.x = x; this.y = y;
    const hit = this.hit(x, y);
    if (hit !== this.hover) {
      this.hover?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: hit }));
      hit?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: this.hover }));
      this.hover = hit;
    }
    this.emit(this.down ?? hit, 'pointermove');
  }
  press() {
    this.down = this.hit(this.x, this.y);
    this.start = [this.x, this.y];
    this.emit(this.down, 'pointerdown');
    this.emit(this.down, 'mousedown');
  }
  release(cancel = false) {
    if (cancel) { this.hover?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); this.hover = null; }
    const target = this.down;
    if (!target) return;
    this.down = null;
    this.emit(target, cancel ? 'pointercancel' : 'pointerup');
    this.emit(target, 'mouseup');
    if (!cancel && this.button === 0 && this.hit(this.x, this.y) === target && Math.hypot(this.x - this.start[0], this.y - this.start[1]) < 8) {
      if (target instanceof HTMLInputElement && target.type === 'range') {
        const r = target.getBoundingClientRect();
        const min = Number(target.min || 0), max = Number(target.max || 100), step = Number(target.step || 1);
        const v = min + Math.max(0, Math.min(1, (this.x - r.left) / r.width)) * (max - min);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, String(Math.max(min, Math.min(max, min + Math.round((v - min) / (step || 1)) * (step || 1)))));
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (target instanceof HTMLElement) {
        target.focus();
        this.emit(target, 'click');
      } else this.emit(target, 'click');
    }
  }
  scroll(dy: number, dx = 0) {
    const target = this.hit(this.x, this.y);
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: this.x, clientY: this.y, deltaY: dy, deltaX: dx });
    if (!target?.dispatchEvent(event)) return;
    for (let el: Element | null = target; el; el = el.parentElement) {
      const style = getComputedStyle(el), top = el.scrollTop, left = el.scrollLeft;
      if (/auto|scroll/.test(style.overflowY)) el.scrollTop += dy;
      if (/auto|scroll/.test(style.overflowX)) el.scrollLeft += dx;
      dy -= el.scrollTop - top; dx -= el.scrollLeft - left;
      if (el === this.root || (!dy && !dx)) break;
    }
  }
  private emit(target: Element | null, type: string) {
    const init = { bubbles: true, cancelable: true, clientX: this.x, clientY: this.y, button: this.button, buttons: this.down ? this.button === 1 ? 4 : 1 : 0, pointerId: 704, pointerType: 'mouse', isPrimary: true };
    target?.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, init) : new MouseEvent(type, init));
  }
  private hit(x: number, y: number) {
    const root = this.root;
    if (!root) return document.elementFromPoint(x, y);
    if (!root.isConnected) return null;
    const { pointerEvents } = root.style;
    root.style.pointerEvents = 'auto';
    try {
      const visibleHit = document.elementsFromPoint(x, y).find(hit => root.contains(hit));
      if (visibleHit) return visibleHit;
      const contains = (el: Element) => {
        const r = el.getBoundingClientRect(); return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
      };
      // VR の DOM は画面外へ広がるため、viewport 外でも同じ矩形と祖先のクリップで探す。
      return [...root.querySelectorAll('*')].reverse().find(el => {
        const style = getComputedStyle(el);
        if (style.pointerEvents === 'none' || style.display === 'none' || style.visibility === 'hidden' || !contains(el)) return false;
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          const s = getComputedStyle(parent), r = parent.getBoundingClientRect();
          if (parent === root || /auto|scroll|hidden|clip/.test(s.overflowX + s.overflowY)) {
            if ((/auto|scroll|hidden|clip/.test(s.overflowX) || parent === root) && (x < r.left || x >= r.right)) return false;
            if ((/auto|scroll|hidden|clip/.test(s.overflowY) || parent === root) && (y < r.top || y >= r.bottom)) return false;
          }
          if (parent === root) break;
        }
        return true;
      }) ?? (contains(root) ? root : null);
    } finally { root.style.pointerEvents = pointerEvents; }
  }
}
