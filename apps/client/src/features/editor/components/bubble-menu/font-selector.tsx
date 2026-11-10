import { FC, useState } from "react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";
import {
  Button,
  Popover,
  rem,
  Text,
  Tooltip,
  Stack,
  Group,
  UnstyledButton,
  ScrollArea,
  NumberInput,
} from "@mantine/core";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { isEditorReady } from "@docmost/editor-ext";
import clsx from "clsx";
import classes from "./bubble-menu.module.css";

export const FONT_FAMILIES: { name: string; value: string }[] = [
  { name: "Default", value: "" },
  { name: "Arial", value: "Arial, Helvetica, sans-serif" },
  { name: "Calibri", value: "Calibri, Carlito, sans-serif" },
  { name: "Segoe UI", value: "'Segoe UI', Tahoma, sans-serif" },
  { name: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { name: "Georgia", value: "Georgia, serif" },
  { name: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { name: "Courier New", value: "'Courier New', Courier, monospace" },
  { name: "Khmer OS", value: "'Khmer OS', 'Khmer OS System', 'Noto Sans Khmer', sans-serif" },
  { name: "Khmer OS Battambang", value: "'Khmer OS Battambang', 'Battambang', serif" },
  { name: "Khmer OS Siemreap", value: "'Khmer OS Siemreap', 'Siemreap', sans-serif" },
];

export const FONT_SIZES = [
  "10", "11", "12", "14", "16", "18", "20", "24", "28", "32", "36", "48",
];

interface Props {
  editor: Editor | null;
  compact?: boolean;
}

export const FontSelector: FC<Props> = ({ editor, compact }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<string | number>("");

  const state = useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor) return null;
      const attrs = ctx.editor.getAttributes("textStyle") || {};
      return {
        fontFamily: (attrs.fontFamily as string) || "",
        fontSize: (attrs.fontSize as string) || "",
      };
    },
  });

  if (!editor || !state) return null;

  const familyName =
    FONT_FAMILIES.find((f) => f.value && f.value === state.fontFamily)?.name ||
    (state.fontFamily ? state.fontFamily.split(",")[0].replace(/'/g, "") : "");
  const sizeValue = state.fontSize.replace(/px$/, "");
  const label = compact
    ? sizeValue || "Aa"
    : `${familyName || t("Font")}${sizeValue ? ` · ${sizeValue}` : ""}`;

  const setFamily = (value: string) => {
    if (!isEditorReady(editor)) return;
    if (!value) editor.chain().focus().unsetFontFamily().run();
    else editor.chain().focus().setFontFamily(value).run();
  };
  const setSize = (value: string) => {
    if (!isEditorReady(editor)) return;
    if (!value) editor.chain().focus().unsetFontSize().run();
    else editor.chain().focus().setFontSize(`${value}px`).run();
  };

  return (
    <Popover width={260} opened={open} onChange={setOpen} withArrow>
      <Popover.Target>
        <Tooltip label={t("Font and size")} withArrow withinPortal={false}>
          <Button
            variant="default"
            radius="0"
            rightSection={<IconChevronDown size={16} />}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(!open)}
            className={clsx(["font-selector-trigger", classes.buttonRoot])}
            style={{ fontWeight: 500, maxWidth: rem(190) }}
            aria-label={t("Font and size")}
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <Text size="sm" truncate>
              {label}
            </Text>
          </Button>
        </Tooltip>
      </Popover.Target>

      <Popover.Dropdown onMouseDown={(e) => e.preventDefault()}>
        <Stack gap="sm" p="2px">
          <div>
            <Text size="sm" fw={600} mb={4}>
              {t("Font size")}
            </Text>
            <Group gap={4}>
              {["", ...FONT_SIZES].map((s) => (
                <UnstyledButton
                  key={s || "default"}
                  onClick={() => setSize(s)}
                  data-font-size={s || "default"}
                  style={{
                    padding: "2px 8px",
                    borderRadius: rem(4),
                    fontSize: rem(13),
                    border:
                      sizeValue === s
                        ? "2px solid var(--mantine-color-blue-6)"
                        : "1px solid var(--mantine-color-gray-4)",
                  }}
                >
                  {s || t("Default")}
                </UnstyledButton>
              ))}
            </Group>
            <NumberInput
              mt={6}
              size="xs"
              min={6}
              max={120}
              placeholder={t("Custom size (px)")}
              value={custom}
              onChange={(v) => setCustom(typeof v === "bigint" ? Number(v) : v)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && custom) {
                  e.preventDefault();
                  setSize(String(custom));
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <Text size="sm" fw={600} mb={4}>
              {t("Font")}
            </Text>
            <ScrollArea.Autosize mah={220}>
              <Stack gap={0}>
                {FONT_FAMILIES.map((f) => (
                  <UnstyledButton
                    key={f.name}
                    onClick={() => {
                      setFamily(f.value);
                      setOpen(false);
                    }}
                    data-font-family={f.name}
                    style={{
                      padding: "4px 8px",
                      borderRadius: rem(4),
                      fontFamily: f.value || undefined,
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                    className={classes.fontItem}
                  >
                    <span>{f.name === "Default" ? t("Default") : f.name}</span>
                    {(state.fontFamily || "") === f.value && (
                      <IconCheck size={14} />
                    )}
                  </UnstyledButton>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          </div>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};
