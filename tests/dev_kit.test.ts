import { describe, expect, it } from 'vitest';
import { DEV_KIT_ROLE_COUNT, DEV_KIT_ROLES, devKitRole } from '../src/sim/content/dev_kit_roles';
import { talentsFor } from '../src/sim/content/talents';
import { ITEMS } from '../src/sim/data';
import {
  applyDevKit,
  buildDevKit,
  DEV_KIT_EXCLUDED_DUNGEON,
  DEV_KIT_LEVEL,
  dungeonLootIds,
  isFreshTwentyItem,
} from '../src/sim/dev_kit';
import { canDualWield } from '../src/sim/equipment_rules';
import { Sim } from '../src/sim/sim';
import { ALL_CLASSES, type PlayerClass } from '../src/sim/types';

// These presets exist so a tester can gear up in one click instead of being kitted
// out through the database, and so a Gravewyrm Sanctum balance run measures the
// ENCOUNTER rather than whatever gear happened to be lying around.

function everySpec(): { cls: PlayerClass; spec: string }[] {
  const out: { cls: PlayerClass; spec: string }[] = [];
  for (const cls of ALL_CLASSES) {
    for (const spec of talentsFor(cls)?.specs ?? []) out.push({ cls, spec: spec.id });
  }
  return out;
}

describe('dev kit role table', () => {
  it('covers all 27 class-and-spec pairs', () => {
    expect(everySpec()).toHaveLength(DEV_KIT_ROLE_COUNT);
    const missing = everySpec().filter(({ cls, spec }) => devKitRole(cls, spec) === null);
    expect(missing).toEqual([]);
  });

  it('declares no spec the talent tree does not have', () => {
    // Guards the other direction: a typo'd or renamed spec id here would silently
    // produce a preset nobody can reach.
    const real = new Set(everySpec().map(({ cls, spec }) => `${cls}/${spec}`));
    const declared = Object.entries(DEV_KIT_ROLES).flatMap(([cls, roles]) =>
      roles.map((role) => `${cls}/${role.spec}`),
    );
    expect(declared.filter((key) => !real.has(key))).toEqual([]);
  });

  it('never claims dual-wield for a spec the equip rules refuse', () => {
    // This exact mismatch shipped once during development: shaman/enhancement asked
    // for a second weapon, canDualWield said no, and the spec silently lost its
    // offhand entirely rather than falling back to a held item.
    const bad = Object.entries(DEV_KIT_ROLES).flatMap(([cls, roles]) =>
      roles
        .filter(
          (role) => role.hands === 'dualWield' && !canDualWield(cls as PlayerClass, role.spec),
        )
        .map((role) => `${cls}/${role.spec}`),
    );
    expect(bad).toEqual([]);
  });
});

describe('fresh-20 item pool', () => {
  it('excludes every item that drops in the dungeon under test', () => {
    // Wearing Sanctum loot into a Sanctum balance run would contaminate the number
    // the run exists to measure.
    const sanctum = dungeonLootIds(DEV_KIT_EXCLUDED_DUNGEON);
    expect(sanctum.size).toBeGreaterThan(0);
    for (const cls of ALL_CLASSES) {
      for (const id of sanctum) {
        const item = ITEMS[id];
        if (item) expect(isFreshTwentyItem(cls, item)).toBe(false);
      }
    }
  });

  it('excludes heroic variants, raid loot and PvP gear', () => {
    for (const item of Object.values(ITEMS)) {
      if (item.heroicOf !== undefined || item.priceHonor !== undefined) {
        expect(isFreshTwentyItem('warrior', item)).toBe(false);
      }
    }
  });

  it('honours requiredClass even for armor, which canEquipItem alone does not', () => {
    // canEquipItem returns on the armor-rank check for anything with an armorType, so
    // a class-locked plate piece never reaches its own requiredClass test. Without the
    // explicit re-check a mail class ends up wearing warrior-only tier pieces.
    const locked = Object.values(ITEMS).filter(
      (item) => item.requiredClass && item.requiredClass.length > 0 && item.stats,
    );
    expect(locked.length).toBeGreaterThan(0);
    for (const item of locked) {
      for (const cls of ALL_CLASSES) {
        if (!item.requiredClass?.includes(cls)) expect(isFreshTwentyItem(cls, item)).toBe(false);
      }
    }
  });
});

