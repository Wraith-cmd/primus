# Research: AI party members for a solo five-man

Gathered 2026-08-03 for Season 2. Supports `docs/design/season-2-decisions.md`.

**This is the most important research document of the set.** PRIMUS is one human
plus four AI companions and every WoW design being borrowed assumes five humans.
This is the file that says what to do about that.

---

## The reframe everything else falls out of

The instinct is to build four AI players. That is the wrong target, and it is
why FFXIV Trusts and WoW Follower Dungeons both feel mediocre despite enormous
budgets: they simulate the four humans a dungeon was authored for.

**The player is not one of five. The player is the LEADER of five.**

WoW group content already contains this role socially: the person who calls
kicks, calls stacks, marks targets, says go. That job is pure attention and
prioritisation under time pressure, and it survives translation to single player
perfectly. The four AI do the CONTINUOUS work (rotation, threat, positioning,
throughput); the human does the DISCRETE work (which, when, on what).

**Law 1: Automate the continuous, command the discrete.**

**Law 2: If a command is always correct, automate it. If a behaviour is
automatic, delete the mechanic that tests it.** An auto-resolved mechanic costs
authoring time and teaches nothing. It is noise.

---

## THE headline recommendation: automation subtraction

The researcher flagged this as the highest-leverage original move available, and
it maps exactly onto the owner's "both, escalating" decision:

**Difficulty tiers must not make companions WORSE. They must make companions
LESS AUTOMATIC.**

The distinction is everything. Worse AI produces unattributable loss and reads
as the game cheating. Less automation produces more player work and reads as the
game demanding more of you.

| Tier | What is subtracted |
|---|---|
| 1 | Companions auto-interrupt, auto-CC, auto-spread, auto-avoid, auto-assist |
| 4 | No auto-interrupt. The player spends the charges |
| 7 | No auto-CC, no auto-spread. The player calls them |
| 10 | No auto-target-priority; companions hit only the player's target, plus a global command cooldown of about 1.5s so not everything can be issued |

Every removed automation is a mechanic that turns back ON. The dungeon content
is identical; the player's job grows monotonically.

**This is the PRIMUS keystone ladder, and it is strictly better than the WoW
original for a solo game, because the same encounter genuinely PLAYS
DIFFERENTLY at each tier rather than just having bigger numbers.** Nobody in the
survey does this. It costs almost nothing once the command layer exists.

**Affixes follow the same principle**: attack the automation contract, not the
enemy stat block. "Absent-Minded: companions no longer auto-dispel."
"Skittish: companions no longer avoid telegraphs under 2 seconds." "Loyal:
companions ignore spread orders and follow you." "Overzealous: companions
auto-pull the next pack after 10 seconds." Each is a few lines of config and
each rewrites every pull in the dungeon.

---

## The wipe-attribution law

The most important rule in the report. From Naughty Dog on The Last of Us,
explaining why Ellie is kept physically close to the player:

> "If she has positioned herself correctly and is still seen by an enemy, then
> the player will have been seen too and consequently will attribute the failure
> to themselves rather than the buddy."

**An AI mistake must NEVER be the proximate cause of a wipe.** Companions may
die, because that is drama and stakes, but their death must be traceable to a
player decision: you did not call the spread, you left them anchored in the
pool, you spent the interrupt charge on the wrong caster.

Every unattributable loss burns trust that cannot be won back. Audit every
encounter against this rule.

---

## Which mechanics break, and the fix for each

Sort every mechanic by whether the interesting part is **reaction**,
**coordination**, or **prioritisation**:

- **Reaction** (dodge the swirly) becomes TRIVIAL with AI (zero reaction time,
  exact hitbox knowledge), or if throttled becomes the ugliest failure mode you
  have (FFXIV NPCs walking into walls).
- **Coordination** (stack, spread, soak) becomes COMPLETELY TRIVIAL, because
  coordination is only hard between humans.
- **Prioritisation** (which target, which cast, which cooldown) SURVIVES INTACT,
  because it tests attention and judgment, which is the human's job.

**Prioritisation is the load-bearing mechanic family. Convert as much as
possible into it.**

