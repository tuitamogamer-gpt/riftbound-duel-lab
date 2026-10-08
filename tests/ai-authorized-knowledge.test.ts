import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "../src/game/engine";
import {
  getObservation,
  observationRulesView,
  sampleState,
} from "../src/game/ai/observation";
import { physicalCard, physicalOwner } from "../src/game/objects";
import { act, chain, fixture, ogn, sfd, unit } from "./fixtures/cards";
import type { Effect, GameState, PlayerId } from "../src/game/types";

const enemy = (actor: PlayerId) => (1 - actor) as PlayerId;
function position(actor: PlayerId) {
  const s = fixture();
  s.currentPlayer = s.priorityPlayer = s.focusPlayer = actor;
  return s;
}
function resolve(s: GameState, effects: Effect[], cardId = ogn(49)) {
  s.stack = [
    {
      id: "authorized-inspection",
      player: s.priorityPlayer,
      cardId,
      kind: "ability",
      effects,
    },
  ];
  return act(act(s, "pass"), "pass");
}
function castToChoice(actor: PlayerId, cardId: string) {
  let s = position(actor);
  s.players[enemy(actor)].hand = [ogn(49), ogn(9), ogn(52)];
  s.players[actor].hand = [cardId];
  s = act(
    s,
    (a) =>
      a.category === "play" &&
      a.cardId === cardId &&
      (cardId !== "unl-139-219" || a.targetId === "field:0"),
  );
  return act(act(s, "pass"), "pass");
}
function playableIds(s: GameState) {
  return getLegalActions(s, s.priorityPlayer).map((a) => ({
    id: a.id,
    cardId: a.cardId,
    label: a.label,
  }));
}
function hiddenVariant(s: GameState, owner: PlayerId, tailStart = 3) {
  const changed = structuredClone(s);
  changed.seed = 882;
  changed.rng = 977;
  changed.nextId = 90000;
  changed.players[owner].deck = [
    ...changed.players[owner].deck.slice(0, tailStart),
    ...changed.players[owner].deck
      .slice(tailStart)
      .reverse()
      .map(() => ogn(175)),
  ];
  changed.players[enemy(owner)].hand = changed.players[enemy(owner)].hand.map(
    () => ogn(199),
  );
  changed.players[enemy(owner)].deck.reverse();
  changed.players[enemy(owner)].deckId = "annie";
  changed.players[enemy(owner)].deckList = [ogn(199)];
  return changed;
}

