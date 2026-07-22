# Phase 15 tuning evidence review: faucets vs sinks

Branch feature/professions-2-phase-15-deeds-polish, worktree
/home/fernandoramirez/Documents/woc-phase-15-deeds-polish, base release/v0.29.0
tip 560972962. Every number below is read from the live content tables or
measured by a seeded probe over the real resolution code; each row cites file
and symbol. The probe file (tests/__p15_tuning_probe.test.ts) was run and then
deleted; its outputs are quoted inline.

STOP-AND-ASK: none. Every sheet row carries a maintainer number.

## Method

- Recipe input value: the locked reagent-value rule from
  tests/recipe_economy.test.ts (reagentUnitValue: buyValue when finite and
  positive, else sellValue; inputValue: sum over reagents of count times unit).
- Recipe output value: result def sellValue times resultCount (same file).
- Craft gold fee: ceil(recipe.itemLevelBudget * CRAFT_GOLD_SINK_COPPER_PER_BUDGET),
  CRAFT_GOLD_SINK_COPPER_PER_BUDGET = 2 (src/sim/content/professions.ts, applied
  in src/sim/professions/crafting.ts).
- Empirical draws: `Rng` (src/sim/rng.ts) with fixed seeds, driving the real
  resolution functions (resolveCorpseFocusHarvest, rollCorpseMaterialRarity,
  disenchantYield), never re-implemented math.

## Row 1: Market fee (#2156) under the higher 12c material volume

Constants (src/sim/market.ts):

- MARKET_CUT = 0.05 (line 30, module const, surfaced on the wire as cutPct).
- Applied once, on a COMPLETED sale only: proceeds = floor(price * (1 - MARKET_CUT))
  (market.ts, the sale-completion arm). There is NO listing deposit and no cancel
  fee anywhere in market.ts; an unsold listing returns whole after
  MARKET_LISTING_DURATION (48 * 3600 sim seconds).
- MARKET_MAX_LISTINGS = 12 per seller, price clamped to [1, 5000000] copper.
- Behavior pin: tests/market.test.ts ("seller keeps proceeds less the cut",
  95 from a 100 listing); wire pin tests/market_view.test.ts (cutPct: 5).

Per-transaction sink sizes against typical material stacks (unit sellValue and
buyValue from src/sim/content/profession_items.ts via ITEMS):

| Listing (20 units) | Vendor floor | Plausible list price | 5 pct cut |
|---|---|---|---|
| copper_ore (sell 4) | 80c | 80 to 160c | 4 to 8c |
| iron_ore (sell 8) | 160c | 160 to 320c | 8 to 16c |
| thorium_ore (sell 15, vendor buy 60) | 300c | 300 to 1200c (vendor-buy parity is the ceiling) | 15 to 60c |
| sunpetal_herb (sell 40, vendor buy 160) | 800c | 800 to 3200c | 40 to 160c |
| venom_gland (sell 6) | 120c | 120 to 240c | 6 to 12c |

Notes:

- The Phase 13 typed disenchant secondaries (resonant_thread/hide/links/steel/
  timber, sell 40) are granted bind-on-trade
  (src/sim/professions/enchanting.ts resolveDisenchant: addItemInstance with
  { bindOnTrade: true }), so they cannot circulate through listings: the market
  fee never touches the typed-reagent economy by design.
- The slower 12c gain curve (gatherNodeGainMultiplier,
  src/sim/professions/gathering.ts) makes players harvest MORE units per skill
  point, so more raw material volume exists to trade; the 5 pct cut scales
  linearly with that volume. Per-stack sink sizes (4 to 160c) sit in the same
  order as the per-craft gold fee (16 to 40c per craft at wave-one budgets),
  which is coherent.

Conclusion: the flat 5 pct sale cut is an adequate, self-scaling recurring sink
for the higher material volume; no change recommended. If the maintainer later
wants a stronger market sink, a small listing deposit is the classic-era lever,
but nothing in the current data demands it.

## Row 2: Dust vs cheapest uncommon disenchant margin

Chain constants:

- Uncommon disenchants to arcane_dust (src/sim/professions/enchanting.ts
  DISENCHANT_MATERIAL_BY_QUALITY).
- Yield: disenchantYield = qualityIdx + floor(requiredLevel/10) + 1 + Bernoulli(0.5)
  (enchanting.ts). Probe: mean 3.502 over 100000 seeded draws (seed 12345) for
  eastbrook_ritual_vestments (uncommon, low level): range 3 to 4 dust.
