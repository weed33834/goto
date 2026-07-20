// Minimal Markdown helpers for the Notes module.
//
// The Notes editor stores raw Markdown in `content` and a rendered preview is
// only needed in two places: the card list (a one-line plain-text summary) and
// the detail preview. Pulling in a full Markdown renderer library for that
// would balloon the bundle, so this file does the smallest useful subset:
// strip syntax for previews, and detect a few block kinds for a lightweight
// inline preview. It is intentionally not a spec-complete Markdown parser.

/** Remove Markdown syntax, return readable plain text. */
export function stripMarkdown(md: string): string {
  if (!md) return '';
  return md
    // 代码块（```...```）→ 占位
    .replace(/```[\s\S]*?```/g, '[code]')
    // 行内代码 `x`
    .replace(/`([^`]+)`/g, '$1')
    // 图片 ![alt](url) → alt
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 链接 [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // 粗体 **x** / __x__
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    // 斜体 *x* / _x_
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1$2')
    // 删除线 ~~x~~
    .replace(/~~([^~]+)~~/g, '$1')
    // 标题井号
    .replace(/^#{1,6}\s+/gm, '')
    // 引用 >
    .replace(/^>\s+/gm, '')
    // 任务列表 [x] / [ ]（必须在通用列表标记之前处理，保留复选状态字形）
    .replace(/^\s*[-*+]\s+\[x\]\s*/gim, '☑ ')
    .replace(/^\s*[-*+]\s+\[ \]\s*/gim, '☐ ')
    // 无序列表标记 - * +
    .replace(/^[\s]*[-*+]\s+/gm, '')
    // 有序列表标记 1.
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // 水平分割线
    .replace(/^---+$/gm, '')
    // 多余空白
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** One-line preview for note cards: strip Markdown, collapse to single line, truncate. */
export function notePreview(md: string, isMarkdown: boolean, max = 80): string {
  const text = isMarkdown ? stripMarkdown(md) : md;
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 1) + '…';
}

/** Detect whether a string looks like Markdown (has any syntax marker). */
export function looksLikeMarkdown(s: string): boolean {
  if (!s) return false;
  return /(^#{1,6}\s)|(\*\*[^*]+\*\*)|(`[^`]+`)|(\[[^\]]+\]\([^)]*\))|(^[\s]*[-*+]\s)/m.test(s);
}

/** Parse a comma/space-separated tag string into a clean tag array. */
export function parseTagInput(raw: string): string[] {
  return raw
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 20)
    // 去重，保留顺序
    .filter((t, i, arr) => arr.indexOf(t) === i);
}
