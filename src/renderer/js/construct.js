// Her voice as a construct's: a voice from the speech engine (main/tts.js), pitched up a little,
// with glitches (a syllable caught in a loop, a slice gone to 8-bit) and a short digital echo, as
// if it came out of a biochip. Plain math on the samples: speak.js plays the result, and
// tools/voice-preview.mjs writes it to .wav files to hear the voices before picking one.
//
//   construct(samples, sampleRate, { pitch, glitch, echo, seed }) -> Float32Array
//   pitch: 1 = as the voice is, 1.08 = a bit higher (and quicker: the speech engine is asked to
//          slow down by as much, see speedFor); glitch and echo: 0..1

// a small seeded random, so a line glitches the same way each time she says it
function random(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const hash = (text) => [...String(text)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

// Higher by `pitch`, by reading the samples faster (linear interpolation).
function repitch(input, pitch) {
  if (Math.abs(pitch - 1) < 0.001) return input;
  const out = new Float32Array(Math.floor(input.length / pitch));
  for (let i = 0; i < out.length; i++) {
    const at = i * pitch;
    const j = Math.floor(at);
    const k = at - j;
    out[i] = input[j] * (1 - k) + (input[j + 1] ?? input[j]) * k;
  }
  return out;
}

// How loud it is around there: glitches go where she's saying something, not in the gaps.
function loudness(samples, at, span) {
  let sum = 0;
  const end = Math.min(samples.length, at + span);
  for (let i = at; i < end; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, end - at));
}

// A few places where a slice of her voice catches: repeated (a stutter) or crushed to 8-bit.
function glitch(input, rate, amount, rand) {
  if (amount <= 0) return input;
  const seconds = input.length / rate;
  const count = Math.round(seconds * amount * 0.9 + rand() * amount);
  const marks = [];
  for (let tries = 0; marks.length < count && tries < count * 20; tries++) {
    const at = Math.floor(rand() * (input.length - rate * 0.3));
    if (at < rate * 0.15 || loudness(input, at, rate * 0.05) < 0.04) continue;
    if (marks.some((m) => Math.abs(m.at - at) < rate * 0.4)) continue;
    marks.push({ at, kind: rand() < 0.65 ? 'stutter' : 'crush' });
  }
  marks.sort((a, b) => a.at - b.at);
  const parts = [];
  let from = 0;
  for (const { at, kind } of marks) {
    if (kind === 'stutter') {
      const len = Math.floor(rate * (0.045 + rand() * 0.05));
      const times = 1 + Math.floor(rand() * (1 + amount * 2.5));
      parts.push(input.subarray(from, at + len));
      for (let t = 0; t < times; t++) parts.push(input.subarray(at, at + len));
      from = at + len;
    } else {
      const len = Math.floor(rate * (0.08 + rand() * 0.08));
      const crushed = new Float32Array(len);
      const hold = 3 + Math.floor(rand() * 4);
      const steps = 10 + Math.floor(rand() * 10);
      for (let i = 0; i < len; i++) {
        const src = input[at + i - (i % hold)] ?? 0;
        crushed[i] = Math.round(src * steps) / steps;
      }
      parts.push(input.subarray(from, at), crushed);
      from = at + len;
    }
  }
  parts.push(input.subarray(from));
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// A short digital echo, the room of a chip.
function echo(input, rate, amount) {
  if (amount <= 0) return input;
  const delay = Math.floor(rate * 0.075);
  const feedback = 0.18 + amount * 0.22;
  const mix = 0.12 + amount * 0.28;
  const tail = delay * 4;
  const wet = new Float32Array(input.length + tail);
  for (let i = 0; i < wet.length; i++) {
    const dry = input[i] ?? 0;
    wet[i] = dry + (i >= delay ? wet[i - delay] * feedback : 0);
  }
  const out = new Float32Array(wet.length);
  for (let i = 0; i < out.length; i++) out[i] = (input[i] ?? 0) * (1 - mix * 0.5) + (wet[i] - (input[i] ?? 0)) * mix;
  return out;
}

// Never louder than full scale, a touch below it.
function normalize(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak < 1e-4) return samples;
  const gain = 0.92 / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
}

export function construct(samples, rate, { pitch = 1.08, glitch: g = 0.4, echo: e = 0.4, seed = 1 } = {}) {
  const rand = random(seed);
  let out = repitch(samples, pitch);
  out = glitch(out, rate, g, rand);
  out = echo(out, rate, e);
  return normalize(out);
}

// What to ask the speech engine for, so that once pitched up she talks at `speed`.
export const speedFor = (speed, pitch) => speed / pitch;

export const seedFor = hash;

// Her settings (config), as a level name: off, light, strong
export const LEVELS = { off: 0, light: 0.35, strong: 0.8 };
export const PITCHES = { natural: 1, higher: 1.1, highest: 1.22 };
