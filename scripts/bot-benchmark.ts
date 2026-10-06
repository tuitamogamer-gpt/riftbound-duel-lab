/** npx vite-node scripts/bot-benchmark.ts [pairs-per-comparison] [output.json] */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { cpus } from "node:os";
import { applyAction, createGame } from "../src/game/engine";
import { decideBot } from "../src/game/bot";
import { getReferenceAction } from "../src/game/bot-reference";
import {
  getObservation,
  observationRulesView,
} from "../src/game/ai/observation";
import {
  BOT_VERSION,
  DIFFICULTIES,
  type Difficulty,
} from "../src/game/ai/config";
import type { GameState, PlayerId } from "../src/game/types";
const pairs = Math.max(1, Number(process.argv[2] ?? 6));
const output = process.argv[3] ?? "test-results/bot-benchmark.json";
mkdirSync(dirname(output), { recursive: true });
const comparisons: [Difficulty, Difficulty | "reference"][] = [
  ["beginner", "reference"],
  ["normal", "beginner"],
  ["hard", "normal"],
  ["expert", "hard"],
];
const deckPairs = [
  ["annie", "lux"],
  ["garen", "master-yi"],
  ["lux", "garen"],
];
const report: any = {
  configVersion: BOT_VERSION,
  configuration: DIFFICULTIES,
  matchConfig: createGame({ seed: 1201 }).matchConfig,
  generatedAt: new Date().toISOString(),
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cpu: cpus()[0]?.model,
  },
  pairsPerComparison: pairs,
  deterministicNodes: true,
  comparisons: [],
};
function stateKey(s: GameState) {
  return JSON.stringify({ ...s, log: [], nextId: 0, revision: 0 });
}
for (const [strong, weak] of comparisons.filter(
  ([level]) => !process.argv[4] || process.argv[4] === level,
)) {
  const record: any = {
    strong,
    weak,
    wins: { strong: 0, weak: 0 },
    games: [],
    illegal: 0,
    blocked: 0,
    fallbackDecisions: 0,
    decisions: 0,
    timings: [],
    levels: {},
  };
  for (let pair = 0; pair < pairs; pair++)
    for (let side = 0; side < 2; side++) {
      const [left, right] = deckPairs[pair % deckPairs.length],
        seed = 1201 + pair * 31;
      const firstPlayer = (pair % 2) as PlayerId;
      let s = createGame({
        playerDeckId: left,
        botDeckId: right,
        seed,
        firstPlayer,
      });
      const labels = side === 0 ? [strong, weak] : [weak, strong];
      const seen = new Set<string>();
      let steps = 0,
        error = "";
      try {
        while (s.winner === null && steps < 1800) {
          const key = stateKey(s);
          if (seen.has(key)) throw new Error(`Repeated state in ${s.phase}`);
          seen.add(key);
          const actor = s.priorityPlayer,
            level = labels[actor];
          let action;
          if (level === "reference")
            action = getReferenceAction(
              observationRulesView(getObservation(s, actor)),
              actor,
            );
          else {
            const started = performance.now();
            const result = decideBot(s, actor, {
              difficulty: level as Difficulty,
              seed: 701 + pair,
              deterministic: true,
            });
            if (!result) throw new Error("No bot decision");
            action = result.action;
            const duration = performance.now() - started;
            record.timings.push(duration);
            const levelMetrics = (record.levels[level] ??= {
              decisions: 0,
              fallbackDecisions: 0,
              timings: [],
              sampledDecisions: 0,
              maxDepth: 0,
            });
            levelMetrics.decisions++;
            levelMetrics.timings.push(duration);
            if (result.trace.usedFallback) levelMetrics.fallbackDecisions++;
            if (result.trace.sampleCount > 1) levelMetrics.sampledDecisions++;
            levelMetrics.maxDepth = Math.max(
              levelMetrics.maxDepth,
              result.trace.completedDepth,
            );
            record.decisions++;
            if (result.trace.usedFallback) record.fallbackDecisions++;
          }
          if (!action) throw new Error("No legal option");
          s = applyAction(s, action);
          steps++;
        }
        if (s.winner === null) throw new Error("Action cap reached");
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        if (/illegal|rejected/i.test(error)) record.illegal++;
        else record.blocked++;
      }
      if (s.winner !== null)
        record.wins[labels[s.winner] === strong ? "strong" : "weak"]++;
      record.games.push({
        pair,
        side,
        decks: [left, right],
        seed,
        firstPlayer,
        winner: s.winner === null ? null : labels[s.winner],
        score: s.players.map((p) => p.points),
        turn: s.turn,
        decisions: steps,
        ...(error ? { error } : {}),
      });
      console.log(
        `${strong}/${weak} pair ${pair + 1}/${pairs} side ${side}: ${s.winner === null ? error : labels[s.winner]} · ${steps} decisions`,
      );
    }
  function summarize(times: number[]) {
    const timings = times.sort((a, b) => a - b);
    return {
      mean: timings.reduce((a: number, b: number) => a + b, 0) / timings.length,
      p50: timings[Math.floor(timings.length * 0.5)],
      p95: timings[Math.floor(timings.length * 0.95)],
      p99: timings[Math.floor(timings.length * 0.99)],
      max: timings.at(-1),
    };
  }
  record.timingMs = summarize(record.timings);
  for (const level of Object.values(record.levels) as any[]) {
    level.timingMs = summarize(level.timings);
    delete level.timings;
  }
  delete record.timings;
  report.comparisons.push(record);
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
}
