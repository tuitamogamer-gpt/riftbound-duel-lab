import { describe, expect, it } from "vitest";
import { cards, getCard } from "../src/data/cards";
import { starterDecks, type StarterDeck } from "../src/data/decks";
import {
  applyDecision,
  getDecisionRequest,
  validateDecision,
} from "../src/game/ai/decisions";
import { decideBot } from "../src/game/bot";
import { radianceWave1Scripts } from "../src/game/radiance-wave1";
import {
  applyAction,
  createGame,
  deserializeGame,
  getKeywords,
  getLegalActions,
  getMight,
  serializeGame,
} from "../src/game/engine";
import { radianceDeployScripts } from "../src/game/radiance-deploy";
import { cardRegistry, isImplemented } from "../src/game/scripts";
import { validState } from "../src/persistence";
import type { GameState, Gear, LocationId, PlayerId } from "../src/game/types";
import { act, chain, fixture, unit } from "./fixtures/cards";

const rad = (n: number) => `rad-${String(n).padStart(3, "0")}-167`;
const byId = (s: GameState, id: string) => s.units.find((u) => u.id === id)!;
const deployGear = (
  s: GameState,
  cardId: string,
  at: LocationId,
  owner: PlayerId = 0,
  id = `g-${cardId}-${s.gears.length}`,
): Gear => {
  const gear: Gear = {
    id,
    cardId,
    owner,
    ready: true,
    deployedAt: at,
    ...(cardId.startsWith("token-") ? { token: true } : {}),
  };
  s.gears.push(gear);
  return gear;
};
const bombs = (s: GameState, owner?: PlayerId) =>
  s.gears.filter(
    (g) =>
      g.cardId === "token-bomb" && (owner === undefined || g.owner === owner),
  );
/** Pass through showdowns, combat and choices, taking the first option. */
function settle(s: GameState) {
  for (
    let i = 0;
    i < 150 &&
    (s.combat ||
      s.stack.length ||
      s.pendingChoice ||
      s.pendingTriggers?.length);
    i++
  ) {
    const actions = getLegalActions(s, s.priorityPlayer);
    s = applyAction(
      s,
      s.pendingChoice
        ? actions[0]
        : (actions.find((a) => a.id === "pass") ?? actions[0]),
    );
  }
  expect(s.combat).toBeNull();
  return s;
}
const playAt = (s: GameState, cardId: string, at: LocationId) =>
  act(
    s,
    (a) => a.category === "play" && a.cardId === cardId && a.locationId === at,
  );
const choose = (s: GameState, text: string) =>
  act(s, (a) => a.label.includes(text));
/** Pass priority (taking first options) until a matching action appears. */
function until(s: GameState, text: string) {
  for (let i = 0; i < 40; i++) {
    const actions = getLegalActions(s, s.priorityPlayer);
    if (actions.some((a) => a.label.includes(text))) return choose(s, text);
    s = applyAction(
      s,
      s.pendingChoice
        ? actions[0]
        : (actions.find((a) => a.id === "pass") ?? actions[0]),
    );
  }
  throw new Error(`No action containing: ${text}`);
}
/** End this turn and the opponent's, holding controlled battlefields. */
function nextOwnTurn(s: GameState) {
  return settle(act(settle(act(s, "end-turn")), "end-turn"));
}

