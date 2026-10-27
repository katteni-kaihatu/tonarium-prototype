import { useRef, useState } from 'react';
import { FANTASY_CANON_FACTS, FANTASY_TERMS } from '../../../shared/fantasy-lore.ts';
import { useLocale } from '../locale.ts';

export function LoreBook() {
  const [locale] = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState('world');
  const [query, setQuery] = useState('');
  const t = {
    ko: { title:'세계관 설정집', close:'닫기', note:'여기에 등록된 내용이 공식 설정입니다. NPC마다 알고 있거나 공개할 수 있는 범위는 다릅니다.', search:'설정과 용어 검색', world:'세계의 기초', place:'지역', race:'종족', job:'직업', item:'물건', terms:'공식 용어', facts:'확정된 설정', empty:'일치하는 항목이 없습니다.' },
    en: { title:'The World Guide', close:'Close', note:'These are the canonical setting details. Each NPC has a different scope of knowledge and disclosure.', search:'Search the guide', world:'The world', place:'Places', race:'Peoples', job:'Professions', item:'Items', terms:'Canonical terms', facts:'Established facts', empty:'No matching entries.' },
    ja: { title:'世界の設定集', close:'閉じる', note:'ここに登録された内容が公式設定です。NPC ごとに知識と公開できる範囲が異なります。', search:'設定・用語を検索', world:'世界の基礎', place:'地域', race:'種族', job:'職業', item:'品物', terms:'公式用語', facts:'確定した設定', empty:'一致する項目がありません。' },
  }[locale];
  const terms = FANTASY_TERMS.filter((term) => term.category === category && `${Object.values(term.names).join(' ')} ${term.summary[locale]}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <button className="npc-lore-open" onClick={() => dialog.current?.showModal()}>{t.title}</button>
    <dialog ref={dialog} className="npc-lore-dialog" lang={locale} aria-label={t.title}>
      <header><div><span>THE LONG JOURNEY · CANON</span><h2>{t.title}</h2></div><button onClick={() => dialog.current?.close()}>{t.close} ×</button></header>
      <div className="npc-lore-content"><p>{t.note}</p><nav aria-label={t.title}>{(['world','place','race','job','item'] as const).map((key) => <button key={key} aria-pressed={category===key} onClick={() => setCategory(key)}>{t[key]}</button>)}</nav><input aria-label={t.search} placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)}/>
        {category==='world'&&!query&&<section><h3>{t.facts}</h3>{FANTASY_CANON_FACTS.map((fact) => <p className="npc-lore-fact" key={fact.id}>{fact.text[locale]}</p>)}</section>}
        <h3>{t.terms} · {terms.length}</h3>{terms.length===0&&<p>{t.empty}</p>}<dl>{terms.map((term) => <div key={`${term.category}-${term.id}`}><dt>{term.names[locale]}<small>{term.names.en} · {term.names.ja}</small></dt><dd>{term.summary[locale]}</dd></div>)}</dl>
      </div>
    </dialog>
  </>;
}
