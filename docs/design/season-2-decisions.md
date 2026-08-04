# Season 2 design decisions (dungeons, keystone, loot, classes)

Captured live during the 2026-08-03 brainstorm, BEFORE the design doc exists, so
the owner's answers cannot be lost the way the original phase plan was. Every
entry here is a decision he made, not a proposal. Research to support the
implementation is in flight; these decisions constrain it, not the reverse.

Status: DECIDED. The specs that follow must honour these or explicitly reopen one.

---

## The governing constraint

PRIMUS is **one human plus four AI companions**, and every WoW design being
borrowed assumes **five humans**. That assumption does not survive translation:
a mechanic that is trivial human coordination becomes either automatic (the AI
interrupts perfectly, so the interrupt is not a mechanic) or impossible (spread
mechanics the AI cannot be told about). Difficulty has to be relocated, not
copied. This is the single most important thing in this document.

---

## 1. Where the challenge lives: BOTH, ESCALATING

- **Low keystones:** companions are self-sufficient. The player plays their own
  game: their rotation, their positioning, their cooldowns.
- **High keystones:** the companions become the puzzle. The player orchestrates.

**The implementation constraint that follows:** do NOT achieve this by making the
AI dumber at high keys. That is artificial and will feel bad. Achieve it with
mechanics that require **information or judgment the AI should not have**:
which of two adds to focus, whether to burn a cooldown now or hold it for the
next phase, who soaks and who stays. Companions stay competent; the fight starts
asking questions only a human can answer.

## 2. Dungeon shape: ALL THREE, ONE PER DUNGEON

Each dungeon gets its own topology. No house style.
- **Hub with branching wings** (Blackrock Depths / Mists of Tirna Scithe)
- **Linear but layered** (Deadmines / Halls of Lightning)
- **Open zone you route through** (Karazhan / Freehold)

**Cost, stated up front:** `src/sim/dungeon_layout.ts` is currently plain numbers
describing a corridor, six hand-tuned constant sets. Three genuinely different
topologies require a layout FORMAT that can express rooms, connections and
vertical space, and it must stay pathfinding-sane for companions
(`colliders.ts` and `pathfind.ts` read the same source). This is the largest
single engineering item in the season and it is a PREREQUISITE, not a nice-to-have.

## 3. Run length: BOTH, BY MODE

- **Normal/heroic:** 35 to 45 minutes. Everything in it. 4 to 6 bosses, real
  trash pacing, optional wings.
- **Keystone:** 20 to 25 minutes. A TIGHTER route through the SAME space,
  skipping optional content.

**What follows:** the layout format must mark content as **required vs optional**
from the start. Cheap to build in, expensive to retrofit. This is also what makes
the branching shape pay off: the optional wings are what you skip under a timer.

## 4. Failure: WOW'S MODEL

Miss the timer and the dungeon is still completable and still rewards, but the
keystone **downgrades a level** and rewards drop a tier. Deaths add time to the
clock. Real stakes, no wasted evening. Explicitly NOT the harder variant where a
run ends and the key is consumed: the owner plays solo to unwind and an evening
ending in nothing is a mood risk, not a challenge.

## 5. The chase: ALL THREE, LAYERED

- **Long spine:** a class weapon that GROWS (Legion artifact model). One per
  spec, acquired through a real questline, gains traits and visual forms with
  use. Strongest fit for solo play because the reward is visible personal
  progress rather than a comparison against other players.
- **Medium hooks:** build-defining drops. Trinkets and items with active effects
  that change how you play, not stat sticks.
- **Week to week:** the keystone ladder itself, pushing higher.

**Sequencing note:** the class weapon is the spine and can start earliest and
grow forever. The other two layer on. Do not attempt all three at once.

## 6. Companion "learning": MEMORY + PROGRESSION

Companions level with the player and unlock abilities, AND they remember
encounters: they eat a mechanic the first time and handle it afterwards, with a
visible per-boss familiarity indicator.

**Explicitly NOT machine learning**, despite the infrastructure existing
(`headless/` + `python/` is a Gym RL environment). A trained policy doing
inference would be deterministic and so would not inherently break the parity
gate, but it is a months-long project producing a companion that is hard to tune
and hard to debug. Memory delivers the FEELING cheaply and stays hand-tunable.

**Why this fits decision 1:** companions visibly improve at mechanics they have
SEEN, so the player feels them growing, while high keystones introduce mechanics
they have not seen and judgment calls they cannot make. The growth is real and
the ceiling stays.

---

## Sequencing (proposed, not yet decided)

These are four independent systems and must not be designed as one. Proposed
order, because each unblocks the next:

1. **Dungeon structure.** The thing the owner is actually unhappy with, and
   keystone mode is meaningless without it. Contains the layout-format work.
2. **Keystone mode.** The timer, scaling, affixes, key downgrade.
3. **Loot and the class weapon.** The reason to repeat the first two.
4. **Class depth.** Currently uneven (mage has 8 base abilities against
   warrior's 39), and it is the least blocking.

## Open questions, not yet asked

- How many dungeons, and do the existing ones get rebuilt or supplemented?
- What does "hard focus on druid" mean concretely: Guardian depth, all four
  specs, or the druid class fantasy (form-swapping) as a system?
- Affix design: reuse the delve affix system or author a keystone-specific set?
- Does the class weapon questline need new zone content, or can it live inside
  existing dungeons?
