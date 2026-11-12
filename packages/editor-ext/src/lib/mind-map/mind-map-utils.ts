export interface MindMapTopic {
  id: string;
  text: string;
  children: MindMapTopic[];
  collapsed?: boolean;
}

export const newTopicId = () => Math.random().toString(36).slice(2, 10);

export function defaultMindMap(): MindMapTopic {
  return {
    id: newTopicId(),
    text: 'Central topic',
    children: [
      { id: newTopicId(), text: 'Topic 1', children: [] },
      { id: newTopicId(), text: 'Topic 2', children: [] },
      { id: newTopicId(), text: 'Topic 3', children: [] },
    ],
  };
}

export function normalizeMindMap(value: unknown): MindMapTopic {
  let v: any = value;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  const walk = (t: any, depth: number): MindMapTopic => ({
    id: typeof t?.id === 'string' && t.id ? t.id : newTopicId(),
    text: String(t?.text ?? ''),
    children:
      depth < 20 && Array.isArray(t?.children)
        ? t.children.map((c: any) => walk(c, depth + 1))
        : [],
    ...(t?.collapsed ? { collapsed: true } : {}),
  });
  return v && typeof v === 'object' ? walk(v, 0) : defaultMindMap();
}

// Builds a mind map from a nested <ul>/<ol> outline (export round trip).
export function mindMapFromList(rootText: string, list: Element | null): MindMapTopic {
  const fromList = (ul: Element | null): MindMapTopic[] =>
    ul
      ? Array.from(ul.children)
          .filter((li) => li.tagName === 'LI')
          .map((li) => {
            const sub = Array.from(li.children).find(
              (c) => c.tagName === 'UL' || c.tagName === 'OL',
            ) as Element | undefined;
            const own = Array.from(li.childNodes)
              .filter((n) => n !== sub)
              .map((n) => n.textContent ?? '')
              .join('')
              .trim();
            return { id: newTopicId(), text: own, children: fromList(sub ?? null) };
          })
      : [];
  return { id: newTopicId(), text: rootText, children: fromList(list) };
}
