import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PlayerCamera } from '../view3d/playerCamera.ts';
import { stick, turnStep } from './input.ts';
import { TerminalPointer } from './domInput.ts';
import { TerminalSurface } from './surface.ts';
import { endVR, resetXRInput, useXR, xr, xrPatch, xrState } from './runtime.ts';

export function XRScene({ rig }: { rig: PlayerCamera }) {
  const { gl, scene, camera } = useThree();
  const state = useXR();
  const origin = useMemo(() => new THREE.Group(), []);
  const phone = useMemo(() => new THREE.Group(), []);
  const surface = useMemo(() => new TerminalSurface(), []);
  const pointer = useMemo(() => new TerminalPointer(), []);
  const temp = useMemo(() => ({ ray: new THREE.Raycaster(), rotation: new THREE.Matrix4(), euler: new THREE.Euler(0, 0, 0, 'YXZ'), position: new THREE.Vector3(), direction: new THREE.Vector3() }), []);
  const latched = useRef(false);
  const buttons = useRef(new Map<XRInputSource, boolean[]>());
  const lastDraw = useRef(0);
  const pointing = useRef(false);
  const selectionOnPhone = useRef(false);
  const focusController = useRef<THREE.Group | null>(null);
  const savedView = useRef(false);
  useEffect(() => {
    xr.renderer = gl; xrPatch({ ready: true });
    return () => { if (xr.renderer === gl) { xr.renderer = null; xrPatch({ ready: false }); void endVR(); } };
  }, [gl]);
  useEffect(() => {
    if (!state.active || !xr.session) return;
    const session = xr.session;
    const previousParent = camera.parent;
    const previousPosition = camera.position.clone();
    const previousQuaternion = camera.quaternion.clone();
    const projection = camera.projectionMatrix.clone();
    const inverseProjection = camera.projectionMatrixInverse.clone();
    savedView.current = rig.thirdPerson;
    rig.thirdPerson = false;
    origin.userData.noRay = true; phone.userData.noRay = true;
    phone.userData.open = false;
    scene.add(origin, phone); origin.add(camera);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(1.3, .85, .025), new THREE.MeshBasicMaterial({ color: '#263242', depthTest: false }));
    shell.position.z = -.02; shell.renderOrder = 999; shell.userData.noRay = true; phone.add(shell);
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(.014, .85, .03), new THREE.MeshBasicMaterial({ color: '#7d91aa', depthTest: false }));
    hinge.position.z = -.005; hinge.renderOrder = 999; hinge.userData.noRay = true; phone.add(hinge);
    const controllers = [gl.xr.getController(0), gl.xr.getController(1)];
    const lines: THREE.Line[] = [];
    const connected = (event: { target: THREE.Group; data: XRInputSource }) => { event.target.userData.inputSource = event.data; };
    const disconnected = (event: { target: THREE.Group }) => { delete event.target.userData.inputSource; };
    controllers.forEach((controller, index) => {
      origin.add(controller);
      controller.userData.inputSource = session.inputSources[index];
      controller.addEventListener('connected', connected);
      controller.addEventListener('disconnected', disconnected);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -3)]), new THREE.LineBasicMaterial({ color: '#8fcfff', depthTest: false }));
      line.renderOrder = 1001; line.userData.noRay = true; controller.add(line); lines.push(line);
    });
    const controllerFor = (source: XRInputSource) => controllers.find(controller => controller.userData.inputSource === source) ?? controllers[0];
    const point = (controller: THREE.Group) => {
      controller.updateWorldMatrix(true, false);
      temp.rotation.extractRotation(controller.matrixWorld);
      temp.ray.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      temp.ray.ray.direction.set(0, 0, -1).applyMatrix4(temp.rotation);
      const mesh = surface.mesh;
      const hit = mesh?.visible ? temp.ray.intersectObject(mesh, false)[0] : undefined;
      if (hit?.uv) {
        const rect = document.body.getBoundingClientRect();
        pointer.move(rect.left + hit.uv.x * rect.width, rect.top + (1 - hit.uv.y) * rect.height);
      }
      return !!hit;
    };
    const start = (event: XRInputSourceEvent) => {
      if (session.visibilityState !== 'visible') return;
      focusController.current = controllerFor(event.inputSource);
      selectionOnPhone.current = point(focusController.current);
      if (selectionOnPhone.current) { pointer.button = document.body.dataset.xrMiddle === 'true' ? 1 : 0; pointer.press(); }
      else { xr.ray = temp.ray.ray.clone(); xr.use?.(); }
    };
    const end = () => { if (selectionOnPhone.current) pointer.release(); else xr.release?.(); selectionOnPhone.current = false; };
    const squeeze = (event: XRInputSourceEvent) => {
      if (session.visibilityState !== 'visible') return;
      const controller = controllerFor(event.inputSource);
      if (!point(controller)) { xr.ray = temp.ray.ray.clone(); xr.carry?.(); }
    };
    const clear = () => { pointer.release(true); selectionOnPhone.current = false; focusController.current = null; buttons.current.clear(); latched.current = false; resetXRInput(); };
    session.addEventListener('selectstart', start); session.addEventListener('selectend', end); session.addEventListener('squeezestart', squeeze);
    session.addEventListener('inputsourceschange', clear); session.addEventListener('visibilitychange', clear);
    const frame = () => {
      const controller = focusController.current ?? controllers.find(c => c.userData.inputSource?.handedness === 'right') ?? controllers.find(c => c.userData.inputSource) ?? controllers[0];
      pointing.current = point(controller);
      if (!pointing.current) xr.ray = temp.ray.ray.clone();
    };
    frameCallback.current = frame;
    return () => {
      clear(); frameCallback.current = null;
      session.removeEventListener('selectstart', start); session.removeEventListener('selectend', end); session.removeEventListener('squeezestart', squeeze);
      session.removeEventListener('inputsourceschange', clear); session.removeEventListener('visibilitychange', clear);
      surface.dispose();
      [shell, hinge].forEach(mesh => { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); });
      lines.forEach(line => { line.removeFromParent(); line.geometry.dispose(); (line.material as THREE.Material).dispose(); });
      controllers.forEach(c => { c.removeEventListener('connected', connected); c.removeEventListener('disconnected', disconnected); delete c.userData.inputSource; c.removeFromParent(); });
      camera.removeFromParent(); previousParent?.add(camera);
      camera.position.copy(previousPosition); camera.quaternion.copy(previousQuaternion); camera.updateMatrixWorld();
      camera.projectionMatrix.copy(projection); camera.projectionMatrixInverse.copy(inverseProjection);
      origin.removeFromParent(); phone.removeFromParent();
      rig.thirdPerson = savedView.current;
      document.body.dataset.xrMiddle = 'false';
      focusController.current = null; pointing.current = false;
    };
  }, [state.active, gl, scene, camera, origin, phone, surface, pointer, rig, temp]);
  const frameCallback = useRef<null | (() => void)>(null);
  useFrame((_, dt, frame) => {
    if (!state.active || !xr.session) return;
    xr.move = [0, 0]; xr.turn = 0;
    if (xr.session.visibilityState !== 'visible') return;
    const reference = gl.xr.getReferenceSpace();
    const pose = reference && frame?.getViewerPose(reference);
    if (pose) {
      const q = pose.transform.orientation;
      temp.euler.setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w), 'YXZ');
      xr.headYaw = temp.euler.y; xr.headPitch = temp.euler.x;
    }
    frameCallback.current?.();
    for (const source of xr.session.inputSources) {
      const pad = source.gamepad;
      if (!pad || pad.mapping !== 'xr-standard') continue;
      const axes = stick(pad.axes);
      const old = buttons.current.get(source) ?? [];
      const current = pad.buttons.map(b => b.pressed);
      if (current[5] && !old[5]) { pointer.release(true); resetXRInput(); xrPatch({ open: !xrState().open }); }
      if (current[4] !== !!old[4]) window.dispatchEvent(new KeyboardEvent(current[4] ? 'keydown' : 'keyup', { code: 'Space', key: ' ' }));
      buttons.current.set(source, current);
      if (source.handedness === 'left') {
        if (!state.open || !pointing.current) xr.move = axes;
      } else if (source.handedness === 'right') {
        if (pointing.current && state.open) { pointer.scroll(axes[1] * dt * 500, axes[0] * dt * 500); latched.current = false; }
        else { const turn = turnStep(axes[0], dt, xr.settings, latched.current); xr.turn = turn.radians; latched.current = turn.latched; }
      }
    }
  }, -1);
  useFrame(() => {
    if (!state.active) return;
    origin.position.copy(rig.avatarPosition);
    origin.rotation.set(0, rig.yaw, 0);
    if (rig.thirdPerson) origin.position.add(new THREE.Vector3(0, 0, rig.actualDistance).applyAxisAngle(THREE.Object3D.DEFAULT_UP, rig.yaw));
    camera.position.set(0, 0, 0); camera.quaternion.identity();
    origin.updateMatrixWorld(true);
    if (camera instanceof THREE.PerspectiveCamera) gl.xr.updateCamera(camera);
    // 閉じている間は端末メッシュ自体が非表示 (visible = state.open) で、refresh の結果は誰にも見えない (#201)。
    // 開いた瞬間から従来どおり 200ms 間隔で更新が再開する。
    if (state.open && performance.now() - lastDraw.current > 200) {
      lastDraw.current = performance.now();
      try {
        surface.refresh();
        if (surface.mesh && surface.mesh.parent !== phone) phone.add(surface.mesh);
      } catch { xrPatch({ error: '仮想端末の描画に失敗したためVRを終了しました。通常画面をご利用ください。' }); void endVR(); }
    }
    if (surface.mesh) surface.mesh.visible = state.open;
    phone.scale.set(state.open ? 1 : .18, state.open ? 1 : .7, 1);
    // 開いた位置で端末を固定し、閉じて再度開くと目の前へ戻す。
    if (state.open && !phone.userData.open) {
      const head = gl.xr.getCamera();
      head.getWorldPosition(temp.position); head.getWorldDirection(temp.direction);
      phone.position.copy(temp.position).addScaledVector(temp.direction, 1.1);
      phone.quaternion.copy(head.getWorldQuaternion(new THREE.Quaternion()));
    }
    if (!state.open) {
      const hand = gl.xr.getController(0);
      hand.getWorldPosition(phone.position); hand.getWorldQuaternion(phone.quaternion);
    }
    phone.userData.open = state.open;
  }, -.25);
  return null;
}
