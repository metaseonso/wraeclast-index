/* The item-text reader (assets/itemtext.js), on item texts as the game copies them.

   node --test tools/dev/itemtext.test.mjs

   Every text below is written for this test in the game's own copy format (Ctrl+C, and Ctrl+Alt+C where a
   text carries the { ... Modifier ... } lines), from the game's own lines: the names, base types and modifier
   lines are the ones the index carries (data/index.json, data/craft/*.json) and the currency names the ones the
   Currency Exchange lists (data/market.json). None is copied from another tool's tests.

   Each text states what the reader must find in it and the card it must open. The card is looked up the way
   the page looks it up (assets/paste.js): by kind and name in the index and today's currency, never an Atlas
   passive, a unique on the pasted base first. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isItemText, parse, plan, resolve, shown, ownPrice, runs } from '../../assets/itemtext.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX = JSON.parse(readFileSync(join(ROOT, 'data', 'index.json'), 'utf8'));
const MARKET = JSON.parse(readFileSync(join(ROOT, 'data', 'market.json'), 'utf8'));
const BY = new Map();   // "k:name" -> cards
const put = c => { const key = c.k + ':' + c.n; if(!BY.has(key)) BY.set(key, []); BY.get(key).push(c); };
for(const c of INDEX.items) put(c);
for(const key of Object.keys(MARKET.items)) if(key.startsWith('c:') && !BY.has(key)) put({k: 'c', id: key.slice(2), n: key.slice(2)});
function pick(it, k, n){
  const list = (BY.get(k + ':' + n) || []).filter(c => !(c.k === 'a' && c.at === 'tree'));
  if(!list.length) return null;
  return (it.base && list.find(c => c.id === c.n + ' | ' + it.base)) || list[0];
}
const cardOf = async it => { const c = await resolve(it, (k, n) => pick(it, k, n)); return c ? c.k + ':' + c.id : null; };

/* ---------- the texts ---------- */
const T = [];
const item = (label, text, want, card) => T.push({label, text, want, card});

/* ---------- uniques ---------- */
item('unique boots, plain, enchants, rune, corrupted, a note', `Item Class: Boots
Rarity: Unique
Atziri's Step
Cinched Boots
--------
Quality: +20% (augmented)
Evasion Rating: 712 (augmented)
--------
Requires: Level 65, 86 Dex
--------
Sockets: S
--------
Item Level: 83
--------
+21% to Fire Resistance (enchant)
+20% to Cold Resistance (enchant)
--------
18% increased Armour, Evasion and Energy Shield (rune)
--------
30% increased Movement Speed
111% increased Evasion Rating
+93 to Evasion Rating
--------
"Only those who dance are free."
--------
Corrupted
--------
Note: ~b/o 900 divine
`, {rarity: 'Unique', name: "Atziri's Step", base: 'Cinched Boots', ilvl: 83, quality: 20, corrupted: true, sockets: ['S'],
  mods: 6, kinds: {enchant: 2, rune: 1, unique: 3}, runes: 1, note: '~b/o 900 divine', req: {Level: 65, Dex: 86}}, "u:Atziri's Step | Cinched Boots");

item('unique helmet, advanced text, a corruption enhancement', `Item Class: Helmets
Rarity: Unique
Ironride
Visored Helm
--------
Quality: +20% (augmented)
Armour: 105 (augmented)
Evasion Rating: 89 (augmented)
--------
Requires: Level 16, 14 (augmented) Str, 14 (augmented) Dex
--------
Sockets: S
--------
Item Level: 81
--------
{ Corruption Enhancement — Mana }
30(20-30)% increased Mana Regeneration Rate
--------
{ Unique Modifier — Armour, Evasion }
62(60-80)% increased Armour and Evasion
{ Unique Modifier — Mana }
+40(30-50) to maximum Mana
{ Unique Modifier }
You have no Accuracy Penalty at Distance — Unscalable Value
--------
Let the rider's aim be true.
--------
Corrupted
`, {rarity: 'Unique', name: 'Ironride', base: 'Visored Helm', corrupted: true, mods: 4, first: '30% increased Mana Regeneration Rate',
  last: 'You have no Accuracy Penalty at Distance', kinds: {corruption: 1, unique: 3}, req: {Level: 16, Str: 14, Dex: 14}}, 'u:Ironride | Visored Helm');

item('unique bow, plain', `Item Class: Bows
Rarity: Unique
Death's Harp
Dualstring Bow
--------
Physical Damage: 19-35
Critical Hit Chance: 5.00%
Attacks per Second: 1.15
--------
Requires: Level 28, 52 Dex
--------
Item Level: 45
--------
+50% Surpassing chance to fire an additional Arrow (implicit)
--------
+22% to Critical Damage Bonus
Gain 25 Life per enemy killed
Gain 14 Mana per enemy killed
+301% Surpassing chance to fire an additional Arrow
--------
The first string hums. The second sings.
`, {rarity: 'Unique', name: "Death's Harp", base: 'Dualstring Bow', ilvl: 45, mods: 5, kinds: {implicit: 1, unique: 4},
  props: ['Physical Damage: 19-35', 'Critical Hit Chance: 5.00%', 'Attacks per Second: 1.15']}, "u:Death's Harp | Dualstring Bow");

item('unique belt, plain', `Item Class: Belts
Rarity: Unique
Headhunter
Heavy Belt
--------
Requires: Level 60
--------
Item Level: 84
--------
Has 2 Charm Slots (implicit)
--------
+42 to Strength
+37 to Dexterity
+56 to maximum Life
When you kill a Rare monster, you gain its Modifiers for 60 seconds
--------
"A man's soul rules from a cavern of bone, learns and
judges through flesh-born windows."
`, {rarity: 'Unique', name: 'Headhunter', base: 'Heavy Belt', mods: 5, text: 2}, 'u:Headhunter');

item('unique dagger, no requirement block', `Item Class: Daggers
Rarity: Unique
Winter's Bite
Glass Shank
--------
Cold Damage: 8-17 (cold)
Critical Hit Chance: 15.00%
Attacks per Second: 1.55
--------
Item Level: 12
--------
No Physical Damage
Adds 8 to 17 Cold Damage
Freezes Enemies that are on Full Life
`, {rarity: 'Unique', name: "Winter's Bite", base: 'Glass Shank', ilvl: 12, mods: 3}, "u:Winter's Bite");

item('unique amulet, advanced, implicit block', `Item Class: Amulets
Rarity: Unique
Astramentis
Stellar Amulet
--------
Requires: Level 24
--------
Item Level: 70
--------
{ Implicit Modifier — Attribute }
+6(5-7) to all Attributes
--------
{ Unique Modifier — Attribute }
+88(50-100) to all Attributes
{ Unique Modifier — Physical }
-4 Physical Damage taken from Attack Hits
`, {rarity: 'Unique', name: 'Astramentis', base: 'Stellar Amulet', mods: 3, first: '+6 to all Attributes', kinds: {implicit: 1, unique: 2}}, 'u:Astramentis');