describe("Deploy rules (Core Rules 830)", () => {
  it("plays Deploy gear only to battlefields, including enemy and open ones", () => {
    const s = fixture();
    s.units = [unit("enemy", 1, "field:1", 4)];
    s.fields[1].controller = 1;
    s.players[0].hand = [rad(2)];
    const plays = getLegalActions(s, 0).filter((a) => a.cardId === rad(2));
    expect(plays.map((a) => a.locationId).sort()).toEqual([
      "field:0",
      "field:1",
    ]);
    const next = chain(playAt(s, rad(2), "field:1"));
    expect(next.gears).toEqual([
      expect.objectContaining({ cardId: rad(2), deployedAt: "field:1" }),
    ]);
    // Gear is not a unit: deploying neither contests nor controls the battlefield.
    expect(next.fields[1].controller).toBe(1);
    expect(next.combat).toBeNull();
  });

  it("kills Deploy gear when an opponent holds its battlefield", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "field:0", 4)];
    s.fields[0].controller = 1;
    deployGear(s, rad(2), "field:0", 0, "banner");
    deployGear(s, rad(2), "field:1", 0, "safe");
    s = settle(act(s, "end-turn"));
    expect(s.gears.map((g) => g.id)).toEqual(["safe"]);
    expect(s.players[0].discard).toContain(rad(2));
  });

  it("keeps Deploy gear when its owner holds or an opponent only conquers there", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "field:0", 4)];
    s.fields[0].controller = 0;
    deployGear(s, rad(2), "field:0", 0, "mine");
    deployGear(s, rad(2), "field:1", 1, "theirs");
    s = nextOwnTurn(s);
    expect(s.gears.map((g) => g.id).sort()).toEqual(["mine", "theirs"]);
    // Conquering an open battlefield does not trigger "When an opponent holds".
    s.units.push(unit("raider", 0, "base:0", 3));
    s = settle(act(act(s, "move-start:raider:field:1"), "move-confirm"));
    expect(s.fields[1].controller).toBe(0);
    expect(s.gears.map((g) => g.id).sort()).toEqual(["mine", "theirs"]);
  });

  it("saves and validates the deployed location", () => {
    const s = fixture();
    deployGear(s, rad(2), "field:1");
    const restored = deserializeGame(serializeGame(s));
    expect(restored.gears[0].deployedAt).toBe("field:1");
    expect(validState(restored)).toBe(true);
    const broken = structuredClone(restored);
    (broken.gears[0] as { deployedAt: string }).deployedAt = "field:7";
    expect(validState(broken)).toBe(false);
  });
});

describe("Bomb gear tokens (Core Rules 187.12)", () => {
  it("are created only to battlefields and carry Deploy", () => {
    let s = fixture();
    s.players[0].hand = [rad(1)];
    s = act(s, (a) => a.cardId === rad(1));
    s = act(act(s, "pass"), "pass");
    expect(s.pendingChoice?.kind).toBe("token");
    const places = getLegalActions(s, 0).map((a) => a.locationId);
    expect(places.sort()).toEqual(["field:0", "field:1"]);
    s = chain(act(s, "choose-token:field:1"));
    expect(bombs(s, 0)).toEqual([
      expect.objectContaining({ deployedAt: "field:1", token: true }),
    ]);
  });

  it("deals 2 to an enemy there and detonates your other Bombs there", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "field:0", 6), unit("ally", 0, "field:0", 6)];
    s.fields[0].controller = 0;
    deployGear(s, "token-bomb", "field:0", 0, "b1");
    deployGear(s, "token-bomb", "field:0", 0, "b2");
    deployGear(s, "token-bomb", "field:1", 0, "elsewhere");
    s.players[0].hand = [rad(13)];
    // Lost to the Sands: kill a gear.
    s = act(s, (a) => a.cardId === rad(13) && a.targetId === "b1");
    s = settle(s);
    expect(bombs(s).map((g) => g.id)).toEqual(["elsewhere"]);
    // Both Bombs at field:0 died; each Deathknell dealt 2 to the enemy only.
    expect(byId(s, "enemy").damage).toBe(4);
    expect(byId(s, "ally").damage).toBe(0);
    // Tokens never go to the trash.
    expect(s.players[0].discard).not.toContain("token-bomb");
  });

  it("does nothing when no enemy unit is there", () => {
    let s = fixture();
    deployGear(s, "token-bomb", "field:0", 0, "b1");
    s.players[0].hand = [rad(13)];
    s = settle(act(s, (a) => a.cardId === rad(13) && a.targetId === "b1"));
    expect(s.gears).toEqual([]);
  });
});

