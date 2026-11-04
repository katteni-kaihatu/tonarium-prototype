import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactionChips } from './ReactionChips.tsx';
import { getLanguage, setLanguage, t } from '../i18n/core.ts';
import { REACTIONS } from '../../../shared/timeline.ts';

test('shared reaction chips expose counts, selection and localized add/cancel labels', () => {
  const previous = getLanguage(), [first, second] = REACTIONS;
  try {
    for (const language of ['ja', 'en', 'ko'] as const) {
      setLanguage(language);
      const html = renderToStaticMarkup(<ReactionChips self="a" reactions={{ [first]: ['a', 'b'], [second]: ['b'] }} react={() => {}} />);
      assert.ok(html.includes('aria-pressed="true"'));
      assert.ok(html.includes('aria-pressed="false"'));
      assert.ok(html.includes(`<b>2</b>`));
      assert.ok(html.includes(`<b>1</b>`));
      assert.ok(html.includes(`aria-label="${t('reactionRemove', first)}"`));
      assert.ok(html.includes(`aria-label="${t('reactionAdd', second)}"`));
    }
  } finally { setLanguage(previous); }
});
