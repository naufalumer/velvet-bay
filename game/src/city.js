// VELVET BAY — Velvet Bay itself. A seeded procedural city at dusk: a
// road grid with sidewalks, dark towers with lit windows and neon signs,
// palms, street lamps, a beach and the sea on the south edge, stars coming
// out overhead, sun and sky. Every placement comes from the seeded RNG,
// so the same seed builds the same city.
//
// Smoothness note: the first version of this city built every road dash,
// palm leaf and lamp pole as its own mesh — over a thousand draw calls
// before a single car appeared. Here the repeating pieces are
// InstancedMeshes (two dash runs, palm trunks, palm leaves, lamp poles,
// lamp bulbs): the whole static city is a few dozen draw calls, and the
// frame budget goes to the game instead of the draw-call list. Buildings
// stay individual (only ~100) and share their window textures.
import * as THREE from 'three';
import { CFG, PALETTE } from './config.js';
import { mulberry32, range, pick, pickInt } from './rng.js';

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function windowTexture(baseColor, litRatio, rng) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
  g.fillRect(0, 0, 128, 256);
  const cols = 6;
  const rows = 12;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : '#20242e';
      g.fillRect(8 + x * 20, 10 + y * 20, 12, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function neonSignTexture(text, color, rng) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.font = 'bold 40px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.fillStyle = color;
  g.fillText(text, 128, 34);
  g.shadowBlur = 4;
  g.fillStyle = '#ffffff';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const NEON_WORDS = ['VELVET', 'NEON', 'BAY 24H', 'HOTEL', 'BAR', 'TACOS', 'DISCO', 'MOTEL'];

export function collideCircle(pos, radius, colliders) {
  // Push a circle (x/z) out of every axis-aligned box it overlaps.
  // Returns the push vector applied, or null when nothing overlapped.
  let pushed = null;
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    let nx;
    let nz;
    let depth;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      nx = dx / d;
      nz = dz / d;
      depth = radius - d;
    } else {
      // Centre inside the box: push out along the smallest penetration.
      const pl = pos.x - b.minX;
      const pr = b.maxX - pos.x;
      const pt = pos.z - b.minZ;
      const pb = b.maxZ - pos.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) { nx = -1; nz = 0; depth = pl + radius; }
      else if (m === pr) { nx = 1; nz = 0; depth = pr + radius; }
      else if (m === pt) { nx = 0; nz = -1; depth = pt + radius; }
      else { nx = 0; nz = 1; depth = pb + radius; }
    }
    pos.x += nx * depth;
    pos.z += nz * depth;
    if (!pushed) pushed = { x: nx, z: nz };
  }
  return pushed;
}

