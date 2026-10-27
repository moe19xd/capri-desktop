// Things she can do for you, said or typed, in any of her languages (chat.js asked() spots them):
// timers and reminders (kept across restarts, rung even if missed), sums ("what's 15% of 230"),
// a web or YouTube search, and what you copied (handed to her chat with your question).

import { fmt, pick } from './util.js';

// ---------- her words for it, by language ----------
const WORDS = {
  en: {
    remind: /\b(remind me|reminder|set a timer|timer|alarm)\b/,
    cancel: /\b(cancel|delete|clear|stop)\b.*\b(reminders?|timers?|alarms?)\b/,
    units: { s: /^(seconds?|secs?)$/, m: /^(minutes?|mins?)$/, h: /^(hours?|hrs?)$/ },
    filler: /^(?:(?:remind me|set a reminder|set a timer|set an alarm|a timer|timer|reminder|alarm|for|in|to|that|about|please|capri)\b\s*)+/,
    calc: /\b(what.?s|what is|how much is|calculate|compute)\b/,
    ops: [[/\bplus\b/g, '+'], [/\bminus\b/g, '-'], [/\b(times|multiplied by)\b|×/g, '*'], [/\b(divided by|over)\b|÷/g, '/'],
      [/\b(?:percent|per cent) of\b/g, '%of'], [/\bsquared\b/g, '^2'], [/\bto the power of\b/g, '^']],
    search: /^(?:search(?: the web)?(?: for)?|google|look up|look for|find me|search up)\s+(.+?)(?:\s+(?:on|in)\s+(youtube|google))?$/,
    clip: /\b(clipboard|what i copied|what i just copied|copied text)\b/,
  },
  fr: {
    remind: /\b(rappelle[- ]?moi|rappel|minuteur|timer|alarme)\b/,
    cancel: /\b(annule|supprime|efface|arr[eê]te)\b.*\b(rappels?|minuteurs?|alarmes?)\b/,
    units: { s: /^(secondes?|sec)$/, m: /^(minutes?|min)$/, h: /^(heures?|h)$/ },
    filler: /^(?:(?:rappelle[- ]?moi|mets un rappel|mets un minuteur|un minuteur|minuteur|rappel|alarme|dans|pour|de|d'|que|qu'|capri|s'il te pla[iî]t)\b\s*)+/,
    calc: /\b(combien (font|fait)|calcule|c'est combien)\b/,
    ops: [[/\bplus\b/g, '+'], [/\bmoins\b/g, '-'], [/\b(fois|multipli[ée] par)\b|×/g, '*'], [/\b(divis[ée] par|sur)\b|÷/g, '/'],
      [/\bpour ?cent de\b/g, '%of'], [/\bau carr[ée]\b/g, '^2'], [/\bpuissance\b/g, '^']],
    search: /^(?:cherche|recherche|google|trouve[- ]moi)\s+(.+?)(?:\s+sur\s+(youtube|google))?$/,
    clip: /\b(presse[- ]papiers?|ce que j'ai copi[ée]|texte copi[ée])\b/,
  },
  es: {
    remind: /\b(recu[ée]rdame|recordatorio|temporizador|alarma)\b/,
    cancel: /\b(cancela|borra|quita|para)\b.*\b(recordatorios?|temporizadores?|alarmas?)\b/,
    units: { s: /^(segundos?)$/, m: /^(minutos?|min)$/, h: /^(horas?)$/ },
    filler: /^(?:(?:recu[ée]rdame|pon un recordatorio|pon un temporizador|un temporizador|temporizador|recordatorio|alarma|en|dentro de|para|que|de|capri|por favor)\b\s*)+/,
    calc: /\b(cu[áa]nto (es|son)|calcula)\b/,
    ops: [[/\bm[áa]s\b/g, '+'], [/\bmenos\b/g, '-'], [/\b(por|multiplicado por)\b|×/g, '*'], [/\b(dividido (por|entre)|entre)\b|÷/g, '/'],
      [/\bpor ?ciento de\b/g, '%of'], [/\bal cuadrado\b/g, '^2']],
    search: /^(?:busca|b[úu]scame|googlea)\s+(.+?)(?:\s+en\s+(youtube|google))?$/,
    clip: /\b(portapapeles|lo que copi[ée]|texto copiado)\b/,
  },
  pt: {
    remind: /\b(me lembr[ae]|lembrete|temporizador|timer|alarme)\b/,
    cancel: /\b(cancela|apaga|tira|para)\b.*\b(lembretes?|temporizadores?|timers?|alarmes?)\b/,
    units: { s: /^(segundos?)$/, m: /^(minutos?|min)$/, h: /^(horas?)$/ },
    filler: /^(?:(?:me lembr[ae]|coloca um lembrete|coloca um timer|um timer|timer|temporizador|lembrete|alarme|em|daqui a|de|que|pra|para|capri|por favor)\b\s*)+/,
    calc: /\b(quanto [ée]|quanto d[áa]|calcula)\b/,
    ops: [[/\bmais\b/g, '+'], [/\bmenos\b/g, '-'], [/\b(vezes|multiplicado por)\b|×/g, '*'], [/\b(dividido por)\b|÷/g, '/'],
      [/\bpor ?cento de\b/g, '%of'], [/\bao quadrado\b/g, '^2']],
    search: /^(?:pesquisa|procura|busca|googla)\s+(.+?)(?:\s+no\s+(youtube|google))?$/,
    clip: /\b([áa]rea de transfer[êe]ncia|o que eu copiei|texto copiado)\b/,
  },
  ru: {
    remind: /(напомни|напоминани|таймер|будильник)/,
    cancel: /(отмени|удали|убери|выключи).*(напоминани|таймер|будильник)/,
    units: { s: /^(секунд\S*)$/, m: /^(минут\S*|мин)$/, h: /^(час\S*)$/ },
    filler: /^(?:(?:напомни( мне)?|поставь таймер|таймер|напоминание|будильник|через|на|что|чтобы|о|про|капри|пожалуйста)(?=\s|$)\s*)+/,
    calc: /(сколько будет|посчитай|вычисли)/,
    ops: [[/(?:^|\s)плюс(?=\s|$)/g, ' + '], [/(?:^|\s)минус(?=\s|$)/g, ' - '], [/(?:^|\s)(умножить на|на)(?=\s|$)|×/g, ' * '],
      [/(?:^|\s)(разделить на|делить на)(?=\s|$)|÷/g, ' / '], [/процент(ов|а)? от/g, '%of'], [/в квадрате/g, '^2']],
    search: /^(?:найди|поищи|загугли)\s+(.+?)(?:\s+(?:на|в)\s+(youtube|ютуб\S*|google|гугл\S*))?$/,
    clip: /(буфер\S* обмена|что я скопировал\S*|скопированн\S* текст)/,
  },
};

// English numbers as Vosk writes them ("twenty five"): Whisper writes digits
const SMALL = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  half: 0.5 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90 };
function wordsToDigits(text) {
  return text
    .replace(/\b(twenty|thirty|forty|fifty|sixty|ninety)[ -](one|two|three|four|five|six|seven|eight|nine)\b/g, (_, t, u) => String(TENS[t] + SMALL[u]))
    .replace(/\b(twenty|thirty|forty|fifty|sixty|ninety)\b/g, (t) => String(TENS[t]))
    .replace(/\b(an? hour|a minute|half an hour)\b/g, (m) => (m === 'half an hour' ? '30 minutes' : m.replace(/an? /, '1 ')))
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/g, (u) => String(SMALL[u]));
}

const UNIT_MS = { s: 1000, m: 60000, h: 3600000 };
const MAX_MS = 7 * 24 * 3600000; // a week

const tidy = (text) => String(text || '').toLowerCase().replace(/[’]/g, "'").replace(/[!?.,;:"“”«»]+/g, ' ').replace(/\s+/g, ' ').trim();

// "in 20 minutes", "1 hour 30 minutes", "dans 5 min": { ms, rest } (rest: what's left of the text)
function duration(text, w) {
  let ms = 0;
  const rest = text.replace(/(\d+(?:[.,]\d+)?)\s*([^\s\d]+)/g, (all, n, unit) => {
    const key = Object.keys(w.units).find((k) => w.units[k].test(unit));
    if (!key) return all;
    ms += parseFloat(n.replace(',', '.')) * UNIT_MS[key];
    return ' ';
  });
  return ms > 0 ? { ms: Math.min(ms, MAX_MS), rest } : null;
}

// ---------- sums, without eval: + - * / ^, parentheses, "15%of 230" ----------
export function calculate(expr) {
  const tokens = String(expr).replace(/,(?=\d)/g, '.').match(/\d+(?:\.\d+)?|%of|[-+*/^()%]/g);
  if (!tokens || !tokens.some((t) => /\d/.test(t))) return null;
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];
  const atom = () => {
    const t = take();
    if (t === '(') {
      const v = sum();
      if (take() !== ')') throw new Error('paren');
      return v;
    }
    if (t === '-') return -atom();
    if (!/^\d/.test(t ?? '')) throw new Error('number');
    let v = parseFloat(t);
    if (peek() === '%') { take(); v /= 100; }
    return v;
  };
  const power = () => {
    const base = atom();
    if (peek() === '^') { take(); return base ** power(); }
    return base;
  };
  const product = () => {
    let v = power();
    while (['*', '/', '%of'].includes(peek())) {
      const op = take();
      const r = power();
      v = op === '*' ? v * r : op === '/' ? v / r : (v / 100) * r;
    }
    return v;
  };
  const sum = () => {
    let v = product();
    while (peek() === '+' || peek() === '-') v = take() === '+' ? v + product() : v - product();
    return v;
  };
  try {
    const v = sum();
    return i === tokens.length && Number.isFinite(v) ? Math.round(v * 1e9) / 1e9 : null;
  } catch {
    return null;
  }
}

// What you asked, if it's one of these: { kind: 'reminder', ms, task } | { kind: 'cancel' }
// | { kind: 'calc', value } | { kind: 'search', query, site } | { kind: 'clipboard' } | null
export function parse(text, lang = 'en') {
  const w = WORDS[lang] || WORDS.en;
  const said = tidy(lang === 'en' ? wordsToDigits(tidy(text)) : text);
  if (!said) return null;
  if (w.cancel.test(said)) return { kind: 'cancel' };
  if (w.remind.test(said)) {
    const d = duration(said, w);
    if (d) {
      const task = d.rest.replace(/\s+/g, ' ').trim().replace(w.filler, '').replace(/\s+(in|dans|en|em|через)$/, '').trim();
      return { kind: 'reminder', ms: d.ms, task };
    }
  }
  if (w.clip.test(said)) return { kind: 'clipboard' };
  const search = w.search.exec(said);
  if (search) return { kind: 'search', query: search[1].trim(), site: /you|ют/.test(search[2] || '') ? 'youtube' : 'web' };
  if (/\d/.test(said)) {
    let expr = said.replace(w.calc, ' ');
    for (const [re, op] of w.ops) expr = expr.replace(re, ` ${op.trim()} `);
    expr = expr.replace(/%\s*of/g, '%of');
    // nothing but a sum left in it (else it's a sentence with a number in it, for her chat)
    const left = expr.replace(/\d+(?:[.,]\d+)?|%of|[-+*/^()%x\s]/g, '').trim();
    if (!left && /[-+*/^%]/.test(expr)) {
      const value = calculate(expr.replace(/(\d)\s*x\s*(\d)/g, '$1*$2'));
      if (value !== null) return { kind: 'calc', value };
    }
  }
  return null;
}

// ---------- doing it ----------
const LINES = {
  en: { timer: ['Timer set: {time}.', 'Okay, {time}. I\'m counting.'], reminder: ['Got it. In {time}: {task}.', 'I\'ll remind you in {time}, choom.'],
    ring: ['Hey! Time for: {task}.', 'Choom! {task}. Now.'], ringTimer: ['Time\'s up!', 'Ding. {time}, done.'],
    missed: 'You missed one while I was off: {task}.', cancel: 'All your reminders are gone.', none: 'No reminders to cancel.',
    calc: ['That\'s {value}.', '{value}. Easy.'], search: 'Searching for {query}.', clipEmpty: 'Your clipboard\'s empty, choom.',
    ok: 'Got it', snooze: '+5 min' },
  fr: { timer: ['Minuteur lancé : {time}.', 'Ok, {time}. Je compte.'], reminder: ['Noté. Dans {time} : {task}.', 'Je te le rappelle dans {time}, choom.'],
    ring: ['Hé ! C\'est l\'heure : {task}.', 'Choom ! {task}. Maintenant.'], ringTimer: ['C\'est l\'heure !', 'Ding. {time}, c\'est fini.'],
    missed: 'Tu en as raté un pendant que j\'étais éteinte : {task}.', cancel: 'Tous tes rappels sont effacés.', none: 'Aucun rappel à annuler.',
    calc: ['Ça fait {value}.', '{value}. Facile.'], search: 'Je cherche {query}.', clipEmpty: 'Ton presse-papiers est vide, choom.',
    ok: 'Compris', snooze: '+5 min' },
  es: { timer: ['Temporizador: {time}.', 'Vale, {time}. Cuento.'], reminder: ['Hecho. En {time}: {task}.', 'Te lo recuerdo en {time}, choom.'],
    ring: ['¡Ey! Toca: {task}.', '¡Choom! {task}. Ya.'], ringTimer: ['¡Se acabó el tiempo!', 'Ding. {time}, listo.'],
    missed: 'Te perdiste uno mientras estaba apagada: {task}.', cancel: 'Borré todos tus recordatorios.', none: 'No hay recordatorios.',
    calc: ['Son {value}.', '{value}. Fácil.'], search: 'Buscando {query}.', clipEmpty: 'Tu portapapeles está vacío, choom.',
    ok: 'Vale', snooze: '+5 min' },
  pt: { timer: ['Timer ligado: {time}.', 'Beleza, {time}. Tô contando.'], reminder: ['Anotado. Em {time}: {task}.', 'Te lembro em {time}, choom.'],
    ring: ['Ei! Hora de: {task}.', 'Choom! {task}. Agora.'], ringTimer: ['Acabou o tempo!', 'Ding. {time}, pronto.'],
    missed: 'Você perdeu um enquanto eu tava desligada: {task}.', cancel: 'Apaguei todos os seus lembretes.', none: 'Nenhum lembrete.',
    calc: ['Dá {value}.', '{value}. Fácil.'], search: 'Pesquisando {query}.', clipEmpty: 'Sua área de transferência tá vazia, choom.',
    ok: 'Beleza', snooze: '+5 min' },
  ru: { timer: ['Таймер: {time}.', 'Окей, {time}. Считаю.'], reminder: ['Запомнила. Через {time}: {task}.', 'Напомню через {time}, чумба.'],
    ring: ['Эй! Пора: {task}.', 'Чумба! {task}. Сейчас.'], ringTimer: ['Время вышло!', 'Дзынь. {time} прошло.'],
    missed: 'Пока я была выключена, ты пропустил: {task}.', cancel: 'Все напоминания удалены.', none: 'Напоминаний нет.',
    calc: ['Это {value}.', '{value}. Легко.'], search: 'Ищу {query}.', clipEmpty: 'Буфер обмена пуст, чумба.',
    ok: 'Понятно', snooze: '+5 мин' },
};

// 90 s -> "1 minute 30 seconds", in her language
export function spoken(ms, lang) {
  const unit = (n, u) => new Intl.NumberFormat(lang, { style: 'unit', unit: u, unitDisplay: 'long' }).format(n);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return [h && unit(h, 'hour'), m && unit(m, 'minute'), s && unit(s, 'second')].filter(Boolean).join(' ') || unit(0, 'second');
}

export class Skills {
  constructor({ host, brain, capri, panel, voice }) {
    Object.assign(this, { host, brain, capri, panel, voice });
    this.reminders = [];   // [{ id, at, task, ms }] (config.reminders)
    this.timers = new Map(); // id -> timeout
    this.onRing = null;    // (line) => void: speak.js says it out loud
  }

  get t() {
    return LINES[this.brain.lang] || LINES.en;
  }

  // Her reminders as kept: the ones whose time came while she was off ring now.
  load(list = []) {
    this.reminders = list.filter((r) => r && r.at && r.id);
    const now = Date.now();
    for (const r of this.reminders) {
      if (r.at <= now) setTimeout(() => this.ring(r, { missed: true }), 6000); // after her entrance
      else this.arm(r);
    }
  }

  save() {
    this.host.setConfig({ reminders: this.reminders });
  }

  arm(r) {
    clearTimeout(this.timers.get(r.id));
    // setTimeout can't wait longer than ~24 days; a week at most is asked for anyway
    this.timers.set(r.id, setTimeout(() => this.ring(r), Math.max(0, r.at - Date.now())));
  }

  async ring(r, { missed = false } = {}) {
    this.timers.delete(r.id);
    this.reminders = this.reminders.filter((x) => x.id !== r.id);
    this.save();
    const { t, capri, panel } = this;
    const time = spoken(r.ms, this.brain.lang);
    const line = missed ? fmt(t.missed, { task: r.task || time })
      : fmt(pick(r.task ? t.ring : t.ringTimer), { task: r.task, time });
    if (capri.stowed) await capri.unstow();
    capri.wake();
    capri.perform('alarm');
    this.voice.play('alert');
    panel.say({
      kind: 'alert',
      badge: '⏰',
      line,
      actions: [{ id: 'ok', label: t.ok, primary: true }, { id: 'snooze', label: t.snooze }],
      onAction: (id) => {
        panel.hide();
        if (id === 'snooze') this.add({ ms: 5 * 60000, task: r.task });
      },
      hold: 60000,
    });
    this.onRing?.(line);
  }

  add({ ms, task }) {
    const r = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now() + ms, ms, task };
    this.reminders.push(r);
    this.save();
    this.arm(r);
    return r;
  }

  // Does it: resolves with her line ({ line, face }), or null when it's for her chat (the clipboard).
  async run(skill) {
    const { t } = this;
    const lang = this.brain.lang;
    if (skill.kind === 'reminder') {
      this.add(skill);
      const time = spoken(skill.ms, lang);
      return { line: fmt(pick(skill.task ? t.reminder : t.timer), { time, task: skill.task }), face: 'smug' };
    }
    if (skill.kind === 'cancel') {
      if (!this.reminders.length) return { line: t.none, face: 'aside' };
      for (const id of this.timers.keys()) clearTimeout(this.timers.get(id));
      this.timers.clear();
      this.reminders = [];
      this.save();
      return { line: t.cancel, face: 'smug' };
    }
    if (skill.kind === 'calc') {
      const value = new Intl.NumberFormat(lang, { maximumFractionDigits: 6 }).format(skill.value);
      return { line: fmt(pick(t.calc), { value }), face: 'smug' };
    }
    if (skill.kind === 'search') {
      const q = encodeURIComponent(skill.query);
      const url = skill.site === 'youtube' ? `https://www.youtube.com/results?search_query=${q}` : `https://www.google.com/search?q=${q}`;
      await this.host.openSite(url);
      return { line: fmt(t.search, { query: skill.query }), face: 'laugh' };
    }
    return null;
  }
}
