const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

const id = Math.random().toString(36).substr(2, 9);
const channel = new BroadcastChannel("orbs");
const others = {};

let orbX = canvas.width / 2;
let orbY = canvas.height / 2;
let velX = 0;
let velY = 0;
let lastScreenX = window.screenX;
let lastScreenY = window.screenY;
let time = 0;
let anger = 0;  // 0..1 proximity anger level
let merge = 0;  // 0..1 deep collision level

const ORB_RADIUS = 96;
const TENDRIL_COUNT = 4;

// ── Particle layers ──────────────────────────────────────────────────────────
// CORE   : tiny, very bright, fast spin — the hot combusting nucleus
// RING   : main vortex band, pulls into tendrils
// HALO   : slow outer wisps, large and transparent
const LAYER = { CORE: 0, RING: 1, HALO: 2 };
const COUNTS = { [LAYER.CORE]: 256, [LAYER.RING]: 1024, [LAYER.HALO]: 192 };
const PARTICLE_COUNT = Object.values(COUNTS).reduce((a, b) => a + b, 0);

function makeParticle(layer, i) {
  const tid = i % TENDRIL_COUNT;
  switch (layer) {
    case LAYER.CORE:
      return {
        layer, tid,
        phi: Math.acos(1 - 2 * Math.random()),
        theta: Math.random() * Math.PI * 2,
        r: ORB_RADIUS * (0.05 + Math.random() * 0.30),
        speed: (0.032 + Math.random() * 0.055) * (Math.random() < 0.5 ? 1 : -1),
        phiSpeed: (Math.random() - 0.5) * 0.010,
        size: 0.6 + Math.random() * 1.4,
        // Per-particle turbulence offsets so each one blinks independently
        noiseOffset: Math.random() * Math.PI * 2,
        noiseSpeed: 0.04 + Math.random() * 0.10,
        tendrilOffset: 0, tendrilPhase: 0,
      };
    case LAYER.RING:
      return {
        layer, tid,
        phi: Math.acos(1 - 2 * Math.random()),
        theta: Math.random() * Math.PI * 2,
        r: ORB_RADIUS * (0.55 + Math.random() * 0.48),
        speed: (0.008 + Math.random() * 0.020) * (Math.random() < 0.5 ? 1 : -1),
        phiSpeed: (Math.random() - 0.5) * 0.003,
        size: 1.0 + Math.random() * 2.0,
        tendrilOffset: (tid - (TENDRIL_COUNT - 1) / 2) * 22,
        tendrilPhase: (tid / TENDRIL_COUNT) * Math.PI * 2,
      };
    case LAYER.HALO:
      return {
        layer, tid,
        phi: Math.acos(1 - 2 * Math.random()),
        theta: Math.random() * Math.PI * 2,
        r: ORB_RADIUS * (1.05 + Math.random() * 0.55),
        speed: (0.003 + Math.random() * 0.007) * (Math.random() < 0.5 ? 1 : -1),
        phiSpeed: (Math.random() - 0.5) * 0.002,
        size: 3.5 + Math.random() * 5.0,
        tendrilOffset: (tid - (TENDRIL_COUNT - 1) / 2) * 38,
        tendrilPhase: (tid / TENDRIL_COUNT) * Math.PI * 2,
        noiseOffset: Math.random() * Math.PI * 2,
        noiseSpeed: 0,
      };
  }
}

const particles = [];
for (const [layer, count] of Object.entries(COUNTS)) {
  for (let i = 0; i < count; i++) particles.push(makeParticle(Number(layer), i));
}

channel.onmessage = (event) => {
  const data = event.data;
  if (data.id !== id) {
    others[data.id] = { ...data, lastSeen: Date.now() };
  }
};

function broadcast() {
  channel.postMessage({ id, winX: window.screenX, winY: window.screenY, orbX, orbY });
}

function closestOtherDist() {
  let min = Infinity;
  const sx = window.screenX + orbX;
  const sy = window.screenY + orbY;
  for (const key in others) {
    const o = others[key];
    const d = Math.hypot((o.winX + o.orbX) - sx, (o.winY + o.orbY) - sy);
    if (d < min) min = d;
  }
  return min;
}

