/* Memory Archive · interactions. No dependencies.
   One pool of entries, four lenses. Everything is stored in this browser (localStorage). */
(() => {
  const STORE_KEY = 'memory-archive-v1';

  const TYPES = {
    thought: { label: 'Thought', glyph: '✶' },
    note: { label: 'Note', glyph: '¶' },
    image: { label: 'Image', glyph: '◐' },
    source: { label: 'Source', glyph: '↗' },
    quote: { label: 'Quote', glyph: '“' },
    file: { label: 'File', glyph: '▤' },
    work: { label: 'My work', glyph: '◆' },
  };
  const RES = { inspires: 'Inspires', informs: 'Informs', triggers: 'Triggers' };
  const LENSES = {
    index: { title: 'Index', note: 'Everything, in the order it entered my life. Hover to look, click to open.' },
    wall: { title: 'Wall', note: 'The studio wall. Everything pinned up at once, my own work given more room.' },
    constellation: { title: 'Constellation', note: 'Every entry a point, every connection a thread. Older to the left, newer to the right.' },
    lineage: { title: 'Lineage', note: 'Pick a work and follow its threads back: what shaped it, and what shaped that.' },
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const today = () => new Date().toISOString().slice(0, 10);
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isTyping = el => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
  const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDay = d => d ? `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}` : '—';
  const fmtDate = d => d ? `${fmtDay(d)} ${d.slice(0, 4)}` : 'Undated';

  /* ---------- state ---------- */
  let db = load();
  const ui = { view: 'index', query: '', tag: '', res: '', selected: null, root: null, editing: null, pending: null, animate: true };

  function load() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) return JSON.parse(raw); } catch { /* fall back to examples */ }
    return seed();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); return true; }
    catch { toast('Storage full · export a backup'); return false; }
  }
  const byId = id => db.items.find(i => i.id === id);
  const linksOf = id => db.links.filter(l => l.a === id || l.b === id)
    .map(l => ({ link: l, other: byId(l.a === id ? l.b : l.a) })).filter(x => x.other);
  const byDate = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || '').localeCompare(a.created || '');
  const numbers = () => Object.fromEntries([...db.items].sort((a, b) => -byDate(a, b)).map((i, k) => [i.id, String(k + 1).padStart(3, '0')]));

  function filtered() {
    const q = ui.query.trim().toLowerCase();
    return db.items.filter(i =>
      (!ui.res || i.resonance === ui.res) &&
      (!ui.tag || i.tags.includes(ui.tag)) &&
      (!q || [i.title, i.body, i.url, TYPES[i.type].label, i.tags.join(' '), i.file?.name].join(' ').toLowerCase().includes(q))
    ).sort(byDate);
  }

  /* ---------- plates: image, generated placeholder, or a typographic tile ---------- */
  function linesSvg(item) {
    const [bg, fg] = item.swatch;
    let seedN = hash(item.id);
    const rnd = () => ((seedN = Math.imul(seedN ^ (seedN >>> 15), 2246822507) >>> 0) / 4294967296);
    const n = 22 + Math.floor(rnd() * 14), amp = 4 + rnd() * 14, freq = .008 + rnd() * .02;
    let paths = '';
    for (let i = 0; i < n; i++) {
      const y0 = 30 + i * (440 / n), ph = rnd() * 6.28, a = amp * (.4 + rnd());
      let d = '';
      for (let x = 0; x <= 400; x += 10) d += `${x ? ' L' : 'M'}${x} ${(y0 + Math.sin(x * freq + ph + i * .18) * a).toFixed(1)}`;
      paths += `<path d="${d}"/>`;
    }
    return `<svg viewBox="0 0 400 500" preserveAspectRatio="none" aria-hidden="true"><rect width="400" height="500" fill="${bg}"/><g fill="none" stroke="${fg}" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".75">${paths}</g></svg>`;
  }
  function plate(item, { big = false } = {}) {
    const t = TYPES[item.type];
    if (item.image) return `<div class="plate"><img src="${item.image}" alt="" loading="lazy"></div>`;
    if (item.swatch) return `<div class="plate">${linesSvg(item)}<span class="label ph">${big ? 'Placeholder · add your own image' : 'Placeholder'}</span></div>`;
    let q = item.body || item.title;
    if (item.type === 'quote') q = item.title;
    if (item.type === 'source') q = host(item.url) || item.title;
    if (item.type === 'file') q = item.file?.name || item.title;
    if (item.type === 'work') q = item.title;
    return `<div class="plate plate--text plate--${item.type}" data-glyph="${t.glyph}"><span class="label">${t.glyph} ${t.label}</span><p class="q">${esc(q)}</p></div>`;
  }
  const resHtml = (r, withLabel = true) => `<span class="rs label" title="${RES[r]}"><span class="dot r-${r}" aria-hidden="true"></span>${withLabel ? `<span class="rl">${RES[r]}</span>` : ''}</span>`;
  const titleHtml = i => i.type === 'quote' ? `<q>${esc(i.title)}</q>` : esc(i.title);

  /* ---------- chrome ---------- */
  function renderChrome() {
    const lens = LENSES[ui.view];
    const h1 = $('#lens-title');
    const items = filtered();
    const words = lens.title.split(' ').map((w, k) => `<span class="w"><span style="animation-delay:${k * 80}ms">${w}</span></span>`).join(' ');
    h1.innerHTML = `${ui.animate ? words : lens.title}<sup>${items.length}</sup>`;
    $('#lens-note').textContent = lens.note;
    $$('.nav a').forEach(a => a.toggleAttribute('aria-current', a.dataset.view === ui.view));
    document.title = `${lens.title} · Memory Archive`;

    const pool = db.items.filter(i => !ui.tag || i.tags.includes(ui.tag));
    const count = r => pool.filter(i => !r || i.resonance === r).length;
    $('#res-filter').innerHTML = [['', 'All'], ...Object.entries(RES)].map(([k, v]) =>
      `<button type="button" data-filter="${k}" aria-pressed="${ui.res === k}">${k ? `<span class="dot r-${k}"></span>` : ''}${v}<sup>${count(k)}</sup></button>`).join('');

    const tags = {};
    db.items.forEach(i => i.tags.forEach(t => (tags[t] = (tags[t] || 0) + 1)));
    $('#tag-panel').innerHTML = Object.entries(tags).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t, n]) => `<button type="button" data-tag="${esc(t)}" aria-pressed="${ui.tag === t}">#${esc(t)}<sup>${n}</sup></button>`).join('') || '<span class="label">No tags yet</span>';
    const tt = $('#tags-toggle span');
    tt.textContent = ui.tag ? `#${ui.tag}` : 'Tags';

    const last = [...db.items].sort((a, b) => (b.created || '').localeCompare(a.created || ''))[0];
    $('#status').textContent = `Receiving · ${db.items.length} entries${last ? ` · last ${fmtDay((last.created || '').slice(0, 10))}` : ''}`;
  }

  /* ---------- lenses ---------- */
  function render() {
    renderChrome();
    hidePreview();
    if (sim) { cancelAnimationFrame(sim.raf); sim = null; }
    const el = $('#view');
    const items = filtered();
    if (!items.length) {
      el.innerHTML = db.items.length
        ? `<div class="empty"><p>Nothing here matches.</p><button class="action" data-reset><span>Clear filters</span></button></div>`
        : `<div class="empty"><p>The archive is empty. Capture a thought, or drop an image anywhere on this page.</p><button class="action action--signal" data-capture><span class="dot"></span><span>Capture</span></button></div>`;
    } else {
      lenses[ui.view](el, items);
    }
    ui.animate = false;
  }
  const rise = k => ui.animate ? ` rise" style="--d:${Math.min(k * 35, 700)}ms` : '';

  const lenses = {
    index(el, items) {
      const years = new Map();
      items.forEach(i => { const y = i.date ? i.date.slice(0, 4) : 'Undated'; years.has(y) || years.set(y, []); years.get(y).push(i); });
      let k = 0;
      el.innerHTML = [...years].map(([y, list]) => `<section class="year">
        <header class="year-head${rise(k)}"><h2>${y}</h2><span class="label">${list.length} ${list.length === 1 ? 'entry' : 'entries'}</span></header>
        <ol class="rows">${list.map(i => {
          const c = linksOf(i.id).length;
          return `<li class="row${i.type === 'work' ? ' is-work' : ''}${ui.selected === i.id ? ' is-selected' : ''}${rise(k++)}" data-id="${i.id}">
            <button class="row-head" type="button" data-open="${i.id}">
              <span class="num label">${fmtDay(i.date)}</span>
              <span class="t">${titleHtml(i)}</span>
              <span class="ty label">${TYPES[i.type].label}</span>
              ${resHtml(i.resonance)}
              <span class="cn label" title="${c} connections">${c ? `↔ ${c}` : '—'}</span>
            </button></li>`;
        }).join('')}</ol></section>`).join('');
      if (finePointer) $$('.rows', el).forEach(list => {
        $$('.row', list).forEach(row => {
          row.addEventListener('mouseenter', () => { list.classList.add('is-hovering'); row.classList.add('is-hover'); showPreview(byId(row.dataset.id)); });
          row.addEventListener('mouseleave', () => { row.classList.remove('is-hover'); list.classList.remove('is-hovering'); hidePreview(); });
        });
      });
    },

    wall(el, items) {
      el.innerHTML = `<div class="wall">${items.map((i, k) => `
        <button class="tile${i.type === 'work' ? ' is-wide' : ''}${rise(k)}" type="button" data-open="${i.id}">
          ${plate(i)}
          <span class="meta"><span class="label">${TYPES[i.type].label} · ${i.date ? i.date.slice(0, 4) : '—'}</span>${resHtml(i.resonance, false)}</span>
          <h3>${titleHtml(i)}</h3>
          ${i.body && (i.image || i.swatch || !['thought', 'note'].includes(i.type)) ? `<p>${esc(i.body)}</p>` : ''}
        </button>`).join('')}</div>`;
    },

    constellation(el, items) {
      const years = items.map(i => i.date).filter(Boolean).sort();
      el.innerHTML = `<div class="field-wrap on-dark${ui.animate ? ' rise' : ''}">
        <svg role="img" aria-label="Graph of entries and their connections"></svg>
        <div class="field-hud top">
          <div class="legend label"><span><span class="dot r-inspires"></span>Inspires</span><span><span class="dot" style="background:var(--paper)"></span>Informs</span><span><span class="dot r-triggers"></span>Triggers</span><span><span class="ringkey"></span>My work</span></div>
          <span class="label" id="field-count"></span>
        </div>
        <div class="field-hud bottom">
          <div class="readout" id="readout"><span class="label">Hover a point · drag to rearrange · click to open</span></div>
          <span class="label">${years.length ? `${years[0].slice(0, 4)} → ${years.at(-1).slice(0, 4)}` : ''}</span>
        </div></div>`;
      constellation($('.field-wrap', el), items);
    },

    lineage(el, items) {
      const works = items.filter(i => i.type === 'work').sort((a, b) => a.title.localeCompare(b.title));
      const rest = items.filter(i => i.type !== 'work').sort((a, b) => a.title.localeCompare(b.title));
      if (!ui.root || !items.some(i => i.id === ui.root)) ui.root = (works[0] || items[0]).id;
      const root = byId(ui.root);
      const opt = i => `<option value="${i.id}"${i.id === ui.root ? ' selected' : ''}>${esc(i.title)}</option>`;
      const gens = trace(root, items, 3);
      const names = ['This', 'Shaped by', 'Behind those', 'Further back'];
      el.innerHTML = `<div class="lineage">
        <div class="trace${rise(0)}"><span class="label">Tracing</span>
          <span class="select"><select id="root" aria-label="Entry to trace">
            ${works.length ? `<optgroup label="My work">${works.map(opt).join('')}</optgroup>` : ''}
            <optgroup label="Everything else">${rest.map(opt).join('')}</optgroup></select></span></div>
        ${gens.length < 2 ? `<div class="empty" style="padding-left:0"><p>Nothing is connected to this yet. Open it and connect it to what shaped it.</p><button class="action" data-open="${root.id}"><span>Open entry</span></button></div>` : `
        <div class="gens" style="--n:${gens.length}"><svg aria-hidden="true"></svg>
          ${gens.map((g, d) => `<div class="gen">
            <div class="gen-head${rise(d)}"><span class="label label--ink">0${d} · ${names[d]}</span><span class="label">${d ? g.length : ''}</span></div>
            ${g.map(({ item, via, note }, k) => `<button type="button" class="kin${d === 0 ? ' is-root' : ''}${rise(d * 4 + k)}" data-open="${item.id}" data-kin="${item.id}" ${via ? `data-parent="${via.id}"` : ''}>
              ${plate(item, { big: d === 0 })}
              <span><span class="label">${TYPES[item.type].label} · ${item.date ? item.date.slice(0, 4) : '—'}</span>
              <h3>${titleHtml(item)}</h3>
              ${note ? `<p class="because">${esc(note)}</p>` : ''}
              ${d > 1 ? `<p class="via label">via ${esc(via.title)}</p>` : ''}
              ${d === 0 && item.body ? `<p class="body" style="margin-top:12px">${esc(item.body)}</p>` : ''}</span>
            </button>`).join('')}
          </div>`).join('')}
        </div>`}</div>`;
      $('#root', el).addEventListener('change', e => { ui.root = e.target.value; ui.animate = true; render(); });
      const box = $('.gens', el);
      if (box) { requestAnimationFrame(() => drawThreads(box)); wireThreads(box); }
    },
  };

  function trace(root, items, depth) {
    const allowed = new Set(items.map(i => i.id));
    const seen = new Set([root.id]);
    const gens = [[{ item: root }]];
    for (let d = 1; d <= depth; d++) {
      const next = [];
      gens[d - 1].forEach(({ item }) => linksOf(item.id).forEach(({ link, other }) => {
        if (seen.has(other.id) || !allowed.has(other.id)) return;
        seen.add(other.id);
        next.push({ item: other, via: item, note: link.note });
      }));
      if (!next.length) break;
      gens.push(next);
    }
    return gens;
  }

  function drawThreads(box) {
    const svg = $('svg', box);
    if (getComputedStyle(svg).display === 'none') return;
    const o = box.getBoundingClientRect();
    const at = id => $(`[data-kin="${id}"]`, box);
    svg.innerHTML = $$('[data-parent]', box).map(k => {
      const p = at(k.dataset.parent); if (!p) return '';
      const a = (p.classList.contains('is-root') ? $('.plate', p) : p).getBoundingClientRect(), b = k.getBoundingClientRect();
      const x1 = a.right - o.left, y1 = a.top + a.height / 2 - o.top, x2 = b.left - o.left, y2 = b.top + b.height / 2 - o.top, m = (x2 - x1) / 2;
      return `<path data-from="${k.dataset.parent}" data-to="${k.dataset.kin}" d="M${x1} ${y1} C${x1 + m} ${y1} ${x2 - m} ${y2} ${x2} ${y2}"/>`;
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

  /* ---------- constellation: a small force simulation ---------- */
  let sim = null;
  function constellation(wrap, items) {
    const svg = $('svg', wrap);
    const W = wrap.clientWidth, H = wrap.clientHeight, pad = 70;
    const ids = new Set(items.map(i => i.id));
    // Home positions follow the order entries arrived in (by rank, so one very old entry doesn't squeeze the rest)
    const order = [...items].sort((a, b) => -byDate(a, b)).map(i => i.id);
    const tx = i => items.length < 2 ? W / 2 : pad + order.indexOf(i.id) / (items.length - 1) * (W - pad * 2);
    const nodes = items.map(i => {
      const deg = linksOf(i.id).filter(x => ids.has(x.other.id)).length;
      return { item: i, deg, home: tx(i), x: tx(i), y: H / 2 + (Math.random() - .5) * H * .5, vx: 0, vy: 0, r: i.type === 'work' ? 9 : 3 + Math.sqrt(deg) * 1.6 };
    });
    const at = Object.fromEntries(nodes.map(n => [n.item.id, n]));
    const edges = db.links.filter(l => at[l.a] && at[l.b]).map(l => ({ s: at[l.a], t: at[l.b], link: l }));
    $('#field-count', wrap).textContent = `${nodes.length} points · ${edges.length} threads`;

    const NS = 'http://www.w3.org/2000/svg';
    const make = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
    const gE = make('g'), gN = make('g');
    svg.append(gE, gN);
    edges.forEach(e => { e.el = make('line', { class: 'e' }); gE.append(e.el); });
    nodes.forEach(n => {
      n.el = make('g', { class: `n r-${n.item.resonance}${n.item.type === 'work' || n.deg >= 3 ? ' is-labelled' : ''}`, tabindex: 0, role: 'button', 'aria-label': n.item.title });
      n.el.append(make('circle', { class: 'halo', r: n.r + 9 }));
      if (n.item.type === 'work') { n.el.append(make('circle', { class: 'ring', r: n.r })); n.el.append(make('circle', { class: 'core', r: 3 })); }
      else n.el.append(make('circle', { class: 'core', r: n.r }));
      const label = make('text', { y: n.r + 16, 'text-anchor': 'middle' });
      label.textContent = n.item.title.length > 30 ? n.item.title.slice(0, 29) + '…' : n.item.title;
      n.el.append(label);
      gN.append(n.el);
    });

    let alpha = 1, drag = null, moved = false;
    function tick() {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y; const d2 = dx * dx + dy * dy || 1, d = Math.sqrt(d2), f = 5200 / d2 * alpha;
          dx /= d; dy /= d; a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
        }
        a.vx += (a.home - a.x) * .006 * alpha;
        a.vy += (H / 2 - a.y) * .0025 * alpha;
      }
      edges.forEach(({ s, t }) => {
        const dx = t.x - s.x, dy = t.y - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 130) * .012 * alpha;
        s.vx += dx / d * f; s.vy += dy / d * f; t.vx -= dx / d * f; t.vy -= dy / d * f;
      });
      nodes.forEach(n => {
        if (n === drag) return;
        n.vx *= .62; n.vy *= .62;
        n.x = Math.max(pad / 2, Math.min(W - pad / 2, n.x + n.vx));
        n.y = Math.max(60, Math.min(H - 90, n.y + n.vy));
      });
      draw();
      alpha = Math.max(alpha * .986, drag ? .25 : 0);
      if (alpha > .008 && sim) sim.raf = requestAnimationFrame(tick);
    }
    function draw() {
      edges.forEach(e => { e.el.setAttribute('x1', e.s.x); e.el.setAttribute('y1', e.s.y); e.el.setAttribute('x2', e.t.x); e.el.setAttribute('y2', e.t.y); });
      nodes.forEach(n => n.el.setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`));
    }
    const readout = $('#readout', wrap), idle = readout.innerHTML;
    function focus(n) {
      wrap.classList.toggle('is-focus', !!n);
      const near = n ? new Set([n, ...edges.filter(e => e.s === n || e.t === n).flatMap(e => [e.s, e.t])]) : new Set();
      nodes.forEach(m => m.el.classList.toggle('is-hot', near.has(m)));
      edges.forEach(e => e.el.classList.toggle('is-hot', !!n && (e.s === n || e.t === n)));
      readout.innerHTML = n ? `<span class="label">${TYPES[n.item.type].label} · ${fmtDate(n.item.date)} · ${n.deg} ${n.deg === 1 ? 'thread' : 'threads'}</span><span class="t">${titleHtml(n.item)}</span>${n.item.body ? `<span class="b">${esc(n.item.body.length > 140 ? n.item.body.slice(0, 139) + '…' : n.item.body)}</span>` : ''}` : idle;
    }
    const point = e => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    nodes.forEach(n => {
      n.el.addEventListener('pointerdown', e => { drag = n; moved = false; svg.setPointerCapture(e.pointerId); svg.classList.add('is-dragging'); alpha = Math.max(alpha, .25); if (sim) { cancelAnimationFrame(sim.raf); tick(); } });
      n.el.addEventListener('pointerenter', () => !drag && focus(n));
      n.el.addEventListener('pointerleave', () => !drag && focus(null));
      n.el.addEventListener('focus', () => focus(n));
      n.el.addEventListener('blur', () => focus(null));
      n.el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem(n.item.id); } });
    });
    svg.addEventListener('pointermove', e => { if (!drag) return; const [x, y] = point(e); if (Math.abs(x - drag.x) + Math.abs(y - drag.y) > 2) moved = true; drag.x = x; drag.y = y; drag.home = x; });
    svg.addEventListener('pointerup', () => { svg.classList.remove('is-dragging'); if (drag && !moved) openItem(drag.item.id); drag = null; });
    sim = { raf: requestAnimationFrame(tick) };
  }

  /* ---------- floating preview (index) ---------- */
  const preview = $('#preview'), pdot = $('#preview-dot');
  let mx = 0, my = 0;
  const place = () => {
    const w = preview.offsetWidth, h = preview.offsetHeight;
    const x = mx + 28 + w > innerWidth ? mx - 28 - w : mx + 28;
    const y = Math.max(76, Math.min(innerHeight - h - 12, my - h / 2));
    preview.style.transform = `translate(${x}px, ${y}px)`; pdot.style.left = mx + 'px'; pdot.style.top = my + 'px';
  };
  addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; if (preview.classList.contains('is-visible')) place(); }, { passive: true });
  function showPreview(item) { preview.innerHTML = plate(item); preview.classList.add('is-visible'); pdot.classList.add('is-visible'); place(); }
  function hidePreview() { preview.classList.remove('is-visible'); pdot.classList.remove('is-visible'); }

  /* ---------- entry panel ---------- */
  const panel = $('#panel'), scrim = $('#scrim');
  let returnFocus = null;

  function openItem(id) {
    const item = byId(id);
    if (!item) return closePanel();
    if (!panel.classList.contains('is-open')) returnFocus = document.activeElement;
    ui.selected = id;
    hidePreview();
    const list = filtered(), pos = list.findIndex(i => i.id === id);
    const nums = numbers();
    const conns = linksOf(id).sort((a, b) => byDate(a.other, b.other));
    const others = db.items.filter(i => i.id !== id && !conns.some(c => c.other.id === i.id)).sort((a, b) => a.title.localeCompare(b.title));
    panel.innerHTML = `
      <div class="panel-top">
        <span class="label">Entry ${nums[id]} <span class="muted">/ ${String(db.items.length).padStart(3, '0')}</span></span>
        <div class="group">
          <button class="action" data-step="-1" ${pos < 1 ? 'disabled style="opacity:.3"' : ''} aria-label="Previous entry"><span>←</span></button>
          <button class="action" data-step="1" ${pos < 0 || pos >= list.length - 1 ? 'disabled style="opacity:.3"' : ''} aria-label="Next entry"><span>→</span></button>
          <button class="action" data-close><span>Close</span></button>
        </div>
      </div>
      <div class="panel-body">
        <div class="kicker"><span class="label label--ink">${TYPES[item.type].glyph} ${TYPES[item.type].label}</span><span class="label">${fmtDate(item.date)}</span>${resHtml(item.resonance)}</div>
        <h2>${titleHtml(item)}</h2>
        ${item.image || item.swatch ? plate(item, { big: true }) : ''}
        ${item.body ? `<p class="body">${esc(item.body).replace(/\n/g, '<br>')}</p>` : ''}
        ${item.url ? `<a class="link" href="${esc(item.url)}" target="_blank" rel="noopener"><span>${esc(host(item.url) || item.url)}</span></a>` : ''}
        ${item.file ? (item.file.data ? `<a class="link" href="${item.file.data}" download="${esc(item.file.name)}"><span>Download ${esc(item.file.name)}</span></a>` : `<p class="label">▤ ${esc(item.file.name)} · only the name is stored</p>`) : ''}
        <div class="facts">
          <div><p class="label">Entered</p><p>${fmtDate(item.date)}</p></div>
          <div><p class="label">It</p><p>${RES[item.resonance].toLowerCase()} me</p></div>
          <div><p class="label">Type</p><p>${TYPES[item.type].label}</p></div>
          <div><p class="label">Tags</p><p>${item.tags.length ? item.tags.map(t => `<button class="link-quiet" data-tag-go="${esc(t)}">#${esc(t)}</button>`).join(' ') : '—'}</p></div>
        </div>
        <section>
          <div class="section-head"><h3>Connections</h3><span class="label">${conns.length}</span></div>
          ${conns.length ? `<ol class="conns">${conns.map(({ link, other }) => `<li class="conn">
            <span class="label">${nums[other.id]}</span>
            <div><button class="go" data-open="${other.id}">${titleHtml(other)}</button>${link.note ? `<p class="why">${esc(link.note)}</p>` : ''}</div>
            <button class="rm" data-unlink="${link.id}" aria-label="Remove connection to ${esc(other.title)}">Remove</button>
          </li>`).join('')}</ol>` : '<p class="none">Not connected yet. What does this remind you of, or what led you to it?</p>'}
          <form class="connect" autocomplete="off">
            <label><span class="visually-hidden">Connect to</span><select name="to" required><option value="">Connect to…</option>${others.map(o => `<option value="${o.id}">${esc(o.title)}</option>`).join('')}</select></label>
            <label><span class="visually-hidden">Why</span><input name="note" placeholder="Why? This is the part that matters"></label>
            <button class="action" type="submit"><span>Connect</span></button>
          </form>
        </section>
        <div class="panel-actions">
          <button class="action" data-edit><span>Edit</span></button>
          <button class="action" data-trace><span>Trace lineage</span></button>
          <button class="action action--danger" data-delete><span>Delete</span></button>
        </div>
      </div>`;
    panel.scrollTop = 0;
    panel.removeAttribute('inert');
    panel.classList.add('is-open');
    scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add('is-on'));
    document.body.classList.add('is-locked');
    $$('.row.is-selected').forEach(r => r.classList.remove('is-selected'));
    $(`.row[data-id="${id}"]`)?.classList.add('is-selected');
    $('[data-close]', panel).focus({ preventScroll: true });
  }
  function closePanel() {
    if (!panel.classList.contains('is-open')) return;
    ui.selected = null;
    panel.classList.remove('is-open'); panel.setAttribute('inert', '');
    scrim.classList.remove('is-on'); setTimeout(() => { if (!panel.classList.contains('is-open')) scrim.hidden = true; }, 300);
    document.body.classList.remove('is-locked');
    $$('.row.is-selected').forEach(r => r.classList.remove('is-selected'));
    returnFocus && document.contains(returnFocus) && returnFocus.focus({ preventScroll: true });
  }
  function step(d) {
    const list = filtered(), pos = list.findIndex(i => i.id === ui.selected);
    const next = list[pos + d]; if (next) openItem(next.id);
  }
  scrim.addEventListener('click', closePanel);
  panel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const id = ui.selected;
    if ('close' in b.dataset) closePanel();
    else if (b.dataset.step) step(+b.dataset.step);
    else if (b.dataset.open) openItem(b.dataset.open);
    else if (b.dataset.tagGo) { ui.tag = b.dataset.tagGo; closePanel(); render(); }
    else if (b.dataset.unlink) { db.links = db.links.filter(l => l.id !== b.dataset.unlink); save(); openItem(id); render(); toast('Connection removed'); }
    else if ('edit' in b.dataset) openCapture(byId(id));
    else if ('trace' in b.dataset) { ui.root = id; closePanel(); go('lineage'); }
    else if ('delete' in b.dataset && confirm('Delete this entry and its connections?')) {
      db.items = db.items.filter(i => i.id !== id);
      db.links = db.links.filter(l => l.a !== id && l.b !== id);
      save(); closePanel(); render(); toast('Entry deleted');
    }
  });
  panel.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (!f.get('to')) { $('select', e.target).focus(); return; }
    db.links.push({ id: uid(), a: ui.selected, b: f.get('to'), note: f.get('note').trim() });
    save(); openItem(ui.selected); render(); toast('Connected');
  });

  /* ---------- capture sheet ---------- */
  const sheet = $('#sheet'), form = $('#capture-form'), drop = $('#drop');
  $('#type-chips').insertAdjacentHTML('beforeend', Object.entries(TYPES).map(([k, t]) =>
    `<label><input type="radio" name="type" value="${k}"><span>${t.label}</span></label>`).join(''));
  $('#res-chips').insertAdjacentHTML('beforeend', Object.entries(RES).map(([k, v]) =>
    `<label><input type="radio" name="resonance" value="${k}"><span><span class="dot r-${k}"></span>${v.toLowerCase()} me</span></label>`).join(''));

  function syncFields() {
    const t = form.type.value;
    $('[data-for="url"]').hidden = !['source', 'quote', 'work', 'image'].includes(t);
  }
  form.addEventListener('change', e => { if (e.target.name === 'type') syncFields(); });

  function setPending(media) {
    ui.pending = media;
    const p = $('#drop-preview');
    drop.classList.toggle('has-media', !!media);
    if (!media) { p.innerHTML = ''; return; }
    p.innerHTML = (media.image ? `<img src="${media.image}" alt="">` : media.file ? `<div class="file"><span class="label">File · ${Math.max(1, Math.round(media.file.size / 1024))} KB</span><span>${esc(media.file.name)}</span></div>` : '') +
      `<button type="button" class="label clear" data-clear>Remove</button>`;
  }

  function openCapture(item = null, preset = {}) {
    ui.editing = item;
    form.reset();
    const v = item || { type: 'thought', resonance: 'inspires', date: today(), tags: [], ...preset };
    $('#sheet-title').textContent = item ? 'Edit entry' : 'New entry';
    form.type.value = v.type; form.resonance.value = v.resonance;
    form.title.value = v.title || ''; form.body.value = v.body || ''; form.url.value = v.url || '';
    form.date.value = v.date || ''; form.tags.value = (v.tags || []).join(', ');
    setPending(preset.media || (item && (item.image ? { image: item.image } : item.file ? { file: item.file } : null)) || null);
    syncFields();
    returnFocus = document.activeElement;
    sheet.removeAttribute('inert'); sheet.classList.add('is-open');
    document.body.classList.add('is-locked');
    setTimeout(() => (v.title ? form.body : form.title).focus({ preventScroll: true }), 60);
  }
  function closeCapture() {
    if (!sheet.classList.contains('is-open')) return;
    sheet.classList.remove('is-open'); sheet.setAttribute('inert', '');
    if (!panel.classList.contains('is-open')) document.body.classList.remove('is-locked');
    ui.editing = null; ui.pending = null;
    if (panel.classList.contains('is-open')) $('[data-close]', panel)?.focus(); else returnFocus?.focus?.({ preventScroll: true });
  }
  $$('[data-sheet-close]').forEach(b => b.addEventListener('click', closeCapture));
  drop.addEventListener('click', e => { if (e.target.closest('[data-clear]')) { e.preventDefault(); setPending(null); } });
  $('#f-media').addEventListener('change', async e => { const f = e.target.files[0]; if (f) setPending(await readMedia(f)); e.target.value = ''; });
  form.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); form.requestSubmit(); } });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(form);
    let title = f.get('title').trim();
    if (!title && ui.pending?.file) title = ui.pending.file.name.replace(/\.[^.]+$/, '');
    if (!title && f.get('url')) title = host(f.get('url'));
    if (!title) { form.title.focus(); form.title.setAttribute('aria-invalid', 'true'); form.title.placeholder = 'Give it a name first'; return; }
    form.title.removeAttribute('aria-invalid');
    const isNew = !ui.editing;
    const item = ui.editing || { id: uid(), created: new Date().toISOString() };
    Object.assign(item, {
      type: f.get('type'), resonance: f.get('resonance'), title,
      body: f.get('body').trim(), url: f.get('url').trim(), date: f.get('date'),
      tags: [...new Set(f.get('tags').split(',').map(t => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean))],
    });
    delete item.image; delete item.file;
    if (ui.pending?.image) { item.image = ui.pending.image; item.swatch = null; }
    if (ui.pending?.file) item.file = ui.pending.file;
    if (isNew) db.items.push(item);
    if (!save() && isNew) db.items.pop();
    closeCapture(); render(); openItem(item.id);
    toast(isNew ? 'Received' : 'Saved');
  });

  async function readMedia(file) {
    if (file.type.startsWith('image/')) return { image: await downscale(file, 1600) };
    return { file: { name: file.name, size: file.size, data: file.size < 1.5e6 ? await asDataUrl(file) : null } };
  }
  const asDataUrl = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  async function downscale(file, max) {
    const img = new Image();
    img.src = await asDataUrl(file);
    await img.decode();
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', .85);
  }

  /* ---------- receiving: drop and paste anywhere ---------- */
  let depth = 0;
  const dz = $('#dropzone');
  addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) { depth++; dz.classList.add('is-on'); } });
  addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; dz.classList.remove('is-on'); } });
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', async e => {
    e.preventDefault(); depth = 0; dz.classList.remove('is-on');
    const files = [...e.dataTransfer.files];
    if (!files.length) return;
    if (sheet.classList.contains('is-open')) return setPending(await readMedia(files[0]));
    if (files.length === 1) {
      const f = files[0], media = await readMedia(f);
      return openCapture(null, { type: media.image ? 'image' : 'file', title: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), media });
    }
    for (const f of files) {
      const media = await readMedia(f);
      db.items.push({ id: uid(), created: new Date().toISOString(), type: media.image ? 'image' : 'file', title: f.name.replace(/\.[^.]+$/, ''), body: '', url: '', date: today(), resonance: 'inspires', tags: [], ...media });
    }
    save(); render(); toast(`Received ${files.length} entries`);
  });
  addEventListener('paste', async e => {
    const file = [...(e.clipboardData?.files || [])][0];
    const text = e.clipboardData?.getData('text/plain')?.trim();
    if (sheet.classList.contains('is-open')) { if (file) { e.preventDefault(); setPending(await readMedia(file)); } return; }
    if (isTyping(document.activeElement) || panel.classList.contains('is-open')) return;
    if (file) { e.preventDefault(); const media = await readMedia(file); return openCapture(null, { type: media.image ? 'image' : 'file', media }); }
    if (!text) return;
    e.preventDefault();
    if (/^https?:\/\/\S+$/.test(text)) openCapture(null, { type: 'source', url: text, title: host(text) });
    else openCapture(null, { type: 'thought', body: text });
  });

  /* ---------- toolbar, routing, keys ---------- */
  function go(view) {
    if (!LENSES[view]) view = 'index';
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
    ui.view = view; ui.animate = true; render(); scrollTo({ top: 0 });
  }
  $$('.nav a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); go(a.dataset.view); }));
  $('[data-home]').addEventListener('click', e => { e.preventDefault(); ui.query = ''; ui.tag = ''; ui.res = ''; $('#search').value = ''; go('index'); });
  addEventListener('hashchange', () => go(location.hash.slice(1)));

  $('#res-filter').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (b) { ui.res = b.dataset.filter; render(); } });
  $('#tag-panel').addEventListener('click', e => { const b = e.target.closest('[data-tag]'); if (b) { ui.tag = ui.tag === b.dataset.tag ? '' : b.dataset.tag; render(); } });
  $('#tags-toggle').addEventListener('click', e => {
    const p = $('#tag-panel'), open = p.hidden;
    p.hidden = !open; e.currentTarget.setAttribute('aria-expanded', String(open));
  });
  $('#search').addEventListener('input', e => { ui.query = e.target.value; render(); });
  $('#search').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; ui.query = ''; render(); e.target.blur(); } });
  $('#add').addEventListener('click', () => openCapture());
  $('#view').addEventListener('click', e => {
    const o = e.target.closest('[data-open]'); if (o) return openItem(o.dataset.open);
    if (e.target.closest('[data-reset]')) { ui.query = ''; ui.tag = ''; ui.res = ''; $('#search').value = ''; render(); }
    if (e.target.closest('[data-capture]')) openCapture();
  });

  // Drift: older entries are more likely to surface
  $('#drift').addEventListener('click', () => {
    if (!db.items.length) return;
    const now = Date.now(), w = db.items.map(i => 1 + (now - (Date.parse(i.date) || now)) / 3.15e10);
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    const pick = db.items.find((_, k) => (r -= w[k]) <= 0) || db.items[0];
    openItem(pick.id);
  });

  addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (sheet.classList.contains('is-open')) return closeCapture(); if (panel.classList.contains('is-open')) return closePanel(); }
    if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey || sheet.classList.contains('is-open')) return;
    if (panel.classList.contains('is-open')) { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); return; }
    if (e.key === 'n') { e.preventDefault(); openCapture(); }
    else if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
    else if ('1234'.includes(e.key)) go(Object.keys(LENSES)[+e.key - 1]);
  });

  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (ui.view === 'constellation' || ui.view === 'lineage') render(); }, 150); });

  /* ---------- footer ---------- */
  $('#export').addEventListener('click', () => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })), download: `memory-archive-${today()}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Exported');
  });
  $('#import').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.items) || !Array.isArray(data.links)) throw 0;
      if (confirm(`Replace this archive with ${data.items.length} entries from ${file.name}?`)) { db = data; save(); render(); toast('Imported'); }
    } catch { toast('Not a Memory Archive export'); }
    e.target.value = '';
  });
  $('#clear-examples').addEventListener('click', () => {
    const n = db.items.filter(i => i.example).length;
    if (!n) return toast('No examples left');
    if (!confirm(`Remove the ${n} example entries? Your own entries stay.`)) return;
    const ex = new Set(db.items.filter(i => i.example).map(i => i.id));
    db.items = db.items.filter(i => !ex.has(i.id));
    db.links = db.links.filter(l => !ex.has(l.a) && !ex.has(l.b));
    save(); closePanel(); render(); toast('Examples removed');
  });

  let tt;
  function toast(msg) {
    const t = $('#toast');
    t.innerHTML = `<span class="dot"></span>${esc(msg)}`;
    t.classList.add('is-on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('is-on'), 2200);
  }

  /* ---------- example content (example: true, removable in one go) ---------- */
  function seed() {
    const items = [
      ['w1', 'work', 'Tidelines', 'Twelve drawings of the line the sea leaves behind. Pencil, repeated until the hand stops thinking.', '2025-03-14', 'inspires', ['drawing', 'sea', 'repetition'], ['#d9d4c7', '#2e2d29']],
      ['w2', 'work', 'Thread study', 'Red thread across a white room. People walked around it as if it were a wall.', '2023-09-02', 'inspires', ['installation', 'line', 'space'], ['#ece9e1', '#ff3b1f']],
      ['s1', 'source', 'Agnes Martin', 'Grids that feel like breathing. Return to this whenever the work gets loud.', '2016-11-20', 'inspires', ['painting', 'repetition', 'quiet'], null, 'https://en.wikipedia.org/wiki/Agnes_Martin'],
      ['s2', 'source', 'Hiroshi Sugimoto, Seascapes', 'Every photograph the same horizon, and still each one a different day.', '2018-06-11', 'inspires', ['photography', 'sea', 'time'], null, 'https://en.wikipedia.org/wiki/Hiroshi_Sugimoto'],
      ['s3', 'source', 'Tim Ingold, Lines: A Brief History', 'Walking, weaving, writing and drawing as the same activity: making a line.', '2021-02-03', 'informs', ['theory', 'line', 'book'], null, 'https://en.wikipedia.org/wiki/Tim_Ingold'],
      ['s4', 'source', 'John Cage, 4′33″', 'Framing what is already there instead of adding something.', '2012-04-09', 'informs', ['sound', 'attention'], null, 'https://en.wikipedia.org/wiki/4%E2%80%B233%E2%80%B3'],
      ['i1', 'image', 'Low tide, early morning', 'Ridges in the sand that look exactly like the drawings I didn’t know I would make.', '2019-10-27', 'inspires', ['sea', 'photo'], ['#c9c3b3', '#254fff']],
      ['i2', 'image', 'Grandmother’s embroidery drawer', 'Hundreds of half-finished samples. Nobody was meant to see them.', '1998-07-15', 'inspires', ['family', 'textile', 'memory'], ['#0b0b0c', '#b8b6ae']],
      ['t1', 'thought', 'Repetition is a way of paying attention', 'Not boredom. The tenth time you draw a line you finally see it.', '2020-01-08', 'inspires', ['repetition', 'attention']],
      ['t2', 'thought', 'What if the archive itself is the work?', 'Keeping, sorting, connecting. Maybe that is already the practice.', '2026-09-30', 'triggers', ['archive', 'practice']],
      ['n1', 'note', 'A crowded museum where I couldn’t see anything', 'Too many works shouting at once. Left after twenty minutes, irritated. I want work that lowers the volume.', '2022-05-21', 'triggers', ['museum', 'quiet']],
      ['q1', 'quote', 'You only notice the sea when it leaves', 'Overheard on the train. Wrote it on my hand.', '2024-11-02', 'triggers', ['sea', 'absence']],
      ['f1', 'file', 'Sketchbook scan, spring', 'First pages where the lines start repeating.', '2024-04-12', 'informs', ['sketchbook', 'drawing']],
      ['n2', 'note', 'Art school critique: “too decorative”', 'Still stings. Probably why I stripped everything back afterwards.', '2014-03-18', 'triggers', ['school', 'doubt']],
    ].map(([id, type, title, body, date, resonance, tags, swatch, url]) => ({
      id, type, title, body, date, resonance, tags, swatch: swatch || null, url: url || '', example: true, created: date + 'T12:00:00.000Z',
      ...(type === 'file' ? { file: { name: 'sketchbook-spring.pdf', size: 0, data: null } } : {}),
    }));
    const links = [
      ['w1', 'i1', 'The sand ridges were the first drawing. I just copied them for a year.'],
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

  // Old example data used soft gradients; give it the new placeholder tones
  const tones = { w1: ['#d9d4c7', '#2e2d29'], w2: ['#ece9e1', '#ff3b1f'], i1: ['#c9c3b3', '#254fff'], i2: ['#0b0b0c', '#b8b6ae'], s2: null };
  db.items.forEach(i => { if (i.example && i.id in tones) i.swatch = tones[i.id]; });

  ui.view = LENSES[location.hash.slice(1)] ? location.hash.slice(1) : 'index';
  render();
})();
