import { cards, getCard } from "../data/cards";
import { isFace } from "./board-rules";
import type { ExpansionModule } from "./later-precon-engine";
import { takeTrash, trashTargets } from "./trash";
import type { CardScript, Effect } from "./types";

const plain: CardScript = { implemented: true };
const fx = (key: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `wave7:${key}`,
  ...extra,
});
const recover = (extra: Partial<Effect> = {}) =>
  fx("return-trash", { target: "trashCards", ...extra });
const recycle = (extra: Partial<Effect> = {}) =>
  fx("recycle-trash", { target: "trashCards", ...extra });
const readyOther = () =>
  fx("ready-other", {
    target: "exhaustedOther",
    excludeSource: true,
    optional: true,
  });
const exact: Record<string, CardScript> = {
  "ogn-070-298": plain,
  "ogn-109-298": { ...plain, onBegin: [recycle({ targetCount: 3 })] },
  "ogn-162-298": { ...plain, accelerating: true, keywords: ["Ganking"] },
  "ogn-202-298": plain,
  "ogn-212-298": {
    ...plain,
    onPlay: [{ type: "token", amount: 1 }],
    abilities: [
      {
        label: "Recycle up to four cards",
        sacrificeSelf: true,
        effects: [recycle({ who: "all", targetCount: 4, upTo: true })],
      },
    ],
  },
  "ogn-263-298": {
    ...plain,
    abilities: [
      {
        label: "Return a Teemo to hand",
        energy: 1,
        exhaust: true,
        effects: [fx("teemo", { target: "ownTeemo" })],
      },
    ],
  },
  "ogn-264-298": {
    ...plain,
    spell: [
      recover({ targetCount: 2, upTo: true, condition: "hidden" }),
      fx("free-hide"),
    ],
  },
  "ogn-247-298": {
    ...plain,
    abilities: [
      {
        label: "Add one Power for spells",
        exhaust: true,
        timing: "reaction",
        effects: [{ type: "power", amount: 1, condition: "spellsOnly" }],
      },
    ],
  },
  "sfd-035-221": {
    ...plain,
    onHold: [recover({ cardTypes: ["Unit", "Gear"], optional: true })],
  },
  "sfd-045-221": {
    ...plain,
    reaction: true,
    spell: [{ type: "counter", target: "enemyChainItemChoosingFriendly" }],
  },
  "unl-106-219": {
    ...plain,
    reaction: true,
    spell: [{ type: "counter", target: "friendlyUnitAndEnemyChainItem" }],
  },
  "sfd-061-221": { ...plain, onPlay: [recover({ cardTypes: ["Gear"] })] },
  "sfd-075-221": plain,
  "sfd-054-221": { ...plain, deflect: 1 },
  "sfd-143-221": { ...plain, accelerating: true },
  "sfd-193-221": {
    ...plain,
    abilities: [
      {
        label: "Attach detached Equipment",
        energy: 1,
        exhaust: true,
        effects: [
          fx("attach", {
            target: "unitAndEquipment",
            condition: "detachedFriendly",
          }),
        ],
      },
      {
        label: "Reattach Equipment",
        exhaust: true,
        effects: [
          fx("attach", {
            target: "unitAndEquipment",
            condition: "attachedFriendly",
          }),
        ],
      },
    ],
  },
  "sfd-011-221": {
    ...plain,
    reaction: true,
    spellModes: [
      {
        label: "Attach",
        effects: [
          fx("attach", { target: "unitAndEquipment" }),
          { type: "draw" },
        ],
      },
      {
        label: "Detach",
        effects: [
          fx("detach", {
            target: "unitAndEquipment",
            condition: "attachedToChosen",
          }),
          { type: "draw" },
        ],
      },
    ],
  },
  "unl-080-219": {
    ...plain,
    onMove: [
      { type: "draw" },
      { type: "discard" },
      fx("hwei", { condition: "discardType" }),
    ],
  },
  "unl-103-219": {
    ...plain,
    reaction: true,
    spellModes: [
      {
        label: "Recycle up to three opposing cards",
        effects: [recycle({ who: "opponent", targetCount: 3, upTo: true })],
      },
      { label: "Draw one", effects: [{ type: "draw" }] },
    ],
  },
  "unl-167-219": {
    ...plain,
    onPlay: [recover({ cardTags: ["Bird", "Cat", "Dog", "Poro"] })],
  },
};
const ven: Record<number, CardScript> = {
  25: plain,
  68: { ...plain, onPlay: [readyOther()] },
  103: {
    ...plain,
    spell: [
      recover({ who: "all", targetCount: 2, upTo: true, cardTypes: ["Unit"] }),
    ],
  },
  134: {
    ...plain,
    abilities: [
      {
        label: "Empower",
        energy: 3,
        effects: [fx("kayle")],
      },
    ],
  },
  113: {
    ...plain,
    onPlay: [{ type: "mill", amount: 2 }],
    onConquer: [
      fx("grant-flow", { target: "trashCards", cardTypes: ["Spell"] }),
    ],
  },
  141: {
    ...plain,
    abilities: [
      {
        label: "Add two Energy for units",
        power: 2,
        exhaust: true,
        timing: "reaction",
        effects: [{ type: "energy", amount: 2, condition: "unitsOnly" }],
      },
    ],
  },
  145: plain,
  155: {
    ...plain,
    abilities: [
      {
        label: "Give Assault 2",
        exhaust: true,
        disempowerSelf: true,
        timing: "action",
        effects: [{ type: "assault", amount: 2, target: "anyUnit" }],
      },
    ],
  },
};
export const cardWave7Scripts: Record<string, CardScript> = {
  ...exact,
  ...Object.fromEntries(
    cards
      .filter((c) => c.set === "VEN" && ven[c.collectorNumber])
      .map((c) => [c.id, ven[c.collectorNumber]]),
  ),
};

