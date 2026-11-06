import { TEAMS, HALF, ARENA_SIZE, OBSTACLES } from './config.js';

export class Hud {
  constructor(root) {
    this.root = root;
    this.panes = [0, 1, 2, 3].map((i) => this.buildPane(i));
    this.humans = 2;
    this.timer = root.querySelector('#timer');
    this.pct = [root.querySelector('#pct-a'), root.querySelector('#pct-b')];
    this.mini = root.querySelector('#minimap');
    this.miniCtx = this.mini.getContext('2d');
  }

  buildPane(i) {
    const team = TEAMS[i % 2];
    const el = document.createElement('div');
    el.className = 'pane';
    el.dataset.p = i;
    el.style.setProperty('--team', team.css);
    el.style.setProperty('--enemy', TEAMS[1 - (i % 2)].css);
    el.innerHTML = `
      <div class="vignette"></div>
      <div class="hitflash"></div>
      <div class="reticle"></div>
      <div class="tag">P${i + 1} · ${team.name}</div>
      <div class="kd"></div>
      <div class="vitals">
        <div class="tank"><div class="tank-fill"></div><span>INK</span></div>
        <div class="hp"><div class="hp-fill"></div></div>
      </div>
      <div class="notice"></div>
      <div class="toast"></div>`;
    this.root.insertBefore(el, this.root.querySelector('.divider'));
    const q = (s) => el.querySelector(s);
    return {
      el,
      tank: q('.tank'),
      fill: q('.tank-fill'),
      hp: q('.hp-fill'),
      vignette: q('.vignette'),
      flash: q('.hitflash'),
      reticle: q('.reticle'),
      kd: q('.kd'),
      notice: q('.notice'),
      toast: q('.toast'),
      toastT: 0,
      noticeText: null,
    };
  }

  show(visible) {
    this.root.classList.toggle('hidden', !visible);
  }

  // 1 human: full screen. 2: side by side. 3–4: quadrants (with 3, the empty bottom-right is an overview cam).
  layout(humans) {
    this.humans = humans;
    this.root.classList.toggle('solo', humans === 1);
    this.root.classList.toggle('quad', humans > 2);
    this.panes.forEach((p, i) => {
      const s = p.el.style;
      p.el.hidden = i >= humans;
      if (humans === 1) Object.assign(s, { left: '0', top: '0', width: '100%', height: '100%' });
      else if (humans === 2) Object.assign(s, { left: `${i * 50}%`, top: '0', width: '50%', height: '100%' });
      else Object.assign(s, { left: `${(i % 2) * 50}%`, top: `${Math.floor(i / 2) * 50}%`, width: '50%', height: '50%' });
    });
  }

  toast(i, text, dur = 2) {
    const p = this.panes[i];
    if (i >= this.humans) return;
    if (p.toast.textContent !== text) p.toast.textContent = text;
    p.toast.classList.add('show');
    p.toastT = dur;
  }

  notice(i, text) {
    const p = this.panes[i];
    if (i >= this.humans) return;
    if (p.noticeText === text) return;
    p.noticeText = text;
    p.notice.textContent = text;
    p.notice.classList.remove('pop');
    void p.notice.offsetWidth;
    if (text) p.notice.classList.add('pop');
  }

  hit(i) {
    if (i >= this.humans) return;
    const f = this.panes[i].flash;
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  update(dt, players, timeLeft, coverage) {
    players.forEach((p, i) => {
      if (i >= this.humans) return;
      const pane = this.panes[i];
      pane.fill.style.height = `${p.ink}%`;
      pane.tank.classList.toggle('low', p.ink < 15);
      pane.hp.style.width = `${Math.max(0, p.hp)}%`;
      pane.vignette.style.opacity = p.alive ? ((1 - p.hp / 100) * 0.9).toFixed(3) : 0;
      pane.reticle.style.opacity = p.alive && !p.squid ? 1 : 0.15;
      const kd = `${p.kills} splats · ${p.deaths} splatted`;
      if (pane.kd.textContent !== kd) pane.kd.textContent = kd;
      if (pane.toastT > 0) {
        pane.toastT -= dt;
        if (pane.toastT <= 0) pane.toast.classList.remove('show');
      }
    });
    const t = Math.max(0, Math.ceil(timeLeft));
    const text = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    if (this.timer.textContent !== text) this.timer.textContent = text;
    this.timer.classList.toggle('hurry', timeLeft <= 30);
    coverage.forEach((c, i) => {
      const s = `${(c * 100).toFixed(1)}%`;
      if (this.pct[i].textContent !== s) this.pct[i].textContent = s;
    });
  }

  drawMinimap(paint, players) {
    const c = this.miniCtx;
    const S = this.mini.width;
    const toMap = (v) => ((v + HALF) / ARENA_SIZE) * S;
    c.drawImage(paint.canvas, 0, 0, S, S);
    c.fillStyle = '#e9e6dc';
    c.strokeStyle = '#1d2030';
    c.lineWidth = 1;
    for (const o of OBSTACLES) {
      const x = toMap(o.minX);
      const y = toMap(o.minZ);
      const w = (o.w / ARENA_SIZE) * S;
      const h = (o.d / ARENA_SIZE) * S;
      c.fillRect(x, y, w, h);
      c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    for (const p of players) {
      if (!p.alive) continue;
      c.save();
      c.translate(toMap(p.pos.x), toMap(p.pos.z));
      c.rotate(Math.PI - p.yaw);
      c.beginPath();
      c.moveTo(0, -8);
      c.lineTo(6, 6);
      c.lineTo(-6, 6);
      c.closePath();
      c.fillStyle = p.team.css;
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = '#fff';
      c.stroke();
      c.restore();
      if (players.length > 2) {
        c.font = 'bold 10px Rubik, sans-serif';
        c.fillStyle = '#fff';
        c.textAlign = 'center';
        c.fillText(String(p.index + 1), toMap(p.pos.x), toMap(p.pos.z) - 10);
      }
    }
  }
}
