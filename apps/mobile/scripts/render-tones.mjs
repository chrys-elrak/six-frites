import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 44100;
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = [join(root, "apps/mobile/assets/tones"), join(root, "apps/web/public/tones")];

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

/**
 * Adds up sine partials, each with a short linear attack, an exponential decay reaching -60 dB after `decay`
 * seconds, and optionally an exponential pitch sweep to `to` over `sweep` seconds.
 */
function render(notes) {
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
  samples.forEach((s, i) => pcm.writeInt16LE(Math.round((s / peak) * 0.6 * 32767), 44 + i * 2));
  return pcm;
}

for (const dir of out) mkdirSync(dir, { recursive: true });
for (const [name, notes] of Object.entries(TONES)) {
  const wav = render(notes);
  for (const dir of out) writeFileSync(join(dir, `${name}.wav`), wav);
  console.log(name, `${(wav.length / 1024).toFixed(0)} KB`);
}
