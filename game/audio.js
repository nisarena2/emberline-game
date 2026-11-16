// audio.js — procedural WebAudio sounds, no audio files. The context is
// created lazily on the first user gesture so headless runs stay silent.
let ctx = null;
let master = null;

export function ensureAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  } catch {
    return false;
  }
}

function noiseBuffer(seconds = 0.3) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function burst({ freq = 800, dur = 0.12, type = 'square', gain = 0.5, slideTo = 0, noise = false }) {
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    g.connect(master);
    if (noise) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(dur);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(freq, t);
      if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
      src.connect(f);
      f.connect(g);
      src.start(t);
      src.stop(t + dur);
    } else {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      o.connect(g);
      o.start(t);
      o.stop(t + dur);
    }
  } catch { /* audio is decoration, never fatal */ }
}

export function shot(weaponId) {
  if (!ctx) return;
  const table = {
    sidearm: { freq: 900, dur: 0.09, gain: 0.5 },
    smg: { freq: 1200, dur: 0.07, gain: 0.4 },
    rifle: { freq: 700, dur: 0.14, gain: 0.6 },
    heavy: { freq: 500, dur: 0.22, gain: 0.7 },
  };
  const s = table[weaponId] || table.rifle;
  burst({ freq: s.freq, dur: s.dur, gain: s.gain, slideTo: 120, noise: true });
}

export function click() {
  burst({ freq: 1800, dur: 0.04, type: 'square', gain: 0.25 });
}

export function reload() {
  burst({ freq: 500, dur: 0.06, type: 'square', gain: 0.3 });
  setTimeout(() => burst({ freq: 700, dur: 0.06, type: 'square', gain: 0.3 }), 180);
}

export function hit() {
  burst({ freq: 2400, dur: 0.05, type: 'sine', gain: 0.35 });
}

export function explosion() {
  burst({ freq: 900, dur: 0.9, gain: 0.9, slideTo: 60, noise: true });
  burst({ freq: 90, dur: 0.7, type: 'sine', gain: 0.8, slideTo: 30 });
}

export function beep(progress) {
  burst({ freq: 1100 + progress * 600, dur: 0.05, type: 'sine', gain: 0.25 });
}

export function planted() {
  burst({ freq: 660, dur: 0.15, type: 'square', gain: 0.4 });
  setTimeout(() => burst({ freq: 880, dur: 0.25, type: 'square', gain: 0.4 }), 160);
}

export function win() {
  [523, 659, 784].forEach((f, i) => setTimeout(() => burst({ freq: f, dur: 0.22, type: 'triangle', gain: 0.4 }), i * 140));
}

export function buy() {
  burst({ freq: 1200, dur: 0.08, type: 'sine', gain: 0.35 });
  setTimeout(() => burst({ freq: 1600, dur: 0.12, type: 'sine', gain: 0.35 }), 90);
}

export const audio = { ensureAudio, shot, click, reload, hit, explosion, beep, planted, win, buy };
