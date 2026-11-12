import { useEffect, useMemo, useRef, useState } from "react";
import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { ActionIcon, Group, Text, Tooltip } from "@mantine/core";
import {
  IconArrowBarToRight,
  IconCornerDownLeft,
  IconTrash,
  IconPlus,
} from "@tabler/icons-react";
import { MindMapTopic, newTopicId, normalizeMindMap } from "@docmost/editor-ext";
import classes from "./mind-map.module.css";

const BRANCH_COLORS = [
  "#3370ff", "#00b386", "#f5a623", "#e5484d", "#8e4ec6", "#12a5c9", "#f76808", "#d6409f",
];
const FONT = "14px Inter, 'Segoe UI', 'Noto Sans Khmer', sans-serif";
const ROOT_FONT = "600 16px Inter, 'Segoe UI', 'Noto Sans Khmer', sans-serif";
const PAD_X = 14;
const NODE_H = 34;
const ROOT_H = 44;
const GAP_Y = 12;
const GAP_X = 56;

let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string, font: string) {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 8;
  measureCtx.font = font;
  return measureCtx.measureText(text || " ").width;
}

interface Laid {
  topic: MindMapTopic;
  x: number;
  y: number; // centre
  w: number;
  h: number;
  depth: number;
  color: string;
  parent?: Laid;
}

// Horizontal tree: root on the left, each level in its own column.
function layout(root: MindMapTopic): { nodes: Laid[]; width: number; height: number } {
  const nodes: Laid[] = [];
  const colWidth: number[] = [];
  const sizeOf = (t: MindMapTopic, depth: number) => {
    const w = Math.min(320, Math.ceil(textWidth(t.text, depth ? FONT : ROOT_FONT)) + PAD_X * 2);
    colWidth[depth] = Math.max(colWidth[depth] ?? 0, w);
    if (!t.collapsed) t.children.forEach((c) => sizeOf(c, depth + 1));
  };
  sizeOf(root, 0);

  const heightOf = (t: MindMapTopic, depth: number): number => {
    const own = depth ? NODE_H : ROOT_H;
    if (t.collapsed || !t.children.length) return own;
    const kids =
      t.children.reduce((sum, c) => sum + heightOf(c, depth + 1), 0) +
      GAP_Y * (t.children.length - 1);
    return Math.max(own, kids);
  };

  const colX: number[] = [];
  colWidth.forEach((w, d) => (colX[d] = d ? colX[d - 1] + colWidth[d - 1] + GAP_X : 0));

  const place = (t: MindMapTopic, depth: number, top: number, color: string, parent?: Laid) => {
    const total = heightOf(t, depth);
    const h = depth ? NODE_H : ROOT_H;
    const w = Math.min(320, Math.ceil(textWidth(t.text, depth ? FONT : ROOT_FONT)) + PAD_X * 2);
    const me: Laid = { topic: t, x: colX[depth], y: top + total / 2, w, h, depth, color, parent };
    nodes.push(me);
    if (t.collapsed) return;
    let y = top + (total - (t.children.reduce((s, c) => s + heightOf(c, depth + 1), 0) + GAP_Y * Math.max(0, t.children.length - 1))) / 2;
    t.children.forEach((c, i) => {
      const ch = heightOf(c, depth + 1);
      place(c, depth + 1, y, depth === 0 ? BRANCH_COLORS[i % BRANCH_COLORS.length] : color, me);
      y += ch + GAP_Y;
    });
  };
  place(root, 0, 0, "#1f3864");
  const width = Math.max(...nodes.map((n) => n.x + n.w)) + 8;
  return { nodes, width, height: heightOf(root, 0) };
}