item('unique ring, corrupted and mirrored', `Item Class: Rings
Rarity: Unique
Andvarius
Gold Ring
--------
Requires: Level 40
--------
Item Level: 66
--------
12% increased Rarity of Items found (implicit)
--------
64% increased Rarity of Items found
+10 to Dexterity
-20% to all Elemental Resistances
--------
Corrupted
--------
Mirrored
`, {rarity: 'Unique', name: 'Andvarius', corrupted: true, mirrored: true, mods: 4}, 'u:Andvarius');

item('unique belt, a skill it grants', `Item Class: Belts
Rarity: Unique
Bijouborne
Double Belt
--------
Requires: Level 44
--------
Item Level: 60
--------
Has 2 Charm Slots (implicit)
--------
Grants Skill: Level 11 Cast on Charm Use
--------
24% increased Charm Charges gained
+71 to maximum Mana
21% reduced Charm Effect Duration
+2 Charm Slots
`, {rarity: 'Unique', name: 'Bijouborne', grants: ['Level 11 Cast on Charm Use'], mods: 5}, 'u:Bijouborne');

item('unique tablet the index keeps with the uniques', `Item Class: Tablet
Rarity: Unique
Clear Skies
Delirium Tablet
--------
Requires: Level 65
--------
Item Level: 78
--------
Adds a Mirror of Delirium to a Map (implicit)
10 uses remaining (implicit)
--------
Delirium Fog in your Maps never dissipates
Delirium Fog in Map applies 6% reduced Deliriousness to Players
--------
Can be used in a personal Map Device to add modifiers to a Map.
`, {rarity: 'Unique', name: 'Clear Skies', base: 'Delirium Tablet', mods: 4, kinds: {implicit: 2, unique: 2}, text: 1}, 'u:Clear Skies');

item('unique tablet the index keeps on the Atlas', `Item Class: Tablet
Rarity: Unique
Forgotten By Time
Expedition Tablet
--------
Item Level: 81
--------
{ Implicit Modifier }
Adds a Kalguuran Expedition to a Map
5 uses remaining
--------
{ Unique Modifier }
Expedition Monsters in your Maps spawn with half of their Life missing
{ Unique Modifier }
Runic Monsters in your Maps are Duplicated
--------
Can be used in a personal Map Device to add modifiers to a Map.
`, {rarity: 'Unique', name: 'Forgotten By Time', base: 'Expedition Tablet', mods: 4}, 'a:Forgotten By Time');

item('unique flask', `Item Class: Life Flasks
Rarity: Unique
Blood of the Warrior
Gargantuan Life Flask
--------
Recovers 71 Life over 6.80 Seconds
Consumes 10 of 75 Charges on use
Currently has 75 Charges
--------
Requires: Level 40
--------
Item Level: 68
--------
90% less Life Recovered
Effect is not removed when Unreserved Life is Filled
22% of Damage taken during effect Recouped as Life
Gain 4 Rage when Hit by an Enemy during effect
No Inherent loss of Rage during effect
31% increased Duration
--------
Right click to drink. Can only hold charges while in belt. Refill at Wells or by killing monsters.
`, {rarity: 'Unique', name: 'Blood of the Warrior', mods: 6, text: 1}, 'u:Blood of the Warrior');

item('unique charm', `Item Class: Charms
Rarity: Unique
Arakaali's Gift
Antidote Charm
--------
Lasts 3.00 Seconds
Consumes 20 of 40 Charges on use
Currently has 40 Charges
--------
Requires: Level 24
--------
Item Level: 50
--------
Used when you become Poisoned (implicit)
--------
Recover Life equal to 17% of Mana Flask's Recovery Amount when used
Recover Mana equal to 19% of Life Flask's Recovery Amount when used
--------
Used automatically when condition is met. Can only hold charges while in belt. Refill at Wells or by killing monsters.
`, {rarity: 'Unique', name: "Arakaali's Gift", mods: 3, kinds: {implicit: 1, unique: 2}}, "u:Arakaali's Gift");

item('unique relic', `Item Class: Relics
Rarity: Unique
The Burden of Leadership
Tapestry Relic
--------
Requires: Level 64
--------
Item Level: 70
--------
Zarokh, the Temporal drops Sekhema's Resolve
Rooms are unknown on the Trial Map
This item is destroyed when applied to a Trial
--------
Place this item on the Relic Altar at the start of the Trial of the Sekhemas
`, {rarity: 'Unique', name: 'The Burden of Leadership', mods: 3, text: 1}, 'u:The Burden of Leadership');

item('unique jewel', `Item Class: Jewels
Rarity: Unique
Against the Darkness
Time-Lost Diamond
--------
Requires: Level 20
--------
Item Level: 82
--------
Notable Passive Skills in Radius also grant 8% increased Life Recovery rate
Notable Passive Skills in Radius also grant 3% increased Skill Speed
--------
Place into an allocated Jewel Socket on the Passive Skill Tree. Right click to remove from the Socket.
`, {rarity: 'Unique', name: 'Against the Darkness', base: 'Time-Lost Diamond', mods: 2, text: 1}, 'u:Against the Darkness');

item('unique, unidentified: its base', `Item Class: Boots
Rarity: Unique
Cinched Boots
--------
Evasion Rating: 181
--------
Requires: Level 65, 86 Dex
--------
Item Level: 79
--------
Unidentified
`, {rarity: 'Unique', name: null, base: 'Cinched Boots', unidentified: true, mods: 0, own: false}, 'b:Cinched Boots');

item('unique sceptre, advanced, a granted skill', `Item Class: Sceptres
Rarity: Unique
Font of Power
Omen Sceptre
--------
Spirit: 142 (augmented)
--------
Requires: Level 16, 12 Str, 25 Int
--------
Item Level: 44
--------
{ Implicit Modifier }
Grants Skill: Malice
--------
{ Unique Modifier — Spirit }
42(30-50)% increased Spirit
{ Unique Modifier — Mana }
+51(40-60) to maximum Mana
{ Unique Modifier — Mana }
27(20-30)% increased Mana Regeneration Rate
`, {rarity: 'Unique', name: 'Font of Power', mods: 4, req: {Level: 16, Str: 12, Int: 25}}, 'u:Font of Power');

item('unique helmet, twice corrupted', `Item Class: Helmets
Rarity: Unique
Alpha's Howl
Armoured Cap
--------
Evasion Rating: 571 (augmented)
--------
Requires: Level 65, 91 Dex
--------
Item Level: 84
--------
92% increased Evasion Rating
+100 to Spirit
+61% to Cold Resistance
Presence Radius is doubled
--------
Twice Corrupted
`, {rarity: 'Unique', name: "Alpha's Howl", corrupted: true, twice: true, mods: 4}, "u:Alpha's Howl | Armoured Cap");

