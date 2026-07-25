import { describe, expect, it } from 'vitest';
import {
  encodeItemLink,
  encodeQuestLink,
  isLinkableId,
  parseChatSegments,
} from '../src/ui/hud/quest/quest_link';

describe('quest_link', () => {
  it('encodes a questId into a token', () => {
    expect(encodeQuestLink('q_wolves')).toBe('[[q:q_wolves]]');
  });

  it('round-trips a single link embedded in text', () => {
    const text = `Check this out ${encodeQuestLink('q_wolves')}`;
    expect(parseChatSegments(text)).toEqual([
      { kind: 'text', value: 'Check this out ' },
      { kind: 'quest', questId: 'q_wolves' },
    ]);
  });

  it('parses multiple links with text between and after', () => {
    const text = `${encodeQuestLink('q_a')} and ${encodeQuestLink('q_b')} done`;
    expect(parseChatSegments(text)).toEqual([
      { kind: 'quest', questId: 'q_a' },
      { kind: 'text', value: ' and ' },
      { kind: 'quest', questId: 'q_b' },
      { kind: 'text', value: ' done' },
    ]);
  });

  it('returns plain text unchanged when there are no links', () => {
    expect(parseChatSegments('just talking')).toEqual([{ kind: 'text', value: 'just talking' }]);
  });

  it('treats malformed/empty tokens as plain text', () => {
    expect(parseChatSegments('[[q:]] [[q]] [[x:q_a]]')).toEqual([
      { kind: 'text', value: '[[q:]] [[q]] [[x:q_a]]' },
    ]);
  });

  it('handles empty string', () => {
    expect(parseChatSegments('')).toEqual([{ kind: 'text', value: '' }]);
  });

  it('encodes an itemId into a token', () => {
    expect(encodeItemLink('sword_iron')).toBe('[[i:sword_iron]]');
  });

  it('round-trips a single item link embedded in text', () => {
    const text = `Look at ${encodeItemLink('sword_iron')}!`;
    expect(parseChatSegments(text)).toEqual([
      { kind: 'text', value: 'Look at ' },
      { kind: 'item', itemId: 'sword_iron' },
      { kind: 'text', value: '!' },
    ]);
  });

  it('parses quest and item links mixed in one message', () => {
    const text = `${encodeQuestLink('q_a')} drops ${encodeItemLink('gem_ruby')}`;
    expect(parseChatSegments(text)).toEqual([
      { kind: 'quest', questId: 'q_a' },
      { kind: 'text', value: ' drops ' },
      { kind: 'item', itemId: 'gem_ruby' },
    ]);
  });

  it('treats an unknown link prefix as plain text', () => {
    expect(parseChatSegments('[[x:foo]] [[i:]]')).toEqual([
      { kind: 'text', value: '[[x:foo]] [[i:]]' },
    ]);
  });
});

describe('isLinkableId agrees with the parser it guards (#2430)', () => {
  // isLinkableId exists so a caller building a token from CONTENT DATA (the
  // grant lines, grant_line_view.ts) can fall back to a plain name instead of
  // shipping a token the parser will not match, which reaches the player as
  // literal "[[i:...]]" source text rather than being dropped. It lives beside
  // CHAT_LINK_RE so the two cannot drift, and this binds the predicate to the
  // PARSER's actual behavior rather than to a second copy of the charset.
  const parsesAsOneItemLink = (id: string): boolean => {
    const segments = parseChatSegments(encodeItemLink(id));
    return segments.length === 1 && segments[0].kind === 'item' && segments[0].itemId === id;
  };

  it.each([
    'copper_ore',
    'ARCANE_dust_2',
    '_leading_underscore',
    '9',
    'odd-id',
    'odd.id',
    'odd id',
    'odd:id',
    'odd]]id',
    '',
  ])('%o: the predicate matches what the parser does', (id) => {
    expect(isLinkableId(id)).toBe(parsesAsOneItemLink(id));
  });

  it('rejects the shapes that would otherwise print as raw source text', () => {
    // Polarity, spelled out: at least one id must be linkable and at least one
    // must not, or an always-true (or always-false) predicate would satisfy the
    // agreement sweep above vacuously.
    expect(isLinkableId('copper_ore')).toBe(true);
    expect(isLinkableId('odd-id.with punctuation')).toBe(false);
  });
});
