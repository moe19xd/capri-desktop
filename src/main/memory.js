'use strict';

// Her big models (Whisper, her voice) live in native memory that only goes back to Windows once
// the objects holding it are collected: models.js-style modules drop their reference when idle,
// then ask for a collection here.

const v8 = require('node:v8');
const vm = require('node:vm');

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');

// A little later: whatever was still using it (a last decode) is done by then.
function release() {
  setTimeout(() => {
    gc();
    gc();
  }, 500).unref();
}

// Calls unload() once `use()` hasn't been called for `ms`; returns use().
function idle(ms, unload) {
  let last = 0;
  let timer = null;
  const check = () => {
    if (Date.now() - last < ms) return;
    clearInterval(timer);
    timer = null;
    unload();
    release();
  };
  return () => {
    last = Date.now();
    if (!timer) {
      timer = setInterval(check, Math.min(ms, 30000));
      timer.unref();
    }
  };
}

// how long her big models stay loaded unused (CAPRI_MODEL_IDLE_MS: another wait, in ms)
const IDLE_MS = Number(process.env.CAPRI_MODEL_IDLE_MS) || 3 * 60 * 1000;

module.exports = { release, idle, IDLE_MS };
