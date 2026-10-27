import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale } from '../locale.ts';
import { GameLanguageSwitch } from '../LanguageSwitch.tsx';
import { getAiSupportSnapshot, retryAiSupport, setAiSupportEnabled, setAiSupportCooperation, subscribeAiSupport, type AiSupportPhase } from './support.ts';
import type { AiResourceReason } from './resource-policy.ts';
import './ai-support.css';

const PHASE: Record<AiSupportPhase, [string, string, string]> = {
  off: ['꺼짐', 'Off', 'オフ'], preparing: ['준비 중', 'Preparing', '準備中'], ready: ['준비됨', 'Ready', '準備完了'], busy: ['답변 중', 'Answering', '返答中'],
  paused: ['일시 정지', 'Paused', '一時停止'], error: ['다시 시도 필요', 'Retry needed', '再試行が必要'], unsupported: ['기기에서 사용 불가', 'Unavailable on this device', 'この端末では利用不可'],
};
const REASONS: Record<Exclude<AiResourceReason, null>, [string, string, string]> = {
  hidden: ['화면으로 돌아오면 상태를 확인합니다.', 'We will check again when you return.', '画面に戻ったら状態を確認します。'],
  offline: ['인터넷 연결을 기다립니다.', 'Waiting for an internet connection.', 'インターネット接続を待っています。'],
  connection: ['게임 서버 연결을 기다립니다.', 'Waiting for the game server connection.', 'ゲームサーバーへの接続を待っています。'],
  performance: ['기기 부담을 줄이기 위해 서버 AI를 사용합니다. 안정되면 이 기기의 지원을 재개합니다.', 'Using server AI to reduce device load. Device support resumes when stable.', '端末の負荷を減らすためサーバーAIを使います。安定したら端末の支援を再開します。'],
  memory: ['메모리 부담을 줄이기 위해 이 기기의 모델을 해제하고 서버 AI를 사용합니다.', 'The device model is released to reduce memory pressure. Replies use server AI.', 'メモリ負荷を減らすため端末のモデルを解放し、サーバーAIを使います。'],
  unsupported: ['이 기기에서는 서버 AI를 사용합니다.', 'This device uses the server AI.', 'この端末ではサーバーのAIを使います。'],
  'other-tab': ['다른 탭에서 기기의 AI를 사용 중이므로 이 대화는 서버가 처리합니다.', 'Another tab uses device AI, so the server handles this conversation.', '別のタブで端末AIを使用中のため、この会話はサーバーが処理します。'],
  manual: ['반복 준비를 멈추고 서버 AI를 사용합니다. 원하면 다시 시도하세요.', 'Automatic reloads stopped; replies use server AI. Retry when you wish.', '自動の再準備を止めてサーバーAIを使います。必要なら再試行してください。'],
  error: ['준비에 실패했습니다. 서버 AI로 대화할 수 있습니다.', 'Preparation failed. You can still use the server AI.', '準備に失敗しました。サーバーのAIで会話できます。'],
};
function useSupport() { return useSyncExternalStore(subscribeAiSupport, getAiSupportSnapshot, getAiSupportSnapshot); }

