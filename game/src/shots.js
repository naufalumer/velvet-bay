// VELVET BAY — deterministic screenshot staging. ?shot=<scene>&seed=1
// arranges a fixed scene out of the game's own systems, then the main loop
// raises window.__shotReady once it has rendered. Scenes: chase (police
// pursuit, 3 stars, HUD and minimap), street (on foot, traffic and
// pedestrians), mission (delivery run with waypoint), title (start screen).
// Every scene is staged at dusk, when the neon is on.
import { CFG } from './config.js';

export function stageShot(name, G) {
  const { player, traffic, police, missions, combat } = G;
  // Clear any heat and put the player back at the start first.
  police.clear();
  combat.healFull();
  G.state.mode = 'playing';
  G.state.inCar = false;
  G.state.playerCar = null;
  player.teleport(0, 25);
  player.mesh.visible = true;

  if (name === 'chase') {
    // In a car on the central north-south road, 3 stars, two units behind.
    const car = G.takeCarAt(0, -40, 0x22d3ee, 0);
    G.enterCar(car);
    police.setStars(3);
    police.spawnAt(-10, 5);
    police.spawnAt(10, 20);
    missions.index = 1;
    missions.phase = 'deliver';
    missions.timer = 60;
    missions._placeMarker();
    G.state.camYaw = Math.PI;
    G.state.camPitch = 0.32;
    G.state.clockMin = 17 * 60 + 50;
    G.state.duskT = 0.7;
  } else if (name === 'street') {
    // On foot at a busy downtown corner, neon signs overhead.
    player.teleport(0, 25);
    G.state.camYaw = Math.PI;
    G.state.camPitch = 0.28;
    missions.index = 0;
    missions.phase = 'steal';
    missions._placeMarker();
    G.state.clockMin = 17 * 60 + 40;
    G.state.duskT = 0.6;
    // Bring traffic and pedestrians into frame: cars on the road ahead of
    // the player, walkers on the sidewalks beside them.
    let placed = 0;
    for (const c of traffic.cars) {
      if (placed >= 3) break;
      if (!c.lane.vertical) continue;
      c.pos.x = c.lane.line + c.lane.off;
      c.pos.z = 55 + placed * 22;
      placed += 1;
    }
    let walked = 0;
    for (const p of traffic.peds) {
      if (walked >= 4) break;
      p.pos.x = (walked % 2 === 0 ? -1 : 1) * (CFG.roadWidth / 2 + 2.5);
      p.pos.z = 35 + walked * 12;
      p.vertical = true;
      p.dir = walked % 2 === 0 ? 1 : -1;
      walked += 1;
    }
  } else if (name === 'mission') {
    // Mid delivery run: in a car, waypoint across town, timer running.
    const car = G.takeCarAt(-100, 100, 0xff2e88, Math.PI / 2);
    G.enterCar(car);
    missions.index = 1;
    missions.phase = 'deliver';
    missions.timer = 45;
    missions._placeMarker();
    police.setStars(1);
    police.spawnAt(-60, 85);
    G.state.camYaw = Math.PI * 0.75;
    G.state.camPitch = 0.3;
    G.state.clockMin = 18 * 60 + 5;
    G.state.duskT = 0.85;
  } else if (name === 'title') {
    G.state.mode = 'title';
    G.state.camYaw = 0.6;
    G.state.camPitch = 0.5;
    G.state.clockMin = 17 * 60 + 40;
    G.state.duskT = 0.6;
    return;
  }
  G.hud.hideScreens();
}
