// The HUD: DOM panels for cash / rep / wanted stars / health / speed / objective / dialogue /
// prompts / toasts, plus the round canvas minimap. The minimap's static layer (ocean, land,
// road grid, blocks) is painted once to an offscreen canvas; each refresh blits it and adds
// the dynamic dots — player arrow, traffic, police, and the pulsing mission marker.

import { GRID, roadCenter } from './config.js';

const MAP_WORLD = 400; // metres of world shown across the minimap

function el(id) {
  return document.getElementById(id);
}

export class Hud {
  constructor() {
    this.root = el('hud');
    this.cashEl = el('cash');
    this.repEl = el('rep');
    this.starsEl = el('stars');
    this.healthEl = el('healthbar');
    this.speedoEl = el('speedo');
    this.speedNumEl = el('speednum');
    this.objectiveEl = el('objective');
    this.objectiveTextEl = el('objective-text');
    this.dialogueEl = el('dialogue');
    this.dialogueNameEl = el('dialogue-name');
    this.dialogueTextEl = el('dialogue-text');
    this.promptEl = el('prompt');
    this.toastEl = el('toast');
    this.flashEl = el('damageflash');
    this.dialogueTimer = 0;
    this.toastTimer = 0;
    this.mapCanvas = el('minimap');
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.staticMap = this.paintStaticMap();
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  setCash(cash) {
    this.cashEl.textContent = `$${cash.toLocaleString('en-US')}`;
  }

  setRep(rep) {
    this.repEl.textContent = `REP ${rep}`;
  }

  setStars(stars) {
    let html = '';
    for (let i = 0; i < 5; i += 1) {
      html += i < stars ? '★' : '<span class="off">★</span>';
    }
    this.starsEl.innerHTML = html;
  }

  setHealth(fraction) {
    this.healthEl.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  }

  /** kmh number while driving, or null to hide the speedometer. */
  setSpeed(kmh) {
    if (kmh === null) {
      this.speedoEl.classList.add('hidden');
    } else {
      this.speedoEl.classList.remove('hidden');
      this.speedNumEl.textContent = String(Math.round(kmh));
    }
  }

  setObjective(text) {
    if (!text) {
      this.objectiveEl.classList.add('hidden');
    } else {
      this.objectiveEl.classList.remove('hidden');
      this.objectiveTextEl.textContent = text;
    }
  }

  showDialogue(name, text, seconds = 3.4) {
    this.dialogueNameEl.textContent = name;
    this.dialogueTextEl.textContent = text;
    this.dialogueEl.classList.remove('hidden');
    this.dialogueTimer = seconds;
  }

  hideDialogue() {
    this.dialogueEl.classList.add('hidden');
    this.dialogueTimer = 0;
  }

  setPrompt(text) {
    if (!text) {
      this.promptEl.classList.add('hidden');
    } else {
      this.promptEl.classList.remove('hidden');
      this.promptEl.innerHTML = text;
    }
  }

  toast(text, seconds = 2.6) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    this.toastTimer = seconds;
  }

  /** Removes any toast immediately (staging code uses this to hide setup side-effects). */
  clearToast() {
    this.toastEl.classList.add('hidden');
    this.toastTimer = 0;
  }

  damageFlash() {
    this.flashEl.style.opacity = '1';
    setTimeout(() => {
      this.flashEl.style.opacity = '0';
    }, 130);
  }

  /** Per-frame housekeeping: dialogue and toast lifetimes. */
  update(dt) {
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.dialogueEl.classList.add('hidden');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.add('hidden');
    }
  }

  // ----- minimap -------------------------------------------------------------

  paintStaticMap() {
    const size = this.mapCanvas.width;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const toMap = (world) => ((world + MAP_WORLD / 2) / MAP_WORLD) * size;
    // Ocean everywhere, then the landmass.
    ctx.fillStyle = '#2e9db8';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#8fce6e';
    ctx.fillRect(toMap(-186), 0, toMap(186) - toMap(-186), size);
    ctx.fillStyle = '#f2d492';
    ctx.fillRect(toMap(-186), 0, toMap(-160) - toMap(-186), size); // beach
    // Marina inlet.
    ctx.fillStyle = '#1f7d99';
    ctx.fillRect(toMap(178), toMap(28), size - toMap(178), toMap(362) - toMap(28));
    // Blocks then roads.
    ctx.fillStyle = '#cbb99f';
    for (let col = 0; col < GRID.blocksPerSide - 1; col += 1) {
      for (let row = 0; row < GRID.blocksPerSide - 1; row += 1) {
        const x = roadCenter(col) + GRID.roadWidth / 2;
        const z = roadCenter(row) + GRID.roadWidth / 2;
        ctx.fillRect(toMap(x), toMap(z), (GRID.blockSize / MAP_WORLD) * size, (GRID.blockSize / MAP_WORLD) * size);
      }
    }
    ctx.strokeStyle = '#3c4148';
    ctx.lineWidth = Math.max(2, (GRID.roadWidth / MAP_WORLD) * size * 0.8);
    for (let i = 0; i < GRID.blocksPerSide; i += 1) {
      ctx.beginPath();
      ctx.moveTo(toMap(roadCenter(i)), toMap(-GRID.halfExtent));
      ctx.lineTo(toMap(roadCenter(i)), toMap(GRID.halfExtent));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toMap(-GRID.halfExtent), toMap(roadCenter(i)));
      ctx.lineTo(toMap(GRID.halfExtent), toMap(roadCenter(i)));
      ctx.stroke();
    }
    return canvas;
  }

  /** Redraws the minimap from live game state. North is up; the player arrow rotates. */
  drawMinimap(game, time) {
    const ctx = this.mapCtx;
    const size = this.mapCanvas.width;
    const toMap = (world) => ((world + MAP_WORLD / 2) / MAP_WORLD) * size;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.staticMap, 0, 0);

    const dot = (x, z, color, radius) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toMap(x), toMap(z), radius, 0, Math.PI * 2);
      ctx.fill();
    };

    for (const car of game.traffic.cars) dot(car.position.x, car.position.z, 'rgba(255,248,236,0.85)', 2);
    for (const cop of game.police.cops) {
      dot(cop.car.position.x, cop.car.position.z, Math.sin(time * 10) > 0 ? '#4da3ff' : '#ff4d6d', 3);
    }
    if (game.missions && game.missions.target) {
      const t = game.missions.target;
      const pulse = 4.5 + Math.sin(time * 5) * 1.6;
      dot(t.x, t.z, '#ffca3a', pulse);
      ctx.strokeStyle = '#fff8ec';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(toMap(t.x), toMap(t.z), pulse + 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Player arrow (or car arrow): a triangle along the heading in map space (canvas y
    // grows the same way as world z, so heading vectors map across unchanged).
    const focus = game.player.car ?? game.player;
    const px = toMap(focus.position.x);
    const pz = toMap(focus.position.z);
    const fx = Math.sin(focus.heading);
    const fz = Math.cos(focus.heading);
    const rx = fz;
    const rz = -fx;
    ctx.fillStyle = '#e63946';
    ctx.strokeStyle = '#fff8ec';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + fx * 7, pz + fz * 7);
    ctx.lineTo(px - fx * 5 + rx * 4.4, pz - fz * 5 + rz * 4.4);
    ctx.lineTo(px - fx * 5 - rx * 4.4, pz - fz * 5 - rz * 4.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
