// Her voice out loud: her natural voice (main/tts.js, offline) made into a construct's
// (construct.js), or, without one, Windows' own voices, a little higher and quicker than they come.
// While she talks her ears are paused (she'd hear herself) and her mouth moves (her 'talk' act).

import { construct, speedFor, seedFor, LEVELS, PITCHES } from './construct.js';

// voices that suit her, by name, in the order she prefers them
const PREFERRED = /aria|jenny|zira|hazel|susan|sonia|libby|natasha|denise|hortense|julie|elvira|helena|laura|sabina|francisca|maria|irina|svetlana|dariya|ekaterina|female/i;
const MAX_CHARS = 420; // past that, the panel has the rest
// words her natural voice says wrong, spelled the way it gets them right
const PRONOUNCE = [[/\bchoom(s?)\b/gi, 'choomm$1'], [/\bnetrunner/gi, 'net runner'], [/\bpreem\b/gi, 'preemm']];
const pronounced = (text) => PRONOUNCE.reduce((t, [re, to]) => t.replace(re, to), text);

// Her line in sentences: she starts on the first while the next is being made.
export const sentences = (text) => (text.match(/[^.!?…]+(?:[.!?…]+|$)\s*/g) || [text]).map((s) => s.trim()).filter(Boolean);

// How a sentence is said: an exclamation quicker and higher, a question up, a trailing "…" slower.
export function mood(sentence) {
  if (/!\s*$/.test(sentence)) return { speed: 1.07, pitch: 1.035 };
  if (/\?\s*$/.test(sentence)) return { speed: 1.02, pitch: 1.025 };
  if (/(\.\.\.|…)\s*$/.test(sentence)) return { speed: 0.9, pitch: 0.985 };
  return { speed: 1, pitch: 1 };
}
const TALK_EVERY_MS = 650;

// What's worth saying of a reply: no code, no links, no markdown, cut at a sentence.
export function speakable(text) {
  let out = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[\[[^\]]*\]\]/g, ' ')            // her action tags
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')    // [text](link)
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_~]+/g, '')
    .replace(/[#>|]+/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (out.length > MAX_CHARS) {
    const cut = out.slice(0, MAX_CHARS);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    out = end > 80 ? cut.slice(0, end + 1) : `${cut}…`;
  }
  return out;
}

export class Speaker {
  constructor({ capri, host }) {
    this.capri = capri;
    this.host = host;
    this.synth = window.speechSynthesis || null;
    this.lang = 'en';
    this.muted = false;
    this.volume = 0.8;
    this.voiceName = '';
    this.engine = 'auto';
    this.pitch = 'higher';
    this.glitch = 'light';
    this.talking = 0;  // interval of her mouth moving
    this.resumeTimer = 0;
    this.queue = 0;    // lines not finished yet
    this.chain = Promise.resolve(); // her lines, one after the other
    this.gen = 0;      // bumped by stop(): lines queued before it are dropped
    this.ctx = null;
    this.source = null; // what's playing of her natural voice
    this.onIdle = null; // () => void: she's done talking and her ears are open again
    this.bargeIn = false; // her ears stay open while she talks (a headset: she won't hear herself)
    this.synth?.getVoices(); // Chromium fills the list on its first call
  }

  configure(cfg) {
    this.lang = cfg.lang || 'en';
    this.muted = Boolean(cfg.muted);
    this.volume = typeof cfg.volume === 'number' ? cfg.volume : 0.8;
    this.voiceName = cfg.voiceName || '';
    this.enabled = cfg.speak !== false;
    this.all = Boolean(cfg.speakAll);
    this.engine = cfg.voiceEngine || 'auto';
    this.pitch = cfg.voicePitch || 'higher';
    this.glitch = cfg.voiceGlitch || 'light';
    this.bargeIn = Boolean(cfg.bargeIn);
    if (this.muted) this.stop();
  }

  get available() {
    return true;
  }

  // she's saying something, or about to
  get busy() {
    return this.queue > 0;
  }

