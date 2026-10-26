// The soundtrack, synthesised: 120 BPM in C (Am–F–C–G), every part on one beat grid from t = 0.
// Run: node synth.cjs out.wav
const fs = require('fs');

const SR = 48000;
const DUR = 22;
const N = SR * DUR;
const BEAT = 0.5;
const L = new Float32Array(N);
const R = new Float32Array(N);
const sendL = new Float32Array(N); // the reverb bus
const sendR = new Float32Array(N);

let seed = 7;
const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const TAU = Math.PI * 2;

/** Adds a mono sound into the mix: pan -1..1, plus a share of it to the reverb. */
function add(start, length, fn, { gain = 1, pan = 0, send = 0 } = {}) {
  const i0 = Math.max(0, Math.round(start * SR));
  const i1 = Math.min(N, i0 + Math.round(length * SR));
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = i0; i < i1; i++) {
    const v = fn((i - i0) / SR, i / SR);
    L[i] += v * gl;
    R[i] += v * gr;
    sendL[i] += v * gl * send;
    sendR[i] += v * gr * send;
  }
}

// --- Harmony: one chord per bar (2s); F at 16, then C rings from 18 under the logo ---
const CHORDS = {
  Am: { root: 45, tones: [57, 60, 64] },
  F: { root: 41, tones: [53, 57, 60] },
  C: { root: 48, tones: [55, 60, 64] },
  G: { root: 43, tones: [55, 59, 62] },
};
const BARS = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G', 'F'];
const chordAt = (t) => CHORDS[t >= 18 ? 'C' : BARS[Math.floor(t / 2)]];
const DROP = 4.0;
const END = 18.0;

/** The kick's duck, for the bass and pad once the drums are in. */
function duck(t) {
  if (t < DROP || t >= END) return 1;
  const since = (t - DROP) % BEAT;
  return 1 - 0.55 * Math.exp(-since / 0.09);
}

// --- Pad: detuned saws through a soft low-pass, one chord per bar ---
function pad(start, length, notes, cutoff, gain) {
  for (const note of notes) {
    for (const detune of [-0.07, 0, 0.07]) {
      const f = hz(note + detune);
      let lp = 0;
      const a = 1 - Math.exp((-TAU * cutoff) / SR);
      add(
        start,
        length + 0.6,
        (x, t) => {
          const saw = 2 * ((x * f) % 1) - 1;
          lp += a * (saw - lp);
          const env = Math.min(1, x / 0.35) * (x > length ? Math.exp(-(x - length) / 0.18) : 1);
          return lp * env * duck(t);
        },
        { gain, pan: detune * 6, send: 0.35 },
      );
    }
  }
}
for (let bar = 0; bar < BARS.length; bar++) {
  const t = bar * 2;
  pad(t, 2, CHORDS[BARS[bar]].tones, t < DROP ? 900 : 1500, 0.022);
}
pad(18, 3.4, [55, 60, 64, 72], 1400, 0.024); // the last chord, under the logo

// --- Arpeggio: 8ths over the chord, the hook's main voice ---
function pluck(start, note, gain, pan, decay = 0.2) {
  const f = hz(note);
  add(
    start,
    decay * 6,
    (x) => {
      const env = Math.min(1, x / 0.003) * Math.exp(-x / decay);
      return (Math.sin(TAU * f * x) + 0.25 * Math.sin(TAU * 2 * f * x)) * env;
    },
    { gain, pan, send: 0.45 },
  );
}
const ARP = [0, 1, 2, 3, 2, 1, 2, 3]; // up the chord tones, plus the octave
for (let step = 0; step < END / 0.25; step++) {
  const t = step * 0.25;
  const { tones } = chordAt(t);
  const i = ARP[step % 8];
  const note = i === 3 ? tones[0] + 12 : tones[i];
  pluck(t, note + 12, t < DROP ? 0.1 : 0.075, step % 2 ? 0.25 : -0.25);
}

// --- Drums: in at the drop (4.0), out at 18.0 ---
const kick = (x) =>
  Math.sin(TAU * (45 * x + (65 / 30) * (1 - Math.exp(-30 * x)))) * Math.exp(-x / 0.16);
for (let t = DROP; t < END - 0.01; t += BEAT) {
  add(t, 0.4, kick, { gain: 0.42 });
  const beatInBar = Math.round((t % 2) / BEAT);
  if (beatInBar === 1 || beatInBar === 3) {
    let lp = 0;
    let hp = 0;
    add(
      t,
      0.25,
      (x) => {
        lp += 0.35 * (noise() - lp);
        hp = lp - hp * 0.6;
        return hp * Math.exp(-x / 0.07);
      },
      { gain: 0.1, send: 0.3 },
    );
  }
  // a hat on each offbeat 8th
  let prev = 0;
  add(
    t + 0.25,
    0.05,
    (x) => {
      const n = noise();
      const v = n - prev;
      prev = n;
      return v * Math.exp(-x / 0.015);
    },
    { gain: 0.03, pan: 0.3 },
  );
}

