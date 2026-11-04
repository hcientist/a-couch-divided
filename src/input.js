import { MOVE } from './config.js';

export const KEYMAPS = [
  {
    fwd: ['KeyW'],
    back: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    strafeL: ['KeyQ'],
    strafeR: ['KeyE'],
    fire: ['KeyF'],
    squid: ['ShiftLeft', 'KeyC'],
    bomb: ['KeyR'],
  },
  {
    fwd: ['KeyI', 'ArrowUp'],
    back: ['KeyK', 'ArrowDown'],
    left: ['KeyJ', 'ArrowLeft'],
    right: ['KeyL', 'ArrowRight'],
    strafeL: ['KeyU'],
    strafeR: ['KeyO'],
    fire: ['KeyH', 'Slash'],
    squid: ['KeyN', 'Semicolon', 'Period'],
    bomb: ['KeyY', 'Comma'],
  },
];

const GAME_CODES = new Set([...KEYMAPS.flatMap((m) => Object.values(m).flat()), 'Space', 'Enter', 'Escape']);

// Standard-mapping gamepad buttons.
export const PAD = { A: 0, B: 1, X: 2, LB: 4, RB: 5, LT: 6, RT: 7, START: 9 };

const deadzone = (v) => (Math.abs(v) < 0.18 ? 0 : (Math.sign(v) * (Math.abs(v) - 0.18)) / 0.82);
const clamp1 = (v) => Math.max(-1, Math.min(1, v));

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.pads = [];
    this.prevButtons = new Map();
    this.padPressed = [];
    addEventListener('keydown', (e) => {
      if (GAME_CODES.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }

  poll() {
    const all = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    this.pads = all.filter((p) => p && p.connected).slice(0, 2);
    this.padPressed = this.pads.map((pad) => {
      const prev = this.prevButtons.get(pad.index) || [];
      const now = pad.buttons.map((b) => b.pressed || b.value > 0.4);
      this.prevButtons.set(pad.index, now);
      return now.map((v, i) => v && !prev[i]);
    });
  }

  endFrame() {
    this.pressed.clear();
  }

  key(code) {
    return this.pressed.has(code);
  }

  padButton(btn, slot = -1) {
    return this.padPressed.some((buttons, i) => (slot < 0 || slot === i) && buttons[btn]);
  }

  player(i) {
    const km = KEYMAPS[i];
    const held = (codes) => codes.some((c) => this.down.has(c));
    const tapped = (codes) => codes.some((c) => this.pressed.has(c));
    let move = (held(km.fwd) ? 1 : 0) - (held(km.back) ? 1 : 0);
    let strafe = (held(km.strafeR) ? 1 : 0) - (held(km.strafeL) ? 1 : 0);
    let turn = ((held(km.right) ? 1 : 0) - (held(km.left) ? 1 : 0)) * MOVE.turnKey;
    let pitch = 0;
    let fire = held(km.fire);
    let squid = held(km.squid);
    let bomb = tapped(km.bomb);

    const pad = this.pads[i];
    if (pad) {
      const ax = (n) => deadzone(pad.axes[n] || 0);
      const btn = (n) => !!pad.buttons[n] && (pad.buttons[n].pressed || pad.buttons[n].value > 0.4);
      move -= ax(1);
      strafe += ax(0);
      const rx = ax(2);
      turn += Math.sign(rx) * rx * rx * MOVE.turnPad;
      pitch -= ax(3) * MOVE.pitchPad;
      fire ||= btn(PAD.RT);
      squid ||= btn(PAD.LT) || btn(PAD.LB);
      bomb ||= !!this.padPressed[i][PAD.RB];
    }
    return { move: clamp1(move), strafe: clamp1(strafe), turn, pitch, fire, squid, bomb };
  }
}
