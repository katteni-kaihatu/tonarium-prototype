/** PC 用レイアウト（5 枚のカードと 1 行の次元表）が収まる幅。これより狭いときは全体を縮める。 */
export const AD_PANEL_DESIGN_WIDTH = 900;
/** これ以上縮めると文字とボタンが小さすぎるので、狭い画面ではスマホ用の並びに任せる。 */
export const AD_PANEL_MIN_SCALE = 0.65;

export function adPanelScale(width: number): number {
  if (!(width > 0) || width >= AD_PANEL_DESIGN_WIDTH) return 1;
  const scale = width / AD_PANEL_DESIGN_WIDTH;
  return scale >= AD_PANEL_MIN_SCALE ? scale : 1;
}
