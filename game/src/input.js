// VELVET BAY — keyboard and mouse. Tracks held keys, edge presses (a key
// that went down since the last frame), mouse movement for the orbit camera
// and pointer lock. Shot mode never asks for pointer lock. F3 toggles the
// small performance overlay (FPS + pixel ratio) for playtesting.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.locked = false;
    this.shotMode = false;
    this.onFirstGesture = null;
    this.onPerfToggle = null;
    this._gestured = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this._gesture();
      if (e.code === 'F3') {
        e.preventDefault();
        if (this.onPerfToggle) this.onPerfToggle();
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    this.canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this._gesture();
      if (!this.shotMode && e.button === 0 && !this.locked) {
        this.canvas.requestPointerLock();
      }
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _gesture() {
    if (!this._gestured) {
      this._gestured = true;
      if (this.onFirstGesture) this.onFirstGesture();
    }
  }

  held(code) {
    return this.keys.has(code);
  }

  // True once, on the frame the key went down.
  wasPressed(code) {
    return this.pressed.has(code);
  }

  axis() {
    let x = 0;
    let z = 0;
    if (this.held('KeyW') || this.held('ArrowUp')) z -= 1;
    if (this.held('KeyS') || this.held('ArrowDown')) z += 1;
    if (this.held('KeyA') || this.held('ArrowLeft')) x -= 1;
    if (this.held('KeyD') || this.held('ArrowRight')) x += 1;
    return { x, z };
  }

  consumeMouse() {
    const out = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return out;
  }

  endFrame() {
    this.pressed.clear();
  }

  // Synthetic input for the playtest harness and shot staging.
  press(code) {
    this.keys.add(code);
    this.pressed.add(code);
  }

  release(code) {
    this.keys.delete(code);
  }
}
