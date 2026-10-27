interface Anchor { scrollIntoView(options: ScrollIntoViewOptions): unknown }
interface ScrollPort { scrollHeight: number; scrollTo(options: ScrollToOptions): unknown }

// ブラウザが Promise を返しても React の effect の戻り値には渡さない。
export function scrollChatAnchor(anchor: Anchor | null): void {
  anchor?.scrollIntoView({ block: 'nearest' });
}

export function scrollChatBottom(port: ScrollPort | null): void {
  port?.scrollTo({ top: port.scrollHeight, behavior: 'smooth' });
}
