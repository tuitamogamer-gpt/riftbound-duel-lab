import { cards, getCard } from "../../data/cards";
import { decksById } from "../../data/decks";
import { getRulesCardId, getScript, isImplemented } from "../scripts";
import type { GameState, PlayerId, PlayerState } from "../types";
import { botRandom, hash } from "./config";
import type { PublicHandReveal } from "../hand-reveals";
import { physicalCard, physicalOwner } from "../objects";

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
  /** Current positions of an explicitly active, previously inspected batch. */
  knownDeckPositions?: { index: number; cardId: string }[];
  /** An active, explicitly revealed hand choice; expires with that choice. */
  knownHand?: string[];
};
export type ObservedState = Omit<
  GameState,
  | "players"
  | "seed"
  | "rng"
  | "nextId"
  | "log"
  | "botSettings"
  | "publicReveals"
> & { players: [ObservedPlayer, ObservedPlayer] };
export interface Observation {
  viewer: PlayerId;
  version: string;
  state: ObservedState;
  /** Presentation of a past public reveal; excluded from policy inputs and hashes. */
  publicReveals?: PublicHandReveal;
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
function inspectedCards(s: GameState, viewer: PlayerId): [string[], string[]] {
  const inspected: [string[], string[]] = [[], []];
  const choice = s.pendingChoice;
  if (choice?.player !== viewer) return inspected;
  if (choice.kind === "predict") {
    const owner =
      choice.effect?.who === "opponent" ? ((1 - viewer) as PlayerId) : viewer;
    inspected[owner] = s.players[owner].deck.slice(0, 1);
    return inspected;
  }
  // Only these active inspection effects authorize looking at future cards.
  const counts: Record<string, number> = {
    "origins-more:stacked-selected": 3,
    "origins-more:candle-selected": 2,
    "sfd-extra:ornn-finish": 4,
    "ven-extra:lightning-finish": 3,
    "wave14:herald-selected": 3,
  };
  // A Nocturne replacement pauses the original look instruction before its
  // final selection is formed. Its keep branch retains the entire inspected
  // batch; the banish branch has already reduced lookCount by one.
  const interruptedLooks = new Set([
    "ven:pakaa",
    "unl-wave3:diana-reveal",
    "wave14:herald",
    "wave8:teemo",
    "sfd-extra:smith",
    "sfd-extra:ornn-select",
    "unl-extra:select-top",
    "unl-extra:predict-two",
    "unl:predict-two",
    "origins-more:stacked-deck",
    "origins-more:candlelit",
    "wave3:called-shot",
    "ven-wave3:predict",
    "ven-extra:lightning",
    "sfd:conservatory",
  ]);
  const effects = choice.options?.flatMap((o) => o.effects ?? []) ?? [];
  if (effects.some((e) => e.custom === "inspection:nocturne")) {
    const count = Math.max(
      0,
      ...effects
        .filter(
          (e) =>
            e.lookCount !== undefined &&
            (interruptedLooks.has(e.custom ?? "") ||
              e.type === "predict" ||
              (e.type === "playCard" && e.play?.zone === "top")),
        )
        .map((e) => e.lookCount!),
    );
    inspected[viewer] = s.players[viewer].deck.slice(0, count);
    return inspected;
  }
  for (const effect of effects) {
    if (effect.custom === "card-play:select" && effect.play?.zone === "top") {
      const owner = effect.play.zoneOwner ?? viewer;
      inspected[owner] = s.players[owner].deck.slice(0, effect.play.count ?? 1);
      return inspected;
    }
    if (effect.custom && counts[effect.custom]) {
      inspected[viewer] = s.players[viewer].deck.slice(
        0,
        effect.lookCount ?? counts[effect.custom],
      );
      return inspected;
    }
    if (
      [
        "ven-wave3:predict-step",
        "unl:predict-two-apply",
        "unl-extra:predict-two-apply",
        "unl-extra:select-top-apply",
      ].includes(effect.custom ?? "")
    ) {
      let payload: { viewed?: unknown; top?: unknown };
      try {
        payload = JSON.parse(effect.cardName ?? "{}");
      } catch {
        continue;
      }
      if (!payload || typeof payload !== "object") continue;
      const viewed = payload.viewed ?? payload.top;
      if (
        Array.isArray(viewed) &&
        viewed.every((id) => typeof id === "string")
      ) {
        inspected[viewer] = [...viewed];
        return inspected;
      }
    }
  }
  return inspected;
}

/** These two effects reveal the enemy hand before this named selection. */
function inspectedHand(s: GameState, viewer: PlayerId): string[] | undefined {
  const choice = s.pendingChoice;
  if (choice?.player !== viewer) return;
  const enemy = (1 - viewer) as PlayerId;
  const effects = choice.options?.flatMap((o) => o.effects ?? []) ?? [];
  const ashe = effects.some((e) => e.custom === "wave16:ashe-banish");
  const skewer =
    (s.resolving ?? []).some(
      (item) => item.player === viewer && item.cardId === "unl-139-219",
    ) &&
    effects.some(
      (e) =>
        e.custom === "card-play:select" &&
        e.play?.zone === "hand" &&
        e.play.zoneOwner === enemy,
    );
  return ashe || skewer ? [...s.players[enemy].hand] : undefined;
}

function inspectedPositions(s: GameState, viewer: PlayerId) {
  if (s.pendingChoice?.player !== viewer) return [];
  const selectedEffects = new Set([
    "wave14:herald-selected",
    "sfd-extra:ornn-finish",
    "unl-extra:select-top-apply",
  ]);
  const deck = s.players[viewer].deck;
  const positions = new Set(
    (s.selectedInspections ?? [])
      .filter(
        (batch) =>
          batch.owner === viewer &&
          selectedEffects.has(batch.effect.custom ?? ""),
      )
      .flatMap((batch) => batch.positions)
      .filter((index) => index >= 0 && index < deck.length),
  );
  return [...positions]
    .sort((a, b) => a - b)
    .map((index) => ({ index, cardId: deck[index] }));
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
  const inspected = inspectedCards(s, viewer);
  const revealedHand = inspectedHand(s, viewer);
  const batchPositions = inspectedPositions(s, viewer);
  state.players = s.players.map((p) => {
    const { deck, runeDeck, hand, deckList, runeList, ...publicPlayer } = p;
    const own = p.id === viewer,
      open = !!s.matchConfig?.openDecklists;
    const registered = own || open ? decksById[p.deckId] : undefined;
    const publicData = structuredClone(publicPlayer) as Partial<ObservedPlayer>;
    // A legality shell or imported extra fields cannot authorize themselves.
    // Regenerate these facts solely from the current audited choice below.
    delete publicData.knownTop;
    delete publicData.knownTopCards;
    delete publicData.knownDeckPositions;
    delete publicData.knownHand;
    return {
      ...publicData,
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
      ...(inspected[p.id].length
        ? {
            knownTop: inspected[p.id][0],
            knownTopCards: inspected[p.id],
          }
        : {}),
      ...(!own && revealedHand ? { knownHand: revealedHand } : {}),
      ...(own && batchPositions.length
        ? { knownDeckPositions: batchPositions }
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
  return {
    viewer,
    version,
    state,
    ...(s.publicReveals
      ? { publicReveals: structuredClone(s.publicReveals) }
      : {}),
  };
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
  // Hybrid Unit/Gear cards occupy both public collections but remain one card.
  const physicalBoard = [
    ...new Map(
      [...data.units, ...data.gears].map((object) => [object.id, object]),
    ).values(),
  ];
  const players = data.players.map((p) => {
    const {
      handCount,
      deckCount,
      runeDeckCount,
      knownTop,
      knownTopCards,
      knownHand,
      knownDeckPositions,
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
      ...(!own ? (knownHand ?? []) : []),
      ...p.discard,
      ...p.banished,
      ...physicalBoard
        .filter((object) => physicalOwner(object) === p.id && !object.token)
        .map(physicalCard),
      ...hidden
        .filter((h) => h.owner === p.id && h.cardId !== "unknown")
        .map((h) => h.cardId),
      ...data.stack
        .filter(
          (i) => (i.originalOwner ?? i.player) === p.id && i.kind === "spell",
        )
        .map((i) => i.cardId),
      ...(data.resolving ?? [])
        .filter(
          (i) => (i.originalOwner ?? i.player) === p.id && i.kind === "spell",
        )
        .map((i) => i.cardId),
    ];
    const knownPrefix = (knownTopCards ?? (knownTop ? [knownTop] : [])).slice(
      0,
      deckCount,
    );
    const knownPositions = new Map(
      (knownDeckPositions ?? [])
        .filter(({ index }) => index >= 0 && index < deckCount)
        .map(({ index, cardId }) => [index, cardId]),
    );
    knownPrefix.forEach((cardId, index) => knownPositions.set(index, cardId));
    let remaining = shuffled(
      subtract(
        [...(p.deckList ?? []), p.championId],
        [
          ...used,
          ...knownPositions.values(),
          ...(p.championAvailable ? [p.championId] : []),
        ],
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
      : knownHand
        ? [...knownHand]
        : Array.from({ length: handCount }, () => remaining.shift() ?? pick());
    const deck = Array.from(
      { length: deckCount },
      (_, index) => knownPositions.get(index) ?? remaining.shift() ?? pick(),
    );
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
      hand:
        p.id === o.viewer
          ? p.hand
          : (p.knownHand ?? Array(p.handCount).fill("unknown")),
      deck: Array.from(
        { length: p.deckCount },
        (_, i) =>
          p.knownDeckPositions?.find(({ index }) => index === i)?.cardId ??
          p.knownTopCards?.[i] ??
          (i === 0 && p.knownTop ? p.knownTop : "unknown"),
      ),
      runeDeck: Array(p.runeDeckCount).fill("unknown"),
    })) as unknown as [PlayerState, PlayerState],
  };
}
