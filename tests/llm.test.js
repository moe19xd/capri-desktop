'use strict';

// A model her provider retired (Gemini answers 404 "no longer available"): which one she moves to.

const { test } = require('node:test');
const assert = require('node:assert');
const { replacement } = require('../src/main/llm');

const gone = Object.assign(new Error('This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.0-flash for the latest features.'), { status: 404 });

test('the one the provider suggests, when she has it', () => {
  assert.strictEqual(replacement(gone, 'models/gemini-2.5-flash', ['models/gemini-2.5-flash', 'models/gemini-2.5-pro', 'models/gemini-3.0-flash']), 'models/gemini-3.0-flash');
});

test('else the next one on the list', () => {
  assert.strictEqual(replacement(gone, 'models/gemini-2.5-flash', ['models/gemini-2.5-flash', 'models/gemini-2.5-pro']), 'models/gemini-2.5-pro');
});

test('not for other errors, nor with nothing else to try', () => {
  assert.strictEqual(replacement(Object.assign(new Error('bad key'), { status: 401 }), 'a', ['a', 'b']), null);
  assert.strictEqual(replacement(gone, 'models/gemini-2.5-flash', ['models/gemini-2.5-flash']), null);
});
