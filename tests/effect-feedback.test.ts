import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  applyAction,
  applyActionStepped,
  getLegalActions,
} from "../src/game/engine";
import { getEffectView } from "../src/game/effect-presentation";
import { getHighlights, type Review } from "../src/components/StepFlow";
import {
  EffectAnnouncement,
  FieldEffect,
} from "../src/components/EffectFeedback";
import { parseSession } from "../src/persistence";
import { createCombatFixture, combatUnit } from "./fixtures/combat";
import { translate } from "../src/i18n";

function resolution(kind: "damage" | "might" | "draw" = "damage"): Review {
  const before = createCombatFixture();
  before.phase = "showdown";
  before.combat!.stage = "priority";
  before.priorityPlayer = 1;
  before.consecutivePasses = 1;
  before.units = [
    combatUnit("ally", 0, 4),
    { ...combatUnit("target", 1, 8), preventDamage: 2 },
  ];
  before.fields[1].cardId = "ogn-280-298";
  before.stack = [
    {
      id: "test-effect",
      cardId:
        kind === "draw"
          ? "ogn-280-298"
          : kind === "might"
            ? "ogn-058-298"
            : "ogn-009-298",
      sourceId: kind === "draw" ? "field:1" : undefined,
      player: 0,
      targetId:
        kind === "draw" ? undefined : kind === "might" ? "ally" : "target",
      locationId: kind === "draw" ? "field:1" : "field:0",
      kind: kind === "draw" ? "trigger" : "spell",
      effects: [
        {
          type: kind,
          amount: 3,
          ...(kind === "draw" ? {} : { target: "anyUnit" as const }),
        },
      ],
    },
  ];
  const action = getLegalActions(before, 1).find((a) => a.id === "pass")!;
  const result = applyActionStepped(before, action);
  expect(result.state).toEqual(applyAction(before, action));
  return {
    before,
    final: result.state,
    frames: result.frames,
    index: result.frames.findIndex((f) => f.effect?.stage === "applied"),
    action,
  };
}
describe("visible card and battlefield causes and outcomes", () => {
  it("attributes a resolved spell to its source even when the visible action is an opponent pass", () => {
    const review = resolution();
    const view = getEffectView(review)!;
    expect(review.action.player).toBe(1);
    expect(view.player).toBe(0);
    expect(view.source?.name).toBe("Hextech Ray");
    expect(view.targets).toContain("target");
    const damage = view.changes.find((c) => c.tone === "damage")!;
    expect(damage.values?.amount).toBe(1); // Three damage minus two prevention.
    expect(getHighlights(review).unitEvents.get("target")).toBe("−1 health");
    const html = renderToStaticMarkup(
      createElement(EffectAnnouncement, { review }),
    );
    expect(html).toContain("Hextech Ray");
    expect(html).toContain("−1 health");
  });
  it("labels the exact battlefield for its draw effect, with an explicit hand delta", () => {
    const review = resolution("draw"),
      view = getEffectView(review)!;
    expect(view.fieldId).toBe("field:1");
    expect(view.changes).toContainEqual(
      expect.objectContaining({
        key: "Hand +{amount}",
        values: { amount: 3 },
        player: 0,
      }),
    );
    expect(
      renderToStaticMarkup(
        createElement(FieldEffect, { review, fieldId: "field:1" }),
      ),
    ).toContain("Hand +3");
    expect(
      renderToStaticMarkup(
        createElement(FieldEffect, { review, fieldId: "field:0" }),
      ),
    ).toBe("");
  });
  it("reports the actual Might change and keeps the names of affected cards", () => {
    const review = resolution("might"),
      view = getEffectView(review)!;
    expect(view.changes).toContainEqual(
      expect.objectContaining({
        key: "{card} · +{amount} Might",
        unitId: "ally",
        values: { card: "Shipyard Skulker", amount: 3 },
      }),
    );
    expect(translate(getHighlights(review).unitEvents.get("ally"), "sr")).toBe(
      "+3 snage",
    );
  });
  it("preserves source metadata during save recovery and rejects malformed source metadata", () => {
    const review = resolution("draw");
    const recovered = parseSession(
      JSON.stringify({ match: review.final, review }),
    );
    expect(recovered.review?.frames[review.index].effect?.sourceId).toBe(
      "field:1",
    );
    review.frames[review.index].effect!.cardId = "unknown-card";
    expect(
      parseSession(JSON.stringify({ match: review.final, review })).review,
    ).toBeNull();
  });
  it("does not reveal opponent hidden cards or future outcomes", () => {
    const review = resolution("draw");
    review.index = 0;
    expect(getEffectView(review)?.changes).toEqual([]);
    review.final.players[0].points = 8;
    expect(getEffectView(review)?.changes).toEqual([]);
    review.action = {
      id: "hide:0:field:0",
      label: "Hidden card",
      player: 1,
      category: "play",
      cardId: "ogn-009-298",
    };
    review.frames[0].effect = undefined;
    expect(getEffectView(review)).toBeNull();
  });
});
