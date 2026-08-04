# Research: WoW class design and identity

Gathered 2026-08-03 for the Season 2 work. Supports
`docs/design/season-2-decisions.md`. This is RESEARCH, not decisions: it
constrains the specs that follow rather than replacing them.

Directly relevant to PRIMUS's stated problem: the mage has 8 base abilities
against the warrior's 39.

---

## The number PRIMUS needs

Ghostcrawler's public target was **roughly four abilities as an ideal rotation
size**, with the caveat that four is not magic. He separated **rotational**
abilities from **circumstantial** ones, and named the bloat mechanism exactly:
designers fixing a flawed ability by ADDING another instead of removing it,
until "the action bars are saturated".

A working budget per spec:

| Bucket | Count |
|---|---|
| Core rotational | 4 to 6 |
| Offensive cooldowns (at different cadences, so they drift in and out of alignment) | 2 to 3 |
| Defensives (at least one reactive) | 2 to 3 |
| Utility / situational (interrupt, movement, CC, dispel) | 3 to 5 |
| **Total bound keys** | **12 to 17** |

**So: the PRIMUS mage at 8 abilities is roughly HALF a spec. The warrior at 39
is roughly two, and almost certainly contains dead buttons.**

The audit that matters, per ability: *when did I last press this, and what
decided it?* Any button whose answer is "never" or "nothing" is bloat regardless
of how thematic it is. Action bar space is a finite resource; every button taxes
every other button's discoverability.

**Fix the mage by adding cooldowns and utility, NOT more rotational buttons.**

---

## Add depth without adding buttons: the seven levers

Ranked, highest value first. These are the tools for making a thin class deep
without doubling its keybinds.

1. **Buff windows.** A cooldown that makes the next 12 seconds a different
   rotation. Highest depth-per-button in the game: it doubles the number of
   interesting rotations per spec at the cost of one key. (Fire Mage's
   Combustion is the canonical example.)
2. **Procs that change an existing button.** Brain Freeze turning Frostbolt into
   an instant Flurry: new gameplay, zero new keys. PRIMUS already has this
   pattern.
3. **Charges instead of cooldowns.** Turns "is it up?" into "do I bank or spend?"
4. **Conditional modifiers.** The ability behaves differently below 20% health,
   from stealth, or on a target you have debuffed.
5. **Resource-threshold behaviour.** The spender is stronger at 5 combo points
   than 3, so *when* becomes the decision.
6. **Target-count scaling.** One button is both the single-target and the AoE
   button, with a break-even the player must learn.
7. **Positional and state requirements.** Behind the target, in melee, in a form.

---

## The two-layer identity model

Ion Hazzikostas, 2019: "A spec should be taking a class and taking a particular
aspect of it and becoming a master." And the admission: **"class identity may
have actually been hurt in the effort to create spec identity instead."**

- **Class layer:** shared toolkit, resource, silhouette, utility. What makes a
  warrior a warrior in any spec.
- **Spec layer:** which aspect of that class you have mastered.

Legion's mistake was building the spec layer by hollowing out the class layer,
producing "36 mini classes" instead of 12 classes with three faces each.

**Rule for PRIMUS:** utility should be SHARED across a class's specs. That is
what makes a class rather than three unrelated specs.

Identity is carried by four things, in order of load-bearing weight:
1. **The resource** (sets pacing)
2. **The rhythm** (what a 10-second window feels like)
3. **The exclusive verb** (the thing only this class does)
4. **The silhouette and feedback** (armor, animation, sound)

Ability lists are the least of it.

**The test:** every class needs one sentence no other class's sentence could be
swapped with, and one verb nobody else has. If two of nine classes share a
sentence, there are eight classes.

---

## Resources as pacing devices

Three questions decide the feel: **Do you start the fight full or empty? Does it
decay? Can you overcap?**

