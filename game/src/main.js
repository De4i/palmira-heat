// Palmira Heat — boot and game loop. Builds the world (city, traffic, crowd, police,
// missions, combat), owns the input, the third-person camera, the day cycle, the crime
// bookkeeping (crashes, hits, heat), the screen state machine (menu / playing / paused /
// over) and the deterministic ?shot= screenshot mode.

import { CAR, PALETTE, WANTED, createRng } from './config.js';
import { buildPalmiraCity } from './city.js';
import { Car } from './vehicles.js';
import { TrafficSystem } from './traffic.js';
import { PedestrianSystem } from './pedestrians.js';
import { Player } from './player.js';
import { PoliceSystem } from './police.js';
import { MissionSystem } from './missions.js';
import { CombatSystem, punch, shoot } from './combat.js';
import { Hud } from './hud.js';
import { AudioSystem } from './audio.js';
import { clearSave, loadSave, storeSave } from './save.js';
import { FIXED_DT, stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') ?? 7) || 7;
const rng = createRng(seed * 1000 + 17);

// ----- renderer / scene / light rig ------------------------------------------

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 130, 470);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1400);
camera.position.set(-190, 26, 90);

const hemi = new THREE.HemisphereLight(0xbfe8ff, 0xe8c39e, 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffdfb0, 1.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -95;
sun.shadow.camera.right = 95;
sun.shadow.camera.top = 95;
sun.shadow.camera.bottom = -95;
sun.shadow.camera.far = 620;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);

// ----- world and systems -------------------------------------------------------

const game = {
  scene,
  rng,
  state: shotName ? 'playing' : 'menu', // menu | playing | paused | over
  endMode: null, // busted | wasted | cleared
  cash: 0,
  rep: 0,
  pistol: false,
  allCars: [],
  shotCamera: null,
  time: 0,
  dayTime: 0.58, // golden afternoon
  crashCooldown: 0,
  addHeat(amount, pos) {
    const before = this.police.stars;
    this.police.addHeat(amount);
    if (this.police.stars > before) {
      this.hud.toast(this.police.stars >= 5 ? '★ MAXIMUM HEAT ★' : 'WANTED LEVEL UP', 1.8);
    }
    void pos;
  },
  unlockPistol() {
    if (this.pistol) return;
    this.pistol = true;
    this.hud.toast('PISTOL UNLOCKED — CLICK TO SHOOT', 3);
  },
  saveProgress() {
    storeSave({ cash: this.cash, rep: this.rep, missionIndex: this.missions.missionIndex, pistol: this.pistol });
    this.hud.setCash(this.cash);
    this.hud.setRep(this.rep);
  },
  onBusted() {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.endMode = 'busted';
    this.audio.playBusted();
    this.audio.setSiren(false);
    showEndScreen('BUSTED', 'The Palmira PD finally got their hands on Rico. Bail money stings: 10% of his cash is gone. The current job has to be run again.');
  },
  onWasted() {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.endMode = 'wasted';
    this.audio.setSiren(false);
    showEndScreen('WASTED', 'Rico wakes up outside Palmira General with a headache and a bill. The current job has to be run again.');
  },
  onStoryComplete() {
    this.hud.toast('★ STORY COMPLETE — PALMIRA LEGEND ★', 5);
  },
};

window.__palmira = game; // debug/inspection handle (also handy for automated checks)

game.city = buildPalmiraCity(scene, rng);
game.audio = new AudioSystem();
game.hud = new Hud();
game.player = new Player(scene);
game.traffic = new TrafficSystem(scene, rng, game.city.colliders);
game.pedestrians = new PedestrianSystem(scene, rng);
game.police = new PoliceSystem(scene, rng, game.city.colliders);
game.combat = new CombatSystem();
game.missions = new MissionSystem(scene, rng);

// ----- screens -------------------------------------------------------------------

const startScreen = document.getElementById('startscreen');
const pauseScreen = document.getElementById('pausescreen');
const endScreen = document.getElementById('endscreen');
const endTitle = document.getElementById('end-title');
const endText = document.getElementById('end-text');
const continueButton = document.getElementById('btn-continue');

function showEndScreen(title, text) {
  endTitle.textContent = title;
  endText.textContent = text;
  endScreen.classList.remove('hidden');
}

function beginPlay(fromSave) {
  startScreen.classList.add('hidden');
  endScreen.classList.add('hidden');
  game.hud.show();
  game.state = 'playing';
  game.audio.init();
  if (fromSave) {
    const save = loadSave();
    if (save) {
      game.cash = save.cash;
      game.rep = save.rep;
      game.pistol = save.pistol;
      game.missions.restore(save.missionIndex);
    }
  }
  game.hud.setCash(game.cash);
  game.hud.setRep(game.rep);
  document.getElementById('status').textContent = 'Palmira Heat started.';
}