item('unique on a runemastered base', `Item Class: Body Armours
Rarity: Unique
Apron of Emiran
Runemastered Hermit Garb
--------
Evasion Rating: 31 (augmented)
Energy Shield: 31 (augmented)
Runic Ward: 40
--------
Requires: Level 38
--------
Item Level: 52
--------
44% increased Evasion and Energy Shield
+14 to Dexterity
Bleeding you inflict is Aggravated
52% reduced Duration of Bleeding on You
`, {rarity: 'Unique', name: 'Apron of Emiran', base: 'Runemastered Hermit Garb', mods: 4}, 'u:Apron of Emiran | Runemastered Hermit Garb');

item('unique on a plain base another variant shares', `Item Class: Body Armours
Rarity: Unique
Apron of Emiran
Hermit Garb
--------
Evasion Rating: 23
Energy Shield: 23
--------
Item Level: 11
--------
36% increased Evasion and Energy Shield
+12 to Dexterity
Bleeding you inflict is Aggravated
45% reduced Duration of Bleeding on You
`, {rarity: 'Unique', name: 'Apron of Emiran', base: 'Hermit Garb', mods: 4}, 'u:Apron of Emiran');

item('unique quarterstaff, quality', `Item Class: Quarterstaves
Rarity: Unique
Collapsing Horizon
Wyrm Quarterstaff
--------
Quality: +20% (augmented)
Physical Damage: 68-113 (augmented)
Critical Hit Chance: 18.00% (augmented)
Attacks per Second: 1.40
--------
Requires: Level 65, 89 Dex, 36 Int
--------
Item Level: 81
--------
+8% to Critical Hit Chance
+3 to Level of all Elemental Skills
100% increased Elemental Damage
Trigger skills refund half of Energy spent
`, {rarity: 'Unique', name: 'Collapsing Horizon', quality: 20, mods: 4}, 'u:Collapsing Horizon');

item('unique buckler, a skill line inside the modifiers', `Item Class: Bucklers
Rarity: Unique
Bloodbarrier
Iron Buckler
--------
Block chance: 23%
Evasion Rating: 42
--------
Requires: Level 16, 25 Dex
--------
Item Level: 30
--------
Grants Skill: Parry
--------
13% increased Block chance
+15% to Chaos Resistance
7 Life Regeneration per second
Inflict Corrupted Blood for 5 seconds on Block, dealing 50% of
your maximum Life as Physical damage per second
`, {rarity: 'Unique', name: 'Bloodbarrier', grants: ['Parry'], mods: 5}, 'u:Bloodbarrier | Iron Buckler');

item('unique jewel, a ranged line with negative ends', `Item Class: Jewels
Rarity: Unique
Controlled Metamorphosis
Diamond
--------
Item Level: 80
--------
{ Unique Modifier }
Only affects Passives in Medium-Large Ring
{ Unique Modifier }
Passives in Radius can be Allocated without being connected to your tree
{ Unique Modifier — Elemental, Resistance }
-12(-20--5)% to all Elemental Resistances
--------
Place into an allocated Jewel Socket on the Passive Skill Tree. Right click to remove from the Socket.
`, {rarity: 'Unique', name: 'Controlled Metamorphosis', mods: 3, last: '-12% to all Elemental Resistances'}, 'u:Controlled Metamorphosis');

/* ---------- currency and anything else that stacks ---------- */
item('currency stack', `Item Class: Stackable Currency
Rarity: Currency
Exalted Orb
--------
Stack Size: 12/20
--------
Augments a Rare item with a new random modifier
--------
Right click this item then left click a Rare item to apply it. Rare items can have up to three prefix and three suffix modifiers.
Shift click to unstack.
`, {rarity: 'Currency', name: 'Exalted Orb', stack: {n: 12, max: 20}, mods: 0, own: true}, 'c:Exalted Orb');

item('currency, one in the stack', `Item Class: Stackable Currency
Rarity: Currency
Divine Orb
--------
Stack Size: 1/20
--------
Randomises the numeric values of the random modifiers on an item
--------
Right click this item then left click a Magic, Rare or Unique item to apply it.
`, {name: 'Divine Orb', stack: {n: 1, max: 20}}, 'c:Divine Orb');

item('currency, Windows line endings', 'Item Class: Stackable Currency\r\nRarity: Currency\r\nChaos Orb\r\n--------\r\nStack Size: 7/20\r\n--------\r\nRemoves a random modifier and augments a Rare item with a new random modifier\r\n--------\r\nRight click this item then left click a Rare item to apply it.\r\n',
  {name: 'Chaos Orb', stack: {n: 7, max: 20}}, 'c:Chaos Orb');

item('currency, a full stack of a common orb', `Item Class: Stackable Currency
Rarity: Currency
Orb of Alchemy
--------
Stack Size: 20/20
--------
Upgrades a Normal item to a Rare item with four random modifiers
--------
Right click this item then left click a Normal item to apply it.
`, {name: 'Orb of Alchemy', stack: {n: 20, max: 20}}, 'c:Orb of Alchemy');

item('currency, a big stack with a thousands comma', `Item Class: Stackable Currency
Rarity: Currency
Scroll of Wisdom
--------
Stack Size: 1,240/5,000
--------
Identifies an item
--------
Right click this item then left click an unidentified item to apply it.
`, {name: 'Scroll of Wisdom', stack: {n: 1240, max: 5000}}, 'c:Scroll of Wisdom');

item('essence', `Item Class: Stackable Currency
Rarity: Currency
Essence of Enhancement
--------
Stack Size: 3/10
--------
Upgrades a normal item to Magic with one Defence modifier
--------
Right click this item then left click a normal item to apply it.
`, {name: 'Essence of Enhancement', stack: {n: 3, max: 10}}, 'c:Essence of Enhancement');

item('greater essence', `Item Class: Stackable Currency
Rarity: Currency
Greater Essence of Command
--------
Stack Size: 1/10
--------
Upgrades a Magic item to Rare with one Aura modifier
--------
Right click this item then left click a Magic item to apply it.
`, {name: 'Greater Essence of Command'}, 'c:Greater Essence of Command');

item('alloy, lines naming item kinds', `Item Class: Stackable Currency
Rarity: Currency
Swift Alloy
--------
Stack Size: 6/10
--------
Removes a random modifier and augments a Rare item with a new guaranteed modifier
Gloves: (9-12)% increased Cast Speed
Ring: (7-9)% increased Attack Speed
--------
Right click this item then left click a Rare item to apply it.
Shift click to unstack.
`, {name: 'Swift Alloy', stack: {n: 6, max: 10}, mods: 0}, 'c:Swift Alloy');

