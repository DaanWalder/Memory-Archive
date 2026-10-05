// Memory Archive — an exploratory prototype.
// One pool of items, many lenses. Everything is stored in this browser (localStorage);
// use Export to keep a backup.

const STORE_KEY = 'memory-archive-v1';

const TYPES = {
  thought: 'Thought',
  note: 'Note',
  image: 'Image',
  source: 'Source',
  quote: 'Quote',
  file: 'File',
  work: 'My work',
};
const TYPE_COLORS = {
  thought: '#c98a2b', note: '#8a7a64', image: '#6d8f5e', source: '#4f7a8c',
  quote: '#8a5f9e', file: '#7a7166', work: '#b5532f',
};

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);

// ---------- State ----------

let db = load();
const ui = { view: 'stream', query: '', tag: '', resonance: '', selected: null, lineageRoot: null, editing: null };

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through to examples */ }
  return seed();
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch (e) {
    alert('The browser storage is full (usually because of large images). Export your archive as a backup.');
  }
}

const byId = id => db.items.find(i => i.id === id);

function linksOf(id) {
  return db.links
    .filter(l => l.a === id || l.b === id)
    .map(l => ({ link: l, other: byId(l.a === id ? l.b : l.a) }))
    .filter(x => x.other);
}

function filtered() {
  const q = ui.query.toLowerCase();
  return db.items.filter(i =>
    (!ui.resonance || i.resonance === ui.resonance) &&
    (!ui.tag || i.tags.includes(ui.tag)) &&
    (!q || [i.title, i.body, i.url, i.tags.join(' ')].join(' ').toLowerCase().includes(q))
  );
}

// ---------- Rendering helpers ----------

function mediaHtml(item) {
  if (item.image) return `<img class="media" src="${item.image}" alt="">`;
  if (item.swatch) return `<div class="swatch" style="background:linear-gradient(135deg,${item.swatch[0]},${item.swatch[1]})"></div>`;
  return '';
}

function metaHtml(item) {
  return `<span class="type"><span class="res-dot res-${item.resonance}" title="${item.resonance}"></span>${TYPES[item.type]}</span>`;
}

