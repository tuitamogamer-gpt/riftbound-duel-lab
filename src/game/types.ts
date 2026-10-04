import type { StarterDeck } from "../data/decks";
export type PlayerId = 0 | 1;
export type TurnStep = "awaken" | "beginning" | "channel" | "draw" | "main";
export type Domain = string;
export type LocationId = "base:0" | "base:1" | "field:0" | "field:1";
export type Phase =
  "mulligan" | "main" | "showdown" | "move" | "damage" | "choice" | "ended";
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
  combatShield?: number;
  stunned: boolean;
  gear: string[];
  token?: boolean;
  summonedTurn: number;
  empowered?: boolean;
  additionalCostPaid?: boolean;
  playedFromHidden?: boolean;
  preventDamage?: number;
  preventNextDamageTurn?: number;
  doubleDamageTurn?: number;
  damageDoublings?: number;
  movesTurn?: number;
  movesThisTurn?: number;
  untargetableByEnemy?: boolean;
  baseMightOverride?: number;
  moveLockedTurn?: number;
  deathReplacementTurn?: number;
  temporary?: boolean;
  temporaryKeywords?: string[];
  usedAbilities?: string[];
}
export interface Gear {
  empowered?: boolean;
  token?: boolean;
  id: string;
  cardId: string;
  owner: PlayerId;
  ready: boolean;
  attachedTo?: string;
  temporary?: boolean;
  usedAbilities?: string[];
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
  spellEnergy?: number;
  showdownEnergy?: number;
  typedPower?: Record<string, number>;
  canLookAtEnemyHiddenTurn?: number;
  spellsPlayedThisTurn?: number;
  power?: number;
  unitsEnterReadyTurn?: number;
  cannotPlaySpellsTurn?: number;
  points: number;
  conqueredThisTurn: number[];
  cardsPlayedThisTurn: number;
  hasBegun: boolean;
  scoredFieldsThisTurn: number[];
  mulliganDone: boolean;
  fatigue: number;
  legendUsedTurn: number;
  legendEmpowered?: boolean;
  xp?: number;
  discardedThisTurn?: number;
  buffBonus?: number;
  firstDeathTurn?: number;
  endReadyRunes?: number;
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
  playOrdinal?: number;
  energySpent?: number;
  id: string;
  player: PlayerId;
  cardId: string;
  sourceId?: string;
  targetId?: string;
  locationId?: LocationId;
  effects: Effect[];
  kind: "spell" | "ability" | "trigger";
  flowed?: boolean;
  fromHidden?: boolean;
  additionalCostPaid?: boolean;
  sourceSnapshot?: Unit;
}
export interface Combat {
  designatedUnits?: string[];
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
  /** Presentation of the turn opening; priority and legality still use phase. */
  turnStep?: TurnStep;
  stagedFields?: LocationId[];
  version: 1;
  unitDiedTurn?: number;
  preventEffectDamageTurn?: number;
  lastExcessDamage?: number;
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
  hidden?: {
    id: string;
    cardId: string;
    owner: PlayerId;
    location: LocationId;
    hiddenTurn: number;
  }[];
  stack: StackItem[];
  resolving?: StackItem[];
  consecutivePasses: number;
  focusPlayer: PlayerId;
  chainStarter: PlayerId | null;
  combat: Combat | null;
  pendingMove: PendingMove | null;
  pendingChoice: {
    player: PlayerId;
    kind:
      | "token"
      | "trigger"
      | "discard"
      | "recycle"
      | "retrieve"
      | "readyRunes"
      | "predict"
      | "sacrifice"
      | "spendBuff"
      | "optional"
      | "move"
      | "custom";
    remaining: number;
    sourceId?: string;
    cardId?: string;
    effects?: Effect[];
    returnPhase: Phase;
    locationId?: LocationId;
    targetId?: string;
    effect?: Effect;
    afterEffects?: Effect[];
    actor?: PlayerId;
    options?: GameAction[];
    sourceSnapshot?: Unit;
    lastDiscardEnergy?: number;
    finalizingTrigger?: boolean;
    chosenRuneIds?: string[];
    cardIndices?: number[];
    returnPriority: PlayerId;
  } | null;
  pendingTurnStart?: PlayerId;
  pendingBeginning?: PlayerId;
  pendingAwaken?: PlayerId;
  pendingEndTurn?: PlayerId;
  pendingCombatFinish?: boolean;
  pendingTriggers?: {
    player: PlayerId;
    cardId: string;
    sourceId: string;
    effects: Effect[];
    locationId?: LocationId;
    sourceSnapshot?: Unit;
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
  effects?: Effect[];
  abilityKey?: string;
  additionalCostPaid?: boolean;
  repeated?: boolean;
  repeatedTargetId?: string;
  repeatedEffects?: Effect[];
}
export type TargetFilter =
  | "twoUnitChoices"
  | "upToOneEnemyUnitHere"
  | "twoUnitsSameBattlefield"
  | "twoFriendlyDifferentLocations"
  | "anyTwoUnits"
  | "orderedTwoUnits"
  | "orderedTwoFriendlyUnits"
  | "attackingUnit"
  | "unitInBase"
  | "spell"
  | "anyUnit"
  | "enemyUnitInBase"
  | "enemyUnit"
  | "enemyAttackingUnit"
  | "friendlyUnit"
  | "friendlyUnitWithoutTemporary"
  | "friendlyBuffableUnit"
  | "enemyGear"
  | "anyGear"
  | "friendlyEquipment"
  | "twoGear"
  | "friendlyDamagedUnit"
  | "friendlyReadyUnit"
  | "friendlyExhaustedUnit"
  | "enemySmallUnit"
  | "friendlyUnitHere"
  | "unitHere"
  | "enemyUnitAtBattlefield"
  | "enemyUnitHere"
  | "unitAtBattlefield"
  | "friendlyUnitAtBattlefield"
  | "duel"
  | "duelSameBattlefield"
  | "duelEnemyAtBattlefield"
  | "friendlyAndEnemyHere"
  | "enemyUnitAndBattlefield"
  | "enemyUnitOrGear"
  | "twoFriendlyUnits"
  | "upToTwoFriendlyUnits"
  | "upToTwoUnits"
  | "unitAndSpell"
  | "unitOrGear"
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
    | "power"
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
    | "duel"
    | "bounce"
    | "temporary"
    | "predict"
    | "sacrifice"
    | "spendBuff"
    | "keyword"
    | "buffBonus"
    | "special";
  amount?: number;
  target?: TargetFilter;
  targetDomain?: string;
  targetLocations?: LocationId[];
  targetEmpowered?: boolean;
  targetDifferentLocationFromSource?: boolean;
  excludeTag?: string;
  lessMightThanSource?: boolean;
  who?: "self" | "opponent" | "all";
  cardName?: string;
  damageSource?: "unit";
  location?: "base" | "target" | "here";
  maxMight?: number;
  maxEnergy?: number;
  maxPower?: number;
  domain?: string;
  permanent?: boolean;
  minMight?: number;
  ready?: boolean;
  chooseRunes?: boolean;
  runeIds?: string[];
  excludeSource?: boolean;
  optional?: boolean;
  keyword?: string;
  effects?: Effect[];
  custom?: string;
  fromHidden?: boolean;
  additionalCostPaid?: boolean;
  chosenTargetId?: string | null;
  condition?: string;
  /** Leading trigger costs are paid while finalizing, before responses. */
  triggerCost?: {
    energy?: number;
    power?: number;
    domain?: string;
    exhaust?: boolean;
    xp?: number;
    recycleCost?: number;
  };
  /** Bulleted modes are chosen before the triggered ability enters the chain. */
  modes?: { label: string; effects: Effect[] }[];
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
  recycleCost?: number;
  spendBuff?: boolean;
  domain?: string;
  condition?: string;
}
export interface CardScript {
  implemented: true;
  uncounterable?: boolean;
  ignoreDeflect?: boolean;
  spellModes?: { label: string; effects: Effect[] }[];
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
  hidden?: boolean;
  ambush?: boolean;
  flow?: {
    energy: number;
    power: number;
    domain?: string;
    condition?: "legion";
    banishAfter?: boolean;
  };
  repeat?: {
    energy?: number;
    power?: number;
    domain?: string;
    discard?: number;
  };
  additionalCost?: {
    energy?: number;
    power?: number;
    domain?: string;
    discard?: number;
    xp?: number;
    energyReduction?: number;
    condition?: "playedSpell";
    enterReady?: boolean;
  };
  equipEnergy?: number;
  combatCondition?: "paired";
  onMove?: Effect[];
  onBegin?: Effect[];
  onEnd?: Effect[];
  onDiscard?: Effect[];
  onDefend?: Effect[];
  notes?: string;
}
export interface GameOptions {
  playerDeckId?: string;
  playerDeck?: StarterDeck;
  botDeck?: StarterDeck;
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