- arcane_dust sellValue 6 (ITEMS).

Cheapest reliably craftable disenchantable (weapon or armor, uncommon) pieces,
input + craft fee (probe over ALL_RECIPES):

| Recipe | Total cost (copper) | Note |
|---|---|---|
| recipe_eastbrook_ritual_vestments | 31 (input 13 + fee 18) | LEGACY gold-positive member |
| recipe_eastbrook_druids_hide | 33 (15 + 18) | LEGACY member |
| recipe_eastbrook_warded_leggings | 44 (24 + 20) | LEGACY member |
| recipe_marshstalker_hood / _spaulders | 71 (39 + 32) | cheapest NON-legacy |

Margin arithmetic:

- Dust at vendor floor: 3.5 * 6 = 21c expected per disenchant. Even the 31c
  legacy vestments LOSE 10c disenchanting at vendor floor; the cheapest
  non-legacy piece loses 50c. Disenchanting is not a vendor printer.
- Break-even MARKET dust price: 31 / 3.5 = 8.9c per dust via the legacy
  vestments; 71 / 3.5 = 20.3c via the cheapest non-legacy piece. Dust demand is
  real (every base-tier enchant in src/sim/content/enchants.ts consumes dust),
  so dust trading above ~9c makes the legacy vestments a dust mill. The true
  printer in that recipe is still its VENDOR margin (output 210 vs cost 31, row
  6 of Deliverable B): fixing the recipe closes both leaks at once.
- Destruction context: each disenchant destroys a crafted piece (a real sink of
  the materials and the craft fee), so a modest positive market margin is
  tolerable and even desirable (it funds the enchanting economy).

NOT-IMPLEMENTED row status (maintainer evidence check): the approved
"uncommon 1 to 2 arcane_dust" row was deliberately NOT implemented. Verified in
code: resolveDisenchant's sub-rare arm is byte-identical legacy
(enchanting.ts: `count = disenchantYield(def, ctx.rng)` with the comment
"sub-rare (common/uncommon) stays byte-identical to today"), and
src/sim/professions/disenchant_reagents.ts's header repeats the ruling. Current
uncommon yield is therefore 3 to 4 dust, roughly 2x the approved row.

Recommendation (evidence only, no code change): keep the sub-rare arm
byte-identical for now and fix the legacy vestments recipe first (Deliverable
B, row 6): that alone moves the break-even dust price from 8.9c to the
non-legacy 20.3c. If live data later shows dust supply glut, landing the
approved 1 to 2 row moves break-even to 71 / 1.5 = 47.3c, a comfortable band.
Arbitrage stays a profession, not a printer, in either configuration.

## Row 3: Gland-to-pristine ratio

Mechanics (all cited):

- venomSac corpse family yields venom_gland plain (content/professions.ts
  HARVEST_COMPONENT_ITEMS) and pristine_venom_gland as the signed jackpot on a
  rare-or-better rarity roll, IN ADDITION to the plain grant
  (src/sim/interaction.ts harvestCorpse; content/professions.ts
  HARVEST_COMPONENT_SPECIMENS).
- Plain quantity: harvestTierQuantity over the focus tier roll, base weights
  [40, 30, 15, 10, 4, 1] poor..legendary (src/sim/professions/gathering.ts
  BASE_TIER_WEIGHTS), concentration bonus = tags minus chosen.
- Pristine chance per yield: rollCorpseMaterialRarity, baseline power 40
  (gathering.ts CORPSE_HARVEST_RARITY_BASELINE) over MATERIAL_RARITY_SHARE
  (rare 0.3, epic 0.08, legendary 0.02): P(rare or better) = 40 * 0.4 / 100
  = 16 pct exactly.
- Wave-one venomSac corpses carry two tags: zone1 spider ['venomSac','silk']
  (content/zone1.ts:204), zone2 ['venomSac','hide'] (content/zone2.ts:262).

Empirical probe (20000 seeded corpses, seed 424242, real
resolveCorpseFocusHarvest + rollCorpseMaterialRarity in interaction.ts draw
order, zone1 tag set):

| Scenario | Plain per corpse | Pristine per corpse | Ratio plain:pristine |
|---|---|---|---|
| Spread (no focus choice) | 2.094 | 0.1605 | 13.0 : 1 |
| Concentrate on venomSac | 3.104 | 0.1565 | 19.8 : 1 |

