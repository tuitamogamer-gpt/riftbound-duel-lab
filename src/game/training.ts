import {
  applyAction,
  createGame,
  getCombatPower,
  getGameView,
  getLegalActions,
} from "./engine";
import type { GameAction, GameState, Unit } from "./types";

export const TRAINING_PROGRESS_KEY = "riftbound-duel-training-v1";
export const trainingLessons = [
  {
    id: "deploy",
    title: "Deploy your first unit",
    goal: "Play a unit from your hand into your base.",
    rule: "A unit enters your base exhausted unless its text allows another destination or readiness.",
    hint: "Select the card in your hand, then choose its legal play action.",
    success:
      "The unit is in your base. Its cost was paid by the same rules as a normal duel.",
  },
  {
    id: "movement",
    title: "Move together and conquer",
    goal: "Move both ready units to the first battlefield and score a conquest point.",
    rule: "Prepare a group, add another unit and confirm. Movement exhausts the units; an open showdown settles control.",
    hint: "Start movement with either unit, add its ally, confirm, then pass the showdown.",
    success:
      "Both units arrived together and you scored for conquering the battlefield.",
  },
  {
    id: "reaction",
    title: "Answer a spell",
    goal: "Counter the incoming Hextech Ray and keep your unit undamaged.",
    rule: "A reaction joins the chain above the pending spell. Players pass priority before it resolves.",
    hint: "Play Wind Wall targeting Hextech Ray, then pass priority to resolve the chain.",
    success:
      "Wind Wall countered the pending spell. Your unit survived without damage.",
  },
  {
    id: "hidden",
    title: "Reveal a Hidden threat",
    goal: "Reveal Blastcone Fae and weaken the enemy at its battlefield.",
    rule: "A Hidden card must wait until a later turn. Its local play trigger targets its own battlefield.",
    hint: "Select your face-up Hidden card, reveal it, and choose the enemy at the same battlefield.",
    success:
      "The Hidden card entered play and its local trigger reduced the enemy's Might by 2.",
  },
  {
    id: "damage",
    title: "Assign lethal damage",
    goal: "Defeat both defenders while your attacker survives.",
    rule: "The defender with 2 damage prevention needs 6 assigned damage; the wounded defender needs 2. Damage resolves after both sides finish assigning.",
    hint: "Choose either legal defender. Assign the lethal amount, then assign the remainder to the other.",
    success:
      "Your 8 damage defeated both defenders, and your attacker survived their simultaneous damage.",
  },
  {
    id: "hold",
    title: "Hold for the winning point",
    goal: "Keep your battlefield until your next turn and earn the eighth point.",
    rule: "Holding a controlled battlefield scores at the beginning of your turn. This opponent has no threats in the exercise.",
    hint: "End your turn. The practice opponent ends theirs; your hold point wins the game.",
    success:
      "Your next turn began with control intact. The hold point brought you to 8 and won the exercise.",
  },
] as const;
export type TrainingLessonId = (typeof trainingLessons)[number]["id"];
export type TrainingLesson = (typeof trainingLessons)[number];

const lessonIds = new Set<string>(trainingLessons.map((lesson) => lesson.id));

/** Progress contains only completed exercise IDs, never a duel or private card data. */
export function parseTrainingProgress(raw: string | null): TrainingLessonId[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("completed" in value) ||
      !Array.isArray(value.completed)
    )
      return [];
    return [
      ...new Set(
        value.completed.filter(
          (id): id is TrainingLessonId =>
            typeof id === "string" && lessonIds.has(id),
        ),
      ),
    ];
  } catch {
    return [];
  }
}

export function readTrainingProgress(
  storage?: Pick<Storage, "getItem">,
): TrainingLessonId[] {
  try {
    return parseTrainingProgress(
      (storage ?? globalThis.localStorage)?.getItem(TRAINING_PROGRESS_KEY) ??
        null,
    );
  } catch {
    return [];
  }
}

export function saveTrainingProgress(
  completed: TrainingLessonId[],
  storage?: Pick<Storage, "setItem">,
): boolean {
  try {
    (storage ?? globalThis.localStorage).setItem(
      TRAINING_PROGRESS_KEY,
      JSON.stringify({
        version: 1,
        completed: [...new Set(completed.filter((id) => lessonIds.has(id)))],
      }),
    );
    return true;
  } catch {
    return false;
  }
}

