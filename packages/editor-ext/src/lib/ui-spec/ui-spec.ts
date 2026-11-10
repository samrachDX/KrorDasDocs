import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import {
  emptyUiSpecRow,
  normalizeUiSpecRows,
  rowsFromTableElement,
  specToText,
  UI_SPEC_COLUMNS,
  UiSpecRow,
} from './ui-spec-utils';

export interface UiSpecOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export interface UiSpecAttributes {
  title?: string;
  rows?: UiSpecRow[];
  fontFamily?: string;
  fontSize?: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    uiSpec: {
      insertUiSpec: (attributes?: UiSpecAttributes) => ReturnType;
      insertUiSpecScreen: (screenName?: string) => ReturnType;
    };
  }
}

const SAFE_CSS = /^[\w\s,'"\-.]*$/;

export function uiSpecTableStyle(attrs: Record<string, any>): string {
  const parts: string[] = [];
  if (attrs.fontFamily && SAFE_CSS.test(attrs.fontFamily)) {
    parts.push(`font-family: ${attrs.fontFamily}`);
  }
  if (attrs.fontSize && /^\d+(\.\d+)?px$/.test(attrs.fontSize)) {
    parts.push(`font-size: ${attrs.fontSize}`);
  }
  return parts.join('; ');
}

export const UiSpec = Node.create<UiSpecOptions>({
  name: 'uiSpec',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      view: null,
    };
  },

  addAttributes() {
    return {
      title: {
        default: 'UI Elements Specification',
        // Imported plain tables keep their own heading paragraph, so no title.
        parseHTML: (el: HTMLElement) =>
          el.tagName === 'TABLE'
            ? ''
            : (el.getAttribute('data-title') ?? ''),
        renderHTML: (attrs) => ({ 'data-title': attrs.title }),
      },
      rows: {
        default: [],
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-rows');
          if (raw) return normalizeUiSpecRows(raw);
          const table =
            el.tagName === 'TABLE' ? el : el.querySelector('table');
          return (table && rowsFromTableElement(table)) || [];
        },
        // Rows are rendered as a real table below; data-rows keeps an exact copy.
        renderHTML: (attrs) => ({
          'data-rows': JSON.stringify(normalizeUiSpecRows(attrs.rows)),
        }),
      },
      // Font for the whole table (CSS font-family list and e.g. "14px").
      fontFamily: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-font-family') ?? '',
        renderHTML: (attrs) =>
          attrs.fontFamily ? { 'data-font-family': attrs.fontFamily } : {},
      },
      fontSize: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-font-size') ?? '',
        renderHTML: (attrs) =>
          attrs.fontSize ? { 'data-font-size': attrs.fontSize } : {},
      },
    };
  },

  parseHTML() {
    return [
      { tag: `div[data-type="${this.name}"]` },
      {
        // Plain tables with the UI spec header (e.g. from Word or Markdown
        // import) become UI spec blocks.
        tag: 'table',
        priority: 60,
        getAttrs: (el) =>
          rowsFromTableElement(el as HTMLElement) ? null : false,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const rows = normalizeUiSpecRows(node.attrs.rows);
    const header = [
      'tr',
      {},
      ...UI_SPEC_COLUMNS.map((c) => ['th', {}, ['p', {}, c]]),
    ];
    const lines = (text: string) =>
      (text || '').split('\n').map((t) => ['p', {}, t]);
    const body = rows.map((r) => [
      'tr',
      {},
      ['td', {}, ['p', {}, r.id]],
      ['td', {}, ['p', {}, r.item]],
      ['td', {}, ...lines(r.description)],
      [
        'td',
        {},
        ...lines(r.content),
        ...r.images.map((src) => ['p', {}, ['img', { src, alt: '' }]]),
      ],
      [
        'td',
        {},
        r.specs.length
          ? ['ul', {}, ...r.specs.map((s) => ['li', {}, ['p', {}, specToText(s)]])]
          : ['p', {}, ''],
      ],
    ]);
    return [
      'div',
      mergeAttributes(
        { 'data-type': this.name },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
      ...(node.attrs.title
        ? [['p', {}, ['strong', {}, node.attrs.title]]]
        : []),
      [
        'table',
        uiSpecTableStyle(node.attrs) ? { style: uiSpecTableStyle(node.attrs) } : {},
        ['tbody', {}, header, ...body],
      ],
    ] as any;
  },

  addCommands() {
    return {
      insertUiSpec:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              title: attributes?.title ?? 'UI Elements Specification',
              rows: attributes?.rows ?? [emptyUiSpecRow('1')],
            },
          }),

      // A whole screen section like the sample spec: heading, purpose,
      // spec table and a reference image line.
      insertUiSpecScreen:
        (screenName = 'Screen name') =>
        ({ commands }) =>
          commands.insertContent([
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: screenName }],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  marks: [{ type: 'bold' }],
                  text: 'Purpose / Overview: ',
                },
              ],
            },
            {
              type: this.name,
              attrs: {
                title: 'UI Elements Specification',
                rows: [emptyUiSpecRow('1')],
              },
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  marks: [{ type: 'bold' }],
                  text: 'Reference Image: ',
                },
                { type: 'text', text: screenName },
              ],
            },
          ]),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(this.options.view);
  },
});
