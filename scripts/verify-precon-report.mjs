import { readFileSync } from "node:fs";

const reportPaths = process.argv.slice(2);
if (!reportPaths.length) reportPaths.push("test-results/precon-matrix.json");
const reports = reportPaths.map((path) => ({
  path,
  report: JSON.parse(readFileSync(path, "utf8")),
}));
const decks = JSON.parse(
  readFileSync(
    new URL("../src/data/precon-lists.json", import.meta.url),
    "utf8",
  ),
);
const expected = decks.flatMap((player) =>
  decks.map(
    (opponent) =>
      `completes ${player.id} vs ${opponent.id} with card/rune conservation and no stuck decisions`,
  ),
);
const assertions = reports.flatMap(({ report }) =>
  report.testResults
    .filter((suite) =>
      suite.name
        .replaceAll("\\", "/")
        .endsWith("/tests/precon-effects.test.ts"),
    )
    .flatMap((suite) => suite.assertionResults),
);
const problems = [];
const matrixAssertions = assertions.filter(
  (test) =>
    test.title?.startsWith("completes ") ||
    test.fullName?.includes("all published starter precon matchups completes "),
);
if (matrixAssertions.length !== expected.length)
  problems.push(
    `Expected exactly ${expected.length} matrix results, received ${matrixAssertions.length}.`,
  );
for (const title of expected) {
  // Vitest's $name interpolation may quote string table values in reports.
  const quoted = title.replace(
    /^completes (.+) with card/,
    "completes '$1' with card",
  );
  const doubleQuoted = title.replace(
    /^completes (.+) with card/,
    'completes "$1" with card',
  );
  const titles = [title, quoted, doubleQuoted];
  const cases = assertions.filter((test) =>
    titles.some(
      (candidate) =>
        test.title === candidate || test.fullName?.endsWith(` ${candidate}`),
    ),
  );
  if (cases.length !== 1 || cases[0].status !== "passed")
    problems.push(
      `${title}: ${cases.length === 0 ? "missing" : cases.map((test) => test.status).join(", ")}`,
    );
}
for (const { path, report } of reports)
  if (report.success !== true || report.numFailedTests !== 0)
    problems.push(`${path}: the Vitest report is not fully successful.`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Verified all ${expected.length} unique ordered matchups of ${decks.length} published precons, including mirrors, across ${reports.length} report(s).`,
  );
}
