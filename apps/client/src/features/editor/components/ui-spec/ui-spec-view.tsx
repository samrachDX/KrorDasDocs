import { useEffect, useRef, useState } from "react";
import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
  ActionIcon,
  Autocomplete,
  Button,
  ColorSwatch,
  Group,
  Image,
  Menu,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import {
  IconArrowDown,
  IconArrowUp,
  IconDots,
  IconPlus,
  IconRowInsertBottom,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  emptyUiSpecRow,
  nextUiSpecId,
  normalizeUiSpecRows,
  UI_SPEC_COLUMNS,
  UI_SPEC_KEYS,
  UiSpecRow,
  URL_SPEC_KEYS,
} from "@docmost/editor-ext";
import classes from "./ui-spec.module.css";

const CSS_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i;

function colorOf(value: string): string | null {
  const v = value.trim().split(/\s+/)[0] ?? "";
  return CSS_COLOR.test(v) ? v : null;
}

function isUrl(value: string) {
  return /^https?:\/\/\S+$/i.test(value.trim()) || value.trim().startsWith("/api/files/");
}

function SpecValue({ k, value }: { k: string; value: string }) {
  const color = colorOf(value);
  if (URL_SPEC_KEYS.includes(k) && isUrl(value)) {
    return (
      <a href={value} target="_blank" rel="noreferrer" className={classes.link}>
        {k === "Image Link" ? (
          <Image src={value} h={48} w="auto" fit="contain" radius="sm" />
        ) : (
          value
        )}
      </a>
    );
  }
  return (
    <span className={classes.specValue}>
      {color && <ColorSwatch color={color} size={12} mr={4} />}
      {value}
    </span>
  );
}

