export const CROUCH_WEIGHT = 0.65;

export class CrouchInput {
  private pressed = false;
  active = false;

  constructor(private publish: (active: boolean) => void) {}

  down(context: { typing: boolean; operating: boolean; camera: boolean; repeat: boolean }) {
    if (this.pressed || context.repeat) return;
    this.pressed = true;
    if (context.typing) return;
    if (context.camera) { this.cancel(); return 'photo'; }
    if (!context.operating) return;
    this.active = true;
    this.publish(true);
  }

  cancel() {
    if (!this.active) return;
    this.active = false;
    this.publish(false);
  }

  release() { this.pressed = false; this.cancel(); }
}
