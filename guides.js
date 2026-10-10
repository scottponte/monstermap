/* Monster Map – guides: where to hunt at your level, and how to raise each skill.
   Data comes from the wiki (data/guides/, built by work/gen_guides.js). Talks to the map through window.MonsterMap. */
(() => {
  'use strict';

  const G = window.NH_GUIDES || {};
  const LV = G.leveling || { spots: [], intro: [] };
  const SK = G.skills || { list: [], groups: [] };
  const WIKI = 'https://monstersandmemories.miraheze.org/wiki/';
  const KEY = 'nh-atlas:guides';
  const MAX_LEVEL = 60;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const M = () => window.MonsterMap;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const PIN = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 18s5.5-5.2 5.5-9.5a5.5 5.5 0 0 0-11 0C4.5 12.8 10 18 10 18z"/><circle cx="10" cy="8.5" r="1.8"/></svg>';

  // ---------- what you've told the guides (kept in this browser) ----------
  const prefs = Object.assign({ level: '', mode: 'both', zone: '', q: '', skill: '', skillValues: {} }, (() => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  })());
  const savePrefs = debounce(() => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* not saved */ } }, 200);

  const zoneChip = (zone, text) => M()?.hasZone(zone)
    ? `<button class="zone-chip" data-zone="${esc(zone)}" data-text="${esc(text || '')}" title="Open the ${esc(zone)} map">${PIN}${esc(zone)}</button>`
    : `<span class="pill" title="No map for this zone yet">${esc(zone)}</span>`;
  function zoneClicks(host) {
    host.addEventListener('click', e => {
      const z = e.target.closest('[data-zone]');
      if (z) M().openPlace(z.dataset.zone, z.dataset.text);
    });
  }

  // =====================================================================
  // Leveling guide
  // =====================================================================
  const inRange = (r, L) => r.min !== null && L >= r.min && L <= r.max;
  function hits(spot, L, mode) {
    const s = inRange(spot.solo, L), g = inRange(spot.group, L);
    return mode === 'solo' ? s : mode === 'group' ? g : s || g;
  }
  // The level this spot starts being useful at, for the chosen way of playing.
  function startsAt(spot, mode) {
    const mins = [mode !== 'group' ? spot.solo.min : null, mode !== 'solo' ? spot.group.min : null].filter(v => v !== null);
    return mins.length ? Math.min(...mins) : null;
  }

  function spotCard(s, L) {
    const lvl = (label, r) => r.text
      ? `<span class="pill ${L && inRange(r, L) ? 'hit' : ''}">${label} <b>${esc(r.text)}</b></span>` : '';
    const title = s.area || s.monsters;
    return `<article class="card spot ${L && hits(s, L, prefs.mode) ? 'best' : ''}">
      <div class="spot-thumb" ${s.image ? `style="background-image:url('${esc(s.image)}')"` : ''}>${s.image ? '' : '⚔'}</div>
      <div class="spot-body">
        <div class="spot-top">${s.zones.map(z => zoneChip(z, s.area)).join('')}</div>
        <h4>${esc(title)}</h4>
        ${s.area && s.monsters ? `<div class="mobs">${esc(s.monsters)}</div>` : ''}
        ${s.notes ? `<div class="notes">${M().noteHtml(s.notes)}</div>` : ''}
        <div class="levels">${lvl('Solo', s.solo)}${lvl('Group', s.group)}</div>
      </div>
    </article>`;
  }

  let lvBuilt = false;
  function buildLeveling() {
    const host = $('#view-leveling');
    const zones = [...new Set(LV.spots.flatMap(s => s.zones))].sort();
    host.innerHTML = `<div class="guide-inner">
      <div class="guide-head">
        <div><h2>Leveling guide</h2><p>Where to hunt at your level. Pick a zone on any spot to open its map.</p></div>
        <div class="src">From the wiki's <a href="${WIKI}${esc(LV.page || '')}" target="_blank" rel="noopener">Per-Level Hunting Guide ↗</a><br>snapshot ${esc(LV.fetched || '')} · ${LV.spots.length} spots</div>
      </div>
      <div class="card lv-controls">
        <div class="lv-level">
          <label for="lv-level">My level</label>
          <div class="stepper"><button type="button" data-step="-1" aria-label="Lower level">−</button><input id="lv-level" type="number" min="1" max="${MAX_LEVEL}" inputmode="numeric" placeholder="–"><button type="button" data-step="1" aria-label="Raise level">+</button></div>
          <input id="lv-range" type="range" min="1" max="${MAX_LEVEL}" aria-label="Level">
        </div>
        <div class="seg" id="lv-mode" role="group" aria-label="How you play">
          <button data-mode="solo">Solo</button><button data-mode="group">Group</button><button data-mode="both">Either</button>
        </div>
        <select id="lv-zone" aria-label="Zone"><option value="">All zones</option>${zones.map(z => `<option>${esc(z)}</option>`).join('')}</select>
        <div class="grow"><input type="text" id="lv-q" placeholder="Filter by monster, area or note…"></div>
        <button class="btn small" id="lv-clear" title="Show every level">Show all levels</button>
      </div>
      <div id="lv-results"></div>
      <details class="card lv-how"><summary>How the level ranges work</summary>${LV.intro.map(p => `<p>${M().noteHtml(p)}</p>`).join('')}</details>
    </div>`;

    const lvl = $('#lv-level', host), range = $('#lv-range', host);
    const setLevel = v => {
      const n = parseInt(v, 10);
      prefs.level = Number.isFinite(n) ? Math.max(1, Math.min(MAX_LEVEL, n)) : '';
      savePrefs(); syncLevelingControls(); renderLeveling();
    };
    lvl.addEventListener('input', () => setLevel(lvl.value));
    range.addEventListener('input', () => setLevel(range.value));
    $$('.stepper [data-step]', host).forEach(b => b.addEventListener('click', () => setLevel((prefs.level || (b.dataset.step > 0 ? 0 : 2)) + +b.dataset.step)));
    $('#lv-mode', host).addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) { prefs.mode = b.dataset.mode; savePrefs(); syncLevelingControls(); renderLeveling(); } });
    $('#lv-zone', host).addEventListener('change', e => { prefs.zone = e.target.value; savePrefs(); renderLeveling(); });
    $('#lv-q', host).addEventListener('input', debounce(e => { prefs.q = e.target.value; savePrefs(); renderLeveling(); }, 150));
    $('#lv-clear', host).addEventListener('click', () => setLevel(''));
    zoneClicks(host);
    lvBuilt = true;
  }

  function syncLevelingControls() {
    const host = $('#view-leveling');
    $('#lv-level', host).value = prefs.level;
    $('#lv-range', host).value = prefs.level || 1;
    $$('#lv-mode button', host).forEach(b => b.classList.toggle('active', b.dataset.mode === prefs.mode));
    $('#lv-zone', host).value = prefs.zone;
    if ($('#lv-q', host).value !== prefs.q) $('#lv-q', host).value = prefs.q;
    $('#lv-clear', host).hidden = !prefs.level;
  }

  function renderLeveling() {
    const L = prefs.level || 0, mode = prefs.mode;
    const q = prefs.q.trim().toLowerCase();
    const pool = LV.spots.filter(s => (!prefs.zone || s.zones.includes(prefs.zone))
      && (!q || [s.area, s.monsters, s.notes, ...s.zones].join(' ').toLowerCase().includes(q)));
    const section = (title, sub, list) => list.length
      ? `<div class="lv-section"><h3>${title}</h3><span>${sub}</span></div><div class="spots">${list.map(s => spotCard(s, L)).join('')}</div>` : '';
    let html = '';
    if (L) {
      const now = pool.filter(s => hits(s, L, mode)).sort((a, b) => (startsAt(b, mode) ?? 0) - (startsAt(a, mode) ?? 0));
      const soon = pool.filter(s => !hits(s, L, mode) && startsAt(s, mode) !== null && startsAt(s, mode) > L && startsAt(s, mode) <= L + 4)
        .sort((a, b) => startsAt(a, mode) - startsAt(b, mode));
      const how = mode === 'both' ? 'solo or in a group' : mode === 'solo' ? 'solo' : 'in a group';
      html += section(`Hunt here at level ${L}`, `${now.length} spot${now.length === 1 ? '' : 's'} ${how}`, now)
        || `<div class="card lv-empty">The wiki lists no spot for level ${L} ${how}${prefs.zone || q ? ' with these filters' : ''}. Try “Either”, or look at what's coming up.</div>`;
      html += section('Coming up', `opens within the next 4 levels`, soon);
      const rest = pool.filter(s => !now.includes(s) && !soon.includes(s));
      if (rest.length) {
        html += `<details class="lv-rest"><summary class="lv-section" style="cursor:pointer"><h3>Other levels</h3><span>${rest.length} more spots</span></summary><div class="spots">${rest.map(s => spotCard(s, L)).join('')}</div></details>`;
      }
    } else {
      const brackets = [...new Set(pool.map(s => s.bracket))];
      html = brackets.map(b => section(`Levels ${esc(b)}`, '', pool.filter(s => s.bracket === b))).join('')
        || `<div class="card lv-empty">No hunting spots match these filters.</div>`;
    }
    $('#lv-results').innerHTML = html;
    M().setHash(`view=leveling${L ? `&level=${L}` : ''}${mode !== 'both' ? `&mode=${mode}` : ''}`);
  }

  // =====================================================================
  // Skills guide
  // =====================================================================
  // Tradeskills that share a map icon with another one.
  const ICON_FOR = { smelting: 'blacksmithing', fermenting: 'brewing', woodworking: 'carpentry', tanning: 'skinning', disenchanting: 'enchanting', 'bind-wound': 'first_aid' };
  const iconType = s => 'ts_' + (ICON_FOR[s.slug] || s.slug.replace(/-/g, '_'));
  const bySlug = Object.fromEntries(SK.list.map(s => [s.slug, s]));

  // The wiki's HTML, reduced to a safe set of tags and restyled by .wiki-body.
  const ALLOWED = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SUB', 'SUP', 'UL', 'OL', 'LI', 'DL', 'DT', 'DD', 'H3', 'H4', 'H5',
    'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'CAPTION', 'A', 'IMG', 'DIV', 'SPAN', 'CODE', 'PRE', 'BLOCKQUOTE', 'HR', 'SMALL', 'DETAILS', 'SUMMARY']);
  const HEADING = { H1: 'H3', H2: 'H3', H3: 'H4', H4: 'H5', H5: 'H5', H6: 'H5' };
  function clean(node, out) {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) { out.append(child.textContent); continue; }
      if (child.nodeType !== 1) continue;
      const cls = child.getAttribute('class') || '';
      if (/SCRIPT|STYLE|IFRAME|OBJECT|FORM|INPUT|BUTTON|LINK|META/.test(child.tagName)) continue;
      if (/\b(navbox|mw-editsection|toc|noprint|mw-empty-elt|reference)\b/.test(cls)) continue;
      // wiki "click to expand" blocks become native <details>
      if (/\bmw-collapsible\b/.test(cls) && !/\bmw-collapsible-content\b/.test(cls)) {
        const d = document.createElement('details'), sum = document.createElement('summary'), body = document.createElement('div');
        body.className = 'details-body';
        const content = child.querySelector('.mw-collapsible-content');
        const head = [...child.children].find(c => c !== content);
        sum.textContent = (head?.querySelector('span')?.textContent || head?.textContent || 'Details').replace(/Click to Expand\/Collapse/i, '').trim();
        clean(content || child, body);
        d.append(sum, body);
        out.append(d);
        continue;
      }
      const tag = HEADING[child.tagName] || child.tagName;
      if (!ALLOWED.has(tag)) { clean(child, out); continue; } // unknown wrapper: keep its contents
      const el = document.createElement(tag);
      if (tag === 'A') {
        const href = child.getAttribute('href') || '';
        if (/^https?:\/\//.test(href)) { el.href = href; el.target = '_blank'; el.rel = 'noopener'; }
        else if (!href.startsWith('#')) { clean(child, out); continue; }
      } else if (tag === 'IMG') {
        const src = child.getAttribute('src') || '';
        if (!/^https:\/\//.test(src)) continue;
        el.src = src; el.alt = child.getAttribute('alt') || ''; el.loading = 'lazy';
      } else if (tag === 'TD' || tag === 'TH') {
        for (const a of ['colspan', 'rowspan']) if (/^\d+$/.test(child.getAttribute(a) || '')) el.setAttribute(a, child.getAttribute(a));
      }
      clean(child, el);
      if (tag === 'TABLE') {
        const wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        wrap.append(el);
        out.append(wrap);
      } else out.append(el);
    }
  }
  function wikiToDom(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = document.createElement('div');
    out.className = 'wiki-body';
    clean(doc.body, out);
    // loose top-level boxes on the wiki are tips and warnings
    for (const d of [...out.children]) {
      if (d.tagName === 'DIV' && !d.className && d.textContent.trim() && !d.querySelector('table')) d.className = 'callout';
      if (d.tagName === 'DIV' && !d.textContent.trim() && !d.querySelector('img')) d.remove();
    }
    return out;
  }

  const pages = window.NH_SKILL_PAGES = window.NH_SKILL_PAGES || {};
  const loading = {};
  function loadPage(slug) {
    if (pages[slug] !== undefined) return Promise.resolve(pages[slug]);
    loading[slug] ||= new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = `data/guides/skills/${slug}.js?v=${encodeURIComponent(SK.fetched || '')}`;
      s.onload = () => res(pages[slug] ?? '');
      s.onerror = () => { delete loading[slug]; rej(new Error('could not load')); };
      document.head.append(s);
    });
    return loading[slug];
  }

  // Recipes stop giving skill-ups once your skill passes their "trivial" level, so work on the first tier above you.
  function tierState(s, v) {
    const now = s.tiers.findIndex(t => t.max > v);
    return { now, done: now === -1 ? s.tiers.length : now };
  }

  let skBuilt = false, skFilter = '';
  function buildSkills() {
    const host = $('#view-skills');
    host.innerHTML = `<div class="guide-inner">
      <div class="guide-head">
        <div><h2>Skills guide</h2><p>Every skill on the wiki. For tradeskills, enter your skill to see which recipes to work on.</p></div>
        <div class="src">From the wiki's <a href="${WIKI}Skills" target="_blank" rel="noopener">Skills pages ↗</a><br>snapshot ${esc(SK.fetched || '')} · ${SK.list.length} skills</div>
      </div>
      <div class="sk-layout">
        <aside class="card sk-list">
          <div class="sk-search"><input type="text" id="sk-q" placeholder="Find a skill…"></div>
          <div class="sk-scroll" id="sk-items"></div>
        </aside>
        <section class="card sk-detail" id="sk-detail"></section>
      </div>
    </div>`;
    $('#sk-q', host).addEventListener('input', e => { skFilter = e.target.value.trim().toLowerCase(); renderSkillList(); });
    $('#sk-items', host).addEventListener('click', e => { const b = e.target.closest('[data-skill]'); if (b) openSkill(b.dataset.skill); });
    zoneClicks(host);
    skBuilt = true;
  }

  function renderSkillList() {
    const list = SK.list.filter(s => !skFilter || s.name.toLowerCase().includes(skFilter) || s.group.toLowerCase().includes(skFilter));
    $('#sk-items').innerHTML = SK.groups.map(g => {
      const items = list.filter(s => s.group === g);
      if (!items.length) return '';
      return `<div class="sk-group">${esc(g === 'Tradeskills' ? g : g + ' skills')}</div>` + items.map(s => {
        const v = prefs.skillValues[s.slug];
        return `<button class="sk-item ${s.slug === prefs.skill ? 'active' : ''} ${s.hasContent ? '' : 'dim'}" data-skill="${s.slug}">
          <span class="nm">${esc(s.name)}</span>
          ${v ? `<span class="val" title="Your skill">${v}</span>` : ''}
          ${s.status === 'Not in the game yet' ? '<span class="tag">soon</span>' : ''}</button>`;
      }).join('');
    }).join('') || '<div class="lv-empty">No skill matches.</div>';
  }

  function openSkill(slug, { scroll = true } = {}) {
    const s = bySlug[slug] || SK.list[0];
    if (!s) return;
    prefs.skill = s.slug;
    savePrefs();
    renderSkillList();
    M().setHash(`view=skills&skill=${s.slug}`);
    const host = $('#sk-detail');
    const info = Object.entries(s.info);
    const icons = s.group === 'Tradeskills' && M().hasIconType(iconType(s)) ? M().iconsOfType(iconType(s)) : [];
    // zones named in the infobox's location line, e.g. "Night Harbor (Night Market), Underdocks (Forge Row)"
    const locText = s.info.Location || s.info.Locations || '';
    const locZones = locText.split(/,(?![^(]*\))/).map(t => t.trim()).filter(Boolean)
      .map(t => ({ zone: t.replace(/\s*\(.*$/, '').trim(), text: t })).filter(z => M().hasZone(z.zone));
    host.innerHTML = `
      <div class="sk-title">
        <h2>${esc(s.name)}</h2>
        <span class="pill">${esc(s.group === 'Tradeskills' ? 'Tradeskill' : s.group + ' skill')}</span>
        ${s.status ? `<span class="pill warn">${esc(s.status)}</span>` : ''}
        <a class="btn small" style="margin-left:auto" href="${WIKI}${esc(s.page)}" target="_blank" rel="noopener">Open on the wiki ↗</a>
      </div>
      ${s.summary ? `<p class="sk-summary">${esc(s.summary)}</p>` : ''}
      ${info.length ? `<dl class="sk-info">${info.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      ${locZones.length || icons.length ? `<div class="sk-onmap"><span>On the map:</span>
        ${locZones.map(z => zoneChip(z.zone, z.text)).join('')}
        ${icons.map(i => `<button class="zone-chip" data-icon="${esc(i.id)}" title="Show this ${esc(s.name)} icon on the ${esc(i.mapName)} map">${PIN}${esc(i.mapName)}${i.near ? ` · near ${esc(i.near)}` : ''}</button>`).join('')}
      </div>` : ''}
      ${s.tiers.length ? `<div class="sk-progress">
        <span class="label">My ${esc(s.name)} skill</span>
        <div class="stepper"><button type="button" data-step="-5" aria-label="Lower skill by 5">−</button><input id="sk-value" type="number" min="0" max="500" inputmode="numeric" placeholder="0" value="${prefs.skillValues[s.slug] || ''}"><button type="button" data-step="5" aria-label="Raise skill by 5">+</button></div>
        <div class="sk-advice" id="sk-advice"></div>
        <div class="sk-tiers" id="sk-tiers"></div>
      </div>` : ''}
      <div id="sk-page"><div class="sk-loading">Loading the ${esc(s.name)} page…</div></div>`;
    if (scroll) $('#view-skills').scrollTop = 0;

    host.onclick = e => {
      const ic = e.target.closest('[data-icon]');
      if (ic) return M().goIcon(ic.dataset.icon);
      const t = e.target.closest('[data-tier]');
      if (t) $(`#sk-page [data-tier-head="${t.dataset.tier}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const renderProgress = () => {
      if (!s.tiers.length) return;
      const v = prefs.skillValues[s.slug] || 0;
      const { now } = tierState(s, v);
      $('#sk-tiers').innerHTML = s.tiers.map((t, i) => `<button data-tier="${i}" class="${i === now ? 'now' : now === -1 || i < now ? 'done' : ''}" title="Jump to these recipes">${esc(t.title.replace(/^Trivial\s*/, ''))}</button>`).join('');
      $('#sk-advice').innerHTML = now === -1
        ? `At <b>${v}</b> you are past every recipe tier on the wiki.`
        : `At <b>${v}</b>, work on the <b>${esc(s.tiers[now].title)}</b> recipes${now > 0 ? '; earlier tiers no longer raise your skill' : ''}.`;
      $$('#sk-page [data-tier-head]').forEach(h => h.classList.toggle('tier-now', +h.dataset.tierHead === now));
    };
    const input = $('#sk-value', host);
    const setValue = v => {
      const n = Math.max(0, Math.min(500, parseInt(v, 10) || 0));
      if (n) prefs.skillValues[s.slug] = n; else delete prefs.skillValues[s.slug];
      if (document.activeElement !== input) input.value = n || '';
      savePrefs(); renderProgress(); renderSkillList();
    };
    input?.addEventListener('input', () => setValue(input.value));
    $$('.stepper [data-step]', host).forEach(b => b.addEventListener('click', () => { setValue((prefs.skillValues[s.slug] || 0) + +b.dataset.step); input.value = prefs.skillValues[s.slug] || ''; }));
    renderProgress();

    loadPage(s.slug).then(html => {
      if (prefs.skill !== s.slug) return; // moved on while loading
      const body = wikiToDom(html);
      let i = 0;
      for (const h of body.querySelectorAll('h3, h4, h5')) if (/^\s*Trivial\s*\d/.test(h.textContent)) h.dataset.tierHead = i++;
      const page = $('#sk-page');
      page.replaceChildren(body.textContent.trim() ? body : Object.assign(document.createElement('div'), { className: 'sk-loading', textContent: 'The wiki has nothing more on this skill yet.' }));
      renderProgress();
    }).catch(() => {
      if (prefs.skill === s.slug) $('#sk-page').innerHTML = `<div class="sk-loading">Couldn't load this page. <a href="${WIKI}${esc(s.page)}" target="_blank" rel="noopener">Open it on the wiki ↗</a></div>`;
    });
  }

  // =====================================================================
  // Public: called by the map app
  // =====================================================================
  window.MonsterGuides = {
    show(view) {
      if (view === 'leveling') {
        if (!lvBuilt) buildLeveling();
        syncLevelingControls(); renderLeveling();
      } else if (view === 'skills') {
        if (!skBuilt) buildSkills();
        renderSkillList();
        openSkill(prefs.skill || (SK.list.find(s => s.hasContent) || SK.list[0])?.slug, { scroll: false });
      }
    },
    // Called after show() when a link names a level or a skill.
    applyHash(q) {
      if (q.get('view') === 'leveling') {
        const n = parseInt(q.get('level'), 10);
        if (Number.isFinite(n)) prefs.level = Math.max(1, Math.min(MAX_LEVEL, n));
        if (['solo', 'group', 'both'].includes(q.get('mode'))) prefs.mode = q.get('mode');
        syncLevelingControls(); renderLeveling();
      } else if (q.get('view') === 'skills' && bySlug[q.get('skill')]) {
        openSkill(q.get('skill'));
      }
    },
    // Results for the top-bar search.
    search(q) {
      const out = [];
      const hit = t => String(t || '').toLowerCase().includes(q);
      if (hit('leveling guide hunting spots')) out.push({ group: 'Guides', label: 'Leveling guide', sub: 'where to hunt at your level', run: () => M().setView('leveling') });
      if (hit('skills guide tradeskills')) out.push({ group: 'Guides', label: 'Skills guide', sub: 'tradeskills and class skills', run: () => M().setView('skills') });
      for (const s of SK.list) {
        if (hit(s.name)) out.push({ group: 'Guides', label: s.name, sub: (s.group === 'Tradeskills' ? 'tradeskill' : s.group.toLowerCase() + ' skill') + ' · skills guide', run: () => { M().setView('skills'); openSkill(s.slug); } });
      }
      for (const s of LV.spots) {
        if (!(hit(s.area) || hit(s.monsters))) continue;
        out.push({
          group: 'Guides', label: s.area || s.monsters, sub: `hunting spot · levels ${s.bracket} · ${s.zones.join(', ')}`,
          run: () => { prefs.q = q; prefs.level = ''; prefs.zone = ''; M().setView('leveling'); },
        });
      }
      return out.slice(0, 8);
    },
  };
})();
