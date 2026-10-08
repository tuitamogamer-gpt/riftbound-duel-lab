import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScreenHighlight } from "../src/components/ScreenHighlight";
import { TableMoment } from "../src/components/TableMoments";
import type { Review } from "../src/components/StepFlow";
import { championMoment } from "../src/game/table-presentation";
import { publicTableEvents } from "../src/game/event-presentation";
import { reviewDelay } from "../src/game/presentation";
import { catalog } from "../src/catalog";
import { getRulesCardId } from "../src/game/scripts";
import { parseSession } from "../src/persistence";
import { combatUnit } from "./fixtures/combat";
import {
  championArrivalReview,
  eventOpening,
  eventReview,
  equippedGearReview,
  spellEventReview,
} from "./fixtures/event-highlights";

function shown(review: Review, predicate: (review: Review) => boolean) {
  const index = review.frames.findIndex((_, index) =>
    predicate({ ...review, index }),
  );
  expect(index).toBeGreaterThanOrEqual(0);
  return { ...review, index };
}
function synthetic(): Review {
  const before = eventOpening();
  return {
    before,
    final: structuredClone(before),
    frames: [{ state: structuredClone(before), label: "Displayed" }],
    index: 0,
    action: { id: "pass", category: "pass", player: 0, label: "Pass" },
  };
}

describe("signature champion arrival", () => {
  it.each([0, 1] as const)(
    "celebrates player %i only on the actual public unit entrance",
    (player) => {
      const review = championArrivalReview(player);
      const arrival = shown(review, (review) => !!championMoment(review));
      expect(arrival.index).toBeGreaterThan(0);
      for (let index = 0; index < arrival.index; index++)
        expect(championMoment({ ...review, index })).toBeUndefined();
      expect(championMoment(arrival)).toMatchObject({
        owner: player,
        cardId: review.before.players[player].championId,
      });
      if (arrival.index + 1 < review.frames.length)
        expect(
          championMoment({ ...review, index: arrival.index + 1 }),
        ).toBeUndefined();
      const html = renderToStaticMarkup(
        createElement(TableMoment, {
          game: review.final,
          review: arrival,
          inspect: () => {},
        }),
      );
      expect(html).toContain(`champion-player-${player}`);
      expect(html).toContain("Annie");
      expect(html).toContain("data-champion-arrival=");
      expect(html).not.toContain("<button");
      expect(reviewDelay(arrival)).toBe(3000);
      expect(reviewDelay(arrival, 2)).toBe(1500);
    },
  );
  it("uses printing rules identity, supports older saved frames and never reads the future", () => {
    const review = synthetic();
    const canonical = getRulesCardId(review.before.players[0].championId);
    const printing = catalog.find(
      (card) => card.id !== canonical && getRulesCardId(card.id) === canonical,
    )!;
    expect(printing).toBeDefined();
    const arrival = {
      ...combatUnit("printing-champion", 0, 3, printing.id),
      location: "base:0" as const,
    };
    review.final.units.push(arrival);
    expect(championMoment(review)).toBeUndefined();
    review.frames.push({
      state: structuredClone(review.final),
      label: "Older save without metadata",
    });
    review.index = 1;
    expect(championMoment(review)?.id).toBe(arrival.id);
    const saved = parseSession(JSON.stringify({ match: review.final, review }));
    expect(saved.review).not.toBeNull();
    expect(championMoment(saved.review)?.id).toBe(arrival.id);
    review.frames.push({
      state: structuredClone(review.final),
      label: "Still present",
    });
    review.index = 2;
    expect(championMoment(review)).toBeUndefined();
  });
  it("does not celebrate a countered spell that would play the champion", () => {
    const review = spellEventReview("counter");
    expect(review.final.players[0].discard).toContain("ogn-198-298");
    expect(
      review.final.units.some(
        (unit) =>
          getRulesCardId(unit.cardId) ===
          getRulesCardId(review.final.players[0].championId),
      ),
    ).toBe(false);
    expect(
      review.frames.every(
        (_, index) => championMoment({ ...review, index }) === undefined,
      ),
    ).toBe(true);
    const counter = shown(review, (review) =>
      publicTableEvents(review).some((event) => event.kind === "counter"),
    );
    expect(publicTableEvents(counter)[0].kind).toBe("counter");
  });
  it("does not use a hidden card face or a copied token as an entrance", () => {
    const review = synthetic();
    review.action = {
      id: "hide:hand:0:field:0",
      category: "play",
      player: 1,
      cardId: review.before.players[1].championId,
      label: "Secret name",
    };
    review.frames[0].state.hidden = [
      {
        id: "private",
        owner: 1,
        cardId: review.action.cardId!,
        location: "field:0",
        hiddenTurn: 1,
      },
    ];
    expect(championMoment(review)).toBeUndefined();
    expect(
      renderToStaticMarkup(
        createElement(TableMoment, {
          game: review.final,
          review,
          inspect: () => {},
        }),
      ),
    ).toBe("");
    review.frames[0].state.units = [
      {
        ...combatUnit("copied-token", 1, 3, review.action.cardId),
        token: true,
      },
    ];
    expect(championMoment(review)).toBeUndefined();
  });
});

