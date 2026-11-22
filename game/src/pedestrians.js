// Pedestrians: little box people (shirt, pants, skin, swinging arms and legs) who stroll the
// sidewalks, stop for traffic, panic and run when violence or a near-miss happens near them,
// and fall down when hit. buildPerson is shared with the player character and mission NPCs.

import { GRID, PALETTE, roadCenter } from './config.js';

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const materialCache = new Map();

function material(color) {
  if (!materialCache.has(color)) {
    materialCache.set(color, new THREE.MeshLambertMaterial({ color }));
  }
  return materialCache.get(color);
}

function part(parent, mat, sx, sy, sz, x, y, z) {
  const mesh = new THREE.Mesh(boxGeometry, mat);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * Builds a person facing +Z, about 1.8 m tall, with pivoted arms and legs the walk cycle
 * swings. Returns the group; limbs are in userData for animation.
 */
export function buildPerson({ shirt, pants, skin, hat = null }) {
  const person = new THREE.Group();
  const shirtMat = material(shirt);
  const pantsMat = material(pants);
  const skinMat = material(skin);
  part(person, shirtMat, 0.62, 0.72, 0.34, 0, 1.06, 0); // torso
  part(person, skinMat, 0.34, 0.36, 0.34, 0, 1.6, 0); // head
  if (hat !== null) part(person, material(hat), 0.44, 0.12, 0.44, 0, 1.82, 0);
  const limbs = {};
  const mkLimb = (name, mat, x, y, len, w) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(boxGeometry, mat);
    mesh.scale.set(w, len, w);
    mesh.position.y = -len / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    person.add(pivot);
    limbs[name] = pivot;
  };
  mkLimb('armL', shirtMat, -0.4, 1.38, 0.62, 0.16);
  mkLimb('armR', shirtMat, 0.4, 1.38, 0.62, 0.16);
  mkLimb('legL', pantsMat, -0.16, 0.72, 0.72, 0.2);
  mkLimb('legR', pantsMat, 0.16, 0.72, 0.72, 0.2);
  person.userData.limbs = limbs;
  return person;
}

/** Swings a person's limbs for the walk/run cycle; phase advances with distance walked. */
export function animatePerson(person, phase, runFactor = 0) {
  const limbs = person.userData.limbs;
  const swing = Math.sin(phase) * (0.55 + runFactor * 0.35);
  limbs.legL.rotation.x = swing;
  limbs.legR.rotation.x = -swing;
  limbs.armL.rotation.x = -swing * 0.8;
  limbs.armR.rotation.x = swing * 0.8;
}

/** A point on a sidewalk: beside a random road, at a random spot along it. */
function randomSidewalkPoint(rng) {
  const vertical = rng() < 0.5;
  const roadIndex = Math.floor(rng() * GRID.blocksPerSide);
  const along = (rng() * 2 - 1) * (GRID.halfExtent - 6);
  const side = (rng() < 0.5 ? -1 : 1) * (GRID.roadWidth / 2 + 1.6 + rng() * 1.2);
  if (vertical) return { x: roadCenter(roadIndex) + side, z: along };
  return { x: along, z: roadCenter(roadIndex) + side };
}

const CITIZEN_COUNT = 26;

/**
 * The crowd. Citizens pick sidewalk targets and stroll; panic makes them sprint away from
 * a point; being hit knocks them down for a while before they scramble off and respawn.
 */
export class PedestrianSystem {
  constructor(scene, rng) {
    this.rng = rng;
    this.citizens = [];
    for (let i = 0; i < CITIZEN_COUNT; i += 1) {
      const shirt = PALETTE.shirts[Math.floor(rng() * PALETTE.shirts.length)];
      const pants = PALETTE.pants[Math.floor(rng() * PALETTE.pants.length)];
      const skin = PALETTE.skinTones[Math.floor(rng() * PALETTE.skinTones.length)];
      const mesh = buildPerson({ shirt, pants, skin, hat: rng() < 0.3 ? 0xffca3a : null });
      scene.add(mesh);
      const start = randomSidewalkPoint(rng);
      mesh.position.set(start.x, 0, start.z);
      this.citizens.push({
        mesh,
        position: mesh.position,
        heading: rng() * Math.PI * 2,
        target: randomSidewalkPoint(rng),
        state: 'walk', // walk | panic | down
        health: 100,
        phase: rng() * 6,
        panicFrom: null,
        panicTimer: 0,
        downTimer: 0,
        speedNow: 0,
      });
    }
  }

  /** Makes every citizen near `point` run away from it for a few seconds. */
  panicNear(point, radius = 14) {
    for (const ped of this.citizens) {
      if (ped.state === 'down') continue;
      if (ped.position.distanceTo(point) < radius) {
        ped.state = 'panic';
        ped.panicFrom = { x: point.x, z: point.z };
        ped.panicTimer = 2.5 + this.rng() * 2;
      }
    }
  }

  /** Knocks a citizen down (car hit, punch, bullet). They get back up later unless dead. */
  knockDown(ped, lethal = false) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downTimer = lethal ? 9999 : 6 + this.rng() * 4;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.25;
  }

  update(dt, game) {
    for (const ped of this.citizens) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          // Scramble up somewhere quiet and rejoin the crowd.
          const spot = randomSidewalkPoint(this.rng);
          ped.mesh.rotation.x = 0;
          ped.mesh.position.set(spot.x, 0, spot.z);
          ped.state = 'walk';
          ped.health = 100;
          ped.target = randomSidewalkPoint(this.rng);
        }
        continue;
      }

      let speed = 1.7;
      if (ped.state === 'panic') {
        ped.panicTimer -= dt;
        if (ped.panicTimer <= 0) ped.state = 'walk';
        const away = Math.atan2(ped.position.x - ped.panicFrom.x, ped.position.z - ped.panicFrom.z);
        ped.target = {
          x: ped.position.x + Math.sin(away) * 12,
          z: ped.position.z + Math.cos(away) * 12,
        };
        speed = 4.6;
      }

      const dx = ped.target.x - ped.position.x;
      const dz = ped.target.z - ped.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) {
        ped.target = randomSidewalkPoint(this.rng);
        continue;
      }
      const desired = Math.atan2(dx, dz);
      let turn = desired - ped.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      ped.heading += Math.max(-3.2 * dt, Math.min(3.2 * dt, turn));

      // Stop for a car that is close in front.
      let blocked = false;
      for (const car of game.allCars) {
        const cdx = car.position.x - ped.position.x;
        const cdz = car.position.z - ped.position.z;
        const cd = Math.hypot(cdx, cdz);
        if (cd < 3.4 && Math.abs(car.speed) > 1) { blocked = true; break; }
      }
      ped.speedNow = blocked ? 0 : speed;
      if (!blocked) {
        ped.position.x += Math.sin(ped.heading) * speed * dt;
        ped.position.z += Math.cos(ped.heading) * speed * dt;
        ped.phase += dt * speed * 2.4;
      }
      ped.mesh.rotation.y = ped.heading;
      animatePerson(ped.mesh, ped.phase, ped.state === 'panic' ? 1 : 0);
      void game;
    }
  }
}