export function buildCity(scene, seed) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  const colliders = [];
  const roadXs = [];
  const roadZs = [];
  for (let i = -CFG.gridHalf; i <= CFG.gridHalf; i++) {
    roadXs.push(i * CFG.pitch);
    roadZs.push(i * CFG.pitch);
  }

  // Sky, sun, fog. No shadow maps: the sun is a plain directional light,
  // which keeps the frame time flat on weak GPUs.
  scene.background = new THREE.Color(CFG.skyDusk);
  scene.fog = new THREE.Fog(CFG.skyDusk, 260, 700);
  const hemi = new THREE.HemisphereLight(0x8a7fd0, 0x3a2a3a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(CFG.sunDusk, 1.6);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  const sunTarget = new THREE.Object3D();
  sunTarget.position.set(0, 0, 0);
  scene.add(sunTarget);
  sun.target = sunTarget;

  // Stars come out as dusk deepens (main.js fades them in).
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(220 * 3);
  const starRng = mulberry32(seed + 31);
  for (let i = 0; i < 220; i++) {
    const a = starRng() * Math.PI * 2;
    const r = 500 + starRng() * 400;
    const y = 120 + starRng() * 320;
    starPos[i * 3] = Math.cos(a) * r;
    starPos[i * 3 + 1] = y;
    starPos[i * 3 + 2] = Math.sin(a) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 1.6, transparent: true, opacity: 0.55,
    sizeAttenuation: false, depthWrite: false,
  }));
  scene.add(stars);

  // Ground: one big asphalt slab, then road strips, then sidewalks.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.cityHalf * 2 + 160, CFG.cityHalf * 2 + 160),
    lambert(0x1c1c22),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  group.add(ground);

  const roadMat = lambert(CFG.asphalt);
  for (const x of roadXs) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(CFG.roadWidth, CFG.cityHalf * 2 + 40), roadMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0, 0);
    group.add(strip);
  }
  for (const z of roadZs) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(CFG.cityHalf * 2 + 40, CFG.roadWidth), roadMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.01, z);
    group.add(strip);
  }

  // Road dashes, one InstancedMesh for both directions: ~800 meshes
  // become a single draw call. Matrices are collected first, then baked.
  const dashGeo = new THREE.PlaneGeometry(0.5, 4);
  const dashMat = lambert(0xd8d8c8);
  const dashMats4 = [];
  const dummy = new THREE.Object3D();
  for (const x of roadXs) {
    for (let z = -CFG.cityHalf; z <= CFG.cityHalf; z += 10) {
      dummy.position.set(x, 0.02, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      dashMats4.push(dummy.matrix.clone());
    }
  }
  for (const z of roadZs) {
    for (let x = -CFG.cityHalf; x <= CFG.cityHalf; x += 10) {
      dummy.position.set(x, 0.03, z);
      dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      dummy.updateMatrix();
      dashMats4.push(dummy.matrix.clone());
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashMats4.length);
  dashMats4.forEach((m, i) => dashes.setMatrixAt(i, m));
  dashes.instanceMatrix.needsUpdate = true;
  group.add(dashes);

  // Buildings, one or two per block, with window textures. Neon signs
  // hang on the street-facing side of about a third of them.
  const texCache = new Map();
  function texFor(color) {
    if (!texCache.has(color)) texCache.set(color, windowTexture(color, 0.42, mulberry32(color + seed)));
    return texCache.get(color);
  }
  const signTexs = NEON_WORDS.map((w, i) => neonSignTexture(w, '#' + PALETTE.neonSign[i % PALETTE.neonSign.length].toString(16).padStart(6, '0'), rng));
  const signGeo = new THREE.PlaneGeometry(9, 2.2);
  const signMats = signTexs.map((t) => new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide }));
  const roofMat = lambert(0x241d2e);
  const plazas = [];
  for (let bi = -CFG.gridHalf; bi < CFG.gridHalf; bi++) {
    for (let bj = -CFG.gridHalf; bj < CFG.gridHalf; bj++) {
      const cx = bi * CFG.pitch + CFG.pitch / 2;
      const cz = bj * CFG.pitch + CFG.pitch / 2;
      // Beachfront row stays open: sand, palms and umbrellas instead.
      if (cz > CFG.beachZ - 30) continue;
      // Some blocks are plazas with trees instead of buildings.
      if (rng() < 0.14) {
        const plaza = new THREE.Mesh(new THREE.PlaneGeometry(CFG.blockSize, CFG.blockSize), lambert(CFG.sidewalk));
        plaza.rotation.x = -Math.PI / 2;
        plaza.position.set(cx, 0.04, cz);
        group.add(plaza);
        plazas.push({ x: cx, z: cz });
        continue;
      }
      const count = rng() < 0.5 ? 1 : 2;
      for (let k = 0; k < count; k++) {
        const w = range(rng, 12, 22);
        const d = range(rng, 12, 22);
        const h = range(rng, 9, 42) * (rng() < 0.12 ? 1.8 : 1);
        const ox = count === 1 ? 0 : (k === 0 ? -8 : 8);
        const oz = count === 1 ? 0 : (k === 0 ? -6 : 6);
        const bx = cx + ox;
        const bz = cz + oz;
        const color = pick(rng, PALETTE.building);
        const mat = new THREE.MeshLambertMaterial({ map: texFor(color) });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(bx, h / 2, bz);
        group.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 1.2, d * 0.4), roofMat);
        roof.position.set(bx + range(rng, -2, 2), h + 0.6, bz + range(rng, -2, 2));
        group.add(roof);
        colliders.push({
          minX: bx - w / 2 - 0.4, maxX: bx + w / 2 + 0.4,
          minZ: bz - d / 2 - 0.4, maxZ: bz + d / 2 + 0.4,
        });
        // Neon sign on the face nearest a road.
        if (rng() < 0.34 && h > 12) {
          const toRoadX = Math.min(Math.abs(bx - bi * CFG.pitch), Math.abs(bx - (bi + 1) * CFG.pitch));
          const toRoadZ = Math.min(Math.abs(bz - bj * CFG.pitch), Math.abs(bz - (bj + 1) * CFG.pitch));
          const sign = new THREE.Mesh(signGeo, pick(rng, signMats));
          const sy = h * (0.45 + rng() * 0.3);
          if (toRoadX < toRoadZ) {
            const faceX = bx + (bx - (bi + 0.5) * CFG.pitch >= 0 ? 1 : -1) * (w / 2 + 0.2);
            sign.position.set(faceX, sy, bz);
            sign.rotation.y = faceX > bx ? Math.PI / 2 : -Math.PI / 2;
          } else {
            const faceZ = bz + (bz - (bj + 0.5) * CFG.pitch >= 0 ? 1 : -1) * (d / 2 + 0.2);
            sign.position.set(bx, sy, faceZ);
            sign.rotation.y = faceZ > bz ? 0 : Math.PI;
          }
          group.add(sign);
        }
      }
    }
  }

  // Palms and lamps along the roads, all instanced: trunks, leaves, poles
  // and bulbs are four InstancedMeshes instead of hundreds of groups.
  const palmSpots = [];
  const lampSpots = [];
  for (const x of roadXs) {
    for (let z = -CFG.cityHalf + 25; z <= CFG.cityHalf - 25; z += 50) {
      if (rng() < 0.55) {
        palmSpots.push({ x: x + CFG.roadWidth / 2 + 2.5, z: z + range(rng, -6, 6), tilt: range(rng, -0.08, 0.08) });
        colliders.push({ minX: x + CFG.roadWidth / 2 + 1.6, maxX: x + CFG.roadWidth / 2 + 3.4, minZ: z - 1, maxZ: z + 1 });
      }
      if (rng() < 0.5) {
        lampSpots.push({ x: x - CFG.roadWidth / 2 - 2, z: z + 12 });
      }
    }
  }
  // Plaza palms, on the plazas the building loop actually picked (no
  // second coin flip: the first loop's RNG sequence already decided).
  for (const pl of plazas) {
    for (let t = 0; t < 3; t++) {
      palmSpots.push({ x: pl.x + range(rng, -12, 12), z: pl.z + range(rng, -12, 12), tilt: range(rng, -0.08, 0.08) });
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.45, 6, 6);
  const trunks = new THREE.InstancedMesh(trunkGeo, lambert(PALETTE.palmTrunk), palmSpots.length);
  const leafGeo = new THREE.ConeGeometry(0.7, 3.4, 4);
  const leaves = new THREE.InstancedMesh(leafGeo, lambert(PALETTE.palmLeaf), palmSpots.length * 5);
  palmSpots.forEach((p, i) => {
    dummy.position.set(p.x, 3, p.z);
    dummy.rotation.set(0, 0, p.tilt);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      dummy.position.set(p.x + Math.cos(a) * 1.4, 6.4, p.z + Math.sin(a) * 1.4);
      dummy.rotation.set(-Math.sin(a) * 1.1, 0, Math.cos(a) * 1.1);
      dummy.updateMatrix();
      leaves.setMatrixAt(i * 5 + k, dummy.matrix);
    }
  });
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  group.add(trunks);
  group.add(leaves);
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6);
  const poles = new THREE.InstancedMesh(poleGeo, lambert(PALETTE.lamp), lampSpots.length);
  const bulbGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const bulbs = new THREE.InstancedMesh(bulbGeo, new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffdf80 }), lampSpots.length);
  lampSpots.forEach((p, i) => {
    dummy.position.set(p.x, 3.25, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, 6.6, p.z);
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
  });
  poles.instanceMatrix.needsUpdate = true;
  bulbs.instanceMatrix.needsUpdate = true;
  group.add(poles);
  group.add(bulbs);

  // Beach and sea on the south edge.
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(CFG.cityHalf * 2 + 160, 60), lambert(CFG.sand));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.06, CFG.beachZ + 18);
  group.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(CFG.cityHalf * 2 + 400, 200), new THREE.MeshLambertMaterial({ color: CFG.sea }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.02, CFG.seaZ + 80);
  group.add(sea);
  // Beach umbrellas.
  for (let i = 0; i < 8; i++) {
    const ux = -180 + i * 52 + range(rng, -8, 8);
    const uz = CFG.beachZ + range(rng, 8, 30);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), lambert(0xdddddd));
    pole.position.set(ux, 1.5, uz);
    group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.1, 8), lambert(pick(rng, [0xff2e88, 0x22d3ee, 0xffe66d, 0xff6b35])));
    top.position.set(ux, 3.4, uz);
    group.add(top);
  }

  scene.add(group);
  return {
    group,
    colliders,
    roadXs,
    roadZs,
    sun,
    hemi,
    stars,
    garage: { x: -25, z: -175 },
    safehouse: { x: 175, z: 175 },
    hospital: { x: -175, z: 25 },
    start: { x: 0, z: 25 },
  };
}
