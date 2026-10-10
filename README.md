# Monster Map

An interactive map of Night Harbor (Monsters & Memories) that you can annotate. It is a static single-page app with no build step.

## Run

Open `index.html` in a browser, or serve the folder:

```
python -m http.server 8765
```

## Publishing on GitHub Pages

The site is static, so GitHub Pages can serve this repository as it is.

1. Create an empty repository on GitHub (no README or licence, so the first push is clean).
2. Push this one to it:

   ```
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

3. On GitHub: **Settings → Pages → Build and deployment**. Set Source to "Deploy from a branch", Branch to `main` and folder to `/ (root)`, then Save.
4. After a minute or two the site is live at `https://<you>.github.io/<repo>/`. Every later `git push` updates it.

The empty `.nojekyll` file tells Pages to serve the files untouched. Visitors' notes stay in their own browsers; nothing is stored on GitHub.

After changing `app.js`, `styles.css` or anything in `data/`, raise the `?v=` number on the script and stylesheet tags in `index.html`, so returning visitors don't get a stale cached copy.

The map art is by Maggot and other Monsters & Memories wiki contributors. Keep the credits, and check with the artists before promoting a public copy.

## Maps

- **Night Harbor** and **Shaded Dunes** are built in. Both use Maggot's maps with their painted icons turned into live markers.
- Switch maps with the map picker in the top bar, or travel through exits ("To Shaded Dunes" → **Travel**, or double-click the exit). You arrive at the matching exit on the other side.
- Exits are linked by wiki page (`toPage`). An exit links to any map, built-in or added, that shows that page.
- **＋ Add a map** in the picker adds any zone. Type its wiki page name and the app ranks the images on that page, so you can pick the map. It also loads the page's NPCs, quests and items. Added maps are stored in the browser and included in Export/Import.
- A pin with **Leads to map** set becomes your own link between maps.

## Maps crawled from the wiki

`work/crawl.js` reads every page in the wiki's Zones and Cities categories, with all their images. 23 zones have a usable map image. Their maps are in `data/maps/wiki-zones.js`, with local web copies in `assets/maps/`; the wiki originals are offered in the Layers tab. Each map comes with its wiki page (NPCs, quests, items) and an exit to every neighbouring zone the wiki lists. Exit positions were found by reading the map labels with OCR (`work/wiki_maps.py`) or measured by hand (`work/exit_fixes.json`). Exits whose spot is unknown are listed but not placed; open one and use **📍 Place on map**.

Four zones have no map on the wiki yet (Glinting Hollow, Night Harbor Sewers, The Hidden Grotto, Great Cavern Sea). Their exits show "no map yet".

To refresh, run these from `work/`: `node crawl.js`, then review `wiki_maps.json`, then `node download_maps.js`, `python wiki_maps.py` and `node gen_wiki_maps.js`.

## Dungeon maps

Maps in the wiki's Dungeons category are grouped under **Dungeons** in the map picker. A dungeon map can have its painted marks made clickable, described in `data/maps/dungeons.js`:

- **Named mobs:** the numbers from the map key, each linked to its wiki NPC.
- **Map connections:** lettered boxes that join two parts of the map. Double-click one to jump to its other end.
- **Traps** and **wing banners.**

The Tomb of the Last Wyrmsbane is set up this way. To do another dungeon, add it to `DUNGEONS` in `work/dungeons.py` with rough positions read off the map, put the source image in `work/tmp/`, and run `python dungeons.py`. The script snaps each position to the exact painted mark and writes `dungeons.js`.

Without any of that, the **＋ Icon** palette has dungeon symbols (numbered spot, map connection, trap, secret wall, stairs, locked door, chest). Two "Map connection" pins with the same label on one map act as the two ends of a passage.

## Guides

- **Leveling guide:** hunting spots by level, from the wiki's "Per-Level Hunting Guide". Enter your level and choose solo, group or either; each spot's zone opens that map.
- **Skills guide:** every skill page on the wiki. Tradeskills show their trainers, tools and locations, and the recipe tiers by "trivial" level. Enter your skill to see which tier to work on.

The guide data is a snapshot in `data/guides/`. To refresh it, run `node crawl_skills.js` and then `node gen_guides.js` from `work/`. Each skill's page is a separate file in `data/guides/skills/`, loaded when you open it. The level and skill values you enter are saved in your browser.

`guides.js` holds the guide screens. It talks to the map through `window.MonsterMap`, which `app.js` sets up.

## Files

| File | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app: maps, panels, notes (Leaflet + Leaflet-Geoman from a CDN) |
| `guides.js` | The Leveling and Skills guide screens |
| `data/guides/` | Guide data from the wiki (generated) |
| `data/atlas.js` | Shared place categories; the map registry |
| `data/icon-types.js` | Legend vocabulary: icon types, level colours, legend letters |
| `data/parse-wiki.js` | Turns a zone page's wikitext into quests, NPCs, items and zone info |
| `data/maps/<map>.js` | One map: size, level legend, images and places (exits use `toPage`) |
| `data/maps/<map>-icons.js` | The icons that were painted on that map, as live markers (generated) |
| `data/maps/<map>-wiki.js` | Offline copy of the map's wiki page |
| `data/maps/<map>-labels.js` | Where each place's name banner is painted on the map (generated by `work/banners.py`). The banner is the click target, so no marker covers its text |
| `assets/*-clean*.jpg` | Maps with every painted icon removed (generated) |
| `assets/icons/` | One sprite per icon type, cut from the map and legend art (generated) |
| `work/` | Python scripts that produced the clean maps, sprites and icon data |

## Adding a built-in map

1. Write `data/maps/<id>.js`, copying `shaded-dunes.js`. Use 1600 units across, so height = 1600 × image height ÷ image width.
2. Optional: paint the icons out. Download the full-size map into `work/`. Catalogue its icons in `work/icons_manual.py` (add an entry to `MAPS`). Then run `python build.py <id>` and `python sprites.py`, and add the generated `<id>-icons.js` to the page.
3. Save the wiki snapshot as `data/maps/<id>-wiki.js` (copy the format of the existing ones).
4. Add the new `<script>` tags to `index.html`.

## Data

- **Wiki data**: comes from each map's snapshot. **Sync wiki** pulls the current map's live page through the MediaWiki API and caches it in the browser.
- **Your notes** (pins, drawings, place and icon notes, moved places, added maps): saved in `localStorage`. Use **Export** or **Import** to save a JSON backup or share it. Notes from older versions are moved to Night Harbor automatically.
- **Map icons**: click one to rename it, change its type, level or letter, add notes, or remove it. Drag them with **Edit places**. Level labels follow each map's own legend.

## Rebuilding the clean maps

You need Python with `pillow numpy opencv-contrib-python-headless`. Put the originals in `work/`: `nh_full.jpg` (`File:Night_harbor_V5.jpg`) and `sd_full.jpg` (`File:Shaded_Dunes_Map.jpg`). Then, from `work/`, run `python build.py night-harbor` (about 6 minutes), `python build.py shaded-dunes`, and `python sprites.py`. After changing places, run `python banners.py` to re-match them to their banners. Places with no banner of their own go in `NO_BANNER` in that script.
