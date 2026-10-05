/* Memory Archive · application
   Entries come in three kinds (Notes, Finds, Works), live in Collections, can be marked Formative,
   and connect through explicit links (with a reason) and [[wiki links]] written in Markdown.
   Data is kept in this browser (IndexedDB, with localStorage as a fallback). */
(() => {
  'use strict';

  /* ================= vocabulary ================= */
  const KINDS = {
    work: { label: 'Work', plural: 'Works', glyph: '◆', help: 'A piece you made', date: 'Made',
      desc: 'Your own pieces. Open one and use Lineage to see what shaped it.',
      placeholder: 'What is it, how was it made, what was it about?' },
    note: { label: 'Note', plural: 'Notes', glyph: '¶', help: 'Your own writing', date: 'Written',
      desc: 'Your own writing: thoughts, reflections, process. Link to any entry with [[double brackets]].',
      placeholder: 'Start writing. # heading, **bold**, - list, > quote, and [[ to link another entry.' },
    find: { label: 'Find', plural: 'Finds', glyph: '↘', help: 'Something from outside', date: 'Found',
      desc: 'Things from outside that stayed with you: images, links, quotes and files.',
      placeholder: 'Why did this stay with you? Where did you come across it?' },
  };
  const KIND_ORDER = ['work', 'note', 'find'];
  const FORMATS = { image: { label: 'Image', glyph: '◐' }, link: { label: 'Link', glyph: '↗' }, quote: { label: 'Quote', glyph: '“' }, file: { label: 'File', glyph: '▤' }, text: { label: 'Text', glyph: '¶' } };
  const formatOf = e => e.image || e.swatch ? 'image' : e.file ? 'file' : e.url ? 'link' : e.kind === 'find' ? 'quote' : 'text';
  const GROUPS = { none: 'Nothing', year: 'Year', kind: 'Kind', collection: 'Collection', person: 'Person' };
  const DISPLAYS = { list: 'List', grid: 'Grid', graph: 'Graph' };

  /* ================= helpers ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const today = () => new Date().toISOString().slice(0, 10);
  const now = () => new Date().toISOString();
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isTyping = el => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
  const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDay = d => d ? `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}` : '—';
  const fmtDate = d => d ? `${fmtDay(d)} ${d.slice(0, 4)}` : 'Undated';
  const year = d => d ? d.slice(0, 4) : '—';
  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  const norm = s => String(s || '').trim().toLowerCase();

  /* ================= storage ================= */
  const LEGACY_KEY = 'memory-archive-v1';
  const FALLBACK_KEY = 'memory-archive-v2';
  const PREFS_KEY = 'memory-archive-prefs';
  const store = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        if (!('indexedDB' in window)) return rej(new Error('no idb'));
        const r = indexedDB.open('memory-archive', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(this.db = r.result);
        r.onerror = () => rej(r.error);
      });
    },
    async get(key) {
      try {
        const d = await this.open();
        return await new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      } catch { try { return JSON.parse(localStorage.getItem(FALLBACK_KEY)); } catch { return null; } }
    },
    async set(key, val) {
      try {
        const d = await this.open();
        await new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(val, key); t.oncomplete = res; t.onerror = () => rej(t.error); });
      } catch { localStorage.setItem(FALLBACK_KEY, JSON.stringify(val)); }
    },
  };
  const prefs = { display: 'list', group: 'year', mode: 'split' };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY)) || {}); } catch { /* defaults */ }
  const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };

  let db = { version: 2, entries: [], collections: [], links: [] };
  let saving = Promise.resolve();
  function persist() {
    const snapshot = JSON.parse(JSON.stringify(db));
    saving = saving.then(() => store.set('db', snapshot)).catch(() => toast('Could not save · export a backup'));
    return saving;
  }

  /* v1 (types, resonance, tags) → v2 (kinds, collections, formative) */
  function migrate(old) {
    if (old && old.version === 2) return old;
    const kindOf = { thought: 'note', note: 'note', work: 'work', image: 'find', source: 'find', quote: 'find', file: 'find' };
    const cols = new Map();
    const colFor = tag => {
      if (!cols.has(tag)) cols.set(tag, { id: uid(), name: tag.charAt(0).toUpperCase() + tag.slice(1), description: '', created: now() });
      return cols.get(tag).id;
    };
    const entries = (old.items || []).map(i => ({
      id: i.id, kind: kindOf[i.type] || 'note', title: i.title || 'Untitled', body: i.body || '', url: i.url || '', by: '',
      image: i.image || null, file: i.file || null, swatch: i.swatch || null, date: i.date || '', formative: false,
      collections: (i.tags || []).map(colFor), created: i.created || now(), updated: now(), example: !!i.example, assets: {},
    }));
    return { version: 2, entries, collections: [...cols.values()], links: (old.links || []).map(l => ({ id: l.id || uid(), a: l.a, b: l.b, note: l.note || '' })) };
  }

  /* ================= model ================= */
  const byId = id => db.entries.find(e => e.id === id);
  const colById = id => db.collections.find(c => c.id === id);
  const byTitle = t => { const n = norm(t); return db.entries.find(e => norm(e.title) === n); };
  const byNewest = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || '').localeCompare(a.created || '');
  const WIKI = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;

  function mentionsOf(e) {
    const out = new Set();
    for (const m of (e.body || '').matchAll(WIKI)) { const t = byTitle(m[1]); if (t && t.id !== e.id) out.add(t.id); }
    return [...out];
  }
  // Every relation between two entries: explicit links (with a reason) and mentions in text
  function relations() {
    const rel = [], seen = new Set();
    db.links.forEach(l => { if (byId(l.a) && byId(l.b)) { rel.push({ a: l.a, b: l.b, note: l.note, link: l }); seen.add([l.a, l.b].sort().join()); } });
    db.entries.forEach(e => mentionsOf(e).forEach(t => {
      const k = [e.id, t].sort().join();
      if (!seen.has(k)) { seen.add(k); rel.push({ a: e.id, b: t, note: '', mention: true }); }
    }));
    return rel;
  }
  const neighbours = (id, rel = relations()) => rel.filter(r => r.a === id || r.b === id).map(r => ({ ...r, other: byId(r.a === id ? r.b : r.a) }));
  const backlinks = id => db.entries.filter(e => e.id !== id && mentionsOf(e).includes(id));
  const people = () => {
    const m = new Map();
    db.entries.forEach(e => { if (e.by && e.by.trim()) { const k = e.by.trim(); m.has(k) || m.set(k, []); m.get(k).push(e); } });
    return [...m].map(([name, list]) => ({ name, list })).sort((a, b) => b.list.length - a.list.length || a.name.localeCompare(b.name));
  };
  const inCollection = cid => db.entries.filter(e => e.collections.includes(cid));

  function ensureCollection(name) {
    const n = name.trim(); if (!n) return null;
    let c = db.collections.find(x => norm(x.name) === norm(n));
    if (!c) { c = { id: uid(), name: n, description: '', created: now() }; db.collections.push(c); toast(`New collection · ${n}`); }
    return c;
  }

  /* ================= markdown ================= */
  if (window.marked) marked.use({ gfm: true, breaks: true });
  function renderMd(text, entry) {
    if (!text || !text.trim()) return '';
    const src = text.replace(WIKI, (m, t, alias) => {
      const target = byTitle(t), label = esc((alias || t).trim());
      return target ? `<a class="wikilink" href="#/e/${target.id}">${label}</a>` : `<a class="wikilink is-new" href="#/new/note?title=${encodeURIComponent(t.trim())}" title="Create a note called “${esc(t.trim())}”">${label}</a>`;
    });
    let html = window.marked ? marked.parse(src) : `<p>${esc(text).replace(/\n/g, '<br>')}</p>`;
    html = html.replace(/asset:([a-z0-9]+)/g, (m, id) => (entry && entry.assets && entry.assets[id]) || '');
    return window.DOMPurify ? DOMPurify.sanitize(html) : html;
  }
  const plain = text => String(text || '').replace(WIKI, (m, t, a) => a || t).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^\s*[-*+] \[[ x]\]/gm, '').replace(/[*_`~]+/g, '').replace(/[#>]+/g, ' ').replace(/(^|\s)-(\s)/g, '$1$2').replace(/\s+/g, ' ').trim();

  // The opening paragraph of a text, without headings or lists
  const excerpt = text => {
    const paras = String(text || '').split(/\n\s*\n/).map(s => s.trim()).filter(s => s && !/^(#|[-*+] |\d+\. |!\[|---)/.test(s));
    return plain(paras[0] || text);
  };

  /* ================= plates: image, generated placeholder, or typographic tile ================= */
  function linesSvg(e) {
    const [bg, fg] = e.swatch;
    let s = hash(e.id);
    const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0) / 4294967296);
    const n = 22 + Math.floor(rnd() * 14), amp = 4 + rnd() * 14, freq = .008 + rnd() * .02;
    let paths = '';
    for (let i = 0; i < n; i++) {
      const y0 = 30 + i * (440 / n), ph = rnd() * 6.28, a = amp * (.4 + rnd());
      let d = '';
      for (let x = 0; x <= 400; x += 10) d += `${x ? ' L' : 'M'}${x} ${(y0 + Math.sin(x * freq + ph + i * .18) * a).toFixed(1)}`;
      paths += `<path d="${d}"/>`;
    }
    return `<svg viewBox="0 0 400 500" preserveAspectRatio="none" aria-hidden="true"><rect width="400" height="500" fill="${bg}"/><g fill="none" stroke="${fg}" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".8">${paths}</g></svg>`;
  }
  const isDark = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * .3 + ((n >> 8) & 255) * .59 + (n & 255) * .11) < 110; };
  function plate(e, { big = false } = {}) {
    const f = formatOf(e), k = KINDS[e.kind];
    if (e.image) return `<div class="plate"><img src="${e.image}" alt="" loading="lazy"></div>`;
    if (e.swatch) return `<div class="plate${isDark(e.swatch[0]) ? ' plate--dark' : ''}">${linesSvg(e)}<span class="label ph">${big ? 'Placeholder · add your own image' : 'Placeholder'}</span></div>`;
    let q = excerpt(e.body) || e.title, cls = 'note';
    if (f === 'quote') { q = e.title; cls = 'quote'; }
    else if (f === 'link') { q = host(e.url) || e.title; cls = 'link'; }
    else if (f === 'file') { q = e.file.name; cls = 'file'; }
    else if (e.kind === 'work') { q = e.title; cls = 'work'; }
    const glyph = e.kind === 'find' ? FORMATS[f].glyph : k.glyph;
    const label = e.kind === 'find' ? FORMATS[f].label : k.label;
    return `<div class="plate plate--text plate--${cls}" data-glyph="${glyph}"><span class="label">${glyph} ${label}</span><p class="q">${esc(q.length > 420 ? q.slice(0, 420) + '…' : q)}</p></div>`;
  }
  const kindLabel = e => e.kind === 'find' ? `Find · ${FORMATS[formatOf(e)].label}` : KINDS[e.kind].label;
  const titleHtml = e => formatOf(e) === 'quote' ? `<q>${esc(e.title)}</q>` : esc(e.title);
  const fMark = e => e.formative ? '<span class="f-mark" title="Formative" aria-label="Formative"></span>' : '';

  /* ================= state & routing ================= */
  const ui = { query: '', route: null, lastList: [], lastScope: { hash: '#/all', label: 'Everything' }, draft: null, dirty: false, preset: null, animate: true, skipGuard: false };

  function parseRoute() {
    const raw = location.hash.replace(/^#/, '') || '/all';
    const [path, qs] = raw.split('?');
    const p = path.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
    const q = new URLSearchParams(qs || '');
    switch (p[0]) {
      case 'all': case 'unsorted': case 'formative': return { page: 'list', scope: p[0] };
      case 'kind': return KINDS[p[1]] ? { page: 'list', scope: 'kind', kind: p[1] } : { page: 'list', scope: 'all' };
      case 'c': return colById(p[1]) ? { page: 'list', scope: 'collection', id: p[1], edit: q.has('edit') } : { page: 'collections' };
      case 'collections': return { page: 'collections' };
      case 'people': return { page: 'people' };
      case 'p': return { page: 'list', scope: 'person', name: p[1] || '' };
      case 'e': return byId(p[1]) ? { page: p[2] === 'edit' ? 'edit' : 'entry', id: p[1], tab: p[2] === 'lineage' ? 'lineage' : 'entry' } : { page: 'list', scope: 'all' };
      case 'new': return { page: 'edit', kind: KINDS[p[1]] ? p[1] : 'note', title: q.get('title') || '' };
      default: return { page: 'list', scope: 'all' };
    }
  }
  const go = h => { if (location.hash === h) render(); else location.hash = h; };

  /* ================= sidebar ================= */
  const side = $('#side');
  function renderSide() {
    const r = ui.route || {};
    const cur = cond => cond ? ' aria-current="page"' : '';
    const item = (href, label, n, cond, glyph = '') => `<li><a class="nav-item" href="${href}"${cur(cond)}>${glyph ? `<span class="g">${glyph}</span>` : ''}<span>${label}</span><span class="n">${n}</span></a></li>`;
    const L = r.page === 'list' && !ui.query;
    const unsorted = db.entries.filter(e => !e.collections.length).length;
    const cols = [...db.collections].sort((a, b) => a.name.localeCompare(b.name));
    const ppl = people();
    $('#side-nav').innerHTML = `
      <section class="nav-sec"><div class="nav-head"><span class="label">Library</span></div><ul class="nav-list">
        ${item('#/all', 'Everything', db.entries.length, L && r.scope === 'all', '∗')}
        ${item('#/unsorted', 'Unsorted', unsorted, L && r.scope === 'unsorted', '○')}
        ${item('#/formative', 'Formative', db.entries.filter(e => e.formative).length, L && r.scope === 'formative', '<span class="f-mark"></span>')}
        <li><button class="nav-item" type="button" id="drift" style="width:100%" title="Open a random entry, older ones more likely"><span class="g">~</span><span>Drift</span><span class="n">↻</span></button></li>
      </ul></section>
      <section class="nav-sec"><div class="nav-head"><span class="label">Kinds</span></div><ul class="nav-list">
        ${KIND_ORDER.map(k => item(`#/kind/${k}`, KINDS[k].plural, db.entries.filter(e => e.kind === k).length, L && r.scope === 'kind' && r.kind === k, KINDS[k].glyph)).join('')}
      </ul></section>
      <section class="nav-sec"><div class="nav-head"><a class="label" href="#/collections"${cur(r.page === 'collections')}>Collections</a><button class="add" type="button" data-new-collection title="New collection" aria-label="New collection">+</button></div><ul class="nav-list">
        ${cols.map(c => item(`#/c/${c.id}`, esc(c.name), inCollection(c.id).length, L && r.scope === 'collection' && r.id === c.id)).join('') || '<li class="label" style="padding:5px 0">None yet</li>'}
      </ul></section>
      <section class="nav-sec"><div class="nav-head"><a class="label" href="#/people"${cur(r.page === 'people')}>People</a></div><ul class="nav-list">
        ${ppl.slice(0, 6).map(p => item(`#/p/${encodeURIComponent(p.name)}`, esc(p.name), p.list.length, L && r.scope === 'person' && r.name === p.name)).join('') || '<li class="label" style="padding:5px 0">Add “by” to a find</li>'}
      </ul>${ppl.length > 6 ? `<a class="label nav-more" href="#/people">All ${ppl.length} people →</a>` : ''}</section>`;
  }
  side.addEventListener('click', e => {
    if (e.target.closest('#drift')) { if (innerWidth <= 1000) closeSide(); return drift(); }
    if (e.target.closest('[data-new-collection]')) return newCollection();
    if (e.target.closest('a[href]') && innerWidth <= 1000) closeSide();
  });
  const openSide = () => { side.classList.add('is-open'); $('[data-side-close]', side).focus(); };
  const closeSide = () => side.classList.remove('is-open');
  $('#menu-btn').addEventListener('click', openSide);
  $$('[data-side-close]').forEach(b => b.addEventListener('click', closeSide));

  // New entry menu
  const newBtn = $('#new-btn'), newMenu = $('#new-menu');
  const toggleNew = (open = newMenu.hidden) => { newMenu.hidden = !open; newBtn.setAttribute('aria-expanded', String(open)); if (open) $('a', newMenu).focus(); };
  newBtn.addEventListener('click', () => toggleNew());
  newMenu.addEventListener('click', () => { toggleNew(false); if (innerWidth <= 1000) closeSide(); });
  document.addEventListener('click', e => { if (!newMenu.hidden && !e.target.closest('.side-new')) toggleNew(false); });

  function newCollection() {
    const c = { id: uid(), name: 'Untitled collection', description: '', created: now() };
    db.collections.push(c); persist();
    if (innerWidth <= 1000) closeSide();
    go(`#/c/${c.id}?edit`);
  }
  function drift() {
    if (!db.entries.length) return;
    const t = Date.now(), w = db.entries.map(e => 1 + (t - (Date.parse(e.date) || t)) / 3.15e10);
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    const pick = db.entries.find((_, k) => (r -= w[k]) <= 0) || db.entries[0];
    go(`#/e/${pick.id}`);
  }

  /* ================= bar ================= */
  function setBar(crumbs, tools = '') {
    $('#crumbs').innerHTML = crumbs.map((c, i) => i === crumbs.length - 1 ? `<span class="here">${c[0]}</span>` : `<a href="${c[1]}">${c[0]}</a><span class="sep">/</span>`).join('');
    $('#bar-tools').innerHTML = tools;
  }
  const listTools = () => `
    <div class="seg" role="group" aria-label="Display">${Object.entries(DISPLAYS).map(([k, v]) => `<button type="button" data-display="${k}" aria-pressed="${prefs.display === k}">${v}</button>`).join('')}</div>
    ${prefs.display === 'graph' ? '' : `<label class="select-mini"><span class="label">Group by</span><select id="group-by">${Object.entries(GROUPS).map(([k, v]) => `<option value="${k}"${prefs.group === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`}`;
  $('#bar-tools').addEventListener('click', e => {
    const d = e.target.closest('[data-display]'); if (d) { prefs.display = d.dataset.display; savePrefs(); ui.animate = true; renderMain(); }
    const s = e.target.closest('[data-step]'); if (s) step(+s.dataset.step);
  });
  $('#bar-tools').addEventListener('change', e => { if (e.target.id === 'group-by') { prefs.group = e.target.value; savePrefs(); ui.animate = true; renderMain(); } });

  /* ================= render ================= */
  const main = $('#main');
  function render() { ui.route = parseRoute(); renderSide(); renderMain(); }
  function renderMain() {
    hidePreview();
    if (sim) { cancelAnimationFrame(sim.raf); sim = null; }
    const r = ui.route;
    if (ui.query && r.page !== 'edit') listPage({ page: 'list', scope: 'search' });
    else ({ list: listPage, collections: collectionsPage, people: peoplePage, entry: entryPage, edit: editPage })[r.page](r);
    ui.animate = false;
  }
  const rise = k => ui.animate ? ` rise" style="--d:${Math.min(k * 30, 600)}ms` : '';

  /* ---------- list pages ---------- */
  function scopeOf(r) {
    const q = norm(ui.query);
    switch (r.scope) {
      case 'search': return { title: `“${esc(ui.query)}”`, kick: 'Search', crumbs: [['Search', '#/all'], [esc(ui.query)]],
        entries: db.entries.filter(e => [e.title, e.body, e.url, e.by, e.file?.name, ...e.collections.map(c => colById(c)?.name)].join(' ').toLowerCase().includes(q)),
        desc: 'Searching titles, writing, people, links and collections.', emptyText: 'No matches.' };
      case 'unsorted': return { title: 'Unsorted', crumbs: [['Library', '#/all'], ['Unsorted']], entries: db.entries.filter(e => !e.collections.length),
        desc: 'Entries that aren’t in a collection yet. Open one and give it a place.', emptyText: 'Everything has a place.' };
      case 'formative': return { title: 'Formative', crumbs: [['Library', '#/all'], ['Formative']], entries: db.entries.filter(e => e.formative),
        desc: 'The few things that truly shaped you. Mark an entry as formative from its page.', emptyText: 'Nothing marked as formative yet.' };
      case 'kind': return { title: KINDS[r.kind].plural, crumbs: [['Kinds', '#/all'], [KINDS[r.kind].plural]], entries: db.entries.filter(e => e.kind === r.kind),
        desc: esc(KINDS[r.kind].desc), newHref: `#/new/${r.kind}`, newLabel: `New ${KINDS[r.kind].label.toLowerCase()}` };
      case 'collection': { const c = colById(r.id); return { title: esc(c.name), kick: 'Collection', crumbs: [['Collections', '#/collections'], [esc(c.name)]], entries: inCollection(c.id),
        desc: renderMd(c.description) || '<p class="muted">No description yet.</p>', descMd: true, collection: c, emptyText: 'Nothing in this collection yet.', emptyHint: 'Add entries from their page, or drop images on this page to add them here.' }; }
      case 'person': { const list = db.entries.filter(e => (e.by || '').trim() === r.name); const ys = list.map(e => e.date).filter(Boolean).sort();
        return { title: esc(r.name), kick: 'Person', crumbs: [['People', '#/people'], [esc(r.name)]], entries: list,
          desc: list.length ? `${plural(list.length, 'entry', 'entries')}${ys.length ? `, ${year(ys[0])}${year(ys[0]) !== year(ys.at(-1)) ? '–' + year(ys.at(-1)) : ''}` : ''}.` : 'No entries.' }; }
      default: return { title: 'Everything', crumbs: [['Library', '#/all'], ['Everything']], entries: db.entries, desc: 'Every note, find and work in the archive, newest first.' };
    }
  }

  function groupEntries(list, by) {
    const groups = new Map();
    const add = (key, label, e, extra = {}) => { if (!groups.has(key)) groups.set(key, { key, label, items: [], ...extra }); groups.get(key).items.push(e); };
    list.forEach(e => {
      if (by === 'year') add(year(e.date), year(e.date) === '—' ? 'Undated' : year(e.date), e);
      else if (by === 'kind') add(e.kind, KINDS[e.kind].plural, e, { glyph: KINDS[e.kind].glyph, href: `#/kind/${e.kind}`, order: KIND_ORDER.indexOf(e.kind) });
      else if (by === 'collection') {
        const cs = e.collections.map(colById).filter(Boolean);
        if (!cs.length) add('~', 'Unsorted', e, { href: '#/unsorted', order: 1e9 });
        cs.forEach(c => add(c.id, esc(c.name), e, { href: `#/c/${c.id}` }));
      } else if (by === 'person') {
        const p = (e.by || '').trim();
        if (p) add('p:' + p, esc(p), e, { href: `#/p/${encodeURIComponent(p)}` });
        else add(e.kind === 'find' ? '~u' : '~me', e.kind === 'find' ? 'Unattributed' : 'Me', e, { order: e.kind === 'find' ? 1e9 : -1 });
      } else add('all', '', e);
    });
    const out = [...groups.values()];
    if (by === 'year') out.sort((a, b) => (b.key === '—' ? '' : b.key).localeCompare(a.key === '—' ? '' : a.key));
    else if (by === 'kind') out.sort((a, b) => a.order - b.order);
    else out.sort((a, b) => (a.order || 0) - (b.order || 0) || b.items.length - a.items.length || a.label.localeCompare(b.label));
    return out;
  }

  function listPage(r) {
    const sc = scopeOf(r);
    const entries = [...sc.entries].sort(byNewest);
    ui.lastList = entries.map(e => e.id);
    if (r.scope !== 'search') ui.lastScope = { hash: location.hash || '#/all', label: sc.crumbs.at(-1)[0] };
    setBar(sc.crumbs, listTools());
    const c = sc.collection;
    const head = r.edit && c ? `
      <form class="head" id="col-edit"><div class="head-edit">
        <span class="label">Collection</span>
        <label class="visually-hidden" for="col-name">Name</label><input id="col-name" name="name" value="${esc(c.name)}" autocomplete="off" placeholder="Name">
        <label class="label" for="col-desc">Description · Markdown</label><textarea id="col-desc" name="description" rows="3" placeholder="What ties these together?">${esc(c.description)}</textarea>
        <div class="row-actions"><button class="action action--primary" type="submit"><span class="dot"></span><span>Save</span></button><a class="action" href="#/c/${c.id}"><span>Cancel</span></a></div>
      </div></form>` : `
      <header class="head${rise(0)}">
        ${sc.kick ? `<span class="label kick">${sc.kick}</span>` : ''}
        <h1>${sc.title}<sup>${entries.length}</sup></h1>
        <div class="desc${sc.descMd ? ' md' : ''}">${sc.descMd ? sc.desc : `<p>${sc.desc}</p>`}</div>
        ${c ? `<div class="head-actions"><a class="action" href="#/c/${c.id}?edit"><span>Edit</span></a><button class="action action--danger" type="button" data-delete-collection="${c.id}"><span>Delete collection</span></button></div>` : ''}
        ${sc.newHref ? `<div class="head-actions"><a class="action action--primary" href="${sc.newHref}"><span class="dot"></span><span>${sc.newLabel}</span></a></div>` : ''}
      </header>`;
    let body;
    if (!entries.length) {
      body = `<div class="empty"><p>${sc.emptyText || (db.entries.length ? 'Nothing here.' : 'The archive is empty.')}</p>${sc.emptyHint ? `<p class="hint">${sc.emptyHint}</p>` : ''}${!db.entries.length ? '<p class="hint">Start with a note, or paste a link or drop an image anywhere on the page.</p>' : ''}</div>`;
    } else if (prefs.display === 'graph') {
      body = graphHtml();
    } else {
      let k = 0;
      const next = () => k++;
      body = groupEntries(entries, prefs.group).map(g => `<section class="group">
        ${g.label ? `<header class="group-head${rise(next())}"><h2>${g.glyph ? `<span class="g">${g.glyph}</span>` : ''}${g.href ? `<a href="${g.href}">${g.label}</a>` : g.label}</h2><span class="label">${plural(g.items.length, 'entry', 'entries')}</span></header>` : ''}
        ${prefs.display === 'grid' ? gridHtml(g.items, next) : rowsHtml(g.items, prefs.group === 'year', next)}
      </section>`).join('');
    }
    main.innerHTML = head + body;
    if (prefs.display === 'graph' && entries.length) constellation($('.field-wrap', main), entries);
    wireRows();
    const form = $('#col-edit', main);
    if (form) {
      const name = $('#col-name', form); name.focus(); if (c.name === 'Untitled collection') name.select();
      form.addEventListener('submit', e => {
        e.preventDefault();
        c.name = name.value.trim() || 'Untitled collection'; c.description = $('#col-desc', form).value.trim();
        persist(); toast('Collection saved'); go(`#/c/${c.id}`);
      });
    }
  }
  function rowsHtml(items, inYear, next) {
    const rel = relations();
    return `<ol class="rows">${items.map(e => {
      const n = rel.filter(r => r.a === e.id || r.b === e.id).length;
      const cols = e.collections.map(cid => colById(cid)?.name).filter(Boolean);
      return `<li class="row${e.kind === 'work' ? ' is-work' : ''}${rise(next())}" data-id="${e.id}"><a href="#/e/${e.id}">
        <span class="d label">${inYear ? fmtDay(e.date) : year(e.date)}</span>
        <span class="t">${titleHtml(e)}${fMark(e)}</span>
        <span class="k label">${kindLabel(e)}</span>
        <span class="c label" title="${esc(cols.join(', '))}">${esc(cols.join(' · ')) || '<span style="opacity:.5">Unsorted</span>'}</span>
        <span class="x label" title="${plural(n, 'connection')}">${n ? `↔ ${n}` : '—'}</span>
      </a></li>`;
    }).join('')}</ol>`;
  }
  function gridHtml(items, next) {
    return `<div class="grid">${items.map(e => `<a class="tile${e.kind === 'work' ? ' is-work' : ''}${rise(next())}" href="#/e/${e.id}">
      ${plate(e)}
      <span class="meta"><span class="label">${kindLabel(e)} · ${year(e.date)}</span>${fMark(e)}</span>
      <h3>${titleHtml(e)}</h3>
      ${e.by ? `<p class="s">${esc(e.by)}</p>` : ''}
    </a>`).join('')}</div>`;
  }
  function wireRows() {
    if (!finePointer) return;
    $$('.rows', main).forEach(list => $$('.row[data-id]', list).forEach(row => {
      row.addEventListener('mouseenter', () => { list.classList.add('is-hovering'); row.classList.add('is-hover'); showPreview(byId(row.dataset.id)); });
      row.addEventListener('mouseleave', () => { row.classList.remove('is-hover'); list.classList.remove('is-hovering'); hidePreview(); });
    }));
  }

  /* ---------- collections overview ---------- */
  function collectionsPage() {
    setBar([['Collections', '#/collections'], ['All collections']]);
    ui.lastScope = { hash: '#/collections', label: 'Collections' };
    const cols = [...db.collections].sort((a, b) => inCollection(b.id).length - inCollection(a.id).length || a.name.localeCompare(b.name));
    main.innerHTML = `<header class="head${rise(0)}"><h1>Collections<sup>${cols.length}</sup></h1>
        <div class="desc"><p>Groups you make yourself: themes, obsessions, research for a project. An entry can live in several.</p></div></header>
      <div class="cards">${cols.map((c, k) => {
        const list = inCollection(c.id).sort((a, b) => (!!b.image || !!b.swatch) - (!!a.image || !!a.swatch) || byNewest(a, b));
        const four = list.slice(0, 4);
        return `<a class="card${rise(k + 1)}" href="#/c/${c.id}">
          <div class="mosaic">${four.map(e => plate(e)).join('')}${'<div class="blank"></div>'.repeat(4 - four.length)}</div>
          <span class="meta"><span class="label">${plural(list.length, 'entry', 'entries')}</span></span>
          <h3>${esc(c.name)}</h3>
          ${c.description ? `<p class="s">${esc(plain(c.description))}</p>` : ''}
        </a>`;
      }).join('')}
        <button type="button" class="card card--new${rise(cols.length + 1)}" data-new-collection><div class="mosaic">+ New collection</div></button>
      </div>`;
  }

  /* ---------- people overview ---------- */
  function peoplePage() {
    setBar([['People', '#/people'], ['All people']]);
    ui.lastScope = { hash: '#/people', label: 'People' };
    const ppl = people();
    main.innerHTML = `<header class="head${rise(0)}"><h1>People<sup>${ppl.length}</sup></h1>
        <div class="desc"><p>The artists, writers and voices behind your finds. Fill in “by” on a find to add someone.</p></div></header>
      ${ppl.length ? `<div class="people"><ol class="rows">${ppl.map((p, k) => {
        const ys = p.list.map(e => e.date).filter(Boolean).sort();
        const span = ys.length ? (year(ys[0]) === year(ys.at(-1)) ? year(ys[0]) : `${year(ys[0])}–${year(ys.at(-1))}`) : '';
        return `<li class="row${rise(k + 1)}"><a href="#/p/${encodeURIComponent(p.name)}">
          <span class="t">${esc(p.name)}${p.list.some(e => e.formative) ? '<span class="f-mark" title="Has formative entries"></span>' : ''}</span>
          <span class="k label">${plural(p.list.length, 'entry', 'entries')}</span>
          <span class="x label">${span}</span></a></li>`;
      }).join('')}</ol></div>` : '<div class="empty"><p>No people yet.</p><p class="hint">When you add a find, fill in who made it.</p></div>'}`;
  }

  /* ---------- entry page ---------- */
  function entryPage(r) {
    const e = byId(r.id);
    const k = KINDS[e.kind];
    const rel = relations();
    const conns = db.links.filter(l => l.a === e.id || l.b === e.id).map(l => ({ l, o: byId(l.a === e.id ? l.b : l.a) })).filter(x => x.o).sort((a, b) => byNewest(a.o, b.o));
    const back = backlinks(e.id);
    const pos = ui.lastList.indexOf(e.id);
    setBar([[esc(ui.lastScope.label), ui.lastScope.hash], [esc(e.title)]], `
      <button class="action" type="button" data-step="-1" ${pos < 1 ? 'disabled' : ''} aria-label="Previous entry"><span>←</span></button>
      <button class="action" type="button" data-step="1" ${pos < 0 || pos >= ui.lastList.length - 1 ? 'disabled' : ''} aria-label="Next entry"><span>→</span></button>
      <a class="action" href="#/e/${e.id}/edit"><span>Edit</span></a>`);
    const others = db.entries.filter(o => o.id !== e.id && !conns.some(c => c.o.id === o.id)).sort((a, b) => a.title.localeCompare(b.title));
    const isWork = e.kind === 'work';
    const lineage = isWork && r.tab === 'lineage';
    main.innerHTML = `<article class="entry">
      <div class="entry-main${rise(0)}">
        <div class="kicker"><span class="label label--ink">${e.kind === 'find' ? FORMATS[formatOf(e)].glyph : k.glyph} ${kindLabel(e)}</span><span class="label">${k.date} ${fmtDate(e.date)}</span>${e.formative ? '<span class="label" style="color:var(--signal);display:inline-flex;gap:8px;align-items:center"><span class="f-mark"></span>Formative</span>' : ''}</div>
        <h1>${titleHtml(e)}</h1>
        ${e.by ? `<p class="by">by <a href="#/p/${encodeURIComponent(e.by.trim())}">${esc(e.by)}</a></p>` : ''}
        ${isWork ? `<nav class="tabs" aria-label="Views of this work"><a href="#/e/${e.id}"${lineage ? '' : ' aria-current="page"'}>Entry</a><a href="#/e/${e.id}/lineage"${lineage ? ' aria-current="page"' : ''}>Lineage · ${neighbours(e.id, rel).length}</a></nav>` : ''}
        ${lineage ? lineageHtml(e, rel) : `
          ${e.image || e.swatch ? `<div class="hero-media">${plate(e, { big: true })}</div>` : ''}
          ${e.body ? `<div class="md">${renderMd(e.body, e)}</div>` : `<p class="muted">Nothing written yet. <a href="#/e/${e.id}/edit" style="text-decoration:underline">Write something</a>.</p>`}
          ${e.url ? `<a class="link" href="${esc(e.url)}" target="_blank" rel="noopener"><span>${esc(host(e.url) || e.url)} ↗</span></a>` : ''}
          ${e.file ? (e.file.data ? `<a class="link" href="${e.file.data}" download="${esc(e.file.name)}"><span>Download ${esc(e.file.name)}</span></a>` : `<p class="label">▤ ${esc(e.file.name)} · only the name is stored</p>`) : ''}`}
      </div>
      <aside class="entry-side${rise(1)}" aria-label="About this entry">
        <div class="meta-block">
          <button class="toggle" type="button" data-act="formative" aria-pressed="${!!e.formative}"><span class="box"></span>Formative</button>
          <p class="toggle-hint">${e.formative ? 'Marked as something that truly shaped you.' : 'Mark it if this truly shaped you.'}</p>
        </div>
        <div class="meta-block"><span class="label">Collections</span>
          ${e.collections.length ? `<div class="pills">${e.collections.map(colById).filter(Boolean).map(c => `<span class="pill"><a href="#/c/${c.id}">${esc(c.name)}</a><button type="button" class="rm" data-act="uncollect" data-id="${c.id}" aria-label="Remove from ${esc(c.name)}">×</button></span>`).join('')}</div>` : ''}
          <form class="inline-add" data-form="collect"><input name="name" list="col-names" placeholder="${e.collections.length ? 'Add to another…' : 'Add to a collection…'}" autocomplete="off" aria-label="Add to collection"><button class="action" type="submit"><span>Add</span></button></form>
          <datalist id="col-names">${db.collections.filter(c => !e.collections.includes(c.id)).map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
        </div>
        <div class="meta-block"><span class="label">Connections · ${conns.length}</span>
          ${conns.length ? `<ul class="conns">${conns.map(({ l, o }) => `<li class="conn"><div><a class="go" href="#/e/${o.id}">${titleHtml(o)}</a>${l.note ? `<p class="why">${esc(l.note)}</p>` : ''}</div><button type="button" class="rm" data-act="unlink" data-id="${l.id}" aria-label="Remove connection">×</button></li>`).join('')}</ul>` : ''}
          <form class="connect" data-form="connect">
            <span class="sel"><select name="to" aria-label="Connect to"><option value="">Connect to…</option>${others.map(o => `<option value="${o.id}">${esc(o.title)}</option>`).join('')}</select></span>
            <input name="note" placeholder="Why? (the part that matters)" aria-label="Why are they connected">
            <button class="action" type="submit"><span>Connect</span></button>
          </form>
        </div>
        ${back.length ? `<div class="meta-block"><span class="label">Mentioned in · ${back.length}</span><ul class="conns">${back.map(o => `<li class="conn"><a class="go" href="#/e/${o.id}">${titleHtml(o)}</a></li>`).join('')}</ul></div>` : ''}
        <div class="meta-block"><span class="label">Details</span><p class="v">${kindLabel(e)}<br>${k.date} ${fmtDate(e.date)}${e.by ? `<br>by ${esc(e.by)}` : ''}<br><span class="muted">Added ${fmtDate((e.created || '').slice(0, 10))}</span></p></div>
        <div class="entry-actions"><a class="action" href="#/e/${e.id}/edit"><span>Edit</span></a><button class="action action--danger" type="button" data-act="delete"><span>Delete</span></button></div>
      </aside>
    </article>`;
    if (lineage) { const box = $('.gens', main); if (box) { requestAnimationFrame(() => drawThreads(box)); wireThreads(box); } }
  }

  main.addEventListener('click', e => {
    if (e.target.closest('[data-new-collection]')) return newCollection();
    const dc = e.target.closest('[data-delete-collection]');
    if (dc) {
      const c = colById(dc.dataset.deleteCollection);
      if (c && confirm(`Delete the collection “${c.name}”? The entries in it stay in the archive.`)) {
        db.collections = db.collections.filter(x => x.id !== c.id);
        db.entries.forEach(x => { x.collections = x.collections.filter(id => id !== c.id); });
        persist(); toast('Collection deleted'); go('#/collections');
      }
      return;
    }
    const b = e.target.closest('[data-act]'); if (!b || !ui.route || ui.route.page !== 'entry') return;
    const entry = byId(ui.route.id);
    switch (b.dataset.act) {
      case 'formative': entry.formative = !entry.formative; break;
      case 'uncollect': entry.collections = entry.collections.filter(id => id !== b.dataset.id); break;
      case 'unlink': db.links = db.links.filter(l => l.id !== b.dataset.id); toast('Connection removed'); break;
      case 'delete': return deleteEntry(entry);
      default: return;
    }
    entry.updated = now(); persist(); renderSide(); renderMain();
  });
  main.addEventListener('submit', e => {
    const f = e.target.closest('[data-form]'); if (!f || ui.route.page !== 'entry') return;
    e.preventDefault();
    const entry = byId(ui.route.id), data = new FormData(f);
    if (f.dataset.form === 'collect') {
      const c = ensureCollection(data.get('name') || ''); if (!c) return $('input', f).focus();
      if (!entry.collections.includes(c.id)) entry.collections.push(c.id);
    } else if (f.dataset.form === 'connect') {
      if (!data.get('to')) return $('select', f).focus();
      db.links.push({ id: uid(), a: entry.id, b: data.get('to'), note: data.get('note').trim() });
      toast('Connected');
    }
    entry.updated = now(); persist(); renderSide(); renderMain();
    const again = $(`[data-form="${f.dataset.form}"] input`, main); if (again) again.focus();
  });

  function deleteEntry(entry) {
    const snap = { entry: JSON.parse(JSON.stringify(entry)), links: db.links.filter(l => l.a === entry.id || l.b === entry.id) };
    db.entries = db.entries.filter(x => x.id !== entry.id);
    db.links = db.links.filter(l => l.a !== entry.id && l.b !== entry.id);
    persist();
    go(ui.lastScope.hash);
    toast('Entry deleted', 'Undo', () => { db.entries.push(snap.entry); db.links.push(...snap.links); persist(); go(`#/e/${snap.entry.id}`); });
  }
  function step(d) { const pos = ui.lastList.indexOf(ui.route.id); const next = ui.lastList[pos + d]; if (pos > -1 && next) go(`#/e/${next}`); }

  /* ---------- lineage ---------- */
  function trace(root, rel, depth = 3) {
    const seen = new Set([root.id]);
    const gens = [[{ entry: root }]];
    for (let d = 1; d <= depth; d++) {
      const next = [];
      gens[d - 1].forEach(({ entry }) => neighbours(entry.id, rel).forEach(n => {
        if (!n.other || seen.has(n.other.id)) return;
        seen.add(n.other.id);
        next.push({ entry: n.other, via: entry, note: n.note, mention: n.mention });
      }));
      if (!next.length) break;
      gens.push(next);
    }
    return gens;
  }
  function lineageHtml(root, rel) {
    const gens = trace(root, rel);
    if (gens.length < 2) return `<div class="empty"><p>Nothing is connected to this work yet.</p><p class="hint">Connect it to what shaped it from the panel on the right, or mention entries in its text with [[double brackets]].</p></div>`;
    const names = ['This work', 'Shaped by', 'Behind those', 'Further back'];
    return `<p class="lineage-intro">Everything connected to this work, then what is connected to those. Hover an entry to see the path back.</p>
      <div class="gens" style="--n:${gens.length - 1}"><svg aria-hidden="true"></svg>
      ${gens.slice(1).map((g, i) => { const d = i + 1; return `<div class="gen">
        <div class="gen-head"><span class="label label--ink">0${d} · ${names[d]}</span><span class="label">${g.length}</span></div>
        ${g.map(({ entry, via, note, mention }, k) => `<a class="kin${rise(d * 3 + k)}" href="#/e/${entry.id}" data-kin="${entry.id}" data-parent="${via.id}"${mention ? ' data-mention' : ''}>
          ${plate(entry)}
          <span><span class="label">${kindLabel(entry)} · ${year(entry.date)}</span>
          <h3>${titleHtml(entry)}</h3>
          ${note ? `<p class="because">${esc(note)}</p>` : mention ? '<p class="because">mentioned in the text</p>' : ''}
          ${d > 1 ? `<p class="via label">via ${esc(via.title)}</p>` : ''}</span>
        </a>`).join('')}</div>`; }).join('')}</div>`;
  }
  function drawThreads(box) {
    const svg = $('svg', box);
    if (getComputedStyle(svg).display === 'none') return;
    const o = box.getBoundingClientRect();
    svg.innerHTML = $$('[data-parent]', box).map(k => {
      const p = $(`[data-kin="${k.dataset.parent}"]`, box); if (!p) return '';
      const a = p.getBoundingClientRect(), b = k.getBoundingClientRect();
      const x1 = a.right - o.left, y1 = a.top + a.height / 2 - o.top, x2 = b.left - o.left, y2 = b.top + b.height / 2 - o.top, m = (x2 - x1) / 2;
      return `<path class="${'mention' in k.dataset ? 'is-mention' : ''}" data-from="${k.dataset.parent}" data-to="${k.dataset.kin}" d="M${x1} ${y1} C${x1 + m} ${y1} ${x2 - m} ${y2} ${x2} ${y2}"/>`;
    }).join('');
  }
  function wireThreads(box) {
    const chain = id => { const out = [id]; let k = $(`[data-kin="${id}"]`, box); while (k && k.dataset.parent) { out.push(k.dataset.parent); k = $(`[data-kin="${k.dataset.parent}"]`, box); } return out; };
    $$('.kin', box).forEach(k => {
      k.addEventListener('mouseenter', () => {
        const ids = new Set(chain(k.dataset.kin));
        box.classList.add('is-focus');
        $$('.kin', box).forEach(x => x.classList.toggle('is-hot', ids.has(x.dataset.kin)));
        $$('path', box).forEach(p => p.classList.toggle('is-hot', ids.has(p.dataset.to) && ids.has(p.dataset.from)));
      });
      k.addEventListener('mouseleave', () => { box.classList.remove('is-focus'); $$('.is-hot', box).forEach(x => x.classList.remove('is-hot')); });
    });
  }

  /* ---------- graph ---------- */
  function graphHtml() {
    return `<div class="field-wrap${ui.animate ? ' rise' : ''}">
      <svg role="img" aria-label="Graph of entries and their connections"></svg>
      <div class="field-hud top">
        <div class="legend label"><span><i style="background:var(--paper)"></i>Find</span><span><i style="background:var(--on-dark-muted)"></i>Note</span><span><i class="ring"></i>Work</span><span><i style="background:var(--signal-light)"></i>Formative</span><span><i class="ls"></i>Connection</span><span><i class="ln"></i>Mention</span></div>
        <span class="label" id="field-count"></span>
      </div>
      <div class="field-hud bottom">
        <div class="readout" id="readout"><span class="label">Hover a point · drag to rearrange · click to open</span></div>
        <span class="label">Older ← → newer</span>
      </div></div>`;
  }
  let sim = null;
  function constellation(wrap, entries) {
    const svg = $('svg', wrap);
    const W = wrap.clientWidth, H = wrap.clientHeight, pad = 70;
    const ids = new Set(entries.map(e => e.id));
    const rel = relations().filter(r => ids.has(r.a) && ids.has(r.b));
    const order = [...entries].sort((a, b) => -byNewest(a, b)).map(e => e.id);
    const tx = e => entries.length < 2 ? W / 2 : pad + order.indexOf(e.id) / (entries.length - 1) * (W - pad * 2);
    const nodes = entries.map(e => {
      const deg = rel.filter(r => r.a === e.id || r.b === e.id).length;
      return { e, deg, home: tx(e), x: tx(e), y: H / 2 + (Math.random() - .5) * H * .5, vx: 0, vy: 0, r: e.kind === 'work' ? 9 : 3 + Math.sqrt(deg) * 1.6 };
    });
    const at = Object.fromEntries(nodes.map(n => [n.e.id, n]));
    const edges = rel.map(r => ({ s: at[r.a], t: at[r.b], r }));
    $('#field-count', wrap).textContent = `${plural(nodes.length, 'point')} · ${plural(edges.length, 'thread')}`;
    const NS = 'http://www.w3.org/2000/svg';
    const make = (tag, attrs = {}) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); return el; };
    const gE = make('g'), gN = make('g'); svg.append(gE, gN);
    edges.forEach(ed => { ed.el = make('line', { class: `e${ed.r.mention ? ' is-mention' : ''}` }); gE.append(ed.el); });
    nodes.forEach(n => {
      n.el = make('g', { class: `n k-${n.e.kind}${n.e.formative ? ' is-formative' : ''}${n.e.kind === 'work' || n.deg >= 3 || n.e.formative ? ' is-labelled' : ''}`, tabindex: 0, role: 'link', 'aria-label': n.e.title });
      n.el.append(make('circle', { class: 'halo', r: n.r + 9 }));
      if (n.e.kind === 'work') { n.el.append(make('circle', { class: 'ring', r: n.r })); n.el.append(make('circle', { class: 'core', r: 3 })); }
      else n.el.append(make('circle', { class: 'core', r: n.r }));
      const label = make('text', { y: n.r + 16, 'text-anchor': 'middle' });
      label.textContent = n.e.title.length > 30 ? n.e.title.slice(0, 29) + '…' : n.e.title;
      n.el.append(label); gN.append(n.el);
    });
    let alpha = 1, drag = null, moved = false;
    function tick() {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]; let dx = b.x - a.x, dy = b.y - a.y; const d2 = dx * dx + dy * dy || 1, d = Math.sqrt(d2), f = 5200 / d2 * alpha;
          dx /= d; dy /= d; a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
        }
        a.vx += (a.home - a.x) * .006 * alpha; a.vy += (H / 2 - a.y) * .0025 * alpha;
      }
      edges.forEach(({ s, t }) => { const dx = t.x - s.x, dy = t.y - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 130) * .012 * alpha; s.vx += dx / d * f; s.vy += dy / d * f; t.vx -= dx / d * f; t.vy -= dy / d * f; });
      nodes.forEach(n => { if (n === drag) return; n.vx *= .62; n.vy *= .62; n.x = Math.max(pad / 2, Math.min(W - pad / 2, n.x + n.vx)); n.y = Math.max(60, Math.min(H - 90, n.y + n.vy)); });
      draw();
      alpha = Math.max(alpha * .986, drag ? .25 : 0);
      if (alpha > .008 && sim) sim.raf = requestAnimationFrame(tick);
    }
    function draw() {
      edges.forEach(ed => { ed.el.setAttribute('x1', ed.s.x); ed.el.setAttribute('y1', ed.s.y); ed.el.setAttribute('x2', ed.t.x); ed.el.setAttribute('y2', ed.t.y); });
      nodes.forEach(n => n.el.setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`));
    }
    const readout = $('#readout', wrap), idle = readout.innerHTML;
    function focus(n) {
      wrap.classList.toggle('is-focus', !!n);
      const near = n ? new Set([n, ...edges.filter(ed => ed.s === n || ed.t === n).flatMap(ed => [ed.s, ed.t])]) : new Set();
      nodes.forEach(m => m.el.classList.toggle('is-hot', near.has(m)));
      edges.forEach(ed => ed.el.classList.toggle('is-hot', !!n && (ed.s === n || ed.t === n)));
      const txt = n && excerpt(n.e.body);
      readout.innerHTML = n ? `<span class="label">${kindLabel(n.e)} · ${fmtDate(n.e.date)} · ${plural(n.deg, 'thread')}</span><span class="t">${titleHtml(n.e)}</span>${txt ? `<span class="b">${esc(txt.length > 140 ? txt.slice(0, 139) + '…' : txt)}</span>` : ''}` : idle;
    }
    const point = ev => { const b = svg.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; };
    nodes.forEach(n => {
      n.el.addEventListener('pointerdown', ev => { drag = n; moved = false; svg.setPointerCapture(ev.pointerId); svg.classList.add('is-dragging'); alpha = Math.max(alpha, .25); if (sim) { cancelAnimationFrame(sim.raf); tick(); } });
      n.el.addEventListener('pointerenter', () => !drag && focus(n));
      n.el.addEventListener('pointerleave', () => !drag && focus(null));
      n.el.addEventListener('focus', () => focus(n));
      n.el.addEventListener('blur', () => focus(null));
      n.el.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(`#/e/${n.e.id}`); } });
    });
    svg.addEventListener('pointermove', ev => { if (!drag) return; const [x, y] = point(ev); if (Math.abs(x - drag.x) + Math.abs(y - drag.y) > 2) moved = true; drag.x = x; drag.y = y; drag.home = x; });
    svg.addEventListener('pointerup', () => { svg.classList.remove('is-dragging'); if (drag && !moved) go(`#/e/${drag.e.id}`); drag = null; });
    sim = { raf: requestAnimationFrame(tick) };
  }

  /* ---------- hover preview ---------- */
  const preview = $('#preview'), pdot = $('#preview-dot');
  let mx = 0, my = 0;
  const place = () => {
    const w = preview.offsetWidth, h = preview.offsetHeight;
    const x = mx + 28 + w > innerWidth ? mx - 28 - w : mx + 28;
    const y = Math.max(76, Math.min(innerHeight - h - 12, my - h / 2));
    preview.style.transform = `translate(${x}px, ${y}px)`; pdot.style.left = mx + 'px'; pdot.style.top = my + 'px';
  };
  addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; if (preview.classList.contains('is-visible')) place(); }, { passive: true });
  function showPreview(e) { if (!e) return; preview.innerHTML = plate(e); preview.classList.add('is-visible'); pdot.classList.add('is-visible'); place(); }
  function hidePreview() { preview.classList.remove('is-visible'); pdot.classList.remove('is-visible'); }

  /* ================= editor ================= */
  function editPage(r) {
    const existing = r.id ? byId(r.id) : null;
    if (!ui.draft || ui.draft._route !== location.hash) {
      const preset = ui.preset || {}; ui.preset = null;
      const ctx = ui.lastScope.hash.match(/^#\/c\/([^?]+)/);
      ui.draft = existing ? JSON.parse(JSON.stringify(existing)) : {
        id: uid(), kind: preset.kind || r.kind, title: preset.title || r.title || '', body: preset.body || '', url: preset.url || '', by: '',
        image: preset.image || null, file: preset.file || null, swatch: null, date: today(), formative: false,
        collections: ctx && colById(ctx[1]) ? [ctx[1]] : [], assets: {}, created: now(), updated: now(),
      };
      ui.draft._route = location.hash;
      ui.dirty = !!(preset.url || preset.image || preset.file || preset.body);
    }
    const d = ui.draft;
    setBar(existing ? [[esc(ui.lastScope.label), ui.lastScope.hash], [esc(existing.title), `#/e/${existing.id}`], ['Edit']] : [[esc(ui.lastScope.label), ui.lastScope.hash], [`New ${KINDS[d.kind].label.toLowerCase()}`]],
      `<span class="label">${existing ? 'Editing' : 'Not saved yet'}</span>`);
    main.innerHTML = `<form class="edit-page" id="edit-form" autocomplete="off" novalidate>
      <div class="kind-pick" role="radiogroup" aria-label="Kind"><span class="label">Kind</span>
        ${KIND_ORDER.map(k => `<label><input type="radio" name="kind" value="${k}"${d.kind === k ? ' checked' : ''}><span class="p"><span class="g">${KINDS[k].glyph}</span>${KINDS[k].label}</span></label>`).join('')}
        <span class="help" id="kind-help">${KINDS[d.kind].help}</span>
      </div>
      <label class="visually-hidden" for="e-title">Title</label>
      <input class="title-input" id="e-title" name="title" value="${esc(d.title)}" placeholder="Title">
      <div class="edit-grid">
        <div class="edit-body">
          <div class="editor" data-mode="${prefs.mode}">
            <div class="editor-bar" role="toolbar" aria-label="Formatting">
              <button type="button" data-md="h2" title="Heading">H2</button><button type="button" data-md="h3" title="Subheading">H3</button>
              <span class="sep"></span>
              <button type="button" data-md="bold" title="Bold (⌘B)"><b>B</b></button><button type="button" data-md="italic" title="Italic (⌘I)"><i>I</i></button>
              <button type="button" data-md="quote" title="Quote">“</button>
              <span class="sep"></span>
              <button type="button" data-md="ul" title="List">•</button><button type="button" data-md="ol" title="Numbered list" class="tool-extra">1.</button><button type="button" data-md="task" title="Checklist" class="tool-extra">☐</button>
              <span class="sep"></span>
              <button type="button" data-md="link" title="Web link (⌘K)">↗</button><button type="button" data-md="wiki" title="Link to an entry">[[ ]]</button><button type="button" data-md="image" title="Insert image">◐</button>
              <button type="button" data-md="code" title="Code" class="tool-extra">&lt;/&gt;</button><button type="button" data-md="hr" title="Divider" class="tool-extra">—</button>
              <div class="modes" role="group" aria-label="Editor layout">${['write', 'split', 'preview'].map(m => `<button type="button" data-mode="${m}" aria-pressed="${prefs.mode === m}">${m}</button>`).join('')}</div>
            </div>
            <div class="editor-panes">
              <div class="pane-write"><label class="visually-hidden" for="e-body">Text, in Markdown</label><textarea id="e-body" name="body" spellcheck="true" placeholder="${esc(KINDS[d.kind].placeholder)}">${esc(d.body)}</textarea><div class="suggest" id="suggest" role="listbox" hidden></div></div>
              <div class="pane-preview" aria-label="Preview"><div class="md" id="e-preview"></div></div>
            </div>
            <input type="file" id="md-image" accept="image/*" hidden>
          </div>
        </div>
        <div class="edit-meta">
          <div class="fieldset" data-for="find"><label class="label" for="e-by">By</label><input id="e-by" name="by" list="people-names" value="${esc(d.by)}" placeholder="Artist, writer, source"><datalist id="people-names">${people().map(p => `<option value="${esc(p.name)}">`).join('')}</datalist></div>
          <div class="fieldset" data-for="find work"><label class="label" for="e-url">Link</label><input id="e-url" name="url" type="url" value="${esc(d.url)}" placeholder="https://"></div>
          <div class="fieldset"><label class="label" for="e-date" id="date-label">${KINDS[d.kind].date}</label><input id="e-date" name="date" type="date" value="${esc(d.date)}"></div>
          <div class="fieldset"><span class="label">Image or file</span>
            <label class="dropbox" id="dropbox"><input type="file" id="e-media" hidden><span id="dropbox-inner" style="display:contents"></span></label></div>
          <div class="fieldset"><span class="label">Collections</span>
            <div class="pills" id="e-cols"></div>
            <div class="inline-add"><input id="e-col" list="col-names-e" placeholder="Add to a collection…" aria-label="Add to collection"><datalist id="col-names-e">${db.collections.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist></div></div>
          <div class="fieldset"><button class="toggle" type="button" id="e-formative" aria-pressed="${!!d.formative}"><span class="box"></span>Formative</button><p class="toggle-hint">Something that truly shaped you.</p></div>
        </div>
      </div>
      <div class="edit-actions">
        <button class="action action--primary" type="submit"><span class="dot"></span><span>${existing ? 'Save changes' : 'Save entry'}</span></button>
        <button class="action" type="button" id="e-cancel"><span>Cancel</span></button>
        <span class="label hint">⌘S save · Esc cancel · [[ link an entry</span>
      </div>
    </form>`;
    wireEditor(existing);
  }

  function wireEditor(existing) {
    const form = $('#edit-form'), d = ui.draft;
    const ta = $('#e-body'), pv = $('#e-preview'), editor = $('.editor', form);
    const dirty = () => { ui.dirty = true; };
    const syncKind = () => {
      $$('[data-for]', form).forEach(f => { f.hidden = !f.dataset.for.split(' ').includes(d.kind); });
      $('#kind-help').textContent = KINDS[d.kind].help;
      $('#date-label').textContent = KINDS[d.kind].date;
      ta.placeholder = KINDS[d.kind].placeholder;
    };
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, innerHeight * .6) + 'px'; };
    let pt;
    const updatePreview = () => { clearTimeout(pt); pt = setTimeout(() => { const html = renderMd(ta.value, d); pv.innerHTML = html || 'The preview appears here'; pv.classList.toggle('is-empty', !html); }, 90); };
    const drawMedia = () => {
      $('#dropbox-inner').innerHTML = d.image ? `<img src="${d.image}" alt=""><button type="button" class="label clear" data-clear>Remove</button>`
        : d.file ? `<span class="file"><span class="label">File · ${Math.max(1, Math.round((d.file.size || 0) / 1024))} KB</span><span>${esc(d.file.name)}</span></span><button type="button" class="label clear" data-clear>Remove</button>`
        : '<span class="empty-drop"><span class="label">Optional</span><b>Drop, paste or choose</b></span>';
    };
    const drawCols = () => {
      $('#e-cols').innerHTML = d.collections.map(colById).filter(Boolean).map(c => `<span class="pill">${esc(c.name)}<button type="button" class="rm" data-uncol="${c.id}" aria-label="Remove from ${esc(c.name)}">×</button></span>`).join('');
    };
    syncKind(); drawMedia(); drawCols(); updatePreview(); requestAnimationFrame(grow);
    (d.title ? ta : $('#e-title')).focus({ preventScroll: true });

    form.addEventListener('input', e => {
      if (e.target.name === 'title') d.title = e.target.value;
      if (e.target.name === 'by') d.by = e.target.value;
      if (e.target.name === 'url') d.url = e.target.value;
      if (e.target.name === 'date') d.date = e.target.value;
      if (e.target === ta) { d.body = ta.value; grow(); updatePreview(); suggest(); }
      if (e.target.id !== 'e-col') dirty();
    });
    form.addEventListener('change', e => { if (e.target.name === 'kind') { d.kind = e.target.value; syncKind(); dirty(); } });
    $('#e-formative').addEventListener('click', e => { d.formative = !d.formative; e.currentTarget.setAttribute('aria-pressed', String(d.formative)); dirty(); });
    const colInput = $('#e-col');
    const addCol = () => { const c = ensureCollection(colInput.value); if (c && !d.collections.includes(c.id)) d.collections.push(c.id); colInput.value = ''; drawCols(); dirty(); };
    colInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCol(); } });
    colInput.addEventListener('change', () => { if (db.collections.some(c => norm(c.name) === norm(colInput.value))) addCol(); });
    $('#e-cols').addEventListener('click', e => { const b = e.target.closest('[data-uncol]'); if (b) { d.collections = d.collections.filter(id => id !== b.dataset.uncol); drawCols(); dirty(); } });
    $('#dropbox').addEventListener('click', e => { if (e.target.closest('[data-clear]')) { e.preventDefault(); d.image = null; d.file = null; drawMedia(); dirty(); } });
    $('#e-media').addEventListener('change', async e => { const f = e.target.files[0]; if (f) { Object.assign(d, { image: null, file: null }, await readMedia(f)); drawMedia(); dirty(); } e.target.value = ''; });
    $('#e-cancel').addEventListener('click', cancelEdit);
    form.addEventListener('submit', e => { e.preventDefault(); saveDraft(existing); });
    form.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveDraft(existing); }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.id !== 'e-col') e.preventDefault();
    });
    ui.setMedia = media => { Object.assign(d, { image: null, file: null }, media); drawMedia(); dirty(); };

    // layout modes
    $('.modes', form).addEventListener('click', e => {
      const b = e.target.closest('[data-mode]'); if (!b) return;
      prefs.mode = b.dataset.mode; savePrefs(); editor.dataset.mode = prefs.mode;
      $$('.modes button', form).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      requestAnimationFrame(grow);
    });

    // toolbar
    const sel = () => [ta.selectionStart, ta.selectionEnd];
    const insert = (text, a = ta.selectionStart, b = ta.selectionEnd, selectFrom, selectTo) => {
      ta.focus(); ta.setSelectionRange(a, b);
      if (!document.execCommand('insertText', false, text)) { ta.setRangeText(text, a, b, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
      if (selectFrom != null) ta.setSelectionRange(a + selectFrom, a + (selectTo ?? selectFrom));
    };
    const wrap = (pre, post = pre, ph = 'text') => { const [a, b] = sel(); const t = ta.value.slice(a, b) || ph; insert(pre + t + post, a, b, pre.length, pre.length + t.length); };
    const linePrefix = (prefix, numbered) => {
      const [a, b] = sel(); const start = ta.value.lastIndexOf('\n', a - 1) + 1;
      const lines = ta.value.slice(start, b).split('\n');
      const out = lines.map((l, i) => (numbered ? `${i + 1}. ` : prefix) + l.replace(/^(#{1,6} |> |[-*+] (\[[ x]\] )?|\d+\. )/, '')).join('\n');
      insert(out, start, b, out.length);
    };
    $('.editor-bar', form).addEventListener('click', e => {
      const b = e.target.closest('[data-md]'); if (!b) return;
      ({
        h2: () => linePrefix('## '), h3: () => linePrefix('### '),
        bold: () => wrap('**'), italic: () => wrap('_'), code: () => wrap('`', '`', 'code'),
        quote: () => linePrefix('> '), ul: () => linePrefix('- '), ol: () => linePrefix('', true), task: () => linePrefix('- [ ] '),
        link: () => { const [a, bb] = sel(); const t = ta.value.slice(a, bb) || 'text'; insert(`[${t}](https://)`, a, bb, t.length + 3, t.length + 11); },
        wiki: () => { const [a, bb] = sel(); const t = ta.value.slice(a, bb); insert(`[[${t}`, a, bb); suggest(); },
        hr: () => insert('\n\n---\n\n'),
        image: () => $('#md-image').click(),
      })[b.dataset.md]();
    });
    const insertImage = async file => {
      const data = await downscale(file, 1600), id = uid();
      d.assets = d.assets || {}; d.assets[id] = data;
      insert(`\n![${file.name.replace(/\.[^.]+$/, '')}](asset:${id})\n`);
    };
    $('#md-image').addEventListener('change', async e => { const f = e.target.files[0]; if (f) await insertImage(f); e.target.value = ''; });
    ta.addEventListener('paste', async e => {
      const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); e.stopPropagation(); await insertImage(f); }
    });

    // keys: shortcuts, list continuation, [[ suggestions
    const sug = $('#suggest');
    let sugItems = [], sugIndex = 0, sugStart = -1;
    ta.addEventListener('keydown', e => {
      if (!sug.hidden) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sugIndex = (sugIndex + (e.key === 'ArrowDown' ? 1 : -1) + sugItems.length) % sugItems.length; drawSug(); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(sugItems[sugIndex]); return; }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hideSug(); return; }
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); wrap('**'); }
      if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); wrap('_'); }
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); $('[data-md="link"]', form).click(); }
      if (e.key === 'Enter' && !e.shiftKey && !mod) {
        const s = ta.selectionStart, start = ta.value.lastIndexOf('\n', s - 1) + 1, line = ta.value.slice(start, s);
        const m = line.match(/^(\s*)([-*+] \[[ x]\] |[-*+] |(\d+)\. |> )/);
        if (m) {
          e.preventDefault();
          if (line.trim() === m[2].trim()) insert('', start, s);
          else insert('\n' + m[1] + (m[3] ? `${+m[3] + 1}. ` : m[2].replace('[x]', '[ ]')));
        }
      }
    });
    function suggest() {
      const s = ta.selectionStart, m = ta.value.slice(0, s).match(/\[\[([^\]\n|]*)$/);
      if (!m) return hideSug();
      sugStart = s - m[1].length;
      const q = norm(m[1]);
      sugItems = db.entries.filter(x => x.id !== d.id && (!q || norm(x.title).includes(q)))
        .sort((a, b) => norm(a.title).indexOf(q) - norm(b.title).indexOf(q) || a.title.localeCompare(b.title)).slice(0, 7);
      if (m[1].trim() && !byTitle(m[1])) sugItems.push({ id: null, title: m[1].trim(), isNew: true });
      if (!sugItems.length) return hideSug();
      sugIndex = 0; drawSug();
      const c = caret(ta);
      sug.style.top = `${ta.offsetTop + c.top + c.lh + 2}px`;
      sug.style.left = `${Math.max(12, Math.min(c.left, ta.clientWidth - 300))}px`;
      sug.hidden = false;
    }
    function drawSug() {
      sug.innerHTML = sugItems.map((x, i) => `<button type="button" role="option" aria-selected="${i === sugIndex}" data-i="${i}">${x.isNew ? `Link to a new note “${esc(x.title)}”` : esc(x.title)}<span class="label">${x.isNew ? '+' : kindLabel(x)}</span></button>`).join('');
    }
    function hideSug() { sug.hidden = true; sugItems = []; }
    function pick(x) {
      if (!x) return;
      const s = ta.selectionStart, close = ta.value.slice(s).startsWith(']]') ? 2 : 0;
      insert(`${x.title}]]`, sugStart, s + close);
      hideSug();
    }
    sug.addEventListener('mousedown', e => { e.preventDefault(); const b = e.target.closest('[data-i]'); if (b) pick(sugItems[+b.dataset.i]); });
    ta.addEventListener('blur', () => setTimeout(hideSug, 120));
    ta.addEventListener('click', suggest);
  }

  function caret(ta) {
    const div = document.createElement('div'), cs = getComputedStyle(ta);
    ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingLeft', 'paddingRight', 'width', 'boxSizing', 'tabSize'].forEach(p => { div.style[p] = cs[p]; });
    Object.assign(div.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', top: '0', left: '-9999px' });
    div.textContent = ta.value.slice(0, ta.selectionStart);
    const span = document.createElement('span'); span.textContent = '​'; div.append(span);
    document.body.append(div);
    const out = { top: span.offsetTop, left: span.offsetLeft + ta.offsetLeft, lh: parseFloat(cs.lineHeight) || 24 };
    div.remove();
    return out;
  }

  function saveDraft(existing) {
    const d = ui.draft;
    let title = (d.title || '').trim();
    if (!title && d.file) title = d.file.name.replace(/\.[^.]+$/, '');
    if (!title && d.url) title = host(d.url);
    if (!title && d.body.trim()) title = plain(d.body).split(/[.!?\n]/)[0].slice(0, 80).trim();
    if (!title) { const t = $('#e-title'); t.focus(); t.placeholder = 'Give it a title first'; return; }
    // keep [[links]] pointing at this entry when its title changes
    if (existing && norm(existing.title) !== norm(title)) {
      const re = new RegExp(`\\[\\[${existing.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\|[^\\]]+)?\\]\\]`, 'gi');
      let n = 0;
      db.entries.forEach(x => { if (x.id !== existing.id) x.body = (x.body || '').replace(re, (m, alias) => { n++; return `[[${title}${alias || ''}]]`; }); });
      if (n) setTimeout(() => toast(`Updated ${plural(n, 'link')} to the new title`), 2600);
    }
    // forget images that were removed from the text
    if (d.assets) Object.keys(d.assets).forEach(id => { if (!d.body.includes(`asset:${id}`)) delete d.assets[id]; });
    const clean = { ...d, title, updated: now() };
    delete clean._route;
    if (clean.kind !== 'find' && !(existing && existing.by)) clean.by = '';
    if (existing) Object.assign(existing, clean); else db.entries.push(clean);
    persist();
    ui.dirty = false; ui.draft = null; ui.skipGuard = true;
    toast(existing ? 'Saved' : 'Added to the archive');
    go(`#/e/${clean.id}`);
  }
  function cancelEdit() {
    if (ui.dirty && !confirm('Discard your changes?')) return;
    const r = ui.route; ui.dirty = false; ui.skipGuard = true;
    go(r.id ? `#/e/${r.id}` : ui.lastScope.hash);
  }

  /* ================= media ================= */
  async function readMedia(file) {
    if (file.type.startsWith('image/')) return { image: await downscale(file, 1600) };
    return { file: { name: file.name, size: file.size, data: file.size < 4e6 ? await asDataUrl(file) : null } };
  }
  const asDataUrl = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  async function downscale(file, max) {
    const img = new Image(); img.src = await asDataUrl(file); await img.decode();
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', .85);
  }

  /* ================= receiving: drop and paste anywhere ================= */
  let depth = 0;
  const dz = $('#dropzone');
  addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) { depth++; dz.classList.add('is-on'); } });
  addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; dz.classList.remove('is-on'); } });
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', async e => {
    e.preventDefault(); depth = 0; dz.classList.remove('is-on');
    const files = [...e.dataTransfer.files]; if (!files.length) return;
    if (ui.route.page === 'edit') return ui.setMedia(await readMedia(files[0]));
    if (files.length === 1) { const media = await readMedia(files[0]); ui.preset = { kind: 'find', title: files[0].name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), ...media }; return go('#/new/find'); }
    const ctx = ui.route.scope === 'collection' ? [ui.route.id] : [];
    for (const f of files) db.entries.push({ id: uid(), kind: 'find', title: f.name.replace(/\.[^.]+$/, ''), body: '', url: '', by: '', swatch: null, date: today(), formative: false, collections: [...ctx], assets: {}, created: now(), updated: now(), image: null, file: null, ...(await readMedia(f)) });
    persist(); render(); toast(`Added ${plural(files.length, 'find')}`);
  });
  addEventListener('paste', async e => {
    if (isTyping(document.activeElement) || ui.route.page === 'edit') return;
    const file = [...(e.clipboardData?.files || [])][0], text = e.clipboardData?.getData('text/plain')?.trim();
    if (file) { e.preventDefault(); ui.preset = { kind: 'find', ...(await readMedia(file)) }; return go('#/new/find'); }
    if (!text) return;
    e.preventDefault();
    if (/^https?:\/\/\S+$/.test(text)) { ui.preset = { kind: 'find', url: text, title: host(text) }; go('#/new/find'); }
    else { ui.preset = { kind: 'note', body: text }; go('#/new/note'); }
  });

  /* ================= search, keys, routing ================= */
  const search = $('#search');
  search.addEventListener('input', () => {
    ui.query = search.value.trim();
    if (ui.route.page === 'edit') return;
    renderSide(); renderMain();
  });
  search.addEventListener('keydown', e => {
    if (e.key === 'Escape') { search.value = ''; ui.query = ''; renderSide(); renderMain(); search.blur(); }
    if (e.key === 'Enter') { const first = $('.row a, .tile', main); if (first) { first.click(); if (innerWidth <= 1000) closeSide(); } }
  });

  addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!newMenu.hidden) return toggleNew(false);
      if (side.classList.contains('is-open')) return closeSide();
      if (ui.route.page === 'edit' && e.target.id !== 'e-body') return cancelEdit();
      return;
    }
    if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!newMenu.hidden && 'nfw'.includes(e.key)) { e.preventDefault(); toggleNew(false); if (innerWidth <= 1000) closeSide(); return go(`#/new/${{ n: 'note', f: 'find', w: 'work' }[e.key]}`); }
    if (ui.route.page === 'edit') return;
    if (e.key === 'n') { e.preventDefault(); if (innerWidth <= 1000) openSide(); toggleNew(true); }
    else if (e.key === '/') { e.preventDefault(); if (innerWidth <= 1000) openSide(); search.focus(); }
    else if (ui.route.page === 'entry') {
      if (e.key === 'ArrowRight' || e.key === 'j') step(1);
      if (e.key === 'ArrowLeft' || e.key === 'k') step(-1);
      if (e.key === 'e') go(`#/e/${ui.route.id}/edit`);
    } else if (ui.route.page === 'list' && '123'.includes(e.key)) { prefs.display = Object.keys(DISPLAYS)[+e.key - 1]; savePrefs(); ui.animate = true; renderMain(); }
  });

  addEventListener('hashchange', () => {
    const leaving = ui.route && ui.route.page === 'edit' && ui.draft && ui.draft._route !== location.hash;
    if (leaving && ui.dirty && !ui.skipGuard && !confirm('Leave without saving? Your changes will be lost.')) { history.replaceState(null, '', ui.draft._route); return; }
    if (leaving) { ui.draft = null; ui.dirty = false; }
    ui.skipGuard = false;
    closeSide(); if (!newMenu.hidden) toggleNew(false);
    if (ui.query) { ui.query = ''; search.value = ''; }
    ui.animate = true;
    render();
    scrollTo({ top: 0 });
    if (ui.route.page !== 'edit') main.focus({ preventScroll: true });
  });
  addEventListener('beforeunload', e => { if (ui.dirty) { e.preventDefault(); e.returnValue = ''; } });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (ui.route && ui.route.page !== 'edit' && (prefs.display === 'graph' || ui.route.tab === 'lineage')) renderMain(); }, 150); });

  /* ================= footer: export, import, examples ================= */
  $('#export').addEventListener('click', () => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })), download: `memory-archive-${today()}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('Exported');
  });
  $('#import').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const next = data.version === 2 ? data : Array.isArray(data.items) ? migrate(data) : null;
      if (!next || !Array.isArray(next.entries)) throw new Error('not an archive');
      if (confirm(`Replace this archive with ${plural(next.entries.length, 'entry', 'entries')} from ${file.name}?`)) { db = next; await persist(); go('#/all'); toast('Imported'); }
    } catch { toast('That file is not a Memory Archive export'); }
    e.target.value = '';
  });
  $('#clear-examples').addEventListener('click', () => {
    const n = db.entries.filter(x => x.example).length;
    if (!n) return toast('No examples left');
    if (!confirm(`Remove the ${n} example entries and example collections? Your own entries stay.`)) return;
    const ex = new Set(db.entries.filter(x => x.example).map(x => x.id));
    db.entries = db.entries.filter(x => !ex.has(x.id));
    db.links = db.links.filter(l => !ex.has(l.a) && !ex.has(l.b));
    db.collections = db.collections.filter(c => !c.example || inCollection(c.id).length);
    persist(); go('#/all'); toast('Examples removed');
  });

  let tt;
  function toast(msg, actionLabel, action) {
    const t = $('#toast');
    t.innerHTML = `<span class="dot"></span>${esc(msg)}${actionLabel ? `<button type="button" class="label" style="color:var(--signal-light);margin-left:6px">${esc(actionLabel)}</button>` : ''}`;
    if (action) $('button', t).addEventListener('click', () => { t.classList.remove('is-on'); action(); });
    t.classList.add('is-on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('is-on'), actionLabel ? 6000 : 2400);
  }

  /* ================= example content ================= */
  function seed() {
    const C = (id, name, description) => ({ id, name, description, created: now(), example: true });
    const collections = [
      C('c-rep', 'Repetition', 'Doing the same thing again until it changes. Drawing one line, stitching one stitch, photographing one horizon.'),
      C('c-sea', 'The sea', 'Tides, horizons and what water leaves behind.'),
      C('c-line', 'Line & thread', 'Lines as drawing, walking, weaving and writing. After **Tim Ingold**.'),
      C('c-fam', 'Family', 'Where I come from, and what was in the drawers.'),
      C('c-quiet', 'Quiet', 'Work that lowers the volume, and what happens when it doesn’t.'),
    ];
    const E = (id, kind, title, date, cols, body, more = {}) => ({ id, kind, title, date, collections: cols, body, url: '', by: '', image: null, file: null, swatch: null, formative: false, assets: {}, created: date + 'T12:00:00.000Z', updated: date + 'T12:00:00.000Z', example: true, ...more });
    const entries = [
      E('w1', 'work', 'Tidelines', '2025-03-14', ['c-rep', 'c-sea'],
`Twelve drawings of the line the sea leaves behind. Pencil on paper, 50 × 70 cm each.

