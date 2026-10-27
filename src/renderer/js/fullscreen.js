// Out of the way of full-screen games and videos: when the window in front covers the whole screen
// (and isn't just maximized), her whole window goes (main.js hides it: nothing drawn, nothing
// animated), and comes back once you're out of it. Windows only, like the window watcher it reads.

const SETTLE_MS = 1200; // alt-tabbing through doesn't make her blink in and out

export class Fullscreen {
  constructor({ host }) {
    this.host = host;
    this.enabled = true;
    this.away = false;
    this.want = false;
    this.timer = 0;
  }

  configure(cfg) {
    this.enabled = cfg.hideFullscreen !== false;
    if (!this.enabled) this.set(false, true);
  }

  // The windows as the watcher sees them, in her window's coordinates; view: her window's size.
  update({ fg, wins } = {}, view) {
    const win = this.enabled && wins?.find((w) => w.id === fg);
    const full = Boolean(win && !win.max && win.x <= 1 && win.y <= 1
      && win.x + win.w >= view.w - 1 && win.y + win.h >= view.h - 1);
    this.set(full);
  }

  set(full, now = false) {
    if (full === this.want && !now) return;
    this.want = full;
    clearTimeout(this.timer);
    const apply = () => {
      if (this.away === this.want) return;
      this.away = this.want;
      this.host.setAway(this.away);
    };
    if (now) apply();
    else this.timer = setTimeout(apply, SETTLE_MS);
  }
}
