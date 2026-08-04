# Research: WoW dungeon topology and layout philosophy

Gathered 2026-08-03 for Season 2. Supports the owner's decision that **each
dungeon gets its own topology** (`docs/design/season-2-decisions.md`).

Directly addresses the complaint that started this: "super short, one boss,
these dungeons are just a hallway."

---

## The finding that reframes the problem

**The axis that matters is not linear-versus-open.** It is:
1. **Does the player make a spatial decision?**
2. **How often does the environment change register?**

Four dungeons, same question:

| Dungeon | Spatial decisions | Register changes | Result |
|---|---|---|---|
| Halls of Lightning | none | none | Efficient, forgettable, zero replay depth |
| Deadmines | none | four | Reads as a JOURNEY despite being linear |
| Mists of Tirna Scithe | bounded | one | Navigation as a skill check, with a fuse |
| Blackrock Depths | unbounded | a dozen | Generates stories, unrunnable in a modern loop |

**Ranked by memorability, that is exactly the reverse of ranked by runnability.**

**The cheap win is register change, not branching.** Deadmines has almost the
same graph shape as Halls of Lightning, and never reads linear, because the
environment changes character four times (dirt tunnel -> industrial foundry ->
cavern -> open-air harbour) and the destination is concealed until arrival. A new
skybox costs far less than a branching graph.

---

## The vanilla mazes were an ACCIDENT, not a design goal

John Staats, WoW's first 3D level designer, on why old dungeons are confusing:

> "We only had about 20 textures or a dozen textures. It all kind of looked the
> same, **it was easy to get lost**."

Also: **"There really were no design documents"**, and levels were built before
the combat model existed -- "I didn't have an idea of how many monsters we would
be fighting in combat at one time... we didn't know ranges of spells, we didn't
know areas of effect."

**He REGRETTED the Wailing Caverns maze and was relieved when it was removed.**

Blizzard's twenty-year drift toward legible layouts is therefore a correction,
not a betrayal. And the reconciliation exists: **Mists of Tirna Scithe produces
disorientation deliberately and BRIEFLY, with distinctive art, rather than
accidentally and endlessly with repeated art.**

**Never let disorientation be unbounded.** Blizzard deleted Sunken Temple's lower
floors outright (4.0.3a) and flattened Scholomance "to be less confusing".

---

## The topology catalogue

**Hub-and-spoke is the highest-value shape**, and The Nexus is the cleanest
statement of it: three wings (Librarium, The Rift, The Singing Grove) in any
order, and the final boss only unlocks when all three are done. That one pattern
delivers player choice, parallel content, a natural difficulty ramp and a clean
gating rule. **It scales from a single room (Theater of Pain) to an entire zone
(The Nokhud Offensive).**

Other hub examples: Dire Maul (central ogre plaza, three wings of 5/6/7 bosses,
plus a PvP pit), Auchindoun (four wings at cardinal entrances), Halls of
Origination, De Other Side (three portals to three sub-realms, any order),
Waycrest Manor (multi-floor, upstairs splits into two arms).

**"Choose 2 of 3" is a cheap, potent node.** Priory of the Sacred Flame requires
two of three lieutenants before the gate boss; End Time spawns two of four Echo
bosses per run. Route variety and per-run variance at almost no geometry cost.

**Linear done well vs done badly.** Halls of Lightning is the honest floor: four
bosses, one axis, zero branches, no dead ends, no optional rooms. It works, it is
forgettable. Grimrail Depot is the reductio -- a moving train you cannot walk
backwards through. Deadmines is the proof that the same graph can read as an
adventure.

**Vertical/spiral:** Utgarde Pinnacle (ascending, with a rampart gauntlet chase),
Return to Karazhan (11 bosses, two halves gated by a key), Black Rook Hold
(catacombs up to a spire top), The Oculus (drake-mounted 3D).

**Loops are rare and mostly abandoned** -- a loop returning to the entrance
conflicts with "port out at the end" and with linear narrative pacing.

**Outdoor dungeons are the modern frontier.** The Nokhud Offensive is a phased
version of an entire zone with dragonriding INSIDE the dungeon and five flight
masters; it is also the Nexus pattern at zone scale. The Dawnbreaker fights
across flying ships with skyriding as the traversal verb.

---

## The per-expansion arc, compressed

**Vanilla:** Jeff Kaplan, per Staats -- **"there's no such thing as a dungeon too
big."** 5 to 20+ bosses, 1 to 6 hour clears, keys and attunements, heavy
backtracking, dungeons embedded in the world.

**TBC: the great shortening, and the key quote.** Kaplan: *"In our current
five-man dungeons, the bosses are your reward for putting up with 20 to 30
minutes of clearing through normal creatures."* Trash as TOLL, bosses as PAYMENT
-- that framing is the whole thesis of the redesign. Dungeons drop to 3 to 5
bosses and ~1 hour. Two inventions: **difficulty modes replace length** (one
layout, two audiences) and **shared exteriors** (small dungeons, big-feeling
place).

**WotLK: the queue is the real inflection.** Patch 3.3.0's Dungeon Finder added
cross-realm grouping AND automatic teleport into the instance. Once a dungeon is
a thing you teleport into with four strangers and leave, its layout can no longer
assume world context, social pre-negotiation, or tolerance for a 90-minute
detour. **This, not TBC, is why WoW dungeons became short.**

**Cataclysm:** launched heroics deliberately long and punishing, then nerfed
after revolt. Also when Blizzard started DELETING geometry, and retrofitted
Goblin Teleporters into Deadmines -- a designer admitting the walk is dead weight.