item('omen', `Item Class: Omen
Rarity: Currency
Omen of Light
--------
Stack Size: 1/10
--------
While this item is active in your inventory your next Exalted Orb will add a modifier with the highest level
--------
Right click this item to activate or deactivate it.
`, {name: 'Omen of Light', stack: {n: 1, max: 10}}, 'c:Omen of Light');

item('omen, a different class line', `Item Class: Stackable Currency
Rarity: Currency
Omen of Whittling
--------
Stack Size: 2/10
--------
While this item is active in your inventory your next Chaos Orb will remove the lowest level modifier
--------
Right click this item to activate or deactivate it.
`, {name: 'Omen of Whittling'}, 'c:Omen of Whittling');

item('soul core', `Item Class: Socketable
Rarity: Currency
Atziri's Soul Core of Alacrity
--------
Stack Size: 1/10
--------
Martial Weapons: 6% increased Attack Speed
Armour: 4% increased Movement Speed
--------
Place into an empty Augment Socket in Martial Weapons or Armour to apply its effect. Cannot be removed.
`, {name: "Atziri's Soul Core of Alacrity", stack: {n: 1, max: 10}}, "c:Atziri's Soul Core of Alacrity");

item('rune', `Item Class: Socketable
Rarity: Currency
Iron Rune
--------
Stack Size: 14/20
--------
Martial Weapons: 14% increased Physical Damage
Armour: 14% increased Armour, Evasion and Energy Shield
--------
Place into an empty Augment Socket in Martial Weapons or Armour to apply its effect. Cannot be removed.
`, {name: 'Iron Rune', stack: {n: 14, max: 20}}, 'c:Iron Rune');

item('greater rune', `Item Class: Socketable
Rarity: Currency
Greater Rune of Leadership
--------
Stack Size: 1/20
--------
Martial Weapons: +1 to Level of all Minion Skills
--------
Place into an empty Augment Socket in Martial Weapons or Armour to apply its effect. Cannot be removed.
`, {name: 'Greater Rune of Leadership'}, 'c:Greater Rune of Leadership');

item('ancient rune the index keeps as a card', `Item Class: Socketable
Rarity: Currency
Ancient Rune of Animosity
--------
Stack Size: 1/20
--------
Talisman: Gain 2 Druidic Prowess when you Heavy Stun a Rare or Unique Enemy
--------
Place into an empty Augment Socket in a Talisman to apply its effect. Cannot be removed.
`, {name: 'Ancient Rune of Animosity'}, 'c:Ancient Rune of Animosity');

item('uncut skill gem', `Item Class: Uncut Skill Gems
Rarity: Currency
Uncut Skill Gem (Level 19)
--------
Creates a Skill Gem or Level an existing gem to level 19
--------
Right Click to engrave a Skill Gem.
`, {name: 'Uncut Skill Gem (Level 19)', stack: null}, 'c:Uncut Skill Gem (Level 19)');

item('uncut spirit gem', `Item Class: Uncut Spirit Gems
Rarity: Currency
Uncut Spirit Gem (Level 16)
--------
Creates a Persistent Buff Skill Gem or Level an existing gem to Level 16
--------
Right Click to engrave a Persistent Buff Skill Gem.
`, {name: 'Uncut Spirit Gem (Level 16)'}, 'c:Uncut Spirit Gem (Level 16)');

item('uncut support gem', `Item Class: Uncut Support Gems
Rarity: Currency
Uncut Support Gem (Level 3)
--------
Creates a Support Gem
--------
Right Click to engrave a Support Gem.
`, {name: 'Uncut Support Gem (Level 3)'}, 'c:Uncut Support Gem (Level 3)');

item('liquid emotion', `Item Class: Stackable Currency
Rarity: Currency
Ancient Liquid Envy
--------
Stack Size: 2/10
--------
Can be used to Instill an Amulet or Passive Skill Tree Jewel
--------
Right click this item then left click an Amulet to apply it.
`, {name: 'Ancient Liquid Envy', stack: {n: 2, max: 10}}, 'c:Ancient Liquid Envy');

item('catalyst', `Item Class: Stackable Currency
Rarity: Currency
Flesh Catalyst
--------
Stack Size: 5/20
--------
Adds quality that enhances Life Modifiers on a Ring or Amulet
--------
Right click this item then left click a Ring or Amulet to apply it.
`, {name: 'Flesh Catalyst', stack: {n: 5, max: 20}}, 'c:Flesh Catalyst');

item('fragment', `Item Class: Map Fragments
Rarity: Normal
Cowardly Fate
--------
Stack Size: 1/10
--------
Can be used in a personal Map Device.
`, {rarity: 'Normal', name: 'Cowardly Fate', stack: {n: 1, max: 10}}, 'c:Cowardly Fate');

item('breachstone', `Item Class: Map Fragments
Rarity: Normal
Breachstone
--------
Stack Size: 1/10
--------
Can be used in a personal Map Device.
`, {name: 'Breachstone'}, 'c:Breachstone');

item('idol', `Item Class: Stackable Currency
Rarity: Currency
Cat Idol
--------
Stack Size: 1/10
--------
Can be used to Imbue an item.
`, {name: 'Cat Idol'}, 'c:Cat Idol');

item('abyssal bone', `Item Class: Stackable Currency
Rarity: Currency
Ancient Rib
--------
Stack Size: 3/10
--------
Desecrates a Rare Body Armour with a new modifier
--------
Right click this item then left click a Rare Body Armour to apply it.
`, {name: 'Ancient Rib', stack: {n: 3, max: 10}}, 'c:Ancient Rib');

item('perfect orb', `Item Class: Stackable Currency
Rarity: Currency
Perfect Exalted Orb
--------
Stack Size: 1/20
--------
Augments a Rare item with a new random modifier with a minimum modifier level of 50
--------
Right click this item then left click a Rare item to apply it.
`, {name: 'Perfect Exalted Orb'}, 'c:Perfect Exalted Orb');

item('the mirror', `Item Class: Stackable Currency
Rarity: Currency
Mirror of Kalandra
--------
Stack Size: 1/10
--------
Creates a mirrored copy of an item
--------
Right click this item then left click an item to apply it.
`, {name: 'Mirror of Kalandra'}, 'c:Mirror of Kalandra');

item('expedition flux', `Item Class: Stackable Currency
Rarity: Currency
Thaumaturgic Flux (Level 16)
--------
Stack Size: 1/10
--------
Right click this item then left click a Gem to apply it.
`, {name: 'Thaumaturgic Flux (Level 16)'}, 'c:Thaumaturgic Flux (Level 16)');

