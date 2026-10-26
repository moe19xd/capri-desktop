# Setting Capri up at home

Two ways. **Option A** is the easiest: one download, one double-click.

---

## Option A — the installer (easiest, nothing else to install)

1. On GitHub, open this repo › **Releases** (right side of the page) › **Capri (latest build)**.
2. Under **Assets**, download **`Capri-Setup-x.y.z.exe`**.
3. Double-click it.
   - Windows may say *"Windows protected your PC"* (the installer isn't signed: a certificate costs money).
     Click **More info** › **Run anyway**.
4. Capri appears on your screen. She installs for your user only, adds a **Capri** shortcut on your desktop,
   and you'll find her in the Start menu too.

> No release yet? It's built automatically by GitHub a few minutes after each push. Check the **Actions** tab:
> when **Build Capri** has a green check, the release is there. You can also start it by hand:
> Actions › Build Capri › **Run workflow**.

To update later: download the new `Capri-Setup` and run it again, it replaces the old one.

---

## Option B — from the code (if you want to change things)

1. On GitHub: green **Code** button › **Download ZIP**. Unzip it somewhere you'll keep it
   (e.g. `Documents\capri-desktop`).
   *(Or with git: `git clone https://github.com/moe19xd/capri-desktop`)*
2. Double-click **`Install Capri.bat`**. It:
   - installs Node.js if you don't have it (with winget, Windows' own installer),
   - downloads her pieces (a few minutes the first time),
   - puts a **Capri** shortcut on your desktop and starts her.
3. Next times: double-click **Capri** on your desktop (or `Start Capri.bat`).

To update: download the ZIP again (or `git pull`), then run `Install Capri.bat` again.

---

## First things to set up (both options)

All of this is in her menu: **right-click her** (or her icon by the clock, behind the **^**).

### 1. Her language
**Language** › pick the one **you talk to her in**. She listens in that language.

### 2. Her brain (chat), free and on your PC
**AI model** › **Set it up with her…** › **On my PC**: she installs Ollama and a model for you, with buttons.
- PC with **20 GB of RAM or more**: pick **gemma3:12b** (much smarter).
- Otherwise: **gemma3:4b**. Avoid llama3.2 unless your PC is small: it's the least clever.

### 3. Her ears (talking to her out loud)
**Voice** › **Listen to me** › **Download it** (about 250 MB, once: her name detector + Whisper).
Then:
- Say **"Capri, …"** and what you want: *"Capri, open Spotify"*, *"Capri, what time is it?"*,
  *"Capri, tell me about Night City"*.
- Or press **Ctrl+Alt+V** and just talk.
- She answers out loud. **Voice** › *Answer out loud* turns that off.

No microphone? Windows Settings › Privacy & security › Microphone: turn on
**Let desktop apps access your microphone**. Then Voice › Listen to me again.

### 4. Claude Code (optional)
If you use Claude Code, click **Plug me in** when she asks (or her menu › *Install Claude Code hooks*),
then restart Claude Code. She'll comment on what it does.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| She can't hear me | Microphone permission (above). Check her **Language** matches what you speak. |
| She mishears a lot | Voice › make sure **Better hearing (Whisper)** is ticked. Speak after she turns to you. |
| Her answers are dumb | AI model › Set it up with her… › pick a bigger model (gemma3:12b if your PC can). |
| "Unpacking…" fails | Open her voice folder (Voice › *Open voice models folder*), delete what's there, try again. |
| She's gone | **Ctrl+Alt+C** brings her back (she hides in her chip in the bottom-left corner). |
| Start with Windows | Her menu › **Start with Windows**. |

Her settings live in `%APPDATA%\capri-desktop` (Option B) or `%APPDATA%\Capri` (Option A).
Delete that folder to start fresh.

---

*Based on [mochiiwuff/capri-desktop](https://github.com/mochiiwuff/capri-desktop) (code: MIT). The Capri artwork
belongs to its rights holders: keep this repo private and for personal use.*
