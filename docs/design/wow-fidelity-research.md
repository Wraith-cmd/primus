# WoW Fidelity Research

Research notes for PRIMUS on closing the gap to a World of Warcraft feel: animation,
art direction, combat feel, and content scale.

**Hard constraint, respected throughout.** No Blizzard or WoW assets, names, or extracted
content, ever. Aesthetic direction yes, assets no. Every source named below is CC0,
explicitly permissively licensed, or already credited in `CREDITS.md`. Nothing here asks
you to rip, extract, or reuse anything from a shipped game, and no source of uncertain
provenance is recommended.

Status: research only. No code changed, no dependency added.

---

## How to read this

Recommendations are ranked by value per unit of effort, not by section. Effort is in
weekend sessions, meaning one focused stretch, not a calendar weekend. Every item states
what it actually changes for the player, because "closer to WoW" is not a testable claim
and "the cast bar now tells you whether you can kick it" is.

Where a claim is uncertain, it says so. Where a number came from measuring this repo,
the symbol or path that produces it is named.

---

## Master ranking

| # | Recommendation | Area | Sessions | What the player gets |
|---|---|---|---|---|
| 1 | Widen the `keepClips` allowlist to ship the CC0 clips already merged by the asset pipeline | Animation | 1 to 2 | Distinct cast, channel, attack, dodge, and emote poses instead of three generic spellcast clips |
| 2 | Fire screen shake and a render-only hit-stop on damage you deal in normal PvE | Combat feel | 1 | Every hit lands with weight instead of a number floating off a static model |
| 3 | Surface `uninterruptible`, an icon, and a pushback flash on the cast bar | Combat feel | 1 | Casting becomes readable: you can see what you can kick and when a cast slipped |
| 4 | Per-school damage colors in floating combat text | Combat feel | 0.5 to 1 | Fire reads as fire; a screen full of numbers becomes legible information |
| 5 | Per-slot "not ready" flash plus a soft error click; stop silently swallowing GCD-blocked presses | Combat feel | 0.5 to 1 | Input always answers, which is most of what "responsive" means |
| 6 | Palette and value-contrast pass across `textures.ts` | Art direction | 2 to 3 | The world stops looking like unrelated procedural surfaces and starts looking authored |
| 7 | Author two or three purpose-built cast clips in code, using `build_bow_anims.mjs` as the template | Animation | 2 to 3 | A hardcast with real anticipation, hold, and release beats timed to the cast bar |
| 8 | Cap cast pushback at two per cast | Combat feel | 0.5 | Casting under fire stops being a death spiral |
| 9 | Bake contact shading into procedural geometry via vertex AO and cavity darkening | Art direction | 2 to 4 | Props and terrain get grounded; the flat-lit look goes away |
| 10 | Split melee into windup and impact so damage lands on the contact frame | Combat feel | 2 to 3 | Swings connect instead of resolving before the weapon moves |
| 11 | Rim light on characters and a tone-mapping / value-range pass | Art direction | 1 to 2 | Silhouettes separate from the background at gameplay camera distance |
| 12 | Author real boss mechanics before building the keystone timer | Content | 3 to 5 | The difficulty dial has something to test besides your health bar |
| 13 | Companion depth (Phase 4 as already specced) | Content | 5 to 9 | A party that plays instead of four bodies standing in fire |
| 14 | Keystone run system (Phase 4.5 as already specced) | Content | 6 to 10 | An endgame that regenerates itself from four existing dungeons |
| 15 | External-source retargeting pipeline into Rig_Medium | Animation | 3 to 5 | More clips, at real quality risk. Do not start here |

---

# 1. Animation

## 1.1 The finding that changes everything

**The clips you want are already licensed, already in the build pipeline, and are being
thrown away by an allowlist.**

`scripts/assets/specs/characters_v2.json` merges animations into each player character
GLB from six category libraries of the KayKit Character Animations pack via
`addClipsFrom`:

```
Rig_Medium_General.glb
Rig_Medium_MovementBasic.glb
Rig_Medium_MovementAdvanced.glb
Rig_Medium_CombatMelee.glb
Rig_Medium_CombatRanged.glb
Rig_Medium_Simulation.glb
```