function cardHtml(item, extra = '') {
  const media = mediaHtml(item);
  const cls = ['card', item.type === 'work' ? 'work' : '', item.type === 'quote' ? 'quote-card' : '', media ? '' : 'no-media'].join(' ');
  const title = item.type === 'quote' ? `“${esc(item.title)}”` : esc(item.title);
  return `<article class="${cls}" data-id="${item.id}">
    ${ui.view === 'stream' ? '' : media}
    <div class="body">
      ${metaHtml(item)}
      <h3>${title}</h3>
      ${item.body ? `<p>${esc(item.body)}</p>` : ''}
      ${extra}
    </div>
    ${ui.view === 'stream' ? media : ''}
  </article>`;
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ---------- Lenses ----------

const lenses = {
  stream(el, items) {
    const sorted = [...items].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const years = {};
    sorted.forEach(i => (years[(i.date || '????').slice(0, 4)] ||= []).push(i));
    el.innerHTML = `<div class="stream">${Object.entries(years)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([y, list]) => `<section class="year"><h2>${y}</h2><div class="year-items">
        ${list.map(i => cardHtml(i, `<div class="date">${formatDate(i.date)}${i.tags.length ? ' · ' + i.tags.map(esc).join(', ') : ''}</div>`)).join('')}
      </div></section>`).join('')}</div>`;
  },

  wall(el, items) {
    const shuffled = [...items].sort((a, b) => hash(a.id) - hash(b.id));
    el.innerHTML = `<div class="wall">${shuffled.map(i => cardHtml(i)).join('')}</div>`;
  },

  constellation(el, items) {
    el.innerHTML = `<div class="constellation-wrap"><svg></svg>
      <div class="legend">${Object.entries(TYPES).map(([k, v]) => `<span><span class="res-dot" style="background:${TYPE_COLORS[k]}"></span>${v}</span>`).join('')}
      <span>· size = number of connections · drag to rearrange</span></div></div>`;
    constellation($('svg', el), items);
  },

  lineage(el, items) {
    const anchors = items.filter(i => i.type === 'work');
    const pool = anchors.length ? anchors : items;
    if (!ui.lineageRoot || !byId(ui.lineageRoot)) ui.lineageRoot = pool[0]?.id;
    const root = byId(ui.lineageRoot);
    const options = [...items].sort((a, b) => (b.type === 'work') - (a.type === 'work') || a.title.localeCompare(b.title))
      .map(i => `<option value="${i.id}" ${i.id === ui.lineageRoot ? 'selected' : ''}>${i.type === 'work' ? '◆ ' : ''}${esc(i.title)}</option>`).join('');

    const rings = traceRings(root, items, 3);
    const names = ['This', 'Direct influences', 'Behind those', 'Further back'];
    el.innerHTML = `<div class="lineage-head">
        <label>Trace the roots of <select id="lineage-root">${options}</select></label>
        <p>Follow the connections outwards: what shaped this, and what shaped that.</p>
      </div>
      <div class="rings">${rings.map((ring, d) => ring.length ? `<div class="ring"><h4>${names[d]}</h4>
        ${ring.map(({ item, via, note }) => cardHtml(item,
          (note ? `<div class="because">${esc(note)}</div>` : '') +
          (via && d > 1 ? `<div class="via">via ${esc(via.title)}</div>` : ''))).join('')}
      </div>` : '').join('')}</div>`;
    $('#lineage-root', el).onchange = e => { ui.lineageRoot = e.target.value; render(); };
  },
};

function traceRings(root, items, depth) {
  if (!root) return [];
  const allowed = new Set(items.map(i => i.id));
  const seen = new Set([root.id]);
  const rings = [[{ item: root }]];
  for (let d = 1; d <= depth; d++) {
    const next = [];
    rings[d - 1].forEach(({ item }) => {
      linksOf(item.id).forEach(({ link, other }) => {
        if (seen.has(other.id) || !allowed.has(other.id)) return;
        seen.add(other.id);
        next.push({ item: other, via: item, note: link.note });
      });
    });
    if (!next.length) break;
    rings.push(next);
  }
  return rings;
}

function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

// ---------- Constellation (small force simulation) ----------

let sim = null;

function constellation(svg, items) {
  if (sim) cancelAnimationFrame(sim.raf);
  const { width, height } = svg.getBoundingClientRect();
  const ids = new Set(items.map(i => i.id));
  const nodes = items.map(i => ({
    item: i, x: width / 2 + (Math.random() - .5) * width * .6, y: height / 2 + (Math.random() - .5) * height * .6, vx: 0, vy: 0,
    degree: linksOf(i.id).filter(x => ids.has(x.other.id)).length,
  }));
  const index = Object.fromEntries(nodes.map(n => [n.item.id, n]));
  const edges = db.links.filter(l => index[l.a] && index[l.b]).map(l => ({ s: index[l.a], t: index[l.b], link: l }));

  const NS = 'http://www.w3.org/2000/svg';
  const make = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  edges.forEach(e => { e.el = make('line', {}); svg.appendChild(e.el); });
  nodes.forEach(n => {
    n.r = 6 + Math.sqrt(n.degree) * 4 + (n.item.type === 'work' ? 4 : 0);
    n.el = make('circle', { r: n.r, fill: TYPE_COLORS[n.item.type] });
    n.label = make('text', { 'text-anchor': 'middle', class: n.degree < 2 && n.item.type !== 'work' ? 'dim' : '' });
    n.label.textContent = n.item.title.length > 34 ? n.item.title.slice(0, 32) + '…' : n.item.title;
    svg.append(n.el, n.label);
  });

  let alpha = 1, drag = null, moved = false;
  function tick() {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy || 1;
        const f = 7000 / d2 * alpha, d = Math.sqrt(d2);
        dx /= d; dy /= d;
        a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
      }
      a.vx += (width / 2 - a.x) * .002 * alpha;
      a.vy += (height / 2 - a.y) * .002 * alpha;
    }
    edges.forEach(({ s, t }) => {
      const dx = t.x - s.x, dy = t.y - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 150) * .015 * alpha;
      s.vx += dx / d * f; s.vy += dy / d * f; t.vx -= dx / d * f; t.vy -= dy / d * f;
    });
    nodes.forEach(n => {
      if (n === drag) return;
      n.vx *= .6; n.vy *= .6;
      n.x = Math.max(n.r, Math.min(width - n.r, n.x + n.vx));
      n.y = Math.max(n.r, Math.min(height - n.r - 16, n.y + n.vy));
    });
    draw();
    alpha = Math.max(alpha * .985, drag ? .3 : 0);
    if (alpha > .01) sim.raf = requestAnimationFrame(tick);
  }
  function draw(hot) {
    edges.forEach(e => {
      e.el.setAttribute('x1', e.s.x); e.el.setAttribute('y1', e.s.y);
      e.el.setAttribute('x2', e.t.x); e.el.setAttribute('y2', e.t.y);
      e.el.classList.toggle('hot', !!hot && (e.s === hot || e.t === hot));
    });
    nodes.forEach(n => {
      n.el.setAttribute('cx', n.x); n.el.setAttribute('cy', n.y);
      n.label.setAttribute('x', n.x); n.label.setAttribute('y', n.y + n.r + 13);
    });
  }
  const point = e => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  nodes.forEach(n => {
    n.el.addEventListener('pointerdown', e => { drag = n; moved = false; svg.setPointerCapture(e.pointerId); alpha = Math.max(alpha, .3); cancelAnimationFrame(sim.raf); tick(); });
    n.el.addEventListener('pointerenter', () => draw(n));
    n.el.addEventListener('pointerleave', () => draw());
  });
  svg.addEventListener('pointermove', e => { if (!drag) return; moved = true; [drag.x, drag.y] = point(e); drag.vx = drag.vy = 0; });
  svg.addEventListener('pointerup', () => {
    if (drag && !moved) openItem(drag.item.id);
    drag = null;
  });

  sim = { raf: requestAnimationFrame(tick) };
}