describe("Deploy gear", () => {
  it("Banner of Conquest gives friendly attackers here Assault", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "base:0", 3), unit("enemy", 1, "field:0", 4)];
    s.fields[0].controller = 1;
    deployGear(s, rad(2), "field:0");
    s = act(act(s, "move-start:ally:field:0"), "move-confirm");
    expect(getMight(s, byId(s, "ally"))).toBe(4);
    expect(getKeywords(s, byId(s, "ally"))).toContain("Assault");
    // Enemy units do not benefit.
    expect(getMight(s, byId(s, "enemy"))).toBe(4);
  });

  it("Hunting Blind gives friendly defenders Shield 2 and may pull in an enemy", () => {
    let s = fixture();
    s.units = [unit("guard", 0, "field:0", 3), unit("enemy", 1, "base:1", 2)];
    s.fields[0].controller = 0;
    s.players[0].hand = [rad(44)];
    s = playAt(s, rad(44), "field:0");
    s = act(act(s, "pass"), "pass");
    expect(s.pendingChoice?.kind).toBe("custom");
    s = choose(s, "Move Playful Phantom to this battlefield");
    expect(byId(s, "enemy").location).toBe("field:0");
    // The moved enemy contests the battlefield; the deploying player defends.
    s = act(s, (a) => a.id === "pass" || a.category === "pass");
    expect(s.combat?.defender).toBe(0);
    expect(getMight(s, byId(s, "guard"))).toBe(5);
    expect(getKeywords(s, byId(s, "guard"))).toContain("Shield 2");
    s = settle(s);
    expect(s.units.map((u) => u.id)).toEqual(["guard"]);
  });

  it("Pillaged Armory buffs on play and again when you conquer here", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "base:0", 3)];
    s.players[0].hand = [rad(73)];
    s = chain(playAt(s, rad(73), "field:0"));
    expect(byId(s, "ally").buff).toBe(1);
    s.units.push(unit("second", 0, "base:0", 2));
    s = act(act(s, "move-start:second:field:0"), "move-confirm");
    for (let i = 0; i < 10 && s.pendingChoice?.kind !== "trigger"; i++)
      s = act(s, "pass");
    s = act(s, (a) => a.targetId === "second");
    s = settle(s);
    expect(s.players[0].points).toBe(1);
    expect(byId(s, "second").buff).toBe(1);
  });

  it("Portable Portal can pay Body Power to ready a unit here and grants Ganking", () => {
    let s = fixture();
    s.units = [{ ...unit("ally", 0, "field:0", 3), ready: false }];
    s.fields[0].controller = 0;
    s.players[0].power = 0;
    s.players[0].runes = [{ id: "body", domain: "Body", ready: true }];
    s.players[0].hand = [rad(87)];
    s = playAt(s, rad(87), "field:0");
    s = act(act(s, "pass"), "pass");
    s = chain(choose(s, "Pay Body Power: ready"));
    expect(byId(s, "ally").ready).toBe(true);
    expect(s.players[0].runes).toHaveLength(0);
    expect(getKeywords(s, byId(s, "ally"))).toContain("Ganking");
    expect(
      getLegalActions(s, 0).some((a) => a.id === "move-start:ally:field:1"),
    ).toBe(true);
  });

  it("The Good Stuff discards 1, draws 3 and returns to hand when you hold here", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "field:0", 3)];
    s.fields[0].controller = 0;
    s.players[0].hand = [rad(106), "ogn-001-298"];
    s = playAt(s, rad(106), "field:0");
    s = act(act(s, "pass"), "pass");
    expect(s.pendingChoice?.kind).toBe("discard");
    s = chain(s);
    expect(s.players[0].hand).toHaveLength(3);
    expect(s.players[0].discard).toEqual(["ogn-001-298"]);
    s = nextOwnTurn(s);
    expect(s.gears).toEqual([]);
    expect(s.players[0].hand).toContain(rad(106));
  });

  it("Concert Poster may pay 1 for a Recruit on play and when you conquer here", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "base:0", 3)];
    s.players[0].hand = [rad(116)];
    const energy = s.players[0].energy;
    s = playAt(s, rad(116), "field:0");
    s = act(act(s, "pass"), "pass");
    s = chain(choose(s, "Pay 1 Energy: Recruit"));
    const recruits = () =>
      s.units.filter((u) => getCard(u.cardId).name.startsWith("Recruit"));
    expect(recruits()).toHaveLength(1);
    expect(recruits()[0].location).toBe("base:0");
    expect(s.players[0].energy).toBe(energy - 1 - 1);
    s = act(act(s, "move-start:ally:field:0"), "move-confirm");
    s = settle(s);
    expect(recruits()).toHaveLength(2);
  });

  it("Resource Extractor makes exhausted Gold only while you control its battlefield", () => {
    let s = fixture();
    s.fields[0].controller = 0;
    s.units = [unit("ally", 0, "field:0", 3)];
    deployGear(s, rad(52), "field:0", 0, "held");
    deployGear(s, rad(52), "field:1", 0, "open");
    s = settle(act(s, "end-turn"));
    const gold = s.gears.filter(
      (g) => g.owner === 0 && getCard(g.cardId).name.startsWith("Gold"),
    );
    expect(gold).toHaveLength(1);
    expect(gold[0].ready).toBe(false);
  });

  it("Demacian Standard gives one friendly attacker here +2 and may return on hold", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "base:0", 3), unit("enemy", 1, "field:0", 4)];
    s.fields[0].controller = 1;
    deployGear(s, rad(156), "field:0", 0, "standard");
    s = act(act(s, "move-start:ally:field:0"), "move-confirm");
    s = settle(s);
    expect(byId(s, "ally").temporaryMight).toBe(2);
    expect(s.fields[0].controller).toBe(0);
    s = settle(act(s, "end-turn"));
    s = act(s, "end-turn");
    // Our hold offers the optional return.
    s = settle(until(s, "Return Demacian Standard to hand"));
    expect(s.players[0].hand).toContain(rad(156));
  });

  it("Overloaded Traveler has +1 Might beside a friendly Deploy gear", () => {
    const s = fixture();
    s.units = [{ ...unit("traveler", 0, "field:0", 2), cardId: rad(72) }];
    delete s.units[0].baseMightOverride;
    expect(getMight(s, s.units[0])).toBe(2);
    deployGear(s, rad(2), "field:0", 1);
    expect(getMight(s, s.units[0])).toBe(2);
    deployGear(s, rad(2), "field:0", 0);
    expect(getMight(s, s.units[0])).toBe(3);
  });

  it("Bushwhack Trap lets its controller hide an additional card here", () => {
    const s = fixture();
    // The fixture's default battlefield already allows two hidden cards.
    s.fields[0].cardId = "ogn-275-298";
    s.fields[0].controller = 0;
    s.units = [unit("ally", 0, "field:0", 3)];
    const hiddenCard = cards.find(
      (card) =>
        !card.referenceOnly &&
        card.text.startsWith("[Hidden]") &&
        isImplemented(card.id),
    )!.id;
    s.hidden = [
      {
        id: "h1",
        cardId: hiddenCard,
        owner: 0,
        location: "field:0",
        hiddenTurn: s.turn,
      },
    ];
    s.players[0].hand = [hiddenCard];
    const hides = () =>
      getLegalActions(s, 0).filter(
        (a) => a.id.startsWith("hide:") && a.locationId === "field:0",
      );
    expect(hides()).toHaveLength(0);
    // An opponent's trap does not help the controller.
    deployGear(s, rad(108), "field:0", 1);
    expect(hides()).toHaveLength(0);
    deployGear(s, rad(108), "field:0", 0);
    expect(hides().length).toBeGreaterThan(0);
  });
});

