'use strict';

// Her better hearing: once her ears (ears.js) have caught her name and the end of your sentence,
// its sound goes through Whisper (sherpa-onnx, native, offline), which makes out what you said far
// better than the small model that listens for her name. Whisper base, the int8 one: about 160 MB
// once unpacked, every language she speaks, half a second or so a sentence on a recent CPU.

const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { net } = require('electron');
const memory = require('./memory');
const { unpack } = require('./unpack');

const NAME = 'sherpa-onnx-whisper-base';
const FILES = ['base-encoder.int8.onnx', 'base-decoder.int8.onnx', 'base-tokens.txt'];
const SIZE = 207e6; // the archive (it also holds the full-size models, left packed)
// CAPRI_WHISPER_URL: another place to fetch it from (a mirror), ending with /
const BASE = process.env.CAPRI_WHISPER_URL || 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/';

let dir = null; // her voice folder (ears.js), set by init
const modelDir = () => path.join(dir, NAME);

function installed() {
  return FILES.every((f) => {
    try {
      return fs.statSync(path.join(modelDir(), f)).size > 0;
    } catch {
      return false;
    }
  });
}

const status = () => ({ installed: installed(), expected: SIZE });

// only the int8 models come out of it (the full-size ones stay packed, and go with the archive)
const untar = (archive, into, onProgress) => unpack(archive, into, { keep: (p) => FILES.some((f) => p.endsWith(`${NAME}/${f}`)), onProgress });

// Fetches and unpacks it; onProgress({ done, total, unpacking }).
async function download(onProgress, signal) {
  fs.mkdirSync(dir, { recursive: true });
  const archive = path.join(dir, `${NAME}.tar.bz2`);
  const part = `${archive}.part`;
  const res = await net.fetch(`${BASE}${NAME}.tar.bz2`, { signal });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || SIZE;
  const out = fs.createWriteStream(part);
  let done = 0;
  try {
    for await (const chunk of res.body) {
      done += chunk.length;
      if (!out.write(chunk)) await once(out, 'drain');
      onProgress?.({ done, total });
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    fs.renameSync(part, archive);
    onProgress?.({ done, total, unpacking: 0 });
    await untar(archive, dir, (unpacking) => onProgress?.({ done, total, unpacking }));
    if (!installed()) throw new Error('the archive had no Whisper model in it');
  } catch (err) {
    out.destroy();
    fs.rmSync(part, { force: true });
    throw err;
  } finally {
    fs.rmSync(archive, { force: true });
  }
}

let recognizer = null; // { lang, promise }
let failed = null;     // why it couldn't load, once (not retried every sentence)
// about 300 MB loaded: let go of it after a few minutes without anything said to her (her name
// loads it again, before the end of your sentence)
const used = memory.idle(memory.IDLE_MS, () => { recognizer = null; });

// Loads it for that language (her language: Whisper hears it best told which one).
function load(lang) {
  used();
  if (recognizer?.lang === lang) return recognizer.promise;
  const sherpa = require('sherpa-onnx-node');
  const d = modelDir();
  const promise = sherpa.OfflineRecognizer.createAsync({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      whisper: { encoder: path.join(d, FILES[0]), decoder: path.join(d, FILES[1]), language: lang, task: 'transcribe' },
      tokens: path.join(d, FILES[2]),
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
    },
  });
  recognizer = { lang, promise };
  promise.catch(() => { if (recognizer?.promise === promise) recognizer = null; });
  return promise;
}

// What was said in that sound (16 kHz samples), or null if Whisper isn't here or can't load.
const MIN_SAMPLES = 4000; // a quarter of a second: an empty sound crashes the native side

async function transcribe(samples, lang) {
  if (!installed() || failed || !(samples?.length >= MIN_SAMPLES)) return null;
  let rec;
  try {
    rec = await load(lang);
  } catch (err) {
    failed = err.message;
    console.error('[capri] Whisper could not load:', failed);
    return null;
  }
  const stream = rec.createStream();
  stream.acceptWaveform({ sampleRate: 16000, samples });
  const result = await rec.decodeAsync(stream);
  return String(result.text || '').trim();
}

// Loads it ahead of the first sentence (a second or two), so that one isn't slower.
function warm(lang) {
  if (installed() && !failed) load(lang).catch(() => {});
}

function unload() {
  if (!recognizer) return;
  recognizer = null; // the native side is freed with it
  memory.release();
}

function init(voiceDir) {
  dir = voiceDir;
}

module.exports = { init, status, download, transcribe, warm, unload, dir: modelDir };
