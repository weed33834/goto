import { describe, it, expect } from 'vitest';
import {
  stripMarkdown,
  notePreview,
  looksLikeMarkdown,
  parseTagInput,
} from './markdownHelper';

describe('stripMarkdown', () => {
  it('returns empty for empty input', () => {
    expect(stripMarkdown('')).toBe('');
  });

  it('strips headings', () => {
    expect(stripMarkdown('# Title')).toBe('Title');
    expect(stripMarkdown('### Sub')).toBe('Sub');
  });

  it('strips bold and italic', () => {
    expect(stripMarkdown('**bold**')).toBe('bold');
    expect(stripMarkdown('__bold__')).toBe('bold');
  });

  it('strips inline code', () => {
    expect(stripMarkdown('use `const`')).toBe('use const');
  });

  it('replaces code blocks with placeholder', () => {
    expect(stripMarkdown('a\n```\ncode\n```\nb')).toBe('a\n[code]\nb');
  });

  it('extracts link text', () => {
    expect(stripMarkdown('see [docs](http://x)')).toBe('see docs');
  });

  it('extracts image alt', () => {
    expect(stripMarkdown('![a pic](http://x.png)')).toBe('a pic');
  });

  it('strips list markers', () => {
    expect(stripMarkdown('- item\n- item2')).toBe('item\nitem2');
    expect(stripMarkdown('1. first\n2. second')).toBe('first\nsecond');
  });

  it('renders task list checkboxes', () => {
    expect(stripMarkdown('- [x] done')).toBe('☑ done');
    expect(stripMarkdown('- [ ] todo')).toBe('☐ todo');
  });

  it('strips blockquotes', () => {
    expect(stripMarkdown('> quoted')).toBe('quoted');
  });
});

describe('notePreview', () => {
  it('collapses to one line', () => {
    expect(notePreview('line1\nline2', false)).toBe('line1 line2');
  });

  it('truncates with ellipsis', () => {
    const long = 'a'.repeat(100);
    const out = notePreview(long, false, 10);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBe(10);
  });

  it('strips markdown when isMarkdown', () => {
    expect(notePreview('# Hello **world**', true)).toBe('Hello world');
  });

  it('passes through plain text when not markdown', () => {
    expect(notePreview('just text', false)).toBe('just text');
  });
});

describe('looksLikeMarkdown', () => {
  it('detects headings', () => {
    expect(looksLikeMarkdown('# Hi')).toBe(true);
  });

  it('detects bold', () => {
    expect(looksLikeMarkdown('a **b** c')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(looksLikeMarkdown('just plain text')).toBe(false);
  });

  it('returns false for empty', () => {
    expect(looksLikeMarkdown('')).toBe(false);
  });
});

describe('parseTagInput', () => {
  it('splits on commas', () => {
    expect(parseTagInput('work, home, shopping')).toEqual(['work', 'home', 'shopping']);
  });

  it('splits on Chinese comma and whitespace', () => {
    expect(parseTagInput('工作，学习 看书')).toEqual(['工作', '学习', '看书']);
  });

  it('deduplicates preserving order', () => {
    expect(parseTagInput('a, b, a, c')).toEqual(['a', 'b', 'c']);
  });

  it('drops empty and over-long tags', () => {
    expect(parseTagInput('a, , ')).toEqual(['a']);
    expect(parseTagInput('a'.repeat(25))).toEqual([]);
  });
});