function update() {
  time++;

  const dsx = window.screenX - lastScreenX;
  const dsy = window.screenY - lastScreenY;
  lastScreenX = window.screenX;
  lastScreenY = window.screenY;

  velX -= dsx * 0.5;
  velY -= dsy * 0.5;
  velX += (canvas.width / 2 - orbX) * 0.04;
  velY += (canvas.height / 2 - orbY) * 0.04;

  for (const key in others) {
    const o = others[key];
    const sdx = (o.winX + o.orbX) - (window.screenX + orbX);
    const sdy = (o.winY + o.orbY) - (window.screenY + orbY);
    const dist = Math.hypot(sdx, sdy);
    if (dist < 700 && dist > 0) {
      // Spring: attract beyond restDist, repel below it
      const restDist = 160;
      const force = ((dist - restDist) / 700) * 0.28;
      velX += (sdx / dist) * force;
      velY += (sdy / dist) * force;
    }
  }

  velX *= 0.84;
  velY *= 0.84;
  // Cap velocity so a sudden window snap can't fling the orb
  const maxV = 14;
  velX = Math.max(-maxV, Math.min(maxV, velX));
  velY = Math.max(-maxV, Math.min(maxV, velY));
  orbX += velX;
  orbY += velY;

  // Update anger based on proximity
  const closest = closestOtherDist();
  const targetAnger = closest < 450 ? Math.pow(1 - closest / 450, 1.1) : 0;
  anger += (targetAnger - anger) * 0.045;

  // Merge: kicks in at very close range — galaxy collision mode
  const targetMerge = closest < 220 ? Math.pow(1 - closest / 220, 1.4) : 0;
  merge += (targetMerge - merge) * 0.03;

  // Spin particles — layer-specific rates, disc flattening during merge
  const spinMult = 1 + anger * 3.2 + merge * 4.5;
  const discPull = merge * 0.06;
  for (const p of particles) {
    // Advance per-particle noise phase for core turbulence
    if (p.noiseOffset !== undefined) p.noiseOffset += p.noiseSpeed;
    const layerMult = p.layer === LAYER.CORE ? 2.2 : p.layer === LAYER.HALO ? 0.4 : 1.0;
    p.theta += p.speed * spinMult * layerMult;
    p.phi   += p.phiSpeed * (1 + anger * 1.5);
    if (p.layer === LAYER.RING || p.layer === LAYER.HALO) {
      p.phi += (Math.PI / 2 - p.phi) * discPull;
    }
    if (p.phi < 0.04) { p.phi = 0.04; p.phiSpeed *= -1; }
    if (p.phi > Math.PI - 0.04) { p.phi = Math.PI - 0.04; p.phiSpeed *= -1; }
  }

  broadcast();

  const now = Date.now();
  for (const key in others) {
    if (now - others[key].lastSeen > 1500) delete others[key];
  }
}

// 3D spherical → 2D canvas with a slight tilt
function project(cx, cy, p, scale) {
  const r = p.r * scale;
  const sinPhi = Math.sin(p.phi);
  const x3 = r * sinPhi * Math.cos(p.theta);
  const y3 = r * Math.cos(p.phi);
  const z3 = r * sinPhi * Math.sin(p.theta);
  // Tilt 25° toward viewer so the vortex reads as 3D
  const tilt = 0.44;
  const y2 = y3 * Math.cos(tilt) - z3 * Math.sin(tilt);
  const z2 = y3 * Math.sin(tilt) + z3 * Math.cos(tilt);
  const depth = (z2 / r + 1) / 2; // 0=back 1=front
  return { x: cx + x3, y: cy + y2, depth };
}

function lerpRGB(r1, g1, b1, r2, g2, b2, t) {
  return [
    Math.round(r1 + (r2 - r1) * t),
    Math.round(g1 + (g2 - g1) * t),
    Math.round(b1 + (b2 - b1) * t),
  ];
}