// ---------- Main render ----------

function render() {
  if (sim && ui.view !== 'constellation') { cancelAnimationFrame(sim.raf); sim = null; }
  $$('.lenses button').forEach(b => b.classList.toggle('active', b.dataset.view === ui.view));
  $$('.resonance-filter button').forEach(b => b.classList.toggle('active', b.dataset.res === ui.resonance));

  const counts = {};
  db.items.forEach(i => i.tags.forEach(t => (counts[t] = (counts[t] || 0) + 1)));
  $('#tags').innerHTML = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 18)
    .map(([t]) => `<button data-tag="${esc(t)}" class="${t === ui.tag ? 'active' : ''}">#${esc(t)}</button>`).join('');

  const items = filtered();
  const el = $('#view');
  if (!items.length) {
    el.innerHTML = `<p class="empty">${db.items.length ? 'Nothing matches this filter.' : 'The archive is empty. Capture something, or drop a file anywhere on the page.'}</p>`;
    return;
  }
  lenses[ui.view](el, items);
}

// ---------- Drawer ----------

function openItem(id) {
  ui.selected = id;
  const item = byId(id);
  const drawer = $('#drawer');
  if (!item) { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); return; }
  const conns = linksOf(id);
  const others = db.items.filter(i => i.id !== id && !conns.some(c => c.other.id === i.id))
    .sort((a, b) => a.title.localeCompare(b.title));

  drawer.innerHTML = `<div class="inner">
    <button class="close" aria-label="Close">×</button>
    ${metaHtml(item)} <span class="date">· ${formatDate(item.date)} ${item.date ? item.date.slice(0, 4) : ''} · it ${item.resonance} me</span>
    <h2>${item.type === 'quote' ? `“${esc(item.title)}”` : esc(item.title)}</h2>
    ${mediaHtml(item)}
    ${item.body ? `<div class="text">${esc(item.body)}</div>` : ''}
    ${item.url ? `<p><a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.url)}</a></p>` : ''}
    ${item.file ? `<p>${item.file.data ? `<a href="${item.file.data}" download="${esc(item.file.name)}">Download ${esc(item.file.name)}</a>` : `▤ ${esc(item.file.name)} <span class="hint">(only the name is stored)</span>`}</p>` : ''}
    ${item.tags.length ? `<p>${item.tags.map(t => `<span class="chip">#${esc(t)}</span>`).join('')}</p>` : ''}

    <h3>Connections (${conns.length})</h3>
    ${conns.map(({ link, other }) => `<div class="conn">
      <span class="res-dot" style="background:${TYPE_COLORS[other.type]};margin-top:8px"></span>
      <div><button class="link" data-open="${other.id}">${esc(other.title)}</button>
      ${link.note ? `<div class="because">${esc(link.note)}</div>` : ''}</div>
      <button class="rm" data-unlink="${link.id}" title="Remove connection">×</button>
    </div>`).join('') || '<p class="hint">Not connected to anything yet.</p>'}

    <form class="connect-form">
      <select name="to" required><option value="">Connect to…</option>
        ${others.map(o => `<option value="${o.id}">${esc(o.title)}</option>`).join('')}</select>
      <input name="note" placeholder="Why are they connected? (optional, but this is the gold)">
      <button class="ghost" type="submit">Connect</button>
    </form>

    <div class="drawer-actions">
      <button class="ghost" data-edit>Edit</button>
      <button class="ghost" data-trace>Trace lineage</button>
      <button class="ghost danger" data-delete>Delete</button>
    </div>
  </div>`;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
}

