export function panelLayout(root: HTMLElement) {
  const declared = Number(root.dataset.xrMinWidth);
  const rules: [string, number][] = [
    ['.hoverlay', 480], ['.nearlist,.xr-wrist', 360], ['.noticelog', 400],
    ['.popover.picker', 572], ['.worldbadge,.popover', 420], ['.dock,.xr-toolbar', 480],
    ['.xr-keyboard,.xr-command-panel', 600],
    ['.modalbg:has(.modal)', 588], ['.modalbg:has(.profilecard)', 448], ['.modalbg:has(.confirm)', 360],
    ['.survivor-choice-overlay', 788], ['.modalbg,.lightbox', 480],
    ['.noteeditor,.xr-options', 360],
    ['.survivor-panel', 680],
  ];
  const minWidth = Number.isFinite(declared) && declared >= 240 ? declared : rules.find(([selector]) => root.matches(selector))?.[1] ?? 480;
  return { minWidth, width: minWidth, height: 680 };
}
export function layoutSize(width: number, height: number, minWidth: number) {
  return { width: Math.max(minWidth, Math.min(2400, Number.isFinite(width) ? width : minWidth)), height: Math.max(240, Math.min(1800, Number.isFinite(height) ? height : 680)) };
}
export function uvToDOM(root: HTMLElement, uv: { x: number; y: number }) {
  const r = root.getBoundingClientRect();
  return { x: r.left + uv.x * r.width, y: r.top + (1 - uv.y) * r.height };
}