/* ---------- gems ---------- */
item('skill gem, quality, two requirement lines', `Item Class: Skill Gems
Rarity: Gem
Herald of Ice
--------
Buff, Attack, Persistent, AoE, Cold, Herald, Payoff
Level: 18
Quality: +20% (augmented)
--------
Requires: Level 78, 97 Dex, 97 Int
Requires: Any Martial Weapon
--------
Sockets: G G G G
--------
While active, Shattering an enemy with an Attack Hit will cause an icy explosion that deals Attack damage to surrounding enemies.
--------
Reservation: 30 Spirit
--------
Skills can be managed in the Skills Panel.
`, {rarity: 'Gem', name: 'Herald of Ice', level: 18, quality: 20, sockets: ['G', 'G', 'G', 'G'], mods: 0, own: true, req: {Level: 78, Dex: 97, Int: 97}}, 'g:SkillGemHeraldOfIce');

item('skill gem', `Item Class: Skill Gems
Rarity: Gem
Untether
--------
Spell, AoE, Physical, Duration
Level: 11
Cost: 21 Mana
Cast Time: 1.00 sec
--------
Requires: Level 38, 71 Int
--------
Plant a seed of Abyssal Energy on the enemy's heart.
--------
Skills can be managed in the Skills Panel.
`, {name: 'Untether', level: 11}, 'g:SkillGemAbyssalLivingBomb');

item('support gem', `Item Class: Support Gems
Rarity: Gem
Acrimony
--------
Support
Level: 1
--------
Supports any skill that deals damage.
--------
Skills can be managed in the Skills Panel.
`, {name: 'Acrimony', level: 1}, 'g:SupportGemAcrimony');

item('spirit gem', `Item Class: Skill Gems
Rarity: Gem
Hollow Form
--------
Buff, Persistent
Level: 1
Reservation: 30 Spirit
--------
Skills can be managed in the Skills Panel.
`, {name: 'Hollow Form'}, 'g:SkillGemAscendancyHollowForm');

item('lineage support gem', `Item Class: Support Gems
Rarity: Gem
Arjun's Medal
--------
Support, Lineage
Level: 1
--------
Requires: Level 65
--------
Skills can be managed in the Skills Panel.
`, {name: "Arjun's Medal"}, 'g:SupportGemAmmoConservationFour');

item('gem copied before the item class line', `Rarity: Gem
Mirage Archer
--------
Buff, Persistent, Trigger, Duration, Meta
Level: 14
Reservation: 60 Spirit
--------
Requires: Level 58, 103 Dex
--------
Sockets: G G G G
--------
While active, dodge rolling will create a Mirage that uses socketed ranged Attacks for a short duration, then vanish.
`, {cls: null, rarity: 'Gem', name: 'Mirage Archer', level: 14}, 'g:SkillGemMirageArcher');

/* ---------- rares ---------- */
item('rare ring, plain', `Item Class: Rings
Rarity: Rare
Doom Loop
Sapphire Ring
--------
Requires: Level 44
--------
Item Level: 74
--------
+26% to Cold Resistance (implicit)
--------
+64 to maximum Life
14% increased Rarity of Items found
+22 to Strength
Leech 7.3% of Physical Attack Damage as Life
+12 to Dexterity and Intelligence
`, {rarity: 'Rare', name: 'Doom Loop', base: 'Sapphire Ring', ilvl: 74, mods: 6, kinds: {implicit: 1, explicit: 5},
  first: '+26% to Cold Resistance', shown0: '+26% to Cold Resistance (implicit)', own: false}, 'b:Sapphire Ring');

item('rare boots, advanced text', `Item Class: Boots
Rarity: Rare
Havoc Stride
Tasalian Greaves
--------
Armour: 402 (augmented)
Evasion Rating: 366 (augmented)
--------
Requires: Level 80, 79 Str, 79 Dex
--------
Sockets: S S
--------
Item Level: 82
--------
{ Prefix Modifier "Stout" (Tier: 4) — Life }
+66(60-69) to maximum Life
{ Prefix Modifier "Buttressed" (Tier: 2) — Defences, Armour }
61(56-67)% increased Armour
{ Suffix Modifier "of the Panther" (Tier: 3) — Attribute }
+23(21-24) to Dexterity
{ Suffix Modifier "of Curvation" (Tier: 1) — Defences }
Gain Deflection Rating equal to 16(15-17)% of Evasion Rating
--------
Corrupted
`, {rarity: 'Rare', name: 'Havoc Stride', base: 'Tasalian Greaves', ilvl: 82, corrupted: true, sockets: ['S', 'S'], mods: 4,
  first: '+66 to maximum Life', sides: ['prefix', 'prefix', 'suffix', 'suffix'], tiers: [4, 2, 3, 1], affix0: 'Stout'}, 'b:Tasalian Greaves');

item('rare body armour, plain, an implicit, corrupted', `Item Class: Body Armours
Rarity: Rare
Grim Shell
Warlord Cuirass
--------
Quality: +20% (augmented)
Armour: 1103 (augmented)
--------
Requires: Level 80, 206 Str
--------
Sockets: S S
--------
Item Level: 81
--------
+21% of Armour also applies to Elemental Damage (implicit)
--------
+91 to maximum Life
30% increased Evasion Rating
+45 to Evasion Rating
+22 to Strength
4% increased Skill Speed
--------
Corrupted
`, {rarity: 'Rare', base: 'Warlord Cuirass', quality: 20, corrupted: true, mods: 6}, 'b:Warlord Cuirass');

item('rare bow, advanced, runes, desecrated and crafted', `Item Class: Bows
Rarity: Rare
Oblivion Branch
Obliterator Bow
--------
Quality: +20% (augmented)
Physical Damage: 288-534 (augmented)
Critical Hit Chance: 8.45% (augmented)
Attacks per Second: 1.27 (augmented)
--------
Requires: Level 78, 163 Dex
--------
Sockets: S S S
--------
Item Level: 80
--------
38% increased Physical Damage (rune)
Bow Attacks fire an additional Arrow (rune)
--------
{ Implicit Modifier }
50% reduced Projectile Range
--------
{ Prefix Modifier "Gleaming" (Tier: 3) — Damage, Physical, Attack }
Adds 12(10-15) to 22(18-26) Physical Damage
{ Desecrated Prefix Modifier "Unleashed" (Tier: 2) — Damage, Elemental, Attack }
68(63-72)% increased Elemental Damage with Attacks
{ Suffix Modifier "of the Panther" (Tier: 3) — Attribute }
+22(21-24) to Dexterity
{ Crafted Suffix Modifier "of Calamity" (Tier: 3) — Attack, Critical }
+3.45(3.11-3.8)% to Critical Hit Chance
`, {rarity: 'Rare', base: 'Obliterator Bow', sockets: ['S', 'S', 'S'], mods: 7, runes: 2,
  kinds: {rune: 2, implicit: 1, explicit: 2, desecrated: 1, crafted: 1}, last: '+3.45% to Critical Hit Chance'}, 'b:Obliterator Bow');