describe("Bomb makers", () => {
  it("Explosimian plays three Bombs to a single battlefield when it holds", () => {
    let s = fixture();
    s.units = [{ ...unit("monkey", 0, "field:0", 6), cardId: rad(94) }];
    s.fields[0].controller = 0;
    s = settle(act(s, "end-turn"));
    s = act(s, "end-turn");
    for (let i = 0; i < 10 && s.pendingChoice?.kind !== "token"; i++)
      s = act(s, (a) => a.id === "pass" || Boolean(s.pendingChoice));
    expect(s.pendingChoice?.kind).toBe("token");
    s = settle(act(s, "choose-token:field:1"));
    expect(bombs(s, 0).map((g) => g.deployedAt)).toEqual([
      "field:1",
      "field:1",
      "field:1",
    ]);
  });

  it("Satchel Charge moves a friendly unit and then plays a Bomb", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "base:0", 3)];
    s.players[0].hand = [rad(96)];
    s = act(s, (a) => a.cardId === rad(96) && a.targetId === "ally");
    s = act(act(s, "pass"), "pass");
    s = act(s, "choose-destination:field:1");
    s = settle(act(s, "choose-token:field:0"));
    expect(byId(s, "ally").location).toBe("field:1");
    expect(bombs(s, 0).map((g) => g.deployedAt)).toEqual(["field:0"]);
  });

  it("Ziggs, Explosive makes Bombs and can kill a friendly gear when defending", () => {
    let s = fixture();
    s.units = [
      { ...unit("ziggs", 0, "field:0", 4), cardId: rad(112) },
      unit("enemy", 1, "base:1", 5),
    ];
    s.fields[0].controller = 0;
    s = act(s, (a) => a.sourceId === "ziggs" && a.category === "ability");
    s = act(act(s, "pass"), "pass");
    s = settle(act(s, "choose-token:field:1"));
    expect(byId(s, "ziggs").ready).toBe(false);
    expect(bombs(s, 0)).toHaveLength(1);
    // Opponent attacks Ziggs.
    s = settle(act(s, "end-turn"));
    s = act(act(s, "move-start:enemy:field:0"), "move-confirm");
    for (let i = 0; i < 10 && s.pendingChoice?.kind !== "custom"; i++) {
      const actions = getLegalActions(s, s.priorityPlayer);
      s = applyAction(s, actions.find((a) => a.id === "pass") ?? actions[0]);
    }
    s = choose(s, "Kill Bomb: Ziggs gets +2 Might");
    expect(byId(s, "ziggs").temporaryMight).toBe(2);
    expect(bombs(s, 0)).toHaveLength(0);
  });

  it("Hexplosives Expert pays 1 Energy and 1 Power to make a Bomb", () => {
    let s = fixture();
    s.players[0].legendId = rad(141);
    const ability = getLegalActions(s, 0).find(
      (a) => a.sourceId === "legend" && a.category === "ability",
    )!;
    expect(ability).toBeDefined();
    s = act(s, (a) => a.id === ability.id);
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
    s = act(act(s, "pass"), "pass");
    s = settle(act(s, "choose-token:field:0"));
    expect(bombs(s, 0)).toHaveLength(1);
  });
});

