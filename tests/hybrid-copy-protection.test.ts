import { describe, expect, it } from "vitest";
import { cards } from "../src/data/cards";
import {
  deserializeGame,
  getLegalActions,
  serializeGame,
} from "../src/game/engine";
import { syncHybridObjects } from "../src/game/card-wave19";
import { getScript } from "../src/game/scripts";
import { act, chain, fixture, ogn, sfd, unit } from "./fixtures/cards";
import type { GameState, TargetFilter } from "../src/game/types";

const ven = (number: number) =>
  cards.find(
    (card) =>
      card.set === "VEN" && card.collectorNumber === number && !card.variant,
  )!.id;
function cast(state: GameState, cardId: string, targetId?: string) {
  state.players[state.priorityPlayer].hand.push(cardId);
  return chain(
    act(
      state,
      (action) =>
        action.category === "play" &&
        action.cardId === cardId &&
        (!targetId || action.targetId === targetId) &&
        (!action.locationId ||
          action.locationId === `base:${state.priorityPlayer}`),
    ),
  );
}
function copySetup(recipientCard: string, modelCard: string) {
  let state = cast(fixture(), recipientCard);
  const recipient = state.units.find(
    (object) => object.cardId === recipientCard,
  )!;
  state = cast(state, modelCard);
  const model = state.units.find((object) => object.cardId === modelCard)!;
  state = cast(state, ven(137));
  const glasses = state.gears.find((object) => object.cardId === ven(137))!;
  state = act(state, `equip:${glasses.id}:${recipient.id}`);
  state = act(act(state, "pass"), "pass");
  state = chain(act(state, `choose-custom:spectacles:${model.id}`));
  return { state, recipientId: recipient.id, glassesId: glasses.id };
}
function protectedShowdown() {
  let state = fixture();
  state.units = [unit("enemy", 1, "field:0")];
  state = cast(state, ven(58));
  const porobot = state.units.find((object) => object.cardId === ven(58))!;
  state = cast(state, sfd(204));
  state = cast(state, ven(31), porobot.id);
  state = act(state, `move-start:${porobot.id}:field:0`);
  state = act(state, "move-confirm");
  state = act(state, "pass");
  expect(state.priorityPlayer).toBe(1);
  return { state, id: porobot.id };
}