export default function UiSpecView(props: NodeViewProps) {
  const { node, updateAttributes, editor, selected } = props;
  const editable = editor.isEditable;
  const [rows, setRows] = useState<UiSpecRow[]>(() =>
    normalizeUiSpecRows(node.attrs.rows),
  );
  const [title, setTitle] = useState<string>(node.attrs.title ?? "");
  const localChange = useRef(false);

  // Pick up remote / undo changes.
  useEffect(() => {
    if (localChange.current) {
      localChange.current = false;
      return;
    }
    setRows(normalizeUiSpecRows(node.attrs.rows));
    setTitle(node.attrs.title ?? "");
  }, [node.attrs.rows, node.attrs.title]);

  const save = useDebouncedCallback((next: UiSpecRow[]) => {
    localChange.current = true;
    updateAttributes({ rows: next });
  }, 300);

  const change = (next: UiSpecRow[], immediate = false) => {
    setRows(next);
    if (immediate) {
      localChange.current = true;
      updateAttributes({ rows: next });
    } else {
      save(next);
    }
  };

  const updateRow = (i: number, patch: Partial<UiSpecRow>) =>
    change(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const insertRow = (at: number) => {
    const next = [...rows];
    next.splice(at, 0, emptyUiSpecRow(nextUiSpecId(rows[at - 1]?.id)));
    change(next, true);
  };

  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    change(next, true);
  };

  const removeRow = (i: number) =>
    change(
      rows.filter((_, idx) => idx !== i),
      true,
    );

  const updateSpec = (i: number, s: number, patch: { key?: string; value?: string }) =>
    updateRow(i, {
      specs: rows[i].specs.map((f, idx) => (idx === s ? { ...f, ...patch } : f)),
    });

  const addSpec = (i: number) =>
    updateRow(i, { specs: [...rows[i].specs, { key: "", value: "" }] });

  const removeSpec = (i: number, s: number) =>
    updateRow(i, { specs: rows[i].specs.filter((_, idx) => idx !== s) });

  const text = (value: string, onChange: (v: string) => void, placeholder: string) =>
    editable ? (
      <Textarea
        variant="unstyled"
        autosize
        minRows={1}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.currentTarget.value)}
        classNames={{ input: classes.cellInput }}
      />
    ) : (
      <div className={classes.cellText}>{value}</div>
    );

  return (
    <NodeViewWrapper
      className={`${classes.wrapper} ${selected ? classes.selected : ""}`}
      data-drag-handle
      contentEditable={false}
    >
      {editable ? (
        <TextInput
          variant="unstyled"
          value={title}
          placeholder="Table title (optional)"
          onChange={(e) => {
            setTitle(e.currentTarget.value);
            localChange.current = true;
            updateAttributes({ title: e.currentTarget.value });
          }}
          classNames={{ input: classes.title }}
        />
      ) : (
        title && <div className={classes.title}>{title}</div>
      )}

      <div className={classes.scroll}>
        <table className={classes.table}>
          <colgroup>
            <col style={{ width: "7%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "21%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "41%" }} />
          </colgroup>
          <thead>
            <tr>
              {UI_SPEC_COLUMNS.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className={classes.idCell}>
                  {editable && (
                    <Menu position="bottom-start" withinPortal>
                      <Menu.Target>
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color="gray"
                          className={classes.rowMenu}
                        >
                          <IconDots size={14} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconRowInsertBottom size={14} />}
                          onClick={() => insertRow(i + 1)}
                        >
                          Insert row below
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconArrowUp size={14} />}
                          disabled={i === 0}
                          onClick={() => moveRow(i, -1)}
                        >
                          Move up
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconArrowDown size={14} />}
                          disabled={i === rows.length - 1}
                          onClick={() => moveRow(i, 1)}
                        >
                          Move down
                        </Menu.Item>
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => removeRow(i)}
                        >
                          Delete row
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                  {text(row.id, (v) => updateRow(i, { id: v }), "1.1")}
                </td>
                <td>{text(row.item, (v) => updateRow(i, { item: v }), "Item")}</td>
                <td>
                  {text(row.description, (v) => updateRow(i, { description: v }), "Description")}
                </td>
                <td>{text(row.content, (v) => updateRow(i, { content: v }), "Content")}</td>
                <td>
                  <ul className={classes.specList}>
                    {row.specs.map((f, s) => (
                      <li key={s} className={classes.specItem}>
                        {editable ? (
                          <Group gap={4} wrap="nowrap" align="flex-start">
                            <Autocomplete
                              size="xs"
                              variant="unstyled"
                              placeholder="Key"
                              data={UI_SPEC_KEYS as unknown as string[]}
                              value={f.key}
                              onChange={(v) => updateSpec(i, s, { key: v })}
                              classNames={{ input: classes.keyInput }}
                              comboboxProps={{ withinPortal: true }}
                              w={100}
                            />
                            <span className={classes.colon}>:</span>
                            {colorOf(f.value) && (
                              <ColorSwatch color={colorOf(f.value)!} size={12} mt={7} />
                            )}
                            <Textarea
                              variant="unstyled"
                              autosize
                              minRows={1}
                              size="xs"
                              placeholder="Value"
                              value={f.value}
                              onChange={(e) =>
                                updateSpec(i, s, { value: e.currentTarget.value })
                              }
                              classNames={{ input: classes.cellInput }}
                              style={{ flex: 1 }}
                            />
                            <ActionIcon
                              size="xs"
                              variant="subtle"
                              color="gray"
                              mt={4}
                              className={classes.noPrint}
                              onClick={() => removeSpec(i, s)}
                              aria-label="Remove field"
                            >
                              <IconX size={12} />
                            </ActionIcon>
                          </Group>
                        ) : (
                          <>
                            {f.key && <b>{f.key}: </b>}
                            <SpecValue k={f.key} value={f.value} />
                          </>
                        )}
                        {editable && URL_SPEC_KEYS.includes(f.key) && f.key === "Image Link" && isUrl(f.value) && (
                          <Image src={f.value} h={48} w="auto" fit="contain" radius="sm" mt={4} />
                        )}
                      </li>
                    ))}
                  </ul>
                  {editable && (
                    <Button
                      className={classes.noPrint}
                      size="compact-xs"
                      variant="subtle"
                      leftSection={<IconPlus size={12} />}
                      onClick={() => addSpec(i)}
                    >
                      Field
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <Tooltip label="Add a row with the next ID">
          <Button
            className={classes.noPrint}
            mt={6}
            size="compact-sm"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={() => insertRow(rows.length)}
          >
            Add row
          </Button>
        </Tooltip>
      )}
    </NodeViewWrapper>
  );
}
