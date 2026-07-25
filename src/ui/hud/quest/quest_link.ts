// Chat-link token contract. A chat link is a tiny, name-free token the client embeds
// in chat text; the renderer resolves the localized name from the quest / item table,
// so a forged label can't misrepresent the target. Two link kinds share one parser so
// a message can mix them: quests ([[q:id]]) and items ([[i:id]]). Pure + host-free
// (Vitest imports it directly). Only the client uses it — the sim never sees tokens.

export type ChatSegment =
  | { kind: 'text'; value: string }
  | { kind: 'quest'; questId: string }
  | { kind: 'item'; itemId: string };

// Quest/item ids are [A-Za-z0-9_]+ (e.g. "q_wolves", "sword_iron"). The kind prefix
// (q | i) selects the segment kind. Global so we can walk every match.
const CHAT_LINK_RE = /\[\[([qi]):([A-Za-z0-9_]+)\]\]/g;

// The same id charset as CHAT_LINK_RE, anchored, for callers that build a token
// from an id they did not choose (content data). A token whose id the parser
// cannot match is NOT dropped by parseChatSegments: it survives as a text
// segment, so the player reads the literal "[[i:...]]" source. Callers that
// can fall back to a plain name should ask here first, and this lives beside
// the regex so the two can never answer the question differently.
const LINKABLE_ID_RE = /^[A-Za-z0-9_]+$/;

export function isLinkableId(id: string): boolean {
  return LINKABLE_ID_RE.test(id);
}

export function encodeQuestLink(questId: string): string {
  return `[[q:${questId}]]`;
}

export function encodeItemLink(itemId: string): string {
  return `[[i:${itemId}]]`;
}

export function parseChatSegments(text: string): ChatSegment[] {
  const segments: ChatSegment[] = [];
  let last = 0;
  CHAT_LINK_RE.lastIndex = 0;
  let m = CHAT_LINK_RE.exec(text);
  while (m) {
    if (m.index > last) segments.push({ kind: 'text', value: text.slice(last, m.index) });
    segments.push(m[1] === 'q' ? { kind: 'quest', questId: m[2] } : { kind: 'item', itemId: m[2] });
    last = m.index + m[0].length;
    m = CHAT_LINK_RE.exec(text);
  }
  if (last < text.length || segments.length === 0)
    segments.push({ kind: 'text', value: text.slice(last) });
  return segments;
}
