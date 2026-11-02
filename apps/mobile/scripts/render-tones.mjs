import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 44100;
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const toneDirs = [join(root, "apps/mobile/assets/tones"), join(root, "apps/web/public/tones")];
const soundDirs = [join(root, "apps/mobile/assets/sounds"), join(root, "apps/web/public/sounds")];

const note = (at, freq, decay, extra = {}) => ({ at, freq, decay, gain: 1, attack: 0.01, ...extra });
const bell = (at, freq, decay) => [
  note(at, freq, decay),
  note(at, freq * 2.76, decay * 0.45, { gain: 0.25 }),
  note(at, freq * 5.4, decay * 0.2, { gain: 0.1 }),
];
const mallet = (at, freq) => [note(at, freq, 0.35, { attack: 0.004 }), note(at, freq * 3.9, 0.08, { gain: 0.3, attack: 0.002 })];

const TONES = {
  chime: [note(0, 880, 0.35, { attack: 0.015 }), note(0.11, 1318.5, 0.45, { attack: 0.015 })],
  pop: [note(0, 900, 0.14, { to: 280, sweep: 0.08, attack: 0.003 })],
  ding: bell(0, 1568, 1.1),
  marimba: [...mallet(0, 659.25), ...mallet(0.1, 987.77)],
  drop: [note(0, 420, 0.18, { to: 1400, sweep: 0.06, attack: 0.004 })],
  trio: [note(0, 1046.5, 0.22), note(0.09, 1318.5, 0.22), note(0.18, 1568, 0.4)],
  blip: [note(0, 660, 0.12, { to: 990, sweep: 0.04, attack: 0.004 }), note(0.08, 990, 0.28, { to: 1320, sweep: 0.03, attack: 0.004 })],
};

const click = (at, freq) => [note(at, freq, 0.035, { attack: 0.001 }), note(at, freq * 0.23, 0.05, { gain: 0.5, attack: 0.001 })];

/** Game sound effects, with how loud each one plays. */
const SOUNDS = {
  dice: {
    level: 0.5,
    notes: [
      ...[[0, 2600], [0.05, 1900], [0.28, 2400], [0.32, 3000], [0.6, 2200], [0.7, 2800]].flatMap(([at, f]) => click(at, f)),
      note(0.28, 170, 0.09, { attack: 0.002 }),
      note(0.6, 190, 0.07, { attack: 0.002, gain: 0.6 }),
    ],
  },
  step: { level: 0.3, notes: [note(0, 1050, 0.07, { attack: 0.002 }), note(0, 3200, 0.025, { gain: 0.3, attack: 0.001 })] },
  capture: { level: 0.6, notes: [note(0, 720, 0.4, { to: 130, sweep: 0.3, attack: 0.004 }), note(0, 1440, 0.2, { to: 260, sweep: 0.3, gain: 0.3 })] },
  home: { level: 0.55, notes: [note(0, 1046.5, 0.18), note(0.07, 1318.5, 0.18), note(0.14, 1568, 0.18), note(0.21, 2093, 0.45)] },
  win: {
    level: 0.6,
    notes: [
      ...[784, 1046.5, 1318.5].map((f, i) => note(i * 0.13, f, 0.3)),
      ...[1568, 1318.5, 1046.5].map((f, i) => note(0.39, f, 1.1, { gain: i ? 0.45 : 1 })),
    ],
  },
};

/**
 * Adds up sine partials, each with a short linear attack, an exponential decay reaching -60 dB after `decay`
 * seconds, and optionally an exponential pitch sweep to `to` over `sweep` seconds.
 */
function render(notes, level = 0.6) {
  const length = Math.ceil((Math.max(...notes.map((n) => n.at + n.attack + n.decay)) + 0.05) * RATE);
  const samples = new Float64Array(length);
  for (const n of notes) {
    let phase = 0;
    const start = Math.round(n.at * RATE);
    for (let i = start; i < length; i++) {
      const t = (i - start) / RATE;
      const freq = n.to ? n.freq * (n.to / n.freq) ** Math.min(t / n.sweep, 1) : n.freq;
      phase += (2 * Math.PI * freq) / RATE;
      const env = t < n.attack ? t / n.attack : Math.exp((-6.9 * (t - n.attack)) / n.decay);
      samples[i] += n.gain * env * Math.sin(phase);
    }
  }
  const peak = Math.max(...samples.map(Math.abs));
  const pcm = Buffer.alloc(44 + length * 2);
  pcm.write("RIFF", 0);
  pcm.writeUInt32LE(36 + length * 2, 4);
  pcm.write("WAVEfmt ", 8);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(RATE, 24);
  pcm.writeUInt32LE(RATE * 2, 28);
  pcm.writeUInt16LE(2, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write("data", 36);
  pcm.writeUInt32LE(length * 2, 40);
  samples.forEach((s, i) => pcm.writeInt16LE(Math.round((s / peak) * level * 32767), 44 + i * 2));
  return pcm;
}

const write = (dirs, name, wav) => {
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.wav`), wav);
  }
  console.log(name, `${(wav.length / 1024).toFixed(0)} KB`);
};
for (const [name, notes] of Object.entries(TONES)) write(toneDirs, name, render(notes));
for (const [name, { level, notes }] of Object.entries(SOUNDS)) write(soundDirs, name, render(notes, level));