describe("bounded authorized inspection knowledge", () => {
  it.each([0, 1] as const)(
    "preserves Nocturne's active looked-at batch for seat %i",
    (actor) => {
      let s = position(actor);
      const seen = [ogn(194), ogn(9), ogn(37)];
      s.players[actor].deck = [...seen, ogn(49), ogn(52)];
      s.players[enemy(actor)].hand = [ogn(49), ogn(52)];
      s = resolve(s, [
        { type: "special", custom: "origins-more:stacked-deck" },
      ]);
      expect(
        s.pendingChoice?.options?.some(
          (a) => a.id === "choose-custom:nocturne:0:play",
        ),
      ).toBe(true);
      const observation = getObservation(s, actor);
      expect(observation.state.players[actor].knownTopCards).toEqual(seen);
      expect(
        observation.state.players[enemy(actor)].knownTopCards,
      ).toBeUndefined();
      expect(
        getObservation(s, enemy(actor)).state.players[actor].knownTopCards,
      ).toBeUndefined();
      expect(observationRulesView(observation).players[actor].deck).toEqual([
        ...seen,
        "unknown",
        "unknown",
      ]);
      expect(getObservation(hiddenVariant(s, actor), actor)).toEqual(
        observation,
      );
      for (let seed = 1; seed <= 12; seed++) {
        const sampled = sampleState(observation, seed);
        expect(sampled.players[actor].deck.slice(0, 3)).toEqual(seen);
        expect(playableIds(sampled)).toEqual(playableIds(s));
        const selected = act(sampled, "choose-custom:nocturne:0:play");
        expect(selected.pendingPlays?.[0].cardId).toBe(ogn(194));
        expect(selected.players[actor].deck.slice(0, 2)).toEqual(seen.slice(1));
        const continued = chain(selected);
        expect(continued.units.some((u) => u.cardId === ogn(194))).toBe(true);
        expect(continued.players[actor].hand).toEqual([ogn(9)]);
      }
    },
  );

  it.each([0, 1] as const)(
    "keeps Hatchling's chosen inspected physical batch in simulation for seat %i",
    (actor) => {
      let s = position(actor);
      s.units = [
        {
          ...unit("hatchling", actor),
          cardId: sfd(18),
          location: `base:${actor}`,
        },
      ];
      s.players[actor].deck = [ogn(49), ogn(37), ogn(52), ogn(9)];
      s = resolve(s, [{ type: "special", custom: "wave14:herald" }]);
      s = act(
        s,
        (a) =>
          a.effects?.some(
            (e) => e.custom === "wave14:herald-selected" && e.amount === 1,
          ) === true,
      );
      expect(s.pendingChoice?.kind).toBe("predict");
      const observation = getObservation(s, actor);
      expect(observation.state.players[actor].knownDeckPositions).toEqual([
        { index: 0, cardId: ogn(49) },
        { index: 1, cardId: ogn(37) },
        { index: 2, cardId: ogn(52) },
      ]);
      expect(observationRulesView(observation).players[actor].deck).toEqual([
        ogn(49),
        ogn(37),
        ogn(52),
        "unknown",
      ]);
      expect(getObservation(hiddenVariant(s, actor), actor)).toEqual(
        observation,
      );
      expect(
        getObservation(s, enemy(actor)).state.players[actor].knownDeckPositions,
      ).toBeUndefined();
      const live = chain(act(s, "choose-predict:recycle"));
      for (let seed = 1; seed <= 12; seed++) {
        const simulated = chain(
          act(sampleState(observation, seed), "choose-predict:recycle"),
        );
        expect(simulated.players[actor].hand).toEqual(live.players[actor].hand);
        expect(simulated.players[actor].hand).toContain(ogn(37));
        expect(
          getObservation(simulated, actor).state.players[actor]
            .knownDeckPositions,
        ).toBeUndefined();
      }
    },
  );

  it.each([0, 1] as const)(
    "preserves non-prefix inspected positions through repeated Hatchling recycling for seat %i",
    (actor) => {
      let s = position(actor);
      s.units = ["hatchling-a", "hatchling-b"].map((id) => ({
        ...unit(id, actor),
        cardId: sfd(18),
        location: `base:${actor}` as const,
      }));
      s.players[actor].deck = [ogn(49), ogn(37), ogn(52), ogn(9)];
      s = resolve(s, [{ type: "special", custom: "wave14:herald" }]);
      s = act(
        s,
        (a) =>
          a.effects?.some(
            (e) => e.custom === "wave14:herald-selected" && e.amount === 1,
          ) === true,
      );
      s = act(s, "choose-predict:recycle");
      expect(s.pendingChoice?.kind).toBe("predict");
      const observation = getObservation(s, actor);
      expect(observation.state.players[actor].knownDeckPositions).toEqual([
        { index: 0, cardId: ogn(37) },
        { index: 1, cardId: ogn(52) },
        { index: 3, cardId: ogn(49) },
      ]);
      expect(observationRulesView(observation).players[actor].deck).toEqual([
        ogn(37),
        ogn(52),
        "unknown",
        ogn(49),
      ]);
      const changed = structuredClone(s);
      changed.players[actor].deck[2] = ogn(175);
      changed.players[enemy(actor)].hand = [ogn(9), ogn(52)];
      s.players[enemy(actor)].hand = [ogn(49), ogn(37)];
      expect(getObservation(changed, actor)).toEqual(getObservation(s, actor));
      expect(
        getObservation(s, enemy(actor)).state.players[actor].knownDeckPositions,
      ).toBeUndefined();
      const live = chain(act(s, "choose-predict:recycle"));
      for (let seed = 1; seed <= 12; seed++) {
        const continued = chain(
          act(
            sampleState(getObservation(s, actor), seed),
            "choose-predict:recycle",
          ),
        );
        expect(continued.players[actor].hand).toEqual(live.players[actor].hand);
      }
    },
  );

  it.each([0, 1] as const)(
    "reserves repeated enemy top cards before sampling an open registered hand and Hidden for seat %i",
    (actor) => {
      const s = position(actor);
      const foe = enemy(actor);
      s.matchConfig!.openDecklists = true;
      const registered = [ogn(83), ogn(88), ogn(88), ogn(219), ogn(58)];
      Object.assign(s.players[foe], {
        deckList: registered,
        deck: [ogn(88), ogn(88), ogn(58)],
        hand: [ogn(219)],
        discard: [],
        banished: [],
        championAvailable: true,
      });
      s.hidden = [
        {
          id: "unobserved-copy",
          owner: foe,
          cardId: ogn(83),
          location: "field:0",
          hiddenTurn: 1,
        },
      ];
      s.pendingChoice = {
        player: actor,
        kind: "custom",
        remaining: 1,
        returnPhase: "main",
        returnPriority: actor,
        options: [
          {
            id: "inspect",
            player: actor,
            category: "ability",
            label: "Inspect two",
            effects: [
              {
                type: "special",
                custom: "card-play:select",
                play: { zone: "top", zoneOwner: foe, count: 2 },
              },
            ],
          },
        ],
      };
      const observation = getObservation(s, actor);
      expect(observation.state.players[foe].knownTopCards).toEqual([
        ogn(88),
        ogn(88),
      ]);
      for (let seed = 1; seed <= 40; seed++) {
        const sampled = sampleState(observation, seed, 1);
        expect(sampled.players[foe].deck.slice(0, 2)).toEqual([
          ogn(88),
          ogn(88),
        ]);
        expect(
          [
            ...sampled.players[foe].hand,
            ...sampled.players[foe].deck,
            sampled.hidden![0].cardId,
          ].sort(),
        ).toEqual([...registered].sort());
        expect(sampled.players[foe].hand).toHaveLength(1);
        expect(sampled.players[foe].deck).toHaveLength(3);
      }
      const changed = structuredClone(s);
      changed.players[foe].hand = [ogn(9)];
      changed.players[foe].deck[2] = ogn(175);
      changed.hidden![0].cardId = ogn(9);
      changed.hidden![0].id = "different-physical-id";
      expect(getObservation(changed, actor)).toEqual(observation);
      expect(sampleState(getObservation(changed, actor), 8)).toEqual(
        sampleState(observation, 8),
      );
    },
  );

  it.each([0, 1] as const)(
    "uses Ashe's actually revealed hand for the current banish choice only, seat %i",
    (actor) => {
      const s = castToChoice(actor, "unl-169-219");
      const foe = enemy(actor);
      const observation = getObservation(s, actor);
      expect(observation.state.players[foe].hand).toEqual([]);
      expect(observation.state.players[foe].knownHand).toEqual(
        s.players[foe].hand,
      );
      expect(observationRulesView(observation).players[foe].hand).toEqual(
        s.players[foe].hand,
      );
      const action = getLegalActions(s, actor).find(
        (a) => a.cardId === ogn(52),
      )!;
      const actual = applyAction(s, action);
      for (let seed = 1; seed <= 12; seed++) {
        const sampled = sampleState(observation, seed, 1);
        expect(sampled.players[foe].hand).toEqual(s.players[foe].hand);
        const next = applyAction(sampled, action);
        expect(next.heldBanishments?.map((entry) => entry.cardId)).toEqual(
          actual.heldBanishments?.map((entry) => entry.cardId),
        );
        expect(next.players[foe].hand).toEqual(actual.players[foe].hand);
        expect(
          getObservation(next, actor).state.players[foe].knownHand,
        ).toBeUndefined();
        const futureHand = structuredClone(next);
        futureHand.players[foe].hand = futureHand.players[foe].hand.map(() =>
          ogn(175),
        );
        expect(getObservation(futureHand, actor)).toEqual(
          getObservation(next, actor),
        );
      }
      const changed = structuredClone(s);
      changed.players[foe].deck.reverse();
      changed.players[actor].deck.reverse();
      expect(getObservation(changed, actor)).toEqual(observation);
    },
  );

  it.each([0, 1] as const)(
    "uses Bone Skewer's revealed hand without authorizing subsequent draws, seat %i",
    (actor) => {
      const s = castToChoice(actor, "unl-139-219");
      const foe = enemy(actor);
      const observation = getObservation(s, actor);
      expect(observation.state.players[foe].knownHand).toEqual(
        s.players[foe].hand,
      );
      expect(
        getObservation(s, foe).state.players[actor].knownHand,
      ).toBeUndefined();
      const action = getLegalActions(s, actor).find(
        (a) => a.cardId === ogn(52),
      )!;
      const actual = applyAction(s, action);
      for (let seed = 1; seed <= 12; seed++) {
        const next = applyAction(sampleState(observation, seed, 1), action);
        expect(next.pendingPlays?.map((entry) => entry.cardId)).toEqual(
          actual.pendingPlays?.map((entry) => entry.cardId),
        );
        expect(next.players[foe].hand).toEqual(actual.players[foe].hand);
        expect(
          getObservation(next, actor).state.players[foe].knownHand,
        ).toBeUndefined();
      }
      const changed = structuredClone(s);
      changed.players[foe].deck.reverse();
      expect(getObservation(changed, actor)).toEqual(observation);
    },
  );

  it("ignores malformed active inspection payloads instead of authorizing future cards or throwing", () => {
    const s = position(0);
    s.pendingChoice = {
      player: 0,
      kind: "custom",
      remaining: 1,
      returnPhase: "main",
      returnPriority: 0,
      options: [
        {
          id: "malformed",
          player: 0,
          category: "ability",
          label: "Invalid input",
          effects: [
            {
              type: "special",
              custom: "unl-extra:predict-two-apply",
              cardName: "{broken",
            },
          ],
        },
      ],
    };
    expect(() => getObservation(s, 0)).not.toThrow();
    expect(getObservation(s, 0).state.players[0].knownTopCards).toBeUndefined();
  });

  it("does not activate opponent-hand knowledge for arbitrary own-hand play selections or another seat", () => {
    const s = position(0);
    s.players[1].hand = [ogn(9)];
    s.pendingChoice = {
      player: 0,
      kind: "custom",
      remaining: 1,
      returnPhase: "main",
      returnPriority: 0,
      options: [
        {
          id: "hand",
          player: 0,
          category: "ability",
          label: "Choose from own hand",
          effects: [
            {
              type: "special",
              custom: "card-play:select",
              play: { zone: "hand", zoneOwner: 0 },
            },
          ],
        },
      ],
    };
    expect(getObservation(s, 0).state.players[1].knownHand).toBeUndefined();
    s.pendingChoice.options![0].effects![0].play!.zoneOwner = 1;
    expect(getObservation(s, 0).state.players[1].knownHand).toBeUndefined();
  });

  it("does not trust observer-owned knowledge fields in an imported state or expired legality shell", () => {
    const s = position(0);
    const before = getObservation(s, 0);
    for (const p of s.players) {
      Object.assign(p, {
        knownTop: ogn(175),
        knownTopCards: [ogn(175), ogn(199)],
        knownDeckPositions: [{ index: 5, cardId: ogn(199) }],
        knownHand: [ogn(175)],
      });
    }
    expect(getObservation(s, 0)).toEqual(before);
    const ashe = castToChoice(0, "unl-169-219");
    const shell = observationRulesView(getObservation(ashe, 0));
    const action = getLegalActions(ashe, 0).find((a) => a.cardId === ogn(52))!;
    const next = applyAction(shell, action);
    expect(next.pendingChoice).toBeNull();
    const expired = getObservation(next, 0);
    expect(expired.state.players[1].knownHand).toBeUndefined();
    const unknown = structuredClone(next);
    unknown.players[1].hand = unknown.players[1].hand.map(() => ogn(175));
    expect(getObservation(unknown, 0)).toEqual(expired);
  });
});

