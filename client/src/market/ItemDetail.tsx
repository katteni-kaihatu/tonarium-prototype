import { t as tr } from '../i18n/index.ts';
import type { ReactNode, Ref } from 'react';
import { Icon } from '../world/Icon.tsx';
import './market.css';

export function ItemDetail({ name, genre, creator, description, visual, tags, social, children, usage, onBack, headingRef }: {
  name: string; genre: string; creator: string; description: string;
  visual: ReactNode; tags: ReactNode; social?: ReactNode; children?: ReactNode;
  usage: ReactNode; onBack: () => void; headingRef?: Ref<HTMLHeadingElement>;
}) {
  return <>
    <button className="ib market-back" onClick={onBack}><Icon name="left" />{tr("ui370")}</button>
    <div className="market-detail">
      <div>{visual}</div>
      <div className="market-detail-copy">
        <span className="market-category">{genre}</span>
        <h2 ref={headingRef} tabIndex={-1}>{name}</h2><span className="market-creator">{tr("ui371")}{creator}</span>
        <p>{description}</p>
        {social}
        <div className="market-tags">{tags}</div>
        {children}
      </div>
    </div>
    <div className="market-about"><h3>{tr("ui372")}</h3><p>{usage}</p></div>
  </>;
}