function respawnAfterEnd() {
  endScreen.classList.add('hidden');
  if (game.endMode === 'busted') {
    game.cash = Math.max(0, Math.floor(game.cash * 0.9));
  }
  game.police.clearHeat();
  game.player.resetToSpawn();
  game.missions.restartCurrentMission(game);
  game.saveProgress();
  game.endMode = null;
  game.state = 'playing';
}

document.getElementById('btn-start').addEventListener('click', () => {
  clearSave();
  game.cash = 0;
  game.rep = 0;
  game.pistol = false;
  game.missions.restore(0);
  game.player.resetToSpawn();
  beginPlay(false);
});
continueButton.addEventListener('click', () => beginPlay(true));
document.getElementById('btn-resume').addEventListener('click', () => togglePause(false));
document.getElementById('btn-restart').addEventListener('click', respawnAfterEnd);
if (loadSave()) continueButton.classList.remove('hidden');

function togglePause(force) {
  if (game.state !== 'playing' && game.state !== 'paused') return;
  const toPaused = force !== undefined ? force : game.state === 'playing';
  game.state = toPaused ? 'paused' : 'playing';
  pauseScreen.classList.toggle('hidden', !toPaused);
}

// ----- input -----------------------------------------------------------------------

const keys = new Set();
let cameraYaw = game.player.heading;
let cameraPitch = 0.34;
let dragging = false;
let dragMoved = 0;
let dragStart = 0;

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  keys.add(event.code);
  game.audio.init();
  if (game.state === 'playing') {
    if (event.code === 'KeyE') toggleVehicle();
    if (event.code === 'KeyF') doAttack();
    if (event.code === 'KeyP' || event.code === 'Escape') togglePause(true);
    if (event.code === 'KeyM') {
      const muted = game.audio.toggleMute();
      game.hud.toast(muted ? 'SOUND OFF' : 'SOUND ON', 1.2);
    }
  } else if (game.state === 'paused' && (event.code === 'KeyP' || event.code === 'Escape')) {
    togglePause(false);
  } else if (game.state === 'menu' && event.code === 'Enter') {
    document.getElementById('btn-start').click();
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

canvas.addEventListener('mousedown', (event) => {
  dragging = true;
  dragMoved = 0;
  dragStart = performance.now();
  void event;
});
window.addEventListener('mousemove', (event) => {
  if (!dragging || game.state !== 'playing') return;
  dragMoved += Math.abs(event.movementX) + Math.abs(event.movementY);
  cameraYaw -= event.movementX * 0.0052;
  cameraPitch = Math.max(0.06, Math.min(1.15, cameraPitch + event.movementY * 0.004));
});
window.addEventListener('mouseup', (event) => {
  if (dragging && game.state === 'playing' && dragMoved < 6 && performance.now() - dragStart < 350) {
    doAttack();
  }
  dragging = false;
  void event;
});

function toggleVehicle() {
  const player = game.player;
  if (player.car) {
    player.exitCar();
    game.audio.setEngine(0, false);
  } else {
    const car = player.nearestEnterableCar(game);
    if (car) {
      game.player.enterCar(game, car);
      cameraYaw = car.heading;
    }
  }
}

function doAttack() {
  const player = game.player;
  if (player.car) return;
  if (game.pistol) {
    const origin = {
      x: player.position.x + Math.sin(player.heading) * 0.4,
      y: 1.45,
      z: player.position.z + Math.cos(player.heading) * 0.4,
    };
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    shoot(game, origin, direction);
  } else {
    punch(game);
  }
}

function readFootInput() {
  return {
    forward: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
    strafe: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
    run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
  };
}

function readDriveInput() {
  return {
    throttle: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
    steer: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
    handbrake: keys.has('Space'),
  };
}

// ----- crime + collision bookkeeping -------------------------------------------------

function assembleCars() {
  const cars = [...game.traffic.cars];
  for (const cop of game.police.cops) cars.push(cop.car);
  for (const block of game.police.roadblocks) cars.push(...block.cars);
  if (game.missions.chaseCar) cars.push(game.missions.chaseCar);
  if (game.player.car && !cars.includes(game.player.car)) cars.push(game.player.car);
  game.allCars = cars;
}

function runCollisions(dt) {
  game.crashCooldown = Math.max(0, game.crashCooldown - dt);
  const cars = game.allCars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (Math.abs(a.position.x - b.position.x) > 6 || Math.abs(a.position.z - b.position.z) > 6) continue;
      const impact = Car.collidePair(a, b);
      if (impact > 5) {
        const involvesPlayer = a === game.player.car || b === game.player.car;
        const other = a === game.player.car ? b : a;
        if (game.missions.chaseCar && (a === game.missions.chaseCar || b === game.missions.chaseCar)) {
          game.missions.chaseCar.health -= impact * 2.4;
        }
        if (involvesPlayer && game.crashCooldown <= 0) {
          game.crashCooldown = 0.7;
          game.audio.playCrash(Math.min(1, impact / 14));
          if (impact > 9) game.player.damage((impact - 8.5) * 1.1, game);
          if (other.kind === 'traffic' || other.kind === 'parked') game.addHeat(WANTED.heatHitCar, other.position);
          if (other.police) game.addHeat(WANTED.heatPoliceHit, other.position);
        }
      }
    }
  }
  // Cars versus pedestrians.
  for (const car of cars) {
    if (Math.abs(car.speed) < 4) continue;
    for (const ped of game.pedestrians.citizens) {
      if (ped.state === 'down') continue;
      const dx = ped.position.x - car.position.x;
      const dz = ped.position.z - car.position.z;
      if (dx * dx + dz * dz < 3.1) {
        game.pedestrians.knockDown(ped, Math.abs(car.speed) > 13);
        game.pedestrians.panicNear(ped.position, 13);
        game.audio.playCrash(0.5);
        if (car === game.player.car) {
          game.addHeat(WANTED.heatHitPedestrian, ped.position);
          game.player.damage(2, game);
        }
        car.speed *= 0.6;
      }
    }
  }
}

