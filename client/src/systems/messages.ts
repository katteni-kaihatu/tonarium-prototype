import { t } from '../i18n/core.ts';
import { resources } from '../i18n/resources.ts';

const errors: Record<string, string> = {
  '공유 시스템 연결이 준비된 뒤 다시 입력해 주세요.': 'ssErrorUnavailable',
  '맵이나 연결이 바뀌어 대기 중인 입력을 취소했습니다.': 'ssErrorChanged',
  '입력 결과를 확인하지 못했습니다. 상태를 확인한 뒤 다시 입력해 주세요.': 'ssErrorUncertain',
  '입력이 너무 많습니다. 잠시 기다린 뒤 다시 입력해 주세요.': 'ssErrorOverflow',
  '이미 처리한 입력입니다. 새 입력으로 다시 요청해 주세요.': 'ssErrorDuplicate',
  '다른 변경과 계속 충돌합니다. 상태를 확인한 뒤 다시 입력해 주세요.': 'ssErrorConflict',
  '공유 시스템 입력을 처리하지 못했습니다.': 'ssErrorFailed',
  '일어서기를 처리하지 못했습니다.': 'ssErrorStandFailed',
  '의자 시스템 정보를 불러오지 못했습니다.': 'ssErrorSeatInfo',
  '연결된 의자에 일어서기 입력이 없습니다.': 'ssErrorStandInput',
  'System map is not synchronized': 'ssErrorNotSynced',
  'System operation failed': 'ssErrorFailed',
  'Local playtest request failed': 'ssErrorFailed',
  'system revision conflict': 'ssErrorConflict',
  'system command id reused': 'ssErrorDuplicate',
  'seat occupied': 'ssErrorOccupied',
  'user already seated': 'ssErrorAlreadySeated',
  'seat user unavailable': 'ssErrorUser',
  'target user unavailable': 'ssErrorUser',
  'system actor': 'ssErrorUser',
  'target unavailable': 'ssErrorObject',
  'event object unavailable': 'ssErrorObject',
  'interaction target': 'ssErrorObject',
  'system instance': 'ssErrorInstance',
  'system input': 'ssErrorInput',
  'connection target': 'ssErrorInput',
  'connection input': 'ssErrorInput',
  'System input rate exceeded': 'ssErrorRate',
  'Unknown registered code map': 'ssErrorMap',
  'Load maps from registered map code': 'ssErrorMap',
  'Failed to fetch': 'ssErrorNetwork',
  'fetch failed': 'ssErrorNetwork',
  'NetworkError when attempting to fetch resource.': 'ssErrorNetwork',
  'map items must remain on the ground': 'ssErrorGround',
  'system resource budget': 'ssErrorBudget',
  'system state budget': 'ssErrorBudget',
  'system instruction budget': 'ssErrorBudget',
  'system event budget': 'ssErrorBudget',
  'timer budget': 'ssErrorBudget',
};

export function systemErrorText(message: string): string {
  const value = message.replace(/^(?:Error|TypeError):\s*/, '');
  if (Object.hasOwn(errors, value)) return t(errors[value]);
  if (/^(?:ssCatalog|ssPlay|ssError|ssLibrary)/.test(value) && Object.hasOwn(resources.ja, value)) return t(value);
  const object = /^(?:System object unavailable|Object already bound): (.+)$/.exec(value);
  if (object) return t('ssErrorNamedObject', object[1]);
  const original = /^system original unavailable: (.+)$/.exec(value);
  if (original) return t('ssErrorOriginal', original[1]);
  const retained = /^(.+): update retained previous system \((.+)\)$/.exec(value);
  if (retained) return t('ssErrorRetained', retained[1], systemErrorText(retained[2]));
  const retainedMap = /^update retained previous map \((.+)\)$/.exec(value);
  if (retainedMap) return t('ssErrorRetainedMap', systemErrorText(retainedMap[1]));
  const leave = /^(.+): leave cleanup failed \((.+)\)$/.exec(value);
  if (leave) return t('ssErrorLeave', leave[1], systemErrorText(leave[2]));
  return message;
}
