import { MOVE } from './config.js';

// Every rebindable control, in the order the "set all" walkthrough asks for them.
// `tap` actions fire once per press; the rest are read while held.
export const ACTIONS = [
  { id: 'fwd', label: 'Move forward' },
  { id: 'back', label: 'Move back' },
  { id: 'left', label: 'Turn left' },
  { id: 'right', label: 'Turn right' },
  { id: 'strafeL', label: 'Strafe left' },
  { id: 'strafeR', label: 'Strafe right' },
  { id: 'aimUp', label: 'Aim up' },
  { id: 'aimDown', label: 'Aim down' },
  { id: 'fire', label: 'Shoot' },
  { id: 'squid', label: 'Squid (swim)' },
  { id: 'bomb', label: 'Splat bomb', tap: true },
  { id: 'jump', label: 'Jump', tap: true },
];

const DEFAULT_KEYS = [
  {
    fwd: ['KeyW'],
    back: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    strafeL: ['KeyQ'],
    strafeR: ['KeyE'],
    aimUp: [],
    aimDown: [],
    fire: ['KeyF'],
    squid: ['ShiftLeft', 'KeyC'],
    bomb: ['KeyR'],
    jump: ['Space'],
  },
  {
    fwd: ['KeyI', 'ArrowUp'],
    back: ['KeyK', 'ArrowDown'],
    left: ['KeyJ', 'ArrowLeft'],
    right: ['KeyL', 'ArrowRight'],
    strafeL: ['KeyU'],
    strafeR: ['KeyO'],
    aimUp: [],
    aimDown: [],
    fire: ['KeyH', 'Slash'],
    squid: ['KeyN', 'Semicolon', 'Period'],
    bomb: ['KeyY', 'Comma'],
    jump: ['Enter', 'ShiftRight', 'Numpad0'],
  },
  {},
  {},
];

// Standard-mapping gamepad buttons.
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, START: 9 };
const DEFAULT_PAD = { fire: [PAD.RT], squid: [PAD.LT, PAD.LB], bomb: [PAD.RB], jump: [PAD.A] };

// Keys the menus own; they can't be bound so a player can always get back out.
export const RESERVED_KEYS = new Set(['Escape', 'Backspace']);

const STORAGE_KEY = 'a-couch-divided.bindings.v1';

function defaults(i) {
  const keys = {};
  const pad = {};
  for (const { id } of ACTIONS) {
    keys[id] = [...(DEFAULT_KEYS[i][id] || [])];
    pad[id] = [...(DEFAULT_PAD[id] || [])];
  }
  return { keys, pad };
}

function loadBindings() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    // storage blocked or corrupt: fall back to defaults
  }
  return [0, 1, 2, 3].map((i) => {
    const b = defaults(i);
    const s = saved?.[i];
    if (s) {
      for (const { id } of ACTIONS) {
        if (Array.isArray(s.keys?.[id])) b.keys[id] = s.keys[id].filter((c) => typeof c === 'string');
        if (Array.isArray(s.pad?.[id])) b.pad[id] = s.pad[id].filter((n) => Number.isInteger(n));
      }
    }
    return b;
  });
}

