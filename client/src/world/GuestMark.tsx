import { t as tr } from '../i18n/index.ts';

/** ゲストは同じ名前でもログインした人と見分けられるよう、名前の横に印を付ける */
export function GuestMark({ guest }: { guest: boolean }) {
  return guest ? <span className="guestmark">{tr('authGuestMark')}</span> : null;
}