  // The Windows voice for her language: the one picked in her settings, else one that suits her.
  voice() {
    const voices = this.synth?.getVoices() || [];
    if (this.voiceName) {
      const named = voices.find((v) => v.name === this.voiceName);
      if (named) return named;
    }
    const mine = voices.filter((v) => v.lang.toLowerCase().startsWith(this.lang));
    return mine.find((v) => PREFERRED.test(v.name)) || mine[0] || null;
  }

  say(text) {
    if (this.muted) return false;
    const words = speakable(text);
    if (!words) return false;
    const gen = this.gen;
    this.queue += 1;
    this.chain = this.chain
      .then(() => (gen === this.gen ? this.speakOne(words) : undefined))
      .catch((err) => console.error('[capri] speaking:', err))
      .finally(() => this.ended(gen));
    return true;
  }

  // One line: in her natural voice if she has one (main.js says null when she doesn't), else
  // Windows'. A sentence at a time, each said its own way (mood), the next made while she says
  // this one.
  async speakOne(words) {
    const base = PITCHES[this.pitch] ?? PITCHES.higher;
    if (this.engine === 'windows') return this.windows(words);
    const gen = this.gen;
    const parts = sentences(words);
    const ask = (text) => {
      const m = mood(text);
      const pitch = base * m.pitch;
      return this.host.ttsSay(pronounced(text), speedFor(1.05 * m.speed, pitch))
        .then((audio) => (audio?.samples?.length ? { ...audio, pitch, text } : null), () => null);
    };
    let next = ask(parts[0]);
    for (let i = 0; i < parts.length; i++) {
      const audio = await next;
      if (gen !== this.gen) return undefined;
      if (!audio) return i === 0 ? this.windows(words) : undefined; // no natural voice: Windows'
      next = i + 1 < parts.length ? ask(parts[i + 1]) : null;
      await this.play(audio, audio.pitch, audio.text);
    }
    return undefined;
  }

  play({ samples, sampleRate }, pitch, words) {
    this.ctx ??= new AudioContext();
    const level = LEVELS[this.glitch] ?? LEVELS.light;
    const out = construct(samples, sampleRate, { pitch, glitch: level, echo: level, seed: seedFor(words) });
    const buffer = this.ctx.createBuffer(1, out.length, sampleRate);
    buffer.copyToChannel(out, 0);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = Math.min(1, this.volume + 0.2);
    source.connect(gain).connect(this.ctx.destination);
    return new Promise((done) => {
      source.onended = () => {
        if (this.source === source) this.source = null;
        done();
      };
      this.source = source;
      this.started();
      source.start();
    });
  }

  windows(words) {
    if (!this.synth) return undefined;
    return new Promise((done) => {
      const u = new SpeechSynthesisUtterance(words);
      const voice = this.voice();
      if (voice) u.voice = voice;
      u.lang = voice?.lang || this.lang;
      u.pitch = 1.15;
      u.rate = 1.05;
      u.volume = Math.min(1, this.volume + 0.2);
      u.onstart = () => this.started();
      u.onend = u.onerror = () => done();
      this.synth.speak(u);
    });
  }

  started() {
    clearTimeout(this.resumeTimer);
    if (!this.bargeIn) this.host.pauseEars(true);
    clearInterval(this.talking);
    this.capri.perform('talk');
    this.talking = setInterval(() => this.capri.perform('talk'), TALK_EVERY_MS);
  }

  ended(gen) {
    if (gen !== this.gen) return; // stop() has already tidied up
    this.queue = Math.max(0, this.queue - 1);
    if (this.queue) return;
    clearInterval(this.talking);
    this.talking = 0;
    // the room's echo of her last word dies down before her ears open again
    clearTimeout(this.resumeTimer);
    this.resumeTimer = setTimeout(() => {
      this.host.pauseEars(false);
      this.onIdle?.();
    }, 450);
  }

  stop() {
    this.gen += 1;
    this.synth?.cancel();
    try {
      this.source?.stop();
    } catch {
      // already over
    }
    this.source = null;
    this.queue = 0;
    clearInterval(this.talking);
    this.talking = 0;
    this.host.pauseEars(false);
  }
}