describe("registered physical card conservation", () => {
  it.each([0, 1] as const)(
    "subtracts stolen and copied board identities from their physical registered owner once, seat %i",
    (viewer) => {
      const s = position(viewer);
      s.matchConfig!.openDecklists = true;
      for (const p of s.players) {
        p.deckList = [ogn(49), ogn(52), ogn(88), ogn(219)];
        p.hand = [ogn(219)];
        p.deck = [ogn(88)];
        p.discard = [];
        p.banished = [];
        p.championAvailable = true;
      }
      s.units = [
        {
          ...unit("stolen-copy-0", 1),
          originalOwner: 0,
          originalCardId: ogn(49),
          cardId: ogn(9),
        },
        {
          ...unit("stolen-copy-1", 0),
          originalOwner: 1,
          originalCardId: ogn(49),
          cardId: ogn(9),
        },
        { ...unit("hybrid-0", 0), cardId: ogn(52) },
        { ...unit("hybrid-1", 1), cardId: ogn(52) },
        { ...unit("public-token", 0), cardId: ogn(88), token: true },
      ];
      s.gears = [{ ...s.units[2] }, { ...s.units[3] }];
      const observation = getObservation(s, viewer);
      for (let seed = 1; seed <= 30; seed++) {
        const sampled = sampleState(observation, seed, 1);
        for (const p of sampled.players) {
          const board = [
            ...new Map(
              [...sampled.units, ...sampled.gears].map((object) => [
                object.id,
                object,
              ]),
            ).values(),
          ]
            .filter((object) => physicalOwner(object) === p.id && !object.token)
            .map(physicalCard);
          expect([...p.hand, ...p.deck, ...board].sort()).toEqual(
            [...p.deckList!].sort(),
          );
        }
      }
      const changed = structuredClone(s);
      changed.players[enemy(viewer)].hand = [ogn(9)];
      changed.players[enemy(viewer)].deck = [ogn(199)];
      expect(getObservation(changed, viewer)).toEqual(observation);
    },
  );
});