## Process
Every morning at low tide I walked the same stretch of beach and drew the highest line of debris, from memory, once I was home.

- It started with a photo: [[Low tide, early morning]]
- The idea behind it: [[Repetition is a way of paying attention]]
- The title came from something [[You only notice the sea when it leaves|overheard on a train]]

> The drawings are not of the sea. They are of where it was.`, { swatch: ['#d9d4c7', '#2e2d29'] }),
      E('w2', 'work', 'Thread study', '2023-09-02', ['c-line', 'c-fam', 'c-quiet'],
`One red thread across a white room, at hip height. People walked around it as if it were a wall.

The thread came from [[Grandmother’s embroidery drawer]].`, { swatch: ['#ece9e1', '#ff3b1f'] }),
      E('n1', 'note', 'Repetition is a way of paying attention', '2020-01-08', ['c-rep'],
`Not boredom. The tenth time you draw a line you finally **see** it.

## Where this comes from
- [[Agnes Martin]]: grids that feel like breathing
- [[4′33″]]: framing what is already there
- The samples in [[Grandmother’s embroidery drawer]], the same stitch hundreds of times

## Questions
1. When does repetition become a ritual instead of a method?
2. Is there a number of times after which a gesture belongs to you?

- [x] Try one drawing a day for a month
- [ ] Write down what changes each week`, { formative: true }),
      E('n2', 'note', 'What if the archive itself is the work?', '2026-09-30', [],
`Keeping, sorting, connecting. Maybe that is already the practice.

