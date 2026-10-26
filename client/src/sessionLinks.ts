import { copySessionLink } from '../../shared/session-links.ts';
import { showToast } from './store.ts';
import { msg } from './i18n/core.ts';

export function copySessionUrl(id: string) {
  return copySessionLink(id, location.origin, (text) => navigator.clipboard.writeText(text),
    (success) => showToast(msg(success ? 'sessionLinkCopied' : 'sessionLinkFailed')));
}
