import { Extension } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";

// Marks the painter copies and replaces. Links and comments are content, not
// formatting, so they are left alone.
const FORMAT_MARKS = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "textStyle",
  "highlight",
  "superscript",
  "subscript",
]);

export interface FormatPainterStorage {
  marks: Mark[] | null;
  sticky: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    formatPainter: {
      // Copies the formatting at the selection; the next selection made with
      // the mouse gets it. sticky keeps painting until Escape.
      startFormatPainter: (sticky?: boolean) => ReturnType;
      stopFormatPainter: () => ReturnType;
    };
  }
  interface Storage {
    formatPainter: FormatPainterStorage;
  }
}

const key = new PluginKey("formatPainter");

export const FormatPainter = Extension.create<object, FormatPainterStorage>({
  name: "formatPainter",

  addStorage() {
    return { marks: null, sticky: false };
  },

  addCommands() {
    return {
      startFormatPainter:
        (sticky = false) =>
        ({ state, editor }) => {
          const { from, empty, $from } = state.selection;
          const marks = empty
            ? (state.storedMarks ?? $from.marks())
            : (state.doc.nodeAt(from)?.marks ?? $from.marks());
          editor.storage.formatPainter.marks = marks.filter((m) =>
            FORMAT_MARKS.has(m.type.name),
          );
          editor.storage.formatPainter.sticky = sticky;
          editor.view.dom.classList.add("format-painting");
          editor.view.dispatch(state.tr.setMeta(key, "changed"));
          return true;
        },
      stopFormatPainter:
        () =>
        ({ editor, state }) => {
          editor.storage.formatPainter.marks = null;
          editor.storage.formatPainter.sticky = false;
          editor.view.dom.classList.remove("format-painting");
          editor.view.dispatch(state.tr.setMeta(key, "changed"));
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Escape: () =>
        this.storage.marks ? this.editor.commands.stopFormatPainter() : false,
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const storage = this.storage;
    return [
      new Plugin({
        key,
        props: {
          handleDOMEvents: {
            mouseup: () => {
              if (!storage.marks) return false;
              // Let the click/drag selection settle first.
              setTimeout(() => {
                const marks = storage.marks;
                if (!marks || editor.isDestroyed) return;
                const { state, view } = editor;
                const { from, to, empty } = state.selection;
                if (empty) return;
                const tr = state.tr;
                for (const name of FORMAT_MARKS) {
                  const type = state.schema.marks[name];
                  if (type) tr.removeMark(from, to, type);
                }
                for (const m of marks) tr.addMark(from, to, m);
                view.dispatch(tr);
                if (!storage.sticky) editor.commands.stopFormatPainter();
              }, 0);
              return false;
            },
          },
        },
      }),
    ];
  },
});