The community-reported "about 250 plain per 5 pristine" (50:1) does NOT match
the shipped mechanics: the measured ratio is 13 to 20 : 1. No code path found
that suppresses the specimen (the Phase 12 tool gate never fires in wave one:
MONSTER_MATERIAL_TIERS are all 1). The report most plausibly counts glands from
players below the signable roll's practical reach or mixes multiple farmers'
plain hauls against one player's pristines. No discrepancy to fix.

Sink side (probe scan of ALL_RECIPES reagents):

- venom_gland consumers: recipe_elixir_of_the_boar (2 per craft, rung 0),
  recipe_venomfire_elixir (3 per craft, rung 25), recipe_elixir_of_the_serpent
  (2 per craft, rung 50).
- pristine_venom_gland consumer: recipe_elixir_of_the_serpent (1 per craft).

Faucet vs sink: 2 to 3 plain glands per corpse vs 2 to 3 per elixir craft, so
one corpse roughly funds one consumable (destroyed on use): balanced. Pristine
at 0.16 per corpse vs 1 per serpent-elixir craft is about 6 corpses per craft:
healthy scarcity for a rare reagent. Conclusion: no change; the gland economy
is sound, and the ratio complaint is a perception issue, not a tuning issue.

## Row 4: Vendor buyback-plain wash (14b flag)

Code facts (src/sim/items.ts):

- sellItem pays def.sellValue per unit and records only { itemId, count } in
  the buyback ring (recordVendorBuyback): the instance payload is DROPPED at
  sell time. Its deny list checks def.noVendorSell, DEF-level def.soulbound,
  and quest kind ONLY: instance-level boundTo is NOT checked, so a bound
  commission piece can be vendor-sold today.
- buyBackItem charges exactly def.sellValue and re-grants via
  addItemSilent(itemId, 1): a PLAIN fungible copy.

Quantified wash: sell at V, buy back at the same V: spread 0 copper. The
returned copy has NO payload: boundTo gone, bindOnTrade gone, signer gone,
enchant gone, masterwork gone. Against the unbind ladder
(src/sim/professions/commission.ts UNBIND_FEE_BY_QUALITY_TIER = [2500, 10000,
40000] by def quality, clamp both ends):

| Piece def quality | Unbind fee | Wash cost | Bypass |
|---|---|---|---|
| common/uncommon | 2500c | 0c | full |
| rare | 10000c | 0c | full |
| epic+ | 40000c | 0c | full |

Scope of the leak: unbind clears boundTo ONLY and preserves every other marker
(commission.ts header), while the wash destroys the whole payload. So the wash
fully substitutes for the paid unbind exactly when the payload holds nothing
but the bond (bindOnTrade + boundTo), which is the COMMON commission case (a
non-masterwork, unenchanted commissioned piece). Worse than the fee bypass: the
wash strips bindOnTrade itself, so the laundered copy never re-binds, defeating
the Maker's Bond provenance permanently. Risk friction is minimal (the
12-entry buyback ring, VENDOR_BUYBACK_LIMIT, and standing at a vendor).

Recommendation (tuning-evidence input, no code change): close it by EITHER
(a) denying vendor sell for any inventory copy whose instance carries boundTo
(mirroring the trade gate, the smaller change), or (b) making the buyback ring
record and re-grant the exact instance payload. Option (a) is preferred:
it keeps buyback dumb and kills the 0c bypass of a 2500 to 40000c sink.
Related open interpretation, recorded not decided: PR #2293's body flags the
clamp-to-first-below fee reading (a commissioned COMMON piece pays the 2500
uncommon fee); noted here for the maintainer, no change.

## Row 5: Time-to-master vs targets

Constants used (all cited):

- Craft gain: CRAFT_SKILL_GAIN = 1 per successful craft
  (src/sim/professions/crafting.ts) times the four-state curve 1 / 0.5 / 0.25 / 0
  (src/sim/professions/wheel.ts tierProgressMultiplier,
  REDUCED_TIER_MULTIPLIER = 0.5, MINIMAL_TIER_MULTIPLIER = 0.25), tier width
  TIER_SKILL_STEP = 25.
- Throttle: 10 crafts per 60 s (content/professions.ts
  CRAFT_THROTTLE_MAX_PER_WINDOW / CRAFT_THROTTLE_WINDOW_SECONDS).