It then renames a handful via `renameClips` and drops everything not in `keepClips`.
`keepClips` holds 22 names. The upstream pack ships 133 to 161 humanoid animations, the
Rig_Medium set being the large majority of them, all CC0
([kaylousberg.com](https://kaylousberg.com/game-assets/character-animations),
[itch.io](https://kaylousberg.itch.io/kaykit-character-animations)). The pack is already
credited in `CREDITS.md` as "Extra character animation library (Rig_Medium)".

Verified by reading the shipped GLBs directly: `public/models/chars/players/mage.glb`,
`knight.glb`, and `druid.glb` each carry exactly the 22 allowlisted clips on a single
skin named `Rig_Medium` with 23 joints:

```
root, hips, upperleg.r, lowerleg.r, foot.r, toes.r, spine, chest,
upperarm.l, lowerarm.l, wrist.l, hand.l, handslot.l, head,
upperarm.r, lowerarm.r, wrist.r, hand.r, handslot.r,
upperleg.l, lowerleg.l, foot.l, toes.l
```

The three spellcast clips the owner is fighting with (`Spellcasting`, `Spellcast_Shoot`,
`Spellcast_Raise`) are `renameClips` targets for `Ranged_Magic_Spellcasting`,
`Ranged_Magic_Shoot`, and `Ranged_Magic_Raise` from `Rig_Medium_CombatRanged.glb`. That
library contains the rest of the magic category too. It was never a case of "the rig only
has three casting clips". It is a case of "the build kept three".

**Why this is a different quality of fix than everything else in this section.** Zero
retargeting. Identical skeleton, identical rest pose, identical bone names, identical
scale, authored by the same artist for the same characters. Every failure mode listed in
section 1.4 is structurally impossible here.

### Recommendation 1: widen the allowlist

**Effort: 1 to 2 sessions. Rank: 1.**

Work involved:

1. Re-download KayKit Adventurers 2.0 and Character Animations 1.1 into `tmp/asset_src/`
   (the spec's `src` paths say exactly where; the packs are free, CC0, and the paid tier
   only buys the Blender source files).
2. Dump the full clip name list out of each `Rig_Medium_*.glb` with `@gltf-transform/core`,
   the same way `build_bow_anims.mjs` reads a donor.
3. Add the clips worth having to `keepClips`, and their engine-side names to `renameClips`.
   Priority order: the remaining magic clips, a channel-shaped clip, hit reactions,
   dodge/roll, crouch, and the emote tail.
4. Add the new names to the `ClipMap` in `src/render/characters/manifest.ts` and to the
   `BaseState` handling in `src/render/characters/anim_state.ts` where a new base state is
   needed.
5. Regenerate the media manifest and check the size delta.

**Risks to check, not to guess at.** Every added clip costs bytes in a GLB that is loaded
per character skin, and the renderer has real budget machinery (`src/render/crowd_lod.ts`,
`src/render/render_budget.ts`, `visual_pool_policy.ts`). Measure the GLB size before and
after and decide the allowlist against that number. `build_assets.mjs` already fails the
build when a `keepClips` entry is missing from the source, so a typo is loud rather than
silent.

## 1.2 Why the three remix attempts failed, and why the additive layer was the right move

Three attempts to make casting look good by remixing 22 clips failed. That is the expected
outcome, and the reason is structural: remixing gives you poses that already exist at
timings that were authored for something else. What a cast needs is a specific timing
shape (build, hold, release) locked to a specific gameplay event (the cast bar filling and
completing), and no amount of blending between `Spellcast_Raise` and `Spellcasting`
produces a release beat that lands on the frame the cast bar finishes.

`src/render/characters/cast_layer_core.ts` already solves this correctly. It produces
additive pose offsets in radians as a function of cast progress, applied after the
`AnimationMixer` writes its sampled pose, with a `smootherstep` windup, a coiling hold,
and an asymmetric release (`RELEASE_ATTACK = 0.18`, fast attack and slow decay). That is
the right architecture and the right instinct. Keep it.

The problem is not that the layer is wrong. It is that **the release beat has nothing to
land against.** See section 3: there is no hit-stop, and outside the Fiesta minigame there
is no screen shake on damage you deal. A snap in the arm with no corresponding pulse in
the frame reads as a twitch, not an impact.

## 1.3 Confirming the hypothesis: body animation matters less than you think

**Confirmed, with one amendment.**

The evidence, from people who do this professionally on this exact art style:

Luis Aguas, a World of Warcraft VFX artist, names three foundational elements of an
effect: "shape language/silhouette, motion/timing, and color/value". His readability test
is a still frame and a greyscale conversion, and his gameplay test is a question about
communication: "Does this hurt? Should I stand in this? Will this heal me?" None of those
are questions about the caster's arms
([80.lv](https://80.lv/articles/world-of-warcraft-vfx-overview-from-luis-aguas)).

Sarah Carmody, on the Dragonflight VFX team, asks the same two questions: "Can you tell
what's going on in your effect in a still screenshot? Does it still make sense if you
convert it to greyscale?" and "Are you being mindful where you direct the viewer's eye
throughout your effect?"
([vfxapprentice.com](https://www.vfxapprentice.com/blog/crafting-vfx-wow-dragonflight)).

The general VFX principle that carries the most weight here is anticipation:
"A powerful spell blinking into existence immediately isn't entertaining. It grows and
pulses with power, having lasting effects before and after casting"
([80.lv](https://80.lv/articles/vfx-staples-shape-color-and-motion)).

**The amendment.** Aguas also says that when a spell has an associated character
animation, he opens the animation team's file and synchronizes his effect to it. So
animation is not irrelevant. It is the **timing skeleton** the effect is hung on. The body
animation's job is three things and no more:

1. Start on the same frame the cast bar starts.
2. Hold a silhouette that is distinguishable from idle for the duration.
3. Have a release beat that lands on cast completion.

`cast_layer_core.ts` already does all three. Past that point, returns collapse hard. This
is the practical statement of the hypothesis, and it should change where the effort goes:

> **Stop iterating on the body. Spend the next three sessions on VFX phases, impact
> feedback, and cast bar readability instead.**

**Where I am uncertain.** I could not find a citable primary source for how few distinct
casting body animations a shipped MMO actually reuses across its whole spell list. My
strong impression, from observing the genre rather than from a source, is that the number
is single digits and that hundreds of spells share them. Treat that as an observation, not
a citation. It does not change the recommendation, which stands on the VFX sources above.

## 1.4 Permissively licensed humanoid animation sources

If, after recommendations 1 and 7, you still want more clips, these are the sources with
licensing clean enough to use.

| Source | License | Notes |
|---|---|---|
| **KayKit Character Animations** ([itch](https://kaylousberg.itch.io/kaykit-character-animations)) | CC0 1.0 | 133 to 161 clips on Rig_Medium and Rig_Large. **This is the rig PRIMUS already uses.** Already in `CREDITS.md`. Free; the paid tier buys only the .blend source |
| **Quaternius Universal Animation Library 1 and 2** ([UAL1](https://quaternius.itch.io/universal-animation-library), [UAL2](https://quaternius.itch.io/universal-animation-library-2)) | CC0 1.0 | ~250 clips combined on a universal humanoid rig, explicitly built for retargeting. FBX, GLB, and .blend. Free tiers of 45 and 42 clips; full library from $9.99 to $14.99. **Almost no magic clips**: UAL is locomotion, parkour, melee combos, guns, farming, fishing. UAL2 does ship combo hits split into individual strikes with recoveries, which is genuinely useful for melee classes. Quaternius packs are already used throughout this repo |
| **Kenney Animated Characters** ([kenney.nl](https://kenney.nl)) | CC0 1.0 | Simple rigged characters with basic clips. Already a credited source in this repo. Low clip variety, not a solution to casting |
| **CMU Graphics Lab Motion Capture Database** ([mocap.cs.cmu.edu](http://mocap.cs.cmu.edu)) | No license fee, permissive, widely used commercially | ~2,548 motions. Raw C3D, ASF/AMC, and BVH; a cleaned MotionBuilder-friendly BVH conversion exists at [cgspeed](https://sites.google.com/a/cgspeed.com/cgspeed/motion-capture/the-motionbuilder-friendly-bvh-conversion-release-of-cmus-motion-capture-database). Realistically proportioned mocap actors, so see the proportion failure mode in 1.5. Almost no fantasy spellcasting; it is walking, running, sports, and dance |
| **Rokoko Motion Library free tier** ([rokoko.com](https://www.rokoko.com/products/motion-library)) | Free assets licensed for commercial use | ~150 to 263 free moves. Verify the current terms yourself before shipping anything from it; the licensing is per-asset and I could not confirm a single blanket grant |

### Mixamo, specifically

Get this right, because the terms are frequently misdescribed.

**What Mixamo actually permits.** Characters and animations may be used royalty free in
personal, commercial, and non-profit projects, including video games. No attribution is
required. There is no licensing or royalty fee. Access requires a free Adobe account
([Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)).

**What Mixamo prohibits.** Characters and animations cannot be redistributed as standalone
assets. They must be incorporated into a project. You may not create blueprints,
templates, or engine asset packages that redistribute the character or animation raw
files as the product, and you may not distribute character or animation raw files in any
way ([Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html),
summarized at [licenseorg.com](https://www.licenseorg.com/guide/3d-assets/mixamo)).

**Why Mixamo is a bad fit for this repo specifically, despite being legal for games in
general.** This is the part most guides miss:

- PRIMUS ships animation as `.glb` files served verbatim out of `public/`, per the repo
  map in `CLAUDE.md`. A clips-only GLB (the `animUrls` pattern that
  `public/models/chars/players/bow_anims.glb` already uses) sitting at a public CDN URL is
  very close to the definition of distributing raw animation files. It is downloadable
  with a single request and directly reusable in any engine.
- The upstream project is open source. Committing a Mixamo-derived GLB to a public git
  repo is redistribution by any reasonable reading.
- Every asset in `CREDITS.md` today is CC0 with a "redistributable: yes" column. Mixamo
  would be the first entry that breaks that invariant, which is a maintenance and audit
  liability out of proportion to the benefit.
- Service continuity is genuinely uncertain. Mixamo had extended outages through 2025 and
  Adobe support gave contradictory answers about whether it is still supported
  ([Adobe community threads](https://community.adobe.com/mixamo-694)). I cannot confirm
  either a shutdown or a commitment to keep it running. Do not build a pipeline whose
  first step is a service you cannot vouch for.

**Verdict: do not use Mixamo here.** Not because it is prohibited for games, but because
this project's distribution model is exactly the case its license carves out, and because
the clips you need are already sitting CC0 in your own build pipeline.

## 1.5 The realistic retargeting pipeline, and its failure modes

If you do retarget an external clip onto Rig_Medium, here is the honest version.

### Pipeline, all free tools

1. **Import** the source clip into Blender (FBX or BVH or GLB).
2. **Import** a KayKit Adventurers character as the target, so you get Rig_Medium exactly
   as the game sees it.
3. **Align rest poses.** If the source is T-pose and the target is not, fix that first, not
   after. Blender addons that handle this: Rokoko Studio Live for Blender (the retargeting
   half is free and does not need a paid account,
   [rokoko/rokoko-studio-live-blender](https://github.com/Rokoko/rokoko-studio-live-blender),
   [support docs](https://support.rokoko.com/hc/en-us/articles/4410463481489-Retarget-an-animation-in-Blender)),
   or [ReNim](https://github.com/anasrar/ReNim) which is node-based and free.
4. **Build the bone mapping** by hand. Rokoko's "Build Bone List" will guess and will guess
   wrong on `.l` / `.r` suffixes and on `upperarm` versus `UpperArm`. Check every row.
5. **Enable Auto Scale** if the armatures differ in size.
6. **Retarget, then bake to keyframes** on every channel you care about. Sampled/baked, not
   constrained: constraints do not survive export.
7. **Strip root translation** unless you specifically want root motion (you do not; see
   below).
8. **Export GLB** with animation sampling on.
9. **Feed it to the existing pipeline.** Either drop it in `addClipsFrom` in the asset spec
   so it merges into the character GLB, or ship it as a clips-only GLB referenced from
   `animUrls` in `src/render/characters/manifest.ts`. Both paths already exist and work.

### Failure modes, in descending order of how much they will hurt

1. **Proportion mismatch. This is the one that kills mocap on this rig, and no tool fixes
   it.** Rig_Medium is a stylized chibi skeleton: 23 joints, no fingers, one spine plus one
   chest, big head, short limbs. Motion recorded off a realistically proportioned human
   retargeted onto stubby limbs self-intersects (hand passes through chest), slides feet,
   and loses reach. A retargeter can match rotations; it cannot invent the arm length the
   motion assumed.
2. **Joint count collapse.** Mixamo rigs carry roughly 65 joints with `Spine`, `Spine1`,
   `Spine2` and full finger chains. Rig_Medium has `spine` and `chest` and no fingers. Every
   torso arc authored across three spine segments flattens into two, and all finger
   performance is discarded. For a casting animation, where the hands are the subject,
   that is most of the performance gone.
3. **Bone naming.** KayKit uses lowercase Blender-style names with `.l` / `.r` suffixes
   (`upperarm.l`). Mixamo prefixes everything with `mixamorig:` and uses `LeftArm`.
   Quaternius UAL uses its own convention. There is no automatic mapping; write the table
   explicitly and check it.
4. **Rest pose mismatch (T-pose versus A-pose).** Retargeters compute rotations relative to
   each skeleton's rest pose. Source authored on a T-pose applied to an A-pose target gives
   arms that hang wrong or rotate outward through the whole clip. Mixamo is T-pose; Unreal's
   mannequin is A-pose; verify KayKit's before assuming
   ([MoCap Online on the T-pose fix](https://mocaponline.com/blogs/mocap-news/tpose-animation-retargeting-fix)).
5. **Root motion.** PRIMUS drives entity position from the deterministic sim
   (`src/sim/player_motion`, mirrored for display by `src/render/self_motion.ts`). Any
   translation baked onto `root` or `hips` will fight it and produce sliding or drift.
   Strip it.
6. **Scale.** Blender to glTF round trips are a known source of bone and mesh scale drift
   ([glTF-Blender-IO #1062](https://github.com/KhronosGroup/glTF-Blender-IO/issues/1062)).
   Always verify against a shipped character in the same scene, never against the source.
7. **glTF export gotchas** ([blender-to-threejs-export-guide](https://github.com/funwithtriangles/blender-to-threejs-export-guide)):
   one armature per file; bake IK to FK; no bendy bones; no "child of" constraints; a
   channel with no value change across the clip can export as zero. And note that this
   repo's own `scripts/build_bow_anims.mjs` explicitly throws on `CUBICSPLINE` samplers, so
   export with linear or step interpolation.

**Effort for the pipeline as a capability: 3 to 5 sessions**, most of it spent on
proportion cleanup, not on tooling. **Rank: 15.** Do not start here.

## 1.6 The other route: author clips in code

`scripts/build_bow_anims.mjs` is the most under-appreciated thing in this repo. It
authors a purpose-built clip with no Blender at all: it samples donor poses off Rig_Medium
at chosen times, lays out an explicit keyframe timeline with named beats and easing, and
writes a clips-only GLB via `@gltf-transform/core` that ships through `animUrls`.

Its header states the timeline in seconds:

```
0.00        idle
0.14        raise the bow + reach the string hand forward (nock)
0.14-0.46   eased pull back to the full-draw hold (the draw)
0.46-0.55   hold at full draw (anticipation)
0.55-0.60   release: the string hand springs PAST the hold, tiny torso kick
0.60-0.95   follow-through, ease back to idle
```

That is exactly the anticipation-build-impact-follow-through shape the VFX sources in 1.3
describe, expressed as data you control to the frame. It is also exactly what remixing
cannot give you: beats at chosen times, synchronized to a gameplay event.

### Recommendation 7: author two or three cast clips this way

**Effort: 2 to 3 sessions. Rank: 7.**

Author a hardcast, a channel, and a big-finisher clip, sampling donor poses from the
widened clip set that recommendation 1 unlocks. Export the release time as a named
constant the way `BOW_RELEASE_AT = 0.55` already is, so the renderer, the VFX, and the
cast bar can all agree on the same frame. Then decide whether `cast_layer_core.ts` stays
as a modifier on top or retires for these three cases.

Do this **after** recommendation 1, because widening the allowlist multiplies the donor
pose library you have to sample from.

---

# 2. Art direction and textures

## 2.1 The principles, stated so they are testable

The style being targeted is hand-painted, high contrast, saturated, low detail but
readable, with strong silhouettes. Here are the actual load-bearing principles, in the
order they matter.

**1. Value structure, not color.** The professional test is the greyscale test: convert the
image to greyscale and check that it still reads. Blizzard's own VFX team states this
directly as their readability check
([vfxapprentice](https://www.vfxapprentice.com/blog/crafting-vfx-wow-dragonflight),
[80.lv](https://80.lv/articles/world-of-warcraft-vfx-overview-from-luis-aguas)). If it
fails in greyscale, no amount of saturation rescues it.

**2. Lighting is baked into the diffuse.** This is the technical core of the look. The
style does not use normal maps for surface detail; ambient occlusion and cavity are baked
and then used as the base layer that the diffuse is painted on top of, so the "lighting"
is permanently in the texture and does not depend on the runtime light rig
([polycount discussion](https://polycount.com/discussion/114888/world-of-warcraft-normal-maps),
[80.lv WoW diorama breakdown](https://80.lv/articles/002mrs-crafting-a-wow-diorama-textures-painting-lighting)).
This is why the style survives at low resolution and on weak hardware, and why it does not
look flat despite flat lighting.

**3. Palette discipline.** A small number of hues, reused everywhere, with saturation
pushed and value spread wide. Discipline means a shared table, not per-asset choices.

**4. Silhouette readability.** Exaggerated proportions exist so a class is recognizable at
a glance from gameplay camera distance. The silhouette does the identification work before
the texture does any.

**5. Texel density consistency.** Texel density is texture pixels per unit of world
surface, commonly expressed as pixels per meter. Consistency matters more than the
absolute number: a mismatch between neighbouring assets is what breaks the illusion
([Beyond Extent deep dive](https://www.beyondextent.com/deep-dives/deepdive-texeldensity),
[Foundry docs](https://learn.foundry.com/modo/content/help/pages/uving/texel_density.html)).

**6. Rim lighting.** A bright edge where the surface normal is near perpendicular to the
view direction. It separates a character from the background and is the cheapest possible
silhouette enhancer ([three.js roadmap](https://threejsroadmap.com/blog/rim-lighting-shader)).

## 2.2 What the repo does now

`src/render/textures.ts` generates every texture at runtime on a canvas, no image files.
The mechanism, from reading it:

- `makeCanvas(size, draw)` produces a `THREE.CanvasTexture` with `RepeatWrapping` and
  `SRGBColorSpace`.
- A module-local LCG (`rnd()`) provides determinism. Not `Math.random`, which is required
  by `src/render/CLAUDE.md`.
- `drawWrapped(ctx, size, fn)` draws at nine wrap offsets so blobs tile seamlessly, and
  `tileHash(a, b)` makes the wrap seam pick matching tile colors.
- `heightToNormal(height, strength)` does a Sobel-style height to tangent-space normal
  conversion with wrap sampling, feeding the `SurfaceMaps { map, normalMap }` generators
  (`barkMaps`, `stoneMaps`, `wallMaps`, `roofMaps`, `plankMaps`, `thatchMaps`, and others).
- There is no Perlin or simplex noise. The noise model is **stochastic stamping**:
  thousands of `fillRect`, `ellipse`, and `stroke` calls at LCG-random positions with random
  alpha, layered. `groundDetailTexture` stamps roughly 5,000 speckles then 1,400 blade
  strokes.
- **Baked contact shading already exists**, hand-authored rather than computed: roughly 25
  `createLinearGradient` / `createRadialGradient` calls place shadow under each roof
  shingle course, darkening under eaves, splash dirt at the base of walls, per-block
  vertical gradients on stone, a sky dome gradient, and per-blade gradients on grass tufts.
- **Palettes are inline hex literals per generator.** Bark base `#6b4a2b`, foliage base
  `#34512f`, ground base `#b8b8b8`. There is no shared palette table.

That last point is the gap. The generator already understands baked shading (principle 2).
What it does not have is principle 3.

## 2.3 What procedural generation can and cannot plausibly achieve here

**Can, comfortably:**

| Principle | Why procedural handles it well |
|---|---|
| Palette discipline | This is what code is best at. A single exported palette table, every generator sampling from it, is strictly easier procedurally than by hand, because a hand painter has to remember and a program cannot forget |
| Value contrast | Value is a computable property. You can literally assert on it (see below) |
| Baked contact shading | Already being done via gradients. A generator knows where its own edges, courses, and bases are, so it can darken them precisely, which is more reliable than a human eyeballing it |
| Texel density consistency | Trivially enforced: the generator picks the canvas size and the material picks the repeat, so density is a computed ratio, not an artist's discipline |
| Rim lighting | A shader concern, not a texture concern, so the procedural texture path is irrelevant to it. Cheap either way |
| Edge and cavity darkening on generated meshes | Where geometry is procedural, curvature is known analytically. Vertex-colour AO is a loop, not an artistic judgment |

**Cannot, and should not be attempted:**

| Principle | Why procedural fails |
|---|---|
| Intentional detail placement | The style's charm comes from an artist deciding *this* plank is cracked and *that* one is not, and putting a brush highlight exactly where the eye should land. Stochastic stamping produces uniform-density noise, which reads as texture rather than as authorship. This is the ceiling |
| Directed eye flow | Carmody's question, "are you being mindful where you direct the viewer's eye", is a composition decision. A generator does not have a composition |
| Iconic silhouettes | Silhouette is a modelling and proportion decision. Procedural generation can vary within a silhouette but cannot invent one worth recognizing |
| Narrative surface detail | Wear patterns that tell you where hands go, scorch marks that tell you what happened. These are authored meanings |

**The honest framing:** procedural generation can get you most of the way to *coherent* and
almost none of the way to *characterful*. Coherent is worth a great deal and you do not
have it yet. Chase coherent.

### Recommendation 6: palette and value-contrast pass

**Effort: 2 to 3 sessions. Rank: 6.**

Concretely:

1. Add a `PALETTE` table to `src/render/textures.ts` (or a sibling module, per the
   module-first rule in `CLAUDE.md`): 8 to 12 named hues with a light, mid, and dark value
   for each. Every generator's inline hex becomes a table lookup.
2. Push saturation and widen the value range as a global transform applied at the palette
   layer, so one constant tunes the whole world.
3. Write a Node test that renders each generator to a canvas, converts to greyscale, and
   asserts a minimum value spread and a maximum mean-value drift between related surfaces.
   **This is the greyscale test as CI.** It makes an art-direction principle into a pinned
   assertion, which is unusual and worth doing precisely because it is unusual.
4. Pin texel density: assert that `canvasSize / worldRepeat` is within a band for every
   material that appears in the same scene.

**What the player gets:** the world stops looking like a set of unrelated procedural
surfaces that happen to be in the same scene, and starts looking like it was made by one
person with one paint set.

### Recommendation 9: bake contact shading into procedural geometry

**Effort: 2 to 4 sessions. Rank: 9.**

`textures.ts` bakes contact shadow into surfaces. Geometry does not get the same
treatment. Where meshes are generated (props, terrain, dungeon kit assembly), compute a
cheap vertex-colour AO term (occlusion by neighbouring geometry, or just a curvature and
downward-facing bias) and multiply it into the vertex colour. This is the geometry-side
half of principle 2, and it is the difference between props sitting on the ground and props
floating above it.

Note that screen-space AO already exists in `src/render/post.ts` via `n8ao`. That is a
different thing: it is view-dependent, tier-gated, and disappears on low settings. Baked
vertex AO is always on and costs nothing at runtime.

### Recommendation 11: rim light and a value-range pass

**Effort: 1 to 2 sessions. Rank: 11.**

A Fresnel rim term on character materials, tuned so it fires at gameplay camera distance
and not in the portrait renderer. Plus a tone-mapping and exposure pass tuned for value
separation rather than realism. `src/render/gfx.ts` already centralizes material creation
via `surfaceMat()` and shared uniforms, so this lands in one place.

Test it the way the sources say to test it: screenshot at gameplay distance, convert to
greyscale, and check the character separates from the terrain.

---

# 3. Combat feel

## 3.1 What each item is, and which side of the seam it lives on

"Client feel" means it can be wrong without the game being wrong; it changes perception.
"Sim rules" means it changes outcomes and must be deterministic. In PRIMUS this distinction
is load-bearing: `src/sim/` is a deterministic 20 Hz tick with all randomness through
`Rng`, and anything touching it must stay reproducible.

| Item | Concern | Note |
|---|---|---|
| Global cooldown | **Sim rules** | Determines what you can press |
| Spell queueing | **Sim rules**, felt as client feel | The queue window must resolve identically on every host; the *feeling* it produces is why it exists |
| Input buffering (non-ability) | Client feel | Movement, jump |
| Cast bars | Client feel | Pure display of sim state |
| Cast pushback | **Sim rules** | Changes cast completion time |
| Animation cancelling | Client feel in this genre. See 3.3 | |
| Latency compensation | Client feel | Never allowed to change outcomes |
| Damage numbers, floating combat text | Client feel | |
| Screen shake | Client feel | Must be reduced-motion aware |
| Hit-stop | Client feel, **and a determinism trap** | See 3.4 |

## 3.2 HAVE / MISSING

Audited against the repo. Constants quoted are the real shipped values.

### HAVE

| Feature | Where | Detail |
|---|---|---|
| Global cooldown | `src/sim/types.ts` (`GCD`, `MIN_GCD`), `sim.ts` (`playerGcdFor`), `src/sim/combat/casting_lifecycle.ts` | `GCD = 1.5`, `MIN_GCD = 0.75`, rogue `1.0`. Haste-scaled: `Math.max(MIN_GCD, playerGcdFor(cls) / spellHasteMult(p))`. Arms at cast **start**, never shortens a running GCD. `offGcd` flag on 41 abilities; separate `onNextSwing` mechanic. **This matches live WoW exactly**: 1.5 s standard, 1.0 s for energy melee, haste floor 0.75 s since Legion ([warcraft.wiki.gg](https://warcraft.wiki.gg/wiki/Global_cooldown)) |
| Spell queueing | `src/sim/types.ts` (`CAST_QUEUE_WINDOW_SEC`), `casting_lifecycle.ts` (`fireQueuedCast`) | `0.4` seconds, single slot, holds through a running GCD and retries every tick rather than dropping. **This matches WoW's `SpellQueueWindow` default of 400 ms, which Blizzard also hard-caps at 400** ([Wowpedia CVar page](https://wowpedia.fandom.com/wiki/CVar_SpellQueueWindow), [Maxroll](https://maxroll.gg/wow/resources/spell-queue-window)) |
| Cast bars | `src/render/cast_bar.ts`, `src/ui/cast_bar_painter.ts`, `src/render/nameplate_painter.ts` | Player, target, and nameplate bars. Channels drain, hardcasts fill. Fishing shows a constant full bar deliberately, so it carries no bite timing |
| Cast pushback | `src/sim/types.ts` (`CAST_PUSHBACK_SEC`, `CHANNEL_PUSHBACK_FRACTION`), `casting_lifecycle.ts` (`pushbackCast`) | `0.5` s per hit on casts, `25%` of remaining on channels. Grows `castTotal` too, so the bar does not jump backwards. Misses and full absorbs do not push back. Immunities via `uninterruptible`, `cast_shield` auras, talent `damagePushbackImmune`, and item-set `castPushbackReduction`. **The per-hit numbers match classic exactly** ([Vanilla WoW wiki, Casting Speed](https://vanilla-wow-archive.fandom.com/wiki/Casting_Speed)) |
| Channels, interrupts, school lockout | `casting_lifecycle.ts`, `src/sim/combat/effect_dispatch.ts`, `src/sim/combat/cc.ts` (`isLockedOut`) | Lockouts 4 to 6 s, run through `diminishedCrowdControlDuration`, so **interrupt DR exists**. Physical school exempt. `rageOnInterrupt` for warriors |
| Floating combat text | `src/ui/fct_core.ts`, `fct_event.ts`, `fct_painter.ts` | Head-anchored in world space (`FCT_ANCHOR_HEAD_OFFSET = 2.2`), not a scroll list. Pooled at 64, FIFO. `FCT_TTL_MS = 1250`, `FCT_RISE_PX = 76`, `FCT_JITTER_RANGE = 30`. Crits get a separate class, larger font, and a longer rise. Miss, dodge, parry, resist, absorb, heal, xp, honor all differentiated |
| Screen shake | `src/render/renderer.ts` (`addShake`) | Trauma-squared model, decay `1.8`/s, no-op under reduced motion |
| Camera kick | `src/render/camera_feel_core.ts` (`punchFov`) | `PUNCH_DECAY = 6`, FOV offset clamped to `[-8, +12]` |
| Low-health vignette | `src/ui/low_health.ts` | Threshold `0.35`, pulse `0.6` to `2.0` Hz |
| Low-resource pulse | `src/ui/low_resource.ts` | Threshold `0.25`, mana and energy only |
| Projectile travel time | `src/sim/projectile_travel.ts` | `PROJECTILE_SPEED = 26` yd/s, homing, `PROJECTILE_MAX_FLIGHT = 3` s. **Damage resolution is deferred to the landing tick**, so the number pops with the visual. This is a genuinely good piece of work and it is the melee gap in 3.5 stated in reverse |
| Impact VFX and sound | `src/render/vfx.ts`, `src/ui/combat_sfx.ts` | Pooled `THREE.Points`, `CAPACITY = 4096`, school-tinted. Per-school cast/projectile/impact SFX triples, swing and impact cue cooldowns of `0.08` and `0.05` s, crit and block and dodge and parry cues, per-mob-family voice cues, looping cast sounds with a `0.2` s fade |
| Cooldown UI | `src/ui/hud/action_bar/action_bar_view.ts`, `action_bar_painter.ts` | CD and GCD share one conic-gradient sweep. CD text above 1 s. Charges with a recharge strip. `unusable`, `oor`, `queued`, `proc`, `empowered` classes. **Out of range and out of mana coloring both exist** |
| Targeting | `src/sim/tab_target.ts`, `src/ui/target_of_target.ts`, `src/render/nameplate_*.ts`, `src/render/nameplate_threat.ts`, `src/ui/meters.ts` | Deterministic camera-free tab targeting with a flared cone (45 deg near, 60 deg far) and two bands. Target-of-target frame. Nameplates with declutter. Threat tinting plus a threat meter reading the real hate table |
| Autoattack | `src/sim/combat/auto_attack.ts`, `src/ui/swing_timer.ts` | Main hand and off hand independent swing timers, haste-scaled. Auto Shot 8 yd dead zone. White-hit table from a single `rng.next()`. Swing timer bar in the HUD |
| Render interpolation | `src/render/net_interp_core.ts`, `self_motion.ts`, `src/game/self_alpha_lead.ts` | `DEFAULT_NET_INTERVAL_MS = 120`, `POS_EXTRAPOLATION_CAP = 1.25` on a measured cadence. Bounded self pose extrapolation |

### MISSING

| Feature | Concern | Effort | What it would change |
|---|---|---|---|
| **Screen shake on damage you deal, outside the Fiesta minigame** | Client feel | 0.5 | Currently `addShake` on damage dealt is gated to the Fiesta minigame path. In normal PvE, dealing a crit shakes nothing. This is the single largest cheap feel gap in the repo |
| **Hit-stop / hit-pause / freeze frames** | Client feel, determinism trap | 1 | Nothing in `src/` implements time dilation. This is the primitive that makes a hit feel like a hit ([Juice It or Lose It, GDC Europe 2012](https://www.gdcvault.com/play/1016487/juice-it-or-lose)) |
| **Cast bar interruptible indication** | Client feel | 0.5 | `uninterruptible` exists in `src/sim/types.ts` and is never surfaced. You cannot see whether a cast can be kicked |
| Cast bar spell icon | Client feel | 0.5 | Name text only today |
| Cast bar pushback flash and interrupted hold | Client feel | 0.5 | Pushback happens invisibly |
| Channel tick marks on the bar | Client feel | 0.5 | Channels drain smoothly with no indication of where the ticks land |
| **Per-school damage colors in FCT** | Client feel | 0.5 to 1 | Colors are by kind (ability vs autoattack vs taken vs heal vs absorb), not by school. A busy fight is a wall of yellow |
| **Per-slot "not ready" flash** | Client feel | 0.5 | A failed press produces a toast. A GCD-blocked press is **silently dropped** with a `// silent, classic spams this` comment. Silent is correct for spam suppression but wrong for feedback: WoW flashes the button red |
| School lockout surfaced on the action bar | Client feel | 1 | Lockout exists in sim, invisible in UI |
| **Cast pushback cap** | Sim rules | 0.5 | Classic capped pushback at the first two hits, total 1.0 s ([Vanilla WoW wiki](https://vanilla-wow-archive.fandom.com/wiki/Casting_Speed)). PRIMUS has no counter, so every qualifying hit pushes back again forever |
| **Melee windup to impact split** | Sim rules | 2 to 3 | Melee resolves on the same tick the swing fires. Projectiles already defer correctly |
| Swing-arc weapon trails | Client feel | 2 | `src/render/weapon_vfx.ts` has rarity-tier ambient effects, not per-swing arcs |
| Screen flash on damage taken | Client feel | 0.5 | Only the vignette exists |
| Low-health heartbeat SFX | Client feel | 0.5 | |
| Client-side ability prediction | Client feel | 5+ | GCD and cooldowns are wire-mirrored from the server (`src/net/online.ts`). No rollback, no reconciliation. See 3.6 for why this may not matter |
| Shared tween / easing module | Neither, a refactor | 1 | Easing is reimplemented per module. A rule-of-three case, not a feel item |

## 3.3 Animation cancelling: what it actually is in this genre

This is worth stating clearly, because the term is imported from fighting games and action
games where it means something different.

In WoW there is no animation cancelling as a mechanic, because the ability and the
animation are decoupled: the ability fires when the server says so and the animation plays
because the ability fired. You cannot make an ability come out faster by interrupting its
animation, and there is nothing to cancel. What players call "animation cancelling" in
MMO-likes is usually one of: instant-cast weaving into the GCD, off-GCD abilities firing
during a GCD, or moving to cancel a cast.

PRIMUS already models all three: `offGcd` on 41 abilities, the `onNextSwing` queue, and
cast cancellation. What it has is renderer-side clip pre-emption in
`src/render/characters/visual.ts` (`playOneShot` stops and resets a re-triggered action,
`FADE = 0.22`, `ONESHOT_FADE = 0.1`, `clampWhenFinished = true` specifically to avoid a
T-pose pop), which is the correct implementation of the thing.

**Conclusion: this is a non-gap.** Do not spend effort here.

## 3.4 Hit-stop, and the determinism trap

Hit-stop (freezing or heavily slowing the frame for 40 to 120 ms on a significant impact)
is the highest-value missing feel primitive in the repo. It is also the one most likely to
break something important if implemented carelessly.

**It must be render-only.** `src/sim/` is a fixed 20 Hz tick and its determinism is
enforced by `tests/architecture.test.ts`. Any global time dilation that touches sim `dt`
makes the same seed produce a different world, which is the one thing that cannot happen
here.

The safe implementation: a render-side scalar that scales the `AnimationMixer` update
delta and the VFX time step for a short window, leaving `Sim.tick()` untouched. Trigger it
on crits and on damage above a fraction of the target's max HP, the same gate the existing
open-world shake already uses. Respect reduced-motion the way `addShake` does.

### Recommendation 2: shake and hit-stop on damage dealt

**Effort: 1 session. Rank: 2.**

Two changes: ungate the damage-dealt shake so it fires in normal PvE with the same
crit-or-heavy-hit condition the damage-taken path already uses, and add a render-only
hit-stop pulse on the same trigger.

**What the player gets:** this is the change most likely to make the game feel different in
the first ten seconds of play. Right now, the arm snaps (`cast_layer_core.ts`), the
particle fires (`vfx.ts`), the sound plays (`combat_sfx.ts`), the number floats
(`fct_painter.ts`), and the frame does not move. Every other layer is already doing its
job. The frame is the missing one.

## 3.5 The melee timing gap

Projectiles are handled correctly: `src/sim/projectile_travel.ts` defers the entire
resolution (hit roll, crit roll, `dealDamage`, `runEffects`) to the landing tick, so the
damage number appears when the bolt arrives. Melee does not do this. The swing animation
starts and the damage resolves in the same tick, meaning the number appears before the
weapon has moved.

### Recommendation 10: split melee windup and impact

**Effort: 2 to 3 sessions. Rank: 10.**

This is sim-side and touches the hit table, so it needs real tests. The shape: schedule a
melee resolution a fixed number of ticks after the swing starts, the way
`projectile_travel` already schedules a landing, sized to the contact frame of the clip
(one to three ticks, so 50 to 150 ms). Rolls must happen at resolution time, not at swing
time, or the deferred result stops being deterministic with respect to intervening events.

**Why it is rank 10 and not higher:** it is the correct thing, and it is also the change
with the highest chance of introducing a subtle balance or determinism regression. Do
recommendations 2, 3, 4, 5, and 8 first. They deliver more felt improvement for a tenth of
the risk.

## 3.6 Latency compensation, and why it may be a non-problem here

PRIMUS inherits the authoritative-server architecture: clients stream intent at 20 Hz, the
server runs the sim, the client renders. GCD and cooldowns are mirrored from the wire, not
predicted (`src/net/online.ts`). There is no rollback and no reconciliation.

But PRIMUS is a private single-player fork, and `src/game/offline_mode_gate.ts` already
contains an in-process local `Sim` with zero network latency, gated behind
`isOfflineModeAvailable(isDev)`.

**The interesting question is not "how do we add prediction", it is "should the single
player build run the sim in-process".** In-process the round trip is zero, which is better
than any prediction scheme can achieve, and the whole category of problems disappears.

Research context for why this matters: experienced players begin to perceive input lag
past roughly 100 ms, with performance falling off past 120 ms
([Springer, latency perception thresholds](https://link.springer.com/chapter/10.1007/978-3-319-58475-1_4)).
For reference on how much this dominates feel: WoW Classic originally batched all
unit-on-unit actions into 400 ms windows, and reducing that window to 10 ms in patch
1.13.7 was widely described as making the game noticeably more responsive with no other
change ([Wowhead](https://www.wowhead.com/classic/news/how-the-spell-batching-change-in-1-13-7-impacts-everything-in-wow-classic-320587)).
Nothing about the abilities changed. Only when they resolved.

**Recommendation, not ranked because it is a decision rather than a task:** decide
explicitly whether single-player PRIMUS runs the sim in-process or over a loopback socket.
If in-process, delete client prediction from the roadmap permanently. If loopback, measure
the actual round trip before assuming it needs compensating. The dev gate note in
`offline_mode_gate.ts` says production must not expose offline mode, which is correct for
the upstream multiplayer project and may be exactly the wrong constraint for a private
single-player fork. That is a fork-level decision worth making deliberately.

---

# 4. Content scale, honestly

## 4.1 What real MMOs ship

Vanilla World of Warcraft, patch 1.12, the target being evoked:

- **40 zones** ([Dot Esports](https://dotesports.com/wow/news/all-wow-classic-zones-by-level))
- **20 dungeons**, excluding expansion additions, plus raids
  ([wowisclassic](https://www.wowisclassic.com/en/dungeon-guide/))
- **Thousands of quests.** I could not find an authoritative count for exactly 1.12 and
  will not invent one. The Wowhead Classic database is the closest primary source
  ([wowhead.com/classic/database](https://www.wowhead.com/classic/database)). Community
  figures cluster in the low thousands; treat anything more precise as unverified
- **9 classes**, each with dozens of abilities across multiple ranks

Team size that produced it: roughly 60 developers at launch in 2004, 100 to 300 by 2018,
and over 500 by 2024 when the WoW team unionized wall to wall
([Game Developer](https://www.gamedeveloper.com/production/over-500-blizzard-entertainment-workers-form-wall-to-wall-union)).
Blizzard also acquired Proletariat and moved its ~100 staff onto the WoW team for
Dragonflight ([Laptop Mag](https://www.laptopmag.com/news/wow-plans-to-add-100-new-staff-members-via-blizzard-acquisition-what-does-this-mean-for-dragonflight)).

**The multiple: WoW at launch had roughly 60 people working full time for four to five
years. A single developer working slow weekends with AI assistance is not within one order
of magnitude of that. Not two orders, arguably.** Any plan whose success condition is
"ship a comparable amount of authored content" fails on arithmetic before it fails on
anything else.

## 4.2 What the compression looks like when it works

The reference points that matter are not other MMOs, they are games that got enormous
playtime from small authored content sets.

- **Hades**: about 20 people at Supergiant, roughly three years. Four biomes, fixed boss
  order. Players report 30 to 40 hours to credits and around 80 to the epilogue
  ([Supergiant on their process](https://www.gamedeveloper.com/design/supergiant-s-fourth-outing-i-hades-i-introduces-a-more-mature-organized-dev-process))
- **Slay the Spire**: Mega Crit started as two people with no publisher or funding. Players
  routinely report 400+ hours ([Wikipedia](https://en.wikipedia.org/wiki/Slay_the_Spire),
  [Mega Crit](https://www.megacrit.com/team/))

And the most directly relevant data point of all: **WoW's own endgame does this.** A Mythic+
season runs on eight dungeons, of which four are typically reused from previous
expansions, and those eight dungeons carry an entire season of endgame progression,
gearing, and rating for millions of players
([Midnight Season 1 rotation](https://onlyfarms.gg/guides/midnight-all-dungeons/),
[dungeon rotation overview](https://blazingboost.com/wow-boost/wow-midnight-mythic-plus-dungeon-rotation)).
Blizzard, with 500 developers, chose to make its flagship endgame out of eight rooms and a
difficulty dial. Not because it could not build more. Because run-based replay is where the
playtime-per-authored-hour is.

## 4.3 The case FOR run-based content as the right compression

I have read `PRIMUS_PHASE_4_5.md`. The argument for it is strong, and stronger than the
document itself claims, for reasons the document does not make explicit.

**1. The machinery already exists.** The spec's own inventory table is accurate: instanced
dungeons with lockouts, per-dungeon difficulty scaling, a themed affix system, a role queue,
an in-sim companion, difficulty-scaled loot with a currency vendor, and deeds. The delta is
a keystone item, a timer, a scaling curve, and an affix rotation. The spec estimates 6 to 10
sessions on top of a working party. That estimate looks honest to me.

**2. Difficulty is a procedural axis, and procedural axes are the only thing that scale
with a single developer's time.** Every keystone level is new content in the only sense
that matters (a fight you have not yet won) and costs zero authoring. This is the same
trade the palette work in section 2 makes: coherent systems beat authored volume when you
have one person.

**3. Solo removes the coordination tax that normally gates run-based content.** M+ is
famously bottlenecked on finding four other people who want to do the same key. A solo
player with AI companions has zero scheduling cost, which makes short-session, high-repeat
content strictly more suited to slow weekends than a long authored questline is. You can
start and finish a keystone in one sitting. You cannot start and finish a zone.

**4. Failure is content.** In authored content, failing means repeating something you have
already seen. In run-based content, failing means the next attempt is a different run. That
converts the owner's most limited resource, session count, into the thing the design
consumes.

## 4.4 The case AGAINST, which you should hear before committing

Two objections, one weak and one serious.

**The weak objection: run-based is not what "a full single player WoW" means.** It is
partially right. What people usually mean by that phrase is the *journey*: the leveling
curve, the zones opening one after another, the sense of a world with places in it, the
quest that sends you somewhere you have not been. Keystone runs supply none of that. If
Phase 4.5 ships and nothing else does, the result is a competent solo dungeon crawler
wearing an MMO's UI, and the specific feeling the owner is chasing will still be missing.

It is a weak objection because it is an argument about sequencing, not about whether to
build it. Zones and quests are the highest-authoring-cost content in the genre, and they
are consumed once. They are exactly the wrong thing for a solo developer to build first,
and exactly the right thing to accumulate slowly over years while the replayable loop
carries the playtime in between.

**The serious objection, which the spec itself raises: a timer is not a mechanic.** The
spec's own "load-bearing risk" section says it: what makes M+ good is encounters with
mechanics worth executing and a party that plays like players. A keystone level applied to
a mob with no mechanics produces a health bar that takes longer to delete and kills you
faster. That is not difficulty, it is arithmetic, and it stops being interesting around the
third run.

The spec identifies companion quality as the gate and prices it at 5 to 9 sessions, which
is right and honest. **What it does not price is the encounter side of the same risk.** The
`KEYSTONE_STEP = 1.08` curve is fine, but it multiplies whatever mechanical content already
exists in those four dungeons. If a boss has one telegraph and no phases, scaling it to +15
scales one telegraph.

### Recommendation 12: mechanics before the timer

**Effort: 3 to 5 sessions. Rank: 12.**

Before building the keystone system, author three to five real mechanics per dungeon boss:
a telegraphed ground effect that must be dodged, a cast that must be interrupted, an add
that must be swapped to, a soft enrage that must be answered with a cooldown. The affix
list in the spec (Bolstering, Sanguine, Raging, Tyrannical/Fortified) is well chosen
precisely because each one pressures a decision rather than a number, but affixes pressure
decisions that already exist. Give them something to pressure.

This also directly de-risks the companion work, because the companion behaviours the spec
lists (avoid ground effects, interrupt, target swap, threshold heal) only demonstrate their
value against encounters that punish not doing them. Building mechanics first means the
companion work has an acceptance test.

## 4.5 The verdict

**Build it, in this order, and be explicit that it is the endgame and not the game.**

1. Combat feel (recommendations 2 through 5 and 8). About 4 sessions total. This makes every
   subsequent hour of play better, including all the play you have already built, and it is
   the cheapest ratio in this entire document.
2. Animation clips (recommendation 1). 1 to 2 sessions.
3. Boss mechanics (recommendation 12). 3 to 5 sessions.
4. Companion depth (recommendation 13, Phase 4 as specced). 5 to 9 sessions.
5. Keystone system (recommendation 14, Phase 4.5 as specced). 6 to 10 sessions.
6. Art direction (recommendations 6, 9, 11). 5 to 9 sessions, and it can interleave with any
   of the above because it touches nothing they touch.

That is roughly 24 to 39 sessions to a game with an endgame that regenerates itself. Then
add zones and quests slowly, forever, at whatever rate is enjoyable, because at that point
the replayable loop is carrying the playtime and every authored zone is pure upside rather
than the only thing holding the game up.

**The one thing to keep saying out loud:** run-based content is the right compression for
*hours per session authored*, and it is not a substitute for the feeling of a world. Both
are worth building. Only one of them can be built in a reasonable number of weekends, and
it should be built first so the other one has somewhere to live.

---

## Sources

Animation and licensing

- [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)
- [LicenseOrg summary of the Mixamo license](https://www.licenseorg.com/guide/3d-assets/mixamo)
- [Adobe Mixamo community forum](https://community.adobe.com/mixamo-694)
- [KayKit Character Animations (kaylousberg.com)](https://kaylousberg.com/game-assets/character-animations)
- [KayKit Character Animations (itch.io)](https://kaylousberg.itch.io/kaykit-character-animations)
- [KayKit Character Pack: Adventurers (GitHub)](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0)
- [Quaternius Universal Animation Library](https://quaternius.itch.io/universal-animation-library)
- [Quaternius Universal Animation Library 2](https://quaternius.itch.io/universal-animation-library-2)
- [Kenney assets](https://kenney.nl)
- [CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu)
- [cgspeed MotionBuilder-friendly BVH conversion of the CMU database](https://sites.google.com/a/cgspeed.com/cgspeed/motion-capture/the-motionbuilder-friendly-bvh-conversion-release-of-cmus-motion-capture-database)
- [Rokoko Motion Library](https://www.rokoko.com/products/motion-library)
- [AMASS license, non-commercial research only, listed as a warning not a recommendation](https://amass.is.tue.mpg.de/license.html)

Retargeting and export

- [Rokoko Studio Live for Blender (GitHub)](https://github.com/Rokoko/rokoko-studio-live-blender)
- [Rokoko: retarget an animation in Blender](https://support.rokoko.com/hc/en-us/articles/4410463481489-Retarget-an-animation-in-Blender)
- [ReNim, free node-based Blender retargeting](https://github.com/anasrar/ReNim)
- [MoCap Online: T-pose fix in retargeting](https://mocaponline.com/blogs/mocap-news/tpose-animation-retargeting-fix)
- [blender-to-threejs-export-guide](https://github.com/funwithtriangles/blender-to-threejs-export-guide)
- [glTF-Blender-IO issue 1062, bone scale on export](https://github.com/KhronosGroup/glTF-Blender-IO/issues/1062)

Art direction and VFX

- [80.lv: World of Warcraft VFX overview from Luis Aguas](https://80.lv/articles/world-of-warcraft-vfx-overview-from-luis-aguas)
- [VFX Apprentice: crafting the VFX of Dragonflight](https://www.vfxapprentice.com/blog/crafting-vfx-wow-dragonflight)
- [80.lv: VFX staples, shape, color and motion](https://80.lv/articles/vfx-staples-shape-color-and-motion)
- [80.lv: crafting a WoW diorama, textures, painting, lighting](https://80.lv/articles/002mrs-crafting-a-wow-diorama-textures-painting-lighting)
- [Polycount: World of Warcraft normal maps discussion](https://polycount.com/discussion/114888/world-of-warcraft-normal-maps)
- [Beyond Extent: texel density deep dive](https://www.beyondextent.com/deep-dives/deepdive-texeldensity)
- [Foundry: texel density](https://learn.foundry.com/modo/content/help/pages/uving/texel_density.html)
- [three.js MeshToonMaterial](https://threejs.org/docs/pages/MeshToonMaterial.html)
- [three.js roadmap: rim lighting shader](https://threejsroadmap.com/blog/rim-lighting-shader)

Combat feel

- [Warcraft Wiki: global cooldown](https://warcraft.wiki.gg/wiki/Global_cooldown)
- [Wowpedia: CVar SpellQueueWindow](https://wowpedia.fandom.com/wiki/CVar_SpellQueueWindow)
- [Maxroll: spell queue window](https://maxroll.gg/wow/resources/spell-queue-window)
- [Vanilla WoW wiki: casting speed and pushback](https://vanilla-wow-archive.fandom.com/wiki/Casting_Speed)
- [Wowhead: how the 1.13.7 spell batching change impacts everything](https://www.wowhead.com/classic/news/how-the-spell-batching-change-in-1-13-7-impacts-everything-in-wow-classic-320587)
- [GDC Vault: Juice It or Lose It, Jonasson and Purho, GDC Europe 2012](https://www.gdcvault.com/play/1016487/juice-it-or-lose)
- [Juice It or Lose It, video](https://www.youtube.com/watch?v=Fy0aCDmgnxg)
- [GDC Vault: Don't Juice It or Lose It, the counterargument](https://gdcvault.com/play/1020861/Don-t-Juice-It-or)
- [Springer: Are 100 ms Fast Enough? Latency perception thresholds](https://link.springer.com/chapter/10.1007/978-3-319-58475-1_4)

Content scale

- [Dot Esports: all WoW Classic zones by level](https://dotesports.com/wow/news/all-wow-classic-zones-by-level)
- [wowisclassic: Classic dungeon guides](https://www.wowisclassic.com/en/dungeon-guide/)
- [Wowhead Classic database](https://www.wowhead.com/classic/database)
- [Game Developer: over 500 Blizzard workers form wall-to-wall union](https://www.gamedeveloper.com/production/over-500-blizzard-entertainment-workers-form-wall-to-wall-union)
- [Laptop Mag: Proletariat's 100 staff join the WoW team](https://www.laptopmag.com/news/wow-plans-to-add-100-new-staff-members-via-blizzard-acquisition-what-does-this-mean-for-dragonflight)
- [Game Developer: Supergiant's process on Hades](https://www.gamedeveloper.com/design/supergiant-s-fourth-outing-i-hades-i-introduces-a-more-mature-organized-dev-process)
- [Wikipedia: Slay the Spire](https://en.wikipedia.org/wiki/Slay_the_Spire)
- [Mega Crit team page](https://www.megacrit.com/team/)
- [GDC Vault: Slay the Spire, metrics driven design and balance](https://www.gdcvault.com/play/1025731/-Slay-the-Spire-Metrics)
- [Midnight Season 1 Mythic+ dungeon rotation](https://onlyfarms.gg/guides/midnight-all-dungeons/)
- [Mythic+ dungeon rotation overview](https://blazingboost.com/wow-boost/wow-midnight-mythic-plus-dungeon-rotation)

Repo files read for this research

- `PRIMUS_PHASE_4_5.md`
- `CLAUDE.md`, `CREDITS.md`
- `scripts/assets/specs/characters_v2.json`, `scripts/assets/build_assets.mjs`
- `scripts/build_bow_anims.mjs`
- `public/models/chars/players/*.glb` (clip and joint enumeration via `@gltf-transform/core`)
- `src/render/textures.ts`, `src/render/characters/cast_layer_core.ts`,
  `src/render/characters/manifest.ts`, `src/render/characters/visual.ts`
- `src/sim/types.ts`, `src/sim/combat/casting_lifecycle.ts`, `src/sim/projectile_travel.ts`,
  `src/sim/combat/auto_attack.ts`, `src/sim/tab_target.ts`
- `src/render/cast_bar.ts`, `src/render/renderer.ts`, `src/render/camera_feel_core.ts`,
  `src/render/vfx.ts`
- `src/ui/fct_core.ts`, `src/ui/fct_painter.ts`, `src/ui/combat_sfx.ts`,
  `src/ui/hud/action_bar/action_bar_view.ts`, `src/ui/low_health.ts`
- `src/game/offline_mode_gate.ts`, `src/net/online.ts`
