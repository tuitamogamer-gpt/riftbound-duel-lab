import type { StarterDeck } from "../data/decks";
import type { PublicHandReveal } from "./hand-reveals";
export type PlayerId = 0 | 1;
export type TurnStep = "awaken" | "beginning" | "channel" | "draw" | "main";
export type Domain = string;
export type LocationId =
  "base:0" | "base:1" | "field:0" | "field:1" | "field:2";
export type Phase =
  "mulligan" | "main" | "showdown" | "move" | "damage" | "choice" | "ended";
export interface Rune {
  id: string;
  domain: Domain;
  ready: boolean;
}
export interface Unit {
  abilityInstance?: string;
  spellDamageId?: string;
  tokenCopiesTurn?: number;
  damageByPlayer?: [number, number];
  grantedTags?: { sourceId: string; tag: string }[];
  conqueredTurn?: number;
  banishOnDeathTurn?: number;
  armoryTurn?: number;
  originalOwner?: PlayerId;
  originalCardId?: string;
  copyEffects?: { sourceId: string; cardId: string }[];
  addedTag?: string;
  recallOnConquerTurn?: number;
  namedSpell?: string;
  damageTakenTurn?: number;
  deathTrashId?: string;
  empowerCount?: number;
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
  originalOwner?: PlayerId;
  originalCardId?: string;
  copiedText?: string;
  copiedTokenTurn?: number;
  namedTag?: string;
  attachedTurn?: number;
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
  repeatGrants?: { turn: number }[];
  banishedCards?: { id: string; cardId: string }[];
  gearPlayPermissions?: { id: string; turn: number }[];
  enemyChoices?: { turn: number; count: number };
  gearPower?: number;
  firstGearAbilityTurn?: number;
  equipmentPlayedTurn?: number;
  nextSpellBonus?: number;
  nextMainPower?: number;
  nextCardEnergyDiscount?: number;
  nextCardPowerDiscount?: number;
  powerSpentThisTurn?: number;
  freeHideTurn?: number;
  firstGearPlayedTurn?: number;
  grantedFlow?: { trashId: string; turn: number }[];
  /** Unordered registered lists, never the remaining deck order. */
  deckList?: string[];
  runeList?: Domain[];
  id: PlayerId;
  name: string;
  deckId: string;
  legendId: string;
  championId: string;
  championAvailable: boolean;
  deck: string[];
  hand: string[];
  discard: string[];
  trashCards?: { id: string; cardId: string }[];
  banished: string[];
  runes: Rune[];
  runeDeck: Domain[];
  energy: number;
  spellEnergy?: number;
  spellPower?: number;
  unitEnergy?: number;
  showdownEnergy?: number;
  typedPower?: Record<string, number>;
  canLookAtEnemyHiddenTurn?: number;
  spellsPlayedThisTurn?: number;
  power?: number;
  unitsEnterReadyTurn?: number;
  cannotPlaySpellsTurn?: number;
  cannotPlayCardsTurn?: number;
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
  replacedCardId?: string;
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
  declaration?: Pick<GameAction, "repeated" | "repeatMask">;
  killedUnits?: number;
  grenadeHits?: number;
  replayRequests?: { player: PlayerId; grenade?: boolean }[];
  originalOwner?: PlayerId;
  recycleOnLeave?: boolean;
  spellBonusDamage?: number;
  abilityEnergyCost?: number;
  playSource?: "hand" | "champion" | "hidden" | "trash" | "effect";
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
  grantedFlow?: boolean;
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
export interface CardPlaySpec {
  orderGroup?: string;
  grenadeHits?: number;
  zoneOwner?: PlayerId;
  controller?: PlayerId;
  ignoreAllCosts?: boolean;
  stunAfterPlay?: boolean;
  hiddenOnly?: boolean;
  empowerAfterPlay?: boolean;
  zone: "hand" | "trash" | "top" | "banished" | "blink";
  optional?: boolean;
  cardTypes?: string[];
  cardTags?: string[];
  maxEnergy?: number;
  maxPower?: number;
  maxMight?: number;
  count?: number;
  untilUnit?: boolean;
  ignoreCost?: boolean;
  ignoreEnergy?: boolean;
  energyReduction?: number;
  powerOverride?: number;
  destination?:
    "normal" | "base" | "here" | "controlledBattlefield" | "anyBattlefield";
  alternativeHere?: boolean;
  recycleOnLeave?: boolean;
  unplayedToHand?: boolean;
  attachToSource?: boolean;
  revealed?: boolean;
  /** A public physical trash visit or a linked banishment entry. */
  sourceRef?: string;
  sourceId?: string;
  locationId?: LocationId;
}
export interface PendingCardPlay {
  id: string;
  cardId: string;
  player: PlayerId;
  returnZone: "hand" | "trash" | "banished";
  returnIndex: number;
  spec: CardPlaySpec;
}
export interface GameState {
  /** Last historical public hand reveal, stored separately from current hands. */
  publicReveals?: PublicHandReveal;
  selectedInspections?: {
    id: string;
    owner: PlayerId;
    positions: number[];
    chosen: number;
    used: string[];
    effect: Effect;
  }[];
  tokenCopyChoices?: {
    player: PlayerId;
    original: string;
    name: string;
    location: LocationId;
    ready: boolean;
    sources: string[];
  }[];
  tokenCopyLinks?: { original: string; copy: string }[];
  splitXPWatches?: { spellId: string; player: PlayerId; ids: string[] }[];
  linkedBanishments?: { sourceId: string; owner: PlayerId; ref: string }[];
  deathBatches?: {
    delayedSpell?: string;
    spellId?: string;
    credited?: string[];
    id: string;
    ids: string[];
    used: string[];
    declined: string[];
    actor?: PlayerId;
    combat: boolean;
  }[];
  pendingCombatDamage?: {
    preview: import("./engine").CombatPreview;
    hits: import("./engine").CombatHit[];
  };
  controlEffects?: {
    id: string;
    previous: PlayerId;
    sourceId?: string;
    endTurn?: number;
  }[];
  heldBanishments?: { id: string; cardId: string; owner: PlayerId }[];
  extraTurns?: PlayerId[];
  endDisempowers?: { id: string; player: PlayerId; turn: number }[];
  pendingPlays?: PendingCardPlay[];
  damageTriggers?: {
    player: PlayerId;
    cardId: string;
    turn: number;
    targetId?: string;
  }[];
  revision?: number;
  matchConfig?: {
    formatId: string;
    rulesVersion: string;
    cardDataVersion: string;
    supportedCardIds: string[];
    openDecklists: boolean;
  };
  botSettings?: {
    difficulty: "beginner" | "normal" | "hard" | "expert";
    seed: number;
  };
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
  fields: Battlefield[];
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
  resolvingAbilities?: StackItem[];
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
      | "trashTargets"
      | "boardTargets"
      | "custom"
      | "effectPlay"
      | "effectDraft"
      | "costTargets";
    effectDraft?: {
      retargetId?: string;
      action: GameAction;
      trigger?: Omit<StackItem, "id" | "kind">;
      steps: {
        effects?: Effect[];
        modes?: { label: string; effects: Effect[] }[];
      }[];
      chosen: Effect[][];
      targets: string[];
      modes: number[];
      selected: string[];
      activeMode?: number;
    };
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
    lastDiscardType?: string;
    discardBatchCount?: number;
    discardBatchCardId?: string;
    finalizingTrigger?: boolean;
    chosenRuneIds?: string[];
    cardIndices?: number[];
    trashSelection?: {
      selected: string[];
      action: GameAction;
      trigger?: Omit<StackItem, "id" | "kind">;
    };
    boardSelection?: {
      selected: string[];
      action?: GameAction;
      trigger?: Omit<StackItem, "id" | "kind">;
      /** Resolution may only retain the originally declared objects. */
      allowedIds?: string[];
      destination?: LocationId;
    };
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
  draftFinalized?: boolean;
  repeatMask?: number;
  flexibleEnergy?: number;
  optionalEnergy?: number;
  namedTag?: string;
  dragonRoost?: LocationId;
  /** A permutation of existing runes, consumed by the shared payment resolver. */
  paymentRuneOrder?: string[];
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
  /** Board object paid as an additional cost; it is not an effect target. */
  costSourceId?: string;
  costsFinalized?: boolean;
  additionalCostPaid?: boolean;
  targetsFinalized?: boolean;
  repeated?: boolean;
  repeatedTargetId?: string;
  repeatedEffects?: Effect[];
}
export type TargetFilter =
  | "relentlessMove"
  | "shurikenMove"
  | "friendlyAndEnemyBattlefield"
  | "enemyMoveDestination"
  | "empowerObject"
  | "enemyAndOptionalFriendly"
  | "friendlyAndOptionalEnemy"
  | "boardCards"
  | "enemyChainItemChoosingFriendly"
  | "friendlyUnitAndEnemyChainItem"
  | "unitAndEquipment"
  | "ownTeemo"
  | "exhaustedOther"
  | "trashCards"
  | "upToThreeUnitsSameLocation"
  | "upToFourFriendlyUnits"
  | "friendlyAndWeakerEnemy"
  | "friendlyUnitThreatenedByFury"
  | "friendlyBaseAndBattlefield"
  | "friendlyUnitAndBattlefield"
  | "friendlyUnitAndBaseMove"
  | "enemyUnitAndOccupiedLocation"
  | "enemyHereAndDifferentBattlefield"
  | "friendlyBattlefieldAndOptionalEnemy"
  | "battlefieldUnitAndOptionalOther"
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
  abilityInstance?: string;
  lookCount?: number;
  lookCursor?: number;
  inspectionComplete?: boolean;
  inspectionReplacements?: string[];
  chosenLocations?: Record<string, LocationId>;
  type:
    | "playCard"
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
  play?: CardPlaySpec;
  amount?: number;
  target?: TargetFilter;
  cardTypes?: string[];
  cardTags?: string[];
  targetCount?: number;
  upTo?: boolean;
  group?: {
    distinctLocations?: boolean;
    sameLocation?: boolean;
    totalMight?: number;
    tokensOnly?: boolean;
    atBattlefield?: boolean;
    here?: boolean;
    destination?: "any" | "here" | "base" | "open";
  };
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
    discard?: number;
    board?: "killUnitHere" | "returnUnitHere" | "disempower" | "killThree";
    energy?: number;
    power?: number;
    domain?: string;
    exhaust?: boolean;
    xp?: number;
    recycleCost?: number;
    recycleSelf?: boolean;
    sacrificeSelf?: boolean;
    trashId?: string;
  };
  /** Bulleted modes are chosen before the triggered ability enters the chain. */
  modes?: { label: string; effects: Effect[] }[];
};
export interface ActivatedAbility {
  instanceKey?: string;
  banishSelf?: boolean;
  discard?: number;
  sacrificeSelf?: boolean;
  disempowerSelf?: boolean;
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
  cardTypes?: string[];
  asPlayTag?: "any" | "tribe";
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
  /** Rules in the Equipment panel belong to the attached unit. */
  equipment?: {
    onDeath?: Effect[];
    text: string;
    keywords?: string[];
    /** Continuous keyword grants to friendly units at the wielder's location. */
    nearbyKeywords?: string[];
    shield?: number;
    attachedTurnMight?: number;
    onAttack?: Effect[];
    onDefend?: Effect[];
    onConquer?: Effect[];
    onHold?: Effect[];
    onMove?: Effect[];
  };
  equipCost?: number;
  equipRecycle?: number;
  equipKillUnit?: boolean;
  equipXP?: number;
  equipAnyPower?: boolean;
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
  repeatCosts?: {
    energy?: number;
    power?: number;
    domain?: string;
    discard?: number;
  }[];
  repeat?: {
    energy?: number;
    power?: number;
    domain?: string;
    discard?: number;
  };
  additionalCost?: {
    exhaustLegend?: boolean;
    required?: boolean;
    ignoreBaseCost?: boolean;
    board?: {
      multiple?: boolean;
      tags?: string[];
      discount?: "energyPower" | "powerEach";
      allowCostLocation?: boolean;
      kind: "spendBuff" | "killUnit" | "killGear" | "returnGear";
      minMight?: number;
    };
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
  botDifficulty?: "beginner" | "normal" | "hard" | "expert";
  botSeed?: number;
  openDecklists?: boolean;
  playerDeckId?: string;
  playerDeck?: StarterDeck;
  botDeck?: StarterDeck;
  botDeckId?: string;
  playerBattlefieldId?: string;
  botBattlefieldId?: string;
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
