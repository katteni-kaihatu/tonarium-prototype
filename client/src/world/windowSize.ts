/** カンタンモードの前面ウィンドウの大きさ。fill は縦横比を無視して領域いっぱいに広げる */
export function simpleWindowSize({ region, bar, aspect, fill }: {
  region: { w: number; h: number }; bar: number; aspect?: number; fill: boolean;
}): { width: number; height: number | undefined } {
  if (fill) return { width: region.w, height: region.h };
  if (aspect) {
    const w = Math.min(region.w, (region.h - bar) * aspect);
    return { width: w, height: w / aspect + bar };
  }
  return { width: Math.min(region.w, 420), height: undefined };
}

/** スマホで AD が前面のときだけ、領域いっぱいに出す */
export function shouldFillWindow({ phone, compact, isAd }: { phone: boolean; compact: boolean; isAd: boolean }): boolean {
  return phone && !compact && isAd;
}
