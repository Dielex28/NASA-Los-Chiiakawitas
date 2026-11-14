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
  /** True once the player has touched the screen (shows on-screen controls). */
  touch = false;
  /** Right stick of a game controller, each axis −1..1 (looking around). */
  padLookX = 0;
  padLookY = 0;
  /** Left stick of a game controller. */
  private padX = 0;
  private padY = 0;
  private padHeld = new Set<string>();
  /** True once a game controller has been used. */
  gamepad = false;

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
    this.bindTouch(el);
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
    });
  }

  /**
   * Touch: one finger drags like the left button (a tap is a click); two fingers
   * rotate like the right button and pinch to zoom.
   */
  private bindTouch(el: HTMLElement): void {
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    let multi = false;
    const mid = (): { x: number; y: number; d: number } => {
      const a = [...pts.values()];
      return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) };
    };
    el.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.touch = true;
        for (const t of Array.from(e.changedTouches)) pts.set(t.identifier, { x: t.clientX, y: t.clientY });
        this.overView = true;
        if (pts.size === 1) {
          const t = e.changedTouches[0];
          this.mouseX = t.clientX;
          this.mouseY = t.clientY;
          this.buttons = 1;
          this.buttonsPressed |= 1;
          this.dragDist = 0;
          multi = false;
        } else if (pts.size === 2) {
          this.buttons = 4;
          this.dragDist = 99;
          multi = true;
          pinch = mid().d;
        }
      },
      { passive: false },
    );
    el.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        if (pts.size === 1) {
          const t = e.changedTouches[0];
          const p = pts.get(t.identifier);
          if (!p) return;
          const mx = t.clientX - p.x;
          const my = t.clientY - p.y;
          this.dx += mx;
          this.dy += my;
          this.dragDist += Math.abs(mx) + Math.abs(my);
          p.x = t.clientX;
          p.y = t.clientY;
          this.mouseX = t.clientX;
          this.mouseY = t.clientY;
        } else if (pts.size >= 2) {
          const before = mid();
          for (const t of Array.from(e.changedTouches)) {
            const p = pts.get(t.identifier);
            if (p) {
              p.x = t.clientX;
              p.y = t.clientY;
            }
          }
          const after = mid();
          this.dx += after.x - before.x;
          this.dy += after.y - before.y;
          this.wheel += (pinch - after.d) / 60;
          pinch = after.d;
        }
      },
      { passive: false },
    );
    const end = (e: TouchEvent): void => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) pts.delete(t.identifier);
      if (pts.size === 0) {
        if (!multi && this.buttons & 1) this.buttonsReleased |= 1;
        this.buttons = 0;
      } else if (pts.size === 1) {
        // one finger left after a pinch: keep looking around, but do not treat the lift as a tap
        this.buttons = 1;
        this.dragDist = 99;
      }
    };
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
  }

  /** Virtual key (on-screen buttons). */
  press(code: string): void {
    if (!this.down.has(code)) this.pressed.add(code);
    this.down.add(code);
  }
  release(code: string): void {
    this.down.delete(code);
    this.released.add(code);
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
    return Math.max(-1, Math.min(1, (this.key('KeyD') || this.key('ArrowRight') ? 1 : 0) - (this.key('KeyA') || this.key('ArrowLeft') ? 1 : 0) + this.stickX + this.padX));
  }
  axisY(): number {
    return Math.max(-1, Math.min(1, (this.key('KeyW') || this.key('ArrowUp') ? 1 : 0) - (this.key('KeyS') || this.key('ArrowDown') ? 1 : 0) + this.stickY + this.padY));
  }

  /**
   * Read the first game controller (standard mapping) and turn its buttons into the same
   * keys the keyboard uses, so every action works with either. Call at the start of a frame.
   *   left stick: move / drive · right stick: look · A: jump, jet, brake · B: EVA in/out (Tab)
   *   X: use (E) · Y: scanner (F) · LB: hammer and feather (G) · RB: run (Shift) · RT: throw (R)
   *   LT: rover in/out (V) · Start: pause (Esc) · Back: map (M) · d-pad up/down: time speed
   */
  pollGamepad(): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const p = Array.from(pads ?? []).find((x) => x && x.connected) ?? null;
    if (!p) {
      this.padX = this.padY = this.padLookX = this.padLookY = 0;
      for (const code of this.padHeld) this.release(code);
      this.padHeld.clear();
      return;
    }
    const dz = (v: number): number => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    this.padX = dz(p.axes[0] ?? 0);
    this.padY = -dz(p.axes[1] ?? 0);
    this.padLookX = dz(p.axes[2] ?? 0);
    this.padLookY = dz(p.axes[3] ?? 0);
    const map: Array<[number, string]> = [
      [0, 'Space'],
      [1, 'Tab'],
      [2, 'KeyE'],
      [3, 'KeyF'],
      [4, 'KeyG'],
      [5, 'ShiftLeft'],
      [6, 'KeyV'],
      [7, 'KeyR'],
      [8, 'KeyM'],
      [9, 'Escape'],
      [12, 'PadSpeedUp'],
      [13, 'PadSpeedDown'],
    ];
    for (const [i, code] of map) {
      const on = !!p.buttons[i]?.pressed;
      if (on && !this.padHeld.has(code)) {
        this.padHeld.add(code);
        this.press(code);
        this.gamepad = true;
      } else if (!on && this.padHeld.has(code)) {
        this.padHeld.delete(code);
        this.release(code);
      }
    }
    if (this.padX || this.padY || this.padLookX || this.padLookY) this.gamepad = true;
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