// targetX/Y: canvas position of the other orb to reach toward. tp: 0..1 proximity strength.
function drawVortexOrb(cx, cy, alphaScale, targetX, targetY, tp) {
  const pulse = Math.sin(time * 0.045) * 5;
  // Orb swells up to 1.55x during a full merge
  const mergeScale = 1 + merge * 0.55;
  const scale = ((ORB_RADIUS + pulse) / ORB_RADIUS) * mergeScale;

  ctx.save();
  ctx.globalAlpha = alphaScale;
  ctx.shadowBlur = 0;

  // Subtle glow — gradient to solid bg colour avoids premultiplied banding
  const hr = Math.round(100 + anger * 140);
  const hg = Math.round(55 * (1 - anger * 0.85));
  const hb = Math.round(240 * (1 - anger * 0.9));
  const innerG = ctx.createRadialGradient(cx, cy, ORB_RADIUS * 0.6, cx, cy, ORB_RADIUS * 1.8 * mergeScale);
  innerG.addColorStop(0,   `rgba(${hr}, ${hg}, ${hb}, ${0.12 + anger * 0.08 + merge * 0.28})`);
  innerG.addColorStop(1,   `rgba(15, 15, 15, 0)`);
  ctx.beginPath();
  ctx.arc(cx, cy, ORB_RADIUS * 1.8 * mergeScale, 0, Math.PI * 2);
  ctx.fillStyle = innerG;
  ctx.fill();

  const outerG = ctx.createRadialGradient(cx, cy, ORB_RADIUS * 1.0, cx, cy, ORB_RADIUS * 4.5 * mergeScale);
  outerG.addColorStop(0,   `rgba(${hr}, ${hg}, ${hb}, ${0.04 + anger * 0.04 + merge * 0.12})`);
  outerG.addColorStop(1,   `rgba(15, 15, 15, 0)`);
  ctx.beginPath();
  ctx.arc(cx, cy, ORB_RADIUS * 4.5 * mergeScale, 0, Math.PI * 2);
  ctx.fillStyle = outerG;
  ctx.fill();

  // Direction toward other orb for particle pull
  let tdx = 0, tdy = 0, tdist = 0;
  if (tp > 0 && targetX !== undefined) {
    tdx = targetX - cx;
    tdy = targetY - cy;
    tdist = Math.hypot(tdx, tdy);
    if (tdist > 0) { tdx /= tdist; tdy /= tdist; }
  }

  // Project all particles — layer-aware displacement
  const projected = particles
    .map(p => {
      const proj = project(cx, cy, p, scale);
      let ptx = proj.x, pty = proj.y;
      const offx = ptx - cx;
      const offy = pty - cy;
      const offLen = Math.hypot(offx, offy) || 1;

      if (tp > 0 && tdist > 0) {
        const facing = (offx * tdx + offy * tdy) / offLen;
        const canTendril = p.layer === LAYER.RING || p.layer === LAYER.HALO;
        if (canTendril && facing > 0.05) {
          const maxReach = p.layer === LAYER.HALO ? 380 : 430;
          const pull = Math.pow(facing, 1.4) * tp * Math.min(tdist * 0.70, maxReach);
          const armT = pull / Math.max(tdist * 0.70, 1);
          const waveMag = p.layer === LAYER.HALO ? 44 : 28;
          const wave = Math.sin(time * 0.08 + p.tendrilPhase + armT * Math.PI * 2.8)
                       * waveMag * tp * Math.sin(armT * Math.PI);
          const lateral = p.tendrilOffset * tp + wave;
          ptx += tdx * pull + (-tdy) * lateral;
          pty += tdy * pull +  tdx  * lateral;
        } else if (merge > 0.05 && facing < -0.2 && p.layer === LAYER.RING) {
          // Tidal streamer — back hemisphere during collision
          const tidalStr = Math.pow(-facing, 1.2) * merge * ORB_RADIUS * 2.8;
          const curl = Math.sin(time * 0.05 + p.tendrilPhase) * tidalStr * 0.45;
          ptx -= tdx * tidalStr + (-tdy) * curl;
          pty -= tdy * tidalStr +  tdx  * curl;
        }
      }
      return { x: ptx, y: pty, depth: proj.depth, size: p.size, layer: p.layer, life: p.life ?? 0, noiseOffset: p.noiseOffset ?? 0 };
    })
    .sort((a, b) => a.depth - b.depth);

  // ── Draw HALO layer first (behind everything) ────────────────────────────
  // Wispy large blobs — deep violet/nebula blue, very transparent
  for (const p of projected) {
    if (p.layer !== LAYER.HALO) continue;
    const d = p.depth;
    const [hr2, hg2, hb2] = lerpRGB(55, 20, 140, 180, 30, 60, anger);
    const a = (0.012 + d * 0.022) * (1 + merge * 0.5);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1.2 + d * 1.8), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${hr2}, ${hg2}, ${hb2}, ${a.toFixed(3)})`;
    ctx.fill();
  }

  // ── Draw RING layer ──────────────────────────────────────────────────────
  // Colour varies: inner edge cyan-white → mid purple → outer deep red when angry
  // Uses spiral arm tinting: particles in a certain theta band are slightly brighter
  const [rc, gc, bc] = lerpRGB(95, 50, 255, 255, 40, 0, anger);
  // Pass 1: soft bloom
  for (const p of projected) {
    if (p.layer !== LAYER.RING) continue;
    const d = p.depth;
    const glowS = p.size * (2.0 + d * 2.2) * (1 + anger * 0.8 + merge * 0.6);
    ctx.beginPath();
    ctx.arc(p.x, p.y, glowS, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${rc}, ${gc}, ${bc}, ${(0.012 + d * 0.022).toFixed(3)})`;
    ctx.fill();
  }
  // Pass 2: bright cores with comet tails
  for (const p of projected) {
    if (p.layer !== LAYER.RING) continue;
    const d = p.depth;
    const s = p.size * (0.22 + d * 0.88) * (1 + anger * 0.65 + merge * 0.3);
    const a = 0.18 + d * 0.68 + anger * 0.08 + merge * 0.06;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(s, 0.3), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${rc}, ${gc}, ${bc}, ${a.toFixed(3)})`;
    ctx.fill();
  }

  // ── Draw CORE layer ──────────────────────────────────────────────────────
  // Combusting nucleus: turbulent individual blinking, colour ramps from cool
  // blue-white (calm) → blinding white (angry) → plasma magenta-white (merge)
  const heat = Math.min(anger + merge * 1.4, 1);
  for (const p of projected) {
    if (p.layer !== LAYER.CORE) continue;
    const d = p.depth;
    // Per-particle flicker: independent sine oscillator
    const flicker = 0.6 + 0.4 * Math.sin(p.noiseOffset);
    // Extra radial jitter when heated — core particles bulge outward chaotically
    const distFromCentre = Math.hypot(p.x - cx, p.y - cy);
    const jitter = heat * ORB_RADIUS * 0.22 * (Math.sin(p.noiseOffset * 1.7) * 0.5 + 0.5);
    const jx = distFromCentre > 0.5 ? p.x + (p.x - cx) / distFromCentre * jitter : p.x;
    const jy = distFromCentre > 0.5 ? p.y + (p.y - cy) / distFromCentre * jitter : p.y;
    // Colour: calm=icy blue-white, angry=pure white, merge=magenta-white plasma
    const [ccr, ccg, ccb] = heat < 0.5
      ? lerpRGB(160, 190, 255, 255, 255, 255, heat * 2)
      : lerpRGB(255, 255, 255, 255, 120, 255, (heat - 0.5) * 2);
    const a = (0.55 + d * 0.40 + heat * 0.25) * flicker;
    // Outer combustion bloom
    const bloomR = p.size * (2.2 + d * 1.8 + heat * 4.0) * flicker;
    ctx.beginPath();
    ctx.arc(jx, jy, bloomR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${ccr}, ${ccg}, ${ccb}, ${(a * 0.18).toFixed(3)})`;
    ctx.fill();
    // Tight bright core dot
    ctx.beginPath();
    ctx.arc(jx, jy, Math.max(p.size * (0.5 + d * 0.6 + heat * 0.4), 0.4), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${ccr}, ${ccg}, ${ccb}, ${a.toFixed(3)})`;
    ctx.fill();
  }

  // ── Draw CORE shockwave ring during merge ─────────────────────────────────
  // A thin expanding ring radiates from the nucleus during high merge
  if (merge > 0.15) {
    const ringPhase = (time * 0.035) % 1;
    const ringR = ORB_RADIUS * mergeScale * (0.15 + ringPhase * 0.9);
    const ringA = (1 - ringPhase) * merge * 0.35;
    const [sr, sg, sb] = lerpRGB(200, 160, 255, 255, 120, 255, merge);
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${ringA.toFixed(3)})`;
    ctx.lineWidth = (1 - ringPhase) * 3.5 * merge;
    ctx.stroke();
  }

  ctx.restore();
}



