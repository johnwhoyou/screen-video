// Mouse clicks and keystrokes laid into one mono WAV track at the times record-lib logged in
// <video>.sfx.json. Uses recorded samples from $SFX_DIR (or ../sounds) when present, with the
// file names in pack() below; otherwise synthesizes short clicks so it works out of the box.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 48_000;
const SOUNDS = process.env.SFX_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'sounds');

/** 16-bit PCM WAV → Float32 at RATE (linear resampling; the samples are a few ms long). */
function load(file) {
  const buf = readFileSync(join(SOUNDS, file));
  let at = 12;
  let rate = 44_100;
  let channels = 1;
  while (at < buf.length) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(at + 10);
      rate = buf.readUInt32LE(at + 12);
    }
    if (id === 'data') {
      const frames = size / 2 / channels;
      const source = new Float32Array(frames);
      for (let i = 0; i < frames; i += 1)
        source[i] = buf.readInt16LE(at + 8 + i * 2 * channels) / 32768;
      const out = new Float32Array(Math.floor((frames * RATE) / rate));
      for (let i = 0; i < out.length; i += 1) {
        const x = (i * rate) / RATE;
        const j = Math.floor(x);
        out[i] = source[j] + ((source[j + 1] ?? source[j]) - source[j]) * (x - j);
      }
      return out;
    }
    at += 8 + size + (size % 2);
  }
  throw new Error(`No PCM data in ${file}`);
}

/** A decaying, band-limited noise burst: a stand-in click when no samples are installed. */
function synth(seed, { ms, tone, decay }) {
  const rnd = random(seed);
  const out = new Float32Array(Math.round((ms / 1000) * RATE));
  let low = 0;
  for (let i = 0; i < out.length; i += 1) {
    const noise = rnd() * 2 - 1;
    low += (noise - low) * tone;
    out[i] = (noise - low) * Math.exp(-i / (RATE * decay)) * 0.9;
  }
  return out;
}
const synthPack = () => {
  const keyTone = { ms: 35, tone: 0.25, decay: 0.004 };
  const key = (n, opts = keyTone) => [1, 2].map((s) => synth(n * 10 + s, opts));
  const pair = (down, up, gain) => ({ down, up, gain });
  return {
    click: pair(key(1, { ms: 25, tone: 0.5, decay: 0.002 }), key(2, { ms: 20, tone: 0.6, decay: 0.0015 }), [0.5, 0.3]),
    key: pair(key(3), key(4, { ms: 25, tone: 0.35, decay: 0.003 }), [0.45, 0.25]),
    space: pair(key(5, { ms: 50, tone: 0.15, decay: 0.006 }), key(6), [0.5, 0.3]),
    enter: pair(key(7, { ms: 45, tone: 0.18, decay: 0.005 }), key(8), [0.5, 0.3]),
    backspace: pair(key(9, { ms: 40, tone: 0.2, decay: 0.005 }), key(10), [0.45, 0.25]),
  };
};

const pair = (down, up, gain) => ({ down: down.map(load), up: up.map(load), gain });
const samplePack = () => ({
  click: pair(['click-down.wav'], ['click-up.wav'], [0.35, 0.22]),
  key: pair(
    [1, 2].map((n) => `keys/alpha_down_0${n}.wav`),
    [1, 2].map((n) => `keys/alpha_up_0${n}.wav`),
    [0.55, 0.35],
  ),
  space: pair(['keys/space_down_01.wav'], ['keys/space_up_01.wav'], [0.55, 0.35]),
  enter: pair(['keys/enter_down_01.wav'], ['keys/enter_up_01.wav'], [0.55, 0.35]),
  backspace: pair(
    ['keys/backspace_down_01.wav'],
    ['keys/backspace_up_01.wav'],
    [0.55, 0.35],
  ),
});

/** Deterministic per-event variation, so a re-render of the same take sounds the same. */
function random(seed) {
  let x = seed * 2654435761 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10_000) / 10_000;
  };
}

function lay(out, sample, at, gain) {
  const start = Math.round(at * RATE);
  for (let i = 0; i < sample.length && start + i < out.length; i += 1)
    out[start + i] += sample[i] * gain;
}

/** `events`: [{ t: seconds, kind: 'click' | 'key' | 'space' | 'enter' | 'backspace' }]. */
export function renderSfx(events, path, { volume = 1 } = {}) {
  const sounds = existsSync(join(SOUNDS, 'click-down.wav')) ? samplePack() : synthPack();
  const seconds = Math.max(1, ...events.map((event) => event.t + 1));
  const out = new Float32Array(Math.ceil(seconds * RATE));
  events.forEach((event, index) => {
    const rnd = random(index + 1);
    const sound = sounds[event.kind] ?? sounds.key;
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const jitter = 0.9 + rnd() * 0.2;
    lay(out, pick(sound.down), event.t, sound.gain[0] * jitter);
    // Release: a click lets go faster than a finger lifting off a key.
    const hold = event.kind === 'click' ? 0.08 + rnd() * 0.03 : 0.07 + rnd() * 0.05;
    lay(out, pick(sound.up), event.t + hold, sound.gain[1] * jitter);
  });
  const data = Buffer.alloc(out.length * 2);
  out.forEach((sample, i) => {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample * volume)) * 32767), i * 2);
  });
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
  return path;
}
