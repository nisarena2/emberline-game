// fx.js — tracers, muzzle flash, impacts and explosions. Pools are fixed
// size and reused, so the hot loops allocate nothing per frame.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_PARTICLES = 240;

export function createFx(scene) {
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffc266, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
  const pMat = new THREE.PointsMaterial({ color: 0xffa040, size: 0.22, transparent: true, opacity: 0.95 });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  const pVel = new Float32Array(MAX_PARTICLES * 3);
  const pLife = new Float32Array(MAX_PARTICLES);
  let pCursor = 0;

  const flash = new THREE.PointLight(0xffc266, 0, 9, 1.6);
  scene.add(flash);
  let flashLife = 0;

  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0 })
  );
  scene.add(boom);
  let boomLife = 0;

  function spawnParticles(pos, n, speed, up = 0.5) {
    for (let k = 0; k < n; k++) {
      const i = pCursor;
      pCursor = (pCursor + 1) % MAX_PARTICLES;
      const arr = pGeo.attributes.position.array;
      arr[i * 3] = pos.x;
      arr[i * 3 + 1] = pos.y;
      arr[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.8);
      pVel[i * 3] = Math.cos(a) * Math.cos(e) * s;
      pVel[i * 3 + 1] = Math.sin(e) * s + up;
      pVel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * s;
      pLife[i] = 0.5 + Math.random() * 0.5;
    }
    pGeo.attributes.position.needsUpdate = true;
  }

  return {
    tracer(from, to) {
      const t = tracers.find((x) => x.life <= 0) || tracers[0];
      const arr = t.line.geometry.attributes.position.array;
      arr[0] = from.x; arr[1] = from.y; arr[2] = from.z;
      arr[3] = to.x; arr[4] = to.y; arr[5] = to.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.opacity = 0.9;
      t.life = 0.09;
    },
    impact(point, head) {
      spawnParticles(point, head ? 14 : 8, 3.5, 1.2);
    },
    muzzle(shooter) {
      const eye = new THREE.Vector3(shooter.pos.x, shooter.crouched ? 1.12 : 1.62, shooter.pos.z);
      flash.position.copy(eye);
      flash.position.y -= 0.25;
      flash.intensity = 14;
      flashLife = 0.06;
    },
    explosion(pos) {
      boom.position.copy(pos);
      boom.position.y = Math.max(0.6, pos.y);
      boom.scale.setScalar(0.4);
      boom.material.opacity = 0.9;
      boomLife = 0.5;
      spawnParticles(pos, 90, 8, 2.5);
      flash.position.copy(pos);
      flash.position.y += 1;
      flash.intensity = 40;
      flashLife = 0.25;
    },
    update(dt) {
      for (const t of tracers) {
        if (t.life > 0) {
          t.life -= dt;
          t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        }
      }
      if (flashLife > 0) {
        flashLife -= dt;
        if (flashLife <= 0) flash.intensity = 0;
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const k = 1 - boomLife / 0.5;
        boom.scale.setScalar(0.4 + k * 5.5);
        boom.material.opacity = Math.max(0, 0.9 * (1 - k));
      }
      const arr = pGeo.attributes.position.array;
      let any = false;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (pLife[i] <= 0) continue;
        any = true;
        pLife[i] -= dt;
        pVel[i * 3 + 1] -= 9 * dt;
        arr[i * 3] += pVel[i * 3] * dt;
        arr[i * 3 + 1] += pVel[i * 3 + 1] * dt;
        arr[i * 3 + 2] += pVel[i * 3 + 2] * dt;
        if (arr[i * 3 + 1] < 0.05) { arr[i * 3 + 1] = 0.05; pVel[i * 3 + 1] *= -0.3; }
        if (pLife[i] <= 0) { arr[i * 3 + 1] = -50; }
      }
      if (any) pGeo.attributes.position.needsUpdate = true;
    },
  };
}
