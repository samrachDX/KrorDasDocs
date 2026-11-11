import { useSyncExternalStore } from "react";
import type { UiSpecCellStyle } from "@docmost/editor-ext";

// The UI Spec cell that has keyboard focus. Its text is a plain textarea, not
// editor text, so the toolbar's font picker applies fonts through this
// instead of the editor selection.
export interface UiSpecFocusTarget {
  get: () => UiSpecCellStyle;
  set: (patch: UiSpecCellStyle) => void;
}

let current: UiSpecFocusTarget | null = null;
let version = 0;
const listeners = new Set<() => void>();

const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

export function setUiSpecFocus(target: UiSpecFocusTarget) {
  current = target;
  emit();
}

export function clearUiSpecFocus(target: UiSpecFocusTarget) {
  if (current !== target) return;
  current = null;
  emit();
}

// Call after the focused cell's style changed so the picker label updates.
export function notifyUiSpecFocus() {
  emit();
}

export function getUiSpecFocus() {
  return current;
}

export function useUiSpecFocus(): UiSpecFocusTarget | null {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return current;
}