- Caps: crafts maxSkill 125, mining/logging/herbalism 100, fishing 200
  (content/professions.ts maxSkill rows).
- Gathering rhythm: cast 2.5 s base, 1.5 s floor, minus 0.4 per surplus tool
  tier, minus 0.15 per proficiency band (gathering.ts GATHER_CAST_* constants);
  per-player node respawn 120 s (gathering.ts NODE_HARVEST_TABLE
  respawnSeconds, all three node types).
- Fishing rhythm: bite 3 to 8 s, rod minus 1.5 s per tier on the max side, reel
  window 3 s plus 0.75 s rod bonus, session cap 15 s (fishing.ts FISH_* and
  types.ts FISHING_SESSION_CAP_SEC); gain schedule 1 / 0.5 / 0.1 / 0.02 at
  bands below 50 / 100 / 150 / 200, junk gain cutoff 100 (fishing.ts
  FISHING_GAIN_SCHEDULE, FISHING_JUNK_GAIN_CUTOFF_PROFICIENCY).
- Material demand per craft (probe over LADDER_RECIPES): rung 0 avg 5.17
  reagent units and 52c full cost per craft; rung 25 avg 6.22 units, 122c;
  rung 50 avg 7.28 units, 311c.

Target arithmetic (assumption ranges labeled as such):

1. First tier-up in 15 to 20 min: 25 full-gain crafts (25 skill at gain 1).
   Throttle floor 2.5 min. Materials: 25 * 5.17 = 129 units, rung-0 inputs are
   zone1 mob drops (bone_fragments, linen_scrap, spider_leg; drop chances in
   content/zone1.ts loot tables) plus instant vendor reagents. ASSUMPTION 10 to
   15 s per drop unit while killing normally: 22 to 32 min from a cold start,
   about 15 min when leveling drops are already banked (the normal pattern).
   Verdict: PASS for normal play, mild MISS (slow) for a from-zero farm. Fine
   as shipped.
2. Skill 50 in an evening: 50 full-gain crafts (25 rung 0, then 25 rung 25 at
   capability). Throttle floor 5 min. Materials 129 + 25 * 6.22 = 285 units,
   mixed drops, t1/t2 gathers, vendor staples. ASSUMPTION 15 to 25 s blended
   per unit: 1.2 to 2 h. Verdict: PASS (a 2 to 3 h evening).
3. Craft mastery 125 in 10 to 20 focused hours: optimal path 25 + 25 + 25 full
   (rungs 0/25/50), then rung-50 recipes 1 tier below capability at 0.5 (50
   crafts for 75 to 100) and 2 below at 0.25 (100 crafts for 100 to 125): 325
   crafts total. Throttle floor 32.5 min. Materials 129 + 156 + 275 * 7.28 =
   2287 units, dominated by the rare band (thorium_ore, elderwood_log,
   sunpetal_herb: 120 s node respawn forces circuits). ASSUMPTION 20 to 30 s per
   farmed unit: 12.7 to 19.1 h. Verdict: PASS, materials included. Buying the
   tier-3 mats at vendor buyValue compresses to about 2 to 3 h plus roughly
   90000c (275 * 311 + earlier rungs): an acceptable gold sink shortcut.
4. Gathering 100 in 8 to 12 h: optimal 125 effective harvests (75 full through
   proficiency 74 on ascending node tiers, then 50 at 0.5 on t3 nodes).
   Cast time 1.5 to 2.5 s is negligible; the binding constraint is the
   per-player 120 s respawn and circuit travel. ASSUMPTION an 8-node circuit
   with a 120 s lap: 4 harvests per min, about 31 min; even a sparse 3-node
   circuit lands about 1.7 h. Verdict: MISS (far faster than 8 to 12 h) on pure
   mechanics; the shipped feel depends on t3 access (Thornpeak) and node
   contention. If the maintainer wants the target enforced, the sanctioned
   lever is content data (respawnSeconds, node density, qtyByRarity), never
   smaller gain numbers.