export const cardWave7Module: ExpansionModule = {
  might(s, u, value) {
    if (isFace(u.cardId, "OGN", 109))
      value += s.players[u.owner].discard.length;
    if (
      isFace(u.cardId, "SFD", 143) &&
      (s.players[u.owner].powerSpentThisTurn ?? 0) >= 2
    )
      value += 2;
    if (isFace(u.cardId, "VEN", 134))
      value += 2 * (u.empowerCount ?? Number(!!u.empowered));
    return value;
  },
  keywords(s, u) {
    const result: string[] = [];
    if (
      isFace(u.cardId, "SFD", 143) &&
      (s.players[u.owner].powerSpentThisTurn ?? 0) >= 2
    )
      result.push("Ganking");
    if (isFace(u.cardId, "VEN", 134) && u.empowerCount === 3)
      result.push("Deflect 3", "Ganking");
    return result;
  },
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    const legend = s.players[p].legendId;
    if (
      event === "play" &&
      isFace(legend, "VEN", 155) &&
      ctx.playSource &&
      ctx.playSource !== "hand"
    )
      ctx.trigger(s, p, legend, "legend", [fx("empower-legend")]);
    if (
      isFace(legend, "VEN", 145) &&
      ((event === "cardFinalized" &&
        ["Unit", "Gear"].includes(getCard(cardId).type) &&
        (getCard(cardId).energy ?? 0) >= 7) ||
        (event === "abilityActivated" && (ctx.abilityEnergyCost ?? 0) >= 7))
    )
      ctx.trigger(s, p, legend, "legend", [
        {
          type: "readyRunes",
          amount: 2,
          chooseRunes: true,
          optional: true,
          triggerCost: { exhaust: true },
        },
      ]);
    if (event === "discardBatch") {
      for (const u of s.units.filter(
        (u) => u.owner === p && isFace(u.cardId, "OGN", 202),
      ))
        ctx.trigger(
          s,
          p,
          u.cardId,
          u.id,
          [
            { type: "ready", condition: "self" },
            { type: "might", amount: 1, condition: "self" },
          ],
          u.location,
        );
    }
    if (event === "move") {
      const source = s.units.find((u) => u.id === sourceId);
      if (
        source &&
        isFace(source.cardId, "OGN", 162) &&
        source.movesThisTurn === 1
      )
        ctx.trigger(
          s,
          source.owner,
          cardId,
          source.id,
          [readyOther()],
          locationId,
        );
    }
    if (event === "abilityActivated" && getCard(cardId).type === "Gear")
      for (const u of s.units.filter(
        (u) => u.owner === p && isFace(u.cardId, "SFD", 75),
      ))
        ctx.trigger(
          s,
          p,
          u.cardId,
          u.id,
          [{ type: "might", amount: 1, condition: "self" }],
          u.location,
        );
    if (
      event === "cardFinalized" &&
      getCard(cardId).type === "Gear" &&
      sourceId
    ) {
      const player = s.players[p];
      if (player.firstGearPlayedTurn === s.turn) return;
      player.firstGearPlayedTurn = s.turn;
      for (const u of s.units.filter(
        (u) => u.owner === p && isFace(u.cardId, "VEN", 68),
      ))
        ctx.trigger(s, p, u.cardId, u.id, [readyOther()], u.location);
    }
  },
  effect(s, p, e, ctx) {
    if (e.custom === "wave7:empower-legend") {
      ctx.empower?.(s, p, "legend");
      return true;
    }
    if (e.custom === "wave7:grant-flow") {
      const card = trashTargets(s, p, e).find(
        (card) => card.id === ctx.targetId,
      );
      if (card) {
        const grants = (s.players[p].grantedFlow ??= []);
        if (
          !grants.some(
            (grant) => grant.trashId === card.id && grant.turn === s.turn,
          )
        )
          grants.push({ trashId: card.id, turn: s.turn });
      }
      return true;
    }
    if (!e.custom?.startsWith("wave7:")) return false;
    const key = e.custom.slice(6);
    const ids = (ctx.targetId ?? "").split("~");
    const source = s.units.find((u) => u.id === ctx.sourceId);
    switch (key) {
      case "return-trash":
      case "recycle-trash": {
        const eligible = trashTargets(s, p, e);
        for (const owner of [0, 1] as const) {
          const moved = eligible
            .filter((card) => card.owner === owner && ids.includes(card.id))
            .flatMap((card) => {
              const id = takeTrash(s, owner, card.id);
              return id ? [id] : [];
            });
          if (key === "return-trash") s.players[owner].hand.push(...moved);
          else
            s.players[owner].deck.push(...(ctx.shuffle?.(s, moved) ?? moved));
          if (moved.length)
            ctx.log?.(
              s,
              `${key === "return-trash" ? "Returned" : "Recycled"} ${moved.map((id) => getCard(id).name).join(", ")} from ${s.players[owner].name}'s trash.`,
              "play",
              p,
            );
        }
        break;
      }
      case "free-hide":
        s.players[p].freeHideTurn = s.turn;
        break;
      case "teemo":
        if (
          ctx.targetId === `champion:${p}` &&
          s.players[p].championAvailable
        ) {
          s.players[p].championAvailable = false;
          s.players[p].hand.push(s.players[p].championId);
        } else
          ctx.runEffects(
            s,
            p,
            [{ type: "bounce", target: "friendlyUnit" }],
            ctx.targetId,
            ctx.sourceId,
          );
        break;
      case "hwei":
        if (e.cardName)
          ctx.trigger(
            s,
            p,
            "unl-080-219",
            ctx.sourceId!,
            e.cardName === "Spell"
              ? [{ type: "draw" }]
              : e.cardName === "Gear"
                ? [
                    {
                      type: "readyRunes",
                      amount: 2,
                      chooseRunes: true,
                      optional: true,
                    },
                  ]
                : [{ type: "might", amount: 3, condition: "self" }],
            ctx.locationId,
          );
        break;
      case "kayle":
        if (source) ctx.empower!(s, p, source.id);
        break;
      case "ready-other": {
        const unit = s.units.find((u) => u.id === ctx.targetId);
        if (unit)
          ctx.runEffects(
            s,
            p,
            [{ type: "ready", target: "anyUnit" }],
            unit.id,
            ctx.sourceId,
          );
        else {
          const gear = s.gears.find((g) => g.id === ctx.targetId);
          if (gear && !ctx.readyForbidden?.(s, gear.owner)) gear.ready = true;
          for (const player of s.players) {
            const rune = player.runes.find((r) => r.id === ctx.targetId);
            if (rune) rune.ready = true;
            if (ctx.targetId === `legend:${player.id}`)
              player.legendUsedTurn = -1;
          }
        }
        break;
      }
      case "attach":
      case "detach": {
        const unit = s.units.find((u) => u.id === ids[0]);
        const gear = s.gears.find((g) => g.id === ids[1]);
        if (
          !unit ||
          !gear ||
          unit.owner !== gear.owner ||
          ctx.canTargetUnit?.(s, p, unit) === false
        )
          break;
        if (
          (e.condition === "detachedFriendly" &&
            (gear.owner !== p || gear.attachedTo)) ||
          (e.condition === "attachedFriendly" &&
            (gear.owner !== p || !gear.attachedTo)) ||
          (e.condition === "attachedToChosen" && gear.attachedTo !== unit.id)
        )
          break;
        if (key === "attach")
          ctx.runEffects(
            s,
            gear.owner,
            [{ type: "equip", target: "friendlyUnit" }],
            unit.id,
            gear.id,
          );
        else {
          unit.gear = unit.gear.filter((id) => id !== gear.id);
          gear.attachedTo = undefined;
        }
        break;
      }
    }
    return true;
  },
};
