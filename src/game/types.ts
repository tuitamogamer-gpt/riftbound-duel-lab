export type PlayerId = 0 | 1;
export type Domain = string;
export type LocationId = "base:0" | "base:1" | "field:0" | "field:1";
export type Phase =
  | "mulligan"
  | "main"
  | "showdown"
  | "move"
  | "damage"
  | "choice"
  | "ended";
export interface Rune {
  id: string;
  domain: Domain;
  ready: boolean;
}
export interface Unit {
  id: string;
  cardId: string;
  owner: PlayerId;
  location: LocationId;
  ready: boolean;
  damage: number;
  buff: number;
  temporaryMight: number;
  temporaryAssault: number;
  stunned: boolean;
  gear: string[];
  token?: boolean;
  summonedTurn: number;
}
export interface Gear {
  id: string;
  cardId: string;
  owner: PlayerId;
  ready: boolean;
  attachedTo?: string;
}
export interface PlayerState {
  id: PlayerId;
  name: string;
  deckId: string;
  legendId: string;
  championId: string;
  championAvailable: boolean;
  deck: string[];
  hand: string[];
  discard: string[];
  banished: string[];
  runes: Rune[];
  runeDeck: Domain[];
  energy: number;
  points: number;
  conqueredThisTurn: number[];
  cardsPlayedThisTurn: number;
  hasBegun: boolean;
  scoredFieldsThisTurn: number[];
  mulliganDone: boolean;
  fatigue: number;
  legendUsedTurn: number;
}
export interface Battlefield {
  id: LocationId;
  cardId: string;
  controller: PlayerId | null;
}
export interface LogEntry {
  id: number;
  turn: number;
  player?: PlayerId;
  text: string;
  kind: "info" | "play" | "combat" | "score" | "turn" | "error";
}
export interface PendingMove {
  player: PlayerId;
  from: LocationId;
  to: LocationId;
  unitIds: string[];
}
export interface StackItem {
  id: string;
  player: PlayerId;
  cardId: string;
  sourceId?: string;
  targetId?: string;
  locationId?: LocationId;
  effects: Effect[];
  kind: "spell" | "ability" | "trigger";
}
export interface Combat {
  fieldId: LocationId;
  attacker: PlayerId;
  defender: PlayerId;
  stage: "priority" | "assign";
  engaged?: boolean;
  total: [number, number];
  remaining: [number, number];
  assignments: [Record<string, number>, Record<string, number>];
  assigningPlayer: PlayerId;
}
export interface GameState {
  version: 1;
  seed: number;
  rng: number;
  turn: number;
  currentPlayer: PlayerId;
  priorityPlayer: PlayerId;
  phase: Phase;
  players: [PlayerState, PlayerState];
  fields: [Battlefield, Battlefield];
  units: Unit[];
  gears: Gear[];
  stack: StackItem[];
  consecutivePasses: number;
  focusPlayer: PlayerId;
  chainStarter: PlayerId | null;
  combat: Combat | null;
  pendingMove: PendingMove | null;
  pendingChoice: {
    player: PlayerId;
    kind: "token" | "trigger";
    remaining: number;
    sourceId?: string;
    cardId?: string;
    effects?: Effect[];
    returnPhase: Phase;
    returnPriority: PlayerId;
  } | null;
  pendingTurnStart?: PlayerId;
  pendingEndTurn?: PlayerId;
  pendingCombatFinish?: boolean;
  pendingTriggers?: {
    player: PlayerId;
    cardId: string;
    sourceId: string;
    effects: Effect[];
    locationId?: LocationId;
  }[];
  winner: PlayerId | null;
  log: LogEntry[];
  nextId: number;
}
export type ActionCategory =
  | "mulligan"
  | "play"
  | "move"
  | "combat"
  | "ability"
  | "pass"
  | "end"
  | "resource";
export interface GameAction {
  id: string;
  label: string;
  category: ActionCategory;
  player: PlayerId;
  sourceId?: string;
  cardId?: string;
  targetId?: string;
  locationId?: LocationId;
  amount?: number;
  cardIndices?: number[];
  unitIds?: string[];
  detail?: string;
}
export type TargetFilter =
  | "anyUnit"
  | "enemyUnit"
  | "friendlyUnit"
  | "friendlyBuffableUnit"
  | "enemyGear"
  | "anyGear"
  | "friendlyDamagedUnit"
  | "friendlyReadyUnit"
  | "friendlyExhaustedUnit"
  | "enemySmallUnit"
  | "friendlyUnitHere"
  | "enemyUnitHere"
  | "unitAtBattlefield"
  | "friendlyUnitAtBattlefield"
  | "duel"
  | "battlefield";
export type Effect = {
  type:
    | "draw"
    | "damage"
    | "heal"
    | "buff"
    | "might"
    | "kill"
    | "recall"
    | "stun"
    | "ready"
    | "readyRunes"
    | "exhaust"
    | "token"
    | "channel"
    | "energy"
    | "recycle"
    | "discard"
    | "drawDiscard"
    | "damageAll"
    | "mightAll"
    | "buffAll"
    | "healAll"
    | "counter"
    | "moveTarget"
    | "equip"
    | "mill"
    | "score"
    | "retrieve"
    | "assault"
    | "duel";
  amount?: number;
  target?: TargetFilter;
  who?: "self" | "opponent" | "all";
  cardName?: string;
  location?: "base" | "target" | "here";
  maxMight?: number;
  domain?: string;
  permanent?: boolean;
  condition?: string;
};
export interface ActivatedAbility {
  label: string;
  effects: Effect[];
  energy?: number;
  power?: number;
  exhaust?: boolean;
  recycleRune?: boolean;
  oncePerTurn?: boolean;
  timing?: "main" | "action" | "reaction";
}
export interface CardScript {
  implemented: true;
  spell?: Effect[];
  onPlay?: Effect[];
  onDeath?: Effect[];
  onAttack?: Effect[];
  onConquer?: Effect[];
  onHold?: Effect[];
  abilities?: ActivatedAbility[];
  keywords?: string[];
  assault?: number;
  shield?: number;
  deflect?: number;
  gearMight?: number;
  equipCost?: number;
  action?: boolean;
  reaction?: boolean;
  accelerating?: boolean;
  bonusDraw?: number;
  notes?: string;
}
export interface GameOptions {
  playerDeckId?: string;
  botDeckId?: string;
  seed?: number;
  firstPlayer?: PlayerId;
}
export interface PublicGameView extends Omit<GameState, "players"> {
  players: [
    Omit<PlayerState, "hand" | "deck" | "runeDeck"> & {
      hand: string[];
      deck: string[];
      runeDeck: string[];
      handCount: number;
      deckCount: number;
    },
    Omit<PlayerState, "hand" | "deck" | "runeDeck"> & {
      hand: string[];
      deck: string[];
      runeDeck: string[];
      handCount: number;
      deckCount: number;
    },
  ];
}