5. Fishing 200 in 15 to 25 h: schedule sums to 50/1 + 50/0.5 + 50/0.1 + 50/0.02
   = 50 + 100 + 500 + 2500 = 3150 gain-eligible catches. Junk stops gaining at
   100, inflating the 100 to 200 stretch by the junk share j: total catches =
   150 + 3000 / (1 - j). Cycle time: bite avg 5.5 s (4.0 with a rod on the max
   side), reel about 1.5 s reaction, recast about 1.5 s: 7 to 8.5 s rodded.
   ASSUMPTION j = 0.2: 3900 catches, 7.6 to 9.2 h. ASSUMPTION j = 0.35: 4765
   catches, 9.3 to 11.2 h. Verdict: MISS (fast) against 15 to 25 h under all
   plausible assumptions (reaching 15 h needs 12 s cycles at j = 0.35). The
   0.02 long tail is working as designed (band 2 is thousands of catches); if
   the wall-clock target matters, the sanctioned lever is rhythm data (bite
   delay band, junk share), never smaller gain numbers.

## Deliverable B: legacy junk-recipe burn-down (proposals pending maintainer sign-off)

Margins computed live (probe, the recipe_economy.test.ts value rule). Craft
fee shown for context; the invariant compares output vs input only.
Typed-reagent context checked FIRST: the five Phase 13 resonant secondaries
are consumed ONLY by enchants (content/enchants.ts, 1 each), no RECIPE consumes
any of them, and wolf_fang has ZERO consumers of any kind (probe:
CONSUMERS wolf_fang []), making it the one harvest family with no sink.
All proposals are dispositions ONLY: no prices or materials were changed.

