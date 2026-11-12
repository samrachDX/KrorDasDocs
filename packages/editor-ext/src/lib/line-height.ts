import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockLineHeight: {
      // Line spacing for the paragraphs and headings in the selection;
      // empty string resets to the default.
      setBlockLineHeight: (value: string) => ReturnType;
    };
  }
}

export const LINE_HEIGHTS = ['1', '1.15', '1.5', '2', '2.5', '3'];

const valid = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return /^\d(\.\d{1,2})?$/.test(s) && parseFloat(s) >= 0.5 ? s : null;
};

export const BlockLineHeight = Extension.create<{ types: string[] }>({
  name: 'blockLineHeight',

  addOptions() {
    return { types: ['paragraph', 'heading'] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            keepOnSplit: true,
            parseHTML: (el) =>
              valid(el.getAttribute('data-line-height') ?? el.style.lineHeight),
            renderHTML: (attrs) => {
              const v = valid(attrs.lineHeight);
              return v
                ? { 'data-line-height': v, style: `line-height: ${v}` }
                : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setBlockLineHeight:
        (value) =>
        ({ state, tr, dispatch }) => {
          const v = valid(value);
          const { from, to } = state.selection;
          let changed = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (!this.options.types.includes(node.type.name)) return;
            if ((node.attrs.lineHeight ?? null) === v) return;
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineHeight: v });
            changed = true;
          });
          if (changed && dispatch) dispatch(tr);
          return changed;
        },
    };
  },
});