function closeDrawer() {
  ui.selected = null;
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
}

$('#drawer').addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  const id = ui.selected;
  if (t.classList.contains('close')) closeDrawer();
  else if (t.dataset.open) openItem(t.dataset.open);
  else if (t.dataset.unlink) { db.links = db.links.filter(l => l.id !== t.dataset.unlink); save(); openItem(id); render(); }
  else if ('edit' in t.dataset) openCapture(byId(id));
  else if ('trace' in t.dataset) { ui.view = 'lineage'; ui.lineageRoot = id; closeDrawer(); render(); }
  else if ('delete' in t.dataset && confirm('Delete this item and its connections?')) {
    db.items = db.items.filter(i => i.id !== id);
    db.links = db.links.filter(l => l.a !== id && l.b !== id);
    save(); closeDrawer(); render();
  }
});

$('#drawer').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  if (!f.get('to')) return;
  db.links.push({ id: uid(), a: ui.selected, b: f.get('to'), note: f.get('note').trim() });
  save(); openItem(ui.selected); render();
});

// ---------- Capture ----------

const dialog = $('#capture');
const form = $('#capture-form');

$('#type-picker').innerHTML = Object.entries(TYPES)
  .map(([k, v]) => `<label><input type="radio" name="type" value="${k}"><span>${v}</span></label>`).join('');

function syncTypeFields() {
  const type = form.type.value;
  $('.for-url', form).style.display = ['source', 'quote', 'image', 'work'].includes(type) ? '' : 'none';
  $('.for-media', form).style.display = ['image', 'file', 'work'].includes(type) ? '' : 'none';
}
form.addEventListener('change', e => { if (e.target.name === 'type') syncTypeFields(); });

function openCapture(item = null, preset = {}) {
  ui.editing = item;
  form.reset();
  const v = item || { type: 'thought', resonance: 'inspires', date: today(), tags: [], ...preset };
  $('#capture-title').textContent = item ? 'Edit' : 'Capture';
  form.type.value = v.type;
  form.title.value = v.title || '';
  form.body.value = v.body || '';
  form.url.value = v.url || '';
  form.date.value = v.date || '';
  form.resonance.value = v.resonance;
  form.tags.value = (v.tags || []).join(', ');
  syncTypeFields();
  dialog.showModal();
}

$('#capture-cancel').onclick = () => dialog.close();

form.addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(form);
  const item = ui.editing || { id: uid(), created: new Date().toISOString() };
  Object.assign(item, {
    type: f.get('type'),
    title: f.get('title').trim(),
    body: f.get('body').trim(),
    url: f.get('url').trim(),
    date: f.get('date'),
    resonance: f.get('resonance'),
    tags: f.get('tags').split(',').map(t => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean),
  });
  const media = f.get('media');
  if (media && media.size) Object.assign(item, await readMedia(media));
  if (!ui.editing) db.items.push(item);
  save();
  dialog.close();
  render();
  openItem(item.id);
});

