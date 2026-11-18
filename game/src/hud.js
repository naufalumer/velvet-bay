// VELVET BAY — the HUD and the menus. Health, cash, style score, wanted
// stars, the mission objective, speed, a live 2D minimap, the mission
// intro cards, banners, and the title / pause / busted / story-complete
// screens. The performance overlay (FPS + pixel ratio) shows on F3 or
// ?fps=1, so a playtest can prove the game holds 60.
import { CFG } from './config.js';

export class HUD {
  constructor() {
    this.el = {};
    for (const id of [
      'hud', 'health-fill', 'cash', 'style', 'stars', 'objective', 'mission-name',
      'speed', 'ammo', 'clock', 'minimap', 'banner', 'banner-title',
      'banner-sub', 'intro', 'intro-title', 'intro-brief', 'waypoint',
      'screen-title', 'screen-pause', 'screen-busted', 'screen-story',
      'busted-reason', 'story-cash', 'title-best', 'pause-best', 'hint', 'waypoint-dist',
      'perf',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCtx = this.el.minimap.getContext('2d');
    this.bannerT = 0;
    this.introT = 0;
    this.mapFrame = 0;
  }

  fmtClock(min) {
    const h = Math.floor(min / 60) % 24;
    const m = Math.floor(min % 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  fmtCash(n) {
    return '$' + Math.floor(n).toLocaleString('en-US');
  }

  update(s) {
    this.el['health-fill'].style.width = Math.max(0, s.health) + '%';
    this.el['health-fill'].style.background = s.health > 50 ? '#2ecc71' : s.health > 25 ? '#f39c12' : '#e74c3c';
    this.el.cash.textContent = this.fmtCash(s.cash);
    this.el.style.textContent = s.styleMult > 1
      ? 'STYLE x' + s.styleMult.toFixed(1) + ' · ' + Math.floor(s.stylePoints) + ' pts'
      : 'STYLE x1.0';
    let stars = '';
    for (let i = 0; i < CFG.maxStars; i++) stars += i < s.stars ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.style.color = s.stars > 0 ? '#ffd23f' : '#888888';
    this.el['mission-name'].textContent = s.missionName;
    this.el.objective.textContent = s.objective;
    this.el.speed.textContent = s.inCar ? Math.round(Math.abs(s.speed) * 3.6) + ' km/h' : '';
    this.el.ammo.textContent = 'Ammo ' + s.ammo + ' / ' + CFG.pistolMag;
    this.el.clock.textContent = this.fmtClock(s.clockMin);
    this.el.hint.textContent = s.inCar
      ? 'WASD drive · Space handbrake (drift!) · E exit · F punch · Click shoot · Esc pause'
      : 'WASD move · Shift sprint · Space jump · E enter car · F punch · Click shoot · Esc pause';
    if (s.timer > 0) {
      this.el.objective.textContent += '  —  ' + Math.ceil(s.timer) + 's';
    }
    if (this.bannerT > 0) {
      this.bannerT -= s.dt;
      if (this.bannerT <= 0) this.el.banner.classList.add('hidden');
    }
    if (this.introT > 0) {
      this.introT -= s.dt;
      if (this.introT <= 0) this.el.intro.classList.add('hidden');
    }
    if (this.el.perf && s.perfVisible) {
      this.el.perf.textContent = Math.round(s.fps) + ' fps · x' + s.pixelRatio.toFixed(2) + ' · ' + s.drawCalls + ' calls';
    }
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
    const scale = W / (CFG.cityHalf * 2 + 60);
    const toX = (x) => (x + CFG.cityHalf + 30) * scale;
    const toY = (z) => (z + CFG.cityHalf + 30) * scale;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#14101e';
    c.fillRect(0, 0, W, H);
    // Sea strip at the bottom (south).
    c.fillStyle = '#14324e';
    c.fillRect(0, toY(CFG.beachZ), W, H - toY(CFG.beachZ));
    c.fillStyle = '#cbb28a';
    c.fillRect(0, toY(CFG.beachZ - 12), W, toY(CFG.beachZ) - toY(CFG.beachZ - 12));
    // Roads.
    c.strokeStyle = '#4a4a58';
    c.lineWidth = 5;
    for (let i = -CFG.gridHalf; i <= CFG.gridHalf; i++) {
      const v = i * CFG.pitch;
      c.beginPath(); c.moveTo(toX(v), 0); c.lineTo(toX(v), H); c.stroke();
      c.beginPath(); c.moveTo(0, toY(v)); c.lineTo(W, toY(v)); c.stroke();
    }
    // Garage and safehouse.
    c.fillStyle = '#2ecc71';
    c.fillRect(toX(s.garage.x) - 3, toY(s.garage.z) - 3, 6, 6);
    c.fillStyle = '#9b59b6';
    c.fillRect(toX(s.safehouse.x) - 3, toY(s.safehouse.z) - 3, 6, 6);
    // Waypoint.
    if (s.markerPos) {
      const pulse = 4 + Math.sin(performance.now() / 200) * 2;
      c.fillStyle = '#ff2e88';
      c.beginPath();
      c.arc(toX(s.markerPos.x), toY(s.markerPos.z), pulse, 0, Math.PI * 2);
      c.fill();
    }
    // Traffic.
    c.fillStyle = '#dddddd';
    for (const t of s.traffic) {
      c.fillRect(toX(t.x) - 1.5, toY(t.z) - 1.5, 3, 3);
    }
    // Police, flashing.
    const flash = Math.floor(performance.now() / 250) % 2 === 0;
    c.fillStyle = flash ? '#2244ff' : '#ff2222';
    for (const u of s.police) {
      c.beginPath();
      c.arc(toX(u.x), toY(u.z), 3.5, 0, Math.PI * 2);
      c.fill();
    }
    // Player arrow.
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
    if (!s.markerPos) {
      this.el.waypoint.style.display = 'none';
      this.el['waypoint-dist'].style.display = 'none';
      return;
    }
    const dx = s.markerPos.x - s.playerPos.x;
    const dz = s.markerPos.z - s.playerPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 12) {
      this.el.waypoint.style.display = 'none';
      this.el['waypoint-dist'].style.display = 'none';
      return;
    }
    const worldAngle = Math.atan2(dx, dz);
    const rel = worldAngle - s.cameraYaw;
    this.el.waypoint.style.display = 'block';
    this.el.waypoint.style.transform = 'translate(-50%,-50%) rotate(' + (rel * 180 / Math.PI) + 'deg)';
    this.el.waypoint.textContent = '▲';
    this.el['waypoint-dist'].style.display = 'block';
    this.el['waypoint-dist'].textContent = Math.round(dist) + 'm';
  }

  banner(title, sub, ms) {
    this.el['banner-title'].textContent = title;
    this.el['banner-sub'].textContent = sub || '';
    this.el.banner.classList.remove('hidden');
    this.bannerT = ms / 1000;
  }

  intro(name, brief) {
    this.el['intro-title'].textContent = name;
    this.el['intro-brief'].textContent = brief;
    this.el.intro.classList.remove('hidden');
    this.introT = 3.5;
  }

  showScreen(name, data) {
    for (const k of ['screen-title', 'screen-pause', 'screen-busted', 'screen-story']) {
      this.el[k].classList.add('hidden');
    }
    if (name === 'title') {
      this.el['title-best'].textContent = data.bestCash > 0
        ? 'Best cash ' + this.fmtCash(data.bestCash) + ' · Missions done ' + data.missionsDone
        : 'First run in Velvet Bay. Good luck, wheelman.';
      this.el['screen-title'].classList.remove('hidden');
    } else if (name === 'pause') {
      this.el['pause-best'].textContent = 'Cash ' + this.fmtCash(data.cash) + ' · Missions ' + data.missionsDone + ' / 5';
      this.el['screen-pause'].classList.remove('hidden');
    } else if (name === 'busted') {
      this.el['busted-reason'].textContent = data.reason || 'The Velvet Bay PD got you.';
      this.el['screen-busted'].classList.remove('hidden');
    } else if (name === 'story') {
      this.el['story-cash'].textContent = 'Final cash ' + this.fmtCash(data.cash) + ' — the job is done.';
      this.el['screen-story'].classList.remove('hidden');
    }
    this.el.hud.classList.toggle('hidden', name === 'title');
  }

  hideScreens() {
    for (const k of ['screen-title', 'screen-pause', 'screen-busted', 'screen-story']) {
      this.el[k].classList.add('hidden');
    }
    this.el.hud.classList.remove('hidden');
  }
}
