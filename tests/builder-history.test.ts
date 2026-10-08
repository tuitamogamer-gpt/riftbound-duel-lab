import { describe, expect, it } from "vitest";
import { starterDecks } from "../src/data/decks";
import {
  cloneDeckForBuilder,
  changeBuilderQuantity,
} from "../src/game/deck-builder";
import {
  MAX_BUILDER_UNDO,
  builderHistoryReducer,
  createBuilderHistory,
} from "../src/game/builder-history";

const initial = () => ({
  draft: cloneDeckForBuilder(starterDecks[0]),
  previousId: "saved-old",
  sourceId: "annie",
});

describe("builder editing history", () => {
  it("undoes quantity changes exactly and clears redo when a new edit branches", () => {
    let history = createBuilderHistory(initial());
    const original = history.present.draft;
    const cardId = original.main[0].cardId;
    history = builderHistoryReducer(history, {
      type: "edit",
      next: {
        ...history.present,
        draft: changeBuilderQuantity(original, cardId, "main", -1),
      },
    });
    const changed = history.present;
    history = builderHistoryReducer(history, { type: "undo" });
    expect(history.present.draft).toEqual(original);
    history = builderHistoryReducer(history, { type: "redo" });
    expect(history.present).toEqual(changed);
    history = builderHistoryReducer(history, { type: "undo" });
    history = builderHistoryReducer(history, {
      type: "edit",
      next: {
        ...history.present,
        draft: { ...original, name: "Another branch" },
      },
    });
    expect(history.future).toEqual([]);
    expect(builderHistoryReducer(history, { type: "redo" })).toBe(history);
    expect(original.name).not.toBe("Another branch");
  });

  it("keeps the latest saved identity across undo and redo", () => {
    let history = createBuilderHistory(initial());
    history = builderHistoryReducer(history, {
      type: "edit",
      next: {
        ...history.present,
        previousId: undefined,
        draft: { ...history.present.draft, name: "New deck" },
      },
    });
    history = builderHistoryReducer(history, {
      type: "saved",
      id: "saved-new",
    });
    history = builderHistoryReducer(history, { type: "undo" });
    expect(history.present.previousId).toBe("saved-new");
    history = builderHistoryReducer(history, { type: "redo" });
    expect(history.present.previousId).toBe("saved-new");
  });

  it("bounds retained revisions and makes a no-op edit leave history unchanged", () => {
    let history = createBuilderHistory(initial());
    expect(
      builderHistoryReducer(history, { type: "edit", next: history.present }),
    ).toBe(history);
    for (let index = 0; index < MAX_BUILDER_UNDO + 20; index++)
      history = builderHistoryReducer(history, {
        type: "edit",
        next: {
          ...history.present,
          draft: { ...history.present.draft, name: `Revision ${index}` },
        },
      });
    expect(history.past).toHaveLength(MAX_BUILDER_UNDO);
    history = builderHistoryReducer(history, {
      type: "reset",
      next: initial(),
    });
    expect(history.past).toEqual([]);
    expect(history.future).toEqual([]);
  });
});