async function readMedia(file) {
  if (file.type.startsWith('image/')) return { image: await downscale(file, 1400), swatch: null };
  const small = file.size < 1.5e6;
  return { file: { name: file.name, size: file.size, data: small ? await asDataUrl(file) : null } };
}

function asDataUrl(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}

async function downscale(file, max) {
  const url = await asDataUrl(file);
  const img = new Image();
  await new Promise(r => { img.onload = r; img.src = url; });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', .85);
}

// Drop files anywhere
let dragDepth = 0;
window.addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) { dragDepth++; $('#dropzone').classList.add('on'); } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropzone').classList.remove('on'); } });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', async e => {
  e.preventDefault();
  dragDepth = 0; $('#dropzone').classList.remove('on');
  const files = [...e.dataTransfer.files];
  for (const file of files) {
    const item = {
      id: uid(), created: new Date().toISOString(), type: file.type.startsWith('image/') ? 'image' : 'file',
      title: file.name.replace(/\.[^.]+$/, ''), body: '', url: '', date: today(), resonance: 'inspires', tags: [],
      ...(await readMedia(file)),
    };
    db.items.push(item);
  }
  if (files.length) { save(); render(); if (files.length === 1) openItem(db.items.at(-1).id); }
});

// ---------- Toolbar ----------

$$('.lenses button').forEach(b => b.onclick = () => { ui.view = b.dataset.view; render(); });
$$('.resonance-filter button').forEach(b => b.onclick = () => { ui.resonance = b.dataset.res; render(); });
$('#tags').onclick = e => { const t = e.target.closest('button'); if (t) { ui.tag = ui.tag === t.dataset.tag ? '' : t.dataset.tag; render(); } };
$('#search').oninput = e => { ui.query = e.target.value; render(); };
$('#view').addEventListener('click', e => { const c = e.target.closest('.card'); if (c) openItem(c.dataset.id); });
$('#add').onclick = () => openCapture();
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.selected && !dialog.open) closeDrawer(); });

// Drift: favour things you haven't looked at in a while (older dates weigh more)
$('#drift').onclick = () => {
  if (!db.items.length) return;
  const now = Date.now();
  const weights = db.items.map(i => 1 + (now - new Date(i.date || now).getTime()) / 3.15e10);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  const pick = db.items.find((_, k) => (r -= weights[k]) <= 0) || db.items[0];
  openItem(pick.id);
};

