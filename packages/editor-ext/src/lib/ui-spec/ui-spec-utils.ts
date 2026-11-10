export interface UiSpecField {
  key: string;
  value: string;
}

export interface UiSpecRow {
  id: string;
  item: string;
  description: string;
  content: string;
  specs: UiSpecField[];
}

export const UI_SPEC_COLUMNS = [
  'ID',
  'Items',
  'Description',
  'Displayed Content / Context',
  'Specification',
] as const;

// Keys offered in the editor, ordered by how often they appear in real UI specs.
export const UI_SPEC_KEYS = [
  'Format',
  'Position',
  'Alignment',
  'Action',
  'Text Color',
  'Background',
  'Shape',
  'Border',
  'Size',
  'Width',
  'Height',
  'Shadow',
  'Image Link',
  'Video Link',
  'Link',
  'Value',
  'Value Color',
  'Content',
  'Input Type',
  'Placeholder',
  'Required Indicator',
  'Default State',
  'Active State',
  'Active Color',
  'Inactive Color',
  'Icon Color',
  'Font Style',
  'Font Weight',
  'Font Size',
  'Primary Color',
  'Secondary Color',
  'Direction',
  'Coverage',
  'Display',
  'Indicator',
  'Country Code',
  'Validation',
  'Error Message',
] as const;

export const URL_SPEC_KEYS = ['Image Link', 'Video Link', 'Link'];

export function emptyUiSpecRow(id = ''): UiSpecRow {
  return {
    id,
    item: '',
    description: '',
    content: '',
    specs: [
      { key: 'Format', value: '' },
      { key: 'Position', value: '' },
    ],
  };
}

// "1.2.9" -> "1.2.10"; "" -> "1"
export function nextUiSpecId(prev?: string): string {
  if (!prev) return '1';
  const m = prev.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return prev + '.1';
  return `${m[1]}${parseInt(m[2], 10) + 1}${m[3]}`;
}

export function normalizeUiSpecRows(value: unknown): UiSpecRow[] {
  let rows: any = value;
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows.map((r: any) => ({
    id: String(r?.id ?? ''),
    item: String(r?.item ?? ''),
    description: String(r?.description ?? ''),
    content: String(r?.content ?? ''),
    specs: Array.isArray(r?.specs)
      ? r.specs.map((s: any) => ({
          key: String(s?.key ?? ''),
          value: String(s?.value ?? ''),
        }))
      : [],
  }));
}

// Parses "- Format: Text Bold" style lines. Lines without a key are kept as a
// value with an empty key so nothing written in the cell is lost.
export function parseSpecLines(lines: string[]): UiSpecField[] {
  const fields: UiSpecField[] = [];
  for (const raw of lines) {
    const line = raw.replace(/^\s*[-•*–]\s*/, '').trim();
    if (!line) continue;
    const m = line.match(/^([^:：]{1,40})[:：]\s*(.*)$/);
    if (m) {
      fields.push({ key: m[1].trim(), value: m[2].trim() });
    } else if (fields.length) {
      const last = fields[fields.length - 1];
      last.value = last.value ? `${last.value} ${line}` : line;
    } else {
      fields.push({ key: '', value: line });
    }
  }
  return fields;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

// True when a table's header row looks like a UI spec table
// (ID | Items | Description | Displayed Content | Specification).
export function isUiSpecHeader(cells: string[]): boolean {
  if (cells.length !== 5) return false;
  const n = cells.map(norm);
  return (
    n[0] === 'id' &&
    n[1].startsWith('item') &&
    n[2].startsWith('description') &&
    n[3].startsWith('displayedcontent') &&
    (n[4].startsWith('specification') || n[4].startsWith('example'))
  );
}

function cellLines(cell: Element): string[] {
  const blocks = cell.querySelectorAll('li, p');
  if (blocks.length) {
    const out: string[] = [];
    blocks.forEach((b) => {
      // skip <p> wrapping inside <li> to avoid duplicates
      if (b.tagName === 'P' && b.closest('li')) return;
      const html = (b as HTMLElement).innerHTML ?? '';
      html
        .split(/<br\s*\/?>/i)
        .map((part) => part.replace(/<[^>]+>/g, ''))
        .forEach((t) => out.push(decodeEntities(t)));
    });
    return out;
  }
  return (cell.textContent ?? '').split(/\n/);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function cellText(cell: Element | undefined): string {
  if (!cell) return '';
  return cellLines(cell)
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

export function rowsFromTableElement(table: Element): UiSpecRow[] | null {
  const trs = Array.from(table.querySelectorAll('tr')).filter(
    (tr) => tr.closest('table') === table,
  );
  if (trs.length === 0) return null;
  const header = Array.from(trs[0].children).map((c) => c.textContent ?? '');
  if (!isUiSpecHeader(header)) return null;
  return trs.slice(1).map((tr) => {
    const c = Array.from(tr.children);
    return {
      id: cellText(c[0]).replace(/\s+/g, ''),
      item: cellText(c[1]),
      description: cellText(c[2]),
      content: cellText(c[3]),
      specs: c[4] ? parseSpecLines(cellLines(c[4])) : [],
    };
  });
}

export function specToText(s: UiSpecField): string {
  return s.key ? `${s.key}: ${s.value}` : s.value;
}
