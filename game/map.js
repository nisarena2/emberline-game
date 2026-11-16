// map.js — Foundry Yard: geometry, axis-aligned collision, line of sight,
// and a waypoint graph with breadth-first search. Three lanes (North, Mid,
// South) run west to east into the Furnace bombsite at the east end.
import * as THREE from 'three';

export const MAP = {
  halfX: 34, halfZ: 22,
  site: { x: 27, z: 0, r: 6 }, // Furnace bombsite centre
  emberSpawn: { x: -30, z: 0 },
  wardenSpawn: { x: 24, z: 0 },
};

// A collider is {x0,z0,x1,z1,y0,y1} — a box the player and shots respect.
const colliders = [];
const obstacles = []; // {mesh, x0,z0,x1,z1,y0,y1}

function addBox(scene, group, x, z, w, d, h, color, y0 = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.25 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y0 + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const c = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0, y1: y0 + h };
  colliders.push(c);
  obstacles.push({ mesh, ...c });
  return mesh;
}

export function buildMap(scene) {
  const group = new THREE.Group();
  group.name = 'FoundryYard';
  scene.add(group);

  // Ground: dark foundry floor with a painted amber centre line.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP.halfX * 2 + 4, MAP.halfZ * 2 + 4),
    new THREE.MeshStandardMaterial({ color: 0x201c19, roughness: 0.95, metalness: 0.1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP.halfX * 2, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x6a4514, roughness: 0.7 })
  );
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.y = 0.02;
  group.add(stripe);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a3f33, roughness: 0.9, metalness: 0.2 });
  const tealMat = new THREE.MeshStandardMaterial({ color: 0x1e4a4a, roughness: 0.8, metalness: 0.3 });
  const amberMat = new THREE.MeshStandardMaterial({ color: 0xb07018, roughness: 0.6, metalness: 0.5 });

  // Perimeter walls.
  addBox(scene, group, 0, -MAP.halfZ - 1, MAP.halfX * 2 + 4, 2, 5, 0x3a332c);
  addBox(scene, group, 0, MAP.halfZ + 1, MAP.halfX * 2 + 4, 2, 5, 0x3a332c);
  addBox(scene, group, -MAP.halfX - 1, 0, 2, MAP.halfZ * 2 + 4, 5, 0x3a332c);
  addBox(scene, group, MAP.halfX + 1, 0, 2, MAP.halfZ * 2 + 4, 5, 0x3a332c);

  // Lane divider walls with gaps (doorways) so each lane has corners.
  // North divider at z=-7, South divider at z=+7.
  for (const z of [-7, 7]) {
    addBox(scene, group, -24, z, 8, 1, 3.2, 0x4a3f33);
    addBox(scene, group, -8, z, 8, 1, 3.2, 0x4a3f33);
    addBox(scene, group, 8, z, 8, 1, 3.2, 0x4a3f33);
    addBox(scene, group, 22, z, 6, 1, 3.2, 0x4a3f33);
  }

  // Crates and cover blocks, amber and teal, scattered per lane.
  const crates = [
    [-20, -14, 2.4, 2.4, 1.4, 0xb07018], [-12, -14, 2, 2, 2.4, 0x1e4a4a],
    [-4, -14, 2.4, 2.4, 1.2, 0x4a3f33], [6, -14, 2, 2, 2.2, 0xb07018],
    [14, -14, 2.4, 2.4, 1.3, 0x1e4a4a],
    [-24, 0, 2, 2, 2.6, 0x1e4a4a], [-14, 0, 3, 1.6, 1.2, 0xb07018],
    [-2, 0, 2.4, 2.4, 1.4, 0x4a3f33], [10, 0, 2, 2, 2.4, 0x1e4a4a],
    [18, 0, 2.4, 2.4, 1.2, 0xb07018],
    [-20, 14, 2.4, 2.4, 1.2, 0x1e4a4a], [-12, 14, 2, 2, 2.4, 0xb07018],
    [-4, 14, 2.4, 2.4, 1.4, 0x4a3f33], [6, 14, 2, 2, 2.2, 0x1e4a4a],
    [14, 14, 2.4, 2.4, 1.3, 0xb07018],
  ];
  for (const [x, z, w, d, h, c] of crates) addBox(scene, group, x, z, w, d, h, c);

  // Furnace: the bombsite. A big amber-glowing furnace block at the east end.
  const furnace = new THREE.Mesh(
    new THREE.BoxGeometry(4, 4.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x5a3410, roughness: 0.6, metalness: 0.6, emissive: 0x903a00, emissiveIntensity: 0.55 })
  );
  furnace.position.set(31, 2.25, 0);
  furnace.castShadow = true;
  group.add(furnace);
  colliders.push({ x0: 29, x1: 33, z0: -4, z1: 4, y0: 0, y1: 4.5 });
  const mouth = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 2),
    new THREE.MeshStandardMaterial({ color: 0xff7a00, emissive: 0xff6a00, emissiveIntensity: 2.2 })
  );
  mouth.position.set(28.95, 1.4, 0);
  mouth.rotation.y = -Math.PI / 2;
  group.add(mouth);

  // Site floor marking: amber ring on the ground.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.4, 5.6, 32),
    new THREE.MeshStandardMaterial({ color: 0xff8c1a, emissive: 0xcc5a00, emissiveIntensity: 0.7, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(MAP.site.x, 0.03, MAP.site.z);
  group.add(ring);

  // Dusk-industrial props: chimneys and pipes along the north wall.
  for (const x of [-26, -6, 12]) {
    const chim = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.4, 9, 10),
      new THREE.MeshStandardMaterial({ color: 0x3d2f24, roughness: 0.9, metalness: 0.3 })
    );
    chim.position.set(x, 4.5, -MAP.halfZ + 0.4);
    chim.castShadow = true;
    group.add(chim);
  }
  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 40, 8),
    new THREE.MeshStandardMaterial({ color: 0x2e5a5a, roughness: 0.5, metalness: 0.7 })
  );
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(-8, 4.6, -MAP.halfZ + 0.6);
  group.add(pipe);

  return { group, colliders, obstacles };
}

