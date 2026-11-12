import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import {
  defaultMindMap,
  mindMapFromList,
  MindMapTopic,
  normalizeMindMap,
} from './mind-map-utils';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mindMap: {
      insertMindMap: () => ReturnType;
    };
  }
}

const outline = (t: MindMapTopic): any[] =>
  t.children.length
    ? ['ul', {}, ...t.children.map((c) => ['li', {}, c.text, ...(c.children.length ? [outline(c)] : [])])]
    : ['ul', {}];

export const MindMap = Node.create<{ view: any; HTMLAttributes: Record<string, any> }>({
  name: 'mindMap',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { view: null, HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      data: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-map');
          if (raw) return normalizeMindMap(raw);
          const root = el.querySelector('[data-mind-map-root]');
          return mindMapFromList(
            root?.textContent?.trim() || 'Central topic',
            el.querySelector('ul'),
          );
        },
        renderHTML: (attrs) => ({
          'data-map': JSON.stringify(normalizeMindMap(attrs.data)),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-type="${this.name}"]` }];
  },

  // Exports (Markdown, HTML) get the topics as a nested outline.
  renderHTML({ node, HTMLAttributes }) {
    const map = normalizeMindMap(node.attrs.data);
    return [
      'div',
      mergeAttributes({ 'data-type': this.name }, this.options.HTMLAttributes, HTMLAttributes),
      ['p', { 'data-mind-map-root': '' }, ['strong', {}, map.text]],
      outline(map),
    ];
  },

  addCommands() {
    return {
      insertMindMap:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { data: defaultMindMap() },
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(this.options.view);
  },
});
