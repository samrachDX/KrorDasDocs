import { FC } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { ActionIcon, Menu, SimpleGrid, Tooltip } from "@mantine/core";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { OrderedListStyle } from "@docmost/editor-ext";
import classes from "./list-style-menu.module.css";

const LIBRARY: { style: OrderedListStyle; label: string; marks: string[] }[] = [
  { style: "default", label: "1. a. i.", marks: ["1.", "a.", "i."] },
  { style: "paren", label: "1) a) i)", marks: ["1)", "a)", "i)"] },
  { style: "legal", label: "1. 1.1. 1.1.1.", marks: ["1.", "1.1.", "1.1.1."] },
];

function currentListStyle(editor: Editor): OrderedListStyle | null {
  const { $from } = editor.state.selection;
  let style: OrderedListStyle | null = null;
  for (let d = $from.depth; d > 0; d -= 1) {
    const n = $from.node(d);
    if (n.type.name === "orderedList") style = n.attrs.listStyle || "default";
  }
  return style;
}

// Every heading on the page is numbered (and there is at least one).
function allHeadingsNumbered(editor: Editor): boolean {
  let any = false;
  let all = true;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "heading") return all;
    any = true;
    if (node.attrs.numbered !== true) all = false;
    return false;
  });
  return any && all;
}

export const ListStyleMenu: FC<{ editor: Editor }> = ({ editor }) => {
  const { t } = useTranslation();
  const state = useEditorState({
    editor,
    selector: (ctx) =>
      !ctx.editor || ctx.editor.isDestroyed
        ? null
        : {
            listStyle: currentListStyle(ctx.editor),
            headings: allHeadingsNumbered(ctx.editor),
          },
  });
  if (!state) return null;

  return (
    <Menu position="bottom-start" withinPortal width={300}>
      <Menu.Target>
        <Tooltip label={t("Multilevel list")} withArrow>
          <ActionIcon
            variant="subtle"
            color="dark"
            size="md"
            w={16}
            miw={16}
            aria-label={t("Multilevel list")}
            className="list-style-btn"
          >
            <IconChevronDown size={12} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown onMouseDown={(e) => e.preventDefault()}>
        <Menu.Label>{t("List library")}</Menu.Label>
        <SimpleGrid cols={3} spacing={6} px={6} pb={6}>
          {LIBRARY.map((item) => (
            <Menu.Item
              key={item.style}
              p={0}
              className={classes.tile}
              data-active={state.listStyle === item.style || undefined}
              data-list-style={item.style}
              aria-label={item.label}
              onClick={() => editor.chain().focus().setOrderedListStyle(item.style).run()}
            >
              {item.marks.map((m, i) => (
                <div key={m} className={classes.line} style={{ paddingLeft: i * 10 }}>
                  <span>{m}</span>
                  <i />
                </div>
              ))}
            </Menu.Item>
          ))}
        </SimpleGrid>
        <Menu.Divider />
        <Menu.Label>{t("Headings")}</Menu.Label>
        <Menu.Item
          className="heading-numbering-btn"
          rightSection={state.headings ? <IconCheck size={14} /> : null}
          onClick={() => editor.chain().focus().setHeadingNumbering(!state.headings).run()}
        >
          {t("Number headings (1, 1.1, 1.1.1)")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
