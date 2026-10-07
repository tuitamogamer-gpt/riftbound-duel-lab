import { emitGameEvent } from "./engine";
import { getCard } from "../data/cards";
import { physicalCard, physicalOwner, detach } from "./objects";
import { recycleCards, recycleRunes } from "./zone-events";
import { choices, option } from "./card-wave16";
import { getKeywords } from "./engine";
import type {
  CardScript,
  Effect,
  GameState,
  PlayerId,
  LocationId,
} from "./types";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";
const plain: CardScript = { implemented: true };
const fx = (key: string, rest: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `wave24:${key}`,
  ...rest,
});
export const cardWave24Scripts: Record<string, CardScript> = {
  "ogn-041-298": {
    ...plain,
    deflect: 2,
    keywords: ["Deflect"],
    onAttack: [{ type: "special", custom: "draft:volibear" }],
  },
  "ogn-248-298": {
    ...plain,
    spell: [{ type: "special", custom: "draft:rain" }],
  },
  "ogn-244-298": { ...plain, spell: [fx("judgment")] },
  "unl-192-219": {
    ...plain,
    action: true,
    spell: [{ type: "special", custom: "draft:alpha" }],
  },
  "unl-202-219": {
    ...plain,
    spell: [{ type: "special", custom: "draft:void" }],
  },
  "unl-182-219": {
    ...plain,
    repeatCosts: [{ energy: 1 }, { power: 1 }, { energy: 1, power: 1 }],
    spell: [{ type: "special", custom: "draft:curtain" }],
  },
};
type Split = {
  targets: string[];
  amount: number;
  alloc: Record<string, number>;
  unit?: string;
  source?: string;
};
function splitChoice(
  s: GameState,
  p: PlayerId,
  data: Split,
  ctx: PreconContext,
) {
  if (!data.targets.length || !data.amount) return;
  if (data.targets.length > data.amount) {
    choices(
      s,
      p,
      ctx,
      data.targets.map((id) =>
        option(
          p,
          `split:drop:${id}`,
          `Remove ${getCard(s.units.find((u) => u.id === id)!.cardId).name} from the targets`,
          [
            fx("split-continue", {
              keyword: JSON.stringify({
                ...data,
                targets: data.targets.filter((x) => x !== id),
              }),
            }),
          ],
        ),
      ),
    );
    return;
  }
  const id = data.targets.find((id) => data.alloc[id] === undefined);
  if (id) {
    const left =
        data.amount - Object.values(data.alloc).reduce((n, x) => n + x, 0),
      remaining =
        data.targets.filter((x) => data.alloc[x] === undefined).length - 1;
    choices(
      s,
      p,
      ctx,
      Array.from({ length: left - remaining }, (_, i) => i + 1)
        .filter((n) => remaining > 0 || n === left)
        .map((n) =>
          option(
            p,
            `split:assign:${id}:${n}`,
            `${getCard(s.units.find((u) => u.id === id)!.cardId).name}: ${n} damage`,
            [
              fx("split-continue", {
                keyword: JSON.stringify({
                  ...data,
                  alloc: { ...data.alloc, [id]: n },
                }),
              }),
            ],
          ),
        ),
    );
    return;
  }
  if (data.unit)
    (s.splitXPWatches ??= []).push({
      spellId: s.resolving?.at(-1)?.id ?? "",
      player: p,
      ids: data.targets,
    });
  for (const [id, amount] of Object.entries(data.alloc)) {
    const u = s.units.find((u) => u.id === id);
    if (u) ctx.dealDamage(s, u, amount, !!data.unit);
  }
}
type Judgment = {
  step: number;
  chosen: string[][];
  current: string[];
  actor: PlayerId;
};
function judgmentChoices(s: GameState, data: Judgment, ctx: PreconContext) {
  if (data.step === 8) {
    const keep = new Set(data.chosen.flat());
    const recycled: [string[], string[]] = [[], []];
    for (const u of [...s.units])
      if (!keep.has(u.id)) {
        const owner = physicalOwner(u),
          id = physicalCard(u);
        for (const g of s.gears.filter((g) => g.attachedTo === u.id))
          detach(s, g);
        s.units = s.units.filter((v) => v.id !== u.id);
        s.gears = s.gears.filter((g) => g.id !== u.id);
        if (!u.token) recycled[owner].push(id);
      }
    for (const g of [...s.gears])
      if (!keep.has(g.id)) {
        detach(s, g);
        s.gears = s.gears.filter((v) => v.id !== g.id);
        if (!g.token) recycled[physicalOwner(g)].push(physicalCard(g));
      }
    for (const x of s.players) {
      const runes = x.runes.filter((r) => !keep.has(r.id));
      x.runes = x.runes.filter((r) => keep.has(r.id));
      recycleRunes(
        s,
        x.id,
        runes.map((r) => r.domain),
        data.actor,
      );
      const rest = x.hand.filter((_, i) => !keep.has(`hand:${x.id}:${i}`));
      x.hand = x.hand.filter((_, i) => keep.has(`hand:${x.id}:${i}`));
      recycled[x.id].push(...rest);
    }
    for (const owner of [0, 1] as const)
      s.players[owner].deck.push(
        ...(ctx.shuffle?.(s, recycled[owner]) ?? recycled[owner]),
      );
    const all = recycled.flat();
    if (all.length)
      emitGameEvent(
        s,
        "recycleCards",
        data.actor,
        all[0],
        undefined,
        undefined,
        { amount: all.length },
      );
    return;
  }
  const p = (data.step < 4 ? s.currentPlayer : 1 - s.currentPlayer) as PlayerId,
    kind = data.step % 4,
    x = s.players[p];
  const objects =
    kind === 0
      ? s.units
          .filter((u) => u.owner === p)
          .map((u) => ({ id: u.id, label: getCard(u.cardId).name }))
      : kind === 1
        ? s.gears
            .filter((g) => g.owner === p)
            .map((g) => ({ id: g.id, label: getCard(g.cardId).name }))
        : kind === 2
          ? x.runes.map((r) => ({ id: r.id, label: `${r.domain} rune` }))
          : x.hand.map((id, i) => ({
              id: `hand:${p}:${i}`,
              label: getCard(id).name,
            }));
  if (objects.length <= 2 || data.current.length === 2) {
    judgmentChoices(
      s,
      {
        ...data,
        step: data.step + 1,
        current: [],
        chosen: [
          ...data.chosen,
          objects.length <= 2 ? objects.map((o) => o.id) : data.current,
        ],
      },
      ctx,
    );
    return;
  }
  choices(
    s,
    p,
    ctx,
    objects
      .filter((o) => !data.current.includes(o.id))
      .map((o) =>
        option(
          p,
          `judgment:${o.id}`,
          `Keep ${o.label} (${data.current.length + 1}/2)`,
          [
            fx("judgment", {
              keyword: JSON.stringify({
                ...data,
                current: [...data.current, o.id],
              }),
            }),
          ],
        ),
      ),
  );
}
export const cardWave24Module: ExpansionModule = {
  event(s, name, _p, _cardId, sourceId, _location, ctx) {
    if (name === "death")
      for (const w of s.splitXPWatches ?? [])
        if (w.ids.includes(sourceId!)) {
          w.ids = w.ids.filter((id) => id !== sourceId);
          ctx.trigger(s, w.player, "unl-192-219", `alpha:${w.spellId}`, [
            { type: "special", custom: "unl:xp", amount: 1 },
          ]);
        }
    if (name === "spellResolved")
      s.splitXPWatches = s.splitXPWatches?.filter(
        (w) => w.spellId !== ctx.resolvedSpell?.id,
      );
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("wave24:")) return false;
    switch (e.custom.slice(7)) {
      case "alpha-source":
        break;
      case "split": {
        const source = e.cardName
          ? s.units.find((u) => u.id === e.cardName && u.owner === p)
          : undefined;
        if (e.cardName && !source) break;
        const total = source
          ? ctx.getMight(s, source)
          : (e.amount ?? 5) + (ctx.bonusDamage?.(s, p) ?? 0);
        splitChoice(
          s,
          p,
          {
            targets: (ctx.targetId ?? "").split("~").filter(Boolean),
            amount: total,
            alloc: {},
            unit: source?.id,
            source: ctx.sourceId,
          },
          ctx,
        );
        break;
      }
      case "split-continue":
        splitChoice(s, p, JSON.parse(e.keyword!), ctx);
        break;
      case "move": {
        const u = s.units.find((u) => u.id === ctx.targetId),
          to = e.keyword as LocationId;
        if (
          u &&
          to &&
          (e.who === "self" ? u.owner === p : u.owner !== p) &&
          ctx.canTargetUnit?.(s, p, u) &&
          (!to.startsWith("base:") ||
            !getKeywords(s, u).includes("Cannot move to base"))
        )
          ctx.moveUnit(s, u, to, p);
        break;
      }
      case "judgment":
        judgmentChoices(
          s,
          e.keyword
            ? JSON.parse(e.keyword)
            : { step: 0, chosen: [], current: [], actor: p },
          ctx,
        );
        break;
    }
    return true;
  },
};
