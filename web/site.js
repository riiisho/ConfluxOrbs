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
let anger = 0; // 0..1 proximity anger level

const ORB_RADIUS = 68;
const PARTICLE_COUNT = 220;

const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
  phi: Math.acos(1 - 2 * Math.random()),         // uniform over sphere
  theta: Math.random() * Math.PI * 2,
  r: ORB_RADIUS * (0.65 + Math.random() * 0.4),
  speed: (0.009 + Math.random() * 0.022) * (Math.random() < 0.5 ? 1 : -1),
  phiSpeed: (Math.random() - 0.5) * 0.003,
  size: 1.2 + Math.random() * 2.2,
}));

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
    if (dist < 600 && dist > 0) {
      const pull = ((600 - dist) / 600) * 0.015;
      velX += (sdx / dist) * pull * canvas.width;
      velY += (sdy / dist) * pull * canvas.height;
    }
  }

  velX *= 0.86;
  velY *= 0.86;
  orbX += velX;
  orbY += velY;

  // Update anger based on proximity
  const closest = closestOtherDist();
  const targetAnger = closest < 450 ? Math.pow(1 - closest / 450, 1.1) : 0;
  anger += (targetAnger - anger) * 0.045;

  // Spin particles — faster and more chaotic when angry
  const spinMult = 1 + anger * 3.2;
  for (const p of particles) {
    p.theta += p.speed * spinMult;
    p.phi += p.phiSpeed * (1 + anger * 1.5);
    if (p.phi < 0.05) { p.phi = 0.05; p.phiSpeed *= -1; }
    if (p.phi > Math.PI - 0.05) { p.phi = Math.PI - 0.05; p.phiSpeed *= -1; }
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

function drawVortexOrb(cx, cy, alphaScale) {
  const pulse = Math.sin(time * 0.045) * 5;
  const scale = (ORB_RADIUS + pulse) / ORB_RADIUS;

  ctx.save();
  ctx.globalAlpha = alphaScale;

  // Ambient halo — shifts from purple to red/orange with anger
  const hr = Math.round(120 + anger * 135);
  const hg = Math.round(65 * (1 - anger * 0.85));
  const hb = Math.round(255 * (1 - anger * 0.92));
  const halo = ctx.createRadialGradient(cx, cy, ORB_RADIUS * 0.1, cx, cy, ORB_RADIUS * 3.8);
  halo.addColorStop(0,    `rgba(${hr}, ${hg}, ${hb}, ${0.45 + anger * 0.35})`);
  halo.addColorStop(0.45, `rgba(${hr}, ${hg}, ${hb}, ${0.1 + anger * 0.12})`);
  halo.addColorStop(1,    "rgba(0,0,0,0)");
  ctx.beginPath();
  ctx.arc(cx, cy, ORB_RADIUS * 3.8, 0, Math.PI * 2);
  ctx.fillStyle = halo;
  ctx.fill();

  // Project all particles and sort back→front
  const projected = particles
    .map(p => ({ ...project(cx, cy, p, scale), size: p.size }))
    .sort((a, b) => a.depth - b.depth);

  for (const p of projected) {
    const d = p.depth;
    const size = p.size * (0.25 + d * 0.95) * (1 + anger * 0.75);
    const [r, g, b] = lerpRGB(95, 50, 255, 255, 40, 0, anger);
    const alpha = 0.22 + d * 0.68 + anger * 0.12;

    ctx.save();
    // Back particles are dimmer; front particles get strong glow when angry
    const glowAmt = (7 + anger * 26) * (0.2 + d * 0.8);
    const sr = Math.round(120 + anger * 135);
    const sg = Math.round(70 * (1 - anger));
    const sb = Math.round(255 * (1 - anger));
    ctx.shadowColor = `rgba(${sr}, ${sg}, ${sb}, ${0.4 + anger * 0.55})`;
    ctx.shadowBlur = glowAmt;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function drawBeam(x1, y1, x2, y2, progress) {
  ctx.save();
  const mx = (x1 + x2) / 2 + Math.sin(time * 0.06) * 25 * progress;
  const my = (y1 + y2) / 2 + Math.cos(time * 0.06) * 25 * progress;

  const r = Math.round(155 + anger * 100);
  const g = Math.round(95 * (1 - anger * 0.85));
  const b = Math.round(255 * (1 - anger));

  ctx.lineWidth = 2 + progress * 10;
  ctx.lineCap = "round";
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${progress * 0.3})`;
  ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.9)`;
  ctx.shadowBlur = (30 + anger * 20) * progress;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(mx, my, x2, y2);
  ctx.stroke();

  ctx.lineWidth = 1.5 * progress;
  ctx.strokeStyle = `rgba(${Math.min(r + 65, 255)}, ${Math.min(g + 65, 255)}, ${Math.min(b + 65, 255)}, ${progress * 0.85})`;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(mx, my, x2, y2);
  ctx.stroke();

  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const key in others) {
    const o = others[key];
    const localX = (o.winX + o.orbX) - window.screenX;
    const localY = (o.winY + o.orbY) - window.screenY;
    const dist = Math.hypot(localX - orbX, localY - orbY);
    const maxDist = 900;

    if (dist < maxDist) {
      const progress = 1 - dist / maxDist;
      drawBeam(orbX, orbY, localX, localY, progress);
      drawVortexOrb(localX, localY, progress);
    }
  }

  drawVortexOrb(orbX, orbY, 1);
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
