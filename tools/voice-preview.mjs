// Hear her voices before picking one: each voice folder given says one of her lines, clean and as
// a construct (src/renderer/js/construct.js), into .wav files.
//
//   ELECTRON_RUN_AS_NODE=1 electron tools/voice-preview.mjs <out dir> <voice dir>...
//
// A voice dir is an unpacked sherpa-onnx Piper voice (vits-piper-*: the .onnx, tokens.txt,
// espeak-ng-data).

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { construct, speedFor, seedFor, LEVELS, PITCHES } from '../src/renderer/js/construct.js';

const require = createRequire(import.meta.url);
const sherpa = require('sherpa-onnx-node');

const LINE = 'Hey, choom. The net\'s been quiet. Too quiet. Want me to stir up some trouble?';
const STYLES = {
  clean: { pitch: PITCHES.natural, glitch: LEVELS.off, echo: LEVELS.off },
  construct: { pitch: PITCHES.higher, glitch: LEVELS.light, echo: LEVELS.light },
  glitchy: { pitch: PITCHES.higher, glitch: LEVELS.strong, echo: LEVELS.strong },
};

const [out, ...dirs] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
for (const dir of dirs) {
  const name = path.basename(dir).replace(/^vits-piper-/, '');
  const model = fs.readdirSync(dir).find((f) => f.endsWith('.onnx'));
  const tts = new sherpa.OfflineTts({
    model: { vits: { model: path.join(dir, model), tokens: path.join(dir, 'tokens.txt'), dataDir: path.join(dir, 'espeak-ng-data') }, numThreads: 2, debug: 0, provider: 'cpu' },
    maxNumSentences: 2,
  });
  for (const [style, fx] of Object.entries(STYLES)) {
    const audio = tts.generate({ text: LINE, sid: 0, speed: speedFor(1.05, fx.pitch), enableExternalBuffer: false });
    const samples = construct(audio.samples, audio.sampleRate, { ...fx, seed: seedFor(LINE) });
    const file = path.join(out, `${name}--${style}.wav`);
    sherpa.writeWave(file, { samples, sampleRate: audio.sampleRate });
    console.log(file);
  }
}
