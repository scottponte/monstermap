// Night Harbor – Maggot's "Night Harbor V5" map (5760×4896) shown on a 1600×1360 grid (1 unit = 3.6 px).
// Places were positioned by eye from the map's labels. Drag them in "Edit places" to fix them;
// your changes are saved in the browser.
//
// Place fields:
//   table     – wiki NPC table ("NPCs - <table>") listed for the place
//   npcFilter – text (or list of texts) to look for in an NPC's name / Location / Description
//   npcExclude – text (or list) that removes NPCs the filter would otherwise include
//   wiki      – wiki page to link
//   toPage    – wiki page of the zone this exit leads to. If a map for that page exists, the app offers travel.
(window.NH_ATLAS_MAPS = window.NH_ATLAS_MAPS || []).push({
  id: 'night-harbor',
  name: 'Night Harbor',
  page: 'Night_Harbor',
  width: 1600,
  height: 1360,
  levels: {
    blue:   { label: 'Notable NPC' },
    cyan:   { label: 'Level 1–5',   range: [1, 5] },
    green:  { label: 'Level 6–10',  range: [6, 10] },
    yellow: { label: 'Level 11–15', range: [11, 15] },
    orange: { label: 'Level 15–20', range: [15, 20] },
    red:    { label: 'Level 20+',   range: [20, 99] },
  },
  images: [
    {
      id: "clean",
      name: "Clean map – icons are live markers (full res)",
      url: "assets/night-harbor-clean.jpg",
      credit: "Map by Maggot (icons repainted as markers) · via the Monsters & Memories wiki",
      clean: true
    },
    {
      id: "clean-small",
      name: "Clean map – icons are live markers (2880px, faster)",
      url: "assets/night-harbor-clean-2880.jpg",
      credit: "Map by Maggot (icons repainted as markers) · via the Monsters & Memories wiki",
      clean: true
    },
    {
      id: "maggot-v5",
      name: "Original map with painted icons (full res)",
      url: "https://static.wikitide.net/monstersandmemorieswiki/5/5a/Night_harbor_V5.jpg",
      credit: "Map by Maggot · via the Monsters & Memories wiki"
    },
    {
      id: "maggot-v5-small",
      name: "Original map with painted icons (1600px)",
      url: "https://static.wikitide.net/monstersandmemorieswiki/thumb/5/5a/Night_harbor_V5.jpg/1600px-Night_harbor_V5.jpg",
      credit: "Map by Maggot · via the Monsters & Memories wiki"
    }
  ],
  pois: [
    {id:"west-gate",name:"West Gate",cat:"district",x:322,y:697,table:"West Gate",desc:"Caravan gate on the western wall, leading out to the desert and the road to the Shaded Dunes."},
    {id:"sojourners-camp",name:"Sojourner's Camp",cat:"district",x:440,y:478,table:"Sojourner's Camp",desc:"Camp in the north-west of the city around the Temple to Eltindra. Tradeskill trainers (medic, herbalist, survivalist, outdoorsman, lumberjack, miner) and a stablemaster."},
    {id:"tannery",name:"Tannery",cat:"district",x:592,y:533,table:"Tannery",desc:"Tannery and leatherworkers, with masons, stonecutters and tinkerers just outside the Arena."},
    {id:"arena",name:"The Arena",cat:"district",x:680,y:420,desc:"Walled arena north of the Tannery."},
    {id:"night-market",name:"Night Market",cat:"district",x:625,y:716,table:"Night Market",desc:"Central market: bags, cloth/chain/plate armor, used weapons, grocer & butcher, cobbler, herbs & spices, general goods. Also home to the Claw Compound."},
    {id:"saltbreeze-park",name:"Saltbreeze Park",cat:"district",x:822,y:610,table:"Saltbreeze Park",desc:"Park in the centre of the city, home to the Seekers of the Lost Eye and the Circle of Scarce Rains."},
    {id:"little-half-town",name:"Little Half Town",cat:"district",x:812,y:795,table:"Little Half Town",desc:"Southern quarter by the docks. Vendors: bags, cloth/chain/leather/plate armor, reagents, cobbler, general goods."},
    {id:"sageside",name:"Sageside",cat:"district",x:1122,y:480,table:"Sageside",desc:"North-eastern quarter inside the North Gate. Vendors: used armor, used weapons, food, general goods, bags, leatherworker."},
    {id:"palace",name:"Palace",cat:"district",x:1132,y:625,desc:"The palace grounds with the great golden dome."},
    {id:"blackfeather-bazaar",name:"Blackfeather Bazaar",cat:"district",x:1003,y:271,table:"Blackfeather Bazaar",desc:"Bazaar north of the walls. Vendors: food/animal parts, used armor, weaponsmith, used weapons, butcher & cook, pelt trader."},
    {id:"twilight-harbor",name:"Twilight Harbor",cat:"district",x:952,y:1070,table:"Twilight Harbor",desc:"The main docks. The Pale Guard Tower named mobs (level ~40–44) are listed here on the wiki."},
    {id:"steel-talon-naval-base",name:"Steel Talon Naval Base",cat:"district",x:520,y:968,desc:"Naval base on the south-west waterfront."},
    {id:"library",name:"Library",cat:"district",x:1325,y:530,desc:"Library in the north-east of Sageside."},
    {id:"hospice",name:"Wayfarer's Hospice",cat:"guild",x:345,y:515,table:"Wayfarer's Hospice",wiki:"Penitent Knights of the Hospice",desc:"Cleric & Paladin guild (CLR/PAL) – home of the Penitent Knights of the Hospice."},
    {id:"steel-talon-garrison",name:"Steel Talon Garrison",cat:"guild",x:365,y:905,table:"Steel Talon Garrison",desc:"Archer, Fighter & Ranger guild (ARC/FTR/RNG)."},
    {id:"concourse",name:"The Concourse of Souls",cat:"guild",x:880,y:312,table:"The Concourse of Souls",desc:"Necromancer & Shadow Knight guild (NEC/SHD), north of the crypt."},
    {id:"bard-guild",name:"Bard Guild",cat:"guild",x:503,y:720,table:"Night Market",npcFilter:"Jamee",desc:"Bard guild (BRD)."},
    {id:"rogue-guild",name:"City Illuminator's Guild",cat:"guild",x:580,y:820,table:"Night Market",npcFilter:"Illuminator",desc:"Rogue guild (ROG)."},
    {id:"seekers",name:"Seekers of the Lost Eye",cat:"guild",x:955,y:602,table:"Saltbreeze Park",npcFilter:"Seekers",wiki:"Seekers of the Lost Eye",desc:"Beastmaster & Shaman guild (BST/SHM)."},
    {id:"druid-guild",name:"Circle of Scarce Rains",cat:"guild",x:978,y:716,table:"Saltbreeze Park",npcFilter:"Scarce Rains",desc:"Druid guild (DRU)."},
    {id:"fourfold",name:"School of the Fourfold Path",cat:"guild",x:883,y:838,table:"Little Half Town",npcFilter:"Fourfold",desc:"Elementalist & Monk guild (ELE/MNK)."},
    {id:"wizard-guild",name:"Wizard Guild",cat:"guild",x:1310,y:493,desc:"Wizard guild (WIZ)."},
    {id:"enc-inq-spb",name:"Enchanter / Inquisitor / Spellblade",cat:"guild",x:1395,y:440,desc:"Enchanter, Inquisitor & Spellblade guilds (ENC/INQ/SPB)."},
    {id:"temple-eltindra",name:"Temple to Eltindra",cat:"temple",x:440,y:427},
    {id:"temple-matswar",name:"Temple to Matswar",cat:"temple",x:775,y:295},
    {id:"temple-relle",name:"Temple to Relle",cat:"temple",x:465,y:790,table:"Night Market",npcFilter:"Relle"},
    {id:"shrine-porbor",name:"Shrine to Porbor",cat:"temple",x:632,y:775,table:"Night Market",npcFilter:"Porbor"},
    {id:"temple-haradrel",name:"Temple to Haradrel",cat:"temple",x:360,y:933},
    {id:"temple-yuum",name:"Temple to Yuum",cat:"temple",x:1125,y:980},
    {id:"temples-vespura-tilustra",name:"Temples to Vespura & Tilustra",cat:"temple",x:1330,y:415},
    {id:"shaded-bloom-inn",name:"Shaded Bloom Inn",cat:"service",x:472,y:590,table:"Shaded Bloom Inn",desc:"Inn with the West Bank, bankers, customs inspector and the Guild Registrar."},
    {id:"bathhouse",name:"Bathhouse",cat:"service",x:430,y:733},
    {id:"exit-shaded-dunes",name:"To Shaded Dunes",cat:"travel",x:85,y:702,wiki:"Shaded Dunes",desc:"Zone line west to the Shaded Dunes.",toPage:"Shaded Dunes"},
    {id:"exit-wyrmsbane",name:"To Tomb of the Last Wyrmsbane",cat:"travel",x:190,y:365,wiki:"Tomb of the Last Wyrmsbane",table:"West Gate",npcFilter:"Wyrmsbane",desc:"Cave entrance in the north-west cliffs. Assistant Researcher Farland camps outside; Matheus Griswald is inside the cave.",toPage:"Tomb of the Last Wyrmsbane"},
    {id:"exit-sungreet",name:"To Sungreet Strand",cat:"travel",x:1175,y:85,wiki:"Sungreet Strand",desc:"Zone line north to Sungreet Strand.",toPage:"Sungreet Strand"},
    {id:"sewers",name:"To Night Harbor Sewers",cat:"travel",x:975,y:862,wiki:"Night Harbor Sewers",toPage:"Night Harbor Sewers"},
    {id:"boat-keepers-bight",name:"Boat to Keeper's Bight",cat:"travel",x:982,y:1108,wiki:"Keeper's Bight",desc:"Boat route Night Harbor ↔ Keeper's Bight (Penshaw Village), 4 stops, via Shallow Shoals (\"Player Island\" and Zaedin's Landing).",toPage:"Keeper's Bight"},
    {id:"exit-underdocks",name:"To Underdocks",cat:"travel",toPage:"Underdocks",wiki:"Underdocks",desc:"The wiki lists the Underdocks next to Night Harbor. Its entrance isn't marked on this map yet."},
    {id:"teleporter-docks",name:"Teleporter to Docks",cat:"travel",x:1155,y:557},
    {id:"teleporter-sageside",name:"Teleporter to Sageside",cat:"travel",x:1155,y:820},
    {id:"crypt",name:"Night Harbor Crypt",cat:"hunting",x:835,y:485,table:"Night Harbor Crypt",desc:"Level ~10–18 crypt reached through the Red Mantle Keep. Beetles and scarabs by day, skeletons by night, with several named mobs."},
    {id:"noob-yard-west",name:"West Noob Yard",cat:"hunting",x:190,y:560,table:"West Gate",npcFilter:"Noob Yard",desc:"Level 1–5 hunting outside the West Gate: rats, skeletons, spiderlings, scarabs, bats, fire beetles, jackals and ashira."},
    {id:"noob-yard-north",name:"North Noob Yard",cat:"hunting",x:1200,y:240,table:"North Gate",npcFilter:"Noob Yard",desc:"Level 1–5 hunting outside the North Gate."},
    {id:"north-gate",name:"North Gate",cat:"hunting",x:1155,y:405,table:"North Gate",desc:"North gate guards, plus the cemetery and Hidden Cultist Cave (level 16–18) outside."},
    {id:"grave-digger-camp",name:"Grave Digger Camp",cat:"hunting",x:1003,y:73,table:"Grave Digger Camp",desc:"Outside the North Gate. Disgraced friars, grave robbers and Grubbfist."},
    {id:"the-bends",name:"The Bends",cat:"hunting",x:1320,y:820,table:"The Bends",desc:"Rough waterfront east of the palace with named mobs (Brask brothers, Cormac Renshaw, Eamon Kassir…)."},
  ],
});