| Mechanic | Verdict | The fix |
|---|---|---|
| **Interrupts** | Trivial if automated, and it evaporates INVISIBLY so the player never learns the caster matters | Companions do NOT interrupt on their own. The party has a SHARED interrupt resource (e.g. 2 charges, 15s recharge) only the player spends, one keybind firing the nearest companion's kick at the focus target. A pack with three casters and two charges is a real puzzle every pull. Do NOT solve this with a miss chance: random AI failure is unattributable loss |
| **Ground effects** | Trivial if perfect, hideous if imperfect | Make companion avoidance perfect AND FREE (no lost GCDs while dodging). Then delete simple ground AoE as a difficulty source and move to PERSISTENT zones that shrink the usable arena. The AI paths fine, but the room gets smaller and the player must relocate the party. Tests spatial planning, not their reflexes |
| **Stack / spread** | Fully trivial | The highest-value conversion available. Two binds, "Stack on me" and "Spread", with honest travel time (1 to 1.5s) and a bark. The AI does not read the boss cast bar; the PLAYER does. Now it tests: did you recognise the cast and call it in time? Late calls fail and the failure is legibly yours |
| **Target switching** | Survives intact, and is the best mechanic | Steal the Guild Wars henchman rule verbatim: **companions attack the target the player attacks.** Target selection becomes the party's entire damage allocation. Add 0.5 to 1.5s retarget latency so indecision is punished and commitment rewarded. This one rule also fixes CC-breaking for free |
| **Crowd control** | Trivial if automated | A commanded verb with a per-companion cooldown. Companions never break CC because they hit the player's target. Difficulty becomes a pull-planning resource puzzle: five dangerous mobs, two CCs, two interrupt charges, choose |
| **Kiting** | Effectively impossible to automate well; highest risk of looking broken | Do NOT build encounters requiring AI to kite. Either the PLAYER kites while the AI holds (requires companions to survive 15 to 20s alone), or use position flagging so kiting is dragging the party anchor around the room |
| **Soaking** | Pure headcount: auto-soak is a no-op, failed soak is unattributable loss | Make it an assignment with opportunity cost: sending a companion takes them off damage and out of position. Asks "who can I afford to send". Or make soaks player-only via a carried object |
| **Healing** | The AI healer must never be the single point of failure | Model AI healing as a LEGIBLE DETERMINISTIC RESOURCE: a visible throughput bar, X healing per second plus Y emergency saves per minute. This is why Brann works. **He is a resource, not an agent, and resources cannot disappoint you** |

**Authoring budget.** Every mechanic costs AI behaviour authoring PER COMPANION.
FFXIV's per-encounter scripts are why their NPCs break off-script, and Square
Enix has more engineers than this project ever will.
- **Cheap** (generic systems handle them): avoid zone, assist target, formation
  change, hold position, spend commanded cooldown.
- **Expensive and brittle** (bespoke per-encounter logic): "click the orb at
  30%", "pass the debuff clockwise", "run to the correct rune".

Build the encounter vocabulary almost entirely from the cheap set. Buy at most
ONE bespoke moment per boss.

---

## The control spectrum, and where to sit

| Level | Examples | Failure mode |
|---|---|---|
| Full scripting | FFXII Gambits, DA:O Tactics, Deadfire | Solved-once. You author it then spectate. Setup is homework. A small minority engages; everyone else runs bad defaults |
| Presets | Persona Tactics, WoW pet stances | Too coarse to be a decision. Set once at hour two, never touched |
| **Real-time discrete commands** | **GW1 heroes, Mass Effect wheel** | **Micromanagement creep if the verb set is too large** |
| Pure autonomy | FFXIV Trust, Follower Dungeons, Veilguard | Attribution of failure, and it CAPS difficulty: you cannot ask a player to solve what they cannot influence |

**Players feel clever at the third level and only the third level**, and only
when three conditions hold:
1. The verb set is SMALL (four to six), so the right call is identifiable in
   under a second.
2. Each command is genuinely optional and SOMETIMES WRONG. The moment a command
   is always correct it is a tax, and by Law 2 it should be automated.
3. The AI handles the baseline competently WITHOUT the player. Commands must be
   upside, never maintenance.

**Recommended command set, six verbs, all real-time, all keybound:**
Focus/assist · Interrupt (shared charges) · Control (CC) · Stack · Spread ·
Hold/Move here.

**Ship the command layer as the game, and a scripting layer as optional depth.**
Do not gate command verbs behind a stat (Dragon Age gated tactics slots behind
Cunning, which taxed the character build for a UI feature).

---

## Making them characters, not turrets

