'use strict';

// Her ears (a hidden window, main/ears.js): the microphone into Vosk, offline speech recognition
// running right here, nothing sent anywhere. Two recognizers hear the same sound: one for whole
// sentences, one that only knows her name (and "something else"), much quicker and surer to catch
// "Capri" than the first. What they hear goes to main.js, which hands it to her (listen.js).
//
//   { type: 'ready' }                    listening
//   { type: 'wake' }                     her name, just now, in what you're saying
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

// Silence costs nothing: sound only goes to the recognizers when it's louder than the room
// (its noise floor, followed as it changes), and for a moment after, so they hear the sentence end.
const HANGOVER_MS = 1300;
let floor = 0;
let loudAt = 0;
let quietChunk = null; // the chunk just before a sound starts: its first syllable is often in it
let spoke = false;     // something louder than the room since the last sentence ended
let open = false;      // the recognizers are being fed (a sentence may be going on)

function loud(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / samples.length);
  // the floor sinks fast to quiet and creeps up slowly, so speech doesn't become "the room"
  floor = floor === 0 ? rms : rms < floor ? floor * 0.7 + rms * 0.3 : floor * 1.02;
  return rms > Math.max(0.006, floor * 2.2);
}

async function start({ modelUrl, words, sentences = true }) {
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
  // her name, always; whole sentences only without Whisper (it makes them out far better, from
  // the sound of them: then this one recognizer also says when a sentence ends)
  wake = new model.KaldiRecognizer(ctx.sampleRate, JSON.stringify([...words, '[unk]']));
  full = sentences ? new model.KaldiRecognizer(ctx.sampleRate) : null;

  const named = (text) => {
    if (!wakeHeard && mentions(text)) {
      wakeHeard = true;
      link.emit({ type: 'wake' });
    }
  };
  // A sentence just ended: what was said (its text, without Whisper), and its sound when it's
  // for her. Anything else is dropped right here.
  const ended = (text) => {
    const heard = wakeHeard || mentions(text);
    wakeHeard = false;
    const audio = take();
    // nothing said since the last one (a recognizer closing a sentence already closed): Whisper
    // would make words up out of the silence
    if (!spoke) return;
    spoke = false;
    // (only a real sentence's sound: what was kept is emptied while she talks)
    const forHer = (heard || Date.now() < armedUntil) && audio.length >= RATE / 4;
    if (forHer) link.emit({ type: 'final', text, wake: heard, audio });
    else if (text) link.emit({ type: 'final', text, wake: heard });
  };

  wake.on('partialresult', (m) => named(m.result.partial));
  wake.on('result', (m) => {
    named(m.result.text);
    if (!full) ended('');
  });
  if (full) {
    // the name recognizer often settles a beat after the sentence one: give it that beat
    full.on('result', (m) => setTimeout(() => ended((m.result.text || '').trim()), 250));
  }

  const feed = (buffer) => {
    try {
      full?.acceptWaveformFloat(buffer, RATE);
      wake.acceptWaveformFloat(buffer, RATE);
    } catch {
      // a chunk lost, the next one will do
    }
  };
  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (e) => {
    if (paused) return;
    const samples = e.inputBuffer.getChannelData(0).slice();
    keep(samples);
    const now = Date.now();
    if (loud(samples)) {
      if (!open && quietChunk) feed(quietChunk);
      loudAt = now;
      spoke = true;
    }
    if (now - loudAt <= HANGOVER_MS) {
      feed(samples);
      open = true;
    } else {
      // quiet long enough: the sentence is over, whether or not the recognizers have said so
      if (open) {
        full?.retrieveFinalResult();
        wake.retrieveFinalResult();
        open = false;
      }
      quietChunk = samples;
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
  floor = 0;
  loudAt = 0;
  quietChunk = null;
  spoke = false;
  open = false;
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