const unit = (
  id: string,
  owner: 0 | 1,
  might: number,
  cardId = "ogn-049-298",
): Unit => ({
  id,
  owner,
  cardId,
  baseMightOverride: might,
  location: "base:0",
  ready: true,
  damage: 0,
  buff: 0,
  temporaryMight: 0,
  temporaryAssault: 0,
  stunned: false,
  gear: [],
  summonedTurn: 1,
});

function opening(): GameState {
  const game = applyAction(
    applyAction(
      createGame({
        seed: 20261008,
        firstPlayer: 0,
        playerDeckId: "annie",
        botDeckId: "lux",
      }),
      "mulligan:",
    ),
    "mulligan:",
  );
  game.turn = 5;
  game.turnStep = "main";
  game.phase = "main";
  game.units = [];
  game.gears = [];
  game.hidden = [];
  game.stack = [];
  game.log = [];
  game.stagedFields = [];
  game.currentPlayer = game.priorityPlayer = game.focusPlayer = 0;
  game.combat = game.pendingMove = game.pendingChoice = null;
  game.fields = [
    { id: "field:0", cardId: "ogn-275-298", controller: null },
    { id: "field:1", cardId: "ogn-278-298", controller: null },
  ];
  for (const player of game.players) {
    player.name = player.id === 0 ? "You" : "Practice opponent";
    player.legendId = "ogs-009-024";
    player.championAvailable = false;
    player.hand = [];
    player.deck = Array.from({ length: 4 }, () => "ogn-049-298");
    player.discard = [];
    player.trashCards = [];
    player.banished = [];
    player.runeDeck = [];
    player.energy = 12;
    player.points = 0;
    player.hasBegun = player.mulliganDone = true;
    player.cardsPlayedThisTurn = 0;
    player.conqueredThisTurn = [];
    player.scoredFieldsThisTurn = [];
    player.runes = ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"].flatMap(
      (domain) =>
        Array.from({ length: 2 }, (_, index) => ({
          id: `practice-rune-${player.id}-${domain}-${index}`,
          domain,
          ready: true,
        })),
    );
  }
  return game;
}

/** Fixed positions are practice setups; every subsequent move uses the real engine. */
export function createTrainingPosition(id: TrainingLessonId): GameState {
  let game = opening();
  if (id === "deploy") game.players[0].hand = ["ogn-049-298"];
  if (id === "movement")
    game.units = [
      unit("practice-mover-a", 0, 4, "ogn-219-298"),
      unit("practice-mover-b", 0, 3, "ogn-175-298"),
    ];
  if (id === "reaction") {
    game.units = [{ ...unit("practice-protected", 0, 5), location: "field:0" }];
    game.fields[0].controller = 0;
    game.currentPlayer = game.priorityPlayer = game.focusPlayer = 1;
    game.players[1].hand = ["ogn-009-298"];
    game.players[0].hand = ["ogn-064-298"];
    const ray = getLegalActions(game, 1).find(
      (action) =>
        action.cardId === "ogn-009-298" &&
        action.targetId === "practice-protected",
    );
    if (!ray) throw new Error("Missing practice Hextech Ray");
    game = applyAction(applyAction(game, ray), "pass");
  }
  if (id === "hidden") {
    game.fields[0].controller = 0;
    game.fields[1].controller = 1;
    game.units = [
      { ...unit("practice-hidden-guard", 0, 5), location: "field:0" },
      {
        ...unit("practice-hidden-target", 1, 5),
        location: "field:0",
        ready: false,
      },
      {
        ...unit("practice-distant-target", 1, 5),
        location: "field:1",
        ready: false,
      },
    ];
    game.hidden = [
      {
        id: "practice-own-hidden",
        cardId: "ogn-097-298",
        owner: 0,
        location: "field:0",
        hiddenTurn: game.turn - 1,
      },
      {
        id: "practice-enemy-hidden",
        cardId: "ogn-199-298",
        owner: 1,
        location: "field:1",
        hiddenTurn: game.turn - 1,
      },
    ];
  }
  if (id === "damage") {
    game.phase = "damage";
    game.fields[0].controller = 1;
    game.units = [
      {
        ...unit("practice-attacker", 0, 8, "ogn-088-298"),
        location: "field:0",
        ready: false,
      },
      {
        ...unit("practice-shielded", 1, 4, "ogn-219-298"),
        location: "field:0",
        ready: false,
        preventDamage: 2,
      },
      {
        ...unit("practice-defender", 1, 3, "ogn-175-298"),
        location: "field:0",
        ready: false,
        damage: 1,
      },
    ];
    game.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      stage: "assign",
      engaged: true,
      designatedUnits: game.units.map((u) => u.id),
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    game.units.forEach((u) => {
      game.combat!.total[u.owner] += getCombatPower(game, u);
    });
    game.combat.remaining = [...game.combat.total];
  }
  if (id === "hold") {
    game.players[0].points = 7;
    game.players[0].scoredFieldsThisTurn = [0];
    game.fields[0].controller = 0;
    game.units = [{ ...unit("practice-holder", 0, 5), location: "field:0" }];
  }
  return game;
}

