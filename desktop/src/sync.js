// "Sync to folder": writes every page as Word (.docx) and Markdown (.md)
// into a folder the user picks (e.g. inside OneDrive), mirroring the page
// tree, plus a full backup zip per space that can be imported again.
const fs = require('fs');
const path = require('path');

function safeName(name) {
  const cleaned = (name || 'Untitled')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return (cleaned || 'Untitled').slice(0, 120);
}

class FolderSync {
  constructor({ appUrl, getCookie, stateFile, log }) {
    this.appUrl = appUrl;
    this.getCookie = getCookie;
    this.stateFile = stateFile;
    this.log = log || (() => {});
    this.running = null;
  }

  loadState() {
    try {
      return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
    } catch {
      return { pages: {}, spaces: {} };
    }
  }

  saveState(state) {
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }

  async post(route, body, asBuffer = false) {
    const res = await fetch(`${this.appUrl}/api/${route}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: await this.getCookie(),
      },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
      throw new Error(`${route} failed: ${res.status}`);
    }
    if (asBuffer) return Buffer.from(await res.arrayBuffer());
    const json = await res.json();
    return json.data ?? json;
  }

  async listAll(route, body) {
    const items = [];
    let cursor;
    for (let i = 0; i < 1000; i++) {
      const data = await this.post(route, { ...body, limit: 100, cursor });
      items.push(...(data.items || []));
      if (!data.meta?.hasNextPage || !data.meta?.nextCursor) break;
      cursor = data.meta.nextCursor;
    }
    return items;
  }

  async walk(spaceId, parentPageId, dir, out) {
    const pages = await this.listAll('pages/sidebar-pages', {
      spaceId,
      ...(parentPageId ? { pageId: parentPageId } : {}),
    });
    const used = new Set();
    for (const page of pages) {
      let base = safeName(page.title);
      let n = 2;
      while (used.has(base.toLowerCase())) base = `${safeName(page.title)} (${n++})`;
      used.add(base.toLowerCase());
      out.push({ page, dir, base });
      if (page.hasChildren) {
        await this.walk(spaceId, page.id, path.join(dir, base), out);
      }
    }
  }

  sync(folder, { force = false } = {}) {
    if (this.running) return this.running;
    this.running = this._sync(folder, force).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  async _sync(folder, force) {
    if (!folder) throw new Error('No sync folder selected');
    const state = this.loadState();
    if (state.folder !== folder) {
      state.pages = {};
      state.spaces = {};
      state.folder = folder;
    }
    let written = 0;
    const spaces = await this.listAll('spaces', {});
    for (const space of spaces) {
      const spaceDir = path.join(folder, safeName(space.name));
      const entries = [];
      await this.walk(space.id, null, spaceDir, entries);
      let spaceChanged = force;
      for (const { page, dir, base } of entries) {
        const prev = state.pages[page.id];
        const target = path.join(dir, base);
        if (
          !force &&
          prev &&
          prev.updatedAt === page.updatedAt &&
          prev.target === target &&
          fs.existsSync(`${target}.docx`)
        ) {
          continue;
        }
        spaceChanged = true;
        fs.mkdirSync(dir, { recursive: true });
        try {
          const docx = await this.post('docx-export', { pageId: page.id }, true);
          fs.writeFileSync(`${target}.docx`, docx);
          const md = await this.post(
            'pages/export',
            { pageId: page.id, format: 'markdown', includeChildren: false, includeAttachments: false },
            true,
          );
          fs.writeFileSync(`${target}.md`, md);
          // Remove the old copy if the page was renamed or moved.
          if (prev?.target && prev.target !== target) {
            for (const ext of ['.docx', '.md']) {
              fs.rmSync(`${prev.target}${ext}`, { force: true });
            }
          }
          state.pages[page.id] = { updatedAt: page.updatedAt, target };
          written++;
        } catch (err) {
          this.log(`sync: page ${page.id} failed: ${err.message}`);
        }
      }

      if (spaceChanged || !state.spaces[space.id]) {
        try {
          const zip = await this.post(
            'spaces/export',
            { spaceId: space.id, format: 'markdown', includeAttachments: true },
            true,
          );
          const backupDir = path.join(folder, '_Backup');
          fs.mkdirSync(backupDir, { recursive: true });
          fs.writeFileSync(path.join(backupDir, `${safeName(space.name)}.zip`), zip);
          state.spaces[space.id] = { at: new Date().toISOString() };
        } catch (err) {
          this.log(`sync: space backup ${space.id} failed: ${err.message}`);
        }
      }
    }
    state.lastSync = new Date().toISOString();
    this.saveState(state);
    return { written, at: state.lastSync };
  }
}

module.exports = { FolderSync, safeName };
