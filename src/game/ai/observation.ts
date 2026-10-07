import { cards, getCard } from "../../data/cards";
import { decksById } from "../../data/decks";
import { getRulesCardId, getScript, isImplemented } from "../scripts";
import type { GameState, PlayerId, PlayerState } from "../types";
import { botRandom, hash } from "./config";

type ObservedPlayer = Omit<
  PlayerState,
  "deck" | "runeDeck" | "hand" | "deckList" | "runeList"
> & {
  hand: string[];
  handCount: number;
  deckCount: number;
  runeDeckCount: number;
  deckList?: string[];
  runeList?: string[];
  knownTop?: string;
  knownTopCards?: string[];
};
export type ObservedState = Omit<
  GameState,
  "players" | "seed" | "rng" | "nextId" | "log" | "botSettings"
> & { players: [ObservedPlayer, ObservedPlayer] };
export interface Observation {
  viewer: PlayerId;
  version: string;
  state: ObservedState;
}

/** These module counters are all derived from public plays, moves and triggers.
 * New expansion state is private by default until audited and added here. */
const publicExtensionKeys = [
  "originsEnemyDeaths",
  "originsNextReady",
  "originsNextSpellDiscount",
  "originsMoveCounts",
  "wave3CombatWin",
  "wave4Dream",
  "spiritMighty",
  "spiritGearTurn",
  "spiritUncontrolled",
  "spiritPeerlessBonus",
  "sfdExtraHold",
  "sfdExtraRally",
  "sfdExtraAlone",
  "unleashed",
  "unleashedExtra",
  "unleashedWave3",
  "vendetta",
  "vendettaExtra",
  "vendettaWave3",
  "vendettaWave4",
];
function inspectedCards(s: GameState, viewer: PlayerId): string[] {
  const choice = s.pendingChoice;
  if (choice?.player !== viewer) return [];
  if (choice.kind === "predict") return s.players[viewer].deck.slice(0, 1);
  // Only these active inspection effects authorize looking at future cards.
  const counts: Record<string, number> = {
    "origins-more:stacked-selected": 3,
    "origins-more:candle-selected": 2,
    "sfd-extra:ornn-finish": 4,
    "ven-extra:lightning-finish": 3,
    "wave14:herald-selected": 3,
  };
  for (const effect of choice.options?.flatMap((o) => o.effects ?? []) ?? []) {
    if (effect.custom === "card-play:select" && effect.play?.zone === "top")
      return s.players[viewer].deck.slice(0, effect.play.count ?? 1);
    if (effect.custom && counts[effect.custom])
      return s.players[viewer].deck.slice(
        0,
        effect.lookCount ?? counts[effect.custom],
      );
    if (
      [
        "ven-wave3:predict-step",
        "unl:predict-two-apply",
        "unl-extra:predict-two-apply",
        "unl-extra:select-top-apply",
      ].includes(effect.custom ?? "")
    ) {
      const payload = JSON.parse(effect.cardName ?? "{}");
      const viewed = payload.viewed ?? payload.top;
      if (Array.isArray(viewed) && viewed.every((id) => typeof id === "string"))
        return [...viewed];
    }
  }
  return [];
}