export function getColliders() {
  return colliders;
}

// Resolve a circle (player) against every AABB in the XZ plane.
export function collideCircle(pos, radius) {
  for (const c of colliders) {
    const cx = Math.max(c.x0, Math.min(pos.x, c.x1));
    const cz = Math.max(c.z0, Math.min(pos.z, c.z1));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pl = pos.x - c.x0, pr = c.x1 - pos.x, pt = pos.z - c.z0, pb = c.z1 - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.x0 - radius;
        else if (m === pr) pos.x = c.x1 + radius;
        else if (m === pt) pos.z = c.z0 - radius;
        else pos.z = c.z1 + radius;
      }
    }
  }
  pos.x = Math.max(-MAP.halfX + 0.6, Math.min(MAP.halfX - 0.6, pos.x));
  pos.z = Math.max(-MAP.halfZ + 0.6, Math.min(MAP.halfZ - 0.6, pos.z));
}

// 2D segment vs AABB test (XZ plane), used for line of sight.
function segmentHitsBox(ax, az, bx, bz, c) {
  let tmin = 0, tmax = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, d, lo, hi] of [[ax, dx, c.x0, c.x1], [az, dz, c.z0, c.z1]]) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false;
    } else {
      let t1 = (lo - p) / d, t2 = (hi - p) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

export function hasLineOfSight(a, b, eyeY = 1.5) {
  for (const c of colliders) {
    if (c.y1 < eyeY - 0.3) continue; // low crates do not block sight at eye height
    if (segmentHitsBox(a.x, a.z, b.x, b.z, c)) return false;
  }
  return true;
}

// Ray vs AABB (3D slab test). Returns distance along the ray or Infinity.
export function rayHitBox(origin, dir, c) {
  let tmin = 0, tmax = Infinity;
  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];
  const lo = [c.x0, c.y0, c.z0], hi = [c.x1, c.y1, c.z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return Infinity;
    } else {
      let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

export function rayHitWorld(origin, dir, maxDist) {
  let best = Math.min(maxDist, Infinity);
  for (const c of colliders) {
    const t = rayHitBox(origin, dir, c);
    if (t < best) best = t;
  }
  return best;
}

// ---- Waypoints -------------------------------------------------------------
export function buildWaypoints() {
  const pts = [];
  for (const z of [-14, 0, 14]) {
    for (let x = -30; x <= 30; x += 6) pts.push({ x, z });
  }
  for (const x of [-18, 0, 18]) {
    pts.push({ x, z: -7 }, { x, z: 7 });
  }
  pts.push({ x: 27, z: -4 }, { x: 27, z: 4 }, { x: 24, z: -10 }, { x: 24, z: 10 });
  // Drop any point that sits inside a collider.
  const ok = pts.filter((p) => {
    for (const c of colliders) {
      if (p.x > c.x0 - 0.5 && p.x < c.x1 + 0.5 && p.z > c.z0 - 0.5 && p.z < c.z1 + 0.5) return false;
    }
    return true;
  });
  // Edges between near points with clear line of sight.
  const edges = ok.map(() => []);
  for (let i = 0; i < ok.length; i++) {
    for (let j = i + 1; j < ok.length; j++) {
      const dx = ok[i].x - ok[j].x, dz = ok[i].z - ok[j].z;
      const dist = Math.hypot(dx, dz);
      if (dist > 8.5) continue;
      if (!hasLineOfSight(ok[i], ok[j], 1.5)) continue;
      edges[i].push(j);
      edges[j].push(i);
    }
  }
  return { points: ok, edges };
}

function nearestWaypoint(graph, x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < graph.points.length; i++) {
    const d = Math.hypot(graph.points[i].x - x, graph.points[i].z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// Breadth-first search from (sx,sz) to (tx,tz). Returns a list of points.
export function findPath(graph, sx, sz, tx, tz) {
  const start = nearestWaypoint(graph, sx, sz);
  const goal = nearestWaypoint(graph, tx, tz);
  if (start === goal) return [{ x: tx, z: tz }];
  const prev = new Array(graph.points.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  while (queue.length) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const n of graph.edges[cur]) {
      if (prev[n] === -1) {
        prev[n] = cur;
        queue.push(n);
      }
    }
  }
  if (prev[goal] === -1) return [{ x: tx, z: tz }];
  const path = [];
  let cur = goal;
  while (cur !== start) {
    path.unshift(graph.points[cur]);
    cur = prev[cur];
  }
  path.unshift({ x: tx, z: tz });
  return path;
}
