// Combat: Rico's fists, the pistol (hitscan with a tracer), and the Thug — a hostile NPC
// used by the turf missions who runs at Rico and swings back. Violence near witnesses or
// police raises the wanted heat; gunfire panics the crowd.

import { PLAYER, WANTED } from './config.js';
import { collidesWithCity } from './city.js';
import { animatePerson, buildPerson } from './pedestrians.js';

/** True when anyone (citizen or cop) is close enough to see a crime at `point`. */
function witnessed(game, point, radius = 17) {
  for (const ped of game.pedestrians.citizens) {
    if (ped.state !== 'down' && ped.position.distanceTo(point) < radius) return true;
  }
  return game.police.nearestCopDistance(point) < radius + 8;
}

/**
 * A punch: hits the closest citizen, thug or (bravely) anything standing in front of Rico.
 * Returns true when something was hit.
 */
export function punch(game) {
  const player = game.player;
  if (player.car) return false;
  game.audio.playPunch();
  const fwd = { x: Math.sin(player.heading), z: Math.cos(player.heading) };
  const reach = PLAYER.punchRange;
  let hitSomething = false;

  const inFront = (pos) => {
    const dx = pos.x - player.position.x;
    const dz = pos.z - player.position.z;
    const dist = Math.hypot(dx, dz);
    return dist < reach && (dist < 0.7 || (dx * fwd.x + dz * fwd.z) / (dist || 1) > 0.35);
  };

  for (const ped of game.pedestrians.citizens) {
    if (ped.state !== 'down' && inFront(ped.position)) {
      game.pedestrians.knockDown(ped);
      game.pedestrians.panicNear(ped.position, 12);
      hitSomething = true;
    }
  }
  for (const thug of game.combat.thugs) {
    if (!thug.down && inFront(thug.position)) {
      thug.damage(PLAYER.punchDamage, game);
      hitSomething = true;
    }
  }
  if (hitSomething && witnessed(game, player.position)) {
    game.addHeat(WANTED.heatPunch, player.position);
  }
  return hitSomething;
}

// Tracer pool: short-lived additive lines from muzzle to impact.
const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 });

/**
 * Fires the pistol toward the camera's aim. Steps the ray until it meets a citizen, thug,
 * car, building or the ground (max ~70 m), applies damage, draws a tracer, and — because
 * gunfire is loud — panics the crowd and adds heat when witnessed.
 */
export function shoot(game, origin, direction) {
  const player = game.player;
  game.audio.playShot();
  game.pedestrians.panicNear(player.position, 16);
  if (witnessed(game, player.position, 20)) {
    game.addHeat(WANTED.heatShotFired, player.position);
  }

  const step = 0.6;
  let impact = null;
  let hitKind = null;
  const point = { x: origin.x, y: origin.y, z: origin.z };
  for (let travelled = 0; travelled < 70; travelled += step) {
    point.x += direction.x * step;
    point.y += direction.y * step;
    point.z += direction.z * step;
    if (point.y < 0) { impact = { ...point }; hitKind = 'ground'; break; }
    if (collidesWithCity(game.city.colliders, point.x, point.z, 0.2) && point.y < 30) {
      impact = { ...point };
      hitKind = 'building';
      break;
    }
    for (const ped of game.pedestrians.citizens) {
      if (ped.state === 'down') continue;
      const dx = ped.position.x - point.x;
      const dz = ped.position.z - point.z;
      if (dx * dx + dz * dz < 0.55 && point.y < 2) {
        game.pedestrians.knockDown(ped, true);
        game.addHeat(WANTED.heatHitPedestrian, ped.position);
        impact = { ...point };
        hitKind = 'ped';
        break;
      }
    }
    if (impact) break;
    for (const thug of game.combat.thugs) {
      if (thug.down) continue;
      const dx = thug.position.x - point.x;
      const dz = thug.position.z - point.z;
      if (dx * dx + dz * dz < 0.55 && point.y < 2.1) {
        thug.damage(55, game);
        impact = { ...point };
        hitKind = 'thug';
        break;
      }
    }
    if (impact) break;
    for (const car of game.allCars) {
      const dx = car.position.x - point.x;
      const dz = car.position.z - point.z;
      if (dx * dx + dz * dz < 4.4 && point.y < 1.8) {
        car.health -= 26;
        if (car.police) game.addHeat(WANTED.heatPoliceHit, car.position);
        if (car.health <= 0 && !car.disabled) {
          car.disabled = true;
          game.audio.playCrash(0.8);
        }
        impact = { ...point };
        hitKind = 'car';
        break;
      }
    }
    if (impact) break;
  }
  if (!impact) {
    impact = {
      x: origin.x + direction.x * 70,
      y: Math.max(0.2, origin.y + direction.y * 70),
      z: origin.z + direction.z * 70,
    };
  }
  void hitKind;

  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(origin.x, origin.y, origin.z),
    new THREE.Vector3(impact.x, impact.y, impact.z),
  ]);
  const line = new THREE.Line(geometry, tracerMaterial);
  game.scene.add(line);
  game.combat.tracers.push({ line, life: 0.07 });
}

/** A hostile local who charges Rico and punches him; used by the turf missions. */
export class Thug {
  constructor(scene, x, z, rng) {
    this.mesh = buildPerson({ shirt: 0x37474f, pants: 0x1a1a2e, skin: 0x8d5524, hat: 0x111111 });
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.position = this.mesh.position;
    this.heading = rng() * Math.PI * 2;
    this.health = 100;
    this.down = false;
    this.phase = rng() * 6;
    this.swingTimer = 0;
  }

  damage(amount, game) {
    this.health -= amount;
    game.audio.playPunch();
    if (this.health <= 0 && !this.down) {
      this.down = true;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.25;
    }
  }

  update(dt, game) {
    if (this.down) return;
    const player = game.player;
    const target = player.car ? player.car.position : player.position;
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 34) {
      // Too far to care: stand and wait (turf thugs hold their corner).
      animatePerson(this.mesh, 0, 0);
      return;
    }
    this.swingTimer -= dt;
    if (dist > 1.5) {
      const desired = Math.atan2(dx, dz);
      let turn = desired - this.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      this.heading += Math.max(-4 * dt, Math.min(4 * dt, turn));
      const speed = 4.4;
      this.position.x += Math.sin(this.heading) * speed * dt;
      this.position.z += Math.cos(this.heading) * speed * dt;
      this.phase += dt * speed * 2.2;
    } else if (this.swingTimer <= 0 && !player.car) {
      this.swingTimer = 0.9;
      player.damage(7, game);
      game.audio.playPunch();
    }
    this.mesh.rotation.y = this.heading;
    animatePerson(this.mesh, this.phase, 1);
  }

  dispose(scene) {
    scene.remove(this.mesh);
  }
}

/** Owns the live thugs and tracer effects; main.js calls update every frame. */
export class CombatSystem {
  constructor() {
    this.thugs = [];
    this.tracers = [];
  }

  update(dt, game) {
    for (const thug of this.thugs) thug.update(dt, game);
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const tracer = this.tracers[i];
      tracer.life -= dt;
      if (tracer.life <= 0) {
        game.scene.remove(tracer.line);
        tracer.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  clearThugs(scene) {
    for (const thug of this.thugs) thug.dispose(scene);
    this.thugs = [];
  }
}
