'use strict';

// Her skills (src/renderer/js/skills.js): what she makes of what you say or type.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'src', 'renderer', 'js', 'skills.js')).href);
const MIN = 60000;

test('reminders and timers, in each language', async () => {
  const { parse } = await load();
  const cases = [
    ['en', 'Remind me in 20 minutes to check the oven', 20 * MIN, 'check the oven'],
    ['en', 'remind me to call mom in one hour', 60 * MIN, 'call mom'],
    ['en', 'set a timer for twenty five minutes', 25 * MIN, ''],
    ['en', 'timer 1 hour 30 minutes', 90 * MIN, ''],
    ['fr', 'Rappelle-moi dans 10 minutes de sortir le gâteau', 10 * MIN, 'sortir le gâteau'],
    ['fr', 'mets un minuteur de 5 min', 5 * MIN, ''],
    ['es', 'recuérdame en 15 minutos que llame a Ana', 15 * MIN, 'llame a ana'],
    ['pt', 'me lembra daqui a 2 horas de estudar', 120 * MIN, 'estudar'],
    ['ru', 'напомни через 30 минут выключить духовку', 30 * MIN, 'выключить духовку'],
  ];
  for (const [lang, text, ms, task] of cases) {
    const got = parse(text, lang);
    assert.strictEqual(got?.kind, 'reminder', `${lang}: ${text}`);
    assert.strictEqual(got.ms, ms, `${lang}: ${text}`);
    assert.strictEqual(got.task, task, `${lang}: ${text}`);
  }
});

test('sums, and sentences that only have numbers in them', async () => {
  const { parse } = await load();
  assert.deepStrictEqual(parse("What's 15% of 230?", 'en'), { kind: 'calc', value: 34.5 });
  assert.deepStrictEqual(parse('what is 12 times 7 plus 1', 'en'), { kind: 'calc', value: 85 });
  assert.deepStrictEqual(parse('calculate (2 + 3) * 4', 'en'), { kind: 'calc', value: 20 });
  assert.deepStrictEqual(parse('combien font 100 divisé par 8', 'fr'), { kind: 'calc', value: 12.5 });
  assert.deepStrictEqual(parse('сколько будет 6 умножить на 7', 'ru'), { kind: 'calc', value: 42 });
  assert.strictEqual(parse('I have 3 cats and 2 dogs', 'en'), null);
  assert.strictEqual(parse('play song 2', 'en'), null);
});

test('searches, the clipboard, cancelling', async () => {
  const { parse } = await load();
  assert.deepStrictEqual(parse('search for cyberpunk edgerunners season 2', 'en'), { kind: 'search', query: 'cyberpunk edgerunners season 2', site: 'web' });
  assert.deepStrictEqual(parse('look up lofi beats on youtube', 'en'), { kind: 'search', query: 'lofi beats', site: 'youtube' });
  assert.deepStrictEqual(parse('cherche recette crêpes sur youtube', 'fr'), { kind: 'search', query: 'recette crêpes', site: 'youtube' });
  assert.deepStrictEqual(parse('summarize what I copied', 'en'), { kind: 'clipboard' });
  assert.deepStrictEqual(parse('traduis mon presse-papiers en anglais', 'fr'), { kind: 'clipboard' });
  assert.deepStrictEqual(parse('cancel my reminders', 'en'), { kind: 'cancel' });
  assert.strictEqual(parse('how are you doing today', 'en'), null);
});

test('the calculator never runs code', async () => {
  const { calculate } = await load();
  assert.strictEqual(calculate('2+2*3'), 8);
  assert.strictEqual(calculate('2^10'), 1024);
  assert.strictEqual(calculate('process.exit()'), null);
  assert.strictEqual(calculate('1/0'), null);
});
