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
  Select,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import {
  IconArrowDown,
  IconArrowUp,
  IconDots,
  IconPhotoPlus,
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
  uiSpecTableStyle,
} from "@docmost/editor-ext";
import { notifications } from "@mantine/notifications";
import { getFileUrl } from "@/lib/config.ts";
import { uploadFile } from "@/features/page/services/page-service.ts";
import {
  FONT_FAMILIES,
  FONT_SIZES,
} from "@/features/editor/components/bubble-menu/font-selector";
import classes from "./ui-spec.module.css";

const CSS_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i;

function colorOf(value: string): string | null {
  const v = value.trim().split(/\s+/)[0] ?? "";
  return CSS_COLOR.test(v) ? v : null;
}

// Opens the file picker and returns the chosen images.
function pickImages(multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

function isUrl(value: string) {
  return /^https?:\/\/\S+$/i.test(value.trim()) || value.trim().startsWith("/api/files/");
}

function SpecValue({ k, value }: { k: string; value: string }) {
  const color = colorOf(value);
  if (URL_SPEC_KEYS.includes(k) && isUrl(value)) {
    return (
      <a href={getFileUrl(value)} target="_blank" rel="noreferrer" className={classes.link}>
        {k === "Image Link" ? (
          <Image src={getFileUrl(value)} h={48} w="auto" fit="contain" radius="sm" />
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

  const pageId: string | undefined = (editor.storage as any)?.pageId;

  const upload = async (files: File[]): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const a = await uploadFile(file, pageId as string);
        urls.push(`/api/files/${a.id}/${a.fileName}`);
      } catch (err: any) {
        notifications.show({
          color: "red",
          message: err?.response?.data?.message || "Image upload failed",
        });
      }
    }
    return urls;
  };

  // Uses the latest rows: uploads finish after the state they started from.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const addImages = async (i: number, files: File[]) => {
    const urls = await upload(files);
    if (!urls.length) return;
    const cur = rowsRef.current;
    change(
      cur.map((r, idx) => (idx === i ? { ...r, images: [...r.images, ...urls] } : r)),
      true,
    );
  };

  const removeImage = (i: number, k: number) =>
    change(
      rows.map((r, idx) =>
        idx === i ? { ...r, images: r.images.filter((_, j) => j !== k) } : r,
      ),
      true,
    );

  const uploadSpecImage = async (i: number, s: number) => {
    const [url] = await upload(await pickImages(false));
    if (!url) return;
    const cur = rowsRef.current;
    change(
      cur.map((r, idx) =>
        idx === i
          ? { ...r, specs: r.specs.map((f, j) => (j === s ? { ...f, value: url } : f)) }
          : r,
      ),
      true,
    );
  };

  const pastedImages = (e: React.ClipboardEvent) =>
    Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));

  const tableStyle = uiSpecTableStyle(node.attrs);
  const familyOptions = FONT_FAMILIES.map((f) => ({
    value: f.value || "default",
    label: f.name,
  }));
  const sizeOptions = [
    { value: "default", label: "Default size" },
    ...FONT_SIZES.map((v) => ({ value: `${v}px`, label: `${v} px` })),
  ];

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
      {editable && (
        <Group gap={6} mb={4} className={classes.noPrint}>
          <Select
            size="xs"
            w={180}
            aria-label="Table font"
            data={familyOptions}
            value={node.attrs.fontFamily || "default"}
            onChange={(v) =>
              updateAttributes({ fontFamily: !v || v === "default" ? "" : v })
            }
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            renderOption={({ option }) => (
              <span style={{ fontFamily: option.value === "default" ? undefined : option.value }}>
                {option.label}
              </span>
            )}
          />
          <Select
            size="xs"
            w={120}
            aria-label="Table font size"
            data={sizeOptions}
            value={node.attrs.fontSize || "default"}
            onChange={(v) =>
              updateAttributes({ fontSize: !v || v === "default" ? "" : v })
            }
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
          />
        </Group>
      )}
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
        <table
          className={classes.table}
          style={{
            fontFamily: node.attrs.fontFamily || undefined,
            fontSize: tableStyle.includes("font-size") ? node.attrs.fontSize : undefined,
          }}
        >
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
                <td
                  onPaste={(e) => {
                    const files = editable ? pastedImages(e) : [];
                    if (files.length) {
                      e.preventDefault();
                      addImages(i, files);
                    }
                  }}
                >
                  {text(row.content, (v) => updateRow(i, { content: v }), "Content")}
                  {row.images.map((src, k) => (
                    <div key={`${src}-${k}`} className={classes.imageBox}>
                      <a href={getFileUrl(src)} target="_blank" rel="noreferrer">
                        <img src={getFileUrl(src)} alt="" className={classes.cellImage} />
                      </a>
                      {editable && (
                        <ActionIcon
                          size="xs"
                          variant="filled"
                          color="gray"
                          className={`${classes.imageRemove} ${classes.noPrint}`}
                          onClick={() => removeImage(i, k)}
                          aria-label="Remove image"
                        >
                          <IconX size={12} />
                        </ActionIcon>
                      )}
                    </div>
                  ))}
                  {editable && (
                    <Tooltip label="Add image (or paste one into this cell)">
                      <Button
                        className={classes.noPrint}
                        size="compact-xs"
                        variant="subtle"
                        leftSection={<IconPhotoPlus size={12} />}
                        onClick={async () => addImages(i, await pickImages())}
                      >
                        Image
                      </Button>
                    </Tooltip>
                  )}
                </td>
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
                            {f.key === "Image Link" && (
                              <Tooltip label="Upload image">
                                <ActionIcon
                                  size="xs"
                                  variant="subtle"
                                  color="gray"
                                  mt={4}
                                  className={classes.noPrint}
                                  onClick={() => uploadSpecImage(i, s)}
                                  aria-label="Upload image"
                                >
                                  <IconPhotoPlus size={12} />
                                </ActionIcon>
                              </Tooltip>
                            )}
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
                          <Image src={getFileUrl(f.value)} h={48} w="auto" fit="contain" radius="sm" mt={4} />
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
