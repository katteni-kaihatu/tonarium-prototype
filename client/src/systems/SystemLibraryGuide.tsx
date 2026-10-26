import { Fragment, type ReactNode } from 'react';
import { t, useLanguage } from '../i18n/index.ts';
import type { systemGuideLocales } from './locales/guide.ts';

function GuideText({ message, values = [] }: { message: keyof typeof systemGuideLocales.ja; values?: ReactNode[] }) {
  return <>{t(message).split(/(\{\d+\})/).map((part, index) => {
    const match = /^\{(\d+)\}$/.exec(part);
    return <Fragment key={index}>{match ? values[Number(match[1])] ?? part : part}</Fragment>;
  })}</>;
}

const timerExample = `import { createSystemMap } from './shared/system-map.ts';

export const myMap = createSystemMap('my-map')
  .object({
    id: 'start-switch', capabilities: ['interact'],
    position: [-2, 0, -2],
  })
  .item({
    id: 'clock-note', itemId: 'note', itemMode: 'system',
    capabilities: ['text'], position: [0, 0, -2],
  })
  .system({
    instanceId: 'start-button', systemId: 'button',
    bindings: { target: ['start-switch'] }, config: {},
  })
  .system({
    instanceId: 'countdown', systemId: 'timer',
    bindings: { display: ['clock-note'] }, config: { duration: 30 },
  })
  .connect({
    from: 'start-button', output: 'pressed',
    to: 'countdown', input: 'start',
  })
  .build();`;

export function SystemLibraryGuide() {
  useLanguage();
  return <section className="system-catalog-help" aria-label={t('ssGuideLabel')}>
    <details className="system-catalog-item"><summary><strong>{t('ssGuideUsageTitle')}</strong></summary><div className="system-catalog-detail">
      <p>{t('ssGuideUsageIntro')}</p>
      <ol>
        <li>{t('ssGuideFindSystem')}</li>
        <li><GuideText message="ssGuideCreateObjects" values={[<code>.item(...)</code>, <code>id</code>]} /></li>
        <li><GuideText message="ssGuideBindSystem" values={[<code>.system(...)</code>, <code>systemId</code>, <code>instanceId</code>]} /></li>
        <li><GuideText message="ssGuideBindTargets" values={[<code>bindings</code>, <code>target</code>, <code>display</code>, <code>seat</code>]} /></li>
        <li><GuideText message="ssGuideConnectEvents" values={[<code>.connect(...)</code>, <code>pressed</code>, <code>start</code>]} /></li>
        <li><GuideText message="ssGuideRegisterMap" values={[<strong>{t('ssGuideCopyExample')}</strong>]} /></li>
      </ol>
      <h3>{t('ssGuideTimerTitle')}</h3>
      <p><GuideText message="ssGuideTimerSave" values={[<code>my-map.ts</code>]} /></p>
      <pre>{timerExample}</pre>
      <p><GuideText message="ssGuideRegisterCodeMap" values={[<code>server/system-maps.ts</code>, <code>systemMaps</code>]} /></p>
      <pre>{`import { myMap } from '../my-map.ts';

systemMaps.set(myMap.id, myMap);`}</pre>
      <p><GuideText message="ssGuideLoadCodeMap" values={[<code>client/src/systems/api.ts</code>, <code>loadSystemMap('my-map')</code>, <code>npm run dev:systems</code>]} /></p>
      <h3>{t('ssGuideConnectionsTitle')}</h3>
      <ul>
        <li><GuideText message="ssGuideTimerBehavior" values={[<code>duration</code>, <code>pause</code>, <code>reset</code>, <code>00:00</code>, <code>display</code>]} /></li>
        <li><GuideText message="ssGuideChairBehavior" values={[<code>pressed</code>, <code>sit</code>, <code>{`mapping: { user: 'user' }`}</code>, <code>stand</code>]} /></li>
        <li><GuideText message="ssGuideItemBehavior" values={[<code>itemId</code>, <code>.item(...)</code>, <code>itemMode: 'system'</code>, <code>capabilities</code>]} /></li>
        <li><GuideText message="ssGuideItemConstraints" values={[<code>0</code>, <strong>{t('ssGuideItemSection')}</strong>]} /></li>
      </ul>
      <p>{t('ssGuideUpdateBehavior')}</p>
    </div></details>
    <details className="system-catalog-item"><summary><strong>{t('ssGuideRegisterTitle')}</strong></summary><div className="system-catalog-detail">
      <p><GuideText message="ssGuideRegistrationIntro" values={[<strong>{t('ssGuideRegistrationFlow')}</strong>]} /></p>
      <h3>{t('ssGuideScaffoldTitle')}</h3>
      <p>{t('ssGuideScaffoldIntro')}</p>
      <pre>{`npm ci
npm run systems -- init my-system .`}</pre>
      <p><GuideText message="ssGuideScaffoldFile" values={[<code>shared-systems/my-system/1.0.0/system.json</code>]} /></p>
      <h3>{t('ssGuideFieldsTitle')}</h3>
      <ul>
        <li><GuideText message="ssGuideFieldSchema" values={[<code>schema</code>, <code>sdk</code>]} /></li>
        <li><GuideText message="ssGuideFieldIdentity" values={[<code>id</code>, <code>version</code>]} /></li>
        <li><GuideText message="ssGuideFieldMetadata" values={[<code>title</code>, <code>description</code>, <code>license</code>, <code>credits</code>]} /></li>
        <li><GuideText message="ssGuideFieldTargets" values={[<code>targets</code>]} /></li>
        <li><GuideText message="ssGuideFieldValues" values={[<code>config</code>, <code>state</code>]} /></li>
        <li><GuideText message="ssGuideFieldHandlers" values={[<code>inputs</code>, <code>outputs</code>, <code>handlers</code>, <code>interaction</code>]} /></li>
      </ul>
      <p><GuideText message="ssGuideContentTranslation" values={[<code>content-locales/metadata.json</code>]} /></p>
      <p><GuideText message="ssGuideBuiltinRefs" values={[<code>shared-systems/button/</code>, <code>timer/</code>, <code>chair/</code>, <code>shared/system-types.ts</code>]} /></p>
      <h3>{t('ssGuideValidateTitle')}</h3>
      <pre>{`npm run systems -- validate .
npm run test:systems
npm run test:systems-playtest`}</pre>
      <p><GuideText message="ssGuideTestsInstructions" values={[<code>changelog/YYYY-MM-DD-my-system.json</code>, <code>date</code>, <code>title</code>, <code>items</code>, <code>npm run check:completion</code>]} /></p>
      <p>{t('ssGuideSubmissionText')}</p>
      <h3>{t('ssGuideDeployTitle')}</h3>
      <p><GuideText message="ssGuideDeployInstructions" values={[<strong>{t('ssGuideRefreshList')}</strong>]} /></p>
      <p><GuideText message="ssGuideVersionRules" values={[<code>migrations</code>]} /></p>
    </div></details>
  </section>;
}
