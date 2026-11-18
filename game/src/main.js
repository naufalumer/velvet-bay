// VELVET BAY — bootstrap and the main loop. Owns the renderer, the camera,
// the state machine (title / playing / paused / busted / story), and wires
// every system together: city, player, cars, traffic, police, combat,
// missions, HUD, effects and audio.
//
// Smoothness is the whole point of this build, so the loop owns three
// things the first version did not:
//   1. A dynamic-resolution scaler: it watches an EMA of frame time and
//      steps the renderer's pixel ratio down (2 -> 1.5 -> 1.25 -> 1) when
//      frames run long, and back up when they run short, so the game
//      holds 60 fps on weak machines instead of stuttering.
//   2. A speed-sensitive field of view: the chase camera widens a little
//      at top speed, which reads as fast without costing a frame.
//   3. A style system: drifting and near misses at speed build a
//      multiplier that pays out in cash with each mission, so driving
//      well is worth more than driving safe.
import * as THREE from 'three';
import { CFG } from './config.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { buildCity } from './city.js';
import { Player } from './player.js';
import { DriveCar } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { Effects } from './effects.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '1', 10) || 1;
const shotName = params.get('shot');
const shotMode = !!shotName;
const perfParam = params.get('fps') === '1';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
// Pixel ratio starts at the top step; the scaler below moves it.
let ratioStep = 0;
renderer.setPixelRatio(CFG.pixelRatioSteps[ratioStep]);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

const city = buildCity(scene, seed);
const input = new Input(canvas);
input.shotMode = shotMode;
const audio = new AudioSys();
const effects = new Effects(scene);
const player = new Player(scene, city.start);
const traffic = new Traffic(scene, city, seed);
const police = new Police(scene, city, seed);
const combat = new Combat(effects, audio);
combat.attach(scene);
const missions = new Missions(scene, city);
const hud = new HUD();

const SAVE_KEY = 'velvet-bay-save-v1';
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { bestCash: 0, missionsDone: 0 };
    const d = JSON.parse(raw);
    return { bestCash: d.bestCash || 0, missionsDone: d.missionsDone || 0 };
  } catch {
    return { bestCash: 0, missionsDone: 0 };
  }
}
function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ bestCash: save.bestCash, missionsDone: save.missionsDone }));
  } catch { /* storage unavailable: the game still plays */ }
}
const save = loadSave();

// Performance overlay: F3 or ?fps=1. The playtest reads window.__fps.
let perfVisible = perfParam;
const perfEl = document.getElementById('perf');
function applyPerfVisibility() {
  if (perfEl) perfEl.classList.toggle('hidden', !perfVisible);
}
input.onPerfToggle = () => {
  perfVisible = !perfVisible;
  applyPerfVisibility();
};
applyPerfVisibility();

const state = {
  mode: 'title',
  cash: 0,
  clockMin: CFG.startClockMin,
  inCar: false,
  playerCar: null,
  parked: [],
  camYaw: Math.PI,
  camPitch: 0.3,
  duskT: CFG.startDusk,
  lastRamAt: 0,
  exhaustT: 0,
  playerPos: player.pos,
  stars: 0,
  police,
  audio,
  stylePoints: 0,
  styleMult: 1,
  onMissionComplete,
  onMissionFailed,
  onStoryComplete,
};

function onMissionComplete(index, reward, styleBonus) {
  save.missionsDone = Math.max(save.missionsDone, index + 1);
  save.bestCash = Math.max(save.bestCash, state.cash);
  writeSave();
  const styleText = styleBonus > 0 ? ' (incl. $' + styleBonus + ' style)' : '';
  hud.banner('Mission complete', 'Mission ' + (index + 1) + ' — +$' + reward + styleText, 3200);
  state.stylePoints = 0;
  state.styleMult = 1;
}

function onMissionFailed(index, reason) {
  hud.banner('Mission failed', reason + ' Try again.', 3000);
}

function onStoryComplete() {
  save.missionsDone = 5;
  save.bestCash = Math.max(save.bestCash, state.cash);
  writeSave();
  state.mode = 'story';
  hud.showScreen('story', { cash: state.cash });
  if (document.pointerLockElement) document.exitPointerLock();
}

