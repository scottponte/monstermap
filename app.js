/* Night Harbor Atlas – interactive map + annotations for Monsters & Memories. */
(() => {
  'use strict';

  const CATS = window.NH_CATEGORIES;
  const BUILTIN_MAPS = window.NH_ATLAS_MAPS;
  const ICONS_BY_MAP = window.NH_ICONS_BY_MAP || {};
  const LABELS_BY_MAP = window.NH_LABELS_BY_MAP || {}; // name banners painted on the map art
  const W = window.NHWiki;
  const ICON_TYPES = window.NH_ICON_TYPES;
  const ICON_GROUPS = window.NH_ICON_GROUPS;
  const LEVELS = window.NH_LEVEL_COLORS;
  const LETTERS = window.NH_ICON_LETTERS;

  const NOTE_CATS = {
    note:   { label: 'Notes',            color: '#e8c872', glyph: '✎' },
    quest:  { label: 'Quest steps',      color: '#f0913c', glyph: '!' },
    loot:   { label: 'Loot & named',     color: '#c99cf0', glyph: '◈' },
    danger: { label: 'Danger',           color: '#e05252', glyph: '☠' },
    camp:   { label: 'Camp spots',       color: '#6cc28a', glyph: '▲' },
    route:  { label: 'Routes & waypoints', color: '#6aa8e8', glyph: '●' },
  };

  const STORE_KEY = 'nh-atlas:v1';
  const WIKI_API = 'https://monstersandmemories.miraheze.org/w/api.php';
  const wikiKey = page => page === 'Night_Harbor' ? 'nh-atlas:wiki' : 'nh-atlas:wiki:' + page;
  const normPage = page => String(page || '').trim().replace(/ +/g, '_');

  // ---------- small helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const round = n => Math.round(n * 10) / 10;
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const levelNum = l => { const m = String(l || '').match(/\d+/); return m ? +m[0] : -1; };
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  // Wikitext cell -> safe HTML with [[links]] pointing at the wiki.
  function wikiHtml(raw, { dashAsEmpty = true } = {}) {
    const text = String(raw ?? '').trim();
    if (!text || (dashAsEmpty && text === '-')) return '<span class="muted">–</span>';
    const fmt = s => esc(s)
      .replace(/&#39;&#39;&#39;(.+?)&#39;&#39;&#39;/g, '<b>$1</b>')
      .replace(/&lt;br\s*\/?&gt;/gi, '<br>');
    let out = '', last = 0;
    for (const m of text.matchAll(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g)) {
      out += fmt(text.slice(last, m.index));
      out += `<a href="${esc(W.wikiUrl(m[1]))}" target="_blank" rel="noopener">${esc((m[2] || m[1]).trim())}</a>`;
      last = m.index + m[0].length;
    }
    return out + fmt(text.slice(last));
  }

  // User note text -> HTML: escapes, [[wiki links]], bare URLs.
  function noteHtml(text) {
    return wikiHtml(text, { dashAsEmpty: false })
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  }

  // ---------- persistence ----------
  function loadState() {
    const base = {
      version: 3, mapId: 'night-harbor', annotations: [], poiNotes: {}, poiOverrides: {}, iconEdits: {}, hidden: {},
      images: {}, customUrls: {}, customMaps: [], customIcons: [], imageOpacity: 1,
    };
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (s && (s.version || 1) < 3) {
        // v1/v2 only knew Night Harbor. v1 had painted icons, so it moves to the clean map.
        s.images = { 'night-harbor': (s.version || 1) < 2 ? 'clean' : (s.imageId || 'clean') };
        s.customUrls = s.customUrl ? { 'night-harbor': s.customUrl } : {};
        delete s.imageId; delete s.customUrl;
        for (const a of s.annotations || []) a.map = a.map || 'night-harbor';
        s.version = 3;
      }
      return s ? Object.assign(base, s) : base;
    } catch { return base; }
  }
  const state = loadState();
  const saveNow = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Could not save to browser storage – export your notes to keep them.'); }
  };
  const save = debounce(saveNow, 250);
  window.addEventListener('beforeunload', saveNow);

  const idb = {
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open('nh-atlas', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('files');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    async get(k) {
      const db = await this.open();
      return new Promise((res, rej) => { const q = db.transaction('files').objectStore('files').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    },
    async set(k, v) {
      const db = await this.open();
      return new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    },
  };

  // ---------- your own icons ----------
  // Stored in state.customIcons as { id, name, image (data URL) | emoji, shape }, and registered as icon types.
  ICON_GROUPS.custom = { label: 'My icons', color: '#e8c872' };
  function registerCustomIcons() {
    for (const k of Object.keys(ICON_TYPES)) if (ICON_TYPES[k].kind === 'custom') delete ICON_TYPES[k];
    for (const c of state.customIcons) ICON_TYPES[c.id] = { label: c.name, group: 'custom', kind: 'custom', custom: c };
  }
  registerCustomIcons();

  // ---------- maps ----------
  // Built-in maps come from data/maps/*.js; maps you add are stored in state.customMaps.
  let MAPS = [], MAP_BY_ID = {};
  function customDef(c) {
    return { ...c, custom: true, pois: [], images: [{ id: 'custom', name: 'Map image', url: c.imageUrl, credit: 'Map image added by you' }] };
  }
  function refreshMaps() {
    MAPS = [...BUILTIN_MAPS, ...state.customMaps.map(customDef)];
    MAP_BY_ID = Object.fromEntries(MAPS.map(m => [m.id, m]));
  }
  refreshMaps();
  const POIS = BUILTIN_MAPS.flatMap(m => m.pois.map(p => ({ ...p, map: m.id })));
  const SEED_ICONS = BUILTIN_MAPS.flatMap(m => (ICONS_BY_MAP[m.id] || []).map(i => ({ ...i, map: m.id })));
  let cur = MAP_BY_ID[state.mapId] || MAPS[0];
  let mapReady = false;
  const annMap = rec => rec.map || 'night-harbor';
  const mapName = id => MAP_BY_ID[id]?.name || 'a removed map';
  const mapOfPage = page => page ? MAPS.find(m => m.page && normPage(m.page).toLowerCase() === normPage(page).toLowerCase()) : null;
  // Where a place or pin leads: an explicit map id, or whatever map shows the wiki page it names.
  const destOf = x => (x.toMap && MAP_BY_ID[x.toMap]) || (x.link && MAP_BY_ID[x.link]) || mapOfPage(x.toPage) || null;

  // Level colours mean different things on each map.
  function levelInfo(color, mapId) {
    return { ...(LEVELS[color] || LEVELS.black), ...((MAP_BY_ID[mapId]?.levels || {})[color] || {}) };
  }
  const levelKeys = mapId => MAP_BY_ID[mapId]?.levels ? [...Object.keys(MAP_BY_ID[mapId].levels), 'black'] : Object.keys(LEVELS);

  // ---------- wiki data (one parsed page per map) ----------
  const EMPTY_WIKI = { intro: [], infobox: {}, quests: [], npcs: [], items: [], districts: [], travel: '' };
  const wikis = {};
  let npcCache = new Map();

  function loadWiki(m) {
    const page = normPage(m.page);
    let src = page ? (window.NH_WIKI_SNAPSHOTS || {})[page] || null : null;
    let synced = false;
    try {
      const cached = page && JSON.parse(localStorage.getItem(wikiKey(page)) || 'null');
      if (cached && cached.wikitext) { src = cached; synced = true; }
    } catch { /* fall back to snapshot */ }
    setWiki(m, src, synced);
  }

  function setWiki(m, src, synced) {
    const data = src ? W.parse(src.wikitext) : { ...EMPTY_WIKI };
    const byName = new Map();
    for (const n of data.npcs) {
      n.map = m.id;
      const k = n.name.toLowerCase();
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(n);
    }
    for (const q of data.quests) q.map = m.id;
    wikis[m.id] = { meta: { fetched: src?.fetched, synced, missing: !src }, data, byName };
    npcCache = new Map();
  }
  const wikiOf = id => wikis[id] || { meta: { missing: true }, data: EMPTY_WIKI, byName: new Map() };

  async function fetchWikitext(page) {
    const r = await fetch(`${WIKI_API}?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2&origin=*`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const wikitext = j?.parse?.wikitext;
    if (!wikitext) throw new Error(j?.error?.info || 'No wikitext in response');
    return wikitext;
  }

  async function syncWiki(m = cur, { quiet = false } = {}) {
    const page = normPage(m.page);
    if (!page) { if (!quiet) toast(`${m.name} isn't linked to a wiki page.`); return false; }
    const btn = $('#btn-sync');
    btn.disabled = true;
    if (!quiet) toast(`Fetching the ${m.name} page from the wiki…`);
    try {
      const wikitext = await fetchWikitext(page);
      const before = wikiOf(m.id).data.npcs.length;
      const src = { page, fetched: new Date().toLocaleDateString('sv'), wikitext };
      try { localStorage.setItem(wikiKey(page), JSON.stringify(src)); } catch { /* still usable this session */ }
      setWiki(m, src, true);
      rebuildWikiViews();
      const d = wikiOf(m.id).data, diff = d.npcs.length - before;
      if (!quiet) toast(`${m.name} synced: ${d.npcs.length} NPCs, ${d.quests.length} quests${diff && before ? ` (${diff > 0 ? '+' : ''}${diff} NPCs)` : ''}.`);
      return true;
    } catch (e) {
      if (!quiet) toast(`Wiki sync for ${m.name} failed: ${e.message}`);
      return false;
    } finally {
      btn.disabled = false;
    }
  }

  // NPCs shown for a place: its wiki table and/or the NPCs matching npcFilter, minus npcExclude.
  function npcsForPoi(poi) {
    if (!poi.table && !poi.npcFilter) return [];
    if (npcCache.has(poi.id)) return npcCache.get(poi.id);
    const has = (n, fs) => [n.name, n.location, W.plain(n.desc)].some(v => fs.some(f => v.toLowerCase().includes(f)));
    let rows = wikiOf(poi.map).data.npcs;
    if (poi.table) rows = rows.filter(n => n.district === poi.table);
    if (poi.npcFilter) { const fs = [].concat(poi.npcFilter).map(f => f.toLowerCase()); rows = rows.filter(n => has(n, fs)); }
    if (poi.npcExclude) { const fs = [].concat(poi.npcExclude).map(f => f.toLowerCase()); rows = rows.filter(n => !has(n, fs)); }
    npcCache.set(poi.id, rows);
    return rows;
  }

  function poiForNpc(npc) {
    const cands = POIS.filter(p => p.map === npc.map && (p.table ? p.table === npc.district : p.npcFilter));
    const specific = cands.find(p => p.npcFilter && npcsForPoi(p).includes(npc));
    return specific || cands.find(p => p.table && !p.npcFilter) || cands.find(p => p.table) || null;
  }

  function poiForName(name, mapId = cur.id) {
    const list = wikiOf(mapId).byName.get(W.plain(name).toLowerCase()) || [];
    for (const n of list) { const p = poiForNpc(n); if (p) return { poi: p, npc: n }; }
    return { poi: null, npc: list[0] || null };
  }

  function questsForNpcs(npcs, mapId = cur.id) {
    const names = new Set(npcs.map(n => n.name.toLowerCase()));
    return wikiOf(mapId).data.quests.filter(q => q.giverNames.some(g => names.has(W.plain(g).toLowerCase())));
  }

  // ---------- map ----------
  const boundsOf = m => [[0, 0], [m.height, m.width]];
  // y grows downward so coordinates match image pixels: latlng = [y, x].
  const CRS = L.extend({}, L.CRS.Simple, { transformation: new L.Transformation(1, 0, 1, 0) });
  const map = L.map('map', {
    crs: CRS, minZoom: -2, maxZoom: 3, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90,
    zoomControl: false, maxBoundsViscosity: 0.8,
  });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');

  let imageLayer = null;
  const objectUrls = {};
  // Image files you add are kept in IndexedDB. The first Night Harbor upload used the key 'custom-map'.
  const fileKey = mapId => mapId === 'night-harbor' ? 'custom-map' : 'custom-map:' + mapId;
  async function fileUrl(key) {
    if (!objectUrls[key]) {
      const blob = await idb.get(key).catch(() => null);
      if (!blob) return null;
      objectUrls[key] = URL.createObjectURL(blob);
    }
    return objectUrls[key];
  }
  const imageIdOf = m => state.images[m.id] || m.images[0].id;

  async function imageUrlFor(m, id) {
    const fallback = m.images[0].url;
    if (id === 'custom-url') return state.customUrls[m.id] || fallback;
    if (id === 'custom-file') return (await fileUrl(fileKey(m.id))) || fallback;
    const url = (m.images.find(i => i.id === id) || m.images[0]).url;
    if (url === 'idb:') return (await fileUrl(fileKey(m.id))) || '';
    return url;
  }

  async function applyImage() {
    const m = cur;
    const id = imageIdOf(m);
    const url = await imageUrlFor(m, id);
    if (m !== cur) return; // switched again while loading
    const img = m.images.find(i => i.id === id);
    if (!imageLayer) {
      imageLayer = L.imageOverlay(url, boundsOf(m), { pmIgnore: true, opacity: state.imageOpacity, attribution: '' }).addTo(map);
      imageLayer.on('error', () => toast("Couldn't load the map image. Check your connection, or pick another image under Layers."));
    } else {
      imageLayer.setUrl(url);
      imageLayer.setBounds(L.latLngBounds(boundsOf(m)));
    }
    imageLayer.setOpacity(state.imageOpacity);
    map.attributionControl._attributions = {};
    map.attributionControl.addAttribution(
      (img ? esc(img.credit) : 'Custom map image') +
      (m.page ? ` · Data: <a href="${esc(W.wikiUrl(m.page))}" target="_blank" rel="noopener">M&amp;M wiki</a>` : ''));
  }

  // One set of layer groups per map. Only the current map's groups are on the Leaflet map.
  const sets = {};
  function setOf(mapId) {
    if (!sets[mapId]) {
      const st = { poi: {}, icon: {}, ann: {} };
      for (const k of Object.keys(CATS)) st.poi[k] = L.layerGroup();
      for (const k of Object.keys(ICON_GROUPS)) st.icon[k] = L.layerGroup();
      for (const k of Object.keys(NOTE_CATS)) st.ann[k] = L.featureGroup();
      sets[mapId] = st;
    }
    return sets[mapId];
  }
  function showMapLayers(mapId, on) {
    for (const [kind, groups] of Object.entries(setOf(mapId))) {
      for (const [k, g] of Object.entries(groups)) {
        if (on && !state.hidden[kind + ':' + k]) g.addTo(map); else g.remove();
      }
    }
  }

  function switchMap(id, { fit = true } = {}) {
    const next = MAP_BY_ID[id];
    if (!next) return false;
    if (next === cur && mapReady) { if (fit) map.fitBounds(boundsOf(cur), { animate: false }); return true; }
    if (mapReady) showMapLayers(cur.id, false);
    if (selected) closeDrawer();
    stopPlacing();
    cur = next;
    state.mapId = cur.id;
    save();
    // Views change instantly between maps; the new pan limits apply once the caller has set its view.
    map.setMaxBounds(null);
    if (fit || !mapReady) map.fitBounds(boundsOf(cur), { animate: false });
    const limitsFor = cur;
    setTimeout(() => { if (cur === limitsFor) map.setMaxBounds([[-cur.height * 0.25, -cur.width * 0.25], [cur.height * 1.25, cur.width * 1.25]]); }, 0);
    applyImage();
    showMapLayers(cur.id, true);
    mapReady = true;
    if (!selected) viewHash();
    updateIconScale();
    document.title = `${cur.name} · Night Harbor Atlas`;
    renderMapPicker();
    renderAll();
    return true;
  }

  // Travel through an exit: arrive at the exit on the other side that leads back, if there is one.
  function travel(toId) {
    const fromId = cur.id;
    if (!switchMap(toId, { fit: false })) return;
    const back = POIS.find(p => p.map === toId && destOf(p)?.id === fromId);
    const backPin = !back && state.annotations.find(a => annMap(a) === toId && a.kind === 'marker' && a.link === fromId);
    if (back) {
      if (placed(back)) map.setView(poiPos(back), 0.5, { animate: false });
      else map.fitBounds(boundsOf(cur), { animate: false });
      select('poi', back.id);
    } else if (backPin) {
      map.setView(backPin.geo.latlng, 0.5, { animate: false });
      select('ann', backPin.id);
    } else {
      map.fitBounds(boundsOf(cur), { animate: false });
    }
    toast(`Travelled to ${cur.name}.`);
  }

  // Icons
  function poiIcon(poi) {
    const c = CATS[poi.cat];
    const note = (state.poiNotes[poi.id] || '').trim() ? ' has-note' : '';
    if (bannerOf(poi)) {
      // the banner is the place; this small badge sits off the end of the scroll so the name stays readable
      return L.divIcon({
        className: 'nh-marker', iconSize: [18, 18], iconAnchor: [-3, 9], tooltipAnchor: [9, -9],
        html: `<div class="poi-icon poi-badge${note}" style="--c:${c.color}">${c.glyph}</div>`,
      });
    }
    return L.divIcon({
      className: 'nh-marker', iconSize: [28, 28], iconAnchor: [14, 14],
      html: `<div class="poi-icon${note}" style="--c:${c.color}">${c.glyph}</div>`,
    });
  }
  function pinIcon(color, glyph) {
    return L.divIcon({
      className: 'nh-marker', iconSize: [28, 38], iconAnchor: [14, 37], tooltipAnchor: [0, -30],
      html: `<div class="pin-icon" style="--c:${color}"><svg width="28" height="38" viewBox="0 0 28 38"><path d="M14 37C14 37 2 22.5 2 13.5a12 12 0 0 1 24 0C26 22.5 14 37 14 37z" fill="${color}" stroke="#16130b" stroke-width="1.5"/></svg><span class="g">${esc(glyph)}</span></div>`,
    });
  }
  function labelIcon(text, color) {
    return L.divIcon({
      className: 'nh-marker', iconSize: [0, 0], iconAnchor: [0, 0],
      html: `<span class="label-icon" style="--c:${color}">${esc(text || 'Label')}</span>`,
    });
  }

  // ---------- seed places ----------
  const poiMarkers = {};
  let editingPlaces = false;

  const bannerOf = p => LABELS_BY_MAP[p.map]?.[p.id] || null;
  function poiPos(p) {
    const o = state.poiOverrides[p.id];
    if (o) return [o.y, o.x];
    const b = bannerOf(p);
    if (b) return [(b[1] + b[3]) / 2, b[2]];
    return Number.isFinite(p.x) && Number.isFinite(p.y) ? [p.y, p.x] : null; // null: not placed on the map yet
  }
  const placed = p => !!poiPos(p);
  const bannerRects = {};

  function buildPois() {
    POIS.forEach(makePoiMarker);
  }

  function makePoiMarker(p) {
    if (poiMarkers[p.id] || !placed(p)) return;
    {
      const m = L.marker(poiPos(p), { icon: poiIcon(p), pmIgnore: true, riseOnHover: true, keyboard: true, title: '' });
      m.bindTooltip(() => {
        const d = destOf(p);
        return esc(p.name) + (d ? ` <span class="tip-go">→ ${esc(d.name)} · double-click to travel</span>` : '');
      }, { className: 'nh-tip', direction: 'top', offset: [0, -14] });
      m.on('click', () => select('poi', p.id));
      m.on('dblclick', () => { const d = destOf(p); if (d) travel(d.id); });
      m.on('dragend', () => {
        const ll = m.getLatLng();
        state.poiOverrides[p.id] = { x: round(ll.lng), y: round(ll.lat) };
        save();
      });
      m.on('add', () => { if (editingPlaces) m.dragging?.enable(); });
      poiMarkers[p.id] = m;
      m._grp = setOf(p.map).poi[p.cat];
      m._grp.addLayer(m);
      const b = bannerOf(p);
      if (b) {
        // invisible until hovered: clicking the painted banner selects the place
        const r = L.rectangle([[b[1], b[0]], [b[3], b[2]]], {
          className: 'banner-hit', color: CATS[p.cat].color, weight: 2, opacity: 0, fillColor: CATS[p.cat].color, fillOpacity: 0, pmIgnore: true,
        });
        r.bindTooltip(m.getTooltip()._content, { className: 'nh-tip', direction: 'top', offset: [0, -4] });
        r.on('click', e => { L.DomEvent.stopPropagation(e); select('poi', p.id); });
        r.on('dblclick', e => { L.DomEvent.stopPropagation(e); const d = destOf(p); if (d) travel(d.id); });
        r.on('add', () => { if (isSelected('poi', p.id)) r._path?.classList.add('selected'); });
        bannerRects[p.id] = r;
        setOf(p.map).poi[p.cat].addLayer(r);
      }
    }
  }

  function syncPoiMarkers() {
    for (const p of POIS) {
      const m = poiMarkers[p.id];
      if (m && !placed(p)) { m.remove(); m._grp?.removeLayer(m); delete poiMarkers[p.id]; continue; }
      if (!m) { makePoiMarker(p); continue; }
      m.setLatLng(poiPos(p));
      m.setIcon(poiIcon(p));
    }
    markSelected();
  }

  function refreshPoiIcon(id) {
    const p = POIS.find(x => x.id === id);
    if (!poiMarkers[id]) return;
    poiMarkers[id].setIcon(poiIcon(p));
    markSelected();
  }

  function setEditingPlaces(on) {
    editingPlaces = on;
    document.body.classList.toggle('editing-places', on);
    $('#btn-edit-places').classList.toggle('on', on);
    for (const m of [...Object.values(poiMarkers), ...Object.values(iconMarkers)]) on ? m.dragging?.enable() : m.dragging?.disable();
    toast(on ? 'Drag place markers and map icons to move them. Click "Edit places" again when done.' : 'Positions saved.');
  }

  // ---------- map icons (the legend icons that used to be painted on the map) ----------
  const iconMarkers = {};
  const SEED_BY_ID = Object.fromEntries(SEED_ICONS.map(i => [i.id, i]));

  function iconRec(id) {
    const s = SEED_BY_ID[id];
    return s ? { ...s, ...(state.iconEdits[id] || {}) } : null;
  }
  const iconTypeOf = r => ICON_TYPES[r.type] ? r.type : 'skills';
  function iconGroupOf(r) {
    const t = ICON_TYPES[iconTypeOf(r)];
    if (t.colorable && r.type !== 'ring' && (r.color || 'blue') === 'blue') return 'notable';
    return t.group;
  }
  function letterMeaning(letter) {
    if (!letter) return '';
    return letter.split('/').map(l => LETTERS[l.trim().toUpperCase()]?.label || l.trim()).join(' / ');
  }
  function iconDefaultTitle(r) {
    const t = ICON_TYPES[iconTypeOf(r)];
    const lm = letterMeaning(r.letter);
    const who = levelInfo('blue', r.map).label;
    if (iconGroupOf(r) === 'notable') return lm && r.letter !== '+' ? `${who} – ${lm}` : who;
    if (t.colorable) return `${t.label} · ${levelInfo(r.color, r.map).label}${r.letter === '+' ? ' (several)' : ''}`;
    return t.label;
  }
  const iconTitle = r => r.title || iconDefaultTitle(r);

  // Markup shared by built-in icons and user pins shown as icons.
  function iconHtml(type, color, letter) {
    const k = ICON_TYPES[type] ? type : 'skills';
    const t = ICON_TYPES[k];
    const scale = t.scale || 1;
    if (t.kind === 'custom') {
      const c = t.custom;
      const cls = `mi-wrap mi-custom mi-c-${c.shape || 'round'}`;
      return c.image
        ? `<div class="${cls}" style="background-image:url(${esc(c.image)})"></div>`
        : `<div class="${cls} mi-emoji"><span>${esc(c.emoji || '?')}</span></div>`;
    }
    if (t.kind === 'shape') {
      const c = (LEVELS[color] || (k === 'star' ? LEVELS.black : LEVELS.blue)).color;
      const plus = letter === '+';
      const txt = letter && !plus ? `<b class="mi-letter">${esc(letter)}</b>` : '';
      return `<div class="mi-wrap mi-shape-wrap" style="--k:${scale}"><div class="mi-shape" style="--c:${c};--m:url(assets/icons/shape-${k}.png)"></div>${txt}${plus ? '<b class="mi-plus">+</b>' : ''}</div>`;
    }
    return `<div class="mi-wrap mi-${t.kind}" style="--k:${scale};background-image:url(assets/icons/${t.sprite || k}.png)"></div>`;
  }
  const iconDivIcon = (type, color, letter) => L.divIcon({ className: 'nh-marker nh-mi', iconSize: [0, 0], iconAnchor: [0, 0], html: iconHtml(type, color, letter) });

  // Icons scale with the map like the original art, within readable limits.
  function updateIconScale() {
    const px = Math.max(22, Math.min(84, 18.4 * Math.pow(2, map.getZoom())));
    map.getContainer().style.setProperty('--mi', px.toFixed(1) + 'px');
  }
  map.on('zoom', updateIconScale);

  function renderIcon(id) {
    const r = iconRec(id);
    const old = iconMarkers[id];
    if (old) { old.remove(); old._grp?.removeLayer(old); delete iconMarkers[id]; }
    if (!r || r.deleted) return;
    const m = L.marker([r.y, r.x], { icon: iconDivIcon(r.type, r.color, r.letter), pmIgnore: true, riseOnHover: true });
    m.bindTooltip(esc(iconTitle(r)), { className: 'nh-tip', direction: 'top', offset: [0, -12] });
    m.on('click', () => select('icon', id));
    m.on('dragend', () => {
      const ll = m.getLatLng();
      editIcon(id, { x: round(ll.lng), y: round(ll.lat) });
      if (isSelected('icon', id)) renderIconDrawer(iconRec(id));
    });
    m.on('add', () => { if (editingPlaces) m.dragging?.enable(); if (isSelected('icon', id)) markSelected(); });
    iconMarkers[id] = m;
    m._grp = setOf(r.map).icon[iconGroupOf(r)];
    m._grp.addLayer(m);
  }

  function buildIcons() {
    SEED_ICONS.forEach(i => renderIcon(i.id));
  }

  // Store only what differs from the original icon.
  function editIcon(id, patch) {
    const seed = SEED_BY_ID[id];
    const e = { ...(state.iconEdits[id] || {}), ...patch };
    for (const [k, v] of Object.entries(e)) {
      if (v === '' || v === undefined || v === null || v === false || (k in seed && seed[k] === v)) delete e[k];
    }
    if (Object.keys(e).length) state.iconEdits[id] = e; else delete state.iconEdits[id];
    save();
  }

  function nearestPoi(x, y, mapId = cur.id) {
    let best = null, bd = Infinity;
    for (const p of POIS) {
      if (p.map !== mapId) continue;
      if (!placed(p)) continue;
      const [py, px] = poiPos(p);
      const d = Math.hypot(px - x, py - y);
      if (d < bd) { best = p; bd = d; }
    }
    return { poi: best, dist: bd };
  }

  // Wiki NPCs that probably belong to an icon: by trade keyword, by legend letter, or by level near the icon.
  function relatedNpcs(r) {
    const t = ICON_TYPES[iconTypeOf(r)];
    const words = [...(t.wiki || [])];
    if (r.letter) for (const l of r.letter.split('/')) words.push(...(LETTERS[l.trim().toUpperCase()]?.wiki || []));
    const seen = new Set();
    const out = [];
    const push = n => { const k = n.name + '|' + n.district; if (!seen.has(k)) { seen.add(k); out.push(n); } };
    if (words.length) {
      const ws = words.map(w => w.toLowerCase());
      wikiOf(r.map).data.npcs.filter(n => ws.some(w => n.name.toLowerCase().includes(w) || W.plain(n.desc).toLowerCase().includes(w))).forEach(push);
    }
    const range = levelInfo(r.color, r.map).range;
    if (t.colorable && range) {
      const { poi } = nearestPoi(r.x, r.y, r.map);
      if (poi) npcsForPoi(poi).filter(n => { const l = levelNum(n.level); return l >= range[0] && l <= range[1]; }).forEach(push);
    }
    // closest districts first
    const d = n => { const p = poiForNpc(n); if (!p || !placed(p)) return 1e9; const [py, px] = poiPos(p); return Math.hypot(px - r.x, py - r.y); };
    return out.sort((a, b) => d(a) - d(b)).slice(0, 25);
  }

  function iconTypeOptions(selected) {
    return Object.entries(ICON_GROUPS).filter(([g]) => g !== 'notable').map(([g, gv]) => {
      const opts = Object.entries(ICON_TYPES).filter(([, t]) => t.group === g)
        .sort((a, b) => a[1].label.localeCompare(b[1].label))
        .map(([k, t]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(t.label)}</option>`).join('');
      return `<optgroup label="${esc(gv.label)}">${opts}</optgroup>`;
    }).join('');
  }
  const levelOptions = (selected, mapId = cur.id) => levelKeys(mapId).map(k => `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(levelInfo(k, mapId).label)}</option>`).join('');

  function removeIcon(id) {
    editIcon(id, { deleted: true });
    renderIcon(id);
    if (isSelected('icon', id)) closeDrawer();
    renderLayersPanel(); renderNotesPanel();
    toast(`Removed "${iconTitle(iconRec(id))}" from the map.`, {
      action: 'Undo',
      onAction: () => { editIcon(id, { deleted: false }); renderIcon(id); renderLayersPanel(); select('icon', id); },
    });
  }

  // ---------- annotations ----------
  const annLayers = {};

  function catOf(rec) { return NOTE_CATS[rec.cat] ? rec.cat : 'note'; }
  function colorOf(rec) { return rec.color || NOTE_CATS[catOf(rec)].color; }

  function styleFor(rec, selected) {
    const color = colorOf(rec);
    return {
      color, weight: selected ? 5 : 3, opacity: .95,
      fillColor: color, fillOpacity: rec.kind === 'polyline' ? 0 : (selected ? .28 : .16),
      dashArray: rec.dashed ? '8 8' : null,
    };
  }

  function buildAnnLayer(rec) {
    const color = colorOf(rec);
    const g = rec.geo;
    let layer;
    if (rec.kind === 'marker') {
      const icon = rec.display === 'label' ? labelIcon(rec.title, color)
        : rec.display === 'icon' ? iconDivIcon(rec.iconType || 'skills', rec.iconColor, rec.iconLetter)
        : pinIcon(color, rec.link ? '➜' : NOTE_CATS[catOf(rec)].glyph);
      layer = L.marker(g.latlng, { icon, riseOnHover: true });
    } else if (rec.kind === 'circle') {
      layer = L.circle(g.center, { radius: g.radius, ...styleFor(rec) });
    } else if (rec.kind === 'polyline') {
      layer = L.polyline(g.latlngs, styleFor(rec));
    } else {
      layer = L.polygon(g.latlngs, styleFor(rec));
    }
    layer._annId = rec.id;
    if (rec.kind !== 'marker' && rec.showLabel && rec.title) {
      layer.bindTooltip(esc(rec.title), { permanent: true, direction: 'center', className: 'nh-area-label' });
    } else if (!(rec.kind === 'marker' && rec.display === 'label')) {
      const d = rec.kind === 'marker' && destOf({ link: rec.link });
      layer.bindTooltip(esc(rec.title || 'Untitled') + (d ? ` <span class="tip-go">→ ${esc(d.name)} · double-click to travel</span>` : ''),
        { className: 'nh-tip', direction: 'top', sticky: rec.kind !== 'marker' });
    }
    if (rec.kind === 'marker') layer.on('dblclick', () => { const d = destOf({ link: rec.link }); if (d) travel(d.id); });
    layer.on('click', e => {
      L.DomEvent.stopPropagation(e);
      if (map.pm.globalRemovalModeEnabled()) return;
      select('ann', rec.id);
    });
    const sync = () => { rec.geo = geoOf(rec.kind, layer); touch(rec); save(); if (isSelected('ann', rec.id)) renderMeta(rec); };
    layer.on('pm:edit', sync);
    layer.on('pm:dragend', sync);
    return layer;
  }

  function geoOf(kind, layer) {
    const pt = ll => [round(ll.lat), round(ll.lng)];
    if (kind === 'marker') return { latlng: pt(layer.getLatLng()) };
    if (kind === 'circle') return { center: pt(layer.getLatLng()), radius: round(layer.getRadius()) };
    if (kind === 'polyline') return { latlngs: layer.getLatLngs().map(pt) };
    return { latlngs: layer.getLatLngs()[0].map(pt) };
  }

  function centerOf(rec) {
    const g = rec.geo;
    if (g.latlng) return g.latlng;
    if (g.center) return g.center;
    const ys = g.latlngs.map(p => p[0]), xs = g.latlngs.map(p => p[1]);
    return [(Math.min(...ys) + Math.max(...ys)) / 2, (Math.min(...xs) + Math.max(...xs)) / 2];
  }

  function renderAnn(rec) {
    const old = annLayers[rec.id];
    if (old) { old.remove(); old._grp?.removeLayer(old); }
    const layer = buildAnnLayer(rec);
    annLayers[rec.id] = layer;
    layer._grp = setOf(annMap(rec)).ann[catOf(rec)];
    layer._grp.addLayer(layer);
    if (isSelected('ann', rec.id)) markSelected();
  }

  function buildAnnotations() {
    state.annotations.forEach(renderAnn);
  }

  function touch(rec) { rec.updated = new Date().toISOString(); }

  function createAnnotation(partial) {
    const now = new Date().toISOString();
    const rec = Object.assign({
      id: uid(), kind: 'marker', title: '', note: '', cat: 'note', color: '', tags: [],
      display: 'pin', showLabel: false, dashed: false, created: now, updated: now, map: cur.id,
    }, partial);
    if (!rec.title) rec.title = { marker: 'New pin', polyline: 'New route', circle: 'New circle', polygon: 'New area' }[rec.kind];
    state.annotations.push(rec);
    if (state.hidden['ann:' + catOf(rec)]) setLayerVisible('ann:' + catOf(rec), true);
    renderAnn(rec);
    save();
    renderNotesPanel();
    select('ann', rec.id, { focusTitle: true });
    return rec;
  }

  function deleteAnnotation(id, { fromMap = false } = {}) {
    const i = state.annotations.findIndex(a => a.id === id);
    if (i < 0) return;
    const [rec] = state.annotations.splice(i, 1);
    const layer = annLayers[id];
    if (layer && !fromMap) layer.remove();
    if (layer) layer._grp?.removeLayer(layer);
    delete annLayers[id];
    if (isSelected('ann', id)) closeDrawer();
    save();
    renderNotesPanel();
    renderLayersPanel();
    toast(`Deleted "${rec.title}".`, {
      action: 'Undo',
      onAction: () => { state.annotations.splice(i, 0, rec); renderAnn(rec); save(); renderNotesPanel(); select('ann', rec.id); },
    });
  }

  // ---------- drawing tools ----------
  map.pm.setGlobalOptions({
    continueDrawing: false,
    snappable: false,
    markerStyle: { icon: pinIcon(NOTE_CATS.note.color, NOTE_CATS.note.glyph) },
    pathOptions: { color: NOTE_CATS.note.color, fillColor: NOTE_CATS.note.color, fillOpacity: .16, weight: 3 },
    templineStyle: { color: NOTE_CATS.note.color },
    hintlineStyle: { color: NOTE_CATS.note.color, dashArray: '5 5' },
  });
  map.pm.addControls({
    position: 'topright',
    drawMarker: true, drawPolyline: true, drawPolygon: true, drawRectangle: true, drawCircle: true,
    drawCircleMarker: false, drawText: false, cutPolygon: false, rotateMode: false,
    editMode: true, dragMode: true, removalMode: true,
  });

  map.on('pm:create', e => {
    const kind = e.shape === 'Marker' ? 'marker' : e.shape === 'Line' ? 'polyline' : e.shape === 'Circle' ? 'circle' : 'polygon';
    const geo = geoOf(kind, e.layer);
    e.layer.remove();
    createAnnotation({ kind, geo, cat: kind === 'polyline' ? 'route' : 'note' });
  });
  map.on('pm:remove', e => { if (e.layer._annId) deleteAnnotation(e.layer._annId, { fromMap: true }); });

  // Right-click: drop a pin. Also handles "place NPC on map" mode.
  let placing = null;
  map.on('contextmenu', e => {
    if (map.pm.globalDrawModeEnabled()) return;
    createAnnotation({ kind: 'marker', geo: { latlng: [round(e.latlng.lat), round(e.latlng.lng)] } });
  });
  map.on('click', e => {
    if (placing) {
      const p = placing; stopPlacing();
      if (p.poiId) {
        state.poiOverrides[p.poiId] = { x: round(e.latlng.lng), y: round(e.latlng.lat) };
        save();
        makePoiMarker(POIS.find(x => x.id === p.poiId));
        renderPlacesPanel();
        select('poi', p.poiId);
        return;
      }
      createAnnotation({ ...p, kind: 'marker', geo: { latlng: [round(e.latlng.lat), round(e.latlng.lng)] } });
      return;
    }
    if (selected && !map.pm.globalDrawModeEnabled()) closeDrawer();
  });
  map.on('mousemove', e => { $('#coords').textContent = `x ${Math.round(e.latlng.lng)} · y ${Math.round(e.latlng.lat)}`; });
  const viewHash = () => setHash(`map=${cur.id}&at=${Math.round(map.getCenter().lng)},${Math.round(map.getCenter().lat)},${map.getZoom()}`);
  map.on('moveend', () => { if (!selected && mapReady) viewHash(); });

  function startPlacing(partial, label) {
    placing = partial;
    document.body.classList.add('placing');
    const hint = $('#place-hint');
    hint.innerHTML = `Click the map to place <b>${esc(label)}</b><button type="button">Cancel</button>`;
    hint.hidden = false;
    $('button', hint).onclick = stopPlacing;
    document.body.classList.remove('sidebar-open');
  }
  function stopPlacing() {
    placing = null;
    document.body.classList.remove('placing');
    $('#place-hint').hidden = true;
  }

  // ---------- selection & drawer ----------
  let selected = null; // { type, id }
  const isSelected = (type, id) => selected && selected.type === type && selected.id === id;

  function markSelected() {
    $$('.leaflet-marker-icon.selected').forEach(n => n.classList.remove('selected'));
    for (const rec of state.annotations) {
      const l = annLayers[rec.id];
      if (l && l.setStyle) l.setStyle(styleFor(rec, isSelected('ann', rec.id)));
    }
    for (const [id, r] of Object.entries(bannerRects)) r._path?.classList.toggle('selected', isSelected('poi', id));
    if (!selected) return;
    const layer = { poi: poiMarkers, icon: iconMarkers, ann: annLayers }[selected.type][selected.id];
    if (layer && layer._icon) layer._icon.classList.add('selected');
    $$('#panel-places li, #panel-notes li').forEach(li => li.classList.toggle('active', li.dataset.key === `${selected.type}:${selected.id}`));
  }

  function select(type, id, opts = {}) {
    selected = { type, id };
    setHash(`${{ poi: 'poi', icon: 'icon', ann: 'note' }[type]}=${id}`);
    if (type === 'poi') renderPoiDrawer(POIS.find(p => p.id === id), opts);
    else if (type === 'icon') renderIconDrawer(iconRec(id));
    else renderAnnDrawer(state.annotations.find(a => a.id === id), opts);
    $('#drawer').hidden = false;
    $('#drawer').scrollTop = 0;
    markSelected();
    map.invalidateSize();
  }

  function closeDrawer() {
    selected = null;
    $('#drawer').hidden = true;
    markSelected();
    map.invalidateSize();
    setHash('');
  }

  function flyTo(type, id, { instant: inst = false } = {}) {
    let instant = inst;
    const ensure = key => { if (state.hidden[key]) { setLayerVisible(key, true); renderLayersPanel(); } };
    if (!map.getSize().x) instant = true; // map not laid out (hidden): can't animate a flight
    const to = (ll, z) => instant ? map.setView(ll, z, { animate: false }) : map.flyTo(ll, z, { duration: .6 });
    if (type === 'poi') {
      const p = POIS.find(x => x.id === id);
      ensure('poi:' + p.cat);
      if (placed(p)) to(poiPos(p), Math.max(instant ? 0 : map.getZoom(), 0.5));
      else if (instant) map.fitBounds(boundsOf(cur), { animate: false });
    } else if (type === 'icon') {
      const r = iconRec(id);
      if (r.deleted) { editIcon(id, { deleted: false }); renderIcon(id); }
      ensure('icon:' + iconGroupOf(r));
      to([r.y, r.x], Math.max(instant ? 0 : map.getZoom(), 0.75));
    } else {
      const rec = state.annotations.find(a => a.id === id);
      ensure('ann:' + catOf(rec));
      const layer = annLayers[id];
      if (layer.getBounds) {
        if (instant) map.fitBounds(layer.getBounds().pad(.4), { maxZoom: 1.5, animate: false });
        else map.flyToBounds(layer.getBounds().pad(.4), { maxZoom: 1.5, duration: .6 });
      } else to(layer.getLatLng(), Math.max(instant ? 0 : map.getZoom(), 0.5));
    }
  }

  function mapOfItem(type, id) {
    if (type === 'poi') return POIS.find(p => p.id === id)?.map;
    if (type === 'icon') return SEED_BY_ID[id]?.map;
    const a = state.annotations.find(x => x.id === id);
    return a ? annMap(a) : null;
  }

  // Select something anywhere in the atlas, switching maps if needed.
  function go(type, id, opts) {
    const m = mapOfItem(type, id);
    const switched = !!m && m !== cur.id;
    if (switched && !switchMap(m, { fit: false })) { toast('That map is no longer in the atlas.'); return; }
    select(type, id, opts);
    flyTo(type, id, { instant: switched });
  }

  function drawerHead(chipColor, chipText, title) {
    return `<div class="panel-head">
      <div style="flex:1;min-width:0"><span class="chip" style="color:${chipColor}">${esc(chipText)}</span><h2>${esc(title)}</h2></div>
      <button class="icon-btn" data-act="close" aria-label="Close">✕</button></div>`;
  }

  function renderPoiDrawer(poi, { npcQuery = '' } = {}) {
    const c = CATS[poi.cat];
    const npcs = npcsForPoi(poi);
    const quests = questsForNpcs(npcs, poi.map);
    const body = $('#drawer-body');
    const pos = poiPos(poi) || [NaN, NaN];
    const [x, y] = [pos[1], pos[0]];
    const dest = destOf(poi);
    const leads = poi.toPage || poi.toMap;
    body.innerHTML = `
      ${drawerHead(c.color, c.label, poi.name)}
      ${poi.desc ? `<p class="desc">${esc(poi.desc)}</p>` : ''}
      ${leads ? (dest
        ? `<button class="btn primary travel-btn" data-act="travel">Travel to ${esc(dest.name)} →</button>`
        : `<div class="travel-missing">No map for <b>${esc(String(poi.toPage).replace(/_/g, ' '))}</b> yet.
             <button class="btn small" data-act="add-map">＋ Add one</button></div>`) : ''}
      <div class="row">
        ${poi.wiki ? `<a class="btn small" href="${esc(W.wikiUrl(poi.wiki))}" target="_blank" rel="noopener">Wiki: ${esc(poi.wiki)} ↗</a>` : ''}
        <button class="btn small" data-act="pin-here">＋ Pin a note here</button>
        <button class="btn small" data-act="copy">Copy link</button>
      </div>
      <label class="field"><span>My notes for ${esc(poi.name)}</span>
        <textarea id="poi-note" placeholder="Camp spots, respawn timers, who to talk to… [[Wiki Page]] links work.">${esc(state.poiNotes[poi.id] || '')}</textarea>
      </label>
      <div id="poi-note-preview"></div>
      ${quests.length ? `<h3>Quests here (${quests.length})</h3><div id="poi-quests"></div>` : ''}
      ${poi.table || poi.npcFilter ? `<h3>NPCs (${npcs.length})</h3>
        <input type="text" id="npc-filter" placeholder="Filter NPCs, loot, level…" value="${esc(npcQuery)}">
        <div id="poi-npcs" style="margin-top:8px"></div>
        <p class="meta">From the ${esc(mapName(poi.map))} wiki page${poi.table ? `, table “NPCs – ${esc(poi.table)}”` : ''}${poi.npcFilter ? `, NPCs mentioning “${esc([].concat(poi.npcFilter).join('” or “'))}”` : ''}.</p>` : ''}
      ${placed(poi)
        ? `<p class="meta">Map position x ${Math.round(x)} · y ${Math.round(y)}${state.poiOverrides[poi.id] ? ' (moved by you)' : ''}</p>`
        : `<div class="travel-missing">Not placed on the map yet: the wiki lists it but the map position is unknown.
             <button class="btn small" data-act="place">📍 Place on map</button></div>`}`;

    const ta = $('#poi-note', body);
    const preview = () => {
      const v = ta.value;
      $('#poi-note-preview').innerHTML = /\[\[|https?:\/\//.test(v) ? `<div class="note-preview">${noteHtml(v)}</div>` : '';
    };
    preview();
    ta.addEventListener('input', debounce(() => {
      const v = ta.value;
      if (v.trim()) state.poiNotes[poi.id] = v; else delete state.poiNotes[poi.id];
      save(); preview(); refreshPoiIcon(poi.id); renderNotesPanel(); renderPlacesPanel();
    }, 300));

    if (quests.length) $('#poi-quests', body).append(questTable(quests, { compact: true }));
    if (poi.table || poi.npcFilter) {
      const host = $('#poi-npcs', body);
      const draw = () => {
        const q = $('#npc-filter', body).value.trim().toLowerCase();
        const rows = !q ? npcs : npcs.filter(n => [n.name, n.race, n.cls, n.level, n.location, W.plain(n.loot), W.plain(n.desc)].join(' ').toLowerCase().includes(q));
        host.replaceChildren(npcTable(rows));
      };
      $('#npc-filter', body).addEventListener('input', draw);
      draw();
    }

    body.onclick = e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') closeDrawer();
      if (act === 'copy') copyLink();
      if (act === 'travel') travel(dest.id);
      if (act === 'place') startPlacing({ poiId: poi.id }, poi.name);
      if (act === 'add-map') openAddMap({ name: String(poi.toPage).replace(/_/g, ' '), page: poi.toPage, linkFrom: cur.id });
      if (act === 'pin-here') {
        const [py, px] = poiPos(poi) || [cur.height / 2, cur.width / 2];
        createAnnotation({ kind: 'marker', geo: { latlng: [py - 30, px + 30] }, title: `Note: ${poi.name}` });
      }
    };
  }

  function renderIconDrawer(r) {
    const body = $('#drawer-body');
    const id = r.id;
    const t = ICON_TYPES[iconTypeOf(r)];
    const g = ICON_GROUPS[iconGroupOf(r)];
    const { poi, dist } = nearestPoi(r.x, r.y, r.map);
    const edited = !!state.iconEdits[id] && Object.keys(state.iconEdits[id]).length > 0;
    const lm = letterMeaning(r.letter);
    const level = t.colorable ? levelInfo(r.color || 'blue', r.map).label : '';
    body.innerHTML = `
      ${drawerHead(g.color, g.label, iconTitle(r))}
      <div class="icon-hero">${iconHtml(r.type, r.color, r.letter).replace('mi-wrap', 'mi-wrap mi-hero')}
        <div>
          <div><b>${esc(t.label)}</b>${level ? ` · ${esc(level)}` : ''}</div>
          ${t.desc ? `<div class="muted">${esc(t.desc)}</div>` : ''}
          ${lm ? `<div class="muted">Legend letter <b>${esc(r.letter)}</b>: ${esc(lm)}</div>` : ''}
          ${poi && dist < 140 ? `<div class="muted">Near <a href="#" data-act="poi">${esc(poi.name)}</a></div>` : ''}
        </div>
      </div>
      <label class="field"><span>Title</span><input type="text" id="i-title" value="${esc(r.title || '')}" placeholder="${esc(iconDefaultTitle(r))}"></label>
      <div class="row icon-pick">
        <label class="field" style="flex:1;margin:0"><span>Icon</span><select id="i-type">${iconTypeOptions(r.type)}</select></label>
        ${t.colorable ? `<label class="field" style="margin:0"><span>Level</span><select id="i-color">${levelOptions(r.color || 'blue', r.map)}</select></label>` : ''}
        ${r.type === 'humanoid' ? `<label class="field" style="width:70px;margin:0"><span>Letter</span><input type="text" id="i-letter" maxlength="5" value="${esc(r.letter || '')}"></label>` : ''}
      </div>
      <label class="field"><span>My notes</span>
        <textarea id="i-note" placeholder="Who's here, opening hours, what they sell… [[Wiki Page]] links work.">${esc(r.note || '')}</textarea>
      </label>
      <div id="i-preview"></div>
      <div class="row">
        <button class="btn small" data-act="zoom">Zoom to</button>
        <button class="btn small" data-act="copy">Copy link</button>
        ${edited ? '<button class="btn small" data-act="reset" title="Undo all your changes to this icon">Reset to original</button>' : ''}
        <button class="btn small danger" data-act="remove" style="margin-left:auto">Remove from map</button>
      </div>
      <div id="i-related"></div>
      <p class="meta">x ${Math.round(r.x)} · y ${Math.round(r.y)}${edited ? ' · edited by you' : ''} · drag it with “Edit places”.</p>`;

    const related = relatedNpcs(r);
    if (related.length) {
      const host = $('#i-related', body);
      host.innerHTML = `<h3>Possibly related wiki NPCs</h3>`;
      host.append(sortableTable([
        { label: 'Name', get: n => n.raw },
        { label: 'Lvl', get: n => n.level, sort: n => levelNum(n.level) },
        { label: 'Area', get: n => n.location && n.location !== '-' ? n.location : n.district.startsWith('Need to sort') ? 'unsorted' : n.district },
      ], related, {
        rowClass: n => isNamed(n) ? 'named' : '',
        onRow: n => { const p = poiForNpc(n); if (p) go('poi', p.id, { npcQuery: n.name }); else openUnsorted(n.name); },
      }));
    }

    const update = (patch, redraw) => {
      editIcon(id, patch);
      renderIcon(id);
      markSelected();
      renderNotesPanel();
      if (redraw) renderIconDrawer(iconRec(id));
    };
    const preview = () => {
      const v = iconRec(id).note || '';
      $('#i-preview').innerHTML = /\[\[|https?:\/\//.test(v) ? `<div class="note-preview">${noteHtml(v)}</div>` : '';
    };
    preview();
    $('#i-title', body).addEventListener('input', debounce(e => {
      update({ title: e.target.value.trim() });
      $('h2', body).textContent = iconTitle(iconRec(id));
    }, 250));
    $('#i-type', body).addEventListener('change', e => {
      const nt = e.target.value;
      update({ type: nt, color: ICON_TYPES[nt].colorable ? (iconRec(id).color || 'blue') : '' }, true);
      renderLayersPanel();
    });
    $('#i-color', body)?.addEventListener('change', e => { update({ color: e.target.value }, true); renderLayersPanel(); });
    $('#i-letter', body)?.addEventListener('input', debounce(e => { update({ letter: e.target.value.trim() }); $('h2', body).textContent = iconTitle(iconRec(id)); }, 250));
    $('#i-note', body).addEventListener('input', debounce(e => { update({ note: e.target.value }); preview(); }, 300));

    body.onclick = e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      e.preventDefault();
      if (act === 'close') closeDrawer();
      if (act === 'zoom') flyTo('icon', id);
      if (act === 'copy') copyLink();
      if (act === 'poi') go('poi', poi.id);
      if (act === 'remove') removeIcon(id);
      if (act === 'reset') {
        const before = state.iconEdits[id];
        delete state.iconEdits[id]; save(); renderIcon(id); renderIconDrawer(iconRec(id)); markSelected(); renderLayersPanel(); renderNotesPanel();
        toast('Icon reset to the original map.', { action: 'Undo', onAction: () => { state.iconEdits[id] = before; save(); renderIcon(id); select('icon', id); } });
      }
    };
  }

  function renderAnnDrawer(rec, { focusTitle = false } = {}) {
    const body = $('#drawer-body');
    const isMarker = rec.kind === 'marker';
    body.innerHTML = `
      ${drawerHead(colorOf(rec), `My ${{ marker: 'pin', polyline: 'route', polygon: 'area', circle: 'circle' }[rec.kind]}`, rec.title || 'Untitled')}
      <label class="field"><span>Title</span><input type="text" id="a-title" value="${esc(rec.title)}"></label>
      <div class="row" style="align-items:flex-end">
        <label class="field" style="flex:1;margin:0"><span>Category</span>
          <select id="a-cat">${Object.entries(NOTE_CATS).map(([k, v]) => `<option value="${k}" ${k === catOf(rec) ? 'selected' : ''}>${v.glyph}  ${v.label}</option>`).join('')}</select>
        </label>
        <label class="field" style="margin:0"><span>Colour</span><input type="color" id="a-color" value="${colorOf(rec)}"></label>
        <button class="btn small" id="a-color-reset" title="Use the category colour" ${rec.color ? '' : 'hidden'}>Reset</button>
      </div>
      ${isMarker
        ? `<div class="row" style="margin-top:8px">
            <label class="check"><input type="radio" name="a-display" value="pin" ${!rec.display || rec.display === 'pin' ? 'checked' : ''}> Pin</label>
            <label class="check"><input type="radio" name="a-display" value="icon" ${rec.display === 'icon' ? 'checked' : ''}> Map icon</label>
            <label class="check"><input type="radio" name="a-display" value="label" ${rec.display === 'label' ? 'checked' : ''}> Text label</label>
          </div>
          <label class="field"><span>Leads to map (makes this pin a way to travel)</span>
            <select id="a-link"><option value="">— nowhere —</option>${MAPS.filter(m => m.id !== annMap(rec)).map(m => `<option value="${m.id}" ${m.id === rec.link ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
          </label>
          ${destOf({ link: rec.link }) ? `<button class="btn primary travel-btn" data-act="travel">Travel to ${esc(mapName(rec.link))} →</button>` : ''}
          ${rec.display === 'icon' ? `<div class="row icon-pick">
            <label class="field" style="flex:1;margin:0"><span>Icon</span><select id="a-icontype">${iconTypeOptions(rec.iconType || 'skills')}</select></label>
            ${ICON_TYPES[rec.iconType]?.colorable ? `<label class="field" style="margin:0"><span>Level</span><select id="a-iconcolor">${levelOptions(rec.iconColor || 'blue', annMap(rec))}</select></label>` : ''}
            ${rec.iconType === 'humanoid' ? `<label class="field" style="width:70px;margin:0"><span>Letter</span><input type="text" id="a-iconletter" maxlength="5" value="${esc(rec.iconLetter || '')}"></label>` : ''}
          </div>` : ''}`
        : `<label class="check" style="margin-top:8px"><input type="checkbox" id="a-showlabel" ${rec.showLabel ? 'checked' : ''}> Show title on the map</label>
           ${rec.kind === 'polyline' ? `<label class="check"><input type="checkbox" id="a-dashed" ${rec.dashed ? 'checked' : ''}> Dashed line</label>` : ''}`}
      <label class="field"><span>Notes</span>
        <textarea id="a-note" placeholder="What's here? [[Wiki Page]] links and URLs work.">${esc(rec.note)}</textarea>
      </label>
      <div id="a-preview"></div>
      <label class="field"><span>Tags (comma separated)</span><input type="text" id="a-tags" value="${esc((rec.tags || []).join(', '))}" placeholder="e.g. lvl 12, group, night only"></label>
      <div class="row">
        <button class="btn small" data-act="zoom">Zoom to</button>
        <button class="btn small" data-act="copy">Copy link</button>
        <button class="btn small danger" data-act="delete" style="margin-left:auto">Delete</button>
      </div>
      <p class="meta" id="a-meta"></p>
      ${isMarker ? '' : '<p class="meta">Tip: use the edit (✎) or drag tools at the top-right of the map to reshape it.</p>'}`;
    renderMeta(rec);

    const rerender = () => { touch(rec); save(); renderAnn(rec); renderNotesPanel(); };
    const preview = () => {
      $('#a-preview').innerHTML = /\[\[|https?:\/\//.test(rec.note) ? `<div class="note-preview">${noteHtml(rec.note)}</div>` : '';
    };
    preview();
    const title = $('#a-title', body);
    title.addEventListener('input', debounce(() => {
      rec.title = title.value.trim();
      $('h2', body).textContent = rec.title || 'Untitled';
      rerender();
    }, 250));
    $('#a-cat', body).addEventListener('change', e => { rec.cat = e.target.value; rerender(); renderLayersPanel(); renderAnnDrawer(rec); });
    $('#a-color', body).addEventListener('input', debounce(e => { rec.color = e.target.value; $('#a-color-reset').hidden = false; rerender(); }, 120));
    $('#a-color-reset', body).addEventListener('click', () => { rec.color = ''; rerender(); renderAnnDrawer(rec); });
    $$('input[name=a-display]', body).forEach(r => r.addEventListener('change', e => { rec.display = e.target.value; rerender(); renderAnnDrawer(rec); }));
    $('#a-link', body)?.addEventListener('change', e => { rec.link = e.target.value; rerender(); renderAnnDrawer(rec); renderPlacesPanel(); });
    $('#a-icontype', body)?.addEventListener('change', e => { rec.iconType = e.target.value; rerender(); renderAnnDrawer(rec); });
    $('#a-iconcolor', body)?.addEventListener('change', e => { rec.iconColor = e.target.value; rerender(); });
    $('#a-iconletter', body)?.addEventListener('input', debounce(e => { rec.iconLetter = e.target.value.trim(); rerender(); }, 250));
    $('#a-showlabel', body)?.addEventListener('change', e => { rec.showLabel = e.target.checked; rerender(); });
    $('#a-dashed', body)?.addEventListener('change', e => { rec.dashed = e.target.checked; rerender(); });
    $('#a-note', body).addEventListener('input', debounce(e => { rec.note = e.target.value; touch(rec); save(); preview(); renderNotesPanel(); }, 300));
    $('#a-tags', body).addEventListener('input', debounce(e => {
      rec.tags = e.target.value.split(',').map(s => s.trim()).filter(Boolean); touch(rec); save(); renderNotesPanel();
    }, 300));

    body.onclick = e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') closeDrawer();
      if (act === 'zoom') flyTo('ann', rec.id);
      if (act === 'travel') travel(rec.link);
      if (act === 'copy') copyLink();
      if (act === 'delete') deleteAnnotation(rec.id);
    };
    if (focusTitle) setTimeout(() => { title.focus(); title.select(); }, 50);
  }

  function renderMeta(rec) {
    const m = $('#a-meta');
    if (!m) return;
    const [cy, cx] = centerOf(rec);
    const fmt = d => new Date(d).toLocaleString();
    m.textContent = `x ${Math.round(cx)} · y ${Math.round(cy)} · created ${fmt(rec.created)} · edited ${fmt(rec.updated)}`;
  }

  // ---------- tables ----------
  function sortableTable(columns, rows, { rowClass, onRow } = {}) {
    const wrap = el('<div class="table-wrap"><table class="data"><thead><tr></tr></thead><tbody></tbody></table></div>');
    const tr = $('thead tr', wrap), tbody = $('tbody', wrap);
    let sortIdx = -1, asc = true;
    columns.forEach((c, i) => {
      const th = el(`<th>${esc(c.label)}</th>`);
      th.onclick = () => { asc = sortIdx === i ? !asc : true; sortIdx = i; draw(); };
      tr.append(th);
    });
    function draw() {
      const list = [...rows];
      if (sortIdx >= 0) {
        const key = columns[sortIdx].sort || (r => W.plain(columns[sortIdx].get(r)).toLowerCase());
        list.sort((a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1); });
      }
      $$('th', tr).forEach((th, i) => { th.classList.toggle('sorted', i === sortIdx); th.classList.toggle('asc', i === sortIdx && asc); });
      tbody.replaceChildren(...list.map(r => {
        const row = document.createElement('tr');
        if (rowClass) row.className = rowClass(r) || '';
        row.innerHTML = columns.map(c => `<td>${c.html ? c.html(r) : wikiHtml(c.get(r))}</td>`).join('');
        if (onRow) { row.classList.add('clickable'); row.onclick = e => { if (!e.target.closest('a,button')) onRow(r); }; }
        return row;
      }));
      if (!list.length) tbody.innerHTML = `<tr><td colspan="${columns.length}" class="muted">Nothing matches.</td></tr>`;
    }
    draw();
    return wrap;
  }

  const isNamed = n => /named/i.test(n.desc + ' ' + n.loot);

  function npcTable(rows) {
    return sortableTable([
      { label: 'Name', get: n => n.raw },
      { label: 'Lvl', get: n => n.level, sort: n => levelNum(n.level) },
      { label: 'Race / class', get: n => [n.race, n.cls].filter(v => v && v !== '-').join(' · ') || '-' },
      { label: 'Where', get: n => n.location },
      { label: 'Loot / notes', html: n => [n.loot, n.desc].filter(v => v && v.trim() !== '-' && v.trim() !== 'Unknown').map(v => wikiHtml(v)).join('<br>') || '<span class="muted">–</span>' },
    ], rows, { rowClass: n => isNamed(n) ? 'named' : '' });
  }

  function questTable(rows, { compact = false } = {}) {
    const cols = [
      { label: 'Quest', get: q => q.name },
      { label: 'Lvl', get: q => q.level, sort: q => levelNum(q.level) },
      { label: 'Classes', get: q => q.classes },
      { label: 'Reward', get: q => q.reward },
    ];
    if (!compact) cols.splice(1, 0, { label: 'Giver', get: q => q.giver });
    return sortableTable(cols, rows, {
      onRow: compact ? null : q => {
        const { poi, npc } = poiForName(q.giverNames[0], q.map || cur.id);
        if (poi) go('poi', poi.id, { npcQuery: npc ? npc.name : '' });
        else toast(`${W.plain(q.giver)} isn't placed on the map yet.`);
      },
    });
  }

  // ---------- sidebar panels ----------
  function renderPlacesPanel() {
    const host = $('#panel-places');
    const here = POIS.filter(p => p.map === cur.id);
    const links = state.annotations.filter(a => annMap(a) === cur.id && a.kind === 'marker' && destOf({ link: a.link }));
    host.innerHTML = Object.entries(CATS).map(([k, c]) => {
      const items = here.filter(p => p.cat === k).sort((a, b) => a.name.localeCompare(b.name));
      const extra = k === 'travel' ? links : [];
      if (!items.length && !extra.length) return '';
      return `<div class="group-title">${esc(c.label)}</div><ul class="list">${items.map(p => {
        const n = npcsForPoi(p).length;
        const note = state.poiNotes[p.id] ? ' · ✎ note' : '';
        const d = destOf(p);
        const sub = (d ? `→ ${esc(d.name)}` : p.toPage ? 'no map yet' : n ? `${n} NPCs` : esc(p.desc ? p.desc.split('.')[0] : '')) + (placed(p) ? '' : ' · not placed');
        return `<li data-key="poi:${p.id}"><span class="dot" style="color:${c.color}">${c.glyph}</span>
          <span class="name">${esc(p.name)}<small>${sub}${note}</small></span>${d ? `<button class="btn small go-btn" data-travel="${d.id}" title="Travel to ${esc(d.name)}">Go →</button>` : ''}</li>`;
      }).join('')}${extra.map(a => `<li data-key="ann:${a.id}"><span class="dot" style="color:${colorOf(a)}">➜</span>
          <span class="name">${esc(a.title || 'Untitled')}<small>your pin → ${esc(mapName(a.link))}</small></span><button class="btn small go-btn" data-travel="${a.link}">Go →</button></li>`).join('')}</ul>`;
    }).join('') || `<div class="empty">No places on ${esc(cur.name)} yet.<br>Right-click the map to drop a pin. Set “Leads to map” on a pin to link it to another map.</div>`;
    host.onclick = e => {
      const tb = e.target.closest('[data-travel]');
      if (tb) { travel(tb.dataset.travel); document.body.classList.remove('sidebar-open'); return; }
      const li = e.target.closest('li[data-key]');
      if (!li) return;
      const [type, id] = li.dataset.key.split(':');
      go(type, id);
      document.body.classList.remove('sidebar-open');
    };
    markSelected();
  }

  let notesFilter = { q: '', cat: '' };
  function renderNotesPanel() {
    const host = $('#panel-notes');
    const iconNotes = Object.keys(state.iconEdits).map(iconRec).filter(r => r && (r.note || '').trim());
    const total = state.annotations.length + Object.keys(state.poiNotes).length + iconNotes.length;
    $('#notes-count').textContent = total;
    const keepFocus = document.activeElement?.id === 'notes-q';
    const q = notesFilter.q.toLowerCase();
    const anns = state.annotations
      .filter(a => MAP_BY_ID[annMap(a)] && (!notesFilter.cat || catOf(a) === notesFilter.cat))
      .filter(a => !q || [a.title, a.note, ...(a.tags || [])].join(' ').toLowerCase().includes(q))
      .sort((a, b) => b.updated.localeCompare(a.updated));
    const placeNotes = Object.entries(state.poiNotes)
      .map(([id, text]) => ({ poi: POIS.find(p => p.id === id), text }))
      .filter(x => x.poi && (!q || (x.poi.name + ' ' + x.text).toLowerCase().includes(q)) && !notesFilter.cat);
    const iconList = iconNotes.filter(r => !notesFilter.cat && (!q || (iconTitle(r) + ' ' + r.note).toLowerCase().includes(q)));

    host.innerHTML = `
      <div class="row" style="margin-bottom:8px">
        <input type="text" id="notes-q" placeholder="Filter my notes…" value="${esc(notesFilter.q)}" style="flex:1">
        <select id="notes-cat" style="width:auto"><option value="">All</option>${Object.entries(NOTE_CATS).map(([k, v]) => `<option value="${k}" ${k === notesFilter.cat ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      </div>
      ${!total ? `<div class="empty">No notes yet.<br>Right-click the map to drop a pin, use the drawing tools at the top-right, or write a note on any place or map icon.</div>` : ''}
      ${anns.length ? `<div class="group-title">Pins & drawings</div><ul class="list">${anns.map(a => {
        const c = NOTE_CATS[catOf(a)];
        const sub = [annMap(a) !== cur.id ? mapName(annMap(a)) : '', a.kind === 'marker' ? '' : a.kind, ...(a.tags || []), a.note.split('\n')[0]].filter(Boolean).join(' · ');
        return `<li data-key="ann:${a.id}"><span class="dot" style="color:${colorOf(a)}">${c.glyph}</span>
          <span class="name">${esc(a.title || 'Untitled')}<small>${esc(sub)}</small></span></li>`;
      }).join('')}</ul>` : ''}
      ${placeNotes.length ? `<div class="group-title">Notes on places</div><ul class="list">${placeNotes.map(({ poi, text }) =>
        `<li data-key="poi:${poi.id}"><span class="dot" style="color:${CATS[poi.cat].color}">${CATS[poi.cat].glyph}</span>
          <span class="name">${esc(poi.name)}<small>${poi.map !== cur.id ? esc(mapName(poi.map)) + ' · ' : ''}${esc(text.split('\n')[0])}</small></span></li>`).join('')}</ul>` : ''}
      ${iconList.length ? `<div class="group-title">Notes on map icons</div><ul class="list">${iconList.map(r =>
        `<li data-key="icon:${r.id}"><span class="dot dot-icon">${iconHtml(r.type, r.color, r.letter)}</span>
          <span class="name">${esc(iconTitle(r))}<small>${r.map !== cur.id ? esc(mapName(r.map)) + ' · ' : ''}${esc(r.note.split('\n')[0])}</small></span></li>`).join('')}</ul>` : ''}`;

    const qi = $('#notes-q', host);
    qi.addEventListener('input', debounce(() => { notesFilter.q = qi.value; renderNotesPanel(); }, 150));
    if (keepFocus) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
    $('#notes-cat', host).addEventListener('change', e => { notesFilter.cat = e.target.value; renderNotesPanel(); });
    host.onclick = e => {
      const li = e.target.closest('li[data-key]');
      if (!li) return;
      const [type, id] = li.dataset.key.split(':');
      go(type, id);
      document.body.classList.remove('sidebar-open');
    };
    markSelected();
  }

  function renderZonePanel() {
    const w = wikiOf(cur.id), d = w.data, ib = d.infobox;
    const host = $('#panel-zone');
    const exits = POIS.filter(p => p.map === cur.id && (p.toPage || p.toMap));
    const pinLinks = state.annotations.filter(a => annMap(a) === cur.id && a.kind === 'marker' && destOf({ link: a.link }));
    const exitsHtml = exits.length || pinLinks.length ? `<h3>Exits</h3><ul class="list">${exits.map(p => {
      const dest = destOf(p);
      return `<li data-key="poi:${p.id}"><span class="dot" style="color:${CATS.travel.color}">${CATS.travel.glyph}</span>
        <span class="name">${esc(String(p.toPage || dest?.name || '').replace(/_/g, ' '))}<small>${dest ? 'map available' : 'no map yet'}</small></span>
        ${dest ? `<button class="btn small go-btn" data-travel="${dest.id}">Go →</button>` : `<button class="btn small go-btn" data-addmap="${esc(p.toPage)}">＋ Add</button>`}</li>`;
    }).join('')}${pinLinks.map(a => `<li data-key="ann:${a.id}"><span class="dot" style="color:${colorOf(a)}">➜</span>
        <span class="name">${esc(mapName(a.link))}<small>your pin “${esc(a.title)}”</small></span><button class="btn small go-btn" data-travel="${a.link}">Go →</button></li>`).join('')}</ul>` : '';
    const exitClicks = e => {
      const tb = e.target.closest('[data-travel]');
      if (tb) { travel(tb.dataset.travel); return true; }
      const ab = e.target.closest('[data-addmap]');
      if (ab) { openAddMap({ name: ab.dataset.addmap.replace(/_/g, ' '), page: ab.dataset.addmap, linkFrom: cur.id }); return true; }
      const li = e.target.closest('li[data-key]');
      if (li && !e.target.closest('button')) { const [type, id] = li.dataset.key.split(':'); go(type, id); return true; }
      return false;
    };
    if (w.meta.missing) {
      host.innerHTML = `<h2>${esc(cur.name)}</h2>
        <p class="desc">${cur.page ? `No wiki data for <b>${esc(cur.page.replace(/_/g, ' '))}</b> yet.` : 'This map isn\'t linked to a wiki page.'}</p>
        ${cur.page ? '<button class="btn primary" data-act="sync">⟳ Fetch from the wiki</button>' : ''}
        ${exitsHtml}`;
      host.onclick = e => { if (e.target.closest('[data-act=sync]')) syncWiki(cur); else exitClicks(e); };
      return;
    }
    const travel = d.travel.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const depth = (l.match(/^\*+/) || [''])[0].length;
      return `<li style="margin-left:${Math.max(0, depth - 1) * 14}px;${depth ? '' : 'list-style:none;margin-top:6px'}">${wikiHtml(l.replace(/^\*+/, ''))}</li>`;
    }).join('');
    const unsorted = d.npcs.filter(n => !poiForNpc(n));
    host.innerHTML = `
      <h2>${esc(cur.name)}</h2>
      ${d.intro.map(p => `<p class="desc">${wikiHtml(p)}</p>`).join('')}
      <dl class="kv">
        <dt>Level</dt><dd>${wikiHtml(ib.Level)}</dd>
        <dt>Monsters</dt><dd>${wikiHtml(ib.MonsterTypes)}</dd>
        <dt>Notable NPCs</dt><dd>${wikiHtml(ib.NotableNPC)}</dd>
        <dt>Items</dt><dd>${wikiHtml(ib.Items)}</dd>
        <dt>Adjacent</dt><dd>${wikiHtml(ib.AdjacentZones)}</dd>
      </dl>
      ${exitsHtml}
      ${travel ? `<h3>Travel (wiki)</h3><ul style="padding-left:18px;margin:0">${travel}</ul>` : ''}
      <h3>Quests (${d.quests.length})</h3><p class="meta" style="margin-top:0">Click a row to jump to the quest giver.</p><div id="zone-quests"></div>
      <h3>Items (${d.items.length})</h3><div id="zone-items"></div>
      <h3>Not yet on the map (${unsorted.length})</h3>
      <p class="meta" style="margin-top:0">The wiki hasn't sorted these NPCs into an area. Found one? Pin it.</p>
      <input type="text" id="unsorted-q" placeholder="Filter…"><div id="zone-unsorted" style="margin-top:8px"></div>
      <p class="meta"><a href="${esc(W.wikiUrl(cur.page))}" target="_blank" rel="noopener">Open the ${esc(cur.name)} wiki page ↗</a></p>`;

    $('#zone-quests', host).append(questTable(d.quests));
    $('#zone-items', host).append(sortableTable([
      { label: 'Item', get: i => i.name },
      { label: 'Drops from', get: i => i.dropsFrom },
      { label: 'Slot', get: i => i.slot },
    ], d.items, {
      onRow: i => {
        const { poi, npc } = poiForName(W.links(i.dropsFrom)[0] || i.dropsFrom, cur.id);
        if (poi) go('poi', poi.id, { npcQuery: npc.name }); else toast(`${W.plain(i.dropsFrom)} isn't placed on the map yet.`);
      },
    }));
    const drawUnsorted = () => {
      const q = $('#unsorted-q', host).value.trim().toLowerCase();
      const rows = unsorted.filter(n => !q || (n.name + ' ' + n.level + ' ' + n.race).toLowerCase().includes(q));
      $('#zone-unsorted', host).replaceChildren(sortableTable([
        { label: 'Name', get: n => n.raw },
        { label: 'Lvl', get: n => n.level, sort: n => levelNum(n.level) },
        { label: '', html: n => `<button class="btn small" data-pin="${esc(n.name)}">Pin</button>` },
      ], rows));
    };
    $('#unsorted-q', host).addEventListener('input', drawUnsorted);
    drawUnsorted();
    host.onclick = e => {
      const b = e.target.closest('[data-pin]');
      if (!b) { exitClicks(e); return; }
      const n = unsorted.find(x => x.name === b.dataset.pin);
      const bits = [n.race, n.cls, n.level !== '-' ? 'lvl ' + n.level : ''].filter(v => v && v !== '-').join(', ');
      startPlacing({ title: n.name, note: `[[${n.name}]]${bits ? ' – ' + bits : ''}`, cat: 'note', tags: ['npc'] }, n.name);
    };
  }

  const removedIcons = () => SEED_ICONS.filter(i => i.map === cur.id).map(i => iconRec(i.id)).filter(r => r.deleted);

  function renderLayersPanel() {
    const host = $('#panel-layers');
    const row = (key, c, n) => `<label class="layer-row"><input type="checkbox" data-layer="${key}" ${state.hidden[key] ? '' : 'checked'}>
      <span class="swatch" style="background:${c.color}"></span><span class="lbl">${esc(c.label)}</span><span class="n">${n}</span></label>`;
    const imgOpts = [...cur.images.map(i => [i.id, i.name]), ['custom-url', 'Custom image URL…'], ['custom-file', 'Image file from this computer…']];
    const imageId = imageIdOf(cur);
    const myIcons = SEED_ICONS.filter(i => i.map === cur.id).map(i => iconRec(i.id));
    host.innerHTML = `
      <h3 style="margin-top:0">${esc(cur.name)} map image</h3>
      <select id="img-select">${imgOpts.map(([id, n]) => `<option value="${id}" ${id === imageId ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <div id="img-custom" style="margin-top:8px"></div>
      <label class="field"><span>Map opacity</span><input type="range" id="img-opacity" min="0.2" max="1" step="0.05" value="${state.imageOpacity}"></label>
      ${myIcons.length && cur.images.find(i => i.id === imageId && !i.clean) ? '<p class="meta">This image still has the icons painted in, so they show twice. Turn off the Map icons layers below, or pick a clean map.</p>' : ''}
      <h3>Map icons <button class="btn small" data-all="icon" style="float:right">All / none</button></h3>
      ${Object.entries(ICON_GROUPS).map(([k, c]) => [k, c, myIcons.filter(r => !r.deleted && iconGroupOf(r) === k).length])
        .filter(([k, , n]) => k !== 'custom' || n).map(([k, c, n]) => row('icon:' + k, c, n)).join('')}
      ${removedIcons().length ? `<button class="btn small" id="restore-icons" style="margin-top:6px">Restore removed icons (${removedIcons().length})</button>` : ''}
      <h3>Places <button class="btn small" data-all="poi" style="float:right">All / none</button></h3>
      ${Object.entries(CATS).map(([k, c]) => row('poi:' + k, c, POIS.filter(p => p.map === cur.id && p.cat === k).length)).join('')}
      <h3>My notes <button class="btn small" data-all="ann" style="float:right">All / none</button></h3>
      ${Object.entries(NOTE_CATS).map(([k, c]) => row('ann:' + k, c, state.annotations.filter(a => annMap(a) === cur.id && catOf(a) === k).length)).join('')}
      <p class="meta">Layer switches apply to every map.</p>
      <h3>Housekeeping</h3>
      <div class="row">
        <button class="btn small" id="reset-places" ${Object.keys(state.poiOverrides).length ? '' : 'disabled'}>Reset moved places (${Object.keys(state.poiOverrides).length})</button>
        <button class="btn small" id="reset-icons" ${Object.keys(state.iconEdits).length ? '' : 'disabled'}>Reset all map icons (${Object.keys(state.iconEdits).length})</button>
        <button class="btn small danger" id="clear-notes">Delete all my notes…</button>
        ${cur.custom ? `<button class="btn small danger" id="remove-map">Remove the ${esc(cur.name)} map…</button>` : ''}
      </div>`;

    const custom = $('#img-custom', host);
    if (imageId === 'custom-url') {
      custom.innerHTML = `<input type="text" id="img-url" placeholder="https://…/map.jpg" value="${esc(state.customUrls[cur.id] || '')}"><p class="meta">The image is stretched over the same area as the default map, so use one with a similar shape.</p>`;
      $('#img-url', custom).addEventListener('change', e => { state.customUrls[cur.id] = e.target.value.trim(); save(); applyImage(); });
    } else if (imageId === 'custom-file') {
      custom.innerHTML = `<button class="btn small" id="img-file-btn">Choose image…</button><input type="file" id="img-file" accept="image/*" hidden><p class="meta">Saved in this browser only. Stretched over the same area as the default map.</p>`;
      $('#img-file-btn', custom).onclick = () => $('#img-file', custom).click();
      $('#img-file', custom).addEventListener('change', async e => {
        const f = e.target.files[0];
        if (!f) return;
        const key = fileKey(cur.id);
        try { await idb.set(key, f); } catch { toast('Could not store the image; it will only last this session.'); }
        if (objectUrls[key]) URL.revokeObjectURL(objectUrls[key]);
        objectUrls[key] = URL.createObjectURL(f);
        applyImage();
      });
    }
    $('#img-select', host).addEventListener('change', e => { state.images[cur.id] = e.target.value; save(); applyImage(); renderLayersPanel(); });
    $('#img-opacity', host).addEventListener('input', e => { state.imageOpacity = +e.target.value; imageLayer.setOpacity(state.imageOpacity); save(); });
    $$('input[data-layer]', host).forEach(cb => cb.addEventListener('change', () => setLayerVisible(cb.dataset.layer, cb.checked)));
    $$('[data-all]', host).forEach(b => b.addEventListener('click', e => {
      e.preventDefault();
      const prefix = b.dataset.all;
      const keys = Object.keys({ poi: CATS, ann: NOTE_CATS, icon: ICON_GROUPS }[prefix]).map(k => prefix + ':' + k);
      const show = keys.some(k => state.hidden[k]);
      keys.forEach(k => setLayerVisible(k, show));
      renderLayersPanel();
    }));
    $('#reset-places', host).onclick = () => {
      state.poiOverrides = {};
      syncPoiMarkers();
      save(); renderLayersPanel(); toast('Place markers reset to their default positions.');
    };
    $('#restore-icons', host)?.addEventListener('click', () => {
      removedIcons().forEach(r => { editIcon(r.id, { deleted: false }); renderIcon(r.id); });
      renderLayersPanel(); toast('Removed icons are back on the map.');
    });
    $('#reset-icons', host).onclick = () => {
      if (!confirm('Undo every change to the map icons (positions, titles, types, notes and removals)?')) return;
      const ids = Object.keys(state.iconEdits);
      state.iconEdits = {};
      ids.forEach(renderIcon);
      if (selected?.type === 'icon') closeDrawer();
      save(); renderLayersPanel(); renderNotesPanel(); toast('Map icons reset to the original map.');
    };
    $('#clear-notes', host).onclick = () => {
      if (!confirm(`Delete all ${state.annotations.length} pins/drawings and ${Object.keys(state.poiNotes).length} place notes? Export first if you want a backup.`)) return;
      state.annotations.forEach(a => annLayers[a.id]?.remove());
      state.annotations = []; state.poiNotes = {};
      Object.values(sets).forEach(st => Object.values(st.ann).forEach(g => g.clearLayers()));
      POIS.forEach(p => refreshPoiIcon(p.id));
      closeDrawer(); save(); renderAll();
    };
    $('#remove-map', host)?.addEventListener('click', () => {
      const id = cur.id;
      const pins = state.annotations.filter(a => annMap(a) === id);
      if (!confirm(`Remove the ${cur.name} map from the atlas?${pins.length ? ` Its ${pins.length} pin(s)/drawing(s) are deleted too.` : ''}`)) return;
      pins.forEach(a => { const l = annLayers[a.id]; if (l) { l.remove(); l._grp?.removeLayer(l); delete annLayers[a.id]; } });
      state.annotations = state.annotations.filter(a => annMap(a) !== id);
      state.annotations.forEach(a => { if (a.link === id) { a.link = ''; renderAnn(a); } });
      state.customMaps = state.customMaps.filter(c => c.id !== id);
      showMapLayers(id, false);
      refreshMaps();
      mapReady = false;
      cur = MAPS[0];
      switchMap(cur.id);
      toast('Map removed.');
    });
  }

  function setLayerVisible(key, visible) {
    const [kind, k] = key.split(':');
    const group = setOf(cur.id)[kind][k];
    state.hidden[key] = !visible;
    visible ? group.addTo(map) : group.remove();
    save();
  }

  function renderWikiStatus() {
    const w = wikiOf(cur.id), m = w.meta;
    $('#wiki-status').innerHTML = m.missing
      ? `${esc(cur.name)}: no wiki data${cur.page ? ' yet – use Sync wiki' : ''}`
      : `${esc(cur.name)} wiki: ${m.synced ? 'synced' : 'built-in snapshot'} ${esc(m.fetched || '')} · ${w.data.npcs.length} NPCs · ${w.data.quests.length} quests`;
  }

  function rebuildWikiViews() {
    renderPlacesPanel(); renderZonePanel(); renderWikiStatus();
    if (selected?.type === 'poi') select('poi', selected.id);
  }

  function renderAll() {
    renderPlacesPanel(); renderNotesPanel(); renderZonePanel(); renderLayersPanel(); renderWikiStatus();
  }

  // Tabs
  $$('.tabs button').forEach(b => b.addEventListener('click', () => {
    $$('.tabs button').forEach(x => x.classList.toggle('active', x === b));
    $$('.tab-panel').forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
  }));

  // ---------- search ----------
  const searchInput = $('#search');
  const resultsBox = $('#search-results');
  let results = [], activeIdx = 0;

  function searchAll(q) {
    q = q.trim().toLowerCase();
    if (q.length < 2) return [];
    const hit = s => String(s || '').toLowerCase().includes(q);
    const out = [];
    const where = id => id !== cur.id ? ' · ' + mapName(id) : '';
    for (const m of MAPS) if (hit(m.name)) out.push({ group: 'Maps', label: m.name, sub: m.id === cur.id ? 'current map' : 'switch map', run: () => switchMap(m.id) });
    for (const p of POIS) if (hit(p.name) || hit(p.desc)) out.push({ group: 'Places', label: p.name, sub: CATS[p.cat].label + where(p.map), run: () => go('poi', p.id) });
    for (const a of state.annotations) if (MAP_BY_ID[annMap(a)] && (hit(a.title) || hit(a.note) || (a.tags || []).some(hit))) out.push({ group: 'My notes', label: a.title || 'Untitled', sub: NOTE_CATS[catOf(a)].label + where(annMap(a)), run: () => go('ann', a.id) });
    for (const [id, text] of Object.entries(state.poiNotes)) {
      const p = POIS.find(x => x.id === id);
      if (p && hit(text)) out.push({ group: 'My notes', label: p.name, sub: 'place note', run: () => go('poi', p.id) });
    }
    for (const i of SEED_ICONS) {
      const r = iconRec(i.id);
      if (r.deleted) continue;
      if (!(hit(iconTitle(r)) || hit(ICON_TYPES[iconTypeOf(r)].label) || hit(r.note) || hit(letterMeaning(r.letter)))) continue;
      const { poi, dist } = nearestPoi(r.x, r.y, r.map);
      out.push({ group: 'Map icons', label: iconTitle(r), sub: (poi && dist < 140 ? 'near ' + poi.name : 'map icon') + where(r.map), run: () => go('icon', r.id) });
    }
    const seen = new Set();
    for (const m of MAPS) {
      const wd = wikiOf(m.id).data;
      for (const n of wd.npcs) {
        if (!(hit(n.name) || hit(W.plain(n.loot)))) continue;
        const key = m.id + '|' + n.name + '|' + n.district;
        if (seen.has(key)) continue;
        seen.add(key);
        const p = poiForNpc(n);
        const lootHit = !hit(n.name);
        out.push({
          group: 'NPCs', label: n.name,
          sub: (lootHit ? 'drops ' + W.plain(n.loot) + ' · ' : '') + (p ? p.name : 'not on map') + (levelNum(n.level) >= 0 ? ' · lvl ' + n.level : '') + where(m.id),
          run: () => p ? go('poi', p.id, { npcQuery: n.name }) : openUnsorted(n.name, m.id),
        });
      }
      for (const qu of wd.quests) {
        if (!(hit(W.plain(qu.name)) || hit(W.plain(qu.reward)))) continue;
        out.push({
          group: 'Quests', label: W.plain(qu.name), sub: 'from ' + W.plain(qu.giver) + where(m.id),
          run: () => { const { poi, npc } = poiForName(qu.giverNames[0], m.id); poi ? go('poi', poi.id, { npcQuery: npc.name }) : toast(`${W.plain(qu.giver)} isn't placed on the map yet.`); },
        });
      }
      for (const it of wd.items) {
        if (!hit(W.plain(it.name))) continue;
        out.push({
          group: 'Items', label: W.plain(it.name), sub: 'from ' + W.plain(it.dropsFrom) + where(m.id),
          run: () => { const { poi, npc } = poiForName(W.links(it.dropsFrom)[0] || it.dropsFrom, m.id); poi ? go('poi', poi.id, { npcQuery: npc.name }) : toast('Not placed on the map yet.'); },
        });
      }
    }
    const order = ['Maps', 'Places', 'Map icons', 'My notes', 'NPCs', 'Quests', 'Items'];
    const grouped = order.flatMap(g => out.filter(r => r.group === g).slice(0, g === 'NPCs' ? 12 : 8));
    return grouped;
  }

  function openUnsorted(name, mapId = cur.id) {
    if (mapId !== cur.id) switchMap(mapId);
    $('.tabs button[data-tab=zone]').click();
    document.body.classList.add('sidebar-open');
    const i = $('#unsorted-q');
    i.value = name; i.dispatchEvent(new Event('input'));
    i.scrollIntoView({ block: 'center' });
    toast(`${name} isn't placed on the map yet. Use “Pin” to place it.`);
  }

  function drawResults() {
    if (!searchInput.value.trim()) { resultsBox.hidden = true; return; }
    resultsBox.hidden = false;
    if (!results.length) { resultsBox.innerHTML = '<div class="sr-empty">No matches.</div>'; return; }
    let html = '', last = '';
    results.forEach((r, i) => {
      if (r.group !== last) { html += `<div class="sr-group">${r.group}</div>`; last = r.group; }
      html += `<div class="sr-item ${i === activeIdx ? 'active' : ''}" data-i="${i}"><span>${esc(r.label)}</span><span class="sub">${esc(r.sub)}</span></div>`;
    });
    resultsBox.innerHTML = html;
    $('.sr-item.active', resultsBox)?.scrollIntoView({ block: 'nearest' });
  }
  function runResult(i) {
    const r = results[i];
    if (!r) return;
    resultsBox.hidden = true;
    searchInput.blur();
    r.run();
  }
  searchInput.addEventListener('input', debounce(() => { results = searchAll(searchInput.value); activeIdx = 0; drawResults(); }, 120));
  searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) drawResults(); });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { activeIdx = Math.min(results.length - 1, activeIdx + 1); drawResults(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { activeIdx = Math.max(0, activeIdx - 1); drawResults(); e.preventDefault(); }
    else if (e.key === 'Enter') { runResult(activeIdx); }
    else if (e.key === 'Escape') { resultsBox.hidden = true; searchInput.blur(); }
  });
  resultsBox.addEventListener('mousedown', e => { const it = e.target.closest('.sr-item'); if (it) { e.preventDefault(); runResult(+it.dataset.i); } });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) resultsBox.hidden = true; });
  document.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); searchInput.focus(); searchInput.select(); }
    if (e.key === 'Escape' && !typing) { if (placing) stopPlacing(); else if (selected) closeDrawer(); }
  });

  // ---------- import / export ----------
  function exportJson() {
    const data = {
      app: 'night-harbor-atlas', version: 3, exported: new Date().toISOString(),
      annotations: state.annotations, poiNotes: state.poiNotes, poiOverrides: state.poiOverrides, iconEdits: state.iconEdits,
      customMaps: state.customMaps, customIcons: state.customIcons,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `night-harbor-notes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importJson(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { toast('That file isn’t valid JSON.'); return; }
    if (!data || !Array.isArray(data.annotations)) { toast('That doesn’t look like a Night Harbor Atlas export.'); return; }
    const replace = state.annotations.length || Object.keys(state.poiNotes).length
      ? confirm('Replace your current notes with the imported ones?\n\nOK = replace · Cancel = merge (keeps both, imported wins on conflicts)')
      : true;
    if (replace) {
      state.annotations.forEach(a => annLayers[a.id]?.remove());
      Object.values(sets).forEach(st => Object.values(st.ann).forEach(g => g.clearLayers()));
      state.annotations = []; state.poiNotes = {}; state.poiOverrides = {}; state.iconEdits = {};
    }
    const known = new Set(state.customMaps.map(c => c.id));
    for (const c of data.customMaps || []) if (c && c.id && !known.has(c.id)) state.customMaps.push(c);
    refreshMaps();
    MAPS.forEach(m => { if (!wikis[m.id]) loadWiki(m); });
    renderMapPicker();
    const knownIcons = new Set(state.customIcons.map(c => c.id));
    for (const c of data.customIcons || []) if (c && c.id && c.name && !knownIcons.has(c.id)) state.customIcons.push(c);
    registerCustomIcons();
    const byId = new Map(state.annotations.map(a => [a.id, a]));
    for (const a of data.annotations) {
      if (!a || !a.id || !a.geo || !a.kind) continue;
      byId.set(a.id, a);
    }
    state.annotations = [...byId.values()];
    Object.assign(state.poiNotes, data.poiNotes || {});
    Object.assign(state.poiOverrides, data.poiOverrides || {});
    Object.assign(state.iconEdits, data.iconEdits || {});
    SEED_ICONS.forEach(i => renderIcon(i.id));
    Object.values(sets).forEach(st => Object.values(st.ann).forEach(g => g.clearLayers()));
    Object.values(annLayers).forEach(l => l.remove());
    state.annotations.forEach(renderAnn);
      syncPoiMarkers();
    closeDrawer(); saveNow(); renderAll();
    toast(`Imported ${data.annotations.length} pins/drawings.`);
  }

  $('#btn-export').onclick = exportJson;
  $('#btn-import').onclick = () => $('#import-file').click();
  $('#import-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) importJson(f); e.target.value = ''; });
  $('#btn-sync').onclick = () => syncWiki(cur);
  $('#btn-edit-places').onclick = () => setEditingPlaces(!editingPlaces);

  // ---------- icon palette: place any icon, add your own ----------
  let paletteLevel = 'blue';
  function renderPalette() {
    const host = $('#palette-body');
    const tile = ([k, t]) => `<button type="button" class="pal-tile" data-icon="${esc(k)}" title="${esc(t.label)}">
        <span class="pal-icon">${iconHtml(k, paletteLevel, '')}</span><span class="pal-name">${esc(t.label)}</span>
        ${t.kind === 'custom' ? `<span class="pal-del" data-del="${esc(k)}" title="Delete this icon" role="button" aria-label="Delete ${esc(t.label)}">✕</span>` : ''}</button>`;
    host.innerHTML = Object.entries(ICON_GROUPS).filter(([g]) => g !== 'notable').map(([g, gv]) => {
      const items = Object.entries(ICON_TYPES).filter(([, t]) => t.group === g).sort((a, b) => a[1].label.localeCompare(b[1].label));
      if (!items.length && g !== 'custom') return '';
      return `<h3>${esc(gv.label)}${g === 'mobs' ? ` <select id="palette-level" title="Level colour for these icons">${levelOptions(paletteLevel)}</select>` : ''}</h3>
        <div class="pal-grid">${items.map(tile).join('') || '<p class="meta" style="margin:0">None yet. Add one below.</p>'}</div>`;
    }).join('');
    $('#palette-level', host)?.addEventListener('change', e => { paletteLevel = e.target.value; renderPalette(); });
  }
  function customIconUses(id) {
    return state.annotations.filter(a => a.iconType === id).length + Object.values(state.iconEdits).filter(e => e.type === id).length;
  }
  $('#palette-body').addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const id = del.dataset.del, n = customIconUses(id);
      if (!confirm(`Delete the icon “${ICON_TYPES[id].label}”?${n ? ` ${n} marker(s) use it and will show the generic Skills icon instead.` : ''}`)) return;
      state.customIcons = state.customIcons.filter(c => c.id !== id);
      registerCustomIcons(); saveNow();
      state.annotations.filter(a => a.iconType === id).forEach(renderAnn);
      Object.keys(state.iconEdits).forEach(renderIcon);
      renderPalette();
      return;
    }
    const b = e.target.closest('[data-icon]');
    if (!b) return;
    const k = b.dataset.icon, t = ICON_TYPES[k];
    $('#palette').close();
    startPlacing({ display: 'icon', iconType: k, iconColor: t.colorable ? paletteLevel : '', title: t.label }, t.label);
  });
  $('#btn-icons').onclick = () => { renderPalette(); $('#palette-status').textContent = ''; $('#palette').showModal(); };
  $('#palette-close').onclick = () => $('#palette').close();

  // Shrink an uploaded picture to a small PNG so it fits in browser storage and exports.
  function fileToIcon(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 128 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("that file isn't an image the browser can read")); };
      img.src = url;
    });
  }
  $('#icon-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, status = $('#palette-status');
    const name = f.elements.name.value.trim();
    const file = f.elements.file.files[0];
    const emoji = f.elements.emoji.value.trim();
    if (!name) { status.textContent = 'Give the icon a name.'; return; }
    if (!file && !emoji) { status.textContent = 'Choose a picture, or type an emoji or a letter or two.'; return; }
    const rec = { id: 'ci-' + uid(), name, shape: f.elements.shape.value };
    try {
      if (file) rec.image = await fileToIcon(file); else rec.emoji = [...emoji].slice(0, 3).join('');
    } catch (err) { status.textContent = 'Could not add the icon: ' + err.message; return; }
    state.customIcons.push(rec);
    registerCustomIcons(); saveNow();
    f.reset();
    status.textContent = `Added “${name}”. Click it above to place it on the map.`;
    renderPalette();
  });
  $('#btn-help').onclick = () => $('#help').showModal();
  $('#btn-sidebar').onclick = () => document.body.classList.toggle('sidebar-open');

  // ---------- links & toast ----------
  let hashLock = false;
  function setHash(h) {
    hashLock = true;
    history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
    setTimeout(() => { hashLock = false; }, 0);
  }
  function applyHash(hash = location.hash) {
    const q = new URLSearchParams(hash.slice(1));
    const poi = q.get('poi'), note = q.get('note'), icon = q.get('icon'), m = q.get('map'), at = q.get('at');
    if (poi && POIS.some(p => p.id === poi)) return go('poi', poi);
    if (note && state.annotations.some(a => a.id === note)) return go('ann', note);
    if (icon && SEED_BY_ID[icon]) return go('icon', icon);
    if (m && MAP_BY_ID[m]) switchMap(m, { fit: !at });
    if (at) {
      const [x, y, z] = at.split(',').map(Number);
      if ([x, y, z].every(Number.isFinite)) map.setView([y, x], z, { animate: false });
    }
  }
  window.addEventListener('hashchange', () => { if (!hashLock) applyHash(); });
  const bootHash = location.hash; // read before the first map switch rewrites it

  async function copyLink() {
    try { await navigator.clipboard.writeText(location.href); toast('Link copied.'); }
    catch { prompt('Copy this link:', location.href); }
  }

  let toastTimer;
  function toast(msg, { action, onAction } = {}) {
    const t = $('#toast');
    t.innerHTML = esc(msg) + (action ? ` <button class="btn small" style="margin-left:8px;pointer-events:auto">${esc(action)}</button>` : '');
    if (action) $('button', t).onclick = () => { t.classList.remove('show'); onAction(); };
    t.style.pointerEvents = action ? 'auto' : 'none';
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), action ? 6000 : 3200);
  }

  // ---------- map picker & adding maps ----------
  function renderMapPicker() {
    const sel = $('#map-select');
    const opt = m => `<option value="${m.id}" ${m.id === cur.id ? 'selected' : ''}>${esc(m.name)}</option>`;
    const groups = [
      ['Annotated maps', MAPS.filter(m => !m.custom && m.source !== 'wiki')],
      ['Wiki maps', MAPS.filter(m => m.source === 'wiki')],
      ['Your maps', MAPS.filter(m => m.custom)],
    ].filter(([, l]) => l.length);
    sel.innerHTML = `${groups.map(([label, l]) => `<optgroup label="${label}">${l.map(opt).join('')}</optgroup>`).join('')}
      <option value="__add">＋ Add a map…</option>`;
  }
  $('#map-select').addEventListener('change', e => {
    const v = e.target.value;
    if (v === '__add') { renderMapPicker(); openAddMap(); return; }
    switchMap(v);
  });

  // Images on a wiki page, best map candidates first. Maps are big; screenshots have screen-sized widths.
  async function wikiMapImages(page) {
    const r = await fetch(`${WIKI_API}?action=query&generator=images&titles=${encodeURIComponent(page)}&gimlimit=50&prop=imageinfo&iiprop=url|size&iiurlwidth=360&format=json&formatversion=2&origin=*`);
    const j = await r.json();
    const SCREEN_WIDTHS = [1280, 1366, 1440, 1600, 1920, 2560, 3440, 3840];
    return (j?.query?.pages || []).filter(pg => pg.imageinfo?.[0]).map(pg => {
      const i = pg.imageinfo[0], name = pg.title.replace(/^File:/, '');
      let score = i.width * i.height;
      if (/map|v\d+|draft|isometric/i.test(name)) score *= 3;
      if (/screenshot/i.test(name)) score *= 0.1;
      if (SCREEN_WIDTHS.includes(i.width)) score *= 0.2;
      if (/\.png$/i.test(name)) score *= 0.7;
      return { name, url: i.url, thumb: i.thumburl || i.url, width: i.width, height: i.height, score };
    }).sort((a, b) => b.score - a.score);
  }

  function imageSize(url) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => rej(new Error("couldn't load that image"));
      img.src = url;
    });
  }

  let addMapCtx = {};
  let wikiImages = [];
  async function lookUpWikiImages() {
    const f = $('#add-map-form');
    const page = normPage(f.elements.page.value);
    const field = $('#wiki-image-field');
    wikiImages = [];
    field.hidden = true;
    if (!page) return;
    const status = $('#add-map-status');
    status.textContent = `Looking for map images on the ${page.replace(/_/g, ' ')} wiki page…`;
    try { wikiImages = await wikiMapImages(page); } catch { wikiImages = []; }
    if (normPage(f.elements.page.value) !== page) return; // typed something else meanwhile
    if (!wikiImages.length) { status.textContent = 'No images on that wiki page. Paste an image URL or choose a file.'; return; }
    f.elements.wikiImage.innerHTML = wikiImages.map((im, i) => `<option value="${i}">${esc(im.name)} (${im.width}×${im.height})</option>`).join('');
    field.hidden = false;
    status.textContent = '';
    showWikiThumb();
  }
  function showWikiThumb() {
    const im = wikiImages[+$('#add-map-form').elements.wikiImage.value];
    $('#wiki-image-preview').src = im ? im.thumb : '';
  }
  function openAddMap({ name = '', page = '', linkFrom = '' } = {}) {
    addMapCtx = { linkFrom };
    const f = $('#add-map-form');
    f.reset();
    f.elements.name.value = name;
    f.elements.page.value = String(page || name).replace(/_/g, ' ');
    $('#add-map-status').textContent = '';
    $('#wiki-image-field').hidden = true;
    wikiImages = [];
    $('#add-map').showModal();
    (name ? f.elements.url : f.elements.name).focus();
    if (f.elements.page.value) lookUpWikiImages();
  }
  $('#add-map-form').elements.page.addEventListener('input', debounce(lookUpWikiImages, 600));
  $('#add-map-form').elements.name.addEventListener('change', e => {
    const pg = $('#add-map-form').elements.page;
    if (!pg.value.trim()) { pg.value = e.target.value.trim(); lookUpWikiImages(); }
  });
  $('#add-map-form').elements.wikiImage.addEventListener('change', showWikiThumb);
  $('#add-map-cancel').addEventListener('click', () => $('#add-map').close());

  $('#add-map-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const status = $('#add-map-status');
    const submit = $('button[type=submit]', f);
    const name = f.elements.name.value.trim();
    const page = normPage(f.elements.page.value);
    let url = f.elements.url.value.trim();
    const file = f.elements.file.files[0];
    if (!name) { status.textContent = 'Give the map a name.'; return; }
    submit.disabled = true;
    try {
      let size;
      if (file) {
        status.textContent = 'Reading the image…';
        const tmp = URL.createObjectURL(file);
        try { size = await imageSize(tmp); } finally { URL.revokeObjectURL(tmp); }
      } else {
        if (!url && page) {
          if (!wikiImages.length) await lookUpWikiImages();
          const found = wikiImages[+f.elements.wikiImage.value || 0];
          if (!found) { status.textContent = "Couldn't find a map image on that wiki page. Paste an image URL or choose a file."; return; }
          url = found.url;
          size = { width: found.width, height: found.height };
        }
        if (!url) { status.textContent = 'Add an image URL or file, or a wiki page that has a map.'; return; }
        if (!size) { status.textContent = 'Loading the image…'; size = await imageSize(url); }
      }
      const id = 'custom-' + uid();
      const width = 1600, height = Math.round(1600 * size.height / size.width);
      if (file) {
        try { await idb.set(fileKey(id), file); } catch { status.textContent = "Couldn't store that image in this browser."; return; }
      }
      state.customMaps.push({ id, name, page, imageUrl: file ? 'idb:' : url, width, height, created: new Date().toISOString() });
      refreshMaps();
      loadWiki(MAP_BY_ID[id]);
      save();
      $('#add-map').close();
      const from = addMapCtx.linkFrom;
      switchMap(id);
      if (page && wikiOf(id).meta.missing) {
        syncWiki(MAP_BY_ID[id], { quiet: true }).then(ok => toast(ok ? `Added ${name}, with its wiki data.` : `Added ${name}. Its wiki data couldn't be loaded; try Sync wiki.`));
      } else toast(`Added ${name}.`);
      if (from && POIS.some(p => p.map === from && destOf(p)?.id === id)) {
        setTimeout(() => toast(`Exits on ${mapName(from)} now lead here. To link back, right-click this map and set “Leads to map” on the pin.`), 3600);
      }
    } catch (err) {
      status.textContent = 'Could not add the map: ' + err.message;
    } finally {
      submit.disabled = false;
    }
  });

  // ---------- boot ----------
  MAPS.forEach(loadWiki);
  buildIcons();
  buildPois();
  buildAnnotations();
  switchMap(cur.id);
  applyHash(bootHash);
  try {
    if (!localStorage.getItem('nh-atlas:seen-help')) { localStorage.setItem('nh-atlas:seen-help', '1'); $('#help').showModal(); }
  } catch { /* storage unavailable */ }
})();
