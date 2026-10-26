import { Object3D, Quaternion, Vector3 } from 'three';
import type { SystemView } from '../../../shared/system-types.ts';

export interface SystemBindingOptions {
  hint?: string;
  setText?: (text: string) => void;
  getText?: () => string;
}
interface Binding {
  object: Object3D;
  position: Vector3;
  quaternion: Quaternion;
  userData: Object3D['userData'];
  options: SystemBindingOptions;
  originalText?: string;
  lastText?: string;
}

export class SystemObjectBindings {
  private bindings = new Map<string, Binding>();
  private latest?: SystemView;
  private closed = false;
  private errors: string[] = [];

  constructor(
    readonly scope: { sessionId: string; mapId: string },
    private onInteract: (objectId: string) => void,
    private onDiagnostic?: (diagnostics: string[]) => void,
  ) {}

  get diagnostics() { return [...this.errors]; }

  bind(objectId: string, object: Object3D, options: SystemBindingOptions = {}): () => void {
    if (this.closed) throw new Error('System object bindings are disposed');
    if (this.bindings.has(objectId) || [...this.bindings.values()].some(binding => binding.object === object)) throw new Error(`Object already bound: ${objectId}`);
    const binding: Binding = {
      object, options, position: object.position.clone(), quaternion: object.quaternion.clone(),
      userData: object.userData, originalText: options.getText?.(),
    };
    this.bindings.set(objectId, binding);
    this.apply(objectId, binding);
    this.report();
    return () => {
      if (this.bindings.get(objectId) !== binding) return;
      this.restore(binding); this.bindings.delete(objectId); this.report();
    };
  }

  update(sessionId: string, view?: SystemView): boolean {
    if (this.closed || sessionId !== this.scope.sessionId || (view && view.map.id !== this.scope.mapId)) return false;
    if (view && this.latest && view.revision < this.latest.revision) return false;
    this.latest = view;
    for (const [id, binding] of this.bindings) this.apply(id, binding);
    this.report();
    return true;
  }

  private restore(binding: Binding) {
    binding.object.position.copy(binding.position);
    binding.object.quaternion.copy(binding.quaternion);
    binding.object.userData = binding.userData;
    if (binding.originalText !== undefined && binding.lastText !== binding.originalText) binding.options.setText?.(binding.originalText);
    binding.lastText = binding.originalText;
    binding.object.updateMatrix();
  }

  private apply(id: string, binding: Binding) {
    const definition = this.latest?.map.objects.find(object => object.id === id);
    const value = this.latest?.objects[id];
    if (!definition || !value) {
      this.restore(binding);
      binding.object.userData = { ...binding.userData, use: undefined, noRay: true };
      return;
    }
    const parent = binding.object.parent;
    const position = new Vector3().fromArray(value.position);
    const quaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), definition.rotation ?? 0);
    // 定義はマップのワールド座標なので、既存モデルの親変換を二重に掛けない。
    if (parent) {
      parent.updateWorldMatrix(true, false);
      parent.worldToLocal(position);
      quaternion.premultiply(parent.getWorldQuaternion(new Quaternion()).invert());
    }
    binding.object.position.copy(position);
    binding.object.quaternion.copy(quaternion);
    binding.object.updateMatrix();
    binding.object.userData = definition.capabilities.includes('interact')
      ? { ...binding.userData, noRay: false, hint: binding.options.hint ?? definition.text ?? id, use: () => this.onInteract(id) }
      : binding.userData;
    const text = value.text ?? definition.text;
    if (text !== undefined && text !== binding.lastText) { binding.options.setText?.(text); binding.lastText = text; }
  }

  private report() {
    const diagnostics = [...this.bindings.keys()].filter(id => !this.latest?.map.objects.some(object => object.id === id) || !this.latest?.objects[id]).map(id => `System object unavailable: ${id}`);
    if (JSON.stringify(diagnostics) !== JSON.stringify(this.errors)) { this.errors = diagnostics; this.onDiagnostic?.([...diagnostics]); }
  }

  dispose() {
    if (this.closed) return;
    for (const binding of this.bindings.values()) this.restore(binding);
    this.bindings.clear(); this.latest = undefined; this.closed = true;
    if (this.errors.length) { this.errors = []; this.onDiagnostic?.([]); }
  }
}