describe("Jarvan IV deploy support", () => {
  it("Martial Paragon gives Deploy gear Action and channels when conquering beside one", () => {
    let s = fixture();
    s.units = [
      { ...unit("jarvan", 0, "base:0", 4), cardId: rad(91) },
      unit("enemy", 1, "field:0", 1),
    ];
    s.fields[0].controller = 1;
    deployGear(s, rad(2), "field:0");
    s.players[0].hand = [rad(73)];
    s = act(act(s, "move-start:jarvan:field:0"), "move-confirm");
    // In the showdown, the Deploy gear can be played thanks to [Action].
    expect(s.phase).toBe("showdown");
    expect(
      getLegalActions(s, s.priorityPlayer).some((a) => a.cardId === rad(73)),
    ).toBe(true);
    const runes = s.players[0].runes.length;
    s = settle(s);
    expect(s.fields[0].controller).toBe(0);
    expect(s.players[0].runes.length).toBe(runes + 1);
    expect(s.players[0].runes.at(-1)?.ready).toBe(false);
  });

  it("Exemplar of Demacia may exhaust and pay 1 Power to move a unit to the deployed gear", () => {
    let s = fixture();
    s.players[0].legendId = rad(155);
    s.units = [unit("ally", 0, "base:0", 3)];
    s.players[0].hand = [rad(2)];
    s = playAt(s, rad(2), "field:1");
    s = act(act(s, "pass"), "pass");
    s = choose(s, "Exhaust Exemplar and pay 1 Power: move");
    s = settle(s);
    expect(byId(s, "ally").location).toBe("field:1");
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
    expect(s.fields[1].controller).toBe(0);
  });
});