**Successes:** Energy + Combo Points (the gold standard: two clocks at different
speeds, so there is always a decision, and no ramp), Holy Power (combo points
for plate; the proof it worked is that Blizzard removed it from two specs and
put it back), Soul Shards post-Legion (persistent between fights, so the only
resource with strategic rather than tactical value), Maelstrom Weapon (converts
one combat mode into another: melee to earn a caster's spell).

**Failures, and the lesson in each:**
- **Mana as a challenge.** Ghostcrawler's own post-mortem: short at low gear,
  too abundant at high gear, "eliminating much of the challenge". Mana only
  creates gameplay inside a narrow gear band. A fundamental scaling problem.
- **Insanity's decay.** Blizzard: "we often receive feedback that people do not
  enjoy fighting the resource decay in order to inflict reasonable damage."
  Decay should punish DISENGAGEMENT, not punish being in a state you were
  rewarded for entering.
- **Eclipse, in six distinct versions across seven expansions.** WoD's was a
  resource that swung on a TIMER regardless of player action: a resource you
  cannot influence is not a resource.
- **Three-layer resource stacks** (energy to chi to spender). Fine at two layers.
  Blizzard removed the third from Monk tank and healer for exactly this reason.
- **A resource that is just a cooldown with extra steps.** If it always fills at
  the same rate and spends at the same threshold, delete it and make it a
  cooldown; nothing is lost and a UI element is freed.

**Overcapping as the only failure state** is the trap most relevant to a young
class kit: if the sole punishment for bad play is wasted resource, the rotation
is leak-plugging, not decision-making. Add a *reason to hold* resource (an
upcoming window, a proc worth waiting for).

---

## Rotations: priority lists need inversions

Priority systems won over fixed rotations because procs, variable buffs and haste
make fixed sequences impossible.

**But a priority list with no branching is just a fixed rotation written
vertically.** Depth comes from priority INVERSIONS: moments where the normal
order is wrong. Good specs have three or four situations that flip the list (a
proc, an execute phase, a cooldown window, an add spawn). Bad specs have zero,
and a spreadsheet plays them optimally.

**Give every PRIMUS spec at least three priority inversions.**

Rotations players love, and why: MoP Windwalker (1.0s GCD, speed IS the
fantasy), Legion Outlaw (Roll the Bones made every buff window a different
rotation: randomness that changes decisions, not just numbers), Fire Mage
(Combustion turns a builder spec into a 10-second burst puzzle), WotLK Feral
(bleed clipping and Savage Roar uptime: real skill expression from four
buttons), Frost DK with Breath of Sindragosa (a resource dump that becomes a
resource RACE, with visible immediate failure).

Rotations players hate: long ramps before you do damage; maintenance without
decision (re-applying six DoTs on a timer is bookkeeping); rotations whose only
failure state is overcapping.

**The BfA GCD lesson:** putting cooldowns on the GCD made them feel worse to
press without making them more interesting. **Cost should buy a decision.**
Friction that does not create a choice is just friction.

**Tanks are a special case.** Ghostcrawler: "we try to have pretty simple
rotation for tanks anyway because they have a lot of other things to worry
about". Budget a tank's complexity toward SURVIVAL TIMING, not rotational
density. Directly relevant to PRIMUS, whose owner mains Guardian.

---

## Talents: what players actually want

The arc: Vanilla trees (enormous apparent freedom, near-zero real freedom,
cookie-cutter builds because stat nodes were mandatory) to Cataclysm (the "first
big overcorrection", even more cookie-cutter) to MoP (6 tiers x 3 choices;
succeeded on choice QUALITY, failed on progression FEEL, because 6 decisions
across 90 levels is not a progression system) to the borrowed-power detour
(Artifacts, Azerite, Covenants: talent systems that expired at expansion end and
were externally optimal rather than personally chosen) to Dragonflight (class
tree plus spec tree, mostly single-rank nodes, free respec, and critically **you
cannot unlock everything**).

**The five things players want, in tension:**
1. Regular, small progression (Vanilla's per-level drip; MoP lost it,
   Dragonflight restored it)
2. Choices that change HOW you play, not how much you do
3. Build identity: the ability to describe your build in a sentence
4. Cheap respec. Cost does not make choices meaningful, it makes them permanent,
   which makes players pick the safe one
5. Not being able to have everything. Scarcity converts a checklist into a choice

**The rule that falls out:** never put throughput and utility in competition for
the same point unless you WANT players to feel taxed. Give utility its own
budget. That is exactly what Dragonflight's class tree is for.

---

## What makes same-role specs distinct

The single most transferable idea in this research, and it applies directly to
PRIMUS's healer and tank companions:

- **Healers differ by WHEN the healing happens relative to the damage.** Disc
  pre-shields and heals by dealing damage; Holy heals reactively; Resto Druid
  pre-applies HoTs that pay out later; Resto Shaman chains and places totems;
  Mistweaver heals through melee; Holy Paladin heals big and single-target;
  Preservation heals with charged empowered casts. Seven healers, seven answers
  to "pre-emptive, reactive, or delayed?" **That question is the whole design
  space.**
- **Tanks differ by the CURRENCY of mitigation.** All tanks run active mitigation
  since MoP. Brewmaster DEFERS damage (Stagger), Blood DK HEALS it back (Death
  Strike), Prot Warrior BLOCKS it (Shield Block), Vengeance DH REGENERATES
  through it. Same goal, four different failure states.
- **DPS differ by TIMELINE.** Sustained vs burst, single vs cleave, ramp length.
  Affliction ramps and sustains; Destruction banks and detonates; Demonology
  snowballs.

**On homogenisation:** share the utility FUNCTION, differentiate the utility
COST AND SHAPE. Everyone gets an interrupt; they differ in range, cooldown, and
whether it is on the GCD.

---

## Per-class identity, one line each

Community-consensus judgments on "best expression", not citable fact.

| Class | What it IS | Peak |
|---|---|---|
| Warrior | A resource you cannot bank and did not choose: rage arrives by fighting and drains when you stop. Must stay in the fight to function. | Wrath/MoP |
| Paladin | The armored spellcaster. Exclusive verb: THE EMERGENCY (bubble, lay on hands, immunity for someone else). | Legion (Ret/Prot), MoP (Holy) |
| Hunter | The only class whose damage has a second body. Focus regenerates whether you act or not: never downtime, never stops moving. | MoP (BM/MM), Legion (Survival) |
| Rogue | Always building or spending, never idle. Exclusive verb: CHOOSING WHEN THE FIGHT STARTS. | Legion, MoP close |
| Priest | Two opposed classes in one robe: protect the future (Disc) or repair the past (Holy), or turn the same faith inward (Shadow). | MoP |
| Shaman | Elemental brokerage. The only class whose power is PLACED IN THE WORLD rather than cast at a target. | WotLK/MoP |
| Mage | Pure ranged control. The exclusive right to NOT BE THERE (Blink, Ice Block, Invisibility): positioning is a spell. | MoP, Legion for Fire |
| Warlock | Damage as a transaction: pay health, pay souls, pay time. The only class that arrives at a fight PRE-LOADED. | MoP |
| Monk | Momentum. 1.0s GCD makes it the fastest-feeling class; mobility is woven into the rotation rather than bolted on. | MoP (WW), Legion (BrM) |
| Druid | Not a hybrid, a SHAPESHIFTER. Four specs with four different resources in one class. The identity is the wardrobe. | WotLK/MoP for Feral |
| Death Knight | Inevitability. Never out of resources for long, never able to burst on demand: grinds a target down and drags it back. | WotLK fantasy, Legion mechanics |
| Demon Hunter | Speed made literal. The only class whose movement abilities ARE its damage abilities. | Legion |
| Evoker | Range as a dial, casts as a squeeze. Empowered (hold-to-charge) is the only genuinely new casting verb in a decade. | Dragonflight |

---

## Recommended actions for PRIMUS

1. **Write the sentence first.** One identity sentence per class, one per spec.
   If any two are swappable, the design is not done. Do this BEFORE touching
   ability lists.
2. **Pick the resource to match the pacing wanted**, then let abilities follow.
   Start-full vs start-empty, decay vs none, one-layer vs two: these three set
   80% of a spec's feel.
3. **Audit against the budget.** Expect to cut roughly a third of the warrior's
   39. Fix the mage's 8 with cooldowns and utility, not more rotational buttons.
4. **Put the class layer back.** Shared utility across a class's specs.
5. **Use the seven levers before adding any key.** Buff windows first.
6. **Three priority inversions per spec, minimum.**
7. **Talents: small frequent points, cheap respec, hard scarcity, utility on a
   separate budget from throughput.**

## Sources

Blizzard primary: [Cataclysm Post Mortem (Ghostcrawler)](https://worldofwarcraft.blizzard.com/en-us/news/4519250/cataclysm-post-mortem-greg-ghostcrawler-street) ·
[Class Design, Too Much Pruning (Ion)](https://www.wowhead.com/news/class-design-too-much-pruning-pvp-gear-from-pve-developer-insights-with-ion-292386)

Reporting: [MMORPG.com on pruning](https://www.mmorpg.com/news/ion-hazzikostas-and-the-world-of-warcraft-team-agree-class-pruning-has-gone-too-far-2000101113) ·
[Massively OP](https://massivelyop.com/2019/06/22/blizzard-on-world-of-warcraft-class-pruning-weve-gone-too-far/) ·
[Ghostcrawler on rotation complexity](https://www.engadget.com/2010-11-08-ghostcrawler-on-the-evolution-of-rotation-complexity.html) ·
[Ghostcrawler on ability counts](https://en.guiaswow.com/blue/ghostcrawler-tells-us-number-skills-players.html) ·
[Blizzard Watch on talent trees](https://blizzardwatch.com/2022/10/31/wow-cataclysm-talent-trees/) ·
[Icy Veins: Dragonflight talents](https://www.icy-veins.com/wow/dragonflight-talent-system-guide)

Reference: [Talents (history)](https://warcraft.wiki.gg/wiki/Talents_(history)) ·
[Specialization](https://warcraft.wiki.gg/wiki/Specialization) ·
[Rotation](https://warcraft.wiki.gg/wiki/Rotation) ·
[Hybrid class](https://warcraft.wiki.gg/wiki/Hybrid_class) ·
[Global cooldown](https://warcraft.wiki.gg/wiki/Global_cooldown) ·
resource pages for [Rage](https://warcraft.wiki.gg/wiki/Rage), [Combo point](https://warcraft.wiki.gg/wiki/Combo_point), [Holy Power](https://warcraft.wiki.gg/wiki/Holy_Power), [Insanity](https://warcraft.wiki.gg/wiki/Insanity), [Eclipse](https://warcraft.wiki.gg/wiki/Eclipse), [Soul Shards](https://warcraft.wiki.gg/wiki/Soul_Shards), [Maelstrom Weapon](https://warcraft.wiki.gg/wiki/Maelstrom_Weapon)

**Caveat on sourcing:** the researching agent hit the session's web-search cap
(200 shared) partway through and completed the back half via direct page fetches
plus domain knowledge. Sourcing is strong on resources, pruning, talents and
developer philosophy; the per-class "best expansion" picks are flagged as
community consensus rather than fact.
