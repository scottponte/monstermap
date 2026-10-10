// Shared vocabulary for every map. Each map registers itself in data/maps/<id>.js.
window.NH_ATLAS_MAPS = window.NH_ATLAS_MAPS || [];

window.NH_CATEGORIES = {
  district: {
    label: "Districts & landmarks",
    color: "#d9a441",
    glyph: "◆"
  },
  guild: {
    label: "Class guilds",
    color: "#a77bdc",
    glyph: "✦"
  },
  temple: {
    label: "Temples & shrines",
    color: "#4fb3a9",
    glyph: "☥"
  },
  service: {
    label: "Services",
    color: "#7cb35a",
    glyph: "⌂"
  },
  travel: {
    label: "Exits & travel",
    color: "#5b9be0",
    glyph: "➜"
  },
  hunting: {
    label: "Hunting & dungeons",
    color: "#d9534f",
    glyph: "⚔"
  },
  // Dungeon maps. hitOnly: the painted mark (number, letter box, symbol) is the place; no marker covers it.
  named: {
    label: "Named mobs (map key)",
    color: "#ffd84a",
    glyph: "★",
    hitOnly: true,
    dungeon: true
  },
  connection: {
    label: "Map connections",
    color: "#4fc3f7",
    glyph: "⬚",
    hitOnly: true,
    dungeon: true
  },
  hazard: {
    label: "Traps & hazards",
    color: "#ff4d4d",
    glyph: "☒",
    hitOnly: true,
    dungeon: true
  },
  section: {
    label: "Wings & sections",
    color: "#7ed957",
    glyph: "▤",
    dungeon: true
  }
};
