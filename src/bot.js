import { HALF, SHOT } from './config.js';
import { obstacleAt } from './arena.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function clearLine(obstacles, a, b) {
  for (let k = 1; k < 10; k++) {
    const t = k / 10;
    if (obstacleAt(obstacles, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 1.0)) return false;
  }
  return true;
}

// A simple CPU player: paints unclaimed turf, fights the nearest enemy it can see, swims to refill.
// It produces the same input shape a human controller does.
export class Bot {
  constructor(me) {
    this.me = me;
    this.goal = null;
    this.retarget = 0;
    this.strafeDir = 1;
    this.strafeT = 0;
    this.refilling = false;
    this.stuckT = 0;
    this.lastX = me.pos.x;
    this.lastZ = me.pos.z;
    this.jitter = 0;
    this.jitterT = 0;
  }

  think(dt, game) {
    const out = { move: 0, strafe: 0, turn: 0, pitch: 0, fire: false, squid: false, bomb: false, jump: false };
    const { me } = this;
    if (!me.alive) {
      this.goal = null;
      return out;
    }
    if (me.ink < 10) this.refilling = true;
    else if (me.ink > 90) this.refilling = false;

    let foe = null;
    let dist = Infinity;
    for (const p of game.players) {
      if (p.teamId === me.teamId || !p.alive || p.invuln > 0) continue;
      const d = Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z);
      if (d < 14 && (!p.submerged || d < 4) && d < dist && clearLine(game.obstacles, me.pos, p.pos)) {
        foe = p;
        dist = d;
      }
    }
    const sees = !!foe;
    const dx = foe ? foe.pos.x - me.pos.x : 0;
    const dz = foe ? foe.pos.z - me.pos.z : 0;

    this.jitterT -= dt;
    if (this.jitterT <= 0) {
      this.jitterT = 0.3;
      this.jitter = (Math.random() - 0.5) * 0.14;
    }

    let yaw;
    let wantPitch = -0.15;
    if (sees && !this.refilling) {
      const lead = (dist / SHOT.speed) * 0.8;
      const lx = dx + foe.vel.x * lead;
      const lz = dz + foe.vel.z * lead;
      yaw = Math.atan2(lx, lz) + this.jitter;
      // Pick a pitch whose arc drops onto the target's torso.
      const t = Math.hypot(lx, lz) / SHOT.speed;
      const vy = (0.5 * SHOT.gravity * t * t + (foe.pos.y - me.pos.y) - 0.15) / Math.max(t, 0.05);
      wantPitch = (vy - SHOT.lift) / 10;
      out.fire = Math.abs(wrap(yaw - me.yaw)) < 0.25;
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeDir *= -1;
        this.strafeT = 0.4 + Math.random() * 0.8;
      }
      out.strafe = this.strafeDir;
      out.move = dist > 10 ? 0.7 : dist < 4 ? -0.6 : 0;
      if (me.ink > 75 && dist > 6 && dist < 11 && Math.random() < dt * 0.4) out.bomb = true;
    } else {
      this.retarget -= dt;
      const goalDist = this.goal ? Math.hypot(this.goal.x - me.pos.x, this.goal.z - me.pos.z) : 0;
      if (!this.goal || this.retarget <= 0 || goalDist < 1.5) this.pickGoal(game, false);
      yaw = Math.atan2(this.goal.x - me.pos.x, this.goal.z - me.pos.z);
      out.move = Math.abs(wrap(yaw - me.yaw)) < 1 ? 1 : 0.25;
      const onOwn = game.paint.ownerAt(me.pos.x, me.pos.z) === me.teamId;
      if (this.refilling || (onOwn && goalDist > 6)) out.squid = true;
      else out.fire = true;
    }

    this.stuckT += dt;
    if (this.stuckT > 0.8) {
      const moved = Math.hypot(me.pos.x - this.lastX, me.pos.z - this.lastZ);
      if (moved < 0.4 && (out.move || out.strafe)) {
        this.pickGoal(game, true);
        this.strafeDir *= -1;
        out.jump = true;
      }
      this.stuckT = 0;
      this.lastX = me.pos.x;
      this.lastZ = me.pos.z;
    }

    out.turn = -clamp(wrap(yaw - me.yaw) * 7, -4.5, 4.5);
    out.pitch = (wantPitch - me.pitch) * 8;
    return out;
  }

  pickGoal(game, random) {
    const { me } = this;
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 30; i++) {
      const x = (Math.random() * 2 - 1) * (HALF - 3);
      const z = (Math.random() * 2 - 1) * (HALF - 3);
      if (obstacleAt(game.obstacles, x, z, 0, 1)) continue;
      const owner = game.paint.ownerAt(x, z);
      const d = Math.hypot(x - me.pos.x, z - me.pos.z);
      let score = (owner === me.teamId ? 0 : owner === 0 ? 10 : 14) - d * 0.35 + Math.random() * 4;
      if (random) score = Math.random();
      if (score > bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }
    this.goal = best || { x: 0, z: 8 };
    this.retarget = 3 + Math.random() * 3;
  }
}
