import { textEffects } from "./text-sources";
import { cardWave25Module } from "./card-wave25";
import { cardWave24Module } from "./card-wave24";
import { cardWave23Module } from "./card-wave23";
import { cardWave22Module } from "./card-wave22";
import { cardWave21Module } from "./card-wave21";
import { cardWave20Module } from "./card-wave20";
import { cardWave19Module } from "./card-wave19";
import { cardWave18Module } from "./card-wave18";
import { cardWave17Module } from "./card-wave17";
import { cardWave16Module } from "./card-wave16";
import { cardWave15Module } from "./card-wave15";
import { cardWave14Module } from "./card-wave14";
import { cardWave13Module } from "./card-wave13";
import { cardWave6Module } from "./card-wave6";
import { cardWave7Module } from "./card-wave7";
import { cardWave8Module } from "./card-wave8";
import { cardWave9Module } from "./card-wave9";
import { originsWave4Module } from "./origins-wave4";
import { cardWave5Module } from "./card-wave5";
import { vendettaWave4Module } from "./vendetta-wave4";
import { unleashedWave4Module } from "./unleashed-wave4";
import { vendettaWave3Module } from "./vendetta-wave3";
import { unleashedWave3Module } from "./unleashed-wave3";
import { originsWave3Module } from "./origins-wave3";
import { unleashedModule } from "./unleashed";
import { spiritforgedModule } from "./spiritforged";
import { vendettaModule } from "./vendetta";
import { originsExtraModule } from "./origins-extra";
import { spiritforgedExtraModule } from "./spiritforged-extra";
import { originsMoreModule } from "./origins-more";
import { vendettaExtraModule } from "./vendetta-extra";
import { unleashedExtraModule } from "./unleashed-extra";
/** Typed extension boundary for explicitly scripted expansion precons. */
import type { Card } from "../data/cards";
import type {
  Effect,
  GameAction,
  GameState,
  LocationId,
  PlayerId,
  StackItem,
  Unit,
} from "./types";
export interface PreconContext {
  abilityInstance?: string;
  bonusDamage?: (s: GameState, p: PlayerId) => number;
  resolvedSpell?: StackItem;
  spellTrashId?: string;
  commitDeaths?: (
    s: GameState,
    ids: string[],
    actor?: PlayerId,
    spellId?: string,
    credited?: string[],
    delayedSpell?: string,
  ) => void;
  takeSpell?: (s: GameState, p: PlayerId, id: string) => void;
  killer?: PlayerId;
  playSource?: "hand" | "champion" | "hidden" | "trash" | "effect";
  abilityEnergyCost?: number;
  readyForbidden?: (s: GameState, owner: PlayerId) => boolean;
  choosingKind?: "spell" | "ability" | "trigger";
  amount?: number;
  empower?: (s: GameState, p: PlayerId, sourceId: string) => void;
  playOrdinal?: number;
  shuffle?: <T>(s: GameState, values: T[]) => T[];
  previousLocation?: LocationId;
  energySpent?: number;
  dyingUnitIds?: string[];
  lastUnit?: Unit;
  baseActions?: GameAction[];
  fromHidden?: boolean;
  paidAdditionalCost?: boolean;
  targetId?: string;
  sourceId?: string;
  locationId?: LocationId;
  runEffects: (
    s: GameState,
    p: PlayerId,
    effects: Effect[],
    targetId?: string,
    sourceId?: string,
    locationId?: LocationId,
  ) => void;
  pay: (
    s: GameState,
    p: PlayerId,
    energy: number,
    power: number,
    domains?: string[],
    anyPower?: number,
  ) => void;
  canPay: (
    s: GameState,
    p: PlayerId,
    energy: number,
    power: number,
    domains?: string[],
    anyPower?: number,
  ) => boolean;
  draw: (s: GameState, p: PlayerId, count: number) => void;
  trigger: (
    s: GameState,
    p: PlayerId,
    cardId: string,
    sourceId: string,
    effects: Effect[],
    locationId?: LocationId,
  ) => void;
  pushStack: (s: GameState, item: Omit<StackItem, "id">) => void;
  spawnToken: (
    s: GameState,
    p: PlayerId,
    name: string,
    location: LocationId,
    ready?: boolean,
  ) => Unit | undefined;
  killUnits: (s: GameState, ids: string[], delayedSpell?: string) => void;
  getMight: (s: GameState, u: Unit, clamp?: boolean) => number;
  canTargetUnit?: (s: GameState, p: PlayerId, u: Unit) => boolean;
  channel: (s: GameState, p: PlayerId, count: number, ready?: boolean) => void;
  moveUnit: (
    s: GameState,
    unit: Unit,
    to: LocationId,
    actor?: PlayerId,
  ) => void;
  cardEvent: (
    s: GameState,
    event: PreconEvent,
    p: PlayerId,
    cardId: string,
    sourceId?: string,
    locationId?: LocationId,
  ) => void;
  killGear: (s: GameState, id: string) => void;
  targetTax?: (s: GameState, p: PlayerId, targetId?: string) => number;
  costFor: (
    s: GameState,
    p: PlayerId,
    card: Card,
    targetId?: string,
  ) => { energy: number; power: number; extraPower: number };
  dealDamage: (
    s: GameState,
    u: Unit,
    amount: number,
    unitDamage?: boolean,
  ) => void;
  playUnit: (
    s: GameState,
    p: PlayerId,
    cardId: string,
    location: LocationId,
    ready?: boolean,
  ) => Unit | undefined;
  discardCards: (s: GameState, p: PlayerId, ids: string[]) => void;
  spellPlayed: (s: GameState, p: PlayerId, cardId: string) => void;
  openChoice: (
    s: GameState,
    p: PlayerId,
    choice: {
      options: GameAction[];
      afterEffects?: Effect[];
      sourceId?: string;
      targetId?: string;
      locationId?: LocationId;
    },
  ) => void;
  log?: (
    s: GameState,
    text: string,
    kind?: "info" | "play" | "combat" | "score" | "turn" | "error",
    player?: PlayerId,
  ) => void;
}
export type PreconEvent =
  | "recycleCards"
  | "recycleRunes"
  | "spellResolved"
  | "reveal"
  | "abilityActivated"
  | "discardBatch"
  | "attack"
  | "spendBuff"
  | "draw"
  | "score"
  | "empower"
  | "hide"
  | "cardFinalized"
  | "play"
  | "unitPlayed"
  | "discard"
  | "move"
  | "beginning"
  | "conquer"
  | "hold"
  | "death"
  | "end"
  | "ready"
  | "target"
  | "stun"
  | "attach"
  | "showdownStart"
  | "combatStart"
  | "combatEnd"
  | "banish"
  | "buff"
  | "main"
  | "bounce"
  | "stateChanged"
  | "spellKill";
