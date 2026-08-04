# Research: combat feel and impact

Gathered 2026-08-03 for Season 2. Supports `docs/design/season-2-decisions.md`.

Addresses ROADMAP item 3. The researcher's diagnosis of PRIMUS specifically:
**the gap is not screen shake.** In order of return on effort the three missing
things are **hit-stop, audio layering, and impact flash**. Adding shake before
those makes combat NOISY rather than IMPACTFUL.

---

## Two constraints that decide what transfers

**The sim is deterministic at 20Hz.** Every technique here is
PRESENTATION-LAYER. Hit-stop must never touch the tick clock, input handling, or
the camera. Character-action games implement it as `Time.timeScale = 0`; PRIMUS
cannot. What freezes is the animation mixer delta on two rigs plus their
attached emitters, and nothing else.

**The 50ms tick is the natural quantum, and it is a problem to design around.**
If all impact presentation fires on tick boundaries, effects land on a 50ms grid
and multi-target hits become one mushy simultaneous event. See the stagger fix
below.

---

## Hit-stop: the single highest-value addition

Freezes attacker and victim at contact. Its function is perceptual: it lets the
eye register that a collision happened. Dark Souls 2 lacks it, which "makes it
harder to tell a hit occurred" -- which IS the "reads flat" complaint.

**Shipped numbers.** Smash's damage-scaled formulas are the best available data.
Even a 0-damage hit gets 3 to 6 frames (50 to 100ms): there is a FLOOR. Melee
caps at 333ms, Ultimate at 500ms. Modifiers worth stealing: electric attacks
x1.5, shielded x0.67, and Ultimate scales hitlag DOWN as player count rises
(x1.0 at 2 players to x0.75 at 8) because freezing during a multi-player fight
creates openings for a third party. That last one is directly relevant.

| Event | Freeze | Attacker | Victim |
|---|---|---|---|
| Auto-attack / filler | 40 to 60ms | 0.3x timescale | 0.0x |
| Standard ability | 70 to 90ms | 0.2x | 0.0x |
| Critical hit | 110 to 140ms | 0.0x | 0.0x |
| Execute / killing blow | 160 to 200ms | 0.0x | 0.0x |
| Parried / blocked | 90 to 120ms | 0.0x | 0.3x |
| DoT tick, periodic, AoE splash | **0** | | |

```
stopMs = clamp(50 + 900 * (damage / targetMaxHP), 40, 200)
if (crit)      stopMs *= 1.4
if (elemental) stopMs *= 1.25
if (blocked)   stopMs *= 0.67
```

**Rules:** only the LOCAL player's own attacks. Direct damage only (a warlock
with 4 DoTs on 5 targets would stutter constantly). Refractory period 300ms
minimum. Hard cap 200ms. Freeze the victim harder than the attacker. Ease the
timescale back over ~30ms rather than snapping, or the release reads as a hitch.

**Parry/block gets MORE attacker freeze than a normal hit on purpose:** that is
the read telling the player their swing was stopped, the tab-target equivalent
of blockstun.

**Hit-stop is also the cancel window.** Street Fighter's 2-in-1 cancel is
implemented inside hitstop. The hit-stop duration is, for free, the input-buffer
window for the follow-up.

---

## Screen shake: trauma model, and it is the LAST thing to add

```
trauma: [0,1], clamped
on event:  trauma = min(1, trauma + amount)
per frame: trauma = max(0, trauma - decay*dt)
           shake  = max_offset * pow(trauma, 2)
```

The `trauma^2` exponent matters more than it looks: 0.3 trauma yields 9% of max
offset, not 30%. That non-linearity is what lets small hits register without a
constantly wobbling screen. It also clamps simultaneity for free (five hits at
once cap at 1.0 rather than summing to a seizure).

**Use a CONTINUOUS function, not per-frame random.** This is the most common
implementation error; per-frame randomness makes the screen hard to follow.
Interpolate between pre-generated samples, or sine multiplied by Perlin.

