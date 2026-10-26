'use strict';

// Her voice out loud: natural voices (Piper, through sherpa-onnx, offline), fetched once into her
// voice folder. What she says is made here and sent to the overlay as samples; speak.js turns it
// into a construct's voice (construct.js) and plays it. Windows' own voices stay as the fallback.

const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { execFile } = require('node:child_process');
const { net } = require('electron');

// Female voices, by language: the first of each is the one she starts with
const VOICES = [
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
const folder = (id) => path.join(dir, `vits-piper-${id}`);
const find = (id) => VOICES.find((v) => v.id === id) || null;

function installed(id) {
  try {
    return fs.readdirSync(folder(id)).some((f) => f.endsWith('.onnx')) && fs.existsSync(path.join(folder(id), 'espeak-ng-data'));
  } catch {
    return false;
  }
}

// [{ id, lang, label, installed, size }] for her language (all of them when lang is null)
function list(lang = null) {
  return VOICES.filter((v) => !lang || v.lang === lang).map((v) => ({ ...v, size: v.size || SIZE, installed: installed(v.id) }));
}

// The voice she uses for that language: the one picked if it's here and fits, else the first one
// here, else null (Windows' voices then).
function current(lang, picked) {
  const mine = list(lang).filter((v) => v.installed);
  return mine.find((v) => v.id === picked) || mine[0] || null;
}

function untar(archive, into) {
  return new Promise((resolve, reject) => {
    execFile('tar', ['-xjf', archive, '-C', into], { windowsHide: true, timeout: 10 * 60 * 1000 },
      (err, _out, stderr) => (err ? reject(new Error(String(stderr || err.message).trim().slice(0, 200))) : resolve()));
  });
}

// Fetches and unpacks a voice; onProgress({ done, total, unpacking }).
async function download(id, onProgress, signal) {
  const voice = find(id);
  if (!voice) throw new Error('unknown voice');
  fs.mkdirSync(dir, { recursive: true });
  const archive = path.join(dir, `vits-piper-${id}.tar.bz2`);
  const part = `${archive}.part`;
  const res = await net.fetch(`${BASE}vits-piper-${id}.tar.bz2`, { signal });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || voice.size || SIZE;
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
    if (!installed(id)) throw new Error('the archive had no voice in it');
  } catch (err) {
    out.destroy();
    fs.rmSync(part, { force: true });
    throw err;
  } finally {
    fs.rmSync(archive, { force: true });
  }
}

let engine = null; // { id, promise }

function load(id) {
  if (engine?.id === id) return engine.promise;
  const sherpa = require('sherpa-onnx-node');
  const d = folder(id);
  const model = fs.readdirSync(d).find((f) => f.endsWith('.onnx'));
  const promise = sherpa.OfflineTts.createAsync({
    model: {
      vits: { model: path.join(d, model), tokens: path.join(d, 'tokens.txt'), dataDir: path.join(d, 'espeak-ng-data') },
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
    },
    maxNumSentences: 2,
  });
  engine = { id, promise };
  promise.catch(() => { if (engine?.promise === promise) engine = null; });
  return promise;
}

// Her line in that voice: { samples: Float32Array, sampleRate }. speed > 1 is quicker.
async function say(id, text, speed = 1) {
  const tts = await load(id);
  const audio = await tts.generateAsync({ text, sid: 0, speed, enableExternalBuffer: false });
  return { samples: audio.samples, sampleRate: audio.sampleRate };
}

function warm(id) {
  if (id && installed(id)) load(id).catch(() => {});
}

function unload() {
  engine = null;
}

function init(voiceDir) {
  dir = voiceDir;
}

module.exports = { init, list, current, download, say, warm, unload, installed };
