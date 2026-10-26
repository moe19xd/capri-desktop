// Her voice out loud: Windows' own voices (speech synthesis, offline, free), a little higher and
// quicker than they come. While she talks her ears are paused (she'd hear herself) and her mouth
// moves (her 'talk' act).

// voices that suit her, by name, in the order she prefers them
const PREFERRED = /aria|jenny|zira|hazel|susan|sonia|libby|natasha|denise|hortense|julie|elvira|helena|laura|sabina|francisca|maria|irina|svetlana|dariya|ekaterina|female/i;
const MAX_CHARS = 420; // past that, the panel has the rest
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
    this.talking = 0; // interval of her mouth moving
    this.resumeTimer = 0;
    this.queue = 0;   // utterances not finished yet
    this.synth?.getVoices(); // Chromium fills the list on its first call
  }

  configure(cfg) {
    this.lang = cfg.lang || 'en';
    this.muted = Boolean(cfg.muted);
    this.volume = typeof cfg.volume === 'number' ? cfg.volume : 0.8;
    this.voiceName = cfg.voiceName || '';
    this.enabled = cfg.speak !== false;
    this.all = Boolean(cfg.speakAll);
    if (this.muted) this.stop();
  }

  get available() {
    return Boolean(this.synth);
  }

  // The voice for her language: the one picked in her settings, else one that suits her.
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
    if (!this.synth || this.muted) return false;
    const words = speakable(text);
    if (!words) return false;
    const u = new SpeechSynthesisUtterance(words);
    const voice = this.voice();
    if (voice) u.voice = voice;
    u.lang = voice?.lang || this.lang;
    u.pitch = 1.15;
    u.rate = 1.05;
    u.volume = Math.min(1, this.volume + 0.2);
    u.onstart = () => this.started();
    u.onend = u.onerror = () => this.ended();
    this.queue += 1;
    this.synth.speak(u);
    return true;
  }

  started() {
    clearTimeout(this.resumeTimer);
    this.host.pauseEars(true);
    clearInterval(this.talking);
    this.capri.perform('talk');
    this.talking = setInterval(() => this.capri.perform('talk'), TALK_EVERY_MS);
  }

  ended() {
    this.queue = Math.max(0, this.queue - 1);
    if (this.queue) return;
    clearInterval(this.talking);
    this.talking = 0;
    // the room's echo of her last word dies down before her ears open again
    clearTimeout(this.resumeTimer);
    this.resumeTimer = setTimeout(() => this.host.pauseEars(false), 450);
  }

  stop() {
    if (!this.synth) return;
    this.synth.cancel();
    this.queue = 0;
    clearInterval(this.talking);
    this.talking = 0;
    this.host.pauseEars(false);
  }
}