export function trainingComplete(
  id: TrainingLessonId,
  game: GameState,
): boolean {
  switch (id) {
    case "deploy":
      return (
        game.units.some(
          (u) =>
            u.owner === 0 &&
            u.cardId === "ogn-049-298" &&
            u.location === "base:0",
        ) && !game.players[0].hand.length
      );
    case "movement":
      return (
        ["practice-mover-a", "practice-mover-b"].every((id) =>
          game.units.some(
            (u) => u.id === id && u.location === "field:0" && !u.ready,
          ),
        ) &&
        game.fields[0].controller === 0 &&
        game.players[0].points >= 1 &&
        !game.combat &&
        !game.pendingMove
      );
    case "reaction":
      return (
        !game.stack.length &&
        game.players[0].discard.includes("ogn-064-298") &&
        game.players[1].discard.includes("ogn-009-298") &&
        game.units.some((u) => u.id === "practice-protected" && u.damage === 0)
      );
    case "hidden":
      return (
        !game.hidden?.some((h) => h.id === "practice-own-hidden") &&
        game.units.some(
          (u) =>
            u.cardId === "ogn-097-298" &&
            u.owner === 0 &&
            u.location === "field:0",
        ) &&
        game.units.some(
          (u) => u.id === "practice-hidden-target" && u.temporaryMight === -2,
        ) &&
        !game.stack.length &&
        !game.pendingChoice
      );
    case "damage":
      return (
        !game.combat &&
        !game.units.some(
          (u) => u.id === "practice-shielded" || u.id === "practice-defender",
        ) &&
        game.units.some((u) => u.id === "practice-attacker")
      );
    case "hold":
      return (
        game.winner === 0 &&
        game.players[0].points >= 8 &&
        game.turn >= 7 &&
        game.players[0].scoredFieldsThisTurn.includes(0) &&
        game.fields[0].controller === 0
      );
  }
}

/** Keep the exercise focused while retaining real legal actions, including passing incorrectly. */
export function trainingActions(
  id: TrainingLessonId,
  game: GameState,
): GameAction[] {
  if (trainingComplete(id, game)) return [];
  return getLegalActions(game, 0).filter((action) => {
    if (action.id === "pass") return true;
    if (id === "hold") return action.id === "end-turn";
    if (id === "deploy" || id === "reaction")
      return action.category === "play" && action.sourceId === "hand:0";
    if (id === "movement")
      return (
        action.category === "move" &&
        (!action.locationId || action.locationId === "field:0")
      );
    if (id === "hidden")
      return (
        action.sourceId === "hidden:practice-own-hidden" ||
        (game.pendingChoice?.kind === "trigger" &&
          action.targetId === "practice-hidden-target")
      );
    return action.category === "combat";
  });
}

/** Opponent passes, assigns legal damage, or ends its empty hold-exercise turn. */
function settleOpponent(id: TrainingLessonId, initial: GameState): GameState {
  let game = initial;
  for (
    let step = 0;
    step < 24 && game.priorityPlayer === 1 && game.winner === null;
    step++
  ) {
    const legal = getLegalActions(game, 1);
    const action =
      legal.find((a) => a.id === "pass") ??
      legal.find((a) => a.category === "combat") ??
      (id === "hold" ? legal.find((a) => a.id === "end-turn") : undefined);
    if (!action) break;
    game = applyAction(game, action);
  }
  return game;
}

export function applyTrainingAction(
  id: TrainingLessonId,
  game: GameState,
  actionId: string,
): GameState {
  const action = trainingActions(id, game).find(
    (candidate) => candidate.id === actionId,
  );
  if (!action) throw new Error("Choose one of the available practice moves.");
  return settleOpponent(id, applyAction(game, action));
}

export function trainingPublicPosition(game: GameState) {
  return getGameView(game, 0);
}
