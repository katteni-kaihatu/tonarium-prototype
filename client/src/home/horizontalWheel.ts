export function attachHorizontalWheel(row: HTMLDivElement) {
  let restoreTimer: ReturnType<typeof setTimeout> | undefined;
  let savedSnap: { value: string; priority: string } | undefined;
  let remainder = 0;
  let direction = 0;
  const restoreSnap = () => {
    clearTimeout(restoreTimer);
    restoreTimer = undefined;
    remainder = 0;
    direction = 0;
    if (!savedSnap) return;
    if (savedSnap.value) row.style.setProperty('scroll-snap-type', savedSnap.value, savedSnap.priority);
    else row.style.removeProperty('scroll-snap-type');
    savedSnap = undefined;
  };
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.shiftKey || event.defaultPrevented || !event.cancelable || event.deltaX !== 0 || event.deltaY === 0) {
      restoreSnap();
      return;
    }
    const max = row.scrollWidth - row.clientWidth;
    const left = Math.max(0, Math.min(max, row.scrollLeft));
    // scrollWidth/clientWidth は整数だが scrollLeft は小数になる。
    if (max <= 1 || (event.deltaY > 0 ? max - left <= 1 : left <= 1)) {
      restoreSnap();
      return;
    }
    let delta = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      const style = getComputedStyle(row);
      let lineHeight = Number.parseFloat(style.lineHeight);
      if (!Number.isFinite(lineHeight)) {
        const probe = document.createElement('span');
        probe.textContent = 'M';
        probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;font:inherit;line-height:inherit';
        row.append(probe);
        lineHeight = probe.getBoundingClientRect().height;
        probe.remove();
      }
      delta *= lineHeight;
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      delta *= row.clientWidth;
    }
    if (!Number.isFinite(delta) || delta === 0) return;
    if (direction !== Math.sign(delta)) remainder = 0;
    direction = Math.sign(delta);
    event.preventDefault();
    if (!savedSnap) {
      savedSnap = { value: row.style.getPropertyValue('scroll-snap-type'), priority: row.style.getPropertyPriority('scroll-snap-type') };
      // proximity の再スナップで小さい連続入力が同じカードに戻るのを防ぐ。
      row.style.setProperty('scroll-snap-type', 'none');
    }
    const target = Math.max(0, Math.min(max, left + delta + remainder));
    row.scrollLeft = target;
    // ブラウザが移動先を丸めても、連続する小数の入力を失わない。
    remainder = target - row.scrollLeft;
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(restoreSnap, 200);
  };
  row.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    row.removeEventListener('wheel', onWheel);
    restoreSnap();
  };
}
