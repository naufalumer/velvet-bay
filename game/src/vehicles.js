// VELVET BAY — cars. A low-poly car factory (body, cabin, wheels, lights)
// shared by the player's car, traffic and police, plus arcade driving
// physics for the car the player is in: accelerate, brake, steer that
// tightens at low speed, handbrake slides, building collision.
//
// Smoothness note: every car used to build its own wheel geometry and its
// own materials — dozens of duplicate GPU resources and state changes per
// frame. Here the geometries and the wheel/light materials are module
// singletons shared by every car in the city, so the whole fleet costs a
// handful of draw-state switches. The player's car also carries two fake
// headlight beams (translucent cones, no real lights) that read as neon
// dusk headlights for free.
import * as THREE from 'three';
import { CFG } from './config.js';
import { collideCircle } from './city.js';

// Shared once, reused by every car: one wheel geometry, one set of
// materials. Body paint stays per-car (that is the point of a car).
const WHEEL_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
const WHEEL_MAT = new THREE.MeshLambertMaterial({ color: 0x111111 });
const BODY_GEO = new THREE.BoxGeometry(2, 0.75, 4.4);
const CABIN_GEO = new THREE.BoxGeometry(1.7, 0.65, 2.1);
const CABIN_MAT = new THREE.MeshLambertMaterial({ color: 0x1a2530 });
const HEAD_GEO = new THREE.BoxGeometry(0.4, 0.25, 0.1);
const HEAD_MAT = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x887733 });
const TAIL_MAT = new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0x550000 });
const BEAM_GEO = new THREE.ConeGeometry(0.9, 7, 8, 1, true);
const BEAM_MAT = new THREE.MeshBasicMaterial({
  color: 0xffe9a8, transparent: true, opacity: 0.10,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});

export function makeCarMesh(color, police) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(BODY_GEO, bodyMat);
  body.position.y = 0.65;
  g.add(body);
  const cabin = new THREE.Mesh(CABIN_GEO, CABIN_MAT);
  cabin.position.set(0, 1.3, -0.2);
  g.add(cabin);
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.42, z);
    g.add(w);
    wheels.push(w);
  }
  for (const x of [-0.6, 0.6]) {
    const h = new THREE.Mesh(HEAD_GEO, HEAD_MAT);
    h.position.set(x, 0.7, 2.22);
    g.add(h);
  }
  for (const x of [-0.6, 0.6]) {
    const t = new THREE.Mesh(HEAD_GEO, TAIL_MAT);
    t.position.set(x, 0.7, -2.22);
    g.add(t);
  }
  let lightBar = null;
  let beaconL = null;
  let beaconR = null;
  if (police) {
    lightBar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.18, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 }),
    );
    lightBar.position.set(0, 1.72, -0.2);
    g.add(lightBar);
    beaconL = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.42),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    );
    beaconL.position.set(-0.32, 1.82, -0.2);
    g.add(beaconL);
    beaconR = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    beaconR.position.set(0.32, 1.82, -0.2);
    g.add(beaconR);
  }
  g.userData.wheels = wheels;
  g.userData.beaconL = beaconL;
  g.userData.beaconR = beaconR;
  return g;
}

export class DriveCar {
  constructor(scene, color, x, z, angle, police) {
    this.mesh = makeCarMesh(color, police);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = angle;
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.angle = angle;
    this.speed = 0;
    this.steer = 0;
    this.police = !!police;
    this.stolen = false;
    this.flashT = 0;
    // Style system: drifting = handbrake held while fast and turning.
    this.drifting = false;
    // Headlight beams: only the player's car gets them (two cones).
    this.beams = null;
  }

  attachBeams(scene) {
    if (this.beams) return;
    const g = new THREE.Group();
    for (const x of [-0.6, 0.6]) {
      const beam = new THREE.Mesh(BEAM_GEO, BEAM_MAT);
      beam.position.set(x, 0.6, 5.4);
      beam.rotation.x = -Math.PI / 2 - 0.06;
      g.add(beam);
    }
    this.mesh.add(g);
    this.beams = g;
  }

  forward() {
    return { x: Math.sin(this.angle), z: Math.cos(this.angle) };
  }

  // Arcade drive step. Returns { crashed } when it hit a building hard.
  drive(dt, throttle, steerInput, handbrake, colliders) {
    const maxF = CFG.carMaxSpeed;
    const maxR = CFG.carReverseMax;
    if (throttle > 0) this.speed += CFG.carAccel * dt;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= CFG.carBrake * dt;
      else this.speed -= CFG.carAccel * 0.7 * dt;
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 8 * dt);
    }
    this.speed = Math.max(-maxR, Math.min(maxF, this.speed));
    const targetSteer = steerInput * (handbrake ? CFG.handbrakeTurn : CFG.carTurn);
    const speedFactor = Math.min(1, Math.abs(this.speed) / 8 + 0.25);
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    if (Math.abs(this.speed) > 0.1) {
      this.angle += this.steer * speedFactor * dt * Math.sign(this.speed) * (handbrake ? 1.6 : 1);
    }
    if (handbrake && Math.abs(this.speed) > 6) {
      this.speed -= Math.sign(this.speed) * 14 * dt;
    }
    // Drifting: handbrake + speed + real steering input.
    this.drifting = handbrake && Math.abs(this.speed) > 10 && Math.abs(steerInput) > 0.3;
    const f = this.forward();
    const beforeX = this.pos.x;
    const beforeZ = this.pos.z;
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    this.mesh.rotation.y = this.angle;
    const hit = collideCircle(this.pos, CFG.carRadius, colliders);
    let crashed = false;
    if (hit) {
      const movedX = this.pos.x - beforeX;
      const movedZ = this.pos.z - beforeZ;
      const into = movedX * hit.x + movedZ * hit.z;
      if (into < 0 && Math.abs(this.speed) > 8) crashed = true;
      if (Math.abs(this.speed) > 3) this.speed *= 0.35;
      else this.speed = 0;
    }
    // Keep inside the playable area.
    const lim = CFG.cityHalf + 20;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
    this.pos.z = Math.max(-lim, Math.min(CFG.beachZ + 26, this.pos.z));
    const spin = this.speed * dt * 2;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    if (this.police) {
      this.flashT += dt * 6;
      const on = Math.sin(this.flashT) > 0;
      if (this.mesh.userData.beaconL) this.mesh.userData.beaconL.visible = on;
      if (this.mesh.userData.beaconR) this.mesh.userData.beaconR.visible = !on;
    }
    return { crashed };
  }
}