describe('kit construction', () => {
  it('builds a kit for every one of the 27 specs, with no empty armor slot', () => {
    const required = [
      'helmet',
      'neck',
      'shoulder',
      'chest',
      'waist',
      'legs',
      'gloves',
      'feet',
      'ring1',
      'ring2',
      'mainhand',
    ] as const;
    for (const { cls, spec } of everySpec()) {
      const kit = buildDevKit(cls, spec);
      expect(kit, `${cls}/${spec}`).not.toBeNull();
      for (const slot of required) {
        expect(kit?.equip[slot], `${cls}/${spec} ${slot}`).toBeTruthy();
      }
    }
  });

  it('never puts the same ring in both ring slots', () => {
    for (const { cls, spec } of everySpec()) {
      const kit = buildDevKit(cls, spec);
      if (kit?.equip.ring1 && kit.equip.ring2) {
        expect(kit.equip.ring1, `${cls}/${spec}`).not.toBe(kit.equip.ring2);
      }
    }
  });

  it('is deterministic: the same spec yields byte-identical gear every time', () => {
    // A balance run is only repeatable if the gear is. Any rng or map-order
    // dependence here would silently move the number under test.
    for (const { cls, spec } of everySpec()) {
      expect(buildDevKit(cls, spec)).toEqual(buildDevKit(cls, spec));
    }
  });

  it('gives a shield spec a one-hander so the shield actually fits', () => {
    const kit = buildDevKit('warrior', 'prot');
    const main = ITEMS[kit?.equip.mainhand ?? ''];
    expect(main).toBeTruthy();
    expect(main?.kind === 'weapon' && main.hand === 'twohand').toBe(false);
    const off = ITEMS[kit?.equip.offhand ?? ''];
    expect(off?.kind === 'armor' && off.shield === true).toBe(true);
  });

  it('never hands a caster a strength piece over an intellect one', () => {
    // The dead-stat armor discount exists precisely to stop "heaviest armor wins".
    const kit = buildDevKit('priest', 'holy');
    for (const id of Object.values(kit?.equip ?? {})) {
      const stats = ITEMS[id]?.stats;
      if (!stats) continue;
      if ((stats.str ?? 0) > 0) expect(stats.int ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('kit application order', () => {
  it('equips every bag socket BEFORE any gear is granted', () => {
    // Load-bearing ordering. Equipping a piece displaces what it replaces back into
    // the bags, and that return leg IS capacity gated: without the bags on first, a
    // full kit can run out of room mid-apply.
    const calls: string[] = [];
    const ctx = {
      addItem: (itemId: string) => calls.push(`add:${itemId}`),
      equipBag: (itemId: string) => calls.push(`bag:${itemId}`),
      equipItem: (itemId: string) => calls.push(`equip:${itemId}`),
      unequipItem: (slot: string) => {
        calls.push(`unequip:${slot}`);
        return true;
      },
    };
    const applied = applyDevKit(ctx, 'warrior', 'prot');
    expect(applied?.bagsEquipped).toBe(4);

    const lastBag = calls.map((c) => c.startsWith('bag:')).lastIndexOf(true);
    const firstEquip = calls.findIndex((c) => c.startsWith('equip:'));
    expect(lastBag).toBeGreaterThanOrEqual(0);
    expect(firstEquip).toBeGreaterThan(lastBag);
  });

  it('clears both hands before the weapons land', () => {
    const calls: string[] = [];
    const ctx = {
      addItem: () => {},
      equipBag: () => {},
      equipItem: (itemId: string) => calls.push(`equip:${itemId}`),
      unequipItem: (slot: string) => {
        calls.push(`unequip:${slot}`);
        return true;
      },
    };
    applyDevKit(ctx, 'warrior', 'prot');
    expect(calls).toContain('unequip:mainhand');
    expect(calls).toContain('unequip:offhand');
    expect(calls.indexOf('unequip:offhand')).toBeLessThan(
      calls.findIndex((c) => c.startsWith('equip:')),
    );
  });

  it('returns null for a spec the class does not have', () => {
    const ctx = {
      addItem: () => {},
      equipBag: () => {},
      equipItem: () => {},
      unequipItem: () => true,
    };
    expect(applyDevKit(ctx, 'warrior', 'restoration')).toBeNull();
  });
});

describe('/dev kit against a real Sim', () => {
  function kitted(cls: PlayerClass, spec: string): Sim {
    const sim = new Sim({ seed: 7, playerClass: cls, devCommands: true });
    sim.setPlayerLevel(DEV_KIT_LEVEL);
    const meta = sim.players.get(sim.playerId);
    if (meta) meta.talents.spec = spec;
    sim.chat(`/dev kit ${spec}`);
    return sim;
  }

  it('dresses the character and fills all four bag sockets', () => {
    const sim = kitted('warrior', 'prot');
    const meta = sim.players.get(sim.playerId);
    expect(meta?.bags.filter(Boolean)).toHaveLength(4);
    const worn = Object.values(meta?.equipment ?? {}).filter(Boolean);
    expect(worn.length).toBeGreaterThanOrEqual(11);
  });

  it('leaves level and spec alone: this is a GEAR command', () => {
    // Deliberately decoupled from /dev level and the spec UI so a tester can vary one
    // without the other.
    const sim = new Sim({ seed: 7, playerClass: 'mage', devCommands: true });
    sim.setPlayerLevel(DEV_KIT_LEVEL);
    const meta = sim.players.get(sim.playerId);
    if (meta) meta.talents.spec = 'frost';
    sim.chat('/dev kit fire');
    expect(sim.player.level).toBe(DEV_KIT_LEVEL);
    expect(sim.players.get(sim.playerId)?.talents.spec).toBe('frost');
  });

  // A fresh character already wears starter gear (worn_sword, recruit_tunic, ...), so
  // "did nothing" means the equipment is UNCHANGED, not that it is empty.
  function equipmentSnapshot(sim: Sim): string {
    return JSON.stringify(sim.players.get(sim.playerId)?.equipment ?? {});
  }

  it('refuses a spec that belongs to another class', () => {
    const sim = new Sim({ seed: 7, playerClass: 'warrior', devCommands: true });
    sim.setPlayerLevel(DEV_KIT_LEVEL);
    const before = equipmentSnapshot(sim);
    sim.chat('/dev kit restoration');
    expect(equipmentSnapshot(sim)).toBe(before);
  });

  it('is inert when dev commands are off', () => {
    // The whole surface is env-gated server-side; a preset must not be the one cheat
    // that leaks past it.
    const sim = new Sim({ seed: 7, playerClass: 'warrior', devCommands: false });
    sim.setPlayerLevel(DEV_KIT_LEVEL);
    const before = equipmentSnapshot(sim);
    const bagsBefore = sim.players.get(sim.playerId)?.bags.filter(Boolean).length ?? 0;
    sim.chat('/dev kit prot');
    expect(equipmentSnapshot(sim)).toBe(before);
    expect(sim.players.get(sim.playerId)?.bags.filter(Boolean).length ?? 0).toBe(bagsBefore);
  });
});
