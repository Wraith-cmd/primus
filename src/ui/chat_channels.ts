// Pure model for the classic-style chat channel tabs (no DOM, no Three). The HUD
// (hud.ts) owns the tab DOM and wiring; this module owns the *rules*: which
// channels a tab can bind to, the slash prefix each one prepends to plain text,
// and the localStorage parse/serialize. Keeping it DOM-free lets the logic be
// unit-tested without a browser.

import type { TranslationKey } from './i18n';

// Channels a chat tab can be bound to, in the order shown in the "add channel"
// menu. `say` is the engine default for unprefixed text. `whisper` is omitted
// on purpose (it targets a specific player and has no standing channel).
export const CHAT_TAB_CHANNELS = [
  'say',
  'yell',
  'party',
  'general',
  'world',
  'lfg',
  'guild',
  'officer',
] as const;
export type ChatTabChannel = (typeof CHAT_TAB_CHANNELS)[number];

export function isChatTabChannel(v: unknown): v is ChatTabChannel {
  return typeof v === 'string' && (CHAT_TAB_CHANNELS as readonly string[]).includes(v);
}

// The whisper "channel" has no standing SEND channel (each whisper targets a
// specific player), so it is deliberately kept out of CHAT_TAB_CHANNELS above.
// It can still be opened as a FILTER-ONLY tab that collects every whisper (sent
// and received, all carrying chan 'whisper') in one place, away from the busy
// All view. Typing in that tab replies to the last whisperer (see
// composeWhisperReply); it never binds a send prefix like a real channel.
export const WHISPER_TAB = 'whisper';
export type WhisperTab = typeof WHISPER_TAB;

// A tab the "+" menu can open: a send-capable channel OR the whisper collector.
export type ChatOpenTab = ChatTabChannel | WhisperTab;

export function isChatOpenTab(v: unknown): v is ChatOpenTab {
  return v === WHISPER_TAB || isChatTabChannel(v);
}

// The two always-present built-in views: the combined chat log and the combat
// log. They are not openable tabs (no send channel, never removed).
export type ChatTabId = 'all' | 'combat' | ChatOpenTab;

// Slash prefix prepended to plain text typed while a channel tab is active, so a
// message reaches that channel without the player retyping the command. These
// mirror the commands parsed in src/sim/sim.ts and server/game.ts:
//  - `say` is empty: unprefixed text is /say by default.
//  - `/general ` (not `/g `, which the server routes to GUILD) hits the
//    always-on general channel.
//  - `/gu ` / `/o ` are guild / officer (server-side social channels).
const CHANNEL_SEND_PREFIX: Record<ChatTabChannel, string> = {
  say: '',
  yell: '/y ',
  party: '/p ',
  general: '/general ',
  world: '/world ',
  lfg: '/lfg ',
  guild: '/gu ',
  officer: '/o ',
};

export function channelSendPrefix(channel: ChatTabChannel): string {
  return CHANNEL_SEND_PREFIX[channel];
}

// Opt-in global channels that need an explicit /join before the sim/server will
// deliver to them. Opening a tab for one of these auto-joins it.
export const AUTO_JOIN_CHANNELS: readonly ChatTabChannel[] = ['world', 'lfg'];

export function channelNeedsJoin(channel: ChatTabChannel): boolean {
  return AUTO_JOIN_CHANNELS.includes(channel);
}

// i18n keys for each channel's short tab label.
export const CHANNEL_LABEL_KEYS: Record<ChatTabChannel, TranslationKey> = {
  say: 'hud.core.chatChannels.names.say',
  yell: 'hud.core.chatChannels.names.yell',
  party: 'hud.core.chatChannels.names.party',
  general: 'hud.core.chatChannels.names.general',
  world: 'hud.core.chatChannels.names.world',
  lfg: 'hud.core.chatChannels.names.lfg',
  guild: 'hud.core.chatChannels.names.guild',
  officer: 'hud.core.chatChannels.names.officer',
};

// The whisper collector tab reuses the existing "Whisper" action label for its
// short tab caption, so it needs no new i18n key (and reads localized at once).
export const WHISPER_TAB_LABEL_KEY: TranslationKey = 'hud.chat.context.whisper';

// The i18n key for any openable tab's short caption (channel name or whisper).
export function chatOpenTabLabelKey(tab: ChatOpenTab): TranslationKey {
  return tab === WHISPER_TAB ? WHISPER_TAB_LABEL_KEY : CHANNEL_LABEL_KEYS[tab];
}

// One tint per openable tab, shared by the chat log lines (hud.ts chat event
// switch) and the chat input (issue #1452: the input is tinted with the color
// of the channel the typed plain text will reach). Single source: the log and
// the input must never disagree on a channel's color.
export const CHAT_CHANNEL_COLORS: Record<ChatOpenTab, string> = {
  say: '#f0ead8',
  yell: '#ff5040',
  party: '#7fd4ff',
  general: '#ffc864',
  world: '#ff9d5c',
  lfg: '#5cd6a0',
  guild: '#40d264',
  officer: '#4ce0c0',
  whisper: '#ff80ff',
};

