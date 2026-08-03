# IP Pivot Refactor - residual worklist (Z1 follow-up)

> Status: OPEN (created 2026-08-02). Issues are disabled on this repo, so this doc IS the tracker
> for the two player-visible surfaces the `ip_scrub` scanner does not cover. The code rename is
> done and `tests/ip_scrub.test.ts` is green; these residuals keep the Z1 finale PARTIAL until
> scrubbed. Surfaced by the Codex review on PR #1.

## Problem

The IP Pivot Refactor renamed every player-visible Blizzard/WoW name in the sim content and the
English i18n table, and `tests/ip_scrub.test.ts` is green. But that scanner only covers the sim
content `.name` fields plus the resolved-English table (`i18n.resolved.generated/en`). Two other
player-visible surfaces still ship denied names because the scanner does not reach them:

1. **MediaWiki player-wiki seed** (`mediawiki/seed/pages.xml`): a static seed, not regenerated
   from the renamed content, so it still uses pre-rename page titles and link targets.
2. **Non-English locale overlays** left stale by reworded English (the reword-staleness trap the
   `README.md` warns about): rewording an existing English value does not flip its locale rows to
   `pending`, so overlays keep rendering the old name. #1417 caught overlay entries but missed
   guide-hook prose.

## Reproduce

```
rg -n "Frostbolt|Heroic Strike|Mortal Strike|Bristleback|Slimy Murloc Scale|Shadowmeld Tunic" mediawiki/seed/pages.xml
rg -n "Frostbolt" src/ui/i18n.locales/
```

## Actual (verified 2026-08-02)

- `mediawiki/seed/pages.xml`: ~58 occurrences across pages including `Frostbolt (Ability)`,
  `Heroic Strike (Ability)`, `Mortal Strike (Ability)`, `Mind Blast (Ability)`,
  `Hamstring (Ability)`, `Judgement (Ability)`, `Fireball (Ability)`, `Bristleback Hides`,
  `Bristleback Maul`, `Elder Bristleback (Mob)`, `Shadowmeld Tunic`, `Slimy Murloc Scale`.
- `src/ui/i18n.locales/id_ID.ts:9102` (`guide.abilityHook.brain_freeze`) still reads
  "Frostbolt ...". Only `id_ID` carries this exact string, but the reword-staleness class may
  affect other reworded keys/locales.

## Expected

No verbatim-WoW / Blizzard-coined name (per the locked `NAME-MAP.md`) in any player-visible
surface, including the wiki seed and every locale overlay, matching what the sim content and the
English table already enforce.

## Scope

- `mediawiki/seed/pages.xml` and any generator that produces it: regenerate or scrub page titles
  and link targets from the renamed content per the locked `NAME-MAP.md`. The authoritative
  old-name set is the NAME-MAP `old` column plus the scanner's hardcoded verbatim list; do not
  eyeball it.
- `src/ui/i18n.locales/*.ts`: maintainer/release-tier reword-staleness reconciliation (diff
  `i18n.resolved.generated/en` merge-base vs HEAD, re-fill every locale row whose English changed
  but the locale value did not), per `03-COMMIT-AND-VERIFY.md`. Do NOT contributor-hand-edit
  overlays outside that process.
- Out of scope: the code rename (done, scanner green) and the sim/English-table coverage.

## Acceptance criteria

- `mediawiki/seed/pages.xml` contains zero NAME-MAP `old`-column names; ideally regenerated from
  renamed content so it cannot drift again.
- Every reworded ability/item/mob name is reflected in all locale overlays (id_ID
  `guide.abilityHook.brain_freeze` no longer says "Frostbolt").
- `tests/ip_scrub.test.ts` (or a sibling scanner) is extended to also scan
  `mediawiki/seed/pages.xml` and the `src/ui/i18n.locales/` overlays, so both surfaces are gated
  going forward and cannot silently regress.
- The `02-WORKING-MEMORY.md` Z1 row flips from PARTIAL to done once the above are green.

## References

- PR #1 (docs scoping fix that reopened Z1) and its Codex review thread.
- `02-WORKING-MEMORY.md` (Z1 row + residual banner), `NAME-MAP.md` (the locked contract).