**Perceived intelligence comes from LANGUAGE, not competence.** Jeff Orkin's
F.E.A.R. thesis: *"If the AI didn't say it, it didn't happen."*

- **Dialogues, not barks.** AI should talk to EACH OTHER. An injured companion
  does not grunt; a squadmate asks "What's your status?" and gets "I'm hit!" One
  exchange conveys the hit, the coordination, and the severity.
- **Dialogue explains inaction**, and this is the single best tool for covering
  AI limitations: *"If you're firing at someone and they're not repositioning,
  they look like dumb, broken AI. But if you overhear 'Get out of there!' / 'I've
  got nowhere to go!' you can understand the AI is aware and wants to move but
  can't."*
- **Dialogue can fabricate behaviour never implemented.** F.E.A.R. squads
  shouted "I need reinforcements!" with no reinforcement code. *"The reviews said
  we did!"*
- Companions should **announce intent before acting and acknowledge orders on
  receipt** ("I've got the caster", "Sheeping the big one", "Moving!"). Double
  duty as command feedback and characterisation, at near-zero engineering cost.

**Build the rules-database bark system on day one** (Valve's Left 4 Dead model:
criteria, response, remember, trigger; most specific rule wins). Ruskin's
motivation applies word for word: content designed for replay becomes dull fast
if the same canned lines fire at the same points. A dungeon game is the replay
case taken to an extreme. Retrofitting this is painful.

**Naughty Dog's transferable rules:**
- **Clutch saves on VERY long cooldowns.** *"If she saved you from a melee
  grapple just once during the game, you would remember that moment fondly. If
  she gave you a health pack around every corner, it would become just another
  pickup."*
- **Callouts must be verifiable.** Never let a companion call a mechanic the
  player cannot then see; over-eager callouts read as stupidity. *"The
  requirements for AI are actually more stringent than they would be for human
  intelligence."*