Amplitude as a fraction of SCREEN HEIGHT so it is resolution-independent, with
`max_offset = 1.0%`:

| Event | Trauma | Peak offset | @1080p | Freq | Decay |
|---|---|---|---|---|---|
| Standard hit dealt | 0.18 | 0.03% | ~0.3px | 35Hz | 2.5/s |
| Crit dealt | 0.35 | 0.12% | ~1.3px | 32Hz | 2.2/s |
| Big cooldown | 0.55 | 0.30% | ~3.3px | 28Hz | 1.8/s |
| Heavy damage taken | 0.45 | 0.20% | ~2.2px | 30Hz | 2.0/s |
| Boss slam (scripted) | 0.85 | 0.72% | ~7.8px | 12Hz | 1.0/s |

**Frequency is the nausea lever.** 25 to 45Hz reads as a sharp buzz and is
correct for impact. Below 10Hz reads as an earthquake and is the vestibular
trigger. Rotational roll: cap 0.3 degrees for combat, 0.8 for scripted. (Godot's
reference recipe uses 5.7 degrees with the warning "use sparingly": that is an
earthquake, not a sword hit.)

**Direction carries information.** Shake along the attacker-to-target axis for
damage dealt, target-to-player for damage taken. That single change converts
shake from noise into a readable signal.

**Too much, concretely:** peak translation above 1% of screen height for routine
combat; frequency below 10Hz for anything not an explosion; duration above
400ms for a hit; any roll above 1 degree; per-frame random offsets.

---

## Impact frames: the cheapest large win

At contact, for 1 to 3 render frames (~30 to 60ms):
- Swap the victim material to flat additive white/near-white emissive
- **Non-uniform scale pop**: x1.10 along the impact axis, x0.93 perpendicular
  (crit: x1.18 / x0.88), released over 140ms ease-out cubic
- Spawn the VFX at the **contact point on the victim**, not the victim origin

The scale pop is squash-and-stretch and it is WHY the hit reads as force rather
than a colour change. Vlambeer lists impact effects, hit animation, and knockback
as three separate entries; doing only one is the common shortfall.

Note "sleep" (hit-stop) sits at position 17 of Vlambeer's 30-tip escalation,
AFTER impact effects, hit animation, knockback and camera work. **Hit-stop
amplifies existing feedback; it does not create it.**

---

## Audio carries more perceived impact than visuals

**The evidence is asymmetry in the simultaneity window.** Broadcast standards
(ITU-R BT.1359-1) tolerate audio LAGGING by 125ms but LEADING by only 45ms.
Humans forgive late audio 2 to 3x better than early. So: **fire the hit sound at
or slightly AFTER the visual contact frame, never before**, and up to ~60ms of
Web Audio latency will not read as desync. Do not contort the architecture
chasing audio latency; spend the effort on layering.

**Three-layer model:** transient/attack (few ms, defines material, grabs
attention), body/sustain (low-mid, communicates force and scale), tail/release
(places it in a space). **Snap the loudest peak of each layer to the same point**
-- a few ms of drift smears the impact. Schedule all layers against the SAME
`AudioContext.currentTime` read, not separate ones.

**The compression trap:** a fast compressor attack clamps the transient spike and
kills the punch. Use a slow attack (10 to 30ms) on any bus carrying hits, or bus
hits around the limiter entirely.

**Variation:** pitch +/-80 to 150 cents (below 50 is inaudible, above 200 changes
perceived object size), volume +/-1.5 to 3 dB, **4 to 8 round-robin samples per
material pair**, and **shuffle-with-no-repeat rather than pure random** (pure
random with 6 samples repeats immediately about 1 hit in 6, the most noticeable
failure mode). Crits: pitch DOWN 150 to 250 cents; lower reads as bigger. A crit
that is merely louder is not a crit.