describe("Deploy wave registry", () => {
  it("registers every reviewed Deploy-wave printing and the Bomb token", () => {
    for (const id of Object.keys(radianceDeployScripts)) {
      expect(isImplemented(id), id).toBe(true);
      expect(cardRegistry[id].status).toBe("scripted");
    }
    expect(getCard("token-bomb").type).toBe("Gear");
  });
});

describe("Deploy wave in complete bot games", () => {
  const playable = (ids: string[]) =>
    ids.filter(
      (id) =>
        !getCard(id).variant &&
        ["Unit", "Spell", "Gear"].includes(getCard(id).type) &&
        getCard(id).supertype !== "Champion",
    );
  function deck(
    seed: number,
    legendId: string,
    championId: string,
  ): StarterDeck {
    const faces = playable([
      ...Object.keys(radianceDeployScripts).filter((id) =>
        id.startsWith("rad-"),
      ),
      ...Object.keys(radianceWave1Scripts),
    ]);
    const main = Array.from(
      { length: 39 },
      (_, i) => faces[(seed + i * 5) % faces.length],
    );
    return {
      ...starterDecks[0],
      id: `radiance-deploy-${seed}`,
      legendId,
      championId,
      main: [...new Set(main)].map((cardId) => ({
        cardId,
        count: main.filter((id) => id === cardId).length,
      })),
      runes: [1, 2, 3, 4, 5, 6].map((n) => ({
        cardId: `rad-r0${n}`,
        count: 2,
      })),
    };
  }

  it.each([7, 30])(
    "seed %i plays legal bot decisions to a winner",
    async (seed) => {
      let state = createGame({
        playerDeck: deck(seed, rad(141), rad(112)),
        botDeck: deck(seed + 1, rad(155), rad(91)),
        seed,
        firstPlayer: (seed % 2) as PlayerId,
        botDifficulty: "beginner",
      });
      let deployed = 0;
      let steps = 0;
      while (state.winner === null && steps < 3000) {
        if (steps % 25 === 0)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const request = getDecisionRequest(state)!;
        const result = decideBot(state, state.priorityPlayer, {
          deterministic: true,
          maxNodes: 80,
        });
        expect(result, `step ${steps}: bot decision`).not.toBeNull();
        expect(
          validateDecision(state, request, result!.decision).valid,
          `step ${steps}: legal decision`,
        ).toBe(true);
        state = applyDecision(state, request, result!.decision);
        deployed = Math.max(
          deployed,
          state.gears.filter((g) => g.deployedAt).length,
        );
        for (const gear of state.gears)
          if (gear.deployedAt)
            expect(state.fields.some((f) => f.id === gear.deployedAt)).toBe(
              true,
            );
        steps++;
      }
      expect(state.winner, `stalled after ${steps} decisions`).not.toBeNull();
      expect(deployed).toBeGreaterThan(0);
      expect(validState(deserializeGame(serializeGame(state)))).toBe(true);
    },
    180_000,
  );
});
