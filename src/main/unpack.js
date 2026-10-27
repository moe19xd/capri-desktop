'use strict';

// Unpacking a downloaded .tar.bz2 (her voices, Whisper) in plain JavaScript: Windows' own tar
// can't read bzip2 without a bzip2 program next to it, which Windows doesn't have.

const fs = require('node:fs');
const { pipeline } = require('node:stream/promises');
const bunzip = require('unbzip2-stream');
const tar = require('tar');

// Unpacks `archive` into `into`; only the entries `keep(path)` accepts, when given.
// onProgress(fraction): how far into the archive it is.
async function unpack(archive, into, { keep = null, onProgress = null } = {}) {
  fs.mkdirSync(into, { recursive: true });
  const total = fs.statSync(archive).size;
  let read = 0;
  const input = fs.createReadStream(archive, { highWaterMark: 1 << 20 });
  if (onProgress) {
    input.on('data', (chunk) => {
      read += chunk.length;
      onProgress(read / total);
    });
  }
  await pipeline(input, bunzip(), tar.x({ cwd: into, ...(keep && { filter: (p) => keep(p) }) }));
}

module.exports = { unpack };