**Silence is a mechanism.** Duck the ambience bus 4 to 8 dB for 150 to 250ms on
a big hit (fast attack, slow release): the hit does not get louder, everything
else gets quieter. And a 40 to 80ms duck BEFORE a heavy impact lands (possible
because windup duration is known in advance) sharply increases perceived impact.

**Headroom budget:** ambience -24 LUFS, routine hits -14, crits -9. WoW's own
failure here is documented: players turn the combat slider down because
"there is so much sound in retail". If everything is loud, nothing is.

**Voice limiting:** cap concurrent hit voices at 8 to 12, cull by distance and
age, 40ms per-source cooldown.

---

## Anticipation: why a frame-1 connect feels worse

Three-phase structure: **anticipation -> active -> recovery**. Anticipation is
30 to 50% of total attack duration and never shorter than ~15 frames for a
threatening move.

Three compounding reasons a windup matters:
1. **Velocity contrast is the force signal.** Force is perceived from
   ACCELERATION. A swing at constant velocity has no acceleration signature.
2. **Anticipation gives the eye a vector and a deadline**, so it arrives at the
   contact point before the hit lands. Without it the eye is still searching when
   the impact frame plays. Hit-stop buys time AFTER contact; anticipation buys it
   BEFORE.
3. **Prediction generates the payoff.** A hit you saw coming and that lands is a
   confirmed prediction. A hit with no windup is just information arriving.

**Telegraph floor:** `250ms (reaction) + RTT + cast/GCD time`.

**Each anticipation must be UNIQUE and hint at its follow-up.** If PRIMUS's
procedural cast animations share a windup shape across abilities, that is a
readability bug independent of impact: the player cannot distinguish what is
coming, so nothing feels distinct when it lands.

| Ability weight | Anticipation | Contact hold | Recovery |
|---|---|---|---|
| Instant filler | 80 to 120ms | 2 frames | 150ms |
| Standard GCD | 200 to 300ms | 3 frames | 250ms |
| Heavy / cooldown | 400 to 600ms | 4 frames | 400ms (cancellable after 150ms) |

**Recovery:** converge every ability's recovery to a SHARED NEUTRAL POSE so
cancels stay clean. Use additive animation layers for hit reactions (the
tab-target-correct way to do flinch), and **remove crossfade on impact** --
crossfading into a hit reaction smears exactly the frame you want sharp.

**Latency budget:** under 100ms end-to-end is necessary for playability; 200ms is
distracting. The 50ms tick already costs ~25ms average quantisation. **Do not
spend the rest on hit-stop that blocks input.** Play the swing locally on
keypress and let the server damage event land later, which is what WoW does.

---

## What WoW does, and why it is not a hit-stop game

That is a CORRECT decision, not an oversight: the server owns the hit (so the
freeze would land on information arrival, not visual contact, at variable RTT);
input cannot be frozen when there are ground effects to dodge; animation is not
the source of truth (abilities interrupt mid-swing and both still hit); and
damage events arrive several times per second per target.

**Key numbers:** baseline GCD 1.5s; energy melee 1.0s; haste floor 0.75s; spell
batch window was 400ms in vanilla and is 10ms in modern Classic. **PRIMUS's 50ms
is 8x better than vanilla and 5x worse than modern Classic** -- defensible, but
above the threshold where simultaneity becomes visible, hence the stagger fix.

**FFXIV's 2.5s GCD versus WoW's 1.5s is the most important design lever here:**
a slower GCD makes every ability weightier. **Ability density and perceived
weight trade off directly.** If combat reads flat while firing 3+ abilities per
second, no amount of hit-stop fixes it -- the reads are colliding.

**What actually creates satisfaction in WoW**, per community diagnosis:
- **Damage number rhythm and scale** was the MOST-cited factor, ahead of
  animation. Retail numbers are smaller and fly off faster than Classic's.
- **Sound as the primary weight signal** (rogue "crunches and snaps").
- Anticipation-impact-recovery in ability animations (Mortal Strike is the
  canonical "chunky" ability).
- **The GCD as a rhythm instrument**: a fixed 1.5s pulse gives combat a BEAT,
  and off-GCD abilities are syncopation against it.
