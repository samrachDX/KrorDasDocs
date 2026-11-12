import { FC } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { ActionIcon, Menu, Tooltip } from "@mantine/core";
import {
  IconBrush,
  IconIndentDecrease,
  IconIndentIncrease,
  IconLineHeight,
  IconCheck,
} from "@tabler/icons-react";
import { LINE_HEIGHTS, isEditorReady } from "@docmost/editor-ext";
import { useTranslation } from "react-i18next";

interface Props {
  editor: Editor;
}

// Format painter, line spacing and indent (Lark-style paragraph tools).
export const ParagraphGroup: FC<Props> = ({ editor }) => {
  const { t } = useTranslation();
  const state = useEditorState({
    editor,
    selector: (ctx) => {
      const ed = ctx.editor;
      if (!ed) return null;
      const block =
        ed.getAttributes("paragraph").lineHeight ??
        ed.getAttributes("heading").lineHeight ??
        null;
      return {
        painting: !!ed.storage.formatPainter?.marks,
        lineHeight: block as string | null,
      };
    },
  });
  if (!state) return null;

  return (
    <>
      <Tooltip
        label={t("Format painter: click, then select text to apply. Double-click to keep painting, Esc to stop")}
        withArrow
        multiline
        w={240}
      >
        <ActionIcon
          variant={state.painting ? "light" : "subtle"}
          color={state.painting ? "blue" : "dark"}
          size="lg"
          aria-label={t("Format painter")}
          aria-pressed={state.painting}
          className="format-painter-btn"
          onClick={(e) => {
            if (!isEditorReady(editor)) return;
            if (e.detail >= 2) {
              editor.commands.startFormatPainter(true);
            } else if (state.painting) {
              editor.commands.stopFormatPainter();
            } else {
              editor.commands.startFormatPainter(false);
            }
          }}
        >
          <IconBrush size={17} />
        </ActionIcon>
      </Tooltip>

      <Menu position="bottom-start" withinPortal>
        <Menu.Target>
          <Tooltip label={t("Line spacing")} withArrow>
            <ActionIcon variant="subtle" color="dark" size="lg" aria-label={t("Line spacing")} className="line-spacing-btn">
              <IconLineHeight size={17} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown onMouseDown={(e) => e.preventDefault()}>
          <Menu.Label>{t("Line spacing")}</Menu.Label>
          {["", ...LINE_HEIGHTS].map((v) => (
            <Menu.Item
              key={v || "default"}
              data-line-height={v || "default"}
              rightSection={(state.lineHeight ?? "") === v ? <IconCheck size={14} /> : null}
              onClick={() => editor.chain().focus().setBlockLineHeight(v).run()}
            >
              {v ? v : t("Default")}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>

      <Tooltip label={t("Decrease indent (Shift+Tab)")} withArrow>
        <ActionIcon
          variant="subtle"
          color="dark"
          size="lg"
          aria-label={t("Decrease indent")}
          onClick={() => editor.chain().focus().outdent().run()}
        >
          <IconIndentDecrease size={17} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t("Increase indent (Tab)")} withArrow>
        <ActionIcon
          variant="subtle"
          color="dark"
          size="lg"
          aria-label={t("Increase indent")}
          onClick={() => editor.chain().focus().indent().run()}
        >
          <IconIndentIncrease size={17} />
        </ActionIcon>
      </Tooltip>
    </>
  );
};
