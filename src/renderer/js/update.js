// A newer her (main/updater.js): she says so and updates herself when you agree; the first time,
// she walks you through making the read-only GitHub token her private repo needs.

import { fmt } from './util.js';

const LINES = {
  fr: {
    available: 'Une nouvelle version de moi est sortie (v{version}). Je me mets à jour ?', now: 'Mettre à jour', later: 'Plus tard',
    upToDate: 'Je suis déjà à jour, choom.', fetching: 'Je télécharge la nouvelle moi…', progress: '{done} / {total} Mo',
    restarting: 'Je reviens dans un instant.', failed: 'La mise à jour a échoué : {error}',
    token: 'Mon repo est privé : il me faut un jeton GitHub en lecture seule, une fois.',
    tokenHow: 'Sur GitHub : Settings › Developer settings › Fine-grained tokens › Generate new token. Repository access : Only select repositories › {repo}. Permissions › Contents : Read-only. Puis colle-le ici.',
    tokenBad: 'Ce jeton n’ouvre pas mon repo ({error}).', page: 'Ouvrir GitHub', tag: 'JETON', note: 'Gardé chiffré sur ton PC.', ok: 'Jeton enregistré.',
  },
  en: {
    available: 'A new version of me is out (v{version}). Update now?', now: 'Update', later: 'Later',
    upToDate: 'I\'m already up to date, choom.', fetching: 'Downloading the new me…', progress: '{done} / {total} MB',
    restarting: 'Be right back.', failed: 'The update failed: {error}',
    token: 'My repo is private: I need a read-only GitHub token, once.',
    tokenHow: 'On GitHub: Settings › Developer settings › Fine-grained tokens › Generate new token. Repository access: Only select repositories › {repo}. Permissions › Contents: Read-only. Then paste it here.',
    tokenBad: 'That token doesn\'t open my repo ({error}).', page: 'Open GitHub', tag: 'TOKEN', note: 'Kept encrypted on your PC.', ok: 'Token saved.',
  },
  es: {
    available: 'Salió una nueva versión de mí (v{version}). ¿Me actualizo?', now: 'Actualizar', later: 'Luego',
    upToDate: 'Ya estoy al día, choom.', fetching: 'Descargando la nueva yo…', progress: '{done} / {total} MB',
    restarting: 'Vuelvo enseguida.', failed: 'La actualización falló: {error}',
    token: 'Mi repo es privado: necesito un token de GitHub de solo lectura, una vez.',
    tokenHow: 'En GitHub: Settings › Developer settings › Fine-grained tokens › Generate new token. Repository access: Only select repositories › {repo}. Permissions › Contents: Read-only. Luego pégalo aquí.',
    tokenBad: 'Ese token no abre mi repo ({error}).', page: 'Abrir GitHub', tag: 'TOKEN', note: 'Guardado cifrado en tu PC.', ok: 'Token guardado.',
  },
  pt: {
    available: 'Saiu uma versão nova de mim (v{version}). Atualizo?', now: 'Atualizar', later: 'Depois',
    upToDate: 'Já tô atualizada, choom.', fetching: 'Baixando a nova eu…', progress: '{done} / {total} MB',
    restarting: 'Já volto.', failed: 'A atualização falhou: {error}',
    token: 'Meu repo é privado: preciso de um token do GitHub só de leitura, uma vez.',
    tokenHow: 'No GitHub: Settings › Developer settings › Fine-grained tokens › Generate new token. Repository access: Only select repositories › {repo}. Permissions › Contents: Read-only. Depois cola aqui.',
    tokenBad: 'Esse token não abre meu repo ({error}).', page: 'Abrir o GitHub', tag: 'TOKEN', note: 'Guardado criptografado no seu PC.', ok: 'Token salvo.',
  },
  ru: {
    available: 'Вышла новая версия меня (v{version}). Обновиться?', now: 'Обновить', later: 'Потом',
    upToDate: 'Я уже обновлена, чумба.', fetching: 'Скачиваю новую себя…', progress: '{done} / {total} МБ',
    restarting: 'Сейчас вернусь.', failed: 'Обновление не удалось: {error}',
    token: 'Мой репозиторий приватный: нужен токен GitHub только для чтения, один раз.',
    tokenHow: 'На GitHub: Settings › Developer settings › Fine-grained tokens › Generate new token. Repository access: Only select repositories › {repo}. Permissions › Contents: Read-only. Потом вставь его сюда.',
    tokenBad: 'Этот токен не открывает мой репозиторий ({error}).', page: 'Открыть GitHub', tag: 'ТОКЕН', note: 'Хранится зашифрованным на твоём ПК.', ok: 'Токен сохранён.',
  },
};

const REPO = 'moe19xd/capri-desktop';

export class Updates {
  constructor({ guide, panel, host, brain, capri }) {
    Object.assign(this, { guide, panel, host, brain, capri });
  }

  get t() {
    return LINES[this.brain.lang] || LINES.en;
  }

  // Her menu › Updates › Check for updates
  async check() {
    const res = await this.host.updateCheck();
    if (!res.ok && (res.code === 'notoken' || res.code === 'badtoken')) return this.token(res.code === 'badtoken' ? res.error : '');
    if (!res.ok) return this.panel.say({ kind: 'error', face: 'aside', line: fmt(this.t.failed, { error: res.error }), hold: 8000 });
    if (!res.update) return this.panel.say({ kind: 'info', face: 'smug', line: this.t.upToDate, hold: 4000 });
    return this.offer(res.update.version);
  }

  // A newer her: now, or later.
  offer(version) {
    const { t, panel } = this;
    this.capri.wake();
    panel.say({
      kind: 'info',
      face: 'laugh',
      badge: 'UPDATE',
      line: fmt(t.available, { version }),
      actions: [{ id: 'now', label: t.now, primary: true }, { id: 'later', label: t.later }],
      onAction: (id) => (id === 'now' ? this.install() : panel.hide()),
      hold: null,
    });
  }

  async install() {
    const { t, panel, host } = this;
    panel.say({ kind: 'work', face: 'calm', badge: 'UPDATE', line: t.fetching, progress: 0, hold: null });
    const off = host.onUpdateProgress(({ done, total }) => {
      panel.setProgress(total ? done / total : 0);
      panel.setQuote(fmt(t.progress, { done: Math.round(done / 1e6), total: Math.round(total / 1e6) }));
    });
    const res = await host.updateInstall();
    off();
    if (res.ok) panel.say({ kind: 'done', face: 'laugh', badge: 'UPDATE', line: t.restarting, hold: null });
    else panel.say({ kind: 'error', face: 'aside', line: fmt(t.failed, { error: res.error }), hold: 9000 });
  }

  // The read-only token for her private repo, pasted in her panel (hidden as you type).
  async token(error = '') {
    const { t, guide, host } = this;
    let got = null;
    await guide.scene(async () => {
      got = await guide.askText({
        face: error ? 'wide' : 'look',
        line: error ? fmt(t.tokenBad, { error }) : t.token,
        quote: fmt(t.tokenHow, { repo: REPO }),
        secret: true,
        placeholder: 'github_pat_…',
        tag: t.tag,
        note: t.note,
        actions: [{ id: 'page', label: t.page }],
        onAction: (id) => id === 'page' && (host.updateTokenPage(), true),
      });
    });
    if (!got?.text) return undefined;
    const res = await host.updateToken(got.text);
    if (!res.ok) return this.token(res.error);
    if (res.update) return this.offer(res.update.version);
    return this.panel.say({ kind: 'info', face: 'smug', line: `${t.ok} ${t.upToDate}`, hold: 5000 });
  }
}