item('rare crossbow, advanced, fractured, an enchant', `Item Class: Crossbows
Rarity: Rare
Storm Core
Gemini Crossbow
--------
Physical Damage: 74-231 (augmented)
Critical Hit Chance: 5.00%
Attacks per Second: 1.89 (augmented)
Reload Time: 0.93 (augmented)
--------
Requires: Level 78, 89 Str, 89 Dex
--------
Item Level: 80
--------
45% increased Elemental Damage with Attacks (enchant)
--------
{ Implicit Modifier — Attack }
Loads an additional bolt
--------
{ Fractured Prefix Modifier "Gleaming" (Tier: 2) — Damage, Physical, Attack }
Adds 18(14-21) to 31(25-37) Physical Damage
{ Prefix Modifier "Steady" (Tier: 1) — Attack }
+201(168-236) to Accuracy Rating
{ Suffix Modifier "of Fury" (Tier: 1) — Damage, Critical }
+18(17-19)% to Critical Damage Bonus
--------
Fractured Item
`, {rarity: 'Rare', base: 'Gemini Crossbow', fractured: true, mods: 5, kinds: {enchant: 1, implicit: 1, fractured: 1, explicit: 2},
  shownF: 'Adds 18 to 31 Physical Damage (fractured)'}, 'b:Gemini Crossbow');

item('rare wand, plain, a granted skill', `Item Class: Wands
Rarity: Rare
Hate Song
Twisted Wand
--------
Requires: Level 65, 119 Int
--------
Item Level: 77
--------
Grants Skill: Level 17 Chaos Bolt
--------
+71 to maximum Mana
Gain 23% of Damage as Extra Lightning Damage
+22 to Intelligence
+3 to Level of all Lightning Spell Skills
`, {rarity: 'Rare', base: 'Twisted Wand', grants: ['Level 17 Chaos Bolt'], mods: 4}, 'b:Twisted Wand');

item('rare amulet', `Item Class: Amulets
Rarity: Rare
Soul Clasp
Stellar Amulet
--------
Requires: Level 60
--------
Item Level: 79
--------
+6 to all Attributes (implicit)
--------
+62 to maximum Life
13% increased Rarity of Items found
+23 to Strength
11.2 Life Regeneration per second
5% increased Skill Speed
`, {rarity: 'Rare', base: 'Stellar Amulet', mods: 6}, 'b:Stellar Amulet');

item('rare belt, a reduced line', `Item Class: Belts
Rarity: Rare
Kraken Cord
Utility Belt
--------
Requires: Level 55
--------
Item Level: 70
--------
20% of Flask Recovery applied Instantly (implicit)
--------
+77 to maximum Life
18% increased Charm Effect Duration
+22 to Strength
18% reduced Flask Charges used
`, {rarity: 'Rare', base: 'Utility Belt', mods: 5, last: '18% reduced Flask Charges used'}, 'b:Utility Belt');

item('rare jewel', `Item Class: Jewels
Rarity: Rare
Soul Bliss
Emerald
--------
Item Level: 26
--------
2% increased Accuracy Rating
3% increased Effect of your Mark Skills
5% increased chance to inflict Ailments
3% increased Freeze Threshold
--------
Place into an allocated Jewel Socket on the Passive Skill Tree. Right click to remove from the Socket.
`, {rarity: 'Rare', base: 'Emerald', mods: 4, text: 1}, 'b:Emerald');

item('rare quarterstaff, advanced', `Item Class: Quarterstaves
Rarity: Rare
Beast Pillar
Aegis Quarterstaff
--------
Physical Damage: 71-130 (augmented)
Critical Hit Chance: 10.00%
Attacks per Second: 1.60 (augmented)
--------
Requires: Level 79, 104 Dex, 42 Int
--------
Item Level: 80
--------
{ Implicit Modifier — Block }
+15(12-18)% to Block chance
--------
{ Prefix Modifier "Gleaming" (Tier: 1) — Damage, Physical, Attack }
Adds 18(14-21) to 30(25-37) Physical Damage
{ Prefix Modifier "Consistent" (Tier: 1) — Attack }
+151(124-167) to Accuracy Rating
{ Suffix Modifier "of Acclaim" (Tier: 1) — Attack, Speed }
18(17-19)% increased Attack Speed
`, {rarity: 'Rare', base: 'Aegis Quarterstaff', mods: 4, first: '+15% to Block chance'}, 'b:Aegis Quarterstaff');

item('rare focus', `Item Class: Foci
Rarity: Rare
Mind Veil
Sacred Focus
--------
Energy Shield: 104 (augmented)
--------
Requires: Level 75, 136 Int
--------
Item Level: 81
--------
+72 to maximum Mana
59% increased Cold Damage
+23 to Intelligence
43% increased Critical Hit Chance for Spells
`, {rarity: 'Rare', base: 'Sacred Focus', mods: 4}, 'b:Sacred Focus');

item('rare quiver', `Item Class: Quivers
Rarity: Rare
Eagle Fletch
Visceral Quiver
--------
Requires: Level 65
--------
Item Level: 75
--------
24% increased Critical Hit Chance for Attacks (implicit)
--------
Adds 6 to 11 Physical Damage to Attacks
Adds 1 to 30 Lightning damage to Attacks
+22 to Dexterity
27% increased Critical Hit Chance for Attacks
`, {rarity: 'Rare', base: 'Visceral Quiver', mods: 5}, 'b:Visceral Quiver');

item('rare, unidentified: its base, nothing to list', `Item Class: Wands
Rarity: Rare
Volatile Wand
--------
Requires: 113 Intelligence
--------
Item Level: 69
--------
Grants Skill: Level 15 Volatile Dead
--------
Unidentified
`, {rarity: 'Rare', name: null, base: 'Volatile Wand', unidentified: true, mods: 0, req: {Int: 113}}, 'b:Volatile Wand');

item('rare shield, a Grants Skill line', `Item Class: Shields
Rarity: Rare
Rune Bastion
Tawhoan Tower Shield
--------
Block chance: 26%
Armour: 331 (augmented)
--------
Requires: Level 80, 148 Str
--------
Item Level: 82
--------
Grants Skill: Raise Shield
--------
+79 to maximum Life
21% increased Energy Shield Recharge Rate
+23 to Strength
+2% to maximum Block chance
`, {rarity: 'Rare', base: 'Tawhoan Tower Shield', grants: ['Raise Shield'], mods: 4}, 'b:Tawhoan Tower Shield');

/* ---------- magic and normal ---------- */
item('magic ring: its base inside its name', `Item Class: Rings
Rarity: Magic
Sapphire Ring of the Gorilla
--------
Requires: Level 44
--------
Item Level: 60
--------
+24% to Cold Resistance (implicit)
--------
+22 to Strength
`, {rarity: 'Magic', name: 'Sapphire Ring of the Gorilla', base: null, mods: 2, own: false}, 'b:Sapphire Ring');

