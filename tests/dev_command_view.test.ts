import { describe, expect, it } from 'vitest';
import { MAX_LEVEL } from '../src/sim/types';
import {
  buildDevCommand,
  DEV_COMMAND_ACTIONS,
  filteredDevActions,
  isDevGuiCommand,
} from '../src/ui/dev_command_view';

describe('developer command view', () => {
  it('recognizes only the exact GUI command', () => {
    expect(isDevGuiCommand('/dev gui')).toBe(true);
    expect(isDevGuiCommand('  /DEV GUI  ')).toBe(true);
    expect(isDevGuiCommand('/dev gui now')).toBe(false);
    expect(isDevGuiCommand('/dev god')).toBe(false);
  });

  it('builds bounded commands without accepting arbitrary tokens', () => {
    expect(buildDevCommand('spawn', { mob: 'forest_wolf', count: 999, mobLevel: 999 })).toBe(
      `/dev spawn forest_wolf 20 ${MAX_LEVEL}`,
    );
    expect(buildDevCommand('give', { item: 'wolf_fang', itemCount: 4 })).toBe(
      '/dev give wolf_fang 4',
    );
    expect(buildDevCommand('spawn', { mob: 'wolf; /dev gold 999', count: 1 })).toBeNull();
    expect(buildDevCommand('teleport', { x: 'NaN', z: 4 })).toBeNull();
  });

  it('surfaces the one-button scenario cheats verbatim', () => {
    expect(buildDevCommand('vendor', {})).toBe('/dev vendor');
    expect(buildDevCommand('cascade', {})).toBe('/dev cascade');
    expect(buildDevCommand('sandbox', {})).toBe('/dev sandbox');
  });

  it('builds the mobile station command from a picked craft, rejecting junk tokens', () => {
    expect(buildDevCommand('mobilestation', { craft: 'engineering' })).toBe(
      '/dev mobilestation engineering',
    );
    expect(buildDevCommand('mobilestation', { craft: 'weaponcrafting' })).toBe(
      '/dev mobilestation weaponcrafting',
    );
    expect(buildDevCommand('mobilestation', { craft: '' })).toBeNull();
    expect(buildDevCommand('mobilestation', { craft: 'engineering; /dev gold 999' })).toBeNull();
  });

  it('keeps every action discoverable by category and search', () => {
    const categories = new Set(DEV_COMMAND_ACTIONS.map((action) => action.category));
    expect(categories).toEqual(
      new Set(['player', 'spawns', 'inventory', 'progress', 'travel', 'scenarios']),
    );
    const searchCopy = (key: string) =>
      key.includes('killtarget') || key.includes('despawntarget') ? 'selected mob' : key;
    expect(filteredDevActions('spawns', 'selected', searchCopy).map((action) => action.id)).toEqual(
      ['killtarget', 'despawntarget'],
    );
    // give, kit, gold. Named rather than counted so a future add says WHICH action
    // appeared instead of just moving a number.
    expect(filteredDevActions('inventory', '').map((action) => action.id)).toEqual([
      'give',
      'kit',
      'gold',
    ]);
    // The mobile station cheat joins the profession-facing progress tab.
    expect(filteredDevActions('progress', '').map((action) => action.id)).toEqual([
      'quest',
      'quests',
      'attune',
      'gather',
      'mobilestation',
    ]);
    // The three one-button scenario cheats join bot + the finder seeds.
    expect(filteredDevActions('scenarios', '').map((action) => action.id)).toEqual([
      'bot',
      'lfgqueue',
      'lfgraid',
      'lfgboard',
      'vendor',
      'cascade',
      'sandbox',
    ]);
  });
});
