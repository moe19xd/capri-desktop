'use strict';

// What she picks up about you on her own (chat.js learn()), with a fake model.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
const load = (file) => import(pathToFileURL(path.join(__dirname, '..', 'src', 'renderer', 'js', file)).href);

async function rig(answer, custom = {}) {
  const { Chat } = await load('chat.js');
  const saved = [];
  const asked = [];
  const host = {
    onChatDelta() {},
    chatSend: async (req) => { asked.push(req); return { ok: true, text: answer }; },
    setConfig: (patch) => saved.push(patch),
  };
  const chat = new Chat({ capri: {}, panel: {}, voice: {}, host, brain: { custom: { memories: [], learned: [], ...custom }, lang: 'en' } });
  chat.history = [{ role: 'user', content: 'I have a math exam on Friday, I\'m stressed' }, { role: 'assistant', content: 'You got this, choom.' }];
  return { chat, saved, asked };
}

test('new facts are kept, with the day she learned them', async () => {
  const { chat, saved, asked } = await rig('- has a math exam on Friday 31 October\n- feels stressed about it');
  await chat.learn();
  assert.strictEqual(asked.length, 1);
  assert.match(asked[0].messages[1].content, /math exam/);
  const { learned } = saved[0];
  assert.deepStrictEqual(learned.map((m) => m.fact), ['has a math exam on Friday 31 October', 'feels stressed about it']);
  assert.match(learned[0].at, /^\d{4}-\d{2}-\d{2}$/);
});

test('nothing new: nothing kept; what she knows already: not twice', async () => {
  let r = await rig('NONE');
  await r.chat.learn();
  assert.deepStrictEqual(r.saved, []);
  r = await rig('- has a math exam on Friday 31 October', { learned: [{ at: '2026-10-27', fact: 'Has a math exam on Friday 31 October' }] });
  await r.chat.learn();
  assert.deepStrictEqual(r.saved, []);
});

test('turned off in her menu: she doesn\'t look', async () => {
  const { chat, asked } = await rig('- something', { learn: false });
  await chat.learn();
  assert.strictEqual(asked.length, 0);
});
