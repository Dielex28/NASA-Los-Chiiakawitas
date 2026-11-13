/** Keyboard, mouse and touch state, sampled once per frame. */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  /** Mouse movement since last frame (pointer-lock aware), pixels. */
  dx = 0;
  dy = 0;
  wheel = 0;
  buttons = 0;
  private buttonsPressed = 0;
  private buttonsReleased = 0;
  /** True while the pointer is over the 3D view rather than a UI panel. */
  overView = true;
  locked = false;
  /** Virtual stick from touch controls, each axis −1..1. */
  stickX = 0;
  stickY = 0;
  /** Total mouse travel while a button is held (to tell clicks from drags). */
  dragDist = 0;
  enabled = true;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.buttons = 0;
    });
    el.addEventListener('mousedown', (e) => {
      this.buttons |= 1 << e.button;
      this.buttonsPressed |= 1 << e.button;
      this.dragDist = 0;
      this.overView = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (this.buttons & (1 << e.button)) this.buttonsReleased |= 1 << e.button;
      this.buttons &= ~(1 << e.button);
    });
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.dx += e.movementX;
      this.dy += e.movementY;
      if (this.buttons) this.dragDist += Math.abs(e.movementX) + Math.abs(e.movementY);
      this.overView = e.target === el;
    });
    el.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 100 || 1);
        e.preventDefault();
      },
      { passive: false },
    );
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
    });
  }

  key(code: string): boolean {
    return this.enabled && this.down.has(code);
  }
  hit(code: string): boolean {
    return this.enabled && this.pressed.has(code);
  }
  up(code: string): boolean {
    return this.released.has(code);
  }
  button(i: number): boolean {
    return (this.buttons & (1 << i)) !== 0;
  }
  buttonHit(i: number): boolean {
    return (this.buttonsPressed & (1 << i)) !== 0;
  }
  buttonUp(i: number): boolean {
    return (this.buttonsReleased & (1 << i)) !== 0;
  }
  /** A release that was not the end of a drag. */
  click(i: number): boolean {
    return this.buttonUp(i) && this.dragDist < 6;
  }

  axisX(): number {
    return (this.key('KeyD') || this.key('ArrowRight') ? 1 : 0) - (this.key('KeyA') || this.key('ArrowLeft') ? 1 : 0) + this.stickX;
  }
  axisY(): number {
    return (this.key('KeyW') || this.key('ArrowUp') ? 1 : 0) - (this.key('KeyS') || this.key('ArrowDown') ? 1 : 0) + this.stickY;
  }

  lock(): void {
    if (!this.locked) {
      try {
        const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
        p?.catch?.(() => undefined);
      } catch {
        /* pointer lock unavailable (e.g. embedded frame): drag-to-look still works */
      }
    }
  }
  unlock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Call at the end of each frame. */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.buttonsPressed = 0;
    this.buttonsReleased = 0;
  }
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
