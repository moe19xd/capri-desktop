'use strict';

// Her ears (a hidden window, main/ears.js): the microphone into Vosk, offline speech recognition
// running right here, nothing sent anywhere. Two recognizers hear the same sound: one for whole
// sentences, one that only knows her name (and "something else"), much quicker and surer to catch
// "Capri" than the first. What they hear goes to main.js, which hands it to her (listen.js).
//
//   { type: 'ready' }                    listening
//   { type: 'wake' }                     her name, just now, in what you're saying
//   { type: 'partial', text }            what you're saying, so far
//   { type: 'final', text, wake }        what you said (wake: her name was in it)
//   { type: 'error', error }

const link = window.ears;

let model = null;
let full = null;
let wake = null;
let audio = null;   // { ctx, stream, node }
let paused = false; // while she talks: she'd hear herself
let wakeHeard = false;
let wakeWords = [];

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
  const ctx = new AudioContext({ sampleRate: 16000 });
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
      if (text) link.emit({ type: 'final', text, wake: heard });
    }, 250);
  });

  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (e) => {
    if (paused) return;
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
}

link.onControl((msg) => {
  if (msg.action === 'start') start(msg);
  else if (msg.action === 'stop') stop();
  else if (msg.action === 'pause') {
    paused = Boolean(msg.on);
    // what was half heard before she spoke doesn't run into what comes after
    if (paused) {
      full?.retrieveFinalResult();
      wakeHeard = false;
    }
  }
});

link.emit({ type: 'loaded' });