export function AiSupportControl() {
  const [locale] = useLocale(), state = useSupport(), [open, setOpen] = useState(false);
  const i = locale === 'ko' ? 0 : locale === 'en' ? 1 : 2;
  const usingServer = state.desired && ['paused', 'error', 'unsupported'].includes(state.phase) && state.reason !== 'offline' && state.reason !== 'connection';
  return <div className="ai-support-control">
    <label className="ai-support-toggle"><input type="checkbox" checked={state.desired} disabled={state.consent === 'unknown'} onChange={event => setAiSupportEnabled(event.target.checked)} />
      <span>{{ ko: 'AI 지원', en: 'AI support', ja: 'AIサポート' }[locale]}</span></label>
    <span className={`ai-support-status ai-support-status-${state.phase}`} role="status">{state.busyKind === 'shared' ? ['다른 모험가 답변 돕는 중', 'Helping another adventurer', 'ほかの冒険者の返答を支援中'][i] : usingServer ? ['서버 AI 사용', 'Using server AI', 'サーバーAIを使用'][i] : PHASE[state.phase][i]}{state.phase === 'preparing' ? ` ${Math.round(state.progress * 100)}%` : ''}</span>
    <button type="button" className="ai-support-settings-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{{ ko: '설정', en: 'Settings', ja: '設定' }[locale]}</button>
    {open && <div className="ai-support-settings">
      <p>{state.reason ? REASONS[state.reason][i] : !state.desired ? state.allowRemote ? { ko: '이 기기에서는 생성하지 않고, 지원 기기나 서버가 답변합니다.', en: 'A helping device or the server answers without generation on this device.', ja: 'この端末では生成せず、支援端末かサーバーが返答します。' }[locale] : { ko: '이 기기의 AI를 사용하지 않고 서버가 답변합니다.', en: 'The server answers without using AI on this device.', ja: 'この端末のAIを使わず、サーバーが返答します。' }[locale] : { ko: '자신의 대화를 이 기기의 AI로 돕습니다. 사용할 수 없을 때는 서버가 답변합니다.', en: 'Help generate your own dialogue on this device. The server answers when it is unavailable.', ja: '自分の会話をこの端末のAIで支援します。使えないときはサーバーが返答します。' }[locale]}</p>
      <label className="ai-support-toggle"><input type="checkbox" checked={state.shareIdle} disabled={state.cooperationConsent === 'unknown'} onChange={event => setAiSupportCooperation(event.target.checked, state.allowRemote)} />
        <span>{{ ko: 'AI 지원이 켜져 있고 대화하지 않을 때 다른 모험가 돕기', en: 'Help others while device AI is on and I am not chatting', ja: '端末AIがオンで会話していない間、ほかの冒険者を支援' }[locale]}</span></label>
      <label className="ai-support-toggle"><input type="checkbox" checked={state.allowRemote} disabled={state.cooperationConsent === 'unknown'} onChange={event => setAiSupportCooperation(state.shareIdle, event.target.checked)} />
        <span>{{ ko: '내 질문을 다른 플레이어 기기에서 처리하도록 허용', en: 'Allow my questions to be processed on another player’s device', ja: '自分の質問をほかのプレイヤーの端末で処理することを許可' }[locale]}</span></label>
      <p className="ai-support-note">{{ ko: '공유한 질문과 필요한 맥락은 처리하는 플레이어 기기에서 볼 수 있습니다. AI 지원을 꺼도 도움받기 허용은 유지됩니다. 공유하지 않으면 서버와 내 기기만 사용합니다.', en: 'Shared questions and required context are visible on the helping player’s device. Turning device AI off keeps your receiving choice. Without sharing, only the server and your own device are used.', ja: '共有した質問と必要な文脈は、支援するプレイヤーの端末から見えます。端末AIをオフにしても受け取りの選択は維持されます。共有しなければサーバーと自分の端末だけを使います。' }[locale]}</p>
      <p className="ai-support-note">{{ ko: '게임 성능을 먼저 살핍니다. 정확한 CPU·GPU 사용률이나 여유 메모리를 측정하지는 않습니다.', en: 'Game performance comes first. Exact CPU/GPU usage or free memory is not measured.', ja: 'ゲームの動作を優先します。CPU・GPU使用率や空きメモリの正確な測定ではありません。' }[locale]}</p>
      <p className="ai-support-note">{{ ko: '다시 켜면 모델을 다시 받을 수 있습니다. 준비 후 내려받은 모델의 저장 캐시는 정리합니다.', en: 'Turning it on again may download the model again. Downloaded model caches are cleared after preparation.', ja: '再びオンにするとモデルを再取得する場合があります。準備後にモデルの保存キャッシュを消去します。' }[locale]}</p>
      {state.desired && ['paused', 'error', 'unsupported'].includes(state.phase) && <button type="button" onClick={retryAiSupport}>{{ ko: '다시 시도', en: 'Retry', ja: '再試行' }[locale]}</button>}
      {state.desired && <button type="button" onClick={() => setAiSupportEnabled(false)}>{{ ko: '지원 끄고 메모리 해제', en: 'Turn off and release memory', ja: 'オフにしてメモリを解放' }[locale]}</button>}
    </div>}
  </div>;
}