const KEY_NAMES = {
  Space: 'Space',
  Enter: 'Enter',
  ShiftLeft: 'L-Shift',
  ShiftRight: 'R-Shift',
  ControlLeft: 'L-Ctrl',
  ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt',
  AltRight: 'R-Alt',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  Tab: 'Tab',
  CapsLock: 'Caps',
};
export function keyName(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

const PAD_NAMES = ['Ⓐ', 'Ⓑ', 'Ⓧ', 'Ⓨ', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Home'];
export const padName = (n) => PAD_NAMES[n] || `Button ${n}`;

const deadzone = (v) => (Math.abs(v) < 0.18 ? 0 : (Math.sign(v) * (Math.abs(v) - 0.18)) / 0.82);
const clamp1 = (v) => Math.max(-1, Math.min(1, v));

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.pads = [];
    this.prevButtons = new Map();
    this.padPressed = [];
    this.bindings = loadBindings();
    this.capture = null; // while set, the next key or pad button goes here instead of the game
    this.refreshCodes();
    addEventListener('keydown', (e) => {
      if (this.capture) {
        e.preventDefault();
        if (!e.repeat) this.capture({ kind: 'key', code: e.code });
        return;
      }
      if (this.gameCodes.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }

  refreshCodes() {
    const bound = this.bindings.flatMap((b) => Object.values(b.keys).flat());
    this.gameCodes = new Set([...bound, 'Space', 'Enter', 'Escape']);
  }

  save() {
    this.refreshCodes();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
    } catch {
      // private window / blocked storage: bindings still apply for this session
    }
  }

  // Binds one key or pad button to player i's action, replacing that action's other bindings of the
  // same kind. A key belongs to one action for the whole keyboard, so it's taken off anything else;
  // a pad button only conflicts within the same player (each player has their own pad).
  // Returns the [{player, action}] that lost the input.
  bind(i, action, input) {
    const displaced = [];
    if (input.kind === 'key') {
      this.bindings.forEach((b, p) => {
        for (const { id } of ACTIONS) {
          if (p === i && id === action) continue;
          const list = b.keys[id];
          const at = list.indexOf(input.code);
          if (at >= 0) {
            list.splice(at, 1);
            displaced.push({ player: p, action: id });
          }
        }
      });
      this.bindings[i].keys[action] = [input.code];
    } else {
      const pad = this.bindings[i].pad;
      for (const { id } of ACTIONS) {
        if (id === action) continue;
        const at = pad[id].indexOf(input.button);
        if (at >= 0) {
          pad[id].splice(at, 1);
          displaced.push({ player: i, action: id });
        }
      }
      pad[action] = [input.button];
    }
    this.save();
    return displaced;
  }

  resetBindings(i) {
    this.bindings[i] = defaults(i);
    this.save();
  }

  poll() {
    const all = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    this.pads = all.filter((p) => p && p.connected).slice(0, 4);
    this.padPressed = this.pads.map((pad) => {
      const prev = this.prevButtons.get(pad.index) || [];
      const now = pad.buttons.map((b) => b.pressed || b.value > 0.4);
      this.prevButtons.set(pad.index, now);
      return now.map((v, i) => v && !prev[i]);
    });
    if (this.capture) {
      for (const buttons of this.padPressed) {
        const button = buttons.indexOf(true);
        if (button >= 0) {
          this.capture({ kind: 'pad', button });
          break;
        }
      }
      this.padPressed = this.padPressed.map((b) => b.map(() => false));
    }
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

  // Which gamepad (index into this.pads) drives player i when `humans` people are playing.
  // P1/P2 can use the keyboard, so pads fill the remaining players first: with 3 humans and
  // 1 pad the pad is P3; with 4 humans and 2 pads they're P3 and P4; with 4 pads, P1–P4.
  padFor(i, humans) {
    const offset = Math.min(2, Math.max(0, humans - this.pads.length));
    const slot = i - offset;
    return slot >= 0 && slot < this.pads.length ? slot : -1;
  }

  player(i, humans = 2) {
    const { keys, pad: padMap } = this.bindings[i];
    const slot = this.padFor(i, humans);
    const pad = this.pads[slot];
    const btnDown = (n) => !!pad && !!pad.buttons[n] && (pad.buttons[n].pressed || pad.buttons[n].value > 0.4);
    const held = (a) => keys[a].some((c) => this.down.has(c)) || padMap[a].some(btnDown);
    const tapped = (a) => keys[a].some((c) => this.pressed.has(c)) || (!!pad && padMap[a].some((n) => this.padPressed[slot][n]));
    const axis = (pos, neg) => (held(pos) ? 1 : 0) - (held(neg) ? 1 : 0);

    let move = axis('fwd', 'back');
    let strafe = axis('strafeR', 'strafeL');
    let turn = axis('right', 'left') * MOVE.turnKey;
    let pitch = axis('aimUp', 'aimDown') * MOVE.pitchPad;
    const fire = held('fire');
    const squid = held('squid');
    const bomb = tapped('bomb');
    const jump = tapped('jump');

    // Sticks always work on top of whatever buttons are bound.
    if (pad) {
      const ax = (n) => deadzone(pad.axes[n] || 0);
      move -= ax(1);
      strafe += ax(0);
      const rx = ax(2);
      turn += Math.sign(rx) * rx * rx * MOVE.turnPad;
      pitch -= ax(3) * MOVE.pitchPad;
    }
    return { move: clamp1(move), strafe: clamp1(strafe), turn, pitch, fire, squid, bomb, jump };
  }
}
