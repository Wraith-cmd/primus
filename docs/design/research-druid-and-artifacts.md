# Research: druid, and the Legion artifact weapons

Gathered 2026-08-03 for Season 2. Supports `docs/design/season-2-decisions.md`,
specifically the **class weapon that grows** decision.

**PARTIAL.** The session's research budget was exhausted mid-flight. What landed:
the Legion druid artifacts in full depth, and Balance druid's complete expansion
history. What did NOT land: Guardian's moment-to-moment feel across expansions,
Feral, Restoration, and form-swapping as a system. Those are named at the bottom
as the first thing to pick up.

---

# Part 1: the artifact weapons, and why they worked

This is the model the owner chose for the class weapon. The mechanics matter less
than the STRUCTURE.

## Why they landed: eight design decisions

1. **The weapon was a story destination, not a drop.** Every one had a named
   multi-step chain ending in a solo scenario built for that spec. **You could
   not accidentally acquire your artifact.**
2. **The weapon was already famous.** Ursoc's claws, Ashamane's fangs, the Scythe
   of Elune, a branch of the tree that made Nordrassil. Blizzard spent EXISTING
   lore capital rather than inventing new nouns.
3. **The villain used it first.** This is the cheapest, highest-impact beat in
   the whole system. Malithar swings the Claws at you before you take them;
   Ariden seizes the Scythe mid-scenario and flees; Verstok is going mad from the
   Fangs. **The weapon demonstrates its power AGAINST you before you own it.**
4. **It changed what you look like.** For Feral and Guardian the artifact
   appearance re-skins the SHAPESHIFT FORM, not the weapon model. You never see
   the claws; you see a different bear. Progression legible on your silhouette
   from across the room, permanently, in every context.
5. **Multiple independent unlock lanes.** Raid, Mythic+, PvP honor, archaeology,
   world bosses, campaign, and a solo skill check each fed DIFFERENT appearances.
   No single audience gatekept the cosmetic ladder.
6. **Hidden appearances were a genuine secret hunt**, with four completely
   different acquisition verbs across four specs: a raid boss drop, a three-zone
   emote puzzle, a crafted combine behind Exalted, and a gathering-node RNG farm.
   Several carried small mechanical perks.
7. **The Mage Tower was a pure skill check with a permanent visible reward** --
   no gear gate that mattered, no group to organise, and it could not be bought
   or carried.
8. **Traits deepened the spec instead of replacing it.** Nobody remembers Bestial
   Fortitude (+1% stamina per rank). Everybody remembers Rage of the Sleeper.

## Guardian's chain, as the template

**Mistress of the Claw -> To The Hills -> First / Second / Third Trial of Ursol
-> When Dreams Become Nightmares -> The Dreamer Returns**

You go to the Grizzly Hills, and Ursol's priestess puts you through **three
explicit trials** before you are considered worthy. Then you drink moonwell water
and enter the Emerald Dream, defend Ursoc's spirit through three waves, and
Xavius forces a corrupted druid to pick up the claws and use them against you.
**You take Ursoc's claws off a corpse in Ursoc's own dream.**

## The traits worth stealing (verbs, not percentages)

- **Rage of the Sleeper** (golden active): 10 seconds preventing 25% of all
  damage and REFLECTING nature damage back at attackers. 1.5 min CD.
- **Embrace of the Nightmare**: while that is active, +25% damage, +25% leech,
  and immunity to loss of control. A trait that upgrades another trait.
- **Blood Claws** (hidden on-equip): attacks apply a bleed that ALSO reduces the
  target's damage done by 3%, stacking 5 times. A 15% damage debuff on whatever
  you are tanking, that nobody told you about.
- **Adaptive Fur**: taking elemental damage has a chance to grant 10% reduction
  *against that specific element*.
- **Gory Fur**: Mangle has a chance to reduce the rage cost of the next Ironfur.

The lesson: **a small number of signature traits with VERBS, and let the +% minor
traits be background noise.**

## The hidden appearance, as a pattern

**Guardian of the Glade** drops from Ursoc in The Emerald Nightmare. The claws
only need to be IN YOUR BAGS, not equipped, and not in Guardian spec. The
narrative symmetry is the point: **you kill the corrupted Ursoc and his mark
drops, turning you into the bear.** It also quietly granted a gameplay perk
(entering Bear Form had a chance to generate 100 rage instead of 10).

The other three used entirely different verbs: Feral's needed touching three
owlcat stones in three zones then `/sit` before an NPC; Balance's was a crafted
combine gated behind Exalted plus a dungeon rare; Restoration's was an RNG drop
from gathering nodes.

## The criticisms, which are the design warnings

1. **The AP treadmill never ended.** Concordance had no terminus, so every world
   quest was worth doing forever, converting optional content into obligation.
   **Ship a tree that COMPLETES.**
2. **Spec-locking was the most-regretted decision.** One weapon per spec, each
   with its own AP pool, so switching specs meant a fresh grind. This directly
   suppressed off-spec play. **One weapon per character, or shared progress.**
3. **Alt-hostility.** Blizzard's eventual fix was an Artifact Knowledge
   multiplier reaching **+630,000,100%** -- which is an admission the underlying
   curve was wrong, not a redesign of it. The grind was never shortened; it was
   INFLATED AWAY.
4. **Transmog froze for two years.** Weapon collecting, a core WoW hobby, stopped.
5. **The 8.0 removal hurt.** *"The power of every Artifact weapon has now been
   depleted."* Two years of investment vanished at one instant across every
   character. This is the origin of the community's "borrowed power" critique.

---

# Part 2: Balance druid, and the twenty-year argument

Balance's entire history is one question: **should the spec choose your next
cast, or should you?**