/** Only this adapter may see the live state. No live reference reaches policy/search. */
export function getObservation(s: GameState, viewer: PlayerId): Observation {
  const publicKeys = [
    "version",
    "revision",
    "turnStep",
    "stagedFields",
    "unitDiedTurn",
    "preventEffectDamageTurn",
    "lastExcessDamage",
    "turn",
    "currentPlayer",
    "priorityPlayer",
    "phase",
    "fields",
    "units",
    "gears",
    "stack",
    "resolving",
    "resolvingAbilities",
    "consecutivePasses",
    "focusPlayer",
    "chainStarter",
    "combat",
    "pendingMove",
    "pendingTurnStart",
    "pendingBeginning",
    "pendingAwaken",
    "pendingEndTurn",
    "pendingCombatFinish",
    "pendingTriggers",
    "pendingPlays",
    "extraTurns",
    "controlEffects",
    "heldBanishments",
    "deathBatches",
    "pendingCombatDamage",
    "linkedBanishments",
    "tokenCopyChoices",
    "tokenCopyLinks",
    "splitXPWatches",
    "endDisempowers",
    "winner",
  ] as const;
  const state = Object.fromEntries(
    publicKeys
      .filter((k) => s[k] !== undefined)
      .map((k) => [k, structuredClone(s[k])]),
  ) as unknown as ObservedState;
  for (const key of publicExtensionKeys) {
    const value = (s as unknown as Record<string, unknown>)[key];
    if (value !== undefined)
      (state as unknown as Record<string, unknown>)[key] =
        structuredClone(value);
  }
  // Configuration is public; registered opponent deck identifiers/lists are not.
  if (s.matchConfig) state.matchConfig = structuredClone(s.matchConfig);
  state.players = s.players.map((p) => {
    const { deck, runeDeck, hand, deckList, runeList, ...publicPlayer } = p;
    const own = p.id === viewer,
      open = !!s.matchConfig?.openDecklists;
    const registered = own || open ? decksById[p.deckId] : undefined;
    return {
      ...structuredClone(publicPlayer),
      name: `Player ${p.id + 1}`,
      deckId: own || open ? p.deckId : "private",
      hand: own ? [...hand] : [],
      handCount: hand.length,
      deckCount: deck.length,
      runeDeckCount: runeDeck.length,
      ...(own || open
        ? {
            deckList: [
              ...(deckList ??
                registered?.main.flatMap((e) =>
                  Array(e.count).fill(getRulesCardId(e.cardId)),
                ) ??
                []),
            ].sort(),
            runeList: [
              ...(runeList ??
                registered?.runes.flatMap((e) =>
                  Array(e.count).fill(getCard(e.cardId).domains[0]),
                ) ??
                []),
            ].sort(),
          }
        : {}),
      ...(own && inspectedCards(s, viewer).length
        ? {
            knownTop: inspectedCards(s, viewer)[0],
            knownTopCards: inspectedCards(s, viewer),
          }
        : {}),
    };
  }) as [ObservedPlayer, ObservedPlayer];
  state.selectedInspections = s.selectedInspections
    ?.filter((b) => b.owner === viewer)
    .map((b) => structuredClone(b));
  state.hidden = (s.hidden ?? []).map((h, i) =>
    h.owner === viewer
      ? { ...h }
      : {
          id: `unseen-${i}`,
          owner: h.owner,
          location: h.location,
          hiddenTurn: h.hiddenTurn,
          cardId:
            s.players[viewer].canLookAtEnemyHiddenTurn === s.turn
              ? h.cardId
              : "unknown",
        },
  );
  state.pendingChoice = s.pendingChoice
    ? s.pendingChoice.player === viewer
      ? structuredClone(s.pendingChoice)
      : {
          player: s.pendingChoice.player,
          kind: s.pendingChoice.kind,
          remaining: s.pendingChoice.remaining,
          returnPhase: s.pendingChoice.returnPhase,
          returnPriority: s.pendingChoice.returnPriority,
        }
    : null;
  // Hash only information the observer may know; never hidden state or game RNG.
  const version = `${s.revision ?? 0}-${hash(JSON.stringify(state)).toString(16)}`;
  return { viewer, version, state };
}
const pool = [
  ...new Set(
    cards
      .filter(
        (c) =>
          ["Unit", "Spell", "Gear"].includes(c.type) && isImplemented(c.id),
      )
      .map((c) => getRulesCardId(c.id)),
  ),
].sort();
function subtract(list: string[], used: string[]) {
  const result = [...list];
  for (const id of used) {
    const i = result.indexOf(id);
    if (i >= 0) result.splice(i, 1);
  }
  return result;
}

/** Synthetic states are built exclusively from observation + a separate bot seed.
 * Sample zero is the no-new-unknown-response baseline. Other samples are stress
 * hypotheses from supported, domain-compatible cards, not metagame frequencies.
 */