export function AiSupportConsent() {
  const [locale] = useLocale(), state = useSupport();
  const modal = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = modal.current;
    if ((state.consent === 'unknown' || state.cooperationConsent === 'unknown') && dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [state.consent, state.cooperationConsent]);
  if (state.consent !== 'unknown' && state.cooperationConsent !== 'unknown') return null;
  return <dialog lang={locale} ref={modal} className="ai-support-consent ai-support-consent-dialog" aria-labelledby="ai-support-consent-title" onCancel={event => { event.preventDefault(); setAiSupportCooperation(false, false); }}>
    <div className="ai-support-consent-language"><GameLanguageSwitch/></div>
    <span className="ai-support-mark" aria-hidden="true">✦</span>
    <h2 id="ai-support-consent-title">{{ ko: '이 기기로 AI 대화를 도울까요?', en: 'Help AI dialogue on this device?', ja: 'この端末でAI会話を支援しますか？' }[locale]}</h2>
    <p>{{ ko: 'AI 지원을 켜면 내 NPC·GM 대화를 먼저 처리하고, 대화하지 않을 때는 같은 월드의 다른 모험가 답변을 도울 수 있습니다.', en: 'Device AI prioritizes your NPC and GM conversations and can help others in the same world while you are not chatting.', ja: '端末AIは自分のNPC・GM会話を優先し、会話していない間は同じワールドの冒険者を支援できます。' }[locale]}</p>
    <p>{{ ko: '서로 돕거나 도움받기를 선택하면 내 질문과 필요한 최소 맥락이 다른 플레이어의 기기로 전달되며, 그 기기에서 볼 수 있습니다. 공유 없이 AI를 켜면 내 기기로 본인 대화만 처리하고, 끄면 서버만 사용합니다. 두 경우 모두 다른 플레이어와 주고받지 않습니다.', en: 'Helping each other or receiving help sends your question and minimal required context to another player’s device, where it can be viewed. Without sharing, AI on handles only your own dialogue on this device; AI off uses only the server. Neither option shares processing with other players.', ja: '相互支援や支援の受け取りを選ぶと、質問と必要最小限の文脈がほかのプレイヤーの端末に送られ、その端末から見えます。共有せずAIをオンにすると自分の端末で自分の会話だけを処理し、オフにするとサーバーだけを使います。どちらもほかのプレイヤーと処理を共有しません。' }[locale]}</p>
    <p className="ai-support-consent-cost">{{ ko: 'AI 지원을 켜고 기기에 여유가 있으면 모델 약 1GB를 받습니다. GPU 메모리 약 2GB 이상이 필요할 수 있으며 기기마다 다릅니다. 도움받기만 선택하면 모델을 받지 않습니다.', en: 'Enabling device AI downloads about 1 GB when resources permit. Around 2 GB or more of GPU memory may be needed; requirements vary. Receiving help alone does not download a model.', ja: '端末AIをオンにし、余裕があれば約1GBのモデルを取得します。GPUメモリが約2GB以上必要な場合があり、端末によって異なります。支援を受け取るだけならモデルは取得しません。' }[locale]}</p>
    <p>{{ ko: '지원을 켜도 기기 여유가 부족하거나 게임이 느려지면 서버가 답변합니다. 설정에서 언제든 끌 수 있으며, 거부해도 서버 AI로 계속 플레이합니다.', en: 'Even with support enabled, the server answers when device resources are limited or the game slows down. You can turn support off anytime; declining still uses server AI.', ja: '支援がオンでも端末の余裕が足りないときやゲームが遅いときはサーバーが返答します。いつでもオフにでき、断ってもサーバーAIで遊べます。' }[locale]}</p>
    <p className="ai-support-note">{{ ko: '공식 모델을 직접 내려받으며, 준비가 끝나면 저장 캐시를 정리합니다. 다음에 켤 때 다시 다운로드할 수 있습니다.', en: 'The official model downloads directly. Its stored cache is cleared after preparation, so enabling again may download it again.', ja: '公式モデルを直接取得し、準備後に保存キャッシュを消去します。次に有効にすると再取得する場合があります。' }[locale]}</p>
    <div className="ai-support-consent-actions"><button type="button" className="ai-support-primary" onClick={() => setAiSupportCooperation(true, true, true)}>{{ ko: 'AI 지원 켜고 서로 돕기', en: 'Enable AI and help each other', ja: 'AIをオンにして相互支援' }[locale]}</button>
      <button type="button" onClick={() => setAiSupportCooperation(false, true, false)}>{{ ko: '지원 끄고 도움받기', en: 'Keep device AI off and receive help', ja: '端末AIをオフにして支援を受け取る' }[locale]}</button>
      <button type="button" onClick={() => setAiSupportCooperation(false, false, true)}>{{ ko: '공유 없이 AI 켜기', en: 'Enable AI without sharing', ja: '共有せずAIをオン' }[locale]}</button>
      <button type="button" onClick={() => setAiSupportCooperation(false, false, false)}>{{ ko: '공유 없이 AI 끄기', en: 'Turn AI off without sharing', ja: '共有せずAIをオフ' }[locale]}</button></div>
  </dialog>;
}
