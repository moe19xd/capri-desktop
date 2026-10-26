'use strict';

// Her better hearing: once her ears (ears.js) have caught her name and the end of your sentence,
// its sound goes through Whisper (sherpa-onnx, native, offline), which makes out what you said far
// better than the small model that listens for her name. Whisper base, the int8 one: about 160 MB
// once unpacked, every language she speaks, half a second or so a sentence on a recent CPU.

const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { execFile } = require('node:child_process');
const { net } = require('electron');

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

// Windows 10 and 11 come with tar (bsdtar), which reads .tar.bz2: only the int8 models come out.
function untar(archive, into) {
  return new Promise((resolve, reject) => {
    execFile('tar', ['-xjf', archive, '-C', into, ...FILES.map((f) => `${NAME}/${f}`)], { windowsHide: true, timeout: 10 * 60 * 1000 },
      (err, _out, stderr) => (err ? reject(new Error(String(stderr || err.message).trim().slice(0, 200))) : resolve()));
  });
}

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
    onProgress?.({ done, total, unpacking: true });
    await untar(archive, dir);
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

// Loads it for that language (her language: Whisper hears it best told which one).
function load(lang) {
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
async function transcribe(samples, lang) {
  if (!installed() || failed) return null;
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
  recognizer = null; // the native side is freed with it
}

function init(voiceDir) {
  dir = voiceDir;
}

module.exports = { init, status, download, transcribe, warm, unload, dir: modelDir };