item('magic flask, advanced', `Item Class: Life Flasks
Rarity: Magic
Effervescent Ultimate Life Flask of the Distiller
--------
Recovers 920 Life over 3 Seconds
Consumes 7 (augmented) of 75 Charges on use
Currently has 0 Charges
--------
Requirements:
Level: 60
--------
Item Level: 66
--------
{ Prefix Modifier "Effervescent" (Tier: 1) }
25(24-27)% of Recovery applied Instantly
{ Suffix Modifier "of the Distiller" (Tier: 1) }
25(26-24)% reduced Charges per use
--------
Right click to drink. Can only hold charges while in belt. Refill at Wells or by killing monsters.
`, {rarity: 'Magic', mods: 2, req: {Level: 60}, last: '25% reduced Charges per use', text: 1}, 'b:Ultimate Life Flask');

item('magic charm', `Item Class: Charms
Rarity: Magic
Examiner's Stone Charm of the Bountiful
--------
Lasts 3.60 (augmented) Seconds
Consumes 20 of 40 Charges on use
Currently has 40 Charges
--------
Requires: Level 16
--------
Item Level: 51
--------
Used when you become Stunned (implicit)
--------
28% increased Duration
50% increased Charges
--------
Used automatically when condition is met. Can only hold charges while in belt. Refill at Wells or by killing monsters.
`, {rarity: 'Magic', mods: 3, text: 1}, 'b:Stone Charm');

item('magic two hand mace', `Item Class: Two Hand Maces
Rarity: Magic
Crackling Temple Maul of the Brute
--------
Physical Damage: 35-72
Lightning Damage: 1-50 (lightning)
Critical Hit Chance: 5.00%
Attacks per Second: 1.20
--------
Requires: Level 28, 57 (augmented) Str
--------
Item Level: 32
--------
{ Prefix Modifier "Crackling" (Tier: 7) — Damage, Elemental, Lightning, Attack }
Adds 1(1-4) to 50(46-66) Lightning Damage
{ Suffix Modifier "of the Brute" (Tier: 8) — Attribute }
+8(5-8) to Strength
`, {rarity: 'Magic', mods: 2, req: {Level: 28, Str: 57}}, 'b:Temple Maul');

item('magic ring, unidentified with a tier', `Item Class: Rings
Rarity: Magic
Sapphire Ring
--------
Item Level: 54
--------
{ Implicit Modifier — Elemental, Cold, Resistance }
+23(20-30)% to Cold Resistance
--------
Unidentified (Tier 4)
`, {rarity: 'Magic', unidentified: true, unidTier: 4, mods: 1}, 'b:Sapphire Ring');

item('magic relic', `Item Class: Relics
Rarity: Magic
Revitalising Urn Relic of Flowing
--------
Item Level: 22
--------
Fountains have 6% chance to grant double Sacred Water
9% increased Honour restored
--------
Place this item on the Relic Altar at the start of the Trial of the Sekhemas
`, {rarity: 'Magic', mods: 2, text: 1}, 'b:Urn Relic');

item('magic ruby ring: the longer base wins', `Item Class: Rings
Rarity: Magic
Stout Ruby Ring
--------
Requires: Level 11
--------
Item Level: 20
--------
+25% to Fire Resistance (implicit)
--------
+64 to maximum Life
`, {rarity: 'Magic', mods: 2}, 'b:Ruby Ring');

item('normal helmet, superior', `Item Class: Helmets
Rarity: Normal
Superior Divine Crown
--------
Quality: +9% (augmented)
Armour: 174 (augmented)
Energy Shield: 60 (augmented)
--------
Requires: Level 75, 67 (augmented) Str, 67 (augmented) Int
--------
Item Level: 81
`, {rarity: 'Normal', name: 'Superior Divine Crown', base: 'Divine Crown', quality: 9, mods: 0, own: true}, 'b:Divine Crown');

item('normal amulet with its implicit', `Item Class: Amulets
Rarity: Normal
Crimson Amulet
--------
Item Level: 12
--------
2.1 Life Regeneration per second (implicit)
`, {rarity: 'Normal', base: 'Crimson Amulet', mods: 1, kinds: {implicit: 1}}, 'b:Crimson Amulet');

/* ---------- waystones and tablets ---------- */
item('rare waystone, plain', `Item Class: Waystones
Rarity: Rare
Putrid Navigation
Waystone (Tier 13)
--------
Waystone Tier: 13
Revives Available: 1 (augmented)
Monster Pack Size: +10% (augmented)
Magic Monsters: +33% (augmented)
Item Rarity: +38% (augmented)
--------
Item Level: 80
--------
Area has patches of Ignited Ground
33% increased number of Magic Monsters
Monsters have 276% increased Critical Hit Chance
Players have 40% less Recovery Rate of Life and Energy Shield
--------
Can be used in a Map Device, allowing you to enter a Map. Waystones can only be used once.
`, {rarity: 'Rare', name: 'Putrid Navigation', base: 'Waystone (Tier 13)', tier: 13, ilvl: 80, mods: 4, text: 1, props: 4, own: false}, 'a:Waystone (Tier 13)');

item('rare waystone, advanced, corrupted, no tier line', `Item Class: Waystones
Rarity: Rare
Blasted Control
Waystone (Tier 16)
--------
Revives Available: 0 (augmented)
Pack Size: +20% (augmented)
Rare Monsters: +71% (augmented)
--------
Item Level: 79
--------
{ Prefix Modifier "Painful" (Tier: 1) }
30(26-30)% increased Monster Damage
{ Prefix Modifier "Enduring" (Tier: 1) }
Monsters are Armoured
{ Suffix Modifier "of the Unwavering" (Tier: 1) }
Monsters have 71(70-79)% increased Ailment Threshold
Monsters have 72(70-79)% increased Stun Threshold
{ Suffix Modifier "of Drought" (Tier: 1) }
Players gain 33(35-30)% reduced Flask Charges
--------
Can be used in a Map Device, allowing you to enter a Map. Waystones can only be used once.
--------
Corrupted
`, {rarity: 'Rare', base: 'Waystone (Tier 16)', tier: 16, corrupted: true, mods: 5, last: 'Players gain 33% reduced Flask Charges'}, 'a:Waystone (Tier 16)');

item('normal waystone', `Item Class: Waystones
Rarity: Normal
Waystone (Tier 15)
--------
Waystone Tier: 15
--------
Item Level: 81
--------
Can be used in a Map Device, allowing you to enter a Map. Waystones can only be used once.
`, {rarity: 'Normal', base: 'Waystone (Tier 15)', tier: 15, mods: 0, own: true}, 'a:Waystone (Tier 15)');