function takeCarAt(x, z, color, angle) {
  const near = traffic.nearestCar(new THREE.Vector3(x, 0, z), 14);
  if (near) {
    near.taken = true;
    scene.remove(near.mesh);
    return new DriveCar(scene, near.color, near.pos.x, near.pos.z, angle, false);
  }
  return new DriveCar(scene, color, x, z, angle, false);
}

function enterCar(car) {
  if (state.playerCar && state.playerCar !== car) state.parked.push(state.playerCar);
  state.playerCar = car;
  state.inCar = true;
  player.mesh.visible = false;
  car.attachBeams(scene);
}

function exitCar() {
  const car = state.playerCar;
  if (!car) return;
  const f = car.forward();
  player.teleport(car.pos.x - f.x * 3.5, car.pos.z - f.z * 3.5);
  player.mesh.visible = true;
  state.inCar = false;
}

function stealNearestCar() {
  const near = traffic.nearestCar(player.pos, 4.5);
  if (near) {
    const car = takeCarAt(near.pos.x, near.pos.z, near.color, near.angle);
    car.stolen = true;
    enterCar(car);
    police.addCrime(1, player.pos);
    audio.pickup();
    hud.banner('Carjacked', 'The PD noticed. Lose them or live with it.', 2200);
    return true;
  }
  if (state.playerCar) {
    const d = Math.hypot(state.playerCar.pos.x - player.pos.x, state.playerCar.pos.z - player.pos.z);
    if (d < 4.5) {
      enterCar(state.playerCar);
      return true;
    }
  }
  return false;
}

function startGame() {
  audio.ensure();
  state.mode = 'playing';
  state.cash = 0;
  state.clockMin = CFG.startClockMin;
  state.duskT = CFG.startDusk;
  state.stylePoints = 0;
  state.styleMult = 1;
  hud.hideScreens();
  missions.startIntro();
  hud.intro(missions.name(), missions.brief());
}

function bust(reason) {
  if (state.mode !== 'playing') return;
  state.mode = 'busted';
  audio.busted();
  audio.setSiren(false);
  const fine = Math.min(state.cash, CFG.bustedFine);
  state.cash -= fine;
  hud.showScreen('busted', { reason: reason + ' Fine $' + fine + '.' });
  if (document.pointerLockElement) document.exitPointerLock();
  player.teleport(city.hospital.x, city.hospital.z);
  combat.healFull();
  police.clear();
  if (state.playerCar) {
    state.playerCar.speed = 0;
  }
}

function resumeFromBusted() {
  state.mode = 'playing';
  hud.hideScreens();
  player.mesh.visible = true;
  state.inCar = false;
}

// Menu buttons.
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-resume').addEventListener('click', () => {
  state.mode = 'playing';
  hud.hideScreens();
});
document.getElementById('btn-restart').addEventListener('click', () => location.reload());
document.getElementById('btn-busted').addEventListener('click', resumeFromBusted);
document.getElementById('btn-busted-restart').addEventListener('click', () => location.reload());
document.getElementById('btn-story').addEventListener('click', () => {
  state.mode = 'playing';
  hud.hideScreens();
});
document.getElementById('btn-mute').addEventListener('click', () => {
  audio.ensure();
  audio.setMuted(!audio.muted);
  document.getElementById('btn-mute').textContent = audio.muted ? 'Unmute' : 'Mute';
});
input.onFirstGesture = () => audio.ensure();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const skyDay = new THREE.Color(CFG.skyDay);
const skyDusk = new THREE.Color(CFG.skyDusk);
const sunDay = new THREE.Color(CFG.sunDay);
const sunDusk = new THREE.Color(CFG.sunDusk);
const tmpColor = new THREE.Color();
const tmpVec = new THREE.Vector3();

// ---- Dynamic-resolution scaler ----
let frameMsEma = 16.7;
let scalerCooldown = 0;
function scalerStep(dt, ms) {
  frameMsEma = frameMsEma * 0.95 + ms * 0.05;
  scalerCooldown -= dt;
  if (scalerCooldown > 0) return;
  const steps = CFG.pixelRatioSteps;
  if (frameMsEma > CFG.frameTimeHighMs && ratioStep < steps.length - 1) {
    ratioStep += 1;
    renderer.setPixelRatio(steps[ratioStep]);
    scalerCooldown = CFG.scalerCooldownSec;
  } else if (frameMsEma < CFG.frameTimeLowMs && ratioStep > 0) {
    ratioStep -= 1;
    renderer.setPixelRatio(steps[ratioStep]);
    scalerCooldown = CFG.scalerCooldownSec;
  }
}

