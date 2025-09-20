const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d', { alpha: false });
window.__RUN_PROCEDURAL__ = true;

// DPR-aware resize
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  W = Math.floor(window.innerWidth);
  H = Math.floor(window.innerHeight);
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = true;
}
window.addEventListener('resize', resize, { passive: true });
resize();

// Simple Perlin noise (2D)
class Perlin {
  constructor(seed = 1) {
    this.p = new Uint8Array(512);
    let perm = new Uint8Array(256);
    let x = seed >>> 0;
    for (let i = 0; i < 256; i++) {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      perm[i] = x & 255;
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }
  fade(t){return t*t*t*(t*(t*6-15)+10)}
  lerp(a,b,t){return a+(b-a)*t}
  grad(h, x, y){ const u = (h&1)?-x:x; const v = (h&2)?-y:y; return u+v; }
  noise(x,y){
    const X = Math.floor(x)&255, Y = Math.floor(y)&255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u=this.fade(x), v=this.fade(y);
    const A=this.p[X]+Y, B=this.p[X+1]+Y;
    const n00=this.grad(this.p[A],x,y);
    const n01=this.grad(this.p[A+1],x,y-1);
    const n10=this.grad(this.p[B],x-1,y);
    const n11=this.grad(this.p[B+1],x-1,y-1);
    const nx0=this.lerp(n00,n10,u);
    const nx1=this.lerp(n01,n11,u);
    return this.lerp(nx0,nx1,v); // ~[-1,1]
  }
}
const perlin = new Perlin(1337);

// Config (tweak freely)
const config = {
  background: '#272D35',
  lineColor: '#FFFFFF',
  nodeColor: '#FFFFFF',
  outline: false,
  spine: { joints: 10, length: 26 },
  limbs: [
    { attachIndex: 2, count: 2, joints: 5, length: 24 },
    { attachIndex: 5, count: 2, joints: 5, length: 28 },
  ],
  osc: { freq: 0.6, amp: 0.7 }, // radians
  noise: { intensity: 0.5, scale: 0.8 },
  clamp: { min: -1.2, max: 1.2 },
  strokeWidth: 2,
  nodeRadius: 3,
  attract: { enabled: true, strength: 0.12, repelMultiplier: 2.0, radius: 140 },
};

// Modular creature
class Joint {
  constructor(x, y){ this.x=x; this.y=y; this.tx=x; this.ty=y; }
}
class Chain {
  constructor(origin, joints, segLen){
    this.origin = origin;
    this.segLen = segLen;
    this.joints = Array.from({length: joints}, (_, i)=>new Joint(origin.x, origin.y + i*segLen));
    this.angles = new Array(joints-1).fill(0);
  }
  // FABRIK-like simple forward pass from origin following angles
  forward(angles){
    this.joints[0].x = this.origin.x; this.joints[0].y = this.origin.y;
    for(let i=1;i<this.joints.length;i++){
      const a = angles[i-1];
      this.joints[i].x = this.joints[i-1].x + Math.cos(a)*this.segLen;
      this.joints[i].y = this.joints[i-1].y + Math.sin(a)*this.segLen;
    }
  }
}

class Creature {
  constructor(cfg){
    this.cfg = cfg;
    this.time = 0;
    this.center = { x: W*0.5, y: H*0.6 };
    this.spine = new Chain({x:this.center.x,y:this.center.y}, cfg.spine.joints, cfg.spine.length);
    this.limbs = [];
    cfg.limbs.forEach(group=>{
      for(let i=0;i<group.count;i++){
        this.limbs.push({
          attachIndex: group.attachIndex,
          chain: new Chain(this.spine.joints[group.attachIndex], group.joints, group.length),
          side: i%2===0 ? -1 : 1,
        });
      }
    });
  }
  update(dt, input){
    const { osc, noise, clamp } = this.cfg;
    this.time += dt;
    // Spine angles
    for(let i=0;i<this.spine.angles.length;i++){
      const base = Math.sin(this.time*osc.freq + i*0.35) * osc.amp;
      const n = perlin.noise(i*noise.scale, this.time*noise.scale) * noise.intensity;
      let a = base + n;
      a = Math.max(clamp.min, Math.min(clamp.max, a));
      this.spine.angles[i] = a;
    }
    this.spine.forward(this.spine.angles);

    // Update limb origins from spine attachments
    for(const limb of this.limbs){
      limb.chain.origin = this.spine.joints[limb.attachIndex];
      // Limb angles swing sideways relative to spine segment
      const segAngle = this.spine.angles[Math.max(0, limb.attachIndex-1)] || -Math.PI/2;
      for(let j=0;j<limb.chain.angles?.length || 0;j++){
        const base = Math.cos(this.time*osc.freq*1.2 + j*0.6 + limb.side*1.2) * (osc.amp*0.8);
        const n = perlin.noise(100 + j*noise.scale + limb.attachIndex, this.time*noise.scale*1.2) * (noise.intensity*0.9);
        let a = segAngle + limb.side*(Math.PI/2 + base + n);
        a = Math.max(clamp.min+segAngle, Math.min(clamp.max+segAngle, a));
        limb.chain.angles[j] = a;
      }
      limb.chain.forward(limb.chain.angles);
    }

    // Cursor attract/repel
    if (input.active && this.cfg.attract.enabled) {
      const repel = input.repel;
      const s = this.cfg.attract.strength * (repel ? this.cfg.attract.repelMultiplier : 1);
      const r2 = this.cfg.attract.radius * this.cfg.attract.radius;
      const all = [this.spine, ...this.limbs.map(l=>l.chain)];
      for(const chain of all){
        for(const j of chain.joints){
          const dx = input.x - j.x, dy = input.y - j.y;
          const d2 = dx*dx + dy*dy;
          if (d2 < r2){
            const d = Math.sqrt(d2) || 1;
            const ux = dx/d, uy = dy/d;
            const k = s * (1 - d/this.cfg.attract.radius);
            j.x += (repel?-ux:ux) * k * 30 * dt;
            j.y += (repel?-uy:uy) * k * 30 * dt;
          }
        }
      }
    }
  }
  draw(){
    const { lineColor, nodeColor, strokeWidth, nodeRadius, outline } = this.cfg;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Background
    ctx.fillStyle = this.cfg.background;
    ctx.fillRect(0,0,W,H);

    // Helper to draw chain
    const drawChain = (chain) => {
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      for(let i=0;i<chain.joints.length-1;i++){
        const a = chain.joints[i], b = chain.joints[i+1];
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      // nodes
      ctx.fillStyle = nodeColor;
      for(const j of chain.joints){
        ctx.beginPath();
        ctx.arc(j.x, j.y, nodeRadius, 0, Math.PI*2);
        ctx.fill();
        if (outline){
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.stroke();
        }
      }
    };

    drawChain(this.spine);
    for(const limb of this.limbs) drawChain(limb.chain);
  }
}

const creature = new Creature(config);

// Input (mouse + touch)
const input = { x: W/2, y: H/2, active: false, repel: false }
function setFromEvent(e){
  const rect = canvas.getBoundingClientRect();
  input.x = (('clientX' in e)? e.clientX : e.touches[0].clientX) - rect.left;
  input.y = (('clientY' in e)? e.clientY : e.touches[0].clientY) - rect.top;
}
canvas.addEventListener('mousemove', (e)=>{ setFromEvent(e); input.active = true; input.repel = e.shiftKey; }, { passive: true });
canvas.addEventListener('mouseleave', ()=>{ input.active = false; }, { passive: true });
canvas.addEventListener('mousedown', (e)=>{ setFromEvent(e); input.active = true; input.repel = e.shiftKey || (e.button===2); });
canvas.addEventListener('mouseup', ()=>{ input.active = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('touchstart', (e)=>{
  if (e.touches.length>0){ setFromEvent(e); input.active = true; input.repel = e.touches.length>=2; }
},{ passive: true });
canvas.addEventListener('touchmove', (e)=>{
  if (e.touches.length>0){ setFromEvent(e); input.active = true; input.repel = e.touches.length>=2; }
},{ passive: true });
canvas.addEventListener('touchend', ()=>{
  input.active = false;
},{ passive: true });

// RAF loop targeting smooth 60fps
let last = performance.now();
function loop(now){
  const dt = Math.min(0.05, (now - last) / 1000); // clamp dt
  last = now;
  creature.center.x = W*0.5; // keep centered on resize
  creature.update(dt, input);
  creature.draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);