// ----- day cycle -----------------------------------------------------------------------

const SKY_STOPS = [
  { t: 0.0, sky: new THREE.Color(0x7fb2d9), fog: new THREE.Color(0xe8b48c), sun: 0.55, hemi: 0.55 },
  { t: 0.3, sky: new THREE.Color(0x8fd8ef), fog: new THREE.Color(0xcfe8dd), sun: 1.25, hemi: 0.85 },
  { t: 0.58, sky: new THREE.Color(0x8fd8ef), fog: new THREE.Color(0xf6cf9f), sun: 1.2, hemi: 0.8 },
  { t: 0.72, sky: new THREE.Color(0xf2a65a), fog: new THREE.Color(0xf6a35c), sun: 0.8, hemi: 0.6 },
  { t: 0.82, sky: new THREE.Color(0x27355c), fog: new THREE.Color(0x3a4668), sun: 0.12, hemi: 0.3 },
  { t: 0.95, sky: new THREE.Color(0x1d2a4a), fog: new THREE.Color(0x2c3a58), sun: 0.08, hemi: 0.26 },
  { t: 1.0, sky: new THREE.Color(0x7fb2d9), fog: new THREE.Color(0xe8b48c), sun: 0.55, hemi: 0.55 },
];

function applyDayCycle() {
  const t = game.dayTime;
  let a = SKY_STOPS[0];
  let b = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i < SKY_STOPS.length - 1; i += 1) {
    if (t >= SKY_STOPS[i].t && t <= SKY_STOPS[i + 1].t) {
      a = SKY_STOPS[i];
      b = SKY_STOPS[i + 1];
      break;
    }
  }
  const f = (t - a.t) / Math.max(0.0001, b.t - a.t);
  scene.background.copy(a.sky).lerp(b.sky, f);
  scene.fog.color.copy(a.fog).lerp(b.fog, f);
  sun.intensity = a.sun + (b.sun - a.sun) * f;
  hemi.intensity = a.hemi + (b.hemi - a.hemi) * f;
  const sunAngle = (t - 0.25) * Math.PI * 2;
  const focus = game.player.car ? game.player.car.position : game.player.position;
  sun.position.set(focus.x + Math.cos(sunAngle) * 190, Math.max(14, Math.sin(sunAngle) * 210), focus.z - 90);
  sun.target.position.copy(focus);
  const night = t > 0.76 || t < 0.06 ? 1 : t > 0.68 ? (t - 0.68) / 0.08 : 0;
  game.city.setNightFactor(Math.max(0, Math.min(1, night)));
}

// ----- the step -------------------------------------------------------------------------

let shotController = null;
let shotStep = 0;

