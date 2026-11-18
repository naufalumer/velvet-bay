// VELVET BAY — Rae Vega on foot. Third-person walker with a low-poly
// figure in a neon-pink jacket: WASD moves relative to the camera, Shift
// sprints, Space jumps, E enters the nearest car. Gravity and building
// collision included.
import * as THREE from 'three';
import { CFG } from './config.js';
import { collideCircle } from './city.js';

export function makePersonMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.1, 0.5),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  body.position.y = 1.35;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin }),
  );
  head.position.y = 2.25;
  g.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
  );
  hair.position.y = 2.38;
  hair.scale.set(1, 0.7, 1);
  g.add(hair);
  const legL = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.85, 0.4),
    new THREE.MeshLambertMaterial({ color: pants }),
  );
  legL.position.set(-0.24, 0.42, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.24;
  g.add(legR);
  const armL = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.9, 0.3),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  armL.position.set(-0.6, 1.35, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.6;
  g.add(armR);
  g.userData.legs = [legL, legR];
  g.userData.arms = [armL, armR];
  return g;
}

export class Player {
  constructor(scene, start) {
    this.mesh = makePersonMesh(0xff2e88, 0x1e2430, 0xd9a066);
    this.mesh.position.set(start.x, 0, start.z);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.velY = 0;
    this.yaw = 0;
    this.onGround = true;
    this.walkPhase = 0;
    this.moving = false;
  }

  update(dt, move, sprint, jump, colliders) {
    const speed = sprint ? CFG.sprintSpeed : CFG.walkSpeed;
    const mx = move.x;
    const mz = move.z;
    const len = Math.hypot(mx, mz);
    this.moving = len > 0.01;
    if (this.moving) {
      const nx = mx / len;
      const nz = mz / len;
      this.pos.x += nx * speed * dt;
      this.pos.z += nz * speed * dt;
      this.yaw = Math.atan2(nx, nz);
      this.mesh.rotation.y = this.yaw;
      this.walkPhase += dt * (sprint ? 13 : 9);
      const swing = Math.sin(this.walkPhase) * 0.55;
      this.mesh.userData.legs[0].rotation.x = swing;
      this.mesh.userData.legs[1].rotation.x = -swing;
      this.mesh.userData.arms[0].rotation.x = -swing * 0.7;
      this.mesh.userData.arms[1].rotation.x = swing * 0.7;
    } else {
      this.mesh.userData.legs[0].rotation.x = 0;
      this.mesh.userData.legs[1].rotation.x = 0;
      this.mesh.userData.arms[0].rotation.x = 0;
      this.mesh.userData.arms[1].rotation.x = 0;
    }
    if (jump && this.onGround) {
      this.velY = CFG.jumpSpeed;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.velY -= CFG.gravity * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.velY = 0;
        this.onGround = true;
      }
    }
    collideCircle(this.pos, CFG.playerRadius, colliders);
  }

  teleport(x, z) {
    this.pos.set(x, 0, z);
    this.velY = 0;
    this.onGround = true;
  }
}