| Era | Who chooses | Verdict |
|---|---|---|
| Vanilla / TBC | The mana bar | Starfire spam until out of mana. A support slot with a crit aura |
| WotLK | The dice | Eclipse as a random proc. Streaky; DPS swung with the RNG |
| Cataclysm | The bar, and you cannot steer | **Canonical low point.** Every movement phase and target swap stalled bar progress, and the bar could only travel one way after firing |
| MoP | The bar, but you CAN steer | **PEAK.** Astral Communion let you drive the bar (including pre-pull), Celestial Alignment let you ignore it, Shooting Stars gave reactive interrupts, DoT snapshotting gave a timing puzzle |
| WoD | The clock | The bar oscillated on a 30-second timer regardless of player action. **A resource you cannot influence is not a resource** |
| Legion / BfA | **You** | **PEAK 2.** Pure builder/spender, free choice of nuke, Empowerments to consume. The era players are nostalgic for |
| Shadowlands - TWW | The spec, again | "The combat controls the player instead". Sustained complaint |

**The two peaks are peaks for OPPOSITE reasons**, and that is the useful finding:
MoP is the best version of a resource that constrains you but which you can
steer; Legion/BfA is the best version of no constraint at all. Both work. The
versions that failed are the ones where something else -- dice, a clock, a
one-way bar -- made the choice for you.

**The pattern worth internalising:** Balance players hate the launch build of
every expansion and love the version they were playing three years later. Player
sentiment at launch is a poor signal.

**Direct quotes worth keeping:**
- *"Under the current empowerment system the player controls how the combat is
  approached. Under the eclipse system, the combat controls the player instead."*
- *"Nobody in their right mind wants to cast aoe skills to proc a single target
  buff to then cast their single target skills."*
- *"No version of Eclipse has ever been fun."* (the most-quoted line)
- And the counter, which is the eternal civil war in one sentence: *"ECLIPSE HAS
  ALWAYS EXISTED ITS THE BALANCE DRUID CORE MECHANIC!"*

**The coda:** in 2026 Blizzard finally turned Eclipse into an ACTIVE ABILITY with
charges -- almost word for word the request players had made since 2020. *Let me
choose my eclipse.*

---

## What to carry into PRIMUS

**For the class weapon:**
- Gate it behind a **named trial sequence**, not a drop. Three trials, then a
  scenario.
- Have the **antagonist wield it against the player** before it is claimed.
- Make it **change the character's silhouette**. For a shapeshifter, re-skinning
  the form IS the payoff.
- **Signature traits with verbs**; let the percentages be background.
- **Finite tree, then stop.** Legion's endless Concordance is the mistake to skip.
- **One weapon per character, not per spec.**
- **Multiple independent unlock lanes** so no one audience gatekeeps the look.
- **One genuinely hidden appearance with a weird acquisition verb.** The community
  will build a wiki page for it.

**For class design generally:** the resource decides the pacing, and the failure
modes are all the same shape -- a resource the player cannot influence, a
constraint that dictates cast order regardless of tactical need, or a ramp so
long that the fight is over before the spec comes online.

## Sources

Artifacts: [Claws of Ursoc](https://warcraft.wiki.gg/wiki/Claws_of_Ursoc) ·
[Fangs of Ashamane](https://warcraft.wiki.gg/wiki/Fangs_of_Ashamane) ·
[Scythe of Elune](https://warcraft.wiki.gg/wiki/Scythe_of_Elune_(artifact)) ·
[G'Hanir](https://warcraft.wiki.gg/wiki/G%27Hanir,_the_Mother_Tree) ·
[When Dreams Become Nightmares](https://warcraft.wiki.gg/wiki/When_Dreams_Become_Nightmares) ·
[Rage of the Sleeper](https://warcraft.wiki.gg/wiki/Rage_of_the_Sleeper_(artifact_trait)) ·
[Blood Claws](https://warcraft.wiki.gg/wiki/Blood_Claws) ·
[Mark of the Glade Guardian](https://warcraft.wiki.gg/wiki/Mark_of_the_Glade_Guardian) ·
[Artifact Power](https://warcraft.wiki.gg/wiki/Artifact_Power) ·
[Artifact Knowledge](https://warcraft.wiki.gg/wiki/Artifact_Knowledge) ·
[Mage Tower](https://warcraft.wiki.gg/wiki/Mage_Tower_(Broken_Shore)) ·
[Patch 8.0.1 depletion](https://warcraft.wiki.gg/wiki/Patch_8.0.1) ·
[Hidden appearances](https://warcraft-secrets.com/guides/druid-hidden-artifacts-appearances-and-effects)

Balance: [Eclipse](https://warcraft.wiki.gg/wiki/Eclipse) ·
[Eclipse Bar](https://warcraft.wiki.gg/wiki/Eclipse_Bar) ·
[Astral Power](https://warcraft.wiki.gg/wiki/Astral_Power) ·
[Blizzard Watch: have balance druids outgrown Eclipse](https://blizzardwatch.com/2015/05/10/shifting-perspectives-balance-druids-outgrown-eclipse/) ·
[Method MoP Classic guide](https://www.method.gg/mop-classic/balance-druid-class-guide-mop-classic)

---

## STILL NEEDED (first thing to pick up next session)

The owner asked for a HARD focus on druid and this only half delivers:

1. **Guardian moment-to-moment feel across expansions.** The Legion kit is
   already decided, but how active mitigation actually FEELS (rage generation
   rates, Ironfur stacking, Frenzied Regeneration, Gore procs) is unresearched.
   This is his main spec.
2. **Feral and Restoration** histories.
3. **Form-swapping as the class identity system** -- what makes a druid feel like
   a druid rather than a warrior with a skin. Affinities in Legion. This is
   arguably the most important druid question and it was not answered.