**MoP: routing becomes a skill.** Challenge Modes (timed, cosmetic-only rewards).
The gold-vs-bronze spread was 15 vs 45 minutes, a 3x range that only makes sense
if skipping and pathing are worth enormous time. Stayed niche because rewards
were cosmetic.

**WoD:** the trough. 3 to 4 bosses, uniformly linear, and remembered as the
thinnest dungeon content.

**Legion: Mythic+, and the curve reverses.** The critical detail is **Enemy
Forces percentage**: needing a PERCENTAGE of trash rather than all of it turns
the dungeon graph into a solvable optimisation problem. A dungeon with one path
has one answer; a dungeon with wings has a solution SPACE, and that space is the
replayable content. Legion's roster is conspicuously the most topologically
varied since vanilla -- Blizzard reintroduced branching in the same expansion it
introduced the system that rewards branching.

**BfA onward:** routing-aware layouts as standard. Megadungeons get SPLIT IN HALF
for M+ (Mechagon in 8.3.0, Tazavesh) -- length budget enforced structurally.

**Dragonflight:** seasonal dungeon-pool rotation. Ion's rationale is the tell --
the goal is *"for the dungeon gameplay itself to feel fresher, and like a new set
of puzzles for the community to solve each season."* Blizzard now conceives a
dungeon's ROUTE as its primary replayable content.

**The War Within:** boss counts hit their floor at 3. Blizzard's Season 2
philosophy post is the most explicit statement they have made: *"Each dungeon
should bring something distinct, whether that is its theme, layout, pacing,
visual style, or mechanical identity."*

**The cost Blizzard now openly discusses.** Ion: *"It's hard to overstate how
daunting it can be for someone to try to get into M+ PUGs... when the established
community is largely focused on routing micro-optimizations and time-saving
tech."* Routing depth is a knowledge moat. Their mitigation is rotation.

---

## Practical takeaways for PRIMUS

1. **Pick a topology per dungeon and commit.** Blizzard's own checklist (theme,
   layout, pacing, visual style, mechanical identity) is usable. Two corridor
   dungeons in a row is the WoD failure mode.
2. **The cheap win is register change, not branching.** Change biome, scale and
   lighting every few minutes and a linear graph reads as a journey.
3. **If there is a timer, add branching FIRST.** Partial-completion plus a
   branching graph is what makes a dungeon re-solvable. Without branching, one
   run solves it forever. **This directly validates the owner's decision to give
   each dungeon its own shape.**
4. **Hub-and-spoke is the highest-value shape.** Steal the Nexus pattern: N wings
   in any order gate the final boss.
5. **"Choose 2 of 3" is cheap and potent.**
6. **Budget 3 to 5 bosses and 20 to 35 minutes** unless deliberately building a
   megadungeon -- and if so, plan the split point IN ADVANCE, because Blizzard
   has had to retrofit that split three times.
7. **Bound the disorientation.** Mists of Tirna Scithe is the model: a real
   navigation puzzle with a hard time ceiling.

## Sources

[Blackrock Depths](https://warcraft.wiki.gg/wiki/Blackrock_Depths) ·
[The Nexus](https://warcraft.wiki.gg/wiki/The_Nexus) ·
[Dire Maul](https://warcraft.wiki.gg/wiki/Dire_Maul) ·
[Deadmines](https://warcraft.wiki.gg/wiki/Deadmines) ·
[Halls of Lightning](https://warcraft.wiki.gg/wiki/Halls_of_Lightning) ·
[Mists of Tirna Scithe](https://warcraft.wiki.gg/wiki/Mists_of_Tirna_Scithe) ·
[Priory of the Sacred Flame](https://warcraft.wiki.gg/wiki/Priory_of_the_Sacred_Flame) ·
[The Nokhud Offensive](https://warcraft.wiki.gg/wiki/The_Nokhud_Offensive) ·
[Mythic+](https://warcraft.wiki.gg/wiki/Mythic%2B) ·
[Challenge Mode](https://warcraft.wiki.gg/wiki/Challenge_Mode) ·
[Dungeon Finder](https://warcraft.wiki.gg/wiki/Dungeon_Finder) ·
[Kaplan on trash as toll (GameSpot)](https://www.gamespot.com/articles/world-of-warcraft-the-burning-crusade-qanda/1100-6151428/) ·
[Staats interview, PopBreak](https://thepopbreak.com/2020/03/11/john-staats-on-the-world-of-warcraft-behind-the-scenes-book-the-wow-diary/) ·
[Staats on MMO-Champion](https://www.mmo-champion.com/threads/2423127-World-of-Warcraft%E2%80%99s-original-3D-Llvl-Designer-J-Staats-speaks-abt-the-making-of-WoW) ·
[Ion on seasonal pools](https://www.mmo-champion.com/content/10538-Ion-Hazzikostas-on-Dragonflight-Mythic-Season-1-Itemization-and-Dungeon-Pool) ·
[Midnight S2 M+ philosophy](https://www.bluetracker.gg/wow/topic/us-en/2320056-midnight-season-2-mythic-dungeon-philosophy-and-design-goals/) ·
[M+ routing guide](https://conquestcapped.com/guides/wow/mythic-plus-routes/)

**Unfinished lead:** the Wowhead 11.2 dungeon-design dev interview with lead
encounter designers is JS-gated and is likely the densest source on modern layout
intent. Read it in a browser.
