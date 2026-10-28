import * as THREE from 'three';
import { TerminalSurface } from './surface.ts';
import { uprightQuaternion } from './pose.ts';
import { xr, xrPatch, xrState, subscribeXR, resetXRInput } from './runtime.ts';
import { panelDistance, panelScale } from './input.ts';
import { layoutSize, panelLayout, uvToDOM } from './layout.ts';
import { t } from '../i18n/index.ts';
import { TerminalShell } from './terminalShell.ts';

interface Panel {
  id: string; title: string; root: HTMLElement; surface: TerminalSurface; group: THREE.Group;
  shown: boolean; utility: boolean; wrist: boolean; auto: boolean;
  width: number; height: number; minWidth: number; controls: HTMLElement;
  shell: TerminalShell;
  persistent: boolean;
}
const SOURCES: [string, string, string][] = [
  ['.nearlist', 'nearby', '近くの一覧'], ['.noticelog', 'chat', 'チャット・通知'],
  ['.worldbadge', 'settings', '通話設定'], ['.dock', 'dock', 'マイク・音・エモート'],
  ['.hoverlay', 'home', 'ホーム'], ['.survivor-panel.overlay', 'survivor-hud', 'サバイバー'],
];

export class PanelSurfaces {
  private panels = new Map<HTMLElement, Panel>();
  private grabs = new Map<THREE.Group, { panel: Panel; offset: THREE.Matrix4 }>();
  private serial = 0;
  private signature = '';
  private left: THREE.Group | undefined;
  private pairs = new Map<Panel, { center: THREE.Vector3; position: THREE.Vector3; distance: number; scale: number }>();
  private resizing: { controller: THREE.Group; panel: Panel; axis: 'width' | 'height'; inverse: THREE.Matrix4; plane: THREE.Plane; start: THREE.Vector3; width: number; height: number; pixels: number } | null = null;
  private unsubscribe: () => void;
  constructor(private scene: THREE.Scene) {
    this.unsubscribe = subscribeXR(() => this.syncVisibility());
    xr.togglePanel = id => {
      const panel = [...this.panels.values()].find(p => p.id === id);
      if (!panel) return;
      panel.shown = !panel.shown;
      if (!panel.shown) resetXRInput(true);
      this.syncVisibility();
      this.publish();
    };
  }
  private visible(panel: Panel) { return panel.shown && (panel.persistent || xrState().open) && (!panel.wrist || !!this.left); }
  private syncVisibility() {
    for (const panel of this.panels.values()) {
      panel.group.visible = this.visible(panel);
      if (!panel.group.visible) {
        for (const [controller, grab] of this.grabs) if (grab.panel === panel) this.grabs.delete(controller);
        this.pairs.delete(panel);
        if (this.resizing?.panel === panel) this.resizing = null;
      }
    }
  }
  resize(panel: Panel, width: number, height: number) {
    Object.assign(panel, layoutSize(width, height, panel.minWidth));
    panel.root.style.setProperty('--xr-width', `${panel.width}px`);
    panel.root.style.setProperty('--xr-height', `${panel.height}px`);
    panel.surface.refresh();
    panel.shell.resize(panel.surface.width, panel.surface.height);
  }
  beginResize(controller: THREE.Group, ray: THREE.Raycaster) {
    const hit = this.hit(ray);
    if (!hit || this.resizing || this.isHeld(controller) || [...this.grabs.values()].some(g => g.panel === hit.panel)) return false;
    const point = uvToDOM(hit.panel.root, hit.hit.uv!);
    const button = [...hit.panel.controls.querySelectorAll<HTMLElement>('[data-xr-resize]')].find(el => {
      const r = el.getBoundingClientRect(); return point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom;
    });
    if (!button) return false;
    const panel = hit.panel;
    panel.group.updateWorldMatrix(true, false);
    const inverse = panel.group.matrixWorld.clone().invert();
    this.resizing = { controller, panel, axis: button.dataset.xrResize as 'width' | 'height', inverse,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1).transformDirection(panel.group.matrixWorld), hit.hit.point),
      start: hit.hit.point.clone().applyMatrix4(inverse), width: panel.width, height: panel.height, pixels: panel.width / panel.surface.width };
    return true;
  }
  updateResize(controller: THREE.Group, ray: THREE.Raycaster) {
    const r = this.resizing;
    if (!r || r.controller !== controller) return;
    const p = ray.ray.intersectPlane(r.plane, new THREE.Vector3());
    if (!p) return;
    p.applyMatrix4(r.inverse).sub(r.start);
    this.resize(r.panel, r.width + (r.axis === 'width' ? p.x * r.pixels : 0), r.height - (r.axis === 'height' ? p.y * r.pixels : 0));
  }
  endResize(controller?: THREE.Group) { if (!controller || this.resizing?.controller === controller) this.resizing = null; }
  isResizing(controller: THREE.Group) { return this.resizing?.controller === controller; }
  private place(panel: Panel) {
    const head = xr.renderer!.xr.getCamera();
    panel.group.position.setFromMatrixPosition(head.matrixWorld);
    uprightQuaternion(head, panel.group.quaternion);
    const count = [...this.panels.values()].filter(p => p.shown && !p.utility).length;
    const places: Record<string, [number, number, number]> = {
      wrist: [-.55, -.2, -.8], tools: [.8, .15, -1.25], help: [-.8, .05, -1.25],
      keyboard: [0, -.7, -1.1], commands: [.8, -.55, -1.25], options: [0, .25, -1.05],
    };
    const offset: [number, number, number] = places[panel.id] ?? [(count % 3 - 1) * .7, 0, -1.25];
    panel.group.position.add(new THREE.Vector3(...offset).applyQuaternion(panel.group.quaternion));
  }
  refresh() {
    for (const [selector, id, title] of SOURCES) {
      const root = document.querySelector<HTMLElement>(selector);
      if (root && !root.dataset.xrSurface) { root.dataset.xrSurface = id; root.dataset.xrTitle = title; root.dataset.xrAuto = 'true'; }
    }
    document.querySelectorAll<HTMLElement>('.modalbg, .popover, .lightbox, .survivor-choice-overlay').forEach(root => {
      if (!root.dataset.xrSurface && !root.closest('[data-xr-surface]')) {
        root.dataset.xrSurface = `dialog-${++this.serial}`;
        root.dataset.xrTitle = root.getAttribute('aria-label') || root.querySelector('[aria-label]')?.getAttribute('aria-label') || root.querySelector('h2,h3')?.textContent || '操作・確認';
        root.dataset.xrAuto = 'true';
      }
    });
    for (const [root, panel] of this.panels) if (!root.isConnected) {
      this.remove(panel); this.panels.delete(root);
    }
    document.querySelectorAll<HTMLElement>('[data-xr-surface]').forEach(root => {
      if (!this.panels.has(root)) {
        const id = root.dataset.xrSurface!;
        const utility = root.dataset.xrUtility === 'true', wrist = id === 'wrist';
        const controls = document.createElement('div'); controls.className = 'xr-resize-controls';
        for (const axis of ['width', 'height']) { const button = document.createElement('button'); button.dataset.xrResize = axis; controls.append(button); }
        root.prepend(controls);
        const group = new THREE.Group();
        const panel: Panel = { id, root, utility, wrist, persistent: root.dataset.xrPersistent === 'true', controls, group, shell: new TerminalShell(group), ...panelLayout(root), title: root.dataset.xrTitle || root.getAttribute('aria-label') || id,
          shown: id === 'home' || !SOURCES.some(([, key]) => key === id), auto: root.dataset.xrAuto === 'true',
          surface: new TerminalSurface(root, wrist ? .32 : .58) };
        root.classList.add('xr-source'); panel.group.userData.noRay = true;
        this.resize(panel, panel.width, panel.height);
        this.scene.add(panel.group); this.panels.set(root, panel); this.place(panel);
      }
    });
    for (const panel of this.panels.values()) {
      panel.group.visible = this.visible(panel);
      panel.controls.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.textContent = t(button.dataset.xrResize === 'width' ? 'xrResizeWidth' : 'xrResizeHeight'); button.setAttribute('aria-label', button.textContent); });
      if (!panel.group.visible) continue;
      panel.surface.refresh();
      panel.shell.resize(panel.surface.width, panel.surface.height);
      if (panel.surface.mesh && !panel.surface.mesh.parent) panel.group.add(panel.surface.mesh);
    }
    this.update(this.left);
    this.publish();
  }
  private publish() {
    const panels = [...this.panels.values()].filter(p => !p.utility).map(p => ({ id: p.id, title: p.title, open: p.shown }));
    const signature = JSON.stringify(panels);
    if (this.signature !== signature) { this.signature = signature; xrPatch({ panels }); }
  }
  hit(ray: THREE.Raycaster) {
    // selectイベントや入力判定は、描画フレームの追従更新より先にも届く。
    this.update(this.left);
    this.syncVisibility();
    const candidates = [...this.panels.values()].filter(p => this.visible(p) && p.surface.mesh);
    for (const panel of candidates) panel.group.updateWorldMatrix(true, true);
    const hit = ray.intersectObjects(candidates.map(p => p.surface.mesh!), false)[0];
    const panel = hit && candidates.find(p => p.surface.mesh === hit.object);
    return panel && hit.uv ? { panel, hit } : null;
  }
  grab(controller: THREE.Group, ray: THREE.Raycaster) {
    const hit = this.hit(ray);
    if (!hit || hit.panel.wrist || this.isHeld(controller) || this.resizing?.panel === hit.panel || [...this.grabs.values()].filter(g => g.panel === hit.panel).length >= 2) return false;
    controller.updateWorldMatrix(true, false); hit.panel.group.updateWorldMatrix(true, false);
    if (!controller.matrixWorld.elements.every(Number.isFinite)) return false;
    this.grabs.set(controller, { panel: hit.panel, offset: controller.matrixWorld.clone().invert().multiply(hit.panel.group.matrixWorld) });
    this.rebase(hit.panel);
    return true;
  }
  release(controller?: THREE.Group) {
    this.update(this.left);
    const panel = controller && this.grabs.get(controller)?.panel;
    if (controller) this.grabs.delete(controller); else { this.grabs.clear(); this.pairs.clear(); this.endResize(); }
    if (panel) this.rebase(panel);
  }
  cancel(controller?: THREE.Group) {
    const panel = controller && this.grabs.get(controller)?.panel;
    if (controller) this.grabs.delete(controller); else { this.grabs.clear(); this.pairs.clear(); }
    this.endResize(controller);
    if (panel) this.rebase(panel);
  }
  isHeld(controller: THREE.Group) { return this.grabs.has(controller); }
  private rebase(panel: Panel) {
    const hands = [...this.grabs].filter(([, g]) => g.panel === panel);
    this.pairs.delete(panel);
    panel.group.updateWorldMatrix(true, false);
    for (const [hand, grab] of hands) { hand.updateWorldMatrix(true, false); grab.offset.copy(hand.matrixWorld).invert().multiply(panel.group.matrixWorld); }
    if (hands.length === 2) {
      const a = hands[0][0].getWorldPosition(new THREE.Vector3()), b = hands[1][0].getWorldPosition(new THREE.Vector3());
      this.pairs.set(panel, { center: a.clone().add(b).multiplyScalar(.5), position: panel.group.position.clone(), distance: a.distanceTo(b), scale: panel.group.scale.x });
    }
  }
  distance(controller: THREE.Group, axis: number, dt: number) {
    const grab = this.grabs.get(controller);
    if (!grab) return false;
    if (this.pairs.has(grab.panel)) return true;
    const p = new THREE.Vector3().setFromMatrixPosition(grab.offset), distance = p.length();
    const next = panelDistance(distance, axis, dt);
    if (distance > .001 && Number.isFinite(next)) { p.multiplyScalar(next / distance); grab.offset.setPosition(p); }
    return true;
  }
  update(left: THREE.Group | undefined) {
    this.left = left;
    this.syncVisibility();
    for (const controller of [...this.grabs.keys()]) {
      controller.updateWorldMatrix(true, false);
      if (!controller.matrixWorld.elements.every(Number.isFinite)) this.cancel(controller);
    }
    for (const [controller, grab] of this.grabs) {
      if (this.pairs.has(grab.panel)) continue;
      controller.updateWorldMatrix(true, false);
      new THREE.Matrix4().multiplyMatrices(controller.matrixWorld, grab.offset).decompose(grab.panel.group.position, grab.panel.group.quaternion, grab.panel.group.scale);
    }
    for (const [panel, pair] of [...this.pairs]) {
      const hands = [...this.grabs].filter(([, g]) => g.panel === panel).map(([hand]) => hand.getWorldPosition(new THREE.Vector3()));
      if (hands.length !== 2 || !hands.every(p => p.toArray().every(Number.isFinite))) continue;
      const distance = hands[0].distanceTo(hands[1]);
      if (pair.distance < .03) { this.rebase(panel); continue; }
      const scale = panelScale(distance, pair.distance, pair.scale), ratio = scale / pair.scale;
      panel.group.position.copy(pair.position).sub(pair.center).multiplyScalar(ratio).add(hands[0].add(hands[1]).multiplyScalar(.5));
      panel.group.scale.setScalar(scale);
    }
    const wrist = [...this.panels.values()].find(p => p.wrist);
    if (wrist && left) {
      left.getWorldPosition(wrist.group.position); left.getWorldQuaternion(wrist.group.quaternion);
      wrist.group.position.add(new THREE.Vector3(.02, .12, -.05).applyQuaternion(wrist.group.quaternion));
      wrist.group.rotateX(-Math.PI / 2);
    }
  }
  private remove(panel: Panel) {
    resetXRInput(true);
    for (const [controller, grab] of this.grabs) if (grab.panel === panel) this.grabs.delete(controller);
    panel.shell.dispose(); panel.surface.dispose(); panel.group.removeFromParent(); panel.root.classList.remove('xr-source');
    this.pairs.delete(panel); if (this.resizing?.panel === panel) this.resizing = null;
    panel.controls.remove(); panel.root.style.removeProperty('--xr-width'); panel.root.style.removeProperty('--xr-height');
    if (panel.auto) { delete panel.root.dataset.xrSurface; delete panel.root.dataset.xrTitle; delete panel.root.dataset.xrAuto; }
  }
  dispose() {
    this.unsubscribe();
    for (const panel of this.panels.values()) this.remove(panel);
    this.panels.clear(); this.grabs.clear(); this.left = undefined; xr.togglePanel = null; xrPatch({ panels: [] });
  }
}
