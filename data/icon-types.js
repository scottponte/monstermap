// Icon vocabulary from the map's legends (Maggot's Night Harbor map).
//   group  – layer the icon belongs to
//   kind   – 'square' | 'badge' (sprite in assets/icons/<type>.png) or 'shape' (tinted silhouette)
//   scale  – size relative to a standard icon
//   wiki   – words used to find related NPCs in the wiki tables

window.NH_ICON_GROUPS = {
  services:    { label: 'Services',            color: '#7fc4e8' },
  tradeskills: { label: 'Tradeskills',         color: '#cfc6b4' },
  notable:     { label: 'Notable & friendly NPCs', color: '#00a8f0' },
  mobs:        { label: 'Mobs by level',       color: '#5ee8d0' },
  respawn:     { label: 'Respawn points',      color: '#9aa0aa' },
};

window.NH_LEVEL_COLORS = {
  blue:   { label: 'Blue (notable / friendly)', color: '#00a8f0' },
  cyan:   { label: 'Cyan',   color: '#5ee8d0' },
  green:  { label: 'Green',  color: '#8cd24c' },
  yellow: { label: 'Yellow', color: '#ffee00' },
  orange: { label: 'Orange', color: '#ffb400' },
  red:    { label: 'Red',    color: '#ff1a1a' },
  black:  { label: 'Unlevelled', color: '#111111' },
};

// Letters drawn on notable-NPC heads (from the legend).
window.NH_ICON_LETTERS = {
  B: { label: 'Budiya',               wiki: ['Budaiyah', 'Budiya'] },
  M: { label: 'Magnificent Malkiyah', wiki: ['Malkiyah'] },
  P: { label: 'Pauper',               wiki: ['Pauper'] },
  R: { label: 'Realtor',              wiki: ['Realtor'] },
  W: { label: 'Wiseman',              wiki: ['wise elder', 'Wiseman'] },
  '+': { label: 'more than one',      wiki: [] },
};

(function () {
  const T = {
    bank:   { label: 'Bank',           group: 'services', kind: 'square', wiki: ['Banker'] },
    inn:    { label: 'Inn',            group: 'services', kind: 'square', wiki: ['Innkeeper', 'an innkeeper'] },
    stable: { label: 'Stable',         group: 'services', kind: 'square', wiki: ['stablemaster', 'Rider'] },
    shady:  { label: 'Shady merchant', group: 'services', kind: 'square', wiki: ['greedy', 'shifty'] },
    stall:  { label: 'Player stall',   group: 'services', kind: 'square', scale: 0.68 },

    humanoid: { label: 'Humanoid', group: 'mobs', kind: 'shape', scale: 0.82, colorable: true },
    goblin:   { label: 'Goblins',  group: 'mobs', kind: 'shape', scale: 0.9,  colorable: true, wiki: ['goblin'] },
    ring:     { label: 'Mobs',     group: 'mobs', kind: 'shape', scale: 1.1,  colorable: true },
    skull:    { label: 'Undead',   group: 'mobs', kind: 'shape', scale: 0.85, colorable: true, wiki: ['skeleton', 'zombie', 'mummy', 'ghoul', 'risen'] },
    ashira:   { label: 'Ashira',   group: 'mobs', kind: 'shape', scale: 1.05, colorable: true, wiki: ['ashira'] },
    giant:    { label: 'Giants',   group: 'mobs', kind: 'shape', scale: 0.9,  colorable: true, wiki: ['sand giant', 'Maleq'] },
    star:     { label: 'Respawn point', group: 'respawn', kind: 'shape', scale: 0.72 },

    skills:  { label: 'Skill trainer / supply vendor', group: 'tradeskills', kind: 'badge' },
    masonry: { label: 'Masonry', group: 'tradeskills', kind: 'badge', wiki: ['Mason'] },
  };
  const TS = {
    alchemy: ['Alchemy', ['Alchemy']], animal_taming: ['Animal Taming', ['Beastmaster']], archaeology: ['Archaeology', ['Archaeology', 'researcher']],
    astrology: ['Astrology', ['Astrolog']], blacksmithing: ['Blacksmithing / Smelting', ['Blacksmith', 'Smelting']],
    brewing: ['Brewing / Fermenting', ['Brewing', 'Fermenting']], carpentry: ['Carpentry / Woodworking', ['Carpent', 'Woodwork']],
    cartography: ['Cartography', ['Cartograph']], cooking: ['Cooking', ['cook', 'Chef']], enchanting: ['(Dis)Enchanting', ['Enchant']],
    farming: ['Farming', ['Farmer', 'farmer']], first_aid: ['First Aid', ['Medic', 'medic']], fishing: ['Fishing', ['fisher', 'Fishing']],
    fletching: ['Fletching', ['Fletch', 'Bowyer']], foraging: ['Foraging', ['Forag']], herbalism: ['Herbalism', ['Herbalist', 'herbalist']],
    jewelcrafting: ['Jewelcrafting', ['Jewel']], leatherworking: ['Leatherworking', ['Leatherwork', 'leatherworker']],
    lumberjacking: ['Lumberjacking', ['Lumberjack', 'lumberjack']], mining: ['Mining', ['Miner', 'miner']], navigation: ['Navigation', ['Navigat', 'Harbormaster']],
    poison_making: ['Poison Making', ['Poison']], pottery: ['Pottery', ['Pottery']], riding: ['Riding', ['Rider', 'rider', 'stablemaster']],
    skinning: ['Skinning / Tanning', ['Tanner', 'tanner', 'Pelts']], spellcrafting: ['Spellcrafting', ['Spell Merchant', 'Spellcraft']],
    spinning: ['Spinning', ['Spinning']], spycraft: ['Spycraft', ['Spy']], stone_cutting: ['Stone Cutting', ['Stonecutter']],
    survival: ['Survival', ['Survival', 'survivalist']], tailoring: ['Tailoring', ['Tailor']], tinkering: ['Tinkering', ['Tinkerer']],
    wagoneering: ['Wagoneering', ['Wagon']], wilderness: ['Wilderness', ['Outdoorsman', 'outdoorsman']],
  };
  for (const [k, [label, wiki]] of Object.entries(TS)) {
    T['ts_' + k] = { label, group: 'tradeskills', kind: 'badge', wiki, desc: 'Tradeskill trainer and/or supply vendor.' };
  }
  // Tradeskill icons that appear only in the legend have no sprite of their own; fall back to the generic badge.
  const HAVE = ['brewing', 'poison_making', 'alchemy', 'animal_taming', 'archaeology', 'astrology', 'blacksmithing', 'carpentry', 'cartography', 'cooking', 'enchanting',
    'farming', 'first_aid', 'fletching', 'herbalism', 'jewelcrafting', 'leatherworking', 'lumberjacking', 'mining', 'navigation', 'pottery',
    'riding', 'skinning', 'spellcrafting', 'spinning', 'spycraft', 'stone_cutting', 'survival', 'tailoring', 'tinkering', 'wagoneering', 'wilderness'];
  for (const k of Object.keys(TS)) if (!HAVE.includes(k)) T['ts_' + k].sprite = 'skills';
  T.skills.sprite = 'skills';
  window.NH_ICON_TYPES = T;
})();
