# Capri desktop — notes for Claude

Electron desktop pet (Windows first): Capri from Cyberpunk: Edgerunners 2 lives on the desktop, narrates
Claude Code (hooks → local HTTP bridge), chats through a local/online LLM, and (this fork) listens and talks.
Fork of `mochiiwuff/capri-desktop` (remote `upstream`); ours is `moe19xd/capri-desktop` (`origin`), private
(the artwork isn't ours: never make it public). Code style: match the surrounding code — small modules,
comments in Capri's voice ("her ears", "she says"), no semicolon-free style, 2-space indent, 120 cols.

## Layout
- `src/main/` — main process. `main.js` (windows, tray menu, IPC, startup), `bridge.js` (127.0.0.1:47823,
  hooks POST /event; `--dev` adds /debug/* routes), `config.js` (defaults; every setting lives here),
  `labels.js` (tray menu, 5 languages: fr en es pt ru), `llm.js` (chat providers, retired-model fallback),
  `setup.js` (Ollama install/models), `apps.js`/`launch.js` (open/close apps, media keys),
  `windows.ps1`/`windows.js` (window positions, Windows only).
  Voice (ours): `ears.js` (hidden ears window + Vosk model download), `whisper.js` (sherpa-onnx Whisper base),
  `tts.js` (Kokoro + Piper voices), `memory.js` (idle unload + gc), `unpack.js` (tar.bz2 in JS).
- `src/ears/` — hidden sandboxed page running Vosk (WASM, needs unsafe-eval: kept out of the overlay).
- `src/renderer/js/` — overlay. `app.js` (wiring + `host.onCommand` switch), `capri.js`/`acting.js`/`sprite.js`
  (her body), `fx.js`, `panel.js` (speech bubble; `panel.say({kind, line, quote, actions, hold})`),
  `brain.js` (Claude events → lines), `chat.js` (LLM chat; `asked()`/`doNow()` = actions without a model),
  `lines.js` (her lines, 5 languages). Voice (ours): `listen.js` (wake word, commands, routing),
  `speak.js` (Speaker: Kokoro/Piper via IPC, sentence pipeline, Windows voices fallback),
  `construct.js` (pitch/glitch/echo DSP), `voicelines.js` (voice strings + command regexes, 5 languages).
- `src/preload.js` — the overlay's whole `window.host` API. New IPC = main handler + preload entry.
- `tests/` — `npm run test:hooks`, `test:voice`, `test:llm` (node --test, no Electron needed).
- `.github/workflows/build.yml` — every push to `main` builds `Capri-Setup-x.y.z.exe` on the `latest` release.

## Voice pipeline
mic → ears page: silence gate (RMS vs noise floor, 1.3 s hangover, forces end of sentence) → Vosk grammar
recognizer for "capri" (+ full recognizer only without Whisper) → `final` {text, wake, audio when for her} →
main: Whisper transcribes (loaded on `wake`, unloaded after 3 idle min) → overlay `listen.heard()`: acts only if
her name is in the first 3 words of the transcript (or she's armed by her name alone / Ctrl+Alt+V) → own
command / `chat.doNow` / chat → `Speaker.say` → main `tts:say` per sentence → construct.js → Web Audio.

## Pitfalls already hit (don't redo)
- Windows `tar` can't read .tar.bz2 (no bzip2): always `unpack.js`.
- sherpa-onnx-node pinned 1.13.8: 2.x dropped espeak (Piper/Kokoro break). `readWave(f, false)` /
  `enableExternalBuffer: false` (Electron forbids external buffers).
- Whisper on an empty/very short buffer segfaults the app: ≥ 4000 samples only.
- Kokoro English: lexicon per accent but `lang: 'en-us'` always ('en-gb' reads nothing).
- Vosk grammar recognizer says "capri" for random speech: it's a hint, never proof.
- `vosk-browser` worker can't fetch another capri:// host (CORS): models are served at `capri://app/voice-models/`.
- Single-instance lock: a second dev copy quits silently. Don't `pkill -f` a pattern your own shell contains.

## Testing without Windows
`xvfb-run -a electron . --dev --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader
--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`; drive it with
`POST 127.0.0.1:47823/debug/command {"name": ...}` (e.g. `heard`, `voiceTest`, `ttsGet`, `answer`, `config`).
`--dev` logs `[voice]` events. Env: `CAPRI_VOICE_URL`, `CAPRI_WHISPER_URL`, `CAPRI_TTS_URL` (mirrors),
`CAPRI_MODEL_IDLE_MS`. GPU numbers under swiftshader are meaningless (software GL).

## Shipping
Commit on `voice`, push `voice` and `voice:main` to `origin`; wait for the Build Capri run; the user downloads
https://github.com/moe19xd/capri-desktop/releases/tag/latest. Never push to `upstream`.