$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `memory-archive-${today()}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
};

$('#import').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.items) || !Array.isArray(data.links)) throw new Error('not an archive');
    if (confirm(`Replace the current archive with ${data.items.length} items from this file?`)) { db = data; save(); render(); }
  } catch { alert('That file is not a Memory Archive export.'); }
  e.target.value = '';
};

$('#clear-examples').onclick = () => {
  if (!confirm('Remove all example items (your own items stay)?')) return;
  const ex = new Set(db.items.filter(i => i.example).map(i => i.id));
  db.items = db.items.filter(i => !ex.has(i.id));
  db.links = db.links.filter(l => !ex.has(l.a) && !ex.has(l.b));
  save(); closeDrawer(); render();
};

window.addEventListener('resize', () => { if (ui.view === 'constellation') render(); });

// ---------- Example content (marked example: true so it can be removed in one go) ----------

function seed() {
  const items = [
    ['w1', 'work', 'Tidelines — drawing series', 'Twelve drawings of the line the sea leaves behind. Pencil, repeated until the hand stops thinking.', '2025-03-14', 'inspires', ['drawing', 'sea', 'repetition'], ['#c9b89a', '#6f8796']],
    ['w2', 'work', 'Thread study (installation)', 'Red thread across a white room. People walked around it as if it were a wall.', '2023-09-02', 'inspires', ['installation', 'line', 'space'], ['#efe9df', '#a8444f']],
    ['s1', 'source', 'Agnes Martin', 'Grids that feel like breathing. Return to this whenever the work gets loud.', '2016-11-20', 'inspires', ['painting', 'repetition', 'quiet'], null, 'https://en.wikipedia.org/wiki/Agnes_Martin'],
    ['s2', 'source', 'Hiroshi Sugimoto — Seascapes', 'Every photograph the same horizon, and still each one a different day.', '2018-06-11', 'inspires', ['photography', 'sea', 'time'], ['#8c9399', '#2c3036'], 'https://en.wikipedia.org/wiki/Hiroshi_Sugimoto'],
    ['s3', 'source', 'Tim Ingold — Lines: A Brief History', 'Walking, weaving, writing and drawing as the same activity: making a line.', '2021-02-03', 'informs', ['theory', 'line', 'book'], null, 'https://en.wikipedia.org/wiki/Tim_Ingold'],
    ['s4', 'source', 'John Cage — 4′33″', 'Framing what is already there instead of adding something.', '2012-04-09', 'informs', ['sound', 'attention'], null, 'https://en.wikipedia.org/wiki/4%E2%80%B233%E2%80%B3'],
    ['i1', 'image', 'Low tide, early morning', 'Ridges in the sand that look exactly like the drawings I didn’t know I would make.', '2019-10-27', 'inspires', ['sea', 'photo'], ['#d9c7a7', '#7e9aa6']],
    ['i2', 'image', 'Grandmother’s embroidery drawer', 'Hundreds of half-finished samples. Nobody was meant to see them.', '1998-07-15', 'inspires', ['family', 'textile', 'memory'], ['#d8b4a0', '#7a3b3b']],
    ['t1', 'thought', 'Repetition is a way of paying attention', 'Not boredom. The tenth time you draw a line you finally see it.', '2020-01-08', 'inspires', ['repetition', 'attention']],
    ['t2', 'thought', 'What if the archive itself is the work?', 'Keeping, sorting, connecting — maybe that is already the practice.', '2026-09-30', 'triggers', ['archive', 'practice']],
    ['n1', 'note', 'Crowded museum, couldn’t see anything', 'Too many works shouting at once. Left after twenty minutes, irritated. I want work that lowers the volume.', '2022-05-21', 'triggers', ['museum', 'quiet']],
    ['q1', 'quote', 'You only notice the sea when it leaves', 'Overheard on the train. Wrote it on my hand.', '2024-11-02', 'triggers', ['sea', 'absence']],
    ['f1', 'file', 'Sketchbook scan — spring', 'First pages where the lines start repeating.', '2024-04-12', 'informs', ['sketchbook', 'drawing']],
    ['n2', 'note', 'Art school critique: “too decorative”', 'Still stings. Probably why I stripped everything back afterwards.', '2014-03-18', 'triggers', ['school', 'doubt']],
  ].map(([id, type, title, body, date, resonance, tags, swatch, url]) => ({
    id, type, title, body, date, resonance, tags, swatch: swatch || null, url: url || '', example: true, created: date,
    ...(type === 'file' ? { file: { name: 'sketchbook-spring.pdf', size: 0, data: null } } : {}),
  }));
  const links = [
    ['w1', 'i1', 'The sand ridges were the first drawing — I just copied them for a year.'],
    ['w1', 's1', 'Permission to repeat without apologising.'],
    ['w1', 's2', 'Same subject, again and again, until it becomes about time.'],
    ['w1', 't1', 'The idea behind the whole series.'],
    ['w1', 'q1', 'Gave the series its title, in a way.'],
    ['w1', 'f1', 'Where it started on paper.'],
    ['w2', 's3', 'A line can be a thread, a walk, a wall.'],
    ['w2', 'i2', 'Red thread from her drawer.'],
    ['w2', 'n1', 'Wanted one quiet gesture in a whole room.'],
    ['s1', 'n2', 'After that critique, she showed me that less could be enough.'],
    ['t1', 's4', 'Attention as the material.'],
    ['t1', 'i2', 'Her samples: the same stitch, hundreds of times.'],
    ['s1', 's2', ''],
    ['t2', 'i2', 'Her drawer was an archive too.'],
    ['f1', 's3', ''],
  ].map(([a, b, note]) => ({ id: uid(), a, b, note }));
  return { items, links };
}

render();
