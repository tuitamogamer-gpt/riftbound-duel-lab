import type { StarterDeck } from "../data/decks";

export const MAX_BUILDER_UNDO = 40;
export interface BuilderEditor {
  draft: StarterDeck;
  previousId?: string;
  sourceId: string;
}
export interface BuilderHistory {
  present: BuilderEditor;
  past: BuilderEditor[];
  future: BuilderEditor[];
}
export type BuilderHistoryAction =
  | { type: "edit"; next: BuilderEditor }
  | { type: "reset"; next: BuilderEditor }
  | { type: "source"; id: string }
  | { type: "saved"; id?: string }
  | { type: "undo" }
  | { type: "redo" };

export function createBuilderHistory(present: BuilderEditor): BuilderHistory {
  return { present, past: [], future: [] };
}

/** Editing controls use immutable decks, so snapshots retain quantities exactly. */
export function builderHistoryReducer(
  history: BuilderHistory,
  action: BuilderHistoryAction,
): BuilderHistory {
  switch (action.type) {
    case "reset":
      return createBuilderHistory(action.next);
    case "source":
      return {
        ...history,
        present: { ...history.present, sourceId: action.id },
      };
    case "saved": {
      // Undo after saving must update the current saved list, not resurrect its old ID.
      const saved = (entry: BuilderEditor) => ({
        ...entry,
        previousId: action.id,
      });
      return {
        present: saved(history.present),
        past: history.past.map(saved),
        future: history.future.map(saved),
      };
    }
    case "edit":
      if (JSON.stringify(history.present) === JSON.stringify(action.next))
        return history;
      return {
        present: action.next,
        past: [...history.past, history.present].slice(-MAX_BUILDER_UNDO),
        future: [],
      };
    case "undo": {
      const previous = history.past.at(-1);
      return previous
        ? {
            present: previous,
            past: history.past.slice(0, -1),
            future: [history.present, ...history.future].slice(
              0,
              MAX_BUILDER_UNDO,
            ),
          }
        : history;
    }
    case "redo": {
      const next = history.future[0];
      return next
        ? {
            present: next,
            past: [...history.past, history.present].slice(-MAX_BUILDER_UNDO),
            future: history.future.slice(1),
          }
        : history;
    }
  }
}