// --- Bass: root 8ths, ducked by the kick ---
for (let t = DROP; t < END - 0.01; t += 0.25) {
  const f = hz(chordAt(t).root);
  let lp = 0;
  add(
    t,
    0.24,
    (x, abs) => {
      const raw = Math.sin(TAU * f * x) + 0.3 * (2 * ((x * f) % 1) - 1);
      lp += 0.08 * (raw - lp);
      return Math.tanh(1.5 * lp) * Math.min(1, x / 0.004) * Math.exp(-x / 0.2) * duck(abs);
    },
    { gain: 0.24 },
  );
}

// --- The landing at 18.0: a last kick, a low C, and a rising C major arpeggio ---
add(END, 0.5, kick, { gain: 0.42 });
add(END, 3.8, (x) => Math.sin(TAU * hz(36) * x) * Math.min(1, x / 0.01) * Math.exp(-x / 1.4), {
  gain: 0.22,
});
[72, 76, 79].forEach((note, i) => pluck(END + i * 0.125, note, 0.07, (i - 1) * 0.3, 0.9));

// --- Swells into each cut: noise opening up, then out on the beat ---
for (const [cut, gain] of [
  [4.0, 0.06],
  [7.0, 0.035],
  [11.0, 0.035],
  [14.0, 0.035],
  [16.0, 0.04],
  [18.0, 0.06],
]) {
  const length = 1.0;
  let lp = 0;
  add(
    cut - length,
    length + 0.08,
    (x) => {
      const rise = Math.min(1, x / length);
      lp += (0.02 + 0.25 * rise * rise) * (noise() - lp);
      return lp * rise * rise * (x > length ? Math.exp(-(x - length) / 0.02) : 1);
    },
    { gain, send: 0.5 },
  );
}

// --- Typing ticks on 16ths, kept in the background ---
const ticks = [
  ...Array.from({ length: 15 }, (_, i) => 0.25 + i * 0.125),
  ...Array.from({ length: 15 }, (_, i) => 7.5 + i * 0.125),
];
for (const t of ticks) {
  let prev = 0;
  add(
    t,
    0.03,
    (x) => {
      const n = noise();
      const click = (n - prev) * Math.exp(-x / 0.004);
      prev = n;
      return click * 0.5 + Math.sin(TAU * hz(96) * x) * Math.exp(-x / 0.01) * 0.4;
    },
    { gain: 0.035, send: 0.2 },
  );
}

// --- The ✓s and key presses: soft bells in the chord of the moment ---
const bell = (t, notes, gain) => notes.forEach((n, i) => pluck(t, n, gain, i ? 0.2 : -0.2, 0.5));
bell(2.25, [81, 84], 0.06); // F: A5 C6
bell(9.5, [81, 88], 0.06); // Am: A5 E6
bell(12.5, [79], 0.045); // C: G5
bell(14.0, [74], 0.045); // G: D5
bell(15.0, [83], 0.045); // G: B5

// --- Reverb: a small Schroeder room on the send bus ---
function reverb(input, combs, allpasses) {
  const out = new Float32Array(N);
  for (const [delay, fb] of combs) {
    const buf = new Float32Array(delay);
    let idx = 0;
    let damp = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[idx];
      damp = y * 0.6 + damp * 0.4;
      buf[idx] = input[i] + damp * fb;
      out[i] += y / combs.length;
      idx = (idx + 1) % delay;
    }
  }
  for (const delay of allpasses) {
    const buf = new Float32Array(delay);
    let idx = 0;
    for (let i = 0; i < N; i++) {
      const b = buf[idx];
      const y = -out[i] + b;
      buf[idx] = out[i] + b * 0.5;
      out[i] = y;
      idx = (idx + 1) % delay;
    }
  }
  return out;
}
const s = SR / 44100;
const room = (combs, allpasses) => [
  combs.map((d) => [Math.round(d * s), 0.8]),
  allpasses.map((d) => Math.round(d * s)),
];
const wetL = reverb(sendL, ...room([1557, 1617, 1491, 1422], [225, 556]));
const wetR = reverb(sendR, ...room([1580, 1640, 1514, 1445], [248, 579]));

// --- Master: reverb in, a gentle soft clip, a fade at the very end, then a -1 dB peak ---
let peak = 0;
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, (DUR - i / SR) / 0.6);
  L[i] = Math.tanh(1.1 * (L[i] + wetL[i] * 0.9)) * fade;
  R[i] = Math.tanh(1.1 * (R[i] + wetR[i] * 0.9)) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const scale = 0.89 / peak;

const data = Buffer.alloc(44 + N * 4);
data.write('RIFF', 0);
data.writeUInt32LE(36 + N * 4, 4);
data.write('WAVEfmt ', 8);
data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20);
data.writeUInt16LE(2, 22);
data.writeUInt32LE(SR, 24);
data.writeUInt32LE(SR * 4, 28);
data.writeUInt16LE(4, 32);
data.writeUInt16LE(16, 34);
data.write('data', 36);
data.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * scale)) * 32767), 44 + i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * scale)) * 32767), 46 + i * 4);
}
fs.writeFileSync(process.argv[2], data);
console.log('wrote', process.argv[2], 'peak before normalising', peak.toFixed(3));
