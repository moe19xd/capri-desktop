// Talking to her out loud: her ears (main/ears.js, offline) hear you, she answers.
// "Capri, …" (or Ctrl+Alt+V, then just talk): what follows is
//   - one of the things she does herself (teleport, hide, sleep, the satellite…), right away;
//   - else something for your PC she spots plainly (music, an app, the volume), as in her chat;
//   - else a message to her chat, whose answer she says out loud.
// Anything said without her name is none of her business: she doesn't keep or send it.

import { pick, fmt } from './util.js';
import { voiceFor } from './voicelines.js';

const ARMED_MS = 7000;  // after her name alone (or Ctrl+Alt+V), how long she waits for the rest
const OWN_MAX_WORDS = 7; // her own commands are short; longer, it's for her chat
// how her name comes out of the sentence recognizer when it mishears it
const NAMEISH = /^(capri|capris|caprice|capree|copy|cap|kapri|capra|capri's|капри)$/;

// lowercase, apostrophes and hyphens as spaces ("t'en" -> "t en"), no punctuation (Whisper writes
// it, her other ears don't): what the commands match on
const plain = (text) => String(text || '').toLowerCase()
  .replace(/['’-]+/g, ' ')
  .replace(/[.,!?;:"“”«»()…¿¡]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export class Listen {
  constructor({ capri, panel, host, brain, chat, speaker }) {
    this.capri = capri;
    this.panel = panel;
    this.host = host;
    this.brain = brain;
    this.chat = chat;
    this.speaker = speaker;
    this.armedUntil = 0;
    this.on = false;       // her ears are open
    this.announced = false; // she said "ears on" this run
    this.fetching = false;
    this.lastHeard = '';    // what she last heard you say to her
    host.onVoiceEvent((msg) => this.onEvent(msg));
  }

  get t() {
    return voiceFor(this.brain.lang);
  }

  onEvent(msg) {
    switch (msg.type) {
      case 'ready':
        this.on = true;
        if (!this.announced) {
          this.announced = true;
          this.panel.say({ kind: 'info', badge: this.t.badge, line: this.t.ready, hold: 4500 });
        }
        break;
      case 'wake':
        this.arm();
        break;
      case 'hearing': // Whisper is making out what you said
        this.capri.pulse();
        break;
      case 'final':
        this.heard(msg.text, msg.wake, msg.alt);
        break;
      case 'error':
        this.on = false;
        this.panel.say({
          kind: 'error',
          face: 'aside',
          badge: this.t.badge,
          line: msg.error === 'mic' ? this.t.mic : this.t.model,
          quote: msg.error === 'mic' ? this.t.micHow : this.t.modelHow,
          hold: 12000,
        });
        break;
      default:
        break;
    }
  }

  // Her name: she turns to you and listens for what comes next.
  arm() {
    const { capri } = this;
    const fresh = performance.now() > this.armedUntil;
    this.armedUntil = performance.now() + ARMED_MS;
    this.host.armEars(ARMED_MS); // what you say next is kept for Whisper too
    if (!fresh) return;
    if (capri.stowed) return; // in her chip she still hears you, she just doesn't come out for "Capri" alone
    capri.wake();
    capri.perform('curious', capri.towardCenter());
    if (!this.chat.open) this.panel.say({ kind: 'info', badge: this.t.badge, line: pick(this.t.listening), hold: ARMED_MS });
  }

  // Ctrl+Alt+V: whatever you say next is for her
  pushToTalk() {
    this.armedUntil = 0;
    this.arm();
  }

  // A sentence her ears made out. wake: her name was heard in it. alt: what her small model made
  // of it, when Whisper wrote `raw`: if only that one is one of her commands, it's the one.
  heard(raw, wake, alt = null) {
    const text = this.pick(plain(raw), plain(alt));
    if (!text) return;
    const armed = performance.now() < this.armedUntil;
    const named = this.t.wake.test(text);
    if (!armed && !wake && !named) return; // not for her
    let rest = text.replace(this.t.wake, '').trim();
    // her name heard by her name recognizer, misheard by the other ("cap", "camp"): its first word
    // is her name, and alone it's just her name
    if (!named && wake) {
      const [first, ...others] = rest.split(' ');
      if (!others.length || NAMEISH.test(first) || /^[ck]a[pbmf]/.test(first)) rest = others.join(' ');
    }
    if (!rest) {
      this.arm(); // just her name: she waits for the rest
      return;
    }
    this.armedUntil = 0;
    this.host.armEars(0);
    this.handle(rest);
  }

  async handle(text) {
    const { capri, chat } = this;
    if (capri.stowed) {
      this.host.setConfig({ visible: true });
      await capri.unstow();
    }
    capri.wake();
    this.lastHeard = text;
    const own = this.own(text);
    if (own) return this.doOwn(own);
    // what her chat would do right away (music, the volume, an app, your name…): she does it now,
    // without needing a model
    const asked = chat.asked(text);
    if (asked && asked.kind !== 'close') {
      const done = await chat.doNow(asked);
      if (done) return this.say(done.line, done.face);
    }
    // the rest is a conversation: her chat, if she has something to think with
    const status = await this.host.chatStatus().catch(() => ({ ok: false }));
    if (!status.ok) return this.say(this.t.noBrain, 'aside');
    if (!chat.open) await chat.start();
    if (!chat.open) return undefined; // something more important is on screen (a permission prompt)
    return chat.send(text, { voice: true });
  }

  pick(text, alt) {
    if (!alt || !text) return text || alt;
    const strip = (t) => t.replace(this.t.wake, '').trim().split(' ').filter((w, i) => i > 0 || !NAMEISH.test(w)).join(' ');
    return !this.own(strip(text)) && this.own(strip(alt)) ? alt : text;
  }

  // One of her own commands, if it's that: its name
  own(text) {
    if (text.split(' ').length > OWN_MAX_WORDS) return null;
    return this.t.commands.find(([, re]) => re.test(text))?.[0] || null;
  }

  async doOwn(name) {
    const { capri, brain, host, speaker } = this;
    const line = (key, vars) => fmt(pick(this.t.did[key]), vars);
    switch (name) {
      case 'teleport':
        this.say(line('teleport'));
        capri.teleport(capri.spot('random'));
        break;
      case 'satellite':
        this.say(line('satellite'));
        if (capri.stance === 'peek') await capri.unpeek();
        capri.gaze({ big: true });
        break;
      case 'hide':
        this.say(line('hide'));
        host.setConfig({ visible: false });
        await capri.stow();
        break;
      case 'back':
        this.say(line('back'));
        break;
      case 'sleep':
        this.say(line('sleep'));
        setTimeout(() => capri.setMode('sleep'), 1800);
        break;
      case 'wake':
        capri.perform('hop');
        this.say(line('wake'));
        break;
      case 'spin':
        this.say(line('spin'));
        capri.perform(Math.random() < 0.5 ? 'spin' : 'split', capri.towardCenter());
        break;
      case 'status':
        brain.status();
        if (speaker.enabled && this.panel.current?.line) speaker.say(this.panel.current.line);
        break;
      case 'report':
        if (brain.report()) capri.perform('curious', capri.towardCenter());
        break;
      case 'quiet':
        speaker.stop();
        speaker.enabled = speaker.all = false; // her settings follow, a moment later
        host.setConfig({ speak: false, speakAll: false });
        this.say(line('quiet'));
        break;
      case 'loud':
        host.setConfig({ speak: true });
        speaker.enabled = true;
        this.say(line('loud'));
        break;
      case 'stop':
        this.say(line('stop'));
        host.setConfig({ listen: false });
        this.on = false;
        break;
      case 'time': {
        const time = new Date().toLocaleTimeString(brain.lang, { hour: '2-digit', minute: '2-digit' });
        this.say(line('time', { time }));
        break;
      }
      default: // hello, thanks
        capri.perform('hop');
        this.say(line(name));
        break;
    }
  }

  // Her line about it, under what she heard you say: in her chat if it's open (nothing else gets
  // on screen then), else on its own; and out loud, unless her answers are set to stay silent.
  say(line, face = null) {
    const { chat, speaker } = this;
    let shown = false;
    if (chat.open) {
      if (!chat.turn) { // not while an answer is coming in: out loud only
        chat.panel.chatTurn({ quote: this.lastHeard, face: face || 'look' });
        chat.panel.stream(line, { done: true });
      }
    } else {
      const quote = this.lastHeard && `“${this.lastHeard}”`;
      shown = this.panel.say({ kind: 'info', badge: this.t.badge, face: face || undefined, quote, line, hold: 5500 });
    }
    // all her lines out loud: panel.say has already said it
    if (speaker.enabled && !(shown && speaker.all)) speaker.say(line);
  }

  // Her voice model isn't here yet: she offers to fetch it (from her menu, or Ctrl+Alt+V).
  async setup() {
    const { panel, host } = this;
    const s = this.t.setup;
    const state = await host.voiceStatus();
    if (state.installed && state.whisper) {
      host.setConfig({ listen: true, whisper: true });
      return;
    }
    if (this.fetching) return;
    const mb = (n) => Math.round(n / 1e6);
    const ears = state.installed ? 0 : state.expected;
    const whole = ears + (state.whisper ? 0 : state.whisperSize);
    panel.say({
      kind: 'info',
      face: 'look',
      guide: true,
      badge: this.t.badge,
      line: s.line,
      quote: fmt(s.quote, { size: mb(whole) }),
      actions: [
        { id: 'get', label: s.get, primary: true },
        // just the small model: quicker to fetch, hears less well
        ...(ears ? [{ id: 'light', label: fmt(s.light, { size: mb(ears) }) }] : []),
        { id: 'no', label: s.no },
      ],
      onAction: (id) => (id === 'no' ? panel.hide() : this.fetch({ light: id === 'light' })),
      hold: null,
    });
  }

  async fetch({ light = false } = {}) {
    const { panel, host } = this;
    const s = this.t.setup;
    this.fetching = true;
    panel.say({
      kind: 'info',
      face: 'look',
      guide: true,
      badge: this.t.badge,
      line: s.fetching,
      progress: 0,
      actions: [{ id: 'cancel', label: s.cancel }],
      onAction: () => host.cancelVoice(),
      hold: null,
    });
    const off = host.onVoiceProgress(({ done, total, unpacking }) => {
      panel.setProgress(total ? done / total : 0);
      panel.setQuote(unpacking ? s.unpacking : fmt(s.progress, { done: Math.round(done / 1e6), total: Math.round(total / 1e6) }));
    });
    const res = await host.getVoice({ light });
    off();
    this.fetching = false;
    if (res.ok) {
      panel.hide(); // "ears on" comes once they're listening
      this.capri.perform('hop');
    } else if (res.error === 'cancelled') {
      panel.hide();
    } else {
      panel.say({ kind: 'error', face: 'aside', badge: this.t.badge, line: fmt(s.failed, { error: res.error }), hold: 9000 });
    }
  }
}
