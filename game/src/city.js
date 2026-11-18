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
//
// Shape of the code: buildCity owns one shared context — rng, group,
// colliders, a scratch Object3D — and hands it to one small builder per
// city section (sky, stars, ground, dashes, towers, flora, beach), so
// each section can be read and tuned without scrolling past the others.
import * as THREE from 'three';
import { CFG, PALETTE } from './config.js';
import { mulberry32, range, pick, pickInt } from './rng.js';

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function litWindowsTexture(baseColor, litRatio, rng) {
  return canvasTexture(128, 256, (g) => {
    g.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
    g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 6; x++) {
        g.fillStyle = rng() < litRatio ? '#ffd98a' : '#20242e';
        g.fillRect(8 + x * 20, 10 + y * 20, 12, 12);
      }
    }
  });
}

function neonWordTexture(word, color) {
  return canvasTexture(256, 64, (g) => {
    g.clearRect(0, 0, 256, 64);
    g.font = 'bold 40px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.fillStyle = color;
    g.fillText(word, 128, 34);
    g.shadowBlur = 4;
    g.fillStyle = '#ffffff';
    g.fillText(word, 128, 34);
  });
}

const NEON_WORDS = ['VELVET', 'NEON', 'BAY 24H', 'HOTEL', 'BAR', 'TACOS', 'DISCO', 'MOTEL'];

function flat(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

// Bake a list of matrices into one InstancedMesh and add it to the group.
function bakeInstanced(ctx, geo, mat, matrices) {
  const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  ctx.group.add(mesh);
  return mesh;
}

// Push a circle (x/z) out of every axis-aligned box it overlaps.
// Returns the push vector applied, or null when nothing overlapped.
export function collideCircle(pos, radius, colliders) {
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

function addSky(ctx) {
  const { scene } = ctx;
  scene.background = new THREE.Color(CFG.skyDusk);
  scene.fog = new THREE.Fog(CFG.skyDusk, 260, 700);
  const hemi = new THREE.HemisphereLight(0x8a7fd0, 0x3a2a3a, 0.85);
  scene.add(hemi);
  // No shadow maps: the sun is a plain directional light, which keeps
  // the frame time flat on weak GPUs.
  const sun = new THREE.DirectionalLight(CFG.sunDusk, 1.6);
  sun.position.set(120, 180, 60);
  const target = new THREE.Object3D();
  target.position.set(0, 0, 0);
  scene.add(target);
  sun.target = target;
  scene.add(sun);
  ctx.sun = sun;
  ctx.hemi = hemi;
}

function addStars(ctx) {
  // Stars come out as dusk deepens (main.js fades them in).
  const count = 220;
  const positions = new Float32Array(count * 3);
  const rng = mulberry32(ctx.seed + 31);
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = 500 + rng() * 400;
    const y = 120 + rng() * 320;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffffff, size: 1.6, transparent: true, opacity: 0.55,
    sizeAttenuation: false, depthWrite: false,
  }));
  ctx.scene.add(stars);
  ctx.stars = stars;
}

function addGround(ctx) {
  const span = 2 * CFG.cityHalf + 160;
  const ground = flat(new THREE.PlaneGeometry(span, span), lambert(0x1c1c22), 0, -0.05, 0);
  ctx.group.add(ground);
  const roadMat = lambert(CFG.asphalt);
  const long = 2 * CFG.cityHalf + 40;
  for (const x of ctx.roadXs) {
    ctx.group.add(flat(new THREE.PlaneGeometry(CFG.roadWidth, long), roadMat, x, 0, 0));
  }
  for (const z of ctx.roadZs) {
    ctx.group.add(flat(new THREE.PlaneGeometry(long, CFG.roadWidth), roadMat, 0, 0.01, z));
  }
}

function addDashes(ctx) {
  // Road dashes, one InstancedMesh for both directions: ~800 meshes
  // become a single draw call. Matrices are collected first, then baked.
  const geo = new THREE.PlaneGeometry(0.5, 4);
  const mat = lambert(0xd8d8c8);
  const matrices = [];
  const dummy = ctx.dummy;
  const step = 10;
  for (const x of ctx.roadXs) {
    for (let z = -CFG.cityHalf; z <= CFG.cityHalf; z += step) {
      dummy.position.set(x, 0.02, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
    }
  }
  for (const z of ctx.roadZs) {
    for (let x = -CFG.cityHalf; x <= CFG.cityHalf; x += step) {
      dummy.position.set(x, 0.03, z);
      dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
    }
  }
  bakeInstanced(ctx, geo, mat, matrices);
}

function addTowers(ctx) {
  const { rng } = ctx;
  const texCache = new Map();
  const texFor = (color) => {
    if (!texCache.has(color)) texCache.set(color, litWindowsTexture(color, 0.42, mulberry32(color + ctx.seed)));
    return texCache.get(color);
  };
  const signTexs = NEON_WORDS.map((w, i) => neonWordTexture(w, '#' + PALETTE.neonSign[i % PALETTE.neonSign.length].toString(16).padStart(6, '0')));
  const signGeo = new THREE.PlaneGeometry(9, 2.2);
  const signMats = signTexs.map((t) => new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide }));
  const roofMat = lambert(0x241d2e);
  const plazas = [];
  const half = CFG.gridHalf;
  for (let bi = -half; bi < half; bi++) {
    for (let bj = -half; bj < half; bj++) {
      const cx = bi * CFG.pitch + CFG.pitch / 2;
      const cz = bj * CFG.pitch + CFG.pitch / 2;
      // Beachfront row stays open: sand, palms and umbrellas instead.
      if (cz > CFG.beachZ - 30) continue;
      // Some blocks are plazas with trees instead of buildings.
      if (rng() < 0.14) {
        const plaza = flat(new THREE.PlaneGeometry(CFG.blockSize, CFG.blockSize), lambert(CFG.sidewalk), cx, 0.04, cz);
        ctx.group.add(plaza);
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
        ctx.group.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 1.2, d * 0.4), roofMat);
        roof.position.set(bx + range(rng, -2, 2), h + 0.6, bz + range(rng, -2, 2));
        ctx.group.add(roof);
        ctx.colliders.push({
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
          ctx.group.add(sign);
        }
      }
    }
  }
  ctx.plazas = plazas;
}

