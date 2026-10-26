import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Group } from 'three';
import { useStore } from '../store.ts';
import { interactSystemObject } from './api.ts';
import { SystemObjectBindings } from './bindings.ts';
import { useSystems } from './state.ts';

export interface SystemObjectProps {
  objectId: string;
  children: ReactNode | ((text: string) => ReactNode);
  sessionId?: string;
  hint?: string;
  initialText?: string;
  setText?: (text: string) => void;
  onInteract?: (objectId: string) => void;
  onDiagnostic?: (diagnostics: string[]) => void;
}

export function SystemObject({ objectId, children, sessionId, hint, initialText = '', setText, onInteract, onDiagnostic }: SystemObjectProps) {
  const object = useRef<Group>(null);
  const appSession = useStore(state => state.session);
  const expectedSession = sessionId ?? appSession ?? '';
  const mapId = useSystems(state => state.sid === expectedSession ? state.view?.map.id : undefined);
  const [text, updateText] = useState(initialText);
  const callbacks = useRef({ hint, initialText, setText, onInteract, onDiagnostic });
  callbacks.current = { hint, initialText, setText, onInteract, onDiagnostic };

  useLayoutEffect(() => {
    if (!object.current || !mapId) return;
    updateText(callbacks.current.initialText);
    const bindings = new SystemObjectBindings(
      { sessionId: expectedSession, mapId },
      id => (callbacks.current.onInteract ?? interactSystemObject)(id),
      messages => callbacks.current.onDiagnostic?.(messages),
    );
    bindings.bind(objectId, object.current, {
      hint: callbacks.current.hint,
      getText: () => callbacks.current.initialText,
      setText: value => { updateText(value); callbacks.current.setText?.(value); },
    });
    const apply = () => {
      const current = useSystems.getState();
      bindings.update(expectedSession, current.sid === expectedSession ? current.view : undefined);
    };
    apply();
    const unsubscribe = useSystems.subscribe(apply);
    return () => { unsubscribe(); bindings.dispose(); };
  }, [objectId, expectedSession, mapId, hint]);

  return <group ref={object} onClick={event => {
    const use = object.current?.userData.use;
    if (typeof use === 'function' && !document.pointerLockElement) { event.stopPropagation(); use(); }
  }}>{typeof children === 'function' ? children(text) : children}</group>;
}
