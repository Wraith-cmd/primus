import { describe, expect, it } from 'vitest';
import {
  CHAT_CHANNEL_COLORS,
  CHAT_TAB_CHANNELS,
  channelForSlashCommand,
  channelNeedsJoin,
  channelSendPrefix,
  chatInputColor,
  chatOpenTabLabelKey,
  composeChatLine,
  composeWhisperReply,
  effectiveSendTab,
  isChatOpenTab,
  isChatTabChannel,
  parseChatTabs,
  serializeChatTabs,
  stickyChannelAfterSend,
  WHISPER_TAB,
  WHISPER_TAB_LABEL_KEY,
} from '../src/ui/chat_channels';

describe('chat channel tabs — pure model', () => {
  it('exposes the bindable channels without whisper (which has no standing channel)', () => {
    expect(CHAT_TAB_CHANNELS).toContain('say');
    expect(CHAT_TAB_CHANNELS).toContain('world');
    expect(CHAT_TAB_CHANNELS).toContain('lfg');
    expect(CHAT_TAB_CHANNELS as readonly string[]).not.toContain('whisper');
  });

  it('maps each channel to the slash prefix the sim/server parses', () => {
    // say is the engine default for unprefixed text
    expect(channelSendPrefix('say')).toBe('');
    expect(channelSendPrefix('yell')).toBe('/y ');
    expect(channelSendPrefix('party')).toBe('/p ');
    expect(channelSendPrefix('world')).toBe('/world ');
    expect(channelSendPrefix('lfg')).toBe('/lfg ');
    expect(channelSendPrefix('guild')).toBe('/gu ');
    expect(channelSendPrefix('officer')).toBe('/o ');
    // general must NOT be "/g " — the server routes /g to GUILD
    expect(channelSendPrefix('general')).toBe('/general ');
  });

  it('only world and lfg require an explicit /join', () => {
    expect(channelNeedsJoin('world')).toBe(true);
    expect(channelNeedsJoin('lfg')).toBe(true);
    expect(channelNeedsJoin('party')).toBe(false);
    expect(channelNeedsJoin('say')).toBe(false);
    expect(channelNeedsJoin('guild')).toBe(false);
  });

  describe('composeChatLine', () => {
    it('prepends the active channel prefix to plain text', () => {
      expect(composeChatLine('world', 'looking for healer')).toBe('/world looking for healer');
      expect(composeChatLine('party', 'pull on 3')).toBe('/p pull on 3');
    });

    it('sends plain text unprefixed for the say channel', () => {
      expect(composeChatLine('say', 'hello there')).toBe('hello there');
    });

    it('lets an explicit slash command win over the active channel', () => {
      // a whisper typed from the World tab must still whisper, not go to world
      expect(composeChatLine('world', '/w Bob meet me')).toBe('/w Bob meet me');
      expect(composeChatLine('lfg', '/p inc')).toBe('/p inc');
    });

    it('trims and drops empty input', () => {
      expect(composeChatLine('world', '   ')).toBe('');
      expect(composeChatLine('world', '  ping  ')).toBe('/world ping');
    });
  });

  describe('persistence', () => {
    it('round-trips a tab list', () => {
      const tabs = ['world', 'party', 'guild'] as const;
      expect(parseChatTabs(serializeChatTabs([...tabs]))).toEqual([...tabs]);
    });

    it('is defensive against corrupt, malformed, or forward-version blobs', () => {
      expect(parseChatTabs(null)).toEqual([]);
      expect(parseChatTabs('not json')).toEqual([]);
      expect(parseChatTabs('{"a":1}')).toEqual([]); // not an array
      // 'whisper' is a valid (filter-only) tab now; 'bogus'/42 are still dropped
      expect(parseChatTabs('["world","bogus","whisper",42]')).toEqual(['world', 'whisper']);
    });

    it('round-trips the whisper collector tab alongside channels', () => {
      expect(parseChatTabs(serializeChatTabs(['guild', WHISPER_TAB]))).toEqual([
        'guild',
        WHISPER_TAB,
      ]);
    });

    it('drops duplicate entries, keeping first occurrence order', () => {
      expect(parseChatTabs('["lfg","world","lfg"]')).toEqual(['lfg', 'world']);
    });
  });

  describe('whisper collector tab', () => {
    it('is not a send-capable channel, but is a valid open tab', () => {
      expect(isChatTabChannel(WHISPER_TAB)).toBe(false);
      expect(CHAT_TAB_CHANNELS as readonly string[]).not.toContain(WHISPER_TAB);
      expect(isChatOpenTab(WHISPER_TAB)).toBe(true);
      expect(isChatOpenTab('guild')).toBe(true);
      expect(isChatOpenTab('bogus')).toBe(false);
      expect(isChatOpenTab(42)).toBe(false);
    });

    it('captions itself with the existing Whisper label (no new i18n key)', () => {
      expect(chatOpenTabLabelKey(WHISPER_TAB)).toBe(WHISPER_TAB_LABEL_KEY);
      expect(chatOpenTabLabelKey(WHISPER_TAB)).toBe('hud.chat.context.whisper');
      expect(chatOpenTabLabelKey('party')).toBe('hud.core.chatChannels.names.party');
    });

    describe('composeWhisperReply', () => {
      it('defaults plain text to a reply to the last whisperer', () => {
        expect(composeWhisperReply('on my way')).toBe('/r on my way');
        expect(composeWhisperReply('  hi  ')).toBe('/r hi');
      });

      it('lets an explicit slash command win (whisper a different player)', () => {
        expect(composeWhisperReply('/w Bob meet me')).toBe('/w Bob meet me');
        expect(composeWhisperReply('/p inc')).toBe('/p inc');
      });

      it('drops empty input', () => {
        expect(composeWhisperReply('   ')).toBe('');
      });
    });
  });

  // Issue #1452: the chat input is tinted with the color of the channel plain
  // typed text will reach, and the most recently used send channel is sticky
  // on the All/Combat tabs.
  describe('channel colors (issue #1452)', () => {
    it('carries one color per openable tab, matching the chat log tints', () => {
      expect(CHAT_CHANNEL_COLORS.say).toBe('#f0ead8');
      expect(CHAT_CHANNEL_COLORS.yell).toBe('#ff5040');
      expect(CHAT_CHANNEL_COLORS.party).toBe('#7fd4ff');
      expect(CHAT_CHANNEL_COLORS.general).toBe('#ffc864');
      expect(CHAT_CHANNEL_COLORS.world).toBe('#ff9d5c');
      expect(CHAT_CHANNEL_COLORS.lfg).toBe('#5cd6a0');
      expect(CHAT_CHANNEL_COLORS.guild).toBe('#40d264');
      expect(CHAT_CHANNEL_COLORS.officer).toBe('#4ce0c0');
      expect(CHAT_CHANNEL_COLORS[WHISPER_TAB]).toBe('#ff80ff');
      for (const ch of CHAT_TAB_CHANNELS) expect(CHAT_CHANNEL_COLORS[ch]).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('tints the input with the effective channel color, default for say/none', () => {
      expect(chatInputColor('party')).toBe('#7fd4ff');
      expect(chatInputColor('guild')).toBe('#40d264');
      expect(chatInputColor(WHISPER_TAB)).toBe('#ff80ff');
      // say is the engine default: leave the CSS default input color
      expect(chatInputColor('say')).toBeNull();
      expect(chatInputColor(null)).toBeNull();
    });
  });

  describe('effectiveSendTab (issue #1452)', () => {
    it('a channel-bound tab keeps its own channel regardless of stickiness', () => {
      expect(effectiveSendTab('party', 'guild')).toBe('party');
      expect(effectiveSendTab('world', null)).toBe('world');
      expect(effectiveSendTab(WHISPER_TAB, 'party')).toBe(WHISPER_TAB);
    });

    it('the All and Combat views fall back to the sticky channel', () => {
      expect(effectiveSendTab('all', 'party')).toBe('party');
      expect(effectiveSendTab('combat', 'guild')).toBe('guild');
      expect(effectiveSendTab('all', null)).toBeNull();
      expect(effectiveSendTab('combat', null)).toBeNull();
    });
  });

  describe('channelForSlashCommand (issue #1452)', () => {
    it('maps every send-channel alias both hosts parse', () => {
      expect(channelForSlashCommand('/s back')).toBe('say');
      expect(channelForSlashCommand('/say back')).toBe('say');
      expect(channelForSlashCommand('/y inc')).toBe('yell');
      expect(channelForSlashCommand('/yell inc')).toBe('yell');
      expect(channelForSlashCommand('/p pull on 3')).toBe('party');
      expect(channelForSlashCommand('/party pull on 3')).toBe('party');
      expect(channelForSlashCommand('/general wts boots')).toBe('general');
      expect(channelForSlashCommand('/world any dungeon')).toBe('world');
      expect(channelForSlashCommand('/lfg tank lf group')).toBe('lfg');
      expect(channelForSlashCommand('/gu raid at 8')).toBe('guild');
      expect(channelForSlashCommand('/guild raid at 8')).toBe('guild');
      expect(channelForSlashCommand('/o promote her')).toBe('officer');
      expect(channelForSlashCommand('/officer promote her')).toBe('officer');
      expect(channelForSlashCommand('/P case insensitive')).toBe('party');
    });

    it('ignores bare /g: the offline sim routes it to general but the server to guild', () => {
      expect(channelForSlashCommand('/g hello')).toBeNull();
    });

    it('ignores non-channel commands and channel commands without a message', () => {
      expect(channelForSlashCommand('/w Bob meet me')).toBeNull();
      expect(channelForSlashCommand('/r on my way')).toBeNull();
      expect(channelForSlashCommand('/join world')).toBeNull();
      expect(channelForSlashCommand('/dance')).toBeNull();
      expect(channelForSlashCommand('/p')).toBeNull();
      expect(channelForSlashCommand('/p   ')).toBeNull();
      // readout commands that merely share a first letter must not stick
      expect(channelForSlashCommand('/pot 3')).toBeNull();
      expect(channelForSlashCommand('/sm 40')).toBeNull();
      expect(channelForSlashCommand('/op check')).toBeNull();
      expect(channelForSlashCommand('plain text')).toBeNull();
    });
  });

  describe('stickyChannelAfterSend (issue #1452)', () => {
    it('plain text sticks the channel it was actually sent to', () => {
      expect(stickyChannelAfterSend('pull on 3', 'party', null)).toBe('party');
      expect(stickyChannelAfterSend('raid at 8', 'guild', 'party')).toBe('guild');
      // plain text on All with no sticky channel is say
      expect(stickyChannelAfterSend('hello there', null, null)).toBe('say');
      expect(stickyChannelAfterSend('hello there', 'say', 'party')).toBe('say');
    });

    it('an explicit channel command re-sticks to that channel', () => {
      expect(stickyChannelAfterSend('/p inc', null, null)).toBe('party');
      expect(stickyChannelAfterSend('/gu raid at 8', 'party', 'party')).toBe('guild');
      expect(stickyChannelAfterSend('/s back', 'party', 'party')).toBe('say');
    });

    it('whispers, replies, and non-channel commands leave the sticky channel alone', () => {
      expect(stickyChannelAfterSend('/w Bob meet me', null, 'party')).toBe('party');
      expect(stickyChannelAfterSend('/r on my way', null, 'guild')).toBe('guild');
      expect(stickyChannelAfterSend('/join world', null, 'party')).toBe('party');
      expect(stickyChannelAfterSend('/dance', 'party', 'guild')).toBe('guild');
      // ambiguous bare /g never re-sticks
      expect(stickyChannelAfterSend('/g hello', null, 'party')).toBe('party');
    });

    it('a plain reply typed on the whisper collector tab does not stick', () => {
      expect(stickyChannelAfterSend('on my way', WHISPER_TAB, 'party')).toBe('party');
      expect(stickyChannelAfterSend('on my way', WHISPER_TAB, null)).toBeNull();
    });

    it('empty input leaves the sticky channel alone', () => {
      expect(stickyChannelAfterSend('', 'party', 'guild')).toBe('guild');
      expect(stickyChannelAfterSend('   ', null, 'party')).toBe('party');
    });
  });

  it('isChatTabChannel guards unknown values', () => {
    expect(isChatTabChannel('world')).toBe(true);
    expect(isChatTabChannel('whisper')).toBe(false);
    expect(isChatTabChannel('')).toBe(false);
    expect(isChatTabChannel(null)).toBe(false);
    expect(isChatTabChannel(7)).toBe(false);
  });
});
