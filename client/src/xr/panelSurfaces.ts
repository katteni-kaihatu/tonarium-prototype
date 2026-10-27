import * as THREE from 'three';
import { TerminalSurface } from './surface.ts';
import { uprightQuaternion } from './pose.ts';
import { xr, xrPatch, xrState } from './runtime.ts';

interface Panel {
  id: string; title: string; root: HTMLElement; surface: TerminalSurface; group: THREE.Group;
  shown: boolean; utility: boolean; wrist: boolean; auto: boolean;
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
  constructor(private scene: THREE.Scene) {
    xr.togglePanel = id => {
      const panel = [...this.panels.values()].find(p => p.id === id);
      if (!panel) return;
      panel.shown = !panel.shown;
      if (panel.shown) this.place(panel);
      this.publish();
    };
  }
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
        const panel: Panel = { id, root, utility, wrist, title: root.dataset.xrTitle || root.getAttribute('aria-label') || id,
          shown: id === 'home' || !SOURCES.some(([, key]) => key === id), auto: root.dataset.xrAuto === 'true',
          surface: new TerminalSurface(root, wrist ? .32 : .58), group: new THREE.Group() };
        root.classList.add('xr-source'); panel.group.userData.noRay = true;
        this.scene.add(panel.group); this.panels.set(root, panel); this.place(panel);
      }
    });
    for (const panel of this.panels.values()) {
      panel.group.visible = panel.shown && (panel.utility || xrState().open);
      if (!panel.group.visible) continue;
      panel.surface.refresh();
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
    const candidates = [...this.panels.values()].filter(p => p.group.visible && p.surface.mesh);
    for (const panel of candidates) panel.group.updateWorldMatrix(true, true);
    const hit = ray.intersectObjects(candidates.map(p => p.surface.mesh!), false)[0];
    const panel = hit && candidates.find(p => p.surface.mesh === hit.object);
    return panel && hit.uv ? { panel, hit } : null;
  }
  grab(controller: THREE.Group, ray: THREE.Raycaster) {
    const hit = this.hit(ray);
    if (!hit || hit.panel.wrist || [...this.grabs.values()].some(g => g.panel === hit.panel)) return false;
    controller.updateWorldMatrix(true, false); hit.panel.group.updateWorldMatrix(true, false);
    this.grabs.set(controller, { panel: hit.panel, offset: controller.matrixWorld.clone().invert().multiply(hit.panel.group.matrixWorld) });
    return true;
  }
  release(controller?: THREE.Group) {
    this.update(this.left);
    if (controller) this.grabs.delete(controller); else this.grabs.clear();
  }
  update(left: THREE.Group | undefined) {
    this.left = left;
    for (const [controller, grab] of this.grabs) {
      controller.updateWorldMatrix(true, false);
      new THREE.Matrix4().multiplyMatrices(controller.matrixWorld, grab.offset).decompose(grab.panel.group.position, grab.panel.group.quaternion, grab.panel.group.scale);
    }
    const wrist = [...this.panels.values()].find(p => p.wrist);
    if (wrist && left) {
      left.getWorldPosition(wrist.group.position); left.getWorldQuaternion(wrist.group.quaternion);
      wrist.group.position.add(new THREE.Vector3(.02, .12, -.05).applyQuaternion(wrist.group.quaternion));
      wrist.group.rotateX(-Math.PI / 2);
    }
  }
  private remove(panel: Panel) {
    for (const [controller, grab] of this.grabs) if (grab.panel === panel) this.grabs.delete(controller);
    panel.surface.dispose(); panel.group.removeFromParent(); panel.root.classList.remove('xr-source');
    if (panel.auto) { delete panel.root.dataset.xrSurface; delete panel.root.dataset.xrTitle; delete panel.root.dataset.xrAuto; }
  }
  dispose() {
    for (const panel of this.panels.values()) this.remove(panel);
    this.panels.clear(); this.grabs.clear(); this.left = undefined; xr.togglePanel = null; xrPatch({ panels: [] });
  }
}