// The tab a plain typed line will actually reach: a channel tab binds itself,
// the whisper collector replies to the last whisperer, and the All/Combat
// views fall back to the sticky most-recently-used channel (null = say).
export function effectiveSendTab(
  activeTab: ChatTabId,
  sticky: ChatTabChannel | null,
): ChatOpenTab | null {
  if (activeTab === 'all' || activeTab === 'combat') return sticky;
  return activeTab;
}

// The chat input's tint for an effective send tab. null = leave the CSS
// default color (say is the engine default and keeps the neutral input).
export function chatInputColor(tab: ChatOpenTab | null): string | null {
  if (tab === null || tab === 'say') return null;
  return CHAT_CHANNEL_COLORS[tab];
}

// Send-channel slash aliases as BOTH hosts parse them (src/sim/social/chat.ts
// offline, server/game.ts online), each requiring a message body so a bare
// "/p" (an error, nothing sent) never re-sticks. Bare "/g" is deliberately
// absent: the offline sim routes it to GENERAL but the server routes it to
// GUILD, so it cannot stick to one channel without lying on the other host.
// Whisper (/w, /r) is excluded on purpose: it targets a specific player, not
// a standing channel (mirrors CHAT_TAB_CHANNELS above).
const STICKY_COMMAND_ALIASES: readonly [RegExp, ChatTabChannel][] = [
  [/^\/s(?:ay)?\s+\S/i, 'say'],
  [/^\/y(?:ell)?\s+\S/i, 'yell'],
  [/^\/p(?:arty)?\s+\S/i, 'party'],
  [/^\/general\s+\S/i, 'general'],
  [/^\/world\s+\S/i, 'world'],
  [/^\/lfg\s+\S/i, 'lfg'],
  [/^\/(?:gu|guild)\s+\S/i, 'guild'],
  [/^\/o(?:fficer)?\s+\S/i, 'officer'],
];

// The send channel an explicit typed slash command targets, or null when the
// line is not an unambiguous channel message (whisper, /join, emotes, /g, ...).
export function channelForSlashCommand(typed: string): ChatTabChannel | null {
  const text = typed.trim();
  if (!text.startsWith('/')) return null;
  for (const [re, channel] of STICKY_COMMAND_ALIASES) if (re.test(text)) return channel;
  return null;
}

// The sticky most-recently-used channel after a line is sent. `plainTarget` is
// where plain (unprefixed) text was routed: the bound tab channel, the sticky
// channel on All/Combat (null = say), or the whisper collector. An explicit
// channel command re-sticks; whispers and non-channel commands leave the
// sticky channel alone; a plain whisper reply never sticks (no standing channel).
export function stickyChannelAfterSend(
  typed: string,
  plainTarget: ChatOpenTab | null,
  prev: ChatTabChannel | null,
): ChatTabChannel | null {
  const text = typed.trim();
  if (!text) return prev;
  if (text.startsWith('/')) return channelForSlashCommand(text) ?? prev;
  if (plainTarget === WHISPER_TAB) return prev;
  return plainTarget ?? 'say';
}

// Compose the text actually sent for a message typed while a channel tab is
// active. An explicit slash command the player typed always wins (so "/w bob hi"
// from the World tab still whispers); otherwise the channel prefix is prepended.
export function composeChatLine(channel: ChatTabChannel, typed: string): string {
  const text = typed.trim();
  if (!text || text.startsWith('/')) return text;
  return channelSendPrefix(channel) + text;
}

// Compose the text sent for a message typed while the whisper collector tab is
// active. Plain text defaults to a reply to whoever last whispered you (/r), so
// reading and answering whispers both happen from that one tab. An explicit
// slash command still wins (so "/w Bob hi" whispers Bob directly), exactly like
// composeChatLine. With no one to reply to, the sim surfaces its existing
// "no one has whispered you recently" notice.
export function composeWhisperReply(typed: string): string {
  const text = typed.trim();
  if (!text || text.startsWith('/')) return text;
  return `/r ${text}`;
}

// Persistence: the ordered list of channel tabs the player has opened. The
// built-in `all` / `combat` views are implicit and not stored. Parsing is
// defensive: unknown, duplicate, or malformed entries are dropped so a corrupt
// or forward-version blob can never throw inside the HUD.
export function parseChatTabs(raw: string | null): ChatOpenTab[] {
  if (!raw) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: ChatOpenTab[] = [];
  for (const v of arr) {
    if (isChatOpenTab(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

export function serializeChatTabs(tabs: ChatOpenTab[]): string {
  return JSON.stringify(tabs);
}