- **Distinct defensive event feedback**: parry, dodge, block, immune and resist
  each get their own text AND sound, so "nothing happened" is never silent.

**The warning:** Legion's melee revamp added sword trails and VFX without fixing
the contact frame, and "the original lack of impact remains, but at least has a
sword trail prior to impact". **Adding VFX on top of a missing contact frame does
not fix impact.**

---

## Floating combat text: PRIMUS already has this, and tuning it is free

The most-cited factor in the whole "meatiness" discussion, and the highest
leverage change available at zero new systems.

| Parameter | Normal | Crit |
|---|---|---|
| Font scale | 1.0 | 1.8 |
| Spawn overshoot | -- | 2.2 -> 1.8 over 100ms |
| Dwell before fade | 900ms | 1400ms |
| Rise distance | 60px | 90px |
| Rise easing | ease-out | ease-out |
| Horizontal scatter | +/-25px | +/-25px |
| Fade | last 300ms | last 400ms |

Ease-out on the rise matters: a linear rise makes numbers hardest to read
exactly when they are most visible.

---

## The 20Hz quantisation fix

Multi-target hits resolved on one tick present simultaneously and read as one
event. Stagger the PRESENTATION deterministically:

```
presentDelayMs = ((targetEntityId * 2654435761) % 5) * 22   // 0,22,44,66,88ms
```

Deterministic (derived from entity id, identical on every client), sub-tick, and
it converts a simultaneous mush into a readable sweep. Apply the same to audio: 5
identical hit sounds on the same sample is a flanged mess; staggered 22ms with
+/-120 cents it reads as five distinct hits.

Do not gate impact VFX on tick boundaries. Interpolate.

---

## Accessibility

**Ranked by sickness risk:** sustained low-frequency camera translation (worst),
camera roll, FOV change, motion blur, short high-frequency shake (mild), and
**hit-stop, which is not a vestibular trigger at all** (no camera translation, no
optic flow).

**Photosensitivity (WCAG 2.3.1):** at most 3 general flashes AND 3 red flashes
per second; a general flash is a pair of opposing luminance changes of >=10% of
max where the darker image is below 0.80. **Area exemption: flashing is safe if
the contiguous area is <= 341x256 CSS px.** Two consequences: a full-screen red
damage vignette pulsing more than 3/sec is a seizure risk and must be
rate-limited; a **per-entity hit flash is almost certainly under the area
threshold and is therefore the PREFERRED flash channel**. The accessible choice
is also the better-looking one.

**`prefers-reduced-motion` sets the DEFAULT, never a hard override.** A player
may set the OS flag for web pages without wanting a flat game, and silently
removing feedback channels is worse than offering them off by default.

**Ship granular independent sliders, not one toggle** (Halo Infinite ships four
separate ones: radial blur, screen shake, full-screen effects, speed lines).

| Setting | Default | Reduced-motion default |
|---|---|---|
| Screen shake | 100 | 0 |
| Camera kick | 100 | 0 |
| FOV punch | 100 | 0 |
| Radial blur | 60 | 0 |
| Chromatic aberration | 40 | 0 |
| Damage vignette | 100 | 40 |
| **Hit-stop** | 100 | **100** |
| **Hit flash** | 100 | **100** |
| **Combat text scale** | 100 | **100** |
| **Gamepad rumble** | 100 | **100** |

**The bolded four stay at full strength under reduced motion.** That is the
answer to "how do I keep impact for players who disable effects":

| Removed | Substitute | Why it works |
|---|---|---|
| Screen shake | Hit-stop | No camera translation, zero vestibular load |
| Screen shake | Per-entity hit flash + scale pop | Localised, under the WCAG area threshold |
| Screen shake | Gamepad rumble | Entirely non-visual, the best substitution |
| Screen shake | Audio emphasis (+3 dB, deeper sub) | Audio carries more perceived impact anyway |
| FOV punch | Damage-number scale-pop overshoot | Same expand-then-settle gestalt |
| Time dilation | Audio low-pass sweep on ambience | The slow-mo read with no visual change |