// Immutable helpers on the topic tree.
function mapTopic(t: MindMapTopic, id: string, fn: (t: MindMapTopic) => MindMapTopic): MindMapTopic {
  if (t.id === id) return fn(t);
  return { ...t, children: t.children.map((c) => mapTopic(c, id, fn)) };
}
function findParent(t: MindMapTopic, id: string): MindMapTopic | null {
  for (const c of t.children) {
    if (c.id === id) return t;
    const p = findParent(c, id);
    if (p) return p;
  }
  return null;
}
function findTopic(t: MindMapTopic, id: string): MindMapTopic | null {
  if (t.id === id) return t;
  for (const c of t.children) {
    const f = findTopic(c, id);
    if (f) return f;
  }
  return null;
}

export default function MindMapView(props: NodeViewProps) {
  const { node, updateAttributes, editor, selected } = props;
  const editable = editor.isEditable;
  const [map, setMap] = useState<MindMapTopic>(() => normalizeMindMap(node.attrs.data));
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const local = useRef(false);

  useEffect(() => {
    if (local.current) {
      local.current = false;
      return;
    }
    setMap(normalizeMindMap(node.attrs.data));
  }, [node.attrs.data]);

  const commit = (next: MindMapTopic) => {
    setMap(next);
    local.current = true;
    updateAttributes({ data: next });
  };

  const { nodes, width, height } = useMemo(() => layout(map), [map]);
  const PAD = 16;

  const addChild = (id: string) => {
    const t = { id: newTopicId(), text: "New topic", children: [] };
    commit(mapTopic(map, id, (p) => ({ ...p, collapsed: false, children: [...p.children, t] })));
    startEdit(t.id, t.text);
  };
  const addSibling = (id: string) => {
    const parent = findParent(map, id);
    if (!parent) return addChild(id);
    const t = { id: newTopicId(), text: "New topic", children: [] };
    commit(
      mapTopic(map, parent.id, (p) => {
        const i = p.children.findIndex((c) => c.id === id);
        const children = [...p.children];
        children.splice(i + 1, 0, t);
        return { ...p, children };
      }),
    );
    startEdit(t.id, t.text);
  };
  const remove = (id: string) => {
    const parent = findParent(map, id);
    if (!parent) return;
    commit(mapTopic(map, parent.id, (p) => ({ ...p, children: p.children.filter((c) => c.id !== id) })));
    setActive(parent.id);
  };
  const toggle = (id: string) =>
    commit(mapTopic(map, id, (t) => ({ ...t, collapsed: !t.collapsed })));
  const startEdit = (id: string, text: string) => {
    setActive(id);
    setEditing(id);
    setDraft(text);
  };
  const finishEdit = () => {
    if (!editing) return;
    const id = editing;
    setEditing(null);
    commit(mapTopic(map, id, (t) => ({ ...t, text: draft.trim() || t.text })));
    boxRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!editable || editing || !active) return;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === "Tab") {
      handled();
      addChild(active);
    } else if (e.key === "Enter") {
      handled();
      addSibling(active);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      handled();
      remove(active);
    } else if (e.key === "F2" || e.key === " ") {
      handled();
      const t = findTopic(map, active);
      if (t) startEdit(t.id, t.text);
    } else if (e.key === "Escape") {
      handled();
      setActive(null);
    }
  };

  const activeLaid = nodes.find((n) => n.topic.id === active);
  const editLaid = nodes.find((n) => n.topic.id === editing);

  return (
    <NodeViewWrapper
      className={`${classes.wrapper} ${selected ? classes.selected : ""}`}
      contentEditable={false}
    >
      {editable && (
        <Group gap={4} className={classes.toolbar} data-drag-handle>
          <Text size="xs" c="dimmed" mr="xs">
            Mind map
          </Text>
          <Tooltip label="Add subtopic (Tab)">
            <ActionIcon size="sm" variant="subtle" disabled={!active} onClick={() => active && addChild(active)}>
              <IconArrowBarToRight size={15} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Add topic below (Enter)">
            <ActionIcon size="sm" variant="subtle" disabled={!active} onClick={() => active && addSibling(active)}>
              <IconCornerDownLeft size={15} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete topic (Delete)">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              disabled={!active || active === map.id}
              onClick={() => active && remove(active)}
            >
              <IconTrash size={15} />
            </ActionIcon>
          </Tooltip>
          <Text size="xs" c="dimmed" ml="xs">
            Double-click a topic to rename it
          </Text>
        </Group>
      )}
      <div
        ref={boxRef}
        className={classes.canvas}
        tabIndex={editable ? 0 : -1}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget || (e.target as Element).tagName === "svg") setActive(null);
        }}
      >
        <div style={{ position: "relative", width: width + PAD * 2, height: height + PAD * 2 }}>
          <svg width={width + PAD * 2} height={height + PAD * 2} className={classes.svg}>
            <g transform={`translate(${PAD},${PAD})`}>
              {nodes
                .filter((n) => n.parent)
                .map((n) => {
                  const p = n.parent!;
                  const x1 = p.x + p.w;
                  const x2 = n.x;
                  const mx = (x1 + x2) / 2;
                  return (
                    <path
                      key={`e-${n.topic.id}`}
                      d={`M${x1},${p.y} C${mx},${p.y} ${mx},${n.y} ${x2},${n.y}`}
                      stroke={n.color}
                      strokeWidth={n.depth === 1 ? 2.5 : 1.6}
                      fill="none"
                    />
                  );
                })}
              {nodes.map((n) => {
                const isRoot = n.depth === 0;
                const isActive = n.topic.id === active;
                return (
                  <g
                    key={n.topic.id}
                    className={classes.topic}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setActive(n.topic.id);
                      boxRef.current?.focus();
                    }}
                    onDoubleClick={() => editable && startEdit(n.topic.id, n.topic.text)}
                  >
                    <rect
                      x={n.x}
                      y={n.y - n.h / 2}
                      width={n.w}
                      height={n.h}
                      rx={isRoot ? 10 : 8}
                      fill={isRoot ? "#1f3864" : n.depth === 1 ? n.color : "var(--mm-topic-bg)"}
                      stroke={isActive ? "#1c7ed6" : n.depth > 1 ? n.color : "none"}
                      strokeWidth={isActive ? 2.5 : 1.2}
                    />
                    <text
                      x={n.x + n.w / 2}
                      y={n.y}
                      dominantBaseline="central"
                      textAnchor="middle"
                      style={{ font: isRoot ? ROOT_FONT : FONT }}
                      fill={n.depth <= 1 ? "#fff" : "var(--mm-topic-fg)"}
                    >
                      {n.topic.text.length > 40 ? n.topic.text.slice(0, 39) + "…" : n.topic.text}
                    </text>
                    {n.topic.children.length > 0 && !isRoot && (
                      <g
                        className={classes.fold}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          toggle(n.topic.id);
                        }}
                      >
                        <circle cx={n.x + n.w + 8} cy={n.y} r={7} fill="var(--mm-fold-bg)" stroke={n.color} />
                        <text
                          x={n.x + n.w + 8}
                          y={n.y}
                          dominantBaseline="central"
                          textAnchor="middle"
                          fontSize={n.topic.collapsed ? 9 : 12}
                          fill={n.color}
                        >
                          {n.topic.collapsed ? n.topic.children.length : "−"}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
          {editLaid && (
            <input
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              className={classes.editInput}
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onBlur={finishEdit}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") finishEdit();
                if (e.key === "Escape") {
                  setEditing(null);
                  boxRef.current?.focus();
                }
              }}
              style={{
                left: editLaid.x + PAD,
                top: editLaid.y - editLaid.h / 2 + PAD,
                width: Math.max(editLaid.w, 140),
                height: editLaid.h,
              }}
            />
          )}
          {editable && activeLaid && !editLaid && (
            <ActionIcon
              size="xs"
              radius="xl"
              className={classes.addBtn}
              style={{ left: activeLaid.x + activeLaid.w + PAD + (activeLaid.topic.children.length && activeLaid.depth ? 20 : 6), top: activeLaid.y + PAD - 9 }}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                addChild(activeLaid.topic.id);
              }}
              aria-label="Add subtopic"
            >
              <IconPlus size={12} />
            </ActionIcon>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}
