import { useStore } from '../store.ts';
import { Label } from '../view3d/Label.tsx';
import { SystemObject } from './SystemObject.tsx';
import { demoModel } from './demo-models.tsx';
import { useSystems } from './state.ts';
import { t, useLanguage } from '../i18n/index.ts';

const demoCaptions: Record<string, string> = {
  'start-button': 'ssPlayStart', 'pause-button': 'ssPlayPause',
  'reset-button': 'ssPlayReset', 'chair-object': 'ssPlayChair',
};

export function SystemObjects3D({ sessionId }: { sessionId?: string } = {}) {
  useLanguage();
  const appSid = useStore(s => s.session), state = useSystems();
  const sid = sessionId ?? appSid;
  if (sid !== state.sid || !state.view) return null;
  const view = state.view;
  return <>{view.map.objects.filter(object => !object.itemId).map(object => {
    const size = object.size ?? [1, 1, 1];
    const captionKey = view.map.id === 'system-demo' && object.text === undefined ? demoCaptions[object.id] : undefined;
    const caption = captionKey ? t(captionKey) : object.text ?? object.id;
    return <SystemObject key={object.id} objectId={object.id} sessionId={sid ?? undefined} hint={caption}>
      {text => <>{view.map.id === 'system-demo' ? demoModel(object, text) : <mesh position={[0, size[1] / 2, 0]}>
        <boxGeometry args={size} /><meshStandardMaterial color={object.color ?? '#7488a6'} />
      </mesh>}
      {!object.capabilities.includes('text') && <Label position={[0, size[1] + 0.25, 0]} text={caption} height={0.2} />}
      </>}
    </SystemObject>;
  })}</>;
}