function step(dt, input) {
  game.time += dt;
  assembleCars();

  if (game.state === 'playing' || game.state === 'menu') {
    game.traffic.update(dt, game);
    game.pedestrians.update(dt, game);
    game.combat.update(dt, game);
    if (game.state === 'playing') {
      game.police.update(dt, game);
      game.missions.update(dt, game);
    }
  }

  const player = game.player;
  if (game.state === 'playing') {
    if (player.car) {
      const drive = input?.drive ?? readDriveInput();
      const crashed = player.car.drive(dt, drive, game.city.colliders, 1);
      player.updateInCar(dt);
      if (crashed && game.crashCooldown <= 0) {
        game.crashCooldown = 0.7;
        game.audio.playCrash(0.7);
        player.damage(3, game);
      }
      // Camera drifts to behind the car while rolling.
      if (Math.abs(player.car.speed) > 3) {
        let diff = player.car.heading - cameraYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        cameraYaw += diff * Math.min(1, dt * 1.7);
      }
      const ratio = Math.abs(player.car.speed) / CAR.maxSpeed;
      game.audio.setEngine(ratio, true);
      game.audio.setSkid(drive.handbrake && Math.abs(player.car.speed) > 6 ? 0.8 : 0);
      game.hud.setSpeed(Math.abs(player.car.speed) * 3.6);
      game.hud.setPrompt(null);
    } else {
      const foot = input?.foot ?? readFootInput();
      player.updateOnFoot(dt, game, foot, cameraYaw);
      game.audio.setEngine(0, false);
      game.audio.setSkid(0);
      game.hud.setSpeed(null);
      const nearCar = player.nearestEnterableCar(game);
      game.hud.setPrompt(nearCar ? '<b>E</b> — Enter / steal car' : null);
    }
    runCollisions(dt);
    // HUD refresh.
    game.hud.setStars(game.police.stars);
    game.hud.setHealth(player.health / 100);
    game.hud.setCash(game.cash);
    game.hud.setRep(game.rep);
    game.audio.setSiren(game.police.stars > 0 && game.police.nearestCopDistance(player.position) < 80);
    game.audio.update(dt);
  }
  game.hud.update(dt);
  game.hud.drawMinimap(game, game.time);
  if (!shotName) game.dayTime = (game.dayTime + dt / 300) % 1;
  applyDayCycle();
  updateCamera(dt);
}

function updateCamera(dt) {
  if (game.shotCamera) {
    camera.position.set(game.shotCamera.pos.x, game.shotCamera.pos.y, game.shotCamera.pos.z);
    camera.lookAt(game.shotCamera.look.x, game.shotCamera.look.y, game.shotCamera.look.z);
    return;
  }
  if (game.state === 'menu') {
    const t = game.time * 0.05;
    camera.position.set(-120 + Math.cos(t) * 55, 17 + Math.sin(game.time * 0.11) * 3, 40 + Math.sin(t) * 55);
    camera.lookAt(-60, 4, -10);
    return;
  }
  const player = game.player;
  const focus = player.car ? player.car.position : player.position;
  const dist = player.car ? 11.5 : 8;
  const height = player.car ? 4.4 : 3.1;
  const fx = Math.sin(cameraYaw);
  const fz = Math.cos(cameraYaw);
  const pitchLift = Math.sin(cameraPitch) * dist;
  const flat = Math.cos(cameraPitch) * dist;
  camera.position.set(focus.x - fx * flat, (player.car ? 1.1 : 1.6) + height + pitchLift * 0.55, focus.z - fz * flat);
  camera.lookAt(focus.x + fx * 6, (player.car ? 1.1 : 1.6) + 0.4, focus.z + fz * 6);
  void dt;
}

// ----- boot ------------------------------------------------------------------------------

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (shotName) {
  startScreen.classList.add('hidden');
  game.hud.show();
  shotController = stageShot(shotName, game);
  game.hud.setCash(game.cash);
  game.hud.setRep(game.rep);
}

let lastTimestamp = performance.now();
function frame(timestamp) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
  lastTimestamp = timestamp;
  if (game.state === 'paused' || game.state === 'over') {
    renderer.render(scene, camera);
    return;
  }
  if (shotName && shotController) {
    // Deterministic: fixed steps, scripted input, camera placed by the scene.
    if (shotStep < shotController.steps) {
      const scripted = shotController.input(shotStep);
      step(FIXED_DT, { foot: scripted.forward !== undefined ? scripted : undefined, drive: scripted.throttle !== undefined ? scripted : undefined });
      shotStep += 1;
    }
    // After the scripted steps the simulation freezes: the captured frame is the staged
    // frame, no matter when in the virtual-time budget the capture lands.
    shotController.placeCamera(game);
    updateCamera(0);
    window.__palmiraReady = true;
  } else {
    step(dt);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
