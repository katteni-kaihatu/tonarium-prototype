import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PlayerCamera } from '../view3d/playerCamera.ts';
import { useEyeHeight } from '../view3d/eyeHeight.ts';
import { stick, turnStep } from './input.ts';
import { TerminalPointer } from './domInput.ts';
import { PanelSurfaces } from './panelSurfaces.ts';
import { calibratedOrigin } from './pose.ts';
import type { TrackedPose } from '../../../shared/xr-pose.ts';
import { endVR, resetXRInput, useXR, xr, xrPatch, xrState } from './runtime.ts';

export function XRScene({ rig }: { rig: PlayerCamera }) {
  const { gl, scene, camera } = useThree();
  const state = useXR();
  const eye = useEyeHeight();
  const origin = useMemo(() => new THREE.Group(), []);
  const pointer = useMemo(() => new TerminalPointer(), []);
  const tick = useRef<null | (() => void)>(null);
  const draw = useRef<null | ((dt: number, frame?: XRFrame) => void)>(null);
  useEffect(() => {
    xr.renderer = gl; xrPatch({ ready: true });
    return () => { if (xr.renderer === gl) { xr.renderer = null; xrPatch({ ready: false }); void endVR(); } };
  }, [gl]);
  useEffect(() => {
    if (!state.active || !xr.session) return;
    const session = xr.session;
    const previousParent = camera.parent, position = camera.position.clone(), quaternion = camera.quaternion.clone();
    const projection = camera.projectionMatrix.clone(), inverseProjection = camera.projectionMatrixInverse.clone();
    const thirdPerson = rig.thirdPerson;
    rig.thirdPerson = false;
    origin.userData.noRay = true; scene.add(origin); origin.add(camera);
    const panels = new PanelSurfaces(scene);
    const controllers = [gl.xr.getController(0), gl.xr.getController(1)];
    const grips = [gl.xr.getControllerGrip(0), gl.xr.getControllerGrip(1)];
    const rays = controllers.map(() => new THREE.Raycaster());
    const marks = controllers.map(() => {
      const mark = new THREE.Mesh(new THREE.RingGeometry(.005, .009, 24), new THREE.MeshBasicMaterial({ color: '#fff3a6', depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
      mark.userData.noRay = true; mark.renderOrder = 2002; mark.visible = false; scene.add(mark); return mark;
    });
    const connected = (event: { target: THREE.Group; data: XRInputSource }) => { event.target.userData.inputSource = event.data; };
    const disconnected = (event: { target: THREE.Group }) => { delete event.target.userData.inputSource; clear(); };
    const lines = controllers.map((controller, i) => {
      origin.add(controller, grips[i]); controller.userData.inputSource = session.inputSources[i];
      controller.addEventListener('connected', connected); controller.addEventListener('disconnected', disconnected);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: '#8fcfff', depthTest: false, depthWrite: false, transparent: true }));
      line.renderOrder = 2001; line.userData.noRay = true; controller.add(line); return line;
    });
    let initial: THREE.Vector3 | null = null, lastDraw = -Infinity, latch = false;
    let selecting: THREE.Group | null = null, selectedPanel: HTMLElement | null = null, carryController: THREE.Group | null = null;
    const buttons = new Map<XRInputSource, boolean[]>();
    const controllerFor = (source: XRInputSource) => controllers.find(c => c.userData.inputSource === source);
    const rayFor = (controller: THREE.Group) => {
      const ray = rays[controllers.findIndex(c => c === controller)];
      controller.updateWorldMatrix(true, false);
      ray.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      ray.ray.direction.set(0, 0, -1).applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion()));
      return ray;
    };
    const point = (controller: THREE.Group, move: boolean) => {
      const ray = rayFor(controller), hit = panels.hit(ray), index = controllers.findIndex(c => c === controller);
      const mark = marks[index];
      mark.visible = !!hit;
      lines[index].scale.z = hit?.hit.distance ?? 3;
      if (hit?.hit.uv) {
        mark.position.copy(hit.hit.point).addScaledVector(ray.ray.direction, -.002);
        hit.panel.group.getWorldQuaternion(mark.quaternion);
        if (move && (!selectedPanel || selectedPanel === hit.panel.root)) {
          pointer.root = hit.panel.root;
          const rect = hit.panel.root.getBoundingClientRect();
          pointer.move(rect.left + hit.hit.uv.x * rect.width, rect.top + (1 - hit.hit.uv.y) * rect.height);
        }
      }
      if (move && selectedPanel && (!hit || hit.panel.root !== selectedPanel)) pointer.move(-100, -100);
      return hit;
    };
    const start = (event: XRInputSourceEvent) => {
      if (session.visibilityState !== 'visible' || selecting) return;
      const controller = controllerFor(event.inputSource);
      if (!controller) return;
      selecting = controller;
      const hit = point(controller, true);
      selectedPanel = hit?.panel.root ?? null;
      if (hit) { pointer.button = document.body.dataset.xrMiddle === 'true' ? 1 : 0; pointer.press(); }
      else { xr.ray = rayFor(controller).ray.clone(); xr.use?.(); }
    };
    const end = (event: XRInputSourceEvent) => {
      if (controllerFor(event.inputSource) !== selecting) return;
      if (selectedPanel) pointer.release(); else xr.release?.();
      selecting = null; selectedPanel = null;
    };
    const squeeze = (event: XRInputSourceEvent) => {
      if (session.visibilityState !== 'visible') return;
      const controller = controllerFor(event.inputSource);
      if (!controller) return;
      const ray = rayFor(controller);
      if (panels.grab(controller, ray)) return;
      // パネル上のグリップを背後の物体の保持へ通さない。
      if (panels.hit(ray)) return;
      if (carryController && carryController !== controller) return;
      xr.ray = ray.ray.clone();
      carryController = xr.carry?.() ? controller : null;
      xr.carryRay = carryController ? ray.ray.clone() : null;
    };
    const unsqueeze = (event: XRInputSourceEvent) => { const controller = controllerFor(event.inputSource); if (controller) panels.release(controller); };
    xr.clearControllers = () => {
      pointer.release(true); selectedPanel = null; selecting = null; carryController = null;
      panels.release(); buttons.clear(); latch = false; marks.forEach(m => { m.visible = false; });
    };
    const clear = () => resetXRInput();
    session.addEventListener('selectstart', start); session.addEventListener('selectend', end);
    session.addEventListener('squeezestart', squeeze); session.addEventListener('squeezeend', unsqueeze);
    session.addEventListener('inputsourceschange', clear); session.addEventListener('visibilitychange', clear);
    tick.current = () => {
      if (session.visibilityState !== 'visible') return;
      controllers.forEach(controller => {
        const source = controller.userData.inputSource as XRInputSource | undefined;
        if (!source) return;
        const active = selecting ?? controllers.find(c => c.userData.inputSource?.handedness === 'right') ?? controller;
        const hit = point(controller, active === controller);
        if (controller === active && !hit) xr.ray = rayFor(controller).ray.clone();
      });
      if (carryController) xr.carryRay = rayFor(carryController).ray.clone();
    };
    draw.current = (dt, frame) => {
      xr.move = [0, 0]; xr.turn = 0;
      if (session.visibilityState !== 'visible') return;
      const reference = gl.xr.getReferenceSpace(), pose = reference && frame?.getViewerPose(reference);
      if (!pose) return;
      const head = pose.transform;
      const headPosition = new THREE.Vector3(head.position.x, head.position.y, head.position.z);
      if (!initial) initial = headPosition.clone();
      const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(head.orientation.x, head.orientation.y, head.orientation.z, head.orientation.w), 'YXZ');
      xr.headYaw = euler.y; xr.headPitch = euler.x;
      const tracking = (transform: XRRigidTransform): TrackedPose => {
        const p = new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z).sub(initial!).add(new THREE.Vector3(0, eye.current.current, 0));
        const q = new THREE.Quaternion(transform.orientation.x, transform.orientation.y, transform.orientation.z, transform.orientation.w);
        const inverse = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -xr.headYaw);
        return { p: p.applyQuaternion(inverse).toArray() as TrackedPose['p'], q: inverse.multiply(q).toArray() as TrackedPose['q'] };
      };
      xr.pose = { head: tracking(head) };
      for (const source of session.inputSources) {
        if (source.gripSpace && reference) {
          const grip = frame?.getPose(source.gripSpace, reference);
          if (grip && (source.handedness === 'left' || source.handedness === 'right')) xr.pose[source.handedness] = tracking(grip.transform);
        }
        const pad = source.gamepad;
        if (!pad || pad.mapping !== 'xr-standard') continue;
        const axes = stick(pad.axes), old = buttons.get(source) ?? [], current = pad.buttons.map(b => b.pressed);
        if (current[5] && !old[5]) { clear(); xrPatch({ open: !xrState().open }); }
        if (current[4] !== !!old[4]) window.dispatchEvent(new KeyboardEvent(current[4] ? 'keydown' : 'keyup', { code: 'Space', key: ' ' }));
        buttons.set(source, current);
        const controller = controllerFor(source), hit = controller && point(controller, false);
        if (source.handedness === 'left') { if (!hit && !selecting) xr.move = axes; }
        else if (source.handedness === 'right') {
          if (hit) { if (!selecting || selecting === controller) { point(controller!, true); pointer.scroll(axes[1] * dt * 500, axes[0] * dt * 500); } latch = false; }
          else { const turn = turnStep(axes[0], dt, xr.settings, latch); xr.turn = turn.radians; latch = turn.latched; }
        }
      }
    };
    const place = () => {
      if (!initial) return;
      calibratedOrigin(rig.avatarPosition, rig.yaw, initial, eye.current.current, origin.position);
      origin.rotation.set(0, rig.yaw, 0); camera.position.set(0, 0, 0); camera.quaternion.identity(); origin.updateMatrixWorld(true);
      if (camera instanceof THREE.PerspectiveCamera) gl.xr.updateCamera(camera);
      const left = controllers.findIndex(c => c.userData.inputSource?.handedness === 'left');
      panels.update(left < 0 ? undefined : grips[left]);
      if (performance.now() - lastDraw > 200) {
        lastDraw = performance.now();
        try { panels.refresh(); } catch { xrPatch({ error: 'VRパネルの描画に失敗したためVRを終了しました。通常画面をご利用ください。' }); void endVR(); }
      }
      tick.current?.();
    };
    placeCallback.current = place;
    return () => {
      clear(); xr.clearControllers = null; tick.current = null; draw.current = null; placeCallback.current = null;
      session.removeEventListener('selectstart', start); session.removeEventListener('selectend', end);
      session.removeEventListener('squeezestart', squeeze); session.removeEventListener('squeezeend', unsqueeze);
      session.removeEventListener('inputsourceschange', clear); session.removeEventListener('visibilitychange', clear);
      panels.dispose(); pointer.root = null;
      marks.forEach(m => { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); });
      lines.forEach(line => { line.removeFromParent(); line.geometry.dispose(); (line.material as THREE.Material).dispose(); });
      controllers.forEach(c => { c.removeEventListener('connected', connected); c.removeEventListener('disconnected', disconnected); delete c.userData.inputSource; c.removeFromParent(); });
      grips.forEach(g => g.removeFromParent()); origin.removeFromParent();
      camera.removeFromParent(); previousParent?.add(camera); camera.position.copy(position); camera.quaternion.copy(quaternion);
      camera.projectionMatrix.copy(projection); camera.projectionMatrixInverse.copy(inverseProjection); camera.updateMatrixWorld(); rig.thirdPerson = thirdPerson;
      document.body.dataset.xrMiddle = 'false';
    };
  }, [state.active, gl, scene, camera, origin, pointer, rig, eye]);
  const placeCallback = useRef<null | (() => void)>(null);
  useFrame((_, dt, frame) => { draw.current?.(dt, frame); tick.current?.(); }, -1);
  useFrame(() => { placeCallback.current?.(); }, -.25);
  return null;
}