function addFlora(ctx) {
  // Palms and lamps along the roads, all instanced: trunks, leaves, poles
  // and bulbs are four InstancedMeshes instead of hundreds of groups.
  const { rng, dummy } = ctx;
  const palmSpots = [];
  const lampSpots = [];
  const edge = CFG.roadWidth / 2;
  for (const x of ctx.roadXs) {
    for (let z = -CFG.cityHalf + 25; z <= CFG.cityHalf - 25; z += 50) {
      if (rng() < 0.55) {
        palmSpots.push({ x: x + edge + 2.5, z: z + range(rng, -6, 6), tilt: range(rng, -0.08, 0.08) });
        ctx.colliders.push({ minX: x + edge + 1.6, maxX: x + edge + 3.4, minZ: z - 1, maxZ: z + 1 });
      }
      if (rng() < 0.5) {
        lampSpots.push({ x: x - edge - 2, z: z + 12 });
      }
    }
  }
  // Plaza palms, on the plazas the tower loop actually picked (no
  // second coin flip: the first loop's RNG sequence already decided).
  for (const pl of ctx.plazas) {
    for (let t = 0; t < 3; t++) {
      palmSpots.push({ x: pl.x + range(rng, -12, 12), z: pl.z + range(rng, -12, 12), tilt: range(rng, -0.08, 0.08) });
    }
  }
  const trunkMats = [];
  const leafMats = [];
  palmSpots.forEach((p, i) => {
    dummy.position.set(p.x, 3, p.z);
    dummy.rotation.set(0, 0, p.tilt);
    dummy.updateMatrix();
    trunkMats.push(dummy.matrix.clone());
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      dummy.position.set(p.x + Math.cos(a) * 1.4, 6.4, p.z + Math.sin(a) * 1.4);
      dummy.rotation.set(-Math.sin(a) * 1.1, 0, Math.cos(a) * 1.1);
      dummy.updateMatrix();
      leafMats.push(dummy.matrix.clone());
    }
  });
  bakeInstanced(ctx, new THREE.CylinderGeometry(0.25, 0.45, 6, 6), lambert(PALETTE.palmTrunk), trunkMats);
  bakeInstanced(ctx, new THREE.ConeGeometry(0.7, 3.4, 4), lambert(PALETTE.palmLeaf), leafMats);
  const poleMats = [];
  const bulbMats = [];
  lampSpots.forEach((p) => {
    dummy.position.set(p.x, 3.25, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poleMats.push(dummy.matrix.clone());
    dummy.position.set(p.x, 6.6, p.z);
    dummy.updateMatrix();
    bulbMats.push(dummy.matrix.clone());
  });
  bakeInstanced(ctx, new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6), lambert(PALETTE.lamp), poleMats);
  bakeInstanced(ctx, new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffdf80 }), bulbMats);
}

function addBeach(ctx) {
  const { rng } = ctx;
  const sand = flat(new THREE.PlaneGeometry(2 * CFG.cityHalf + 160, 60), lambert(CFG.sand), 0, 0.06, CFG.beachZ + 18);
  ctx.group.add(sand);
  const sea = flat(new THREE.PlaneGeometry(2 * CFG.cityHalf + 400, 200), new THREE.MeshLambertMaterial({ color: CFG.sea }), 0, 0.02, CFG.seaZ + 80);
  ctx.group.add(sea);
  // Beach umbrellas.
  for (let i = 0; i < 8; i++) {
    const ux = -180 + i * 52 + range(rng, -8, 8);
    const uz = CFG.beachZ + range(rng, 8, 30);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), lambert(0xdddddd));
    pole.position.set(ux, 1.5, uz);
    ctx.group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.1, 8), lambert(pick(rng, [0xff2e88, 0x22d3ee, 0xffe66d, 0xff6b35])));
    top.position.set(ux, 3.4, uz);
    ctx.group.add(top);
  }
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
  const ctx = {
    scene, seed, rng, group, colliders, roadXs, roadZs,
    dummy: new THREE.Object3D(),
    plazas: [],
    sun: null, hemi: null, stars: null,
  };
  addSky(ctx);
  addStars(ctx);
  addGround(ctx);
  addDashes(ctx);
  addTowers(ctx);
  addFlora(ctx);
  addBeach(ctx);
  scene.add(group);
  return {
    group,
    colliders,
    roadXs,
    roadZs,
    sun: ctx.sun,
    hemi: ctx.hemi,
    stars: ctx.stars,
    garage: { x: -25, z: -175 },
    safehouse: { x: 175, z: 175 },
    hospital: { x: -175, z: 25 },
    start: { x: 0, z: 25 },
  };
}