function updateCamera(dt) {
  const target = state.inCar && state.playerCar ? state.playerCar.pos : player.pos;
  const tx = target.x;
  const ty = target.y + (state.inCar ? 2.2 : 2.0);
  const tz = target.z;
  let dist;
  let pitch;
  if (state.inCar && state.playerCar) {
    // Chase camera: ease behind the car's heading.
    const want = state.playerCar.angle + Math.PI;
    let diff = want - state.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    state.camYaw += diff * Math.min(1, dt * 3);
    pitch = 0.3;
    dist = 11;
  } else {
    pitch = state.camPitch;
    dist = 8;
  }
  const cp = Math.cos(pitch);
  const cx = tx + Math.sin(state.camYaw) * cp * dist;
  const cy = ty + Math.sin(pitch) * dist;
  const cz = tz + Math.cos(state.camYaw) * cp * dist;
  camera.position.set(cx, cy, cz);
  const shake = effects.shakeOffset();
  camera.position.x += shake.x;
  camera.position.y += shake.y;
  camera.lookAt(tx, ty, tz);
  // Speed-sensitive FOV: a little wider at top speed, eased back at rest.
  const speed01 = state.inCar && state.playerCar ? Math.abs(state.playerCar.speed) / CFG.carMaxSpeed : 0;
  const wantFov = 62 + speed01 * 8;
  if (Math.abs(camera.fov - wantFov) > 0.1) {
    camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
}

function shoot() {
  const origin = state.inCar && state.playerCar
    ? new THREE.Vector3(state.playerCar.pos.x, 1.4, state.playerCar.pos.z)
    : new THREE.Vector3(player.pos.x, 1.5, player.pos.z);
  camera.getWorldDirection(tmpVec);
  const dir = tmpVec.clone().normalize();
  const hit = combat.shoot(origin, dir, traffic, police);
  if (!hit) return;
  traffic.setChaos(origin);
  if (hit.kind === 'ped') police.addCrime(1, origin);
  if (hit.kind === 'police') police.addCrime(1, origin);
}

let prevMouseDown = false;
let frames = 0;
let nearMissCooldown = 0;

function tick() {
  requestAnimationFrame(tick);
  const frameStart = performance.now();
  const dt = Math.min(0.05, clockDelta());
  frames += 1;
  window.__frames = frames;

  if (state.mode === 'title') {
    // Slow orbit over the city behind the start screen.
    state.camYaw += dt * 0.05;
    state.camPitch = 0.35;
    const tx = 0;
    const ty = 20;
    const tz = 0;
    camera.position.set(
      tx + Math.sin(state.camYaw) * 130,
      ty + 70,
      tz + Math.cos(state.camYaw) * 130,
    );
    camera.lookAt(0, 0, 40);
    traffic.update(dt, player.pos, null);
    effects.update(dt);
    renderer.render(scene, camera);
    scalerStep(dt, performance.now() - frameStart);
    window.__fps = 1000 / Math.max(1, frameMsEma);
    window.__pixelRatio = CFG.pixelRatioSteps[ratioStep];
    window.__drawCalls = renderer.info.render.calls;
    if (shotMode && frames > 5) window.__shotReady = true;
    return;
  }

  if (state.mode === 'paused') {
    renderer.render(scene, camera);
    input.endFrame();
    return;
  }

  if (state.mode === 'busted' || state.mode === 'story') {
    traffic.update(dt, player.pos, null);
    effects.update(dt);
    renderer.render(scene, camera);
    input.endFrame();
    return;
  }

  // ---- playing ----
  const mouse = input.consumeMouse();
  if (!state.inCar) {
    state.camYaw -= mouse.dx * 0.003;
    state.camPitch = Math.max(0.05, Math.min(1.1, state.camPitch + mouse.dy * 0.003));
  }

  if (input.wasPressed('Escape') || input.wasPressed('KeyP')) {
    state.mode = 'paused';
    hud.showScreen('pause', { cash: state.cash, missionsDone: save.missionsDone });
    if (document.pointerLockElement) document.exitPointerLock();
    input.endFrame();
    renderer.render(scene, camera);
    return;
  }

  const axis = input.axis();
  const sprint = input.held('ShiftLeft') || input.held('ShiftRight');
  if (state.inCar && state.playerCar) {
    const car = state.playerCar;
    const throttle = axis.z < 0 ? 1 : axis.z > 0 ? -1 : 0;
    const steer = axis.x;
    const handbrake = input.held('Space');
    const res = car.drive(dt, throttle, steer, handbrake, city.colliders);
    if (res.crashed) {
      audio.crash();
      effects.sparks(new THREE.Vector3(car.pos.x, 1, car.pos.z));
      effects.addShake(0.3);
      combat.takeDamage(4);
    }
    audio.setEngine(Math.abs(car.speed) / CFG.carMaxSpeed, true);
    // Style: drifting banks points; near misses at speed bank more.
    if (car.drifting) {
      state.stylePoints += CFG.styleDriftPerSec * dt;
    }
    nearMissCooldown -= dt;
    if (nearMissCooldown <= 0 && traffic.nearMiss(car.pos, car.speed, CFG.styleNearMissMinSpeed, CFG.styleNearMissDist)) {
      state.stylePoints += CFG.styleNearMiss;
      nearMissCooldown = 0.8;
    }
    state.styleMult = 1 + Math.min(CFG.styleMaxMult - 1, state.stylePoints / 400);
    // Running over pedestrians.
    if (Math.abs(car.speed) > 8) {
      const hit = traffic.knockDown(car.pos, 3.2);
      if (hit) {
        police.addCrime(1, car.pos);
        traffic.setChaos(car.pos);
        audio.crash();
        effects.addShake(0.25);
        car.speed *= 0.6;
      }
    }
    // Exhaust puffs.
    state.exhaustT -= dt;
    if (Math.abs(car.speed) > 4 && state.exhaustT <= 0) {
      state.exhaustT = 0.12;
      const f = car.forward();
      effects.exhaust(
        new THREE.Vector3(car.pos.x - f.x * 2.2, 0.6, car.pos.z - f.z * 2.2),
        new THREE.Vector3(f.x, 0, f.z),
      );
    }
    if (input.wasPressed('KeyE') && Math.abs(car.speed) < 3) exitCar();
  } else {
    const fwd = { x: -Math.sin(state.camYaw), z: -Math.cos(state.camYaw) };
    const right = { x: Math.cos(state.camYaw), z: -Math.sin(state.camYaw) };
    const mx = right.x * axis.x + fwd.x * -axis.z;
    const mz = right.z * axis.x + fwd.z * -axis.z;
    player.update(dt, { x: mx, z: mz }, sprint, input.wasPressed('Space'), city.colliders);
    audio.setEngine(0, false);
    if (input.wasPressed('KeyE')) stealNearestCar();
  }

  // Combat.
  const mouseDown = input.mouseDown;
  if (mouseDown && !prevMouseDown && state.mode === 'playing') shoot();
  prevMouseDown = mouseDown;
  if (input.wasPressed('KeyF')) {
    const origin = player.pos;
    camera.getWorldDirection(tmpVec);
    const hit = combat.punch(origin, tmpVec.clone().normalize(), traffic, police);
    if (hit && hit.kind === 'ped') {
      police.addCrime(1, origin);
      traffic.setChaos(origin);
    }
  }
  if (input.wasPressed('KeyR')) combat.startReload();
  combat.update(dt);

  // Traffic, police, missions. The chase position is the car while driving
  // and the player on foot: missions, traffic and police all track that,
  // so a mission can complete from the driver's seat.
  const playerSpeed = state.inCar && state.playerCar ? Math.abs(state.playerCar.speed) : (player.moving ? (sprint ? CFG.sprintSpeed : CFG.walkSpeed) : 0);
  const chasePos = state.inCar && state.playerCar ? state.playerCar.pos : player.pos;
  traffic.update(dt, chasePos, playerSpeed);
  const pres = police.update(dt, chasePos, state.playerCar, playerSpeed, state.inCar);
  state.stars = police.stars;
  audio.setSiren(police.stars > 0);
  if (pres.busted) {
    bust('Boxed in by the Velvet Bay PD at 4 stars.');
    input.endFrame();
    return;
  }
  // Police rams hurt.
  const ramAt = performance.now();
  if (ramAt - state.lastRamAt > 1000) {
    const target = state.inCar && state.playerCar ? state.playerCar.pos : player.pos;
    const rammer = police.ramCheck(target, state.inCar ? 2.2 : 1);
    if (rammer) {
      state.lastRamAt = ramAt;
      audio.crash();
      effects.sparks(new THREE.Vector3(target.x, 1, target.z));
      effects.addShake(0.35);
      if (combat.takeDamage(CFG.policeRamDamage)) {
        bust('Taken down in the chase.');
        input.endFrame();
        return;
      }
    }
  }
  if (combat.health <= 0) {
    bust('Taken down in the chase.');
    input.endFrame();
    return;
  }

  state.playerPos = chasePos;
  missions.update(dt, state);
  if (state.mode !== 'playing') {
    input.endFrame();
    return;
  }

  // Clock and dusk. The game opens at dusk and only deepens: the floor
  // is the opening dusk, the story's late missions push it to full night.
  state.clockMin += dt;
  const wantDusk = missions.dusk ? 1 : CFG.startDusk;
  state.duskT += Math.max(-1, Math.min(1, wantDusk - state.duskT)) * dt * 0.3;
  state.duskT = Math.max(0, Math.min(1, state.duskT));
  tmpColor.copy(skyDay).lerp(skyDusk, state.duskT);
  scene.background = tmpColor;
  scene.fog.color.copy(tmpColor);
  city.sun.color.copy(sunDay).lerp(sunDusk, state.duskT);
  city.sun.intensity = 2.0 - state.duskT * 0.8;
  city.hemi.intensity = 0.95 - state.duskT * 0.35;
  city.stars.material.opacity = 0.1 + state.duskT * 0.6;

  effects.update(dt);
  updateCamera(dt);

  hud.update({
    dt,
    health: combat.health,
    cash: state.cash,
    stylePoints: state.stylePoints,
    styleMult: state.styleMult,
    stars: police.stars,
    missionName: missions.name(),
    objective: missions.objective(),
    speed: state.inCar && state.playerCar ? state.playerCar.speed : 0,
    inCar: state.inCar,
    ammo: combat.ammo,
    clockMin: state.clockMin,
    timer: missions.index === 1 && missions.phase === 'deliver' ? missions.timer
      : missions.index === 3 ? missions.timer : 0,
    markerPos: missions.markerPos(),
    playerPos: player.pos,
    playerAngle: state.inCar && state.playerCar ? state.playerCar.angle : player.yaw,
    cameraYaw: state.camYaw,
    traffic: traffic.cars.filter((c) => !c.taken).map((c) => ({ x: c.pos.x, z: c.pos.z })),
    police: police.units.map((u) => ({ x: u.pos.x, z: u.pos.z })),
    garage: city.garage,
    safehouse: city.safehouse,
    fps: 1000 / Math.max(1, frameMsEma),
    pixelRatio: CFG.pixelRatioSteps[ratioStep],
    drawCalls: renderer.info.render.calls,
    perfVisible,
  });

  renderer.render(scene, camera);
  scalerStep(dt, performance.now() - frameStart);
  window.__fps = 1000 / Math.max(1, frameMsEma);
  window.__pixelRatio = CFG.pixelRatioSteps[ratioStep];
  window.__drawCalls = renderer.info.render.calls;
  input.endFrame();
  if (shotMode && frames > 5) window.__shotReady = true;
}

let lastT = performance.now();
function clockDelta() {
  const now = performance.now();
  const d = (now - lastT) / 1000;
  lastT = now;
  return d;
}

// Exposed for the playtest harness and the shot staging.
window.__game = {
  state, player, traffic, police, missions, combat, city, input, camera, scene, hud,
  takeCarAt, enterCar, exitCar, startGame, stealNearestCar,
};

if (shotMode) {
  input.shotMode = true;
  stageShot(shotName, window.__game);
  if (shotName !== 'title') {
    audio.ensure();
  }
  state.mode = shotName === 'title' ? 'title' : 'playing';
  if (shotName === 'title') hud.showScreen('title', { bestCash: save.bestCash, missionsDone: save.missionsDone });
  else hud.hideScreens();
} else {
  hud.showScreen('title', { bestCash: save.bestCash, missionsDone: save.missionsDone });
}

tick();
