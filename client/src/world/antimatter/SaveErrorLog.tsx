import { formatSaveFailures, type AdSaveFailure } from '../../ad/saveFailure.ts';
import { msg, t, type UiMessage } from '../../i18n/index.ts';
import { s } from './styles.ts';

export function SaveErrorLog({ entries, notice }: { entries: AdSaveFailure[]; notice: (message: UiMessage) => void }) {
  const text = formatSaveFailures(entries);
  return (
    <div className="adlab-error-log">
      <p className="adlab-error-help">{t('adSaveErrorHelp')}</p>
      <div>
        <button type="button" style={s.btn} onClick={() => {
          const done = navigator.clipboard?.writeText(text);
          if (!done) { notice(msg('adSaveErrorCopyFailed')); return; }
          void done.then(() => notice(msg('adSaveErrorCopied')), () => notice(msg('adSaveErrorCopyFailed')));
        }}>{t('adSaveErrorCopy')}</button>
      </div>
      <pre className="adlab-error-text">{text}</pre>
    </div>
  );
}