item('magic waystone', `Item Class: Waystones
Rarity: Magic
Burning Waystone (Tier 10) of Frenzy
--------
Waystone Tier: 10
Magic Monsters: +20% (augmented)
--------
Item Level: 76
--------
Area has patches of Ignited Ground
20% increased number of Magic Monsters
--------
Can be used in a Map Device, allowing you to enter a Map. Waystones can only be used once.
`, {rarity: 'Magic', tier: 10, mods: 2}, 'a:Waystone (Tier 10)');

item('rare tablet, advanced', `Item Class: Tablet
Rarity: Rare
Mythic Anthem
Breach Tablet
--------
Item Level: 80
--------
{ Implicit Modifier }
Adds an Otherworldy Breach to a Map
10 uses remaining
--------
{ Prefix Modifier "Challenger's" (Tier: 1) }
Monsters have 15(10-15)% increased Effectiveness
{ Prefix Modifier "Treasurer's" (Tier: 1) }
Map contains 3(2-3) additional Rare Chests
{ Suffix Modifier "of the Hand" (Tier: 1) }
17(5-20)% increased Effectiveness of Rare Breach Monsters in Map
--------
Can be used in a personal Map Device to add modifiers to a Map.
`, {rarity: 'Rare', base: 'Breach Tablet', mods: 5, kinds: {implicit: 2, explicit: 3}, own: false}, 'a:Breach Tablet');

item('magic tablet, plain', `Item Class: Tablet
Rarity: Magic
Ritual Tablet of Sacrifice
--------
Item Level: 74
--------
Adds Ritual Altars to a Map (implicit)
10 uses remaining (implicit)
--------
Revived Monsters from Ritual Altars in your Maps have 14% increased chance to be Magic
--------
Can be used in a personal Map Device to add modifiers to a Map.
`, {rarity: 'Magic', mods: 3, kinds: {implicit: 2, explicit: 1}}, 'a:Ritual Tablet');

item('normal tablet', `Item Class: Tablet
Rarity: Normal
Expedition Tablet
--------
Item Level: 70
--------
Adds a Kalguuran Expedition to a Map (implicit)
10 uses remaining (implicit)
--------
Can be used in a personal Map Device to add modifiers to a Map.
`, {rarity: 'Normal', base: 'Expedition Tablet', mods: 2, own: true}, 'a:Expedition Tablet');

item('atlas key', `Item Class: Map Fragments
Rarity: Normal
Primary Calamity Fragment
--------
Stack Size: 1/10
--------
Can be used in a personal Map Device.
`, {name: 'Primary Calamity Fragment'}, 'a:Primary Calamity Fragment');

/* ---------- the tests ---------- */
test('at least 60 item texts', () => { assert.ok(T.length >= 60, T.length + ' texts'); });

for(const t of T){
  test(t.label, async () => {
    assert.equal(isItemText(t.text), true, 'is item text');
    const it = parse(t.text);
    assert.ok(it, 'parsed');
    const w = t.want;
    for(const f of ['cls', 'rarity', 'name', 'base', 'ilvl', 'quality', 'level', 'tier', 'corrupted', 'twice', 'mirrored',
      'unidentified', 'unidTier', 'fractured', 'note'])
      if(f in w) assert.deepEqual(it[f], w[f], f);
    for(const f of ['stack', 'sockets', 'grants']) if(f in w) assert.deepEqual(it[f], w[f], f);
    if('req' in w) for(const [k, v] of Object.entries(w.req)) assert.equal((it.req || {})[k], v, 'req ' + k);
    if('mods' in w) assert.equal(it.mods.length, w.mods, 'mods: ' + JSON.stringify(it.mods.map(m => m.text)));
    if('runes' in w) assert.equal(it.runes.length, w.runes, 'runes');
    if('text' in w) assert.equal(it.text.length, w.text, 'text: ' + JSON.stringify(it.text));
    if('props' in w) assert.deepEqual(typeof w.props === 'number' ? it.props.length : it.props, w.props, 'props');
    if('first' in w) assert.equal(it.mods[0].text, w.first, 'first line');
    if('last' in w) assert.equal(it.mods[it.mods.length - 1].text, w.last, 'last line');
    if('shown0' in w) assert.equal(shown(it.mods[0]), w.shown0, 'shown');
    if('shownF' in w) assert.equal(shown(it.mods.find(m => m.kind === 'fractured')), w.shownF, 'shown fractured');
    if('affix0' in w) assert.equal(it.mods[0].affix, w.affix0, 'affix');
    if('sides' in w) assert.deepEqual(it.mods.map(m => m.side), w.sides, 'sides');
    if('tiers' in w) assert.deepEqual(it.mods.map(m => m.tier), w.tiers, 'tiers');
    if('kinds' in w){
      const got = {};
      for(const m of it.mods) got[m.kind] = (got[m.kind] || 0) + 1;
      assert.deepEqual(got, w.kinds, 'kinds');
    }
    if('own' in w) assert.equal(ownPrice(it), w.own, 'priced as itself');
    // nothing shown to a player carries the advanced text's ranges or its tags
    for(const m of it.mods){
      assert.ok(!/\d\([+-]?\d/.test(m.text), 'no roll range in ' + m.text);
      assert.ok(!/Unscalable Value|\((implicit|enchant|rune|crafted|augmented)\)$/.test(m.text), 'no tag in ' + m.text);
    }
    assert.equal(await cardOf(it), t.card, 'card');
  });
}

/* ---------- what is not item text ---------- */
test('typing and other pastes are not item text', () => {
  for(const s of ['Headhunter', 'Rarity: Unique', 'Item Class: Boots\nRarity: Rare\nfoo', 'fireball',
    // Path of Building's item text: no line of dashes
    'Rarity: RARE\nDoom Loop\nSapphire Ring\nUnique ID: 1234\nItem Level: 74\nImplicits: 1\n+26% to Cold Resistance',
    '--------\nRarity: Rare', '', null, undefined, 42])
    assert.equal(isItemText(s), false, JSON.stringify(s));
  assert.equal(parse('Headhunter'), null);
});
test('a magic name is tried longest run first, never a run that starts or ends on "of" or "the"', () => {
  assert.deepEqual(runs('Stout Ruby Ring'), ['Stout Ruby Ring', 'Stout Ruby', 'Ruby Ring', 'Stout', 'Ruby', 'Ring']);
  assert.ok(runs('Sapphire Ring of the Gorilla').every(r => !/^(of|the)\b|\b(of|the)$/.test(r)));
  assert.equal(runs('Sapphire Ring of the Gorilla').indexOf('Sapphire Ring') < runs('Sapphire Ring of the Gorilla').indexOf('Ring'), true);
});
test('the plan: a unique by name first, then its base', () => {
  const it = parse(T.find(t => t.card === 'u:Headhunter').text);
  const p = plan(it);
  assert.deepEqual(p[0], ['u', 'Headhunter']);
  assert.ok(p.some(([k, n]) => k === 'b' && n === 'Heavy Belt'));
});
