import type { ReactNode, Ref } from 'react';
import { Icon } from '../world/Icon.tsx';
import './market.css';

export function ItemDetail({ name, genre, creator, description, visual, tags, social, children, usage, onBack, headingRef }: {
  name: string; genre: string; creator: string; description: string;
  visual: ReactNode; tags: ReactNode; social?: ReactNode; children?: ReactNode;
  usage: ReactNode; onBack: () => void; headingRef?: Ref<HTMLHeadingElement>;
}) {
  return <>
    <button className="ib market-back" onClick={onBack}><Icon name="left" />一覧に戻る</button>
    <div className="market-detail">
      <div>{visual}</div>
      <div className="market-detail-copy">
        <span className="market-category">{genre}</span>
        <h2 ref={headingRef} tabIndex={-1}>{name}</h2><span className="market-creator">制作：{creator}</span>
        <p>{description}</p>
        {social}
        <div className="market-tags">{tags}</div>
        {children}
      </div>
    </div>
    <div className="market-about"><h3>このコンテンツの使い方</h3><p>{usage}</p></div>
  </>;
}
