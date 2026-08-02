import { describe, expect, it } from 'vitest';
import { buildOfflineSave, parseOfflineSave } from '../src/game/offline_save';
import { Sim } from '../src/sim/sim';

describe('startOffline wiring repro', () => {
  it('serializes the way main.ts builds a Sim', () => {
    const sim = new Sim({
      seed: 12345,
      playerClass: 'warrior',
      playerName: 'Testguy',
      devCommands: true,
      valeCupShowcase: true,
      noPlayer: false,
    });
    sim.setPlayerSkin(sim.playerId, 0);
    sim.setPlayerLevel(9);
    for (let i = 0; i < 40; i++) sim.tick();
    const state = sim.serializeCharacter(sim.playerId);
    console.log('playerId', sim.playerId, 'state null?', state === null);
    expect(state).not.toBeNull();
    let json = '';
    try {
      json = JSON.stringify(buildOfflineSave({
        playerClass: 'warrior',
        playerName: 'Testguy',
        skin: 0,
        seed: 12345,
        state: state!,
        savedAt: 1,
      }));
    } catch (e) {
      console.log('STRINGIFY THREW', e);
      throw e;
    }
    const parsed = parseOfflineSave(json);
    expect(parsed).not.toBeNull();

    const sim2 = new Sim({
      seed: 12345,
      playerClass: 'warrior',
      playerName: 'Testguy',
      devCommands: true,
      valeCupShowcase: true,
      noPlayer: true,
    });
    sim2.addPlayer('warrior', 'Testguy', { state: parsed!.state });
    console.log('resumed playerId', sim2.playerId, 'level', sim2.entities.get(sim2.playerId)?.level);
    expect(sim2.playerId).toBeGreaterThan(0);
    expect(sim2.entities.get(sim2.playerId)?.level).toBe(9);
  });
});
