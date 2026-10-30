import { t as tr } from '../i18n/index.ts';

/** ボット申告をしている人は、AI や自動プログラムだと分かるよう名前の横に印を付ける */
export function BotMark({ bot }: { bot: boolean }) {
  return bot ? <span className="botmark">{tr('authBotMark')}</span> : null;
}
