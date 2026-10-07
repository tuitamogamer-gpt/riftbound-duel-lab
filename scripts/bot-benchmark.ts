/** npx vite-node scripts/bot-benchmark.ts [pairs] [output.json] [levels] [catalog] [--resume] */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { cpus } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
  inferProfile,
  type Difficulty,
} from "../src/game/ai/config";
import type { GameState, PlayerId } from "../src/game/types";
import { benchmarkDeckPairs, benchmarkList } from "./bot-benchmark-decks";
import { validateBenchmarkResume } from "./bot-benchmark-report";
const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const arguments_ = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const catalog = arguments_[3] === "catalog";
const pairs = Math.max(1, Number(arguments_[0] ?? 6));
const output = arguments_[1] ?? "test-results/bot-benchmark.json";
if (!Number.isInteger(pairs))
  throw new Error("Pair count must be a positive integer");
mkdirSync(dirname(output), { recursive: true });
const comparisons: [Difficulty, Difficulty | "reference"][] = [
  ["beginner", "reference"],
  ["normal", "beginner"],
  ["hard", "normal"],
  ["expert", "hard"],
];
const deckPairs = benchmarkDeckPairs(catalog);
const selectedComparisons = comparisons.filter(
  ([level]) => !arguments_[2] || arguments_[2].split(",").includes(level),
);
if (!selectedComparisons.length)
  throw new Error("No benchmark comparisons selected");