describe("hybrid current types and chosen protection", () => {
  it("Porobot loses its Gear index when copying an ordinary unit and regains it on detach", () => {
    const setup = copySetup(ven(58), ogn(51));
    let state = setup.state;
    expect(
      state.units.find((object) => object.id === setup.recipientId),
    ).toMatchObject({
      cardId: ogn(51),
      originalCardId: ven(58),
      owner: 0,
    });
    expect(state.gears.some((object) => object.id === setup.recipientId)).toBe(
      false,
    );
    state.players[0].hand.push(sfd(135));
    expect(
      getLegalActions(state, 0).some(
        (action) =>
          action.cardId === sfd(135) && action.targetId === setup.recipientId,
      ),
    ).toBe(false);
    state = chain(
      act(
        state,
        (action) =>
          action.cardId === sfd(135) && action.targetId === setup.glassesId,
      ),
    );
    const recipient = state.units.find(
      (object) => object.id === setup.recipientId,
    )!;
    expect(recipient.cardId).toBe(ven(58));
    expect(state.gears.find((object) => object.id === recipient.id)).toBe(
      recipient,
    );
    expect(state.players[0].hand).toEqual([ven(137)]);
  });

  it("an ordinary unit copying Porobot gains one Gear alias and loses it when restored", () => {
    const setup = copySetup(ogn(51), ven(58));
    let state = setup.state;
    const copied = state.units.find(
      (object) => object.id === setup.recipientId,
    )!;
    expect(state.gears.find((object) => object.id === copied.id)).toBe(copied);
    expect(
      state.gears.filter((object) => object.id === copied.id),
    ).toHaveLength(1);
    state = deserializeGame(serializeGame(state))!;
    expect(state.gears.find((object) => object.id === setup.recipientId)).toBe(
      state.units.find((object) => object.id === setup.recipientId),
    );
    state = cast(state, sfd(135), setup.glassesId);
    expect(
      state.units.find((object) => object.id === setup.recipientId)?.cardId,
    ).toBe(ogn(51));
    expect(state.gears.some((object) => object.id === setup.recipientId)).toBe(
      false,
    );
  });

  it("removing an obsolete Gear alias detaches its Equipment metadata without changing physical identity", () => {
    const state = fixture();
    const recipient = {
      ...unit("copy"),
      cardId: ogn(51),
      originalCardId: ven(58),
      originalOwner: 1 as const,
      attachedTo: "bearer",
      copiedText: ven(137),
    };
    const bearer = {
      ...unit("bearer"),
      gear: [recipient.id],
      grantedTags: [{ sourceId: recipient.id, tag: "Mech" }],
      usedAbilities: [`${recipient.id}:test`],
    };
    state.units = [recipient, bearer];
    state.gears = [recipient];
    syncHybridObjects(state);
    expect(state.gears).toEqual([]);
    expect(bearer).toMatchObject({
      gear: [],
      grantedTags: [],
      usedAbilities: [],
    });
    expect(recipient).toMatchObject({
      cardId: ogn(51),
      originalCardId: ven(58),
      originalOwner: 1,
      owner: 0,
    });
    expect(recipient.attachedTo).toBeUndefined();
    expect(recipient.copiedText).toBeUndefined();
  });

  it("actual Twilight Shroud prevents enemy Factory Recall during showdown", () => {
    const { state, id } = protectedShowdown();
    state.players[1].hand.push(sfd(135));
    expect(
      state.units.find((object) => object.id === id)?.untargetableByEnemy,
    ).toBe(true);
    expect(
      getLegalActions(state, 1).some(
        (action) => action.cardId === sfd(135) && action.targetId === id,
      ),
    ).toBe(false);
  });

  it.each([
    "anyGear",
    "enemyGear",
    "unitOrGear",
    "enemyUnitOrGear",
    "twoGear",
    "empowerObject",
  ] as TargetFilter[])(
    "the %s chosen-target filter cannot bypass protection through the Gear alias",
    (target) => {
      const { state, id } = protectedShowdown();
      // Isolate declaration filters from the printed timing/domain restrictions.
      state.phase = "main";
      state.combat = null;
      state.currentPlayer = state.priorityPlayer = state.focusPlayer = 1;
      state.players[1].hand = [sfd(135)];
      state.gears.push(
        { id: "ordinary", cardId: sfd(33), owner: 0, ready: false },
        { id: "another", cardId: sfd(33), owner: 0, ready: false },
      );
      const script = getScript(sfd(135))!;
      const saved = script.spell![0].target;
      try {
        script.spell![0].target = target;
        const actions = getLegalActions(state, 1).filter(
          (action) => action.cardId === sfd(135),
        );
        expect(
          actions.some((action) => action.targetId?.split("~").includes(id)),
        ).toBe(false);
        expect(
          actions.some((action) =>
            action.targetId?.split("~").includes("ordinary"),
          ),
        ).toBe(true);
      } finally {
        script.spell![0].target = saved;
      }
    },
  );

  it("a staged Unit/Gear choice excludes the protected hybrid and keeps ordinary Gear", () => {
    const { state, id } = protectedShowdown();
    state.phase = "main";
    state.combat = null;
    state.currentPlayer = state.priorityPlayer = state.focusPlayer = 1;
    state.gears.push({
      id: "ordinary",
      cardId: sfd(33),
      owner: 0,
      ready: false,
    });
    state.players[1].hand = [ven(150)];
    const choosing = act(state, (action) => action.cardId === ven(150));
    expect(choosing.pendingChoice?.kind).toBe("boardTargets");
    const choices = getLegalActions(choosing, 1);
    expect(choices.some((action) => action.id === `choose-board:${id}`)).toBe(
      false,
    );
    expect(
      choices.some((action) => action.id === "choose-board:ordinary"),
    ).toBe(true);
  });

  it("Gear-target resolution skips a hybrid that became protected after declaration", () => {
    const { state: protectedState, id } = protectedShowdown();
    let state = protectedState;
    state.units.find((object) => object.id === id)!.untargetableByEnemy = false;
    state.players[1].hand.push(sfd(135));
    state = act(
      state,
      (action) => action.cardId === sfd(135) && action.targetId === id,
    );
    // Resolve the real Twilight Shroud instructions ahead of the declared recall.
    state.stack.push({
      id: "later-shroud",
      player: 0,
      cardId: ven(31),
      targetId: id,
      kind: "spell",
      effects: getScript(ven(31))!.spell!,
    });
    state = act(act(state, "pass"), "pass");
    state = act(act(state, "pass"), "pass");
    expect(state.units.some((object) => object.id === id)).toBe(true);
    expect(state.gears.some((object) => object.id === id)).toBe(true);
    expect(state.players[0].hand).not.toContain(ven(58));
  });

  it("untargeted Downwell still returns a protected hybrid once", () => {
    const { state, id } = protectedShowdown();
    state.phase = "main";
    state.combat = null;
    state.currentPlayer = state.priorityPlayer = state.focusPlayer = 1;
    const returned = cast(state, sfd(147));
    expect(returned.units.some((object) => object.id === id)).toBe(false);
    expect(returned.gears.some((object) => object.id === id)).toBe(false);
    expect(
      returned.players[0].hand.filter((cardId) => cardId === ven(58)),
    ).toHaveLength(1);
  });
});