export interface ExpansionModule {
  might?: (s: GameState, u: Unit, value: number) => number;
  keywords?: (s: GameState, u: Unit) => string[];
  cost?: (
    s: GameState,
    p: PlayerId,
    card: Card,
    ctx?: PreconContext,
  ) => { energy?: number; power?: number };
  effect?: (
    s: GameState,
    p: PlayerId,
    effect: Effect,
    ctx: PreconContext,
  ) => boolean;
  event?: (
    s: GameState,
    event: PreconEvent,
    p: PlayerId,
    cardId: string,
    sourceId: string | undefined,
    locationId: LocationId | undefined,
    ctx: PreconContext,
  ) => void;
  actions?: (s: GameState, p: PlayerId, ctx: PreconContext) => GameAction[];
  apply?: (s: GameState, action: GameAction, ctx: PreconContext) => boolean;
}
// Read live bindings when invoked: expansion hooks may call core helpers.
function modules(): ExpansionModule[] {
  return [
    spiritforgedModule,
    unleashedModule,
    vendettaModule,
    originsExtraModule,
    spiritforgedExtraModule,
    originsMoreModule,
    vendettaExtraModule,
    unleashedExtraModule,
    vendettaWave3Module,
    unleashedWave3Module,
    originsWave3Module,
    originsWave4Module,
    vendettaWave4Module,
    unleashedWave4Module,
    cardWave5Module,
    cardWave6Module,
    cardWave7Module,
    cardWave8Module,
    cardWave9Module,
    cardWave13Module,
    cardWave14Module,
    cardWave15Module,
    cardWave16Module,
    cardWave17Module,
    cardWave18Module,
    cardWave19Module,
    cardWave20Module,
    cardWave21Module,
    cardWave22Module,
    cardWave23Module,
    cardWave24Module,
    cardWave25Module,
  ];
}
export function laterMight(s: GameState, u: Unit, value: number) {
  return modules().reduce((n, m) => m.might?.(s, u, n) ?? n, value);
}
export function laterKeywords(s: GameState, u: Unit) {
  return modules().flatMap((m) => m.keywords?.(s, u) ?? []);
}
/** Cost adjustments are signed deltas, clamped by the core payment pipeline. */
export function laterCost(
  s: GameState,
  p: PlayerId,
  card: Card,
  ctx?: PreconContext,
) {
  return modules().reduce(
    (sum, m) => {
      const cost = m.cost?.(s, p, card, ctx);
      return {
        energy: sum.energy + (cost?.energy ?? 0),
        power: sum.power + (cost?.power ?? 0),
      };
    },
    { energy: 0, power: 0 },
  );
}
export function runLaterEffect(
  s: GameState,
  p: PlayerId,
  e: Effect,
  ctx: PreconContext,
) {
  if (e.abilityInstance) {
    const base = ctx,
      instance = { id: ctx.sourceId ?? "", abilityInstance: e.abilityInstance };
    ctx = {
      ...ctx,
      abilityInstance: e.abilityInstance,
      runEffects: (state, player, effects, ...rest) =>
        base.runEffects(state, player, textEffects(instance, effects), ...rest),
      openChoice: (state, player, choice) =>
        base.openChoice(state, player, {
          ...choice,
          options: choice.options?.map((a) => ({
            ...a,
            effects: a.effects ? textEffects(instance, a.effects) : a.effects,
          })),
        }),
    };
  }
  return modules().some((m) => m.effect?.(s, p, e, ctx));
}
export function laterCardEvent(
  s: GameState,
  event: PreconEvent,
  p: PlayerId,
  cardId: string,
  sourceId: string | undefined,
  locationId: LocationId | undefined,
  ctx: PreconContext,
) {
  for (const m of modules())
    m.event?.(s, event, p, cardId, sourceId, locationId, ctx);
}
export function getLaterActions(s: GameState, p: PlayerId, ctx: PreconContext) {
  return modules().flatMap((m) => m.actions?.(s, p, ctx) ?? []);
}
export function applyLaterAction(
  s: GameState,
  action: GameAction,
  ctx: PreconContext,
) {
  return modules().some((m) => m.apply?.(s, action, ctx));
}
