// VELVET BAY — the HUD and the menus. Health, cash, style score, wanted
// stars, the mission objective, speed, a live 2D minimap, the mission
// intro cards, banners, and the title / pause / busted / story-complete
// screens. The performance overlay (FPS + pixel ratio) shows on F3 or
// ?fps=1, so a playtest can prove the game holds 60.
//
// Shape of the code: the constructor grabs the DOM in named groups
// (bars, labels, screens) instead of one flat list, and update() is a
// fan-out to one small method per HUD section, so each section can be
// read and changed on its own.
import { CFG } from './config.js';

const HEALTH_COLORS = [
  { above: 50, color: '#2ecc71' },
  { above: 25, color: '#f39c12' },
  { above: -1, color: '#e74c3c' },
];

const SCREEN_IDS = ['screen-title', 'screen-pause', 'screen-busted', 'screen-story'];

function grab(ids) {
  const out = {};
  for (const id of ids) out[id] = document.getElementById(id);
  return out;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

export class HUD {
  constructor() {
    this.bars = grab(['health-fill']);
    this.labels = grab([
      'cash', 'style', 'stars', 'objective', 'mission-name', 'speed',
      'ammo', 'clock', 'hint', 'waypoint-dist', 'perf',
    ]);
    this.overlays = grab(['hud', 'banner', 'banner-title', 'banner-sub', 'intro', 'intro-title', 'intro-brief', 'waypoint']);
    this.screens = grab([...SCREEN_IDS, 'title-best', 'pause-best', 'busted-reason', 'story-cash']);
    this.mapCanvas = document.getElementById('minimap');
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.bannerT = 0;
    this.introT = 0;
    this.mapFrame = 0;
    // Back-compat handles: the rest of the HUD code reads through this.el.
    this.el = { ...this.bars, ...this.labels, ...this.overlays, ...this.screens, minimap: this.mapCanvas };
  }

  fmtClock(min) {
    const h = Math.floor(min / 60) % 24;
    const m = Math.floor(min % 60);
    return pad2(h) + ':' + pad2(m);
  }

  fmtCash(n) {
    return '$' + Math.floor(n).toLocaleString('en-US');
  }

  _healthColor(health) {
    for (const band of HEALTH_COLORS) {
      if (health > band.above) return band.color;
    }
    return HEALTH_COLORS[HEALTH_COLORS.length - 1].color;
  }

  _showVitals(s) {
    const bar = this.bars['health-fill'];
    bar.style.width = Math.max(0, s.health) + '%';
    bar.style.background = this._healthColor(s.health);
    this.labels.cash.textContent = this.fmtCash(s.cash);
    this.labels.style.textContent = s.styleMult > 1
      ? 'STYLE x' + s.styleMult.toFixed(1) + ' · ' + Math.floor(s.stylePoints) + ' pts'
      : 'STYLE x1.0';
  }

  _showStars(s) {
    let stars = '';
    for (let i = 0; i < CFG.maxStars; i++) stars += i < s.stars ? '★' : '☆';
    this.labels.stars.textContent = stars;
    this.labels.stars.style.color = s.stars > 0 ? '#ffd23f' : '#888888';
  }

  _showMission(s) {
    this.labels['mission-name'].textContent = s.missionName;
    let line = s.objective;
    if (s.timer > 0) line += '  —  ' + Math.ceil(s.timer) + 's';
    this.labels.objective.textContent = line;
  }

  _showDrive(s) {
    this.labels.speed.textContent = s.inCar ? Math.round(Math.abs(s.speed) * 3.6) + ' km/h' : '';
    this.labels.ammo.textContent = 'Ammo ' + s.ammo + ' / ' + CFG.pistolMag;
    this.labels.clock.textContent = this.fmtClock(s.clockMin);
    this.labels.hint.textContent = s.inCar
      ? 'WASD drive · Space handbrake (drift!) · E exit · F punch · Click shoot · Esc pause'
      : 'WASD move · Shift sprint · Space jump · E enter car · F punch · Click shoot · Esc pause';
  }

  _showPerf(s) {
    if (!this.labels.perf || !s.perfVisible) return;
    this.labels.perf.textContent = Math.round(s.fps) + ' fps · x' + s.pixelRatio.toFixed(2) + ' · ' + s.drawCalls + ' calls';
  }

  _tickOverlays(s) {
    if (this.bannerT > 0) {
      this.bannerT -= s.dt;
      if (this.bannerT <= 0) this.overlays.banner.classList.add('hidden');
    }
    if (this.introT > 0) {
      this.introT -= s.dt;
      if (this.introT <= 0) this.overlays.intro.classList.add('hidden');
    }
  }

  update(s) {
    this._showVitals(s);
    this._showStars(s);
    this._showMission(s);
    this._showDrive(s);
    this._showPerf(s);
    this._tickOverlays(s);
    // The minimap redraws every other frame: it is 2D canvas work that
    // costs a little every frame for no visible gain at 60 fps.
    this.mapFrame += 1;
    if (this.mapFrame % 2 === 0) this._drawMinimap(s);
    this._drawWaypoint(s);
  }

  _drawMinimap(s) {
    const c = this.mapCtx;
    const W = 168;
    const H = 168;
    const pad = 30;
    const span = CFG.cityHalf * 2 + 2 * pad;
    const scale = W / span;
    const toX = (x) => (x + CFG.cityHalf + pad) * scale;
    const toY = (z) => (z + CFG.cityHalf + pad) * scale;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#14101e';
    c.fillRect(0, 0, W, H);
    // Sea strip at the bottom (south) with its sand edge.
    const seaTop = toY(CFG.beachZ);
    c.fillStyle = '#14324e';
    c.fillRect(0, seaTop, W, H - seaTop);
    c.fillStyle = '#cbb28a';
    c.fillRect(0, toY(CFG.beachZ - 12), W, seaTop - toY(CFG.beachZ - 12));
    // Roads, one stroke per road line.
    c.strokeStyle = '#4a4a58';
    c.lineWidth = 5;
    for (let i = -CFG.gridHalf; i <= CFG.gridHalf; i++) {
      const v = i * CFG.pitch;
      c.beginPath();
      c.moveTo(toX(v), 0);
      c.lineTo(toX(v), H);
      c.stroke();
      c.beginPath();
      c.moveTo(0, toY(v));
      c.lineTo(W, toY(v));
      c.stroke();
    }
    // Garage and safehouse squares.
    const mark = (pt, color) => {
      c.fillStyle = color;
      c.fillRect(toX(pt.x) - 3, toY(pt.z) - 3, 6, 6);
    };
    mark(s.garage, '#2ecc71');
    mark(s.safehouse, '#9b59b6');
    // Waypoint, pulsing.
    if (s.markerPos) {
      const pulse = 4 + Math.sin(performance.now() / 200) * 2;
      c.fillStyle = '#ff2e88';
      c.beginPath();
      c.arc(toX(s.markerPos.x), toY(s.markerPos.z), pulse, 0, Math.PI * 2);
      c.fill();
    }
    // Traffic as dots.
    c.fillStyle = '#dddddd';
    for (const t of s.traffic) {
      c.fillRect(toX(t.x) - 1.5, toY(t.z) - 1.5, 3, 3);
    }
    // Police, flashing red/blue.
    const flash = Math.floor(performance.now() / 250) % 2 === 0;
    c.fillStyle = flash ? '#2244ff' : '#ff2222';
    for (const u of s.police) {
      c.beginPath();
      c.arc(toX(u.x), toY(u.z), 3.5, 0, Math.PI * 2);
      c.fill();
    }
    // Player arrow, rotated to face the driving direction.
    const px = toX(s.playerPos.x);
    const py = toY(s.playerPos.z);
    c.save();
    c.translate(px, py);
    c.rotate(s.playerAngle);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(5, 5);
    c.lineTo(-5, 5);
    c.closePath();
    c.fill();
    c.restore();
  }

  _drawWaypoint(s) {
    const arrow = this.overlays.waypoint;
    const distEl = this.labels['waypoint-dist'];
    if (!s.markerPos) {
      arrow.style.display = 'none';
      distEl.style.display = 'none';
      return;
    }
    const dx = s.markerPos.x - s.playerPos.x;
    const dz = s.markerPos.z - s.playerPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 12) {
      arrow.style.display = 'none';
      distEl.style.display = 'none';
      return;
    }
    const worldAngle = Math.atan2(dx, dz);
    const rel = worldAngle - s.cameraYaw;
    arrow.style.display = 'block';
    arrow.style.transform = 'translate(-50%,-50%) rotate(' + (rel * 180 / Math.PI) + 'deg)';
    arrow.textContent = '▲';
    distEl.style.display = 'block';
    distEl.textContent = Math.round(dist) + 'm';
  }

  banner(title, sub, ms) {
    this.overlays['banner-title'].textContent = title;
    this.overlays['banner-sub'].textContent = sub || '';
    this.overlays.banner.classList.remove('hidden');
    this.bannerT = ms / 1000;
  }

  intro(name, brief) {
    this.overlays['intro-title'].textContent = name;
    this.overlays['intro-brief'].textContent = brief;
    this.overlays.intro.classList.remove('hidden');
    this.introT = 3.5;
  }

  _hideAllScreens() {
    for (const id of SCREEN_IDS) this.screens[id].classList.add('hidden');
  }

  showScreen(name, data) {
    this._hideAllScreens();
    if (name === 'title') {
      this.screens['title-best'].textContent = data.bestCash > 0
        ? 'Best cash ' + this.fmtCash(data.bestCash) + ' · Missions done ' + data.missionsDone
        : 'First run in Velvet Bay. Good luck, wheelman.';
      this.screens['screen-title'].classList.remove('hidden');
    } else if (name === 'pause') {
      this.screens['pause-best'].textContent = 'Cash ' + this.fmtCash(data.cash) + ' · Missions ' + data.missionsDone + ' / 5';
      this.screens['screen-pause'].classList.remove('hidden');
    } else if (name === 'busted') {
      this.screens['busted-reason'].textContent = data.reason || 'The Velvet Bay PD got you.';
      this.screens['screen-busted'].classList.remove('hidden');
    } else if (name === 'story') {
      this.screens['story-cash'].textContent = 'Final cash ' + this.fmtCash(data.cash) + ' — the job is done.';
      this.screens['screen-story'].classList.remove('hidden');
    }
    this.overlays.hud.classList.toggle('hidden', name === 'title');
  }

  hideScreens() {
    this._hideAllScreens();
    this.overlays.hud.classList.remove('hidden');
  }
}
