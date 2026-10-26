'use strict';

// All her ears' page can do: tell main.js what it heard, and be told to start, pause or stop.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ears', {
  emit: (msg) => ipcRenderer.send('ears:event', msg),
  onControl: (fn) => ipcRenderer.on('ears:control', (_e, msg) => fn(msg)),
});
