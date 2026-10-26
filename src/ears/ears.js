'use strict';

// Her ears (a hidden window, main/ears.js): the microphone into Vosk, offline speech recognition
// running right here, nothing sent anywhere. Two recognizers hear the same sound: one for whole
// sentences, one that only knows her name (and "something else"), much quicker and surer to catch
// "Capri" than the first. What they hear goes to main.js, which hands it to her (listen.js).
//
//   { type: 'ready' }                    listening
//   { type: 'wake' }                     her name, just now, in what you're saying
//   { type: 'partial', text }            what you're saying, so far
//   { type: 'final', text, wake, audio } what you said (wake: her name was in it); audio: the sound
//                                        of it (16 kHz) when it's for her, for Whisper (main/whisper.js)
//   { type: 'error', error }

const link = window.ears;

let model = null;
let full = null;
let wake = null;
let audio = null;   // { ctx, stream, node }
let paused = false; // while she talks: she'd hear herself
let wakeHeard = false;
let wakeWords = [];
let armedUntil = 0; // she's waiting for what you say next (her name alone, Ctrl+Alt+V): keep its sound
// the sound of what's being said since the last sentence ended, a little before it too
const RATE = 16000;
const PRE_ROLL = RATE * 0.6;
const MAX_UTTERANCE = RATE * 20;
let chunks = [];
let held = 0;

function keep(samples) {
  chunks.push(samples);
  held += samples.length;
  while (held - chunks[0].length > MAX_UTTERANCE) held -= chunks.shift().length;
}

// what was kept, as one buffer; the next sentence starts from the last bit of it
function take() {
  const all = new Float32Array(held);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  const tail = all.slice(Math.max(0, all.length - PRE_ROLL));
  chunks = [tail];
  held = tail.length;
  return all;
}

const mentions = (text) => wakeWords.some((w) => ` ${text} `.includes(` ${w} `));

async function start({ modelUrl, words }) {
  stop();
  wakeWords = words;
  try {
    // the model is unpacked into this page's storage the first time (a few seconds), then kept there
    model = await Vosk.createModel(modelUrl);
    model.setLogLevel(-1);
  } catch (err) {
    link.emit({ type: 'error', error: 'model', detail: String(err?.message || err || 'model failed') });
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch (err) {
    link.emit({ type: 'error', error: 'mic', detail: String(err?.message || err) });
    return;
  }
  // 16 kHz is what the model works at: less to send it, nothing lost
  const ctx = new AudioContext({ sampleRate: RATE });
  full = new model.KaldiRecognizer(ctx.sampleRate);
  wake = new model.KaldiRecognizer(ctx.sampleRate, JSON.stringify([...words, '[unk]']));

  wake.on('partialresult', (m) => {
    if (!wakeHeard && mentions(m.result.partial)) {
      wakeHeard = true;
      link.emit({ type: 'wake' });
    }
  });
  wake.on('result', (m) => {
    if (!wakeHeard && mentions(m.result.text)) {
      wakeHeard = true;
      link.emit({ type: 'wake' });
    }
  });
  full.on('partialresult', (m) => {
    if (m.result.partial) link.emit({ type: 'partial', text: m.result.partial });
  });
  full.on('result', (m) => {
    const text = (m.result.text || '').trim();
    // the name recognizer often settles a beat after the sentence one: give it that beat
    setTimeout(() => {
      const heard = wakeHeard || mentions(text);
      wakeHeard = false;
      const audio = take();
      if (!text) return;
      // the sound goes along only when it's for her: anything else is dropped right here
      const forHer = heard || Date.now() < armedUntil;
      link.emit({ type: 'final', text, wake: heard, ...(forHer && { audio }) });
    }, 250);
  });

  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (e) => {
    if (paused) return;
    keep(e.inputBuffer.getChannelData(0).slice());
    try {
      full.acceptWaveform(e.inputBuffer);
      wake.acceptWaveform(e.inputBuffer);
    } catch {
      // a chunk lost, the next one will do
    }
  };
  // a processor only runs plugged into the output; nothing is written to it, so it stays silent
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  audio = { ctx, stream, node };
  link.emit({ type: 'ready' });
}

function stop() {
  if (audio) {
    audio.node.disconnect();
    audio.stream.getTracks().forEach((t) => t.stop());
    audio.ctx.close().catch(() => {});
    audio = null;
  }
  model?.terminate();
  model = full = wake = null;
  wakeHeard = false;
  chunks = [];
  held = 0;
}

link.onControl((msg) => {
  if (msg.action === 'start') start(msg);
  else if (msg.action === 'stop') stop();
  else if (msg.action === 'arm') armedUntil = Date.now() + (msg.ms || 0);
  else if (msg.action === 'pause') {
    paused = Boolean(msg.on);
    // what was half heard before she spoke doesn't run into what comes after
    if (paused) {
      full?.retrieveFinalResult();
      wakeHeard = false;
      chunks = [];
      held = 0;
    }
  }
});

link.emit({ type: 'loaded' });