| # | Recipe (craft, rung) | Inputs (unit value) | Input | Output (sell) | Margin | Disposition proposal |
|---|---|---|---|---|---|---|
| 1 | recipe_eastbrook_arming_sword (weaponcrafting, 0) | 2 bone_fragments (7), 1 linen_scrap (3) | 17 | eastbrook_arming_sword 140 | +123 | Rework inputs to consume wolf_fang (fang-hilted sword, closes the ZERO-consumer family) plus existing bone volume at maintainer counts pushing input past 140. |
| 2 | recipe_eastbrook_chain_vest (armorcrafting, 0) | 3 bone_fragments (7) | 21 | 180 | +159 | Add real metal: copper_ore/iron_ore volume (chain needs links); keeps low-band ore demand. |
| 3 | recipe_eastbrook_wool_trousers (tailoring, 0) | 3 linen_scrap (3) | 9 | 110 | +101 | homespun_cloth volume (harvest cloth family demand) plus spool_of_thread (vendor sink). |
| 4 | recipe_tanned_leather_jerkin (leatherworking, 0) | 2 spider_leg (4), 1 bone_fragments (7) | 15 | 160 | +145 | rough_hide volume plus tanning_agent (vendor 16c): the name literally says tanned; adds a vendor gold sink. |
| 5 | recipe_minor_healing_potion (alchemy, 0) | 1 linen_scrap (3), 1 spider_leg (4) | 7 | 8 | +1 | Smallest fix in the set: add 1 glass_vial (vendor 12c), input 19 vs output 8. No material rework needed. |
| 6 | recipe_eastbrook_ritual_vestments (tailoring, 0, UNCOMMON out) | 3 linen_scrap (3), 1 spider_leg (4) | 13 | 210 | +197 | PRIORITY member: also the cheapest disenchantable uncommon (row 2 dust mill). linen_scrap plus homespun_cloth volume plus spool_of_thread. |
| 7 | recipe_eastbrook_druids_hide (leatherworking, 0, uncommon) | 2 spider_leg (4), 1 bone_fragments (7) | 15 | 230 | +215 | rough_hide volume plus tanning_agent, same family as #4. |
| 8 | recipe_eastbrook_warded_leggings (armorcrafting, 0, uncommon) | 3 bone_fragments (7), 1 linen_scrap (3) | 24 | 220 | +196 | Ore volume plus smithing_flux (vendor 20c). |
| 9 | recipe_wardweave_cowl (tailoring, skillReq 75, rare) | 3 thorium_ore (buy 60), 2 linen_scrap (3) | 186 | 440 | +254 | Swap the odd thorium padding toward silk: spider_silk/pristine_silk volume, optionally 1 resonant_thread (would give the typed weave its FIRST recipe consumer; note resonant is bind-on-trade, which keeps the mats maker-bound: maintainer call). |
| 10 | recipe_duskhide_wraps (leatherworking, 75, rare) | 3 thorium_ore (60), 2 spider_leg (4) | 188 | 420 | +232 | rough_hide/pristine_hide volume, optionally 1 resonant_hide (same typed-consumer note as #9). |
| 11 | recipe_sootscale_mantle (armorcrafting, 75, rare) | 4 thorium_ore (60), 2 bone_fragments (7) | 254 | 470 | +216 | Ore stays (mail theme), add smithing_flux volume, optionally 1 resonant_links (typed-consumer note). |
| 12 | recipe_ironbound_warplate_helm (combo, armorcrafting, 25, rare out) | 4 bone_fragments (7), 2 linen_scrap (3) | 34 | boundstone_helm 460 | +426 | LARGEST margin. Combo showcase: add wolf_fang (second home for the dead family) or 1 resonant_steel plus ore volume at maintainer counts. |
| 13 | recipe_forgeguard_bulwark_gauntlets (combo, weaponcrafting, 25, rare out) | 3 bone_fragments (7), 3 linen_scrap (3) | 30 | gravewyrm_gauntlets 390 | +360 | Same combo family as #12: iron_ore volume plus smithing_flux, optionally resonant_steel. |
| 14 | recipe_volatile_flux_elixir (combo, alchemy, 25, uncommon elixir) | 2 linen_scrap (3), 2 spider_leg (4) | 14 | elixir_of_the_bear 20 | +6 | Add venom_gland (2 to 3) plus glass_vial: closes the flag and deepens the gland sink (row 3) right where venomfire already consumes 3 per craft. |

Cross-cutting notes for the maintainer:

- Reworks 1 and 12 are the two natural homes for wolf_fang, the only harvest
  family with zero consuming recipes; landing either closes that gap.
- Reworks 9 to 11 could give the resonant secondaries their first recipe
  consumers, but the bind-on-trade payload means such recipes would demand
  SELF-disenchanted mats; that is a design choice (crafter-locked prestige
  recipes), not a plain price fix. Both variants are listed; the plain
  volume-based variant closes the flag without touching typed reagents.
- Fixing #6 also resolves the row 2 dust-mill margin without touching the
  deliberately unimplemented sub-rare disenchant row.
- Each fixed member must ALSO be removed from LEGACY_GOLD_POSITIVE_RECIPE_IDS
  and EXPECTED_LEGACY_SORTED in tests/recipe_economy.test.ts in the same
  change (the self-pruning property (b) reds otherwise). No pin was touched in
  this phase.

## Deliverable C: pin-coverage audit

| Constant | File | Final value | Pinning test and assertion |
|---|---|---|---|
| MASTERWORK_BASE_CHANCE | src/sim/professions/masterwork.ts | 0.03 | tests/professions_masterwork.test.ts, literal toBe(0.03) |
| MASTERWORK_PER_TIER_ABOVE_CHANCE | masterwork.ts | 0.01 | same suite, toBe(0.01) |
| MASTERWORK_SIGNED_CHANCE | masterwork.ts | 0.02 | same suite, toBe(0.02) |
| MASTERWORK_SPECIALIZATION_CHANCE | masterwork.ts | 0.03 | same suite, toBe(0.03) |
| MASTERWORK_CHANCE_CAP | masterwork.ts | 0.15 | same suite, toBe(0.15) plus clamp cases |
| MASTERWORK_MATERIAL_TIER_CHANCE | src/sim/professions/material_tier.ts | 0.01 | same suite, toBe(0.01) plus real-content rows |
| GATHER_RARE_EVENT_CHANCE | src/sim/professions/gather_events.ts | 1/90 | tests/gather_rare_events.test.ts, toBe(1 / 90) |
| GATHER_RARE_EVENT_YIELD_MULT | gather_events.ts | 5 | same suite, toBe(5) plus yield-path assertions |
| TRAINING_FEE_BY_TIER | src/sim/professions/training.ts | [0, 2500, 10000, 40000, 160000] | tests/professions_training.test.ts, literal toEqual (RE-PINNED this phase: the Phase 15 4x geometric extension; tier 3 40000, tier 4 160000, clamp-to-last re-pinned at 160000) |
| CRAFT_GOLD_SINK_COPPER_PER_BUDGET | src/sim/content/professions.ts | 2 | tests/professions_acquisition_salvage_sink.test.ts, toBe(2) |
| CRAFT_THROTTLE_MAX_PER_WINDOW | content/professions.ts | 10 | same suite, toBe(10) plus live throttle behavior |
| CRAFT_THROTTLE_WINDOW_SECONDS | content/professions.ts | 60 | same suite, toBe(60) plus window-reset behavior |
| UNBIND_FEE_BY_QUALITY_TIER | src/sim/professions/commission.ts | [2500, 10000, 40000] | tests/professions_p14b_commissions.test.ts, literal toEqual plus the six-quality fee map |
| WORK_ORDER_CADENCE_TICKS | src/sim/professions/cadence.ts | 36000 | was derived-only: literal toBe(36000) ADDED this phase to tests/professions_work_orders.test.ts (sanctioned missing-pin addition) |
| Work-order coin formula | content zone quests | floor(0.5 * summed sellValue) | tests/professions_work_orders.test.ts, live-data contract per quest plus strict coin-sink property |
| GATHER_CAST_BASE_SEC / FLOOR / TOOL_TIER / BAND | src/sim/professions/gathering.ts | 2.5 / 1.5 / 0.4 / 0.15 | tests/gathering_rhythm.test.ts, literal outputs 2.5, 1.7, 2.2, 1.95, 1.5 pin all four in both directions |
| FISH_BITE_DELAY_MIN/MAX, rod reduction | src/sim/professions/fishing.ts | 3 / 8 / 1.5 | gathering_rhythm.test.ts: tick bounds 60/160, rod ceilings, seed-4242 literals 127/107/87 |
| FISH_REEL_WINDOW_SEC (+ rod bonus) | fishing.ts | 3 (+0.75) | gathering_rhythm.test.ts reel-deadline tick pins (60 ticks bare, per-rod windowTicks) |
| FISHING_SESSION_CAP_SEC | src/sim/types.ts | 15 | tests/professions_fishing.test.ts, castTotal toBe(15) |
| FISHING_GAIN_SCHEDULE + junk cutoff | fishing.ts | 1/0.5/0.1/0.02, cutoff 100 | professions_fishing.test.ts, literal toEqual + toBe(100) |
| Mastery curve multipliers | src/sim/professions/wheel.ts | 1 / 0.5 / 0.25 / 0 | tests/professions_skill.test.ts, tierProgressMultiplier literal cases |
| Craft caps / gathering caps / fishing cap | content/professions.ts maxSkill | 125 / 100 / 200 | content rows; enforcement pinned via wheel/gathering suites (12c) |
| MARKET_CUT | src/sim/market.ts | 0.05 | tests/market.test.ts proceeds behavior (95 of 100), tests/market_view.test.ts cutPct 5 |

## Open items recorded for the report (no action taken)

- Letter-to-Haldren dead-end: stays an OPEN maintainer call, not decided here.
- Sub-rare disenchant stays byte-identical legacy (verified in code, row 2).
- Unbind clamp-to-first-below interpretation: flagged open in PR #2293's body,
  noted in row 4, unchanged.
- Sheet completeness: every constant on the resolved sheet carries a maintainer
  number; nothing found lacking one (no STOP-AND-ASK).

## As-executed addendum (2026-07-22, the Phase 15 QA directed pass)

This file above is the PRE-FIX evidence snapshot: its Deliverable B margins
describe the recipes as they stood BEFORE the maintainer-directed burn-down,
and its recommendations were subsequently ACTED ON in the same session. The
executed state, superseding the rows above where they conflict:

- Deliverable B: ALL 14 members are closed and LEGACY_GOLD_POSITIVE_RECIPE_IDS
  is EMPTY. Ten closed via input-only reworks (materials-changed table in the
  chore(professions) burn-down commit); the four zone-1 commons the input
  arithmetic could not clear (jerkin, vestments, druids hide, warded leggings)
  closed via the maintainer-approved PAIRED arm: thematic zone-1 input rework
  plus output sellValue re-priced below input (80 / 72 / 84 / 105; vendor
  buyValue untouched). The pin mechanism and three-way proof survive with an
  empty set.
- Row 4 (buyback wash): recommendation (a) LANDED (sellItem denies boundTo
  copies, the trade-gate mirror; the 14b vendor-sell-allowed pins re-pinned
  under the recorded direction).
- Row 2 (dust mill): retired by the vestments rework; the sub-rare disenchant
  arm stays byte-identical as recommended.
- Open items: the letter-to-Haldren dead-end is RESOLVED (option a, the
  locked-quest hint row); the clamp-to-first-below unbind interpretation
  remains the one open flag, carried in the Phase 15 PR body.
- Row 5 (time-to-master): the gathering-100 and fishing-200 fast misses are
  ACCEPTED for this release by the maintainer (data-only levers, post-release
  tuning with live data).