describe("public screen events", () => {
  it("keeps a single live announcement for champion, score, draw and phase moments", () => {
    const turn = eventReview(eventOpening(), "end-turn");
    const holding = eventOpening();
    holding.units = [combatUnit("holder", 1)];
    holding.fields[0].controller = 1;
    const score = eventReview(holding, "end-turn");
    const examples = [
      ["champion", championArrivalReview()],
      ["score", score],
      ["draw", turn],
      ["phase", turn],
    ] as const;
    for (const [kind, review] of examples) {
      const active = shown(
        review,
        (candidate) => publicTableEvents(candidate)[0]?.kind === kind,
      );
      const highlight = renderToStaticMarkup(
        createElement(ScreenHighlight, { review: active }),
      );
      expect(highlight).toContain("screen-highlight-edge");
      expect(highlight).toContain('data-highlight-covered="true"');
      expect(highlight).toContain('aria-hidden="true"');
      expect(highlight).not.toContain('role="status"');
      expect(highlight).not.toContain('aria-live="polite"');
      expect(
        renderToStaticMarkup(
          createElement(TableMoment, {
            game: active.frames[active.index].state,
            review: active,
            inspect: () => {},
          }),
        ),
      ).toContain('role="status"');
    }
  });
  it("keeps unrepresented older draws and damage announcements readable", () => {
    const olderDraw = synthetic();
    olderDraw.frames[0].state.players[1].hand.push("ogn-004-298");
    const damage = shown(
      spellEventReview("damage"),
      (review) => publicTableEvents(review)[0]?.kind === "damage",
    );
    for (const review of [olderDraw, damage]) {
      const html = renderToStaticMarkup(
        createElement(ScreenHighlight, { review }),
      );
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).not.toContain('data-highlight-covered="true"');
      expect(html).not.toContain("ogn-004-298");
    }
  });
  it.each(["damage", "buff", "play", "counter"] as const)(
    "highlights the real %s engine transition",
    (mode) => {
      const review = spellEventReview(mode);
      const active = shown(review, (review) =>
        publicTableEvents(review).some((event) => event.kind === mode),
      );
      expect(
        renderToStaticMarkup(
          createElement(ScreenHighlight, { review: active }),
        ),
      ).toContain("screen-highlight-edge");
    },
  );
  it("highlights gear attachment and unit movement/removal", () => {
    const gear = equippedGearReview();
    const equip = shown(gear, (review) =>
      publicTableEvents(review).some((event) => event.kind === "equip"),
    );
    expect(
      publicTableEvents(equip).some((event) => event.label === "Gear equipped"),
    ).toBe(true);
    const review = synthetic();
    review.before.units = [combatUnit("moved", 0), combatUnit("removed", 1)];
    review.frames[0].state.units = [
      { ...review.before.units[0], location: "base:0" },
    ];
    expect(publicTableEvents(review).map((event) => event.kind)).toEqual(
      expect.arrayContaining(["move", "destroy"]),
    );
  });
  it("highlights turn opening, runes, scoring and victory on their own displayed frames", () => {
    const before = eventOpening();
    before.units = [combatUnit("winning-holder", 1)];
    before.fields[0].controller = 1;
    before.players[1].points = 7;
    const review = eventReview(before, "end-turn");
    const kinds = review.frames.flatMap((_, index) =>
      publicTableEvents({ ...review, index }).map((event) => event.kind),
    );
    expect(kinds).toEqual(
      expect.arrayContaining(["phase", "score", "victory"]),
    );
    const scoring = shown(review, (review) =>
      publicTableEvents(review).some((event) => event.kind === "score"),
    );
    expect(
      publicTableEvents(scoring).some((event) => event.kind === "victory"),
    ).toBe(false);
    const resource = synthetic();
    resource.frames[0].state.players[0].runes.push({
      id: "new-rune",
      domain: "Fury",
      ready: true,
    });
    expect(publicTableEvents(resource).map((event) => event.kind)).toContain(
      "rune",
    );
    const combat = synthetic();
    combat.frames[0].state.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      stage: "priority",
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    expect(publicTableEvents(combat).map((event) => event.kind)).toContain(
      "combat",
    );
  });
  it("never reveals opponent hand/Hidden identities, action labels or the final state", () => {
    const review = synthetic();
    review.final.winner = 1;
    review.final.units = [
      combatUnit("future", 1, 9, review.final.players[1].championId),
    ];
    review.action.label = "PRIVATE HAND NAME";
    review.frames[0].label = "PRIVATE HIDDEN NAME";
    review.frames[0].state.players[1].hand = ["ogn-004-298"];
    review.frames[0].draw = { player: 1, count: 1, cardIds: ["ogn-004-298"] };
    review.frames[0].state.hidden = [
      {
        id: "secret",
        owner: 1,
        cardId: "ogn-004-298",
        location: "field:0",
        hiddenTurn: 1,
      },
    ];
    const events = publicTableEvents(review);
    expect(events.map((event) => event.kind)).toEqual(["draw"]);
    const html = renderToStaticMarkup(
      createElement(ScreenHighlight, { review }),
    );
    expect(html).toContain("Card drawn");
    for (const secret of [
      "ogn-004-298",
      "Cleave",
      "PRIVATE",
      "future",
      "Victory",
      "Annie",
    ])
      expect(html).not.toContain(secret);
  });
  it("leaves a pure priority pass and an unchanged cleanup frame quiet", () => {
    const before = spellEventReview("play").final;
    const pass = eventReview(before, "pass");
    expect(
      pass.frames.every(
        (_, index) => publicTableEvents({ ...pass, index }).length === 0,
      ),
    ).toBe(true);
    const review = synthetic();
    review.frames[0].state.priorityPlayer = 1;
    expect(publicTableEvents(review)).toEqual([]);
    expect(publicTableEvents(null)).toEqual([]);
    expect(publicTableEvents({ ...review, index: -1 })).toEqual([]);
    expect(publicTableEvents({ ...review, index: 99 })).toEqual([]);
  });
});