export function sampleState(
  o: Observation,
  seed: number,
  sample = 0,
): GameState {
  const random = botRandom((seed + sample * 104729) >>> 0);
  const shuffled = <T>(input: T[]) => {
    const a = [...input];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const data = structuredClone(o.state);
  const hidden = data.hidden ?? [];
  const hiddenHypotheses = new Map<string, string>();
  const players = data.players.map((p) => {
    const {
      handCount,
      deckCount,
      runeDeckCount,
      knownTop,
      knownTopCards,
      ...rest
    } = p;
    const own = p.id === o.viewer;
    const domains = getCard(p.legendId).domains;
    const possibilities = pool.filter((id) =>
      getCard(id).domains.every((d) => domains.includes(d)),
    );
    const available = possibilities.length ? possibilities : pool;
    const pick = () => available[Math.floor(random() * available.length)];
    const used = [
      ...p.hand,
      ...p.discard,
      ...p.banished,
      ...data.units
        .filter((u) => u.owner === p.id && !u.token)
        .map((u) => u.cardId),
      ...data.gears
        .filter((g) => g.owner === p.id && !g.token)
        .map((g) => g.cardId),
      ...hidden
        .filter((h) => h.owner === p.id && h.cardId !== "unknown")
        .map((h) => h.cardId),
      ...data.stack
        .filter((i) => i.player === p.id && i.kind === "spell")
        .map((i) => i.cardId),
      ...(data.resolving ?? [])
        .filter((i) => i.player === p.id && i.kind === "spell")
        .map((i) => i.cardId),
    ];
    let remaining = shuffled(
      subtract(
        [...(p.deckList ?? []), p.championId],
        [...used, ...(p.championAvailable ? [p.championId] : [])],
      ),
    );
    for (const faceDown of hidden.filter(
      (h) => h.owner === p.id && h.cardId === "unknown",
    )) {
      const hiddenPool = (p.deckList?.length ? remaining : available).filter(
        (id) => getScript(id)?.hidden,
      );
      if (!hiddenPool.length)
        throw new Error("No consistent supported Hidden hypothesis");
      const card = hiddenPool[Math.floor(random() * hiddenPool.length)];
      hiddenHypotheses.set(faceDown.id, card);
      const index = remaining.indexOf(card);
      if (index >= 0) remaining.splice(index, 1);
    }
    const hand = own
      ? [...p.hand]
      : Array.from({ length: handCount }, () => remaining.shift() ?? pick());
    const deck = Array.from(
      { length: deckCount },
      () => remaining.shift() ?? pick(),
    );
    for (const [i, card] of (
      knownTopCards ?? (knownTop ? [knownTop] : [])
    ).entries()) {
      const index = deck.indexOf(card, i);
      if (index >= 0) [deck[i], deck[index]] = [deck[index], deck[i]];
      else if (i < deck.length) deck[i] = card;
    }
    const runes = shuffled(
      subtract(
        p.runeList ?? [],
        p.runes.map((r) => r.domain),
      ),
    );
    const runeDeck = Array.from(
      { length: runeDeckCount },
      () =>
        runes.shift() ??
        domains[Math.floor(random() * domains.length)] ??
        "Fury",
    );
    return { ...rest, hand, deck, runeDeck } as PlayerState;
  }) as [PlayerState, PlayerState];
  const state: GameState = {
    ...data,
    players,
    seed: seed || 1,
    rng: (seed + sample + 1) >>> 0 || 1,
    log: [],
    nextId: 1000000,
  };
  state.hidden = hidden.map((h) => {
    if (h.cardId !== "unknown") return h;
    return {
      ...h,
      id: `hypothesis-${h.id}`,
      cardId: hiddenHypotheses.get(h.id)!,
    };
  });
  // Sample zero keeps public hand/hidden counts and a consistent hypothesis,
  // but the response policy declines actions from unknown cards in that baseline.
  if (sample === 0)
    Object.assign(state, {
      botSimulation: { noUnknownResponsesFor: (1 - o.viewer) as PlayerId },
    });
  return state;
}

/** A legality-only shell: unknown identities are never used for effect resolution. */
export function observationRulesView(o: Observation): GameState {
  const s = structuredClone(o.state);
  return {
    ...s,
    seed: 1,
    rng: 1,
    nextId: 1000000,
    log: [],
    players: s.players.map((p) => ({
      ...p,
      hand: p.id === o.viewer ? p.hand : Array(p.handCount).fill("unknown"),
      deck: Array.from(
        { length: p.deckCount },
        (_, i) =>
          p.knownTopCards?.[i] ??
          (i === 0 && p.knownTop ? p.knownTop : "unknown"),
      ),
      runeDeck: Array(p.runeDeckCount).fill("unknown"),
    })) as unknown as [PlayerState, PlayerState],
  };
}