// Fingerprint the exact rules/planner/catalog inputs, including JSON data. A
// checkpoint with different source is rejected even if its version is unchanged.
const sourceFiles = [
  ...["src/game", "src/data"].flatMap((directory) =>
    readdirSync(directory, { recursive: true })
      .map(String)
      .filter((file) => /\.(ts|json)$/.test(file))
      .map((file) => `${directory}/${file}`),
  ),
  "scripts/bot-benchmark-decks.ts",
].sort();
function sourceFingerprint(commit?: string) {
  const hash = createHash("sha256");
  for (const file of sourceFiles) {
    const bytes = commit
      ? execFileSync("git", ["show", `${commit}:${file}`], {
          maxBuffer: 32 * 1024 * 1024,
        })
      : readFileSync(file);
    hash.update(`${file}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return hash.digest("hex");
}
const sourceSha256 = sourceFingerprint();
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
  selectedComparisons,
  sourceSha256,
  scope: catalog
    ? "13 official precons and three legal modified/imported theme lists; equipment and tokens span expansions, XP remains within UNL"
    : "four curated practice decks",
  limitations:
    "Small paired pilot; outcomes do not establish statistical superiority or a general difficulty ordering. Timings include observation, planning, and validation and may reflect shared-runner contention.",
  deckLists: [
    ...new Map(deckPairs.flat().map((deck) => [deck.id, deck])).values(),
  ].map((deck) => ({
    id: deck.id,
    name: deck.name,
    profile: inferProfile(benchmarkList(deck)),
    format: deck.format ?? "standard",
    legendId: deck.legendId,
    championId: deck.championId,
    main: deck.main,
    runes: deck.runes,
    battlefields: deck.battlefieldIds ?? [deck.battlefieldId],
  })),
  comparisons: [],
};
let previousComparisons: any[] = [];
if (flags.includes("--resume")) {
  const previous = JSON.parse(readFileSync(output, "utf8"));
  const sourceCommitArgument = flags.find((arg) =>
    arg.startsWith("--resume-source="),
  );
  let legacySourceCommit: string | undefined;
  if (!previous.sourceSha256) {
    if (!sourceCommitArgument)
      throw new Error(
        "Legacy checkpoint requires --resume-source=<verified source commit>",
      );
    legacySourceCommit = execFileSync(
      "git",
      [
        "rev-parse",
        "--verify",
        `${sourceCommitArgument.slice("--resume-source=".length)}^{commit}`,
      ],
      { encoding: "utf8" },
    ).trim();
    if (sourceFingerprint(legacySourceCommit) !== sourceSha256)
      throw new Error(
        "Legacy checkpoint source commit differs from the current planner/rules/catalog",
      );
  } else if (previous.sourceSha256 !== sourceSha256)
    throw new Error("Checkpoint planner/rules/catalog source differs");
  const identities = Array.from({ length: pairs }, (_, pair) => {
    const [left, right] = deckPairs[pair % deckPairs.length];
    return [0, 1].map((side) => ({
      pair,
      side,
      decks: [left.id, right.id],
      deckProfiles: [
        inferProfile(benchmarkList(left)),
        inferProfile(benchmarkList(right)),
      ],
      seed: 1201 + pair * 31,
      firstPlayer: pair % 2,
    }));
  }).flat();
  validateBenchmarkResume(previous, report, selectedComparisons, identities);
  if (previous.status === "completed") {
    console.log("Verified completed cohort: no games remain; report preserved");
    process.exit(0);
  }
  previousComparisons = previous.comparisons;
  report.generatedAt = previous.generatedAt;
  report.environment = previous.environment;
  report.resumptions = [
    ...(previous.resumptions ?? []),
    {
      resumedAt: new Date().toISOString(),
      completedGamesRetained: previousComparisons.reduce(
        (sum, record) => sum + record.games.length,
        0,
      ),
      environment: {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        cpu: cpus()[0]?.model,
      },
      ...(legacySourceCommit ? { legacySourceCommit } : {}),
    },
  ];
  console.log(
    `Verified checkpoint: retaining ${report.resumptions.at(-1).completedGamesRetained} completed games`,
  );
  if (flags.includes("--check-resume")) process.exit(0);
} else if (flags.includes("--check-resume"))
  throw new Error("--check-resume requires --resume");
function checkpoint(value: any) {
  const temporary = `${output}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n");
  renameSync(temporary, output);
}
function stateKey(s: GameState) {
  return JSON.stringify({ ...s, log: [], nextId: 0, revision: 0 });
}
for (const [comparisonIndex, [strong, weak]] of selectedComparisons.entries()) {
  const record: any = previousComparisons[comparisonIndex] ?? {
    strong,
    weak,
    wins: { strong: 0, weak: 0 },
    games: [],
    illegal: 0,
    blocked: 0,
    fallbackDecisions: 0,
    decisions: 0,
    incompleteDecisions: 0,
    timings: [],
    levels: {},
  };
  for (let pair = 0; pair < pairs; pair++)
    for (let side = 0; side < 2; side++) {
      if (pair * 2 + side < record.games.length) continue;
      const [left, right] = deckPairs[pair % deckPairs.length],
        seed = 1201 + pair * 31;
      const gameStarted = performance.now();
      const firstPlayer = (pair % 2) as PlayerId;
      let s = createGame({
        playerDeck: left,
        botDeck: right,
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
              incompleteDecisions: 0,
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
            if (result.trace.incomplete) {
              record.incompleteDecisions++;
              levelMetrics.incompleteDecisions++;
            }
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
        decks: [left.id, right.id],
        deckProfiles: [
          inferProfile(benchmarkList(left)),
          inferProfile(benchmarkList(right)),
        ],
        seed,
        firstPlayer,
        winner: s.winner === null ? null : labels[s.winner],
        score: s.players.map((p) => p.points),
        turn: s.turn,
        decisions: steps,
        durationMs: performance.now() - gameStarted,
        ...(error ? { error } : {}),
      });
      console.log(
        `${strong}/${weak} pair ${pair + 1}/${pairs} side ${side}: ${s.winner === null ? error : labels[s.winner]} · ${steps} decisions`,
      );
      // Keep a resumable diagnostic report even if a later game is interrupted.
      checkpoint({
        ...report,
        comparisons: [...report.comparisons, record],
        status: "running",
      });
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
  if (record.timings) {
    record.timingMs = summarize(record.timings);
    for (const level of Object.values(record.levels) as any[]) {
      level.timingMs = summarize(level.timings);
      delete level.timings;
    }
    delete record.timings;
  }
  report.comparisons.push(record);
  checkpoint({ ...report, status: "running" });
}
report.status = "completed";
report.completedAt = new Date().toISOString();
checkpoint(report);
