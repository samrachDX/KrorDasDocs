import { FC } from "react";
import { useAtomValue } from "jotai";
import { useEditorState } from "@tiptap/react";
import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { pageEditorAtom } from "@/features/editor/atoms/editor-atoms";
import classes from "./word-count.module.css";

// Live word and character count in the bottom corner, like Lark Docs.
export const WordCount: FC = () => {
  const { t } = useTranslation();
  const editor = useAtomValue(pageEditorAtom);
  const counts = useEditorState({
    editor,
    selector: (ctx) => {
      const cc = ctx.editor?.storage?.characterCount;
      if (!cc) return null;
      const sel = ctx.editor.state.selection;
      const selected = sel.empty
        ? 0
        : ctx.editor.state.doc.textBetween(sel.from, sel.to, " ").replace(/\s/g, "").length;
      return { words: cc.words() as number, chars: cc.characters() as number, selected };
    },
  });
  if (!counts) return null;
  return (
    <div className={`${classes.badge} print-hide`} data-word-count>
      <Text size="xs" c="dimmed">
        {counts.selected > 0
          ? t("{{n}} characters selected", { n: counts.selected.toLocaleString() })
          : `${t("{{n}} words", { n: counts.words.toLocaleString() })} · ${t("{{n}} characters", { n: counts.chars.toLocaleString() })}`}
      </Text>
    </div>
  );
};
