const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyS', 'KeyW', 'Escape', 'KeyP', 'Enter']);

export class InputManager {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.enabled = false;
    this.onPause = null;
    window.addEventListener('keydown', (event) => {
      if (this.enabled && GAME_KEYS.has(event.code)) event.preventDefault();
      if (!event.repeat) this.pressed.add(event.code);
      this.down.add(event.code);
      if (!event.repeat && (event.code === 'Escape' || event.code === 'KeyP')) this.onPause?.();
    });
    window.addEventListener('keyup', (event) => this.down.delete(event.code));
    window.addEventListener('blur', () => { this.down.clear(); this.pressed.clear(); });
  }

  get steer() { return (this.down.has('KeyA') || this.down.has('ArrowLeft') ? 1 : 0) - (this.down.has('KeyD') || this.down.has('ArrowRight') ? 1 : 0); }
  get accelerating() { return this.down.has('KeyW') || this.down.has('ArrowUp'); }
  get braking() { return this.down.has('KeyS') || this.down.has('ArrowDown'); }
  consumeJump() {
    const active = this.pressed.has('Space');
    this.pressed.delete('Space');
    return active;
  }
  endFrame() { this.pressed.clear(); }
}
