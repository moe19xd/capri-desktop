'use strict';

// Her updates: the installer GitHub builds on every push (the "latest" release of her repo, private:
// read with a read-only token you give her once, kept encrypted with your Windows account).
// Checked a little after she starts and every few hours; fetched and run only when you say so.
// Installed builds on Windows only (from the source, `git pull` is how she updates).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { app, net } = require('electron');

const REPO = require('../../package.json').updateRepo || 'moe19xd/capri-desktop';
const API = `https://api.github.com/repos/${REPO}`;
const ASSET = /^Capri-Setup-(\d+)\.(\d+)\.(\d+)\.exe$/;
// where to make a token: fine-grained, this repo only, Contents read-only
const TOKEN_PAGE = 'https://github.com/settings/personal-access-tokens/new';

const supported = () => app.isPackaged && process.platform === 'win32';

// a.b.c compared: > 0 when a is newer
function newer(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

const version = () => app.getVersion().split('.').map((n) => Number(n) || 0);

function headers(token, accept = 'application/vnd.github+json') {
  return { accept, authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'capri-desktop' };
}

// The newest installer, if it's newer than her: { version, asset: { id, name, size } } | null.
// Throws with { code: 'notoken' | 'badtoken' } when the token is missing or doesn't open the repo.
async function check(token) {
  if (!token) throw Object.assign(new Error('no token'), { code: 'notoken' });
  const res = await net.fetch(`${API}/releases/tags/latest`, { headers: headers(token) });
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw Object.assign(new Error(`GitHub said ${res.status}`), { code: 'badtoken' });
  }
  if (!res.ok) throw new Error(`GitHub said ${res.status}`);
  const release = await res.json();
  const asset = (release.assets || []).find((a) => ASSET.test(a.name));
  if (!asset) return null;
  const v = ASSET.exec(asset.name).slice(1, 4).map(Number);
  return newer(v, version()) > 0 ? { version: v.join('.'), asset: { id: asset.id, name: asset.name, size: asset.size } } : null;
}

// Downloads the installer (onProgress({ done, total })) and resolves with its path.
async function download(token, asset, onProgress, signal) {
  // GitHub answers with a redirect to its storage, which refuses our token: followed without it
  const first = await net.fetch(`${API}/releases/assets/${asset.id}`, {
    headers: headers(token, 'application/octet-stream'), redirect: 'manual', signal,
  });
  const res = first.status >= 300 && first.status < 400
    ? await net.fetch(first.headers.get('location'), { signal })
    : first;
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const file = path.join(os.tmpdir(), asset.name);
  const out = fs.createWriteStream(file);
  const total = Number(res.headers.get('content-length')) || asset.size || 0;
  let done = 0;
  try {
    for await (const chunk of res.body) {
      done += chunk.length;
      if (!out.write(chunk)) await once(out, 'drain');
      onProgress?.({ done, total });
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  } catch (err) {
    out.destroy();
    fs.rmSync(file, { force: true });
    throw err;
  }
  return file;
}

// Runs the installer quietly (it replaces her, keeps her settings and downloads) and quits; it
// starts her again when it's done.
function install(file) {
  spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 500);
}

module.exports = { supported, check, download, install, TOKEN_PAGE, REPO };
