import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getLocale } from '../locale.ts';

type Props = { menu: string; children: ReactNode; onRetry?: () => void };
export class FantasyMenuBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[fantasy-menu]', this.props.menu, error, info.componentStack); }
  componentDidUpdate(previous: Readonly<Props>) {
    if (previous.menu !== this.props.menu && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const t = {
      ko: { text: '이 메뉴를 표시하지 못했습니다. 다른 메뉴로 이동하거나 다시 열어 주세요.', retry: '다시 열기' },
      en: { text: 'This menu could not be displayed. Open another menu or try again.', retry: 'Try again' },
      ja: { text: 'このメニューを表示できませんでした。別のメニューを開くか、再度お試しください。', retry: '再度開く' },
    }[getLocale()];
    return <div className="fr-detail-content" role="alert"><p>{t.text}</p><button className="fr-btn" onClick={() => { this.props.onRetry?.(); this.setState({ failed: false }); }}>{t.retry}</button></div>;
  }
}