---

## Time dilation: skip it

Transfers worst. The tick is deterministic and shared; slowing the local render
while the sim continues produces a desync artefact when dilation ends. For a kill
accent build it from locally-owned channels instead: a short camera dolly-in, a
low-pass sweep on the ambience bus for ~300ms, a distinct kill sound with more
sub content, and a held impact flash before ragdoll. That is 80% of the read with
zero sim interaction.

**FFXIV's Gunbreaker cartridge combo is the model that DOES transfer:** its
praised "hitch" is hit-stop achieved through ANIMATION AUTHORING rather than a
timescale freeze. Baking a 2 to 3 frame hold into the animation at the contact
pose gets most of hit-stop's benefit with zero systemic risk.

---

## Recommended order of work

By impact divided by effort-plus-risk:

1. **Tune floating combat text.** Already exists. Zero new systems.
2. **Layer the hit audio.** Transient + body + tail, peak-aligned, round-robin,
   sidechain duck.
3. **Hit-stop.** Presentation-only, local player's direct damage, 300ms
   refractory.
4. **Impact frames.** Flash + non-uniform scale pop at the contact point.
5. **Contact-frame audit of the procedural cast animations.** Distinguishable
   windups, and the damage event must land on the contact pose.
6. **Sub-tick presentation stagger.**
7. **Wire screen shake to combat**, trauma model, directional, behind a slider.
8. **FOV punch.** Last and smallest.
9. **Accessibility sliders**, built alongside each effect rather than retrofitted.

**Steps 1 to 4 involve no camera motion and no post-processing, and should
resolve "reads flat" on their own.** Steps 7 to 8 will feel like a much bigger
deal than they are if done before 1 to 4.

## Sources

[CritPoints on hitstop](https://critpoints.net/2017/05/17/hitstophitfreezehitlaghitpausehitshit/) ·
[Sakurai's Famitsu column on hitstop](https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/) ·
[SmashWiki Hitlag formulas](https://www.ssbwiki.com/Hitlag) ·
[Godot Recipes screen shake](https://kidscancode.org/godot_recipes/4.x/2d/screen_shake/index.html) ·
[idbrii on continuous shake](https://idbrii.com/notes/camera-shake/) ·
[davetech screenshake types](http://www.davetech.co.uk/gamedevscreenshake) ·
[Vlambeer, Art of Screenshake](https://theengineeringofconsciousexperience.com/jan-willem-nijman-vlambeer-the-art-of-screenshake/) ·
[GDKeys, Anatomy of an Attack](https://gdkeys.com/keys-to-combat-design-1-anatomy-of-an-attack/) ·
[Audio-to-video sync thresholds](https://en.wikipedia.org/wiki/Audio-to-video_synchronization) ·
[SFX Engine impact layering](https://sfxengine.com/blog/impact-sound-effect) ·
[warcraft.wiki.gg GCD](https://warcraft.wiki.gg/wiki/Global_cooldown) ·
[Spell batching in 1.13.7](https://www.wowisclassic.com/en/news/spell-batching-impact-ptr/) ·
[MMO-Champion on modern WoW meatiness](https://www.mmo-champion.com/threads/2624679-lack-of-quot-meatiness-quot-in-modern-wow-s-combat) ·
[Kaylriene, Melee Combat and Gameplay Feel](https://kaylriene.com/2019/08/29/melee-combat-and-gameplay-feel/) ·
[Xbox Accessibility Guideline 117](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117) ·
[WCAG 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)

**Caveats from the researcher:** whether WoW uses screen shake / FOV punch / time
dilation is inferred from community sources, not a verified Blizzard statement.
The FOV-punch magnitudes are synthesised (published sources give the parameter
SHAPE -- separate kick-in/kick-out durations and curves -- but no defaults), so
treat that table as a starting point to tune.