const GRID_SPACING = 52;

function getOrbPositions() {
  const orbs = [{ x: orbX, y: orbY, anger }];
  for (const key in others) {
    const o = others[key];
    const lx = (o.winX + o.orbX) - window.screenX;
    const ly = (o.winY + o.orbY) - window.screenY;
    orbs.push({ x: lx, y: ly, anger });
  }
  return orbs;
}

function displacePoint(gx, gy, orbs) {
  let dx = 0, dy = 0;
  for (const o of orbs) {
    const ex = o.x - gx;
    const ey = o.y - gy;
    const dist = Math.hypot(ex, ey);
    const radius = 340;
    if (dist < radius && dist > 0) {
      const t = 1 - dist / radius;
      const strength = t * t * 95;
      dx += (ex / dist) * strength;
      dy += (ey / dist) * strength;
    }
  }
  return { x: gx + dx, y: gy + dy };
}

function drawGrid() {
  const orbs = getOrbPositions();
  const pad = GRID_SPACING * 2;
  const startX = -pad;
  const startY = -pad;
  const endX = canvas.width + pad;
  const endY = canvas.height + pad;
  const cols = Math.ceil((endX - startX) / GRID_SPACING) + 1;
  const rows = Math.ceil((endY - startY) / GRID_SPACING) + 1;

  // Build displaced vertex grid
  const verts = [];
  for (let r = 0; r < rows; r++) {
    verts[r] = [];
    for (let c = 0; c < cols; c++) {
      const gx = startX + c * GRID_SPACING;
      const gy = startY + r * GRID_SPACING;
      verts[r][c] = displacePoint(gx, gy, orbs);
    }
  }

  // All lines in one path — no per-segment colour allocation
  ctx.beginPath();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = verts[r][c];
      if (c === 0) ctx.moveTo(v.x, v.y);
      else ctx.lineTo(v.x, v.y);
    }
  }
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const v = verts[r][c];
      if (r === 0) ctx.moveTo(v.x, v.y);
      else ctx.lineTo(v.x, v.y);
    }
  }
  const gridR = Math.round(38 + anger * 40);
  const gridG = Math.round(22 + anger * 5);
  const gridB = Math.round(72 + anger * 30);
  ctx.strokeStyle = `rgba(${gridR}, ${gridG}, ${gridB}, 0.55)`;
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // Bright nodes at intersections near orbs
  const nodeR = Math.round(100 + anger * 155);
  const nodeG = Math.round(60 * (1 - anger * 0.7));
  const nodeB = Math.round(220 * (1 - anger * 0.85));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gx = startX + c * GRID_SPACING;
      const gy = startY + r * GRID_SPACING;
      let closest = Infinity;
      for (const o of orbs) {
        const d = Math.hypot(gx - o.x, gy - o.y);
        if (d < closest) closest = d;
      }
      if (closest < 300) {
        const g = Math.pow(1 - closest / 300, 2.2) * 0.85;
        const v = verts[r][c];
        ctx.beginPath();
        ctx.arc(v.x, v.y, 1.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${nodeR}, ${nodeG}, ${nodeB}, ${g.toFixed(3)})`;
        ctx.fill();
      }
    }
  }
}

function draw() {
  ctx.fillStyle = '#0f0f0f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // Collect all nearby targets, weighted by proximity
  let weightedTX = 0, weightedTY = 0, totalWeight = 0;

  for (const key in others) {
    const o = others[key];
    const localX = (o.winX + o.orbX) - window.screenX;
    const localY = (o.winY + o.orbY) - window.screenY;
    const dist = Math.hypot(localX - orbX, localY - orbY);
    const maxDist = 900;

    if (dist < maxDist) {
      const progress = 1 - dist / maxDist;
      // Their orb reaches toward mine
      drawVortexOrb(localX, localY, progress, orbX, orbY, progress);
      // Accumulate weighted centroid for my reach direction
      weightedTX += localX * progress;
      weightedTY += localY * progress;
      totalWeight += progress;
    }
  }

  // My orb reaches toward the weighted centre of all nearby orbs — no snapping
  if (totalWeight > 0) {
    drawVortexOrb(orbX, orbY, 1, weightedTX / totalWeight, weightedTY / totalWeight, Math.min(totalWeight, 1));
  } else {
    drawVortexOrb(orbX, orbY, 1, undefined, undefined, 0);
  }
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
