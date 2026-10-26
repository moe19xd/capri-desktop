'use strict';

// What she does with what her ears hear (src/renderer/js/listen.js): her name, what's for her and
// what isn't, her own commands in every language. No microphone, no Electron: fakes all around.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// util.js asks the browser about reduced motion when it loads
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });

const load = (file) => import(pathToFileURL(path.join(__dirname, '..', 'src', 'renderer', 'js', file)).href);

async function rig(lang = 'en') {
  const { Listen } = await load('listen.js');
  const handled = [];
  const listen = new Listen({
    capri: { stowed: false, wake() {}, perform() {}, towardCenter: () => 1 },
    panel: { say: () => true },
    host: { onVoiceEvent() {}, armEars() {} },
    brain: { lang },
    chat: { open: false },
    speaker: {},
  });
  listen.handle = (text) => handled.push(text);
  return { listen, handled };
}

test('her name and a command in one breath', async () => {
  const { listen, handled } = await rig();
  listen.heard('capri open spotify', true);
  listen.heard('hey capri, what time is it', false); // her name made out by the sentence recognizer alone
  assert.deepStrictEqual(handled, ['open spotify', 'what time is it']);
});

test('what Whisper writes: capitals and punctuation', async () => {
  const { listen, handled } = await rig();
  listen.heard('Capri, open Spotify.', true);
  listen.heard('Hey Capri! What time is it?', true);
  listen.heard('Cap, teleport', true);
  assert.deepStrictEqual(handled, ['open spotify', 'what time is it', 'teleport']);
});

test('Whisper misheard a command her small model got: the command wins', async () => {
  const { listen, handled } = await rig();
  listen.heard('Cap, teleboard', true, 'cap teleport');
  listen.heard('Cap, tell me about night city', true, 'cap tell me about my city');
  assert.deepStrictEqual(handled, ['teleport', 'tell me about night city']);
});

test('her name misheard by the sentence recognizer, caught by the name one', async () => {
  const { listen, handled } = await rig();
  listen.heard('cap open note pad', true);
  listen.heard('copy teleport', true);
  assert.deepStrictEqual(handled, ['open note pad', 'teleport']);
});

test('her name alone: she waits for the rest', async () => {
  const { listen, handled } = await rig();
  listen.heard('camp', true);
  assert.deepStrictEqual(handled, []);
  listen.heard('what time is it', false);
  assert.deepStrictEqual(handled, ['what time is it']);
});

test('not for her: ignored', async () => {
  const { listen, handled } = await rig();
  listen.heard('the weather is nice today', false);
  listen.heard('come back later', false);
  assert.deepStrictEqual(handled, []);
});

test('Ctrl+Alt+V: the next sentence is for her, no name needed', async () => {
  const { listen, handled } = await rig();
  listen.pushToTalk();
  listen.heard('come back', false);
  listen.heard('and this is not', false);
  assert.deepStrictEqual(handled, ['come back']);
});

test('her own commands, in each of her languages', async () => {
  const { VOICE } = await load('voicelines.js');
  const said = {
    en: [['teleport', 'teleport'], ['wake up', 'wake'], ['go to sleep', 'sleep'], ['what time is it', 'time'], ['be quiet', 'quiet'], ['stop listening', 'stop'], ['open spotify', null]],
    fr: [['téléporte toi', 'teleport'], ['réveille toi', 'wake'], ['va dormir', 'sleep'], ['quelle heure est il', 'time'], ['tais toi', 'quiet'], ['ouvre spotify', null]],
    es: [['teletranspórtate', 'teleport'], ['despierta', 'wake'], ['qué hora es', 'time'], ['cállate', 'quiet'], ['abre spotify', null]],
    pt: [['acorda', 'wake'], ['que horas são', 'time'], ['fica quieta', 'quiet'], ['abre o spotify', null]],
    ru: [['проснись', 'wake'], ['который час', 'time'], ['замолчи', 'quiet'], ['открой spotify', null]],
  };
  for (const [lang, cases] of Object.entries(said)) {
    for (const [text, want] of cases) {
      const got = VOICE[lang].commands.find(([, re]) => re.test(text))?.[0] || null;
      assert.strictEqual(got, want, `${lang}: "${text}"`);
    }
  }
});

test('her name, in each of her languages', async () => {
  const { VOICE } = await load('voicelines.js');
  const named = { en: 'hey capri open spotify', fr: 'dis capri ouvre spotify', es: 'oye capri abre spotify', pt: 'ei capri abre o spotify', ru: 'эй капри открой spotify' };
  for (const [lang, text] of Object.entries(named)) {
    assert.ok(VOICE[lang].wake.test(text), lang);
    assert.ok(!/capri|капри/.test(text.replace(VOICE[lang].wake, '')), `${lang}: her name stripped`);
  }
});

test('what she says out loud: no code, links or markdown', async () => {
  const { speakable } = await load('speak.js');
  assert.strictEqual(speakable('**Preem**! See `npm test` at https://x.dev\n```js\nlet a\n```\nDone [[open: Spotify]]'), 'Preem! See npm test at Done');
});
