'use strict';

// Her ears: offline speech recognition (Vosk) in a hidden window of their own (src/ears), and the
// voice models it needs, one per language she speaks, fetched once into her folder.
// Nothing you say leaves your PC: the model runs right there, on your microphone.

const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { app, BrowserWindow, ipcMain, net } = require('electron');

// Small Vosk models (Apache 2.0, Alpha Cephei), packed the way her ears read them by the
// vosk-browser project, which hosts them
const MODELS = {
  en: 'vosk-model-small-en-us-0.15',
  fr: 'vosk-model-small-fr-pguyot-0.3',
  es: 'vosk-model-small-es-0.3',
  pt: 'vosk-model-small-pt-0.3',
  ru: 'vosk-model-small-ru-0.4',
};
const SIZES = { en: 41e6, fr: 46e6, es: 34e6, pt: 32e6, ru: 41e6 }; // roughly, for her line before it starts
// CAPRI_VOICE_URL: another place to fetch them from (a mirror), ending with /
const BASE = process.env.CAPRI_VOICE_URL || 'https://ccoreilly.github.io/vosk-browser/models/';
// her name, as each model spells it
const WAKE = { ru: ['капри'] };

const dir = () => path.join(app.getPath('userData'), 'voice');
const fileName = (lang) => `${MODELS[lang] || MODELS.en}.tar.gz`;
const modelFile = (lang) => path.join(dir(), fileName(lang));

// { installed, size }: is this language's model on this PC
function status(lang) {
  let size = 0;
  try {
    size = fs.statSync(modelFile(lang)).size;
  } catch {
    // not fetched yet
  }
  return { lang, installed: size > 1e6, size, expected: SIZES[lang] || SIZES.en };
}

// Fetches a language's model; onProgress({ done, total }) as it comes.
async function download(lang, onProgress, signal) {
  fs.mkdirSync(dir(), { recursive: true });
  const res = await net.fetch(BASE + fileName(lang), { signal });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || SIZES[lang] || 0;
  const part = `${modelFile(lang)}.part`;
  const out = fs.createWriteStream(part);
  let done = 0;
  try {
    for await (const chunk of res.body) {
      done += chunk.length;
      if (!out.write(chunk)) await once(out, 'drain');
      onProgress?.({ done, total });
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    // a gzip archive of a few dozen MB, not an error page
    const head = Buffer.alloc(2);
    const fd = fs.openSync(part, 'r');
    fs.readSync(fd, head, 0, 2, 0);
    fs.closeSync(fd);
    if (head[0] !== 0x1f || head[1] !== 0x8b || done < 5e6) throw new Error('that was not a voice model');
    fs.renameSync(part, modelFile(lang));
  } catch (err) {
    out.destroy();
    fs.rmSync(part, { force: true });
    throw err;
  }
}

let win = null;
let lang = 'en';
let handler = null;

function control(msg) {
  if (win && !win.isDestroyed()) win.webContents.send('ears:control', msg);
}

function begin() {
  control({ action: 'start', modelUrl: `capri://app/voice-models/${fileName(lang)}`, words: WAKE[lang] || ['capri'] });
}

// Starts listening in that language (again, if it changed); onEvent(msg) gets what the page says.
function start(language, onEvent, { dev = false } = {}) {
  handler = onEvent;
  const changed = language !== lang;
  lang = MODELS[language] ? language : 'en';
  if (win && !win.isDestroyed()) {
    if (changed) begin();
    return;
  }
  win = new BrowserWindow({
    show: false,
    width: 320,
    height: 200,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'ears', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.loadURL('capri://app/src/ears/ears.html');
  win.on('closed', () => { win = null; });
  if (dev) {
    win.webContents.on('console-message', (e) => console.log(`[ears:${e.level}] ${e.message}`));
  }
}

function stop() {
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
}

// while she talks, she doesn't listen (she'd hear herself)
function pause(on) {
  control({ action: 'pause', on: Boolean(on) });
}

const listening = () => Boolean(win && !win.isDestroyed());
const isEars = (contents) => Boolean(win && !win.isDestroyed() && contents === win.webContents);

function init() {
  ipcMain.on('ears:event', (e, msg) => {
    if (!isEars(e.sender) || !msg || typeof msg !== 'object') return;
    if (msg.type === 'loaded') begin();
    else handler?.(msg);
  });
}

module.exports = { MODELS, dir, status, download, start, stop, pause, listening, isEars, init };