Her drawer was an archive too: [[Grandmother’s embroidery drawer]]. Next step: a piece about [[An archive of gestures]].`),
      E('n3', 'note', 'A crowded museum where I couldn’t see anything', '2022-05-21', ['c-quiet'],
'Too many works shouting at once. Left after twenty minutes, irritated.\n\nI want work that **lowers the volume**.'),
      E('n4', 'note', 'Art school critique: “too decorative”', '2014-03-18', ['c-quiet'],
'Still stings. Probably why I stripped everything back afterwards, and why [[Agnes Martin]] landed the way she did.', { formative: true }),
      E('n5', 'note', 'Sketchbook, spring', '2024-04-12', ['c-line', 'c-rep'], 'First pages where the lines start repeating.', { file: { name: 'sketchbook-spring.pdf', size: 0, data: null } }),
      E('f1', 'find', 'Agnes Martin', '2016-11-20', ['c-rep', 'c-quiet'], 'Grids that feel like breathing. Return to this whenever the work gets loud.', { url: 'https://en.wikipedia.org/wiki/Agnes_Martin', by: 'Agnes Martin', formative: true }),
      E('f2', 'find', 'Seascapes', '2018-06-11', ['c-sea', 'c-rep'], 'Every photograph the same horizon, and still each one a different day.', { url: 'https://en.wikipedia.org/wiki/Hiroshi_Sugimoto', by: 'Hiroshi Sugimoto' }),
      E('f3', 'find', 'Lines: A Brief History', '2021-02-03', ['c-line'], 'Walking, weaving, writing and drawing as the same activity: making a line.', { url: 'https://en.wikipedia.org/wiki/Tim_Ingold', by: 'Tim Ingold' }),
      E('f4', 'find', '4′33″', '2012-04-09', ['c-quiet'], 'Framing what is already there instead of adding something.', { url: 'https://en.wikipedia.org/wiki/4%E2%80%B233%E2%80%B3', by: 'John Cage', formative: true }),
      E('f5', 'find', 'Low tide, early morning', '2019-10-27', ['c-sea'], 'Ridges in the sand that look exactly like the drawings I didn’t know I would make.', { swatch: ['#c9c3b3', '#254fff'] }),
      E('f6', 'find', 'Grandmother’s embroidery drawer', '1998-07-15', ['c-fam', 'c-rep'], 'Hundreds of half-finished samples. Nobody was meant to see them.', { swatch: ['#0b0b0c', '#b8b6ae'], formative: true }),
      E('f7', 'find', 'You only notice the sea when it leaves', '2024-11-02', [], 'Wrote it on my hand.', { by: 'Overheard on a train' }),
    ];
    const L = (a, b, note) => ({ id: uid(), a, b, note });
    const links = [
      L('w1', 'f5', 'The sand ridges were the first drawing. I just copied them for a year.'),
      L('w1', 'f1', 'Permission to repeat without apologising.'),
      L('w1', 'f2', 'Same subject again and again, until it becomes about time.'),
      L('w1', 'n5', 'Where it started on paper.'),
      L('w2', 'f3', 'A line can be a thread, a walk, a wall.'),
      L('w2', 'n3', 'Wanted one quiet gesture in a whole room.'),
      L('f1', 'n4', 'After that critique, she showed me that less could be enough.'),
      L('f1', 'f2', 'Both make the same image over and over.'),
      L('n5', 'f3', ''),
    ];
    return { version: 2, entries, collections, links };
  }

  /* ================= boot ================= */
  (async () => {
    let data = await store.get('db');
    if (!data) {
      let legacy = null;
      try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY)); } catch { /* none */ }
      data = legacy && Array.isArray(legacy.items) && legacy.items.some(i => !i.example) ? migrate(legacy) : seed();
      db = data; await persist();
    }
    db = migrate(data);
    db.entries.forEach(e => { e.collections ||= []; e.assets ||= {}; });
    if (!location.hash) history.replaceState(null, '', '#/all');
    render();
  })();
})();
