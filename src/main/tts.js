'use strict';

// Her voice out loud: natural voices (through sherpa-onnx, offline), fetched once into her voice
// folder: Kokoro (one model, many voices, the most expressive) and Piper (one model per voice,
// lighter and quicker). What she says is made here and sent to the overlay as samples; speak.js turns it
// into a construct's voice (construct.js) and plays it. Windows' own voices stay as the fallback.

const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { net } = require('electron');
const memory = require('./memory');
const { unpack } = require('./unpack');

// Female voices, by language: the first one fetched of each is the one she starts with.
// Kokoro's are speakers (sid) of one model; accent/espeak: how it reads the words.
const KOKORO = 'kokoro-int8-multi-lang-v1_0';
const KOKORO_SIZE = 132e6;
const VOICES = [
  { id: 'kokoro:bf_alice', engine: 'kokoro', sid: 20, lang: 'en', accent: 'gb', label: 'Alice (UK, expressive)' },
  { id: 'kokoro:bf_lily', engine: 'kokoro', sid: 23, lang: 'en', accent: 'gb', label: 'Lily (UK, expressive)' },
  { id: 'kokoro:af_jessica', engine: 'kokoro', sid: 4, lang: 'en', accent: 'us', label: 'Jessica (US, expressive)' },
  { id: 'kokoro:af_heart', engine: 'kokoro', sid: 3, lang: 'en', accent: 'us', label: 'Heart (US, expressive)' },
  { id: 'kokoro:ff_siwis', engine: 'kokoro', sid: 30, lang: 'fr', espeak: 'fr', label: 'Siwis (FR, expressive)' },
  { id: 'kokoro:ef_dora', engine: 'kokoro', sid: 28, lang: 'es', espeak: 'es', label: 'Dora (ES, expressive)' },
  { id: 'kokoro:pf_dora', engine: 'kokoro', sid: 42, lang: 'pt', espeak: 'pt-br', label: 'Dora (BR, expressive)' },
  { id: 'en_GB-cori-medium', lang: 'en', label: 'Cori (UK)' },
  { id: 'en_GB-jenny_dioco-medium', lang: 'en', label: 'Jenny (UK)' },
  { id: 'en_GB-alba-medium', lang: 'en', label: 'Alba (Scottish)' },
  { id: 'en_US-amy-medium', lang: 'en', label: 'Amy (US)' },
  { id: 'en_US-hfc_female-medium', lang: 'en', label: 'HFC (US)' },
  { id: 'fr_FR-siwis-medium', lang: 'fr', label: 'Siwis (FR)' },
  { id: 'es_AR-daniela-high', lang: 'es', label: 'Daniela (AR)', size: 116e6 },
  { id: 'ru_RU-irina-medium', lang: 'ru', label: 'Irina (RU)' },
];
const SIZE = 67e6;
// CAPRI_TTS_URL: another place to fetch them from (a mirror), ending with /
const BASE = process.env.CAPRI_TTS_URL || 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/';

let dir = null; // her voice folder (ears.js), set by init
const find = (id) => VOICES.find((v) => v.id === id) || null;
const archiveName = (voice) => (voice.engine === 'kokoro' ? KOKORO : `vits-piper-${voice.id}`);
const folder = (id) => path.join(dir, archiveName(find(id) || { id }));
const sizeOf = (voice) => (voice.engine === 'kokoro' ? KOKORO_SIZE : voice.size || SIZE);

function installed(id) {
  try {
    const files = fs.readdirSync(folder(id));
    return files.some((f) => f.endsWith('.onnx')) && files.includes('espeak-ng-data');
  } catch {
    return false;
  }
}

// [{ id, lang, label, installed, size }] for her language (all of them when lang is null); Kokoro's
// voices share one download: once one is here, they all are
function list(lang = null) {
  return VOICES.filter((v) => !lang || v.lang === lang).map((v) => ({ ...v, size: sizeOf(v), installed: installed(v.id) }));
}

// The voice she uses for that language: the one picked if it's here and fits, else the first one
// here, else null (Windows' voices then).
function current(lang, picked) {
  const mine = list(lang).filter((v) => v.installed);
  return mine.find((v) => v.id === picked) || mine[0] || null;
}

const untar = (archive, into, onProgress) => unpack(archive, into, { onProgress });

// Fetches and unpacks a voice; onProgress({ done, total, unpacking }).
async function download(id, onProgress, signal) {
  const voice = find(id);
  if (!voice) throw new Error('unknown voice');
  fs.mkdirSync(dir, { recursive: true });
  const name = archiveName(voice);
  const archive = path.join(dir, `${name}.tar.bz2`);
  const part = `${archive}.part`;
  const res = await net.fetch(`${BASE}${name}.tar.bz2`, { signal });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || sizeOf(voice);
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
    if (!installed(id)) throw new Error('the archive had no voice in it');
  } catch (err) {
    out.destroy();
    fs.rmSync(part, { force: true });
    throw err;
  } finally {
    fs.rmSync(archive, { force: true });
  }
}

let engine = null; // { key, promise }: one model loaded at a time
// 70 to 250 MB loaded: let go of it when she's been quiet a few minutes
const used = memory.idle(memory.IDLE_MS, () => { engine = null; });
const THREADS = Math.max(2, Math.min(6, require('node:os').cpus().length - 2));

// What the model needs to read this voice's words: Kokoro reads English with its lexicons (one
// accent at a time) and other languages through espeak.
function modelConfig(voice) {
  const d = folder(voice.id);
  if (voice.engine === 'kokoro') {
    const kokoro = {
      model: path.join(d, 'model.int8.onnx'),
      voices: path.join(d, 'voices.bin'),
      tokens: path.join(d, 'tokens.txt'),
      dataDir: path.join(d, 'espeak-ng-data'),
      ...(voice.accent
        // the accent is in the lexicon; 'en-gb' as lang makes it fail to read anything, 'en-us' is right
        ? { lexicon: path.join(d, `lexicon-${voice.accent === 'gb' ? 'gb' : 'us'}-en.txt`), lang: 'en-us' }
        : { lang: voice.espeak }),
    };
    return { key: `kokoro:${voice.accent || voice.espeak}`, config: { kokoro } };
  }
  const model = fs.readdirSync(d).find((f) => f.endsWith('.onnx'));
  return {
    key: voice.id,
    config: { vits: { model: path.join(d, model), tokens: path.join(d, 'tokens.txt'), dataDir: path.join(d, 'espeak-ng-data') } },
  };
}

function load(id) {
  used();
  const voice = find(id);
  const { key, config } = modelConfig(voice);
  if (engine?.key === key) return engine.promise;
  const sherpa = require('sherpa-onnx-node');
  const promise = sherpa.OfflineTts.createAsync({
    model: { ...config, numThreads: THREADS, provider: 'cpu', debug: 0 },
    maxNumSentences: 1,
  });
  engine = { key, promise };
  promise.catch(() => { if (engine?.promise === promise) engine = null; });
  return promise;
}

// Her line in that voice: { samples: Float32Array, sampleRate }. speed > 1 is quicker.
async function say(id, text, speed = 1) {
  const tts = await load(id);
  const audio = await tts.generateAsync({ text, sid: find(id)?.sid ?? 0, speed, enableExternalBuffer: false });
  return { samples: audio.samples, sampleRate: audio.sampleRate };
}

function warm(id) {
  if (id && installed(id)) load(id).catch(() => {});
}

function unload() {
  if (!engine) return;
  engine = null;
  memory.release();
}

function init(voiceDir) {
  dir = voiceDir;
}

module.exports = { init, list, current, download, say, warm, unload, installed };
