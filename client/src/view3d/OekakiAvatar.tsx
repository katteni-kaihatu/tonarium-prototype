// oekaki-avatar の Avatar.tsx を元にしたもの
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useGraph } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { AVATAR_EYES, AVATAR_SCALE, DEFAULT_EYE_HEIGHT, DEFAULT_PARAMS, getAvatarEyeHeight, getAvatarFloorOffset, sanitizeParams, type AvatarParams } from '../../../shared/avatar.ts';
import { avatarParamsUrl, avatarTextureUrl } from '../avatar.ts';
import { emotePose, type ActiveEmote } from '../../../shared/emotes.ts';
import { get } from '../store.ts';
import { useReducedMotion } from '../emotes.ts';
import { applySeatedFoot, avatarHipHeight, seatedBodyOffset, stepSeatedWeight } from './seatedPose.ts';
import { CROUCH_WEIGHT } from './crouch.ts';
import type { AvatarXR, TrackedPose } from '../../../shared/xr-pose.ts';

const MODEL = '/oekaki/avatar.glb';
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const handQ = new THREE.Quaternion();
const tiltQ = new THREE.Quaternion();
useGLTF.preload(MODEL);

const TEXTURED = new Set([
  'Head_Front', 'Head_Back', 'Body_Front', 'Body_Back', 'LeftHand_Front', 'LeftHand_Back', 'RightHand_Front',
  'RightHand_Back', 'LeftFoot_Front', 'LeftFoot_Back', 'RightFoot_Front', 'RightFoot_Back', 'Tail_Front', 'Tail_Back',
]);
// 顔のテクスチャをずらして表情を切り替える
const FACE = { normal: 0, eyesClosed: 1 / 6, mouthOpen: -1 / 6 };

function baseAnimation(p: AvatarParams) {
  const v = (name: string, x: number, y: number, z: number) => new THREE.VectorKeyframeTrack(name, [0], [x, y, z]);
  const tail = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, p.tailRotation));
  const clip = new THREE.AnimationClip('BaseAnimation', 1, [
    v('Head_Front.scale', p.headSize, p.headSize, p.headSize),
    v('Head_Back.scale', p.headSize, p.headSize, p.headSize),
    v('Body.position', 0, -p.neckLength, p.headInFront ? -0.5 : 0.5),
    v('LeftHand.scale', p.handSize, p.handSize, p.handSize),
    v('RightHand.scale', p.handSize, p.handSize, p.handSize),
    v('Body_Front.scale', p.bodySize, p.bodySize, p.bodySize),
    v('Body_Back.scale', p.bodySize, p.bodySize, p.bodySize),
    v('Tail.scale', p.tailSize, p.tailSize, p.tailSize),
    v('Tail.position', 0, -p.tailPosition, 0),
    new THREE.QuaternionKeyframeTrack('Tail.quaternion', [0], tail.toArray()),
    v('Feet.scale', p.legsSize, p.legsSize, p.legsSize),
    v('LeftFoot.position', p.legsDistance, 0, 0),
    v('RightFoot.position', -p.legsDistance, 0, 0.001),
    v('Feet.position', 0, -p.legsDistanceFromBody, p.legsInFront ? 0.5 : -0.5),
  ]);
  clip.blendMode = THREE.AdditiveAnimationBlendMode;
  return clip;
}

