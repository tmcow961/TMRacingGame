const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyS', 'KeyW', 'Escape', 'KeyP', 'Enter']);

export function isMobileDevice() {
  const userAgentMobile = navigator.userAgentData?.mobile === true
    || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return userAgentMobile || window.matchMedia?.('(pointer: coarse)').matches === true;
}

export class InputManager {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.touchDown = new Set();
    this.touchPressed = new Set();
    this.touchPointers = new Map();
    this.mobile = isMobileDevice();
    this.enabled = false;
    this.onPause = null;
    window.addEventListener('keydown', (event) => {
      if (this.enabled && GAME_KEYS.has(event.code)) event.preventDefault();
      if (!event.repeat) this.pressed.add(event.code);
      this.down.add(event.code);
      if (!event.repeat && (event.code === 'Escape' || event.code === 'KeyP')) this.onPause?.();
    });
    window.addEventListener('keyup', (event) => this.down.delete(event.code));
    window.addEventListener('blur', () => this.reset());
  }

  get steer() { return (this.down.has('KeyA') || this.down.has('ArrowLeft') || this.touchDown.has('left') ? 1 : 0) - (this.down.has('KeyD') || this.down.has('ArrowRight') || this.touchDown.has('right') ? 1 : 0); }
  get accelerating() { return (this.mobile && this.enabled) || this.down.has('KeyW') || this.down.has('ArrowUp'); }
  get braking() { return this.down.has('KeyS') || this.down.has('ArrowDown'); }
  consumeJump() {
    const active = this.pressed.has('Space') || this.touchPressed.has('jump');
    this.pressed.delete('Space');
    this.touchPressed.delete('jump');
    return active;
  }

  pressTouch(action, pointerId) {
    if (!this.enabled || !['left', 'right', 'jump'].includes(action)) return;
    this.touchPointers.set(pointerId, action);
    if (action === 'jump') this.touchPressed.add(action);
    else this.touchDown.add(action);
  }

  releaseTouch(pointerId) {
    const action = this.touchPointers.get(pointerId);
    if (!action) return;
    this.touchPointers.delete(pointerId);
    if (![...this.touchPointers.values()].includes(action)) this.touchDown.delete(action);
  }

  reset() { this.down.clear(); this.pressed.clear(); this.touchDown.clear(); this.touchPressed.clear(); this.touchPointers.clear(); }
  endFrame() { this.pressed.clear(); this.touchPressed.clear(); }
}