- **Fake the numbers, not the behaviour.** Ellie shot with player accuracy and
  became a killing machine, so they made her shots do ZERO damage when the player
  was not looking, then made them land at specific moments (player at low health,
  being charged, hasn't seen her contribute recently). **Tune companion DPS by
  WHEN it counts, not by making their rotation look bad.**
- **Ambience is cheap and disproportionately effective.** Idle animations and
  wander points took "a day or so to implement" and "felt great". Between pulls
  companions should be doing something.

**Does imperfection help?** Yes, on ONE axis. The pattern across every game
surveyed: **players cherish flaws that cost nothing and resent flaws that cost
throughput or safety.** Dragon's Dogma pawns are adored, and the two inclinations
players strip out are exactly the two with a mechanical price. FFXIV's Alisaie
firing Limit Break instantly is a beloved quirk because it costs nothing;
Y'shtola standing in AoE is the same category with a price, and players hate it.

**Express personality in flavour, preference, and timing texture. Never in
competence at anything that can kill you.**

**The exception, and it is free on four axes: incompetence as a PROGRESSION
CURVE.** Companions start rough and visibly learn the dungeon alongside the
player. That is characterisation, a progression hook, a difficulty curve, and a
diegetic excuse for early-game AI limitations, all from one system. **This is
exactly the owner's "memory + progression" decision, independently arrived at.**

---

## Difficulty levers, ranked

1. **Automation subtraction** (above). Build the game around this.
2. **Affixes that attack the automation contract**, not the stat block.
3. **Player attention bandwidth.** The scarce resource is decisions per second.
   Overlap demands: a caster to kick while a spread lands while an add needs a
   call. Human groups spread this across five brains; deliberately do not.
   Nearly free to author, since it is just scheduling existing mechanics.
4. **Command economy.** Cap orders (global command cooldown, limited charges).
   Without a cap you get the Guild Wars outcome where enough micromanagement
   trivialises everything.
5. **The player's own throughput.** Easier to tune here than in a real five-man,
   because companion contribution is deterministic: an enrage measures YOUR
   uptime plus a known constant.
6. **Attrition across the run.** Companion health, mana and long cooldowns do not
   fully reset between packs, so route and pull order become real decisions and a
   dungeon is a resource curve rather than five independent encounters.
7. **Companion competence as a purchasable stat** (Granblue sells AI dodge
   reliability as a sigil; Brann has levels and curios). The player chooses their
   difficulty, it reads as character growth, and the loot table gains something
   meaningful to grant beyond player stats.
8. **Information denial.** Companions are an information channel; removing it at
   high tiers is a legitimate, characterful lever.

### Two tuning warnings

**Set the companion power floor LOW and raise it. Never ship high and nerf.**
SWTOR shipped strong companions, nerfed them in 4.0.2, and took sustained
community damage. Blizzard had to nerf tank-Brann. Players internalise companion
power as their own character's power, so removing it reads as a nerf to them.

**Watch role-combination multiplicativity.** Blizzard found healer-player plus
tank-Brann "too effective compared to every other combination". With four
role-flexible companions and a role-flexible player this is the exact failure
mode ahead. Either constrain composition (companions fill the roles the player
does not, automatically) or accept per-combination tuning work.

---

## Compressed build list

1. **Companions assist the player's target by default.** One rule; fixes target
   priority, CC-breaking, and damage allocation simultaneously.
2. **Six real-time keybound commands:** Focus/assist, Interrupt (shared charges),
   Control, Stack, Spread, Hold/Move here. That is the game.
3. **Companions handle all continuous behaviour flawlessly and FREE**, including
   telegraph avoidance with no throughput loss while repositioning. This is the
   single biggest lift over FFXIV.
4. **Difficulty tiers SUBTRACT AUTOMATION, never add incompetence.** Affixes too.
5. **The AI healer is a legible resource with a bar, not a reactive agent.**
6. **Never let an AI mistake proximately cause a wipe.** Audit every encounter.
7. **Rules-database barks on day one**, with companion-to-companion exchanges,
   intent announcements, and order acknowledgements.
8. **Companions learn the dungeon over runs**: pre-positioning, faster order
   response, new barks.
9. **Clutch saves on very long cooldowns** so they stay memorable.
10. **Personality in flavour, never in throughput or safety.**

## Sources

Primary: [Ellie: Buddy AI in The Last of Us, Game AI Pro 2 ch.35](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter35_Ellie_Buddy_AI_in_The_Last_of_Us.pdf) ·
[Combat Dialogue in FEAR, Game AI Pro 2 ch.2](https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter02_Combat_Dialogue_in_FEAR_The_Illusion_of_Communication.pdf) ·
[Ruskin, AI-driven Dynamic Dialog, GDC 2012](https://cdn.akamai.steamstatic.com/apps/valve/2012/GDC2012_Ruskin_Elan_DynamicDialog.pdf)

Competitors: [FFXIV Trust](https://ffxiv.consolegameswiki.com/wiki/Trust) ·
[Duty Support manual](https://na.finalfantasyxiv.com/game_manual/dutysupport/) ·
[Trust AI complaints](https://forum.square-enix.com/ffxiv/threads/452747) ·
[WoW Follower Dungeons](https://warcraft.wiki.gg/wiki/Follower_Dungeons) ·
[Follower AI criticism](https://us.forums.blizzard.com/en/wow/t/follower-dungeon-ai-is-embarrassing/2266298) ·
[Brann Bronzebeard](https://warcraft.wiki.gg/wiki/Brann_Bronzebeard_(delves)) ·
[Brann nerf rationale](https://www.sportskeeda.com/mmo/wow-delves-too-easy-healer-tank-brann-combo-blizzard-explains-nerf)

Control systems: [GW1 Heroes](https://wiki.guildwars.com/wiki/Hero) ·
[GW1 Henchmen](https://wiki.guildwars.com/wiki/Henchman) ·
[Deadfire AI scripting](https://steamcommunity.com/sharedfiles/filedetails/?id=1392162466) ·
[Gambit defence](https://www.resetera.com/threads/i-really-dont-get-why-the-gambit-system-of-final-fantasy-xii-was-so-reviled-considering-how-it-pretty-much-solved-the-drawbacks-of-partner-ais.152253/) ·
[Veilguard: no companion control](https://kotaku.com/dragon-age-the-veilguard-companions-controls-1851616515) ·
[Dragon's Dogma inclinations](https://dragonsdogma.wiki.fextralife.com/Inclinations) ·
[SWTOR companion nerf](http://dulfy.net/2015/11/16/swtor-bioware-explains-companion-healing-nerfs/)

**Caveat:** the researching agent exhausted the session's shared web-search
budget partway and completed via direct source fetches. The primary Game AI Pro
chapters and the Valve GDC deck are the most valuable material and were fetched
directly.