/** モデルは +Z 向きなので、こちらの「前 = -Z」に合わせて回してある */
/** look は顔の上下の向き（ラジアン、上向きが正）を返す */
export function OekakiAvatar({ name, version, speaking, look, walking, seated, crouching, userId, previewEmote, onEyeHeight, onSeatOffset, textureUrl, tracked, handsOnly }: { name: string; version: string | null; speaking: boolean; look?: () => number; walking?: () => boolean; seated?: () => boolean; crouching?: () => boolean; userId?: string; previewEmote?: ActiveEmote | null; onEyeHeight?: (height: number) => void; onSeatOffset?: (offset: number) => void; textureUrl?: string; tracked?: () => AvatarXR | undefined; handsOnly?: () => boolean }) {
  const { scene, animations } = useGLTF(MODEL);
  const clone = useMemo(() => scene.clone(), [scene]);
  const { nodes } = useGraph(clone);
  const [params, setParams] = useState<AvatarParams>(DEFAULT_PARAMS);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [paramsReady, setParamsReady] = useState(false);
  const notified = useRef(false);
  const mixer = useMemo(() => new THREE.AnimationMixer(clone), [clone]);
  const walkActions = useMemo(() => animations.filter((clip) => clip.name === 'Transform:LeftFoot' || clip.name === 'Transform:RightFoot')
    .map((clip) => mixer.clipAction(clip)), [animations, mixer]);
  const face = useRef<THREE.Texture | null>(null);
  const blink = useRef(0);
  const motion = useRef<THREE.Group>(null);
  const reduced = useReducedMotion();
  const sitWeight = useRef(0);
  const hipHeight = avatarHipHeight(params);
  const seatOffset = seatedBodyOffset(hipHeight);
  // Restore the preceding mixer pose before the next tick, including untracked axes.
  const hands = useMemo(() => [nodes.LeftHand, nodes.RightHand].map((o) => o ? { o, q: o.quaternion.clone(), p: o.position.clone() } : null), [nodes]);
  const feet = useMemo(() => [nodes.LeftFoot, nodes.RightFoot].map(o => o ? { o, q: o.quaternion.clone(), p: o.position.clone() } : null), [nodes]);
  useEffect(() => { onSeatOffset?.(seatOffset); }, [seatOffset, onSeatOffset]);

  useEffect(() => {
    let alive = true;
    setTexture(null);
    setParamsReady(!version);
    onEyeHeight?.(DEFAULT_EYE_HEIGHT);
    void new THREE.TextureLoader().loadAsync(textureUrl ?? avatarTextureUrl(name, version)).then((t) => {
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      if (alive) setTexture(t); else t.dispose();
    }).catch(() => { /* 読み込み失敗時は標準の高さを保つ。 */ });
    setParams(DEFAULT_PARAMS);
    if (version) {
      void fetch(avatarParamsUrl(name, version))
        .then((r) => (r.ok ? r.json() : null))
        .then((p) => { if (alive) { setParams(sanitizeParams(p)); setParamsReady(true); } })
        .catch(() => { if (alive) setParamsReady(true); });
    }
    return () => { alive = false; };
  }, [name, version, onEyeHeight, textureUrl]);

  useEffect(() => { notified.current = false; }, [params, texture, paramsReady, onEyeHeight]);

  useEffect(() => {
    if (!texture) return;
    const faceMap = texture.clone();
    face.current = faceMap;
    const faceMat = new THREE.MeshBasicMaterial({ map: faceMap, alphaTest: 0.5 });
    const bodyMat = new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5 });
    for (const [key, obj] of Object.entries(nodes)) {
      if (TEXTURED.has(key) && (obj as THREE.Mesh).isMesh) (obj as THREE.Mesh).material = key === 'Head_Front' ? faceMat : bodyMat;
    }
    return () => { faceMat.dispose(); bodyMat.dispose(); faceMap.dispose(); texture.dispose(); };
  }, [nodes, texture]);

  useEffect(() => {
    const actions = animations.map((clip) => mixer.clipAction(clip));
    actions.filter((a) => !walkActions.includes(a)).forEach((a) => a.play());
    return () => actions.forEach((a) => a.stop());
  }, [animations, mixer, walkActions]);

  useEffect(() => {
    const action = mixer.clipAction(baseAnimation(params));
    action.blendMode = THREE.AdditiveAnimationBlendMode;
    action.play();
    if (nodes.Tail) nodes.Tail.visible = !params.disableTail;
    return () => { action.stop(); };
  }, [params, mixer, nodes]);

  const tilt = useRef(0);
  // 顔の板はもともと回転が付いているので、その上に傾きを掛ける
  const faceBase = useMemo(() => [nodes.Head_Front, nodes.Head_Back].filter(Boolean).map((o) => ({ o, q: o.quaternion.clone(), p: o.position.clone() })), [nodes]);
  const meshes = useMemo(() => {
    const list: { o: THREE.Object3D; visible: boolean; hand: boolean }[] = [];
    clone.traverse(o => {
      if (!(o as THREE.Mesh).isMesh) return;
      let hand = false;
      for (let parent: THREE.Object3D | null = o; parent; parent = parent.parent) if (parent === nodes.LeftHand || parent === nodes.RightHand) hand = true;
      list.push({ o, visible: o.visible, hand });
    });
    return list;
  }, [clone, nodes]);
  useFrame((_, dt) => {
    for (const f of faceBase) f.o.position.copy(f.p);
    for (const h of hands) if (h) { h.o.quaternion.copy(h.q); h.o.position.copy(h.p); }
    for (const f of feet) if (f) { f.o.quaternion.copy(f.q); f.o.position.copy(f.p); }
    sitWeight.current = stepSeatedWeight(sitWeight.current, seated?.() === true, dt, reduced);
    const sitting = Math.max(sitWeight.current, seated?.() !== true && crouching?.() === true ? CROUCH_WEIGHT : 0);
    const moving = walking?.() === true && sitting < 0.01;
    for (const action of walkActions) {
      if (moving && !action.isRunning()) action.reset().play();
      else if (!moving && action.isRunning()) action.stop();
    }
    mixer.update(dt);
    if (!notified.current && texture && paramsReady) {
      notified.current = true;
      onEyeHeight?.(getAvatarEyeHeight(params));
    }
    for (const h of hands) if (h) { h.q.copy(h.o.quaternion); h.p.copy(h.o.position); }
    for (const f of feet) if (f) {
      f.q.copy(f.o.quaternion); f.p.copy(f.o.position);
      applySeatedFoot(f.o, { position: f.p, quaternion: f.q }, sitting);
    }
    const emote = previewEmote !== undefined ? previewEmote : userId ? get().emotes[userId] : undefined;
    const pose = emotePose(emote?.id ?? 'wave', emote && !reduced ? performance.now() - emote.started : -1);
    if (motion.current) {
      motion.current.position.y = pose.y - seatOffset * sitting;
      motion.current.rotation.set(pose.rx, 0, pose.rz);
      motion.current.scale.set(pose.sx, pose.sy, 1);
    }
    hands.forEach((h, i) => {
      if (!h) return;
      const angle = i === 0 ? pose.left : pose.right;
      const lift = i === 0 ? pose.liftLeft : pose.liftRight;
      if (lift > 0) {
        // Hands in the source model have a twisted idle pose. Face their palms
        // forward while lifting them beside the head so the wave is readable.
        h.o.quaternion.slerp(handQ.setFromAxisAngle(Z_AXIS, angle), pose.hands);
        h.o.position.x += (i === 0 ? 13 : -13) * pose.hands;
      } else h.o.rotateZ(angle);
      h.o.position.y += lift;
    });
    // Head は体ごとの親でアニメーションも付いているので、顔の板だけを傾ける。モデルは +Z 向きなので上を向くのは -X 回転
    tilt.current += ((look?.() ?? 0) - tilt.current) * Math.min(1, dt * 10);
    tiltQ.setFromAxisAngle(X_AXIS, pose.bow - Math.max(-0.7, Math.min(0.7, tilt.current * 0.8)));
    for (const f of faceBase) f.o.quaternion.copy(tiltQ).multiply(f.q);
    const tracking = tracked?.();
    const base = motion.current?.parent?.parent;
    if (tracking && base) {
      base.updateWorldMatrix(true, true);
      const baseQ = base.getWorldQuaternion(new THREE.Quaternion());
      const apply = (object: THREE.Object3D, pose: TrackedPose, offset = new THREE.Vector3(), correction = new THREE.Quaternion()) => {
        const q = new THREE.Quaternion().fromArray(pose.q);
        const p = new THREE.Vector3().fromArray(pose.p).add(offset.applyQuaternion(q));
        object.position.copy(object.parent!.worldToLocal(base.localToWorld(p)));
        const parentQ = object.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
        object.quaternion.copy(parentQ.multiply(baseQ).multiply(q).multiply(correction));
      };
      const correction = (object: THREE.Object3D, original: THREE.Quaternion) => baseQ.clone().invert().multiply(object.parent!.getWorldQuaternion(new THREE.Quaternion())).multiply(original);
      for (const [i, side] of (['left', 'right'] as const).entries()) {
        const pose = tracking[side], hand = hands[i];
        if (pose && hand) apply(hand.o, pose, new THREE.Vector3(), correction(hand.o, hand.q));
      }
      // 目の追跡点から頭の中心までの距離を、アバター設定に合わせる。
      const forward = Math.abs(AVATAR_EYES.headSize + params.headSize) * AVATAR_EYES.forward * AVATAR_SCALE;
      for (const f of faceBase) {
        f.o.quaternion.copy(f.q);
        const offset = base.worldToLocal(f.o.getWorldPosition(new THREE.Vector3())).sub(new THREE.Vector3(0, getAvatarEyeHeight(params), -forward));
        apply(f.o, tracking.head, offset, correction(f.o, f.q));
      }
    }
    for (const entry of meshes) entry.o.visible = entry.visible && (!handsOnly?.() || entry.hand);
    const f = face.current;
    if (!f) return;
    // 話している間は口を開け、それ以外はときどきまばたき
    if (blink.current > 0) blink.current -= dt;
    // フレーム単位の確率だと描画頻度でまばたきの間隔が変わるため、経過時間から決める
    else if (Math.random() < 1 - Math.exp(-dt * 0.24)) blink.current = 0.15;
    const mouth = speaking && Math.sin(performance.now() / 90) > 0;
    f.offset.x = mouth ? FACE.mouthOpen : blink.current > 0 ? FACE.eyesClosed : FACE.normal;
  });

  return <group position-y={getAvatarFloorOffset(params)}><group ref={motion}><primitive object={clone} scale={AVATAR_SCALE} rotation-y={Math.PI} /></group></group>;
}
