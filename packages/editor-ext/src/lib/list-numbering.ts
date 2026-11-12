import { Extension } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    listNumbering: {
      // Multilevel style of the numbered list around the selection (turns
      // the selection into a numbered list first if it is not one).
      setOrderedListStyle: (style: OrderedListStyle) => ReturnType;
      // Heading numbering (1, 1.1, 1.1.1) for every heading on the page.
      setHeadingNumbering: (on: boolean) => ReturnType;
      // Numbered list button: on a heading it numbers the heading itself
      // (a list item cannot start with a heading), elsewhere a numbered list.
      toggleNumberedList: () => ReturnType;
    };
  }
}

// default: 1. a. i.   paren: 1) a) i)   legal: 1. 1.1. 1.1.1.
export const ORDERED_LIST_STYLES = ['default', 'paren', 'legal'] as const;
export type OrderedListStyle = (typeof ORDERED_LIST_STYLES)[number];

const validStyle = (v: unknown): OrderedListStyle | null =>
  v === 'paren' || v === 'legal' ? v : null;

// numbered: true when the heading carries a number.
const parseNumbered = (v: string | null): boolean | null =>
  v === 'true' ? true : v === 'false' ? false : null;

export function hasHeadingNumbering(doc: PMNode): boolean {
  let on = false;
  doc.descendants((node) => {
    if (on) return false;
    if (node.type.name === 'heading' && node.attrs.numbered === true) on = true;
    return !on;
  });
  return on;
}

// Labels for the numbered headings, keyed by node: the top numbered level is
// "1.", deeper ones "1.1", "1.1.1". Skipped levels are left out.
export function headingNumbers(doc: PMNode): Map<PMNode, string> {
  const out = new Map<PMNode, string>();
  if (!hasHeadingNumbering(doc)) return out;
  const items: { node: PMNode; level: number }[] = [];
  doc.descendants((node) => {
    if (node.type.name !== 'heading') return true;
    if (node.attrs.numbered === true) {
      items.push({ node, level: Math.min(6, Math.max(1, node.attrs.level ?? 1)) });
    }
    return false;
  });
  const base = Math.min(...items.map((i) => i.level));
  const counters = [0, 0, 0, 0, 0, 0];
  for (const { node, level } of items) {
    counters[level - 1] += 1;
    for (let i = level; i < 6; i += 1) counters[i] = 0;
    const parts = counters.slice(base - 1, level).filter((c) => c > 0);
    out.set(node, parts.length === 1 ? `${parts[0]}.` : parts.join('.'));
  }
  return out;
}

const key = new PluginKey('listNumbering');

export const ListNumbering = Extension.create({
  name: 'listNumbering',

  addGlobalAttributes() {
    return [
      {
        types: ['orderedList'],
        attributes: {
          listStyle: {
            default: null,
            parseHTML: (el) => validStyle(el.getAttribute('data-list-style')),
            renderHTML: (attrs) => {
              const v = validStyle(attrs.listStyle);
              return v ? { 'data-list-style': v } : {};
            },
          },
        },
      },
      {
        types: ['heading'],
        attributes: {
          numbered: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => parseNumbered(el.getAttribute('data-numbered')),
            renderHTML: (attrs) =>
              typeof attrs.numbered === 'boolean'
                ? { 'data-numbered': String(attrs.numbered) }
                : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setOrderedListStyle:
        (style) =>
        ({ editor, commands, tr }) => {
          if (editor.isActive('heading') && !editor.isActive('orderedList')) {
            return commands.toggleNumberedList();
          }
          if (!editor.isActive('orderedList') && !commands.toggleOrderedList()) {
            return false;
          }
          // The outermost numbered list of the nesting owns every level's style.
          const { $from } = tr.selection;
          const listy = ['orderedList', 'bulletList', 'taskList', 'listItem', 'taskItem'];
          let found: { pos: number; node: PMNode } | null = null;
          for (let d = $from.depth; d > 0; d -= 1) {
            const n = $from.node(d);
            if (n.type.name === 'orderedList') found = { pos: $from.before(d), node: n };
            else if (found && !listy.includes(n.type.name)) break;
          }
          if (!found) return false;
          tr.setNodeMarkup(found.pos, undefined, {
            ...found.node.attrs,
            listStyle: validStyle(style),
          });
          return true;
        },
      toggleNumberedList:
        () =>
        ({ editor, commands, state, tr, dispatch }) => {
          if (!editor.isActive('heading') || editor.isActive('orderedList')) {
            return commands.toggleOrderedList();
          }
          const { from, to } = state.selection;
          const heads: { pos: number; node: PMNode }[] = [];
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.type.name === 'heading') heads.push({ pos, node });
          });
          const on = !heads.every((h) => h.node.attrs.numbered === true);
          for (const h of heads) {
            tr.setNodeMarkup(h.pos, undefined, { ...h.node.attrs, numbered: on ? true : null });
          }
          if (dispatch) dispatch(tr);
          return heads.length > 0;
        },
      setHeadingNumbering:
        (on) =>
        ({ state, tr, dispatch }) => {
          let changed = false;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'heading') return true;
            const next = on ? true : null;
            if (node.attrs.numbered !== next) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, numbered: next });
              changed = true;
            }
            return false;
          });
          if (changed && dispatch) dispatch(tr);
          return changed;
        },
    };
  },

  addProseMirrorPlugins() {
    const build = (doc: PMNode) => {
      const labels = headingNumbers(doc);
      if (!labels.size) return DecorationSet.empty;
      const decos: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (node.type.name !== 'heading') return true;
        const label = labels.get(node);
        if (label) {
          decos.push(
            Decoration.node(pos, pos + node.nodeSize, {
              'data-heading-number': label,
            }),
          );
        }
        return false;
      });
      return DecorationSet.create(doc, decos);
    };
    return [
      new Plugin({
        key,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
        },
      }),
    ];
  },
});
