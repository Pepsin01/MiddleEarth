/**
 * Writes JSON the way a person would: two-space indentation, but short lists
 * of plain values and map points stay on one line, e.g.
 *
 *   "pos": [4521, 3310],
 *   "characters": ["galadriel", "elrond"],
 *
 * This keeps the data files pleasant to edit by hand and git diffs small.
 */
const MAX_LINE = 110;

type Plain = string | number | boolean | null;

const isPlain = (value: unknown): value is Plain => value === null || ['string', 'number', 'boolean'].includes(typeof value);

function inline(list: unknown[]): string | null {
  if (list.every(isPlain)) return `[${list.map((item) => JSON.stringify(item)).join(', ')}]`;
  if (list.every((item) => Array.isArray(item) && item.every(isPlain))) {
    return `[${(list as Plain[][]).map((item) => `[${item.map((x) => JSON.stringify(x)).join(', ')}]`).join(', ')}]`;
  }
  return null;
}

function write(value: unknown, indent: string): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  const inner = `${indent}  `;

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const oneLine = inline(value);
    if (oneLine && indent.length + oneLine.length <= MAX_LINE) return oneLine;
    return `[\n${value.map((item) => inner + write(item, inner)).join(',\n')}\n${indent}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined);
  if (entries.length === 0) return '{}';
  return `{\n${entries.map(([key, item]) => `${inner}${JSON.stringify(key)}: ${write(item, inner)}`).join(',\n')}\n${indent}}`;
}

export function formatJson(value: unknown): string {
  return `${write(value, '')}\n`;
}
