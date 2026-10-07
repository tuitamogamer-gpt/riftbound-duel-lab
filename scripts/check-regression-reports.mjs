import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Exercise the report guards without collecting or running gameplay tests.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = mkdtempSync(join(tmpdir(), "riftbound-report-checks-"));
let fixtureNumber = 0;
let passedChecks = 0;
const fixture = (value) => {
  const path = join(temporary, `${fixtureNumber++}.json`);
  writeFileSync(path, JSON.stringify(value));
  return path;
};
const run = (script, args, shouldPass) => {
  const result = spawnSync(
    process.execPath,
    [join(root, "scripts", script), ...args],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 10000,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.signal, null, `${script} terminated unexpectedly`);
  assert.equal(
    result.status === 0,
    shouldPass,
    `${script}: ${result.stdout}${result.stderr}`,
  );
  return result;
};
const check = (name, body) => {
  try {
    body();
    passedChecks++;
  } catch (error) {
    throw new Error(name, { cause: error });
  }
};
const assertion = (fullName, status = "passed", title = fullName) => ({
  ancestorTitles: [],
  fullName,
  title,
  status,
  duration: 1,
  failureMessages: status === "failed" ? ["Synthetic assertion failure"] : [],
});
const report = (file, assertions, startTime = 1, extra = {}) => {
  const numFailedTests = assertions.filter(
    (test) => test.status === "failed",
  ).length;
  return {
    startTime,
    success: numFailedTests === 0,
    numTotalTests: assertions.length,
    numPassedTests: assertions.filter((test) => test.status === "passed")
      .length,
    numFailedTests,
    numPendingTests: assertions.filter((test) => test.status === "pending")
      .length,
    testResults: [{ name: file, assertionResults: assertions }],
    ...extra,
  };
};
const exampleFile = join(root, "tests", "example.test.ts");
const exampleManifest = [
  { file: exampleFile, name: "suite > first" },
  { file: exampleFile, name: "suite > second" },
];
const summarize = (manifest, reports, shouldPass) => {
  const output = join(temporary, `summary-${fixtureNumber}.json`);
  run(
    "summarize-regression-reports.mjs",
    [
      `--expected=${fixture(manifest)}`,
      `--output=${output}`,
      ...reports.map(fixture),
    ],
    shouldPass,
  );
  return JSON.parse(readFileSync(output, "utf8"));
};
const preconFile = join(root, "tests", "precon-effects.test.ts");
const decks = JSON.parse(
  readFileSync(join(root, "src/data/precon-lists.json"), "utf8"),
);
const matrix = decks.flatMap((player) =>
  decks.map((opponent) => {
    const title = `completes ${player.id} vs ${opponent.id} with card/rune conservation and no stuck decisions`;
    return assertion(
      `all published starter precon matchups ${title}`,
      "passed",
      title,
    );
  }),
);
const focused = assertion("focused rules preserves ownership");
const preconManifest = [...matrix, focused].map((test) => ({
  file: preconFile,
  name: test.fullName.replace(
    "all published starter precon matchups completes ",
    "all published starter precon matchups > completes ",
  ),
}));
const verify = (reports, shouldPass) =>
  run("verify-precon-report.mjs", reports.map(fixture), shouldPass);
const reconcile = (reports, shouldPass) => {
  const output = join(temporary, `matrix-${fixtureNumber}.json`);
  run(
    "reconcile-precon-reports.mjs",
    [
      `--expected=${fixture(preconManifest)}`,
      `--output=${output}`,
      ...reports.map(fixture),
    ],
    shouldPass,
  );
  return shouldPass ? JSON.parse(readFileSync(output, "utf8")) : null;
};

try {
  check(
    "Collected scopes and quoted table values normalize to executed names",
    () => {
      const summary = summarize(
        [
          exampleManifest[0],
          {
            file: exampleFile,
            name: "matrix > completes x vs y with card/rune",
          },
        ],
        [
          report(exampleFile, [
            assertion("suite first"),
            assertion("matrix completes 'x vs y' with card/rune"),
          ]),
        ],
        true,
      );
      assert.equal(summary.passedUniqueTests, 2);
      assert.equal(summary.unmatchedSourceAssertions, 0);
    },
  );

  check(
    "A later executed correction replaces a failure despite reversed argument order",
    () => {
      const summary = summarize(
        exampleManifest,
        [
          report(
            exampleFile,
            [assertion("suite first"), assertion("suite second")],
            null,
            {
              checkpointTime: 300,
            },
          ),
          report(
            exampleFile,
            [assertion("suite first", "failed"), assertion("suite second")],
            200,
          ),
        ],
        true,
      );
      assert.equal(summary.failedUniqueTests, 0);
      assert.equal(summary.sourceReports[0].failed, 1);
      assert.equal(summary.sourceReports[1].checkpointTime, 300);
    },
  );

  check("Unselected pending cases cannot erase an earlier failure", () => {
    const summary = summarize(
      exampleManifest,
      [
        report(
          exampleFile,
          [assertion("suite first", "failed"), assertion("suite second")],
          100,
        ),
        report(
          exampleFile,
          [assertion("suite first", "pending"), assertion("suite second")],
          200,
        ),
      ],
      false,
    );
    assert.equal(summary.failedUniqueTests, 1);
    assert.equal(summary.failed[0].fullName, "suite first");
  });

  check(
    "An unexecuted collected case prevents a complete green summary",
    () => {
      const summary = summarize(
        exampleManifest,
        [report(exampleFile, [assertion("suite first")])],
        false,
      );
      assert.equal(summary.missingUniqueTests, 1);
    },
  );

  check(
    "Colliding collected identities are rejected after normalization",
    () => {
      run(
        "summarize-regression-reports.mjs",
        [
          `--expected=${fixture([
            exampleManifest[0],
            { file: exampleFile, name: "suite first" },
          ])}`,
          fixture(report(exampleFile, [assertion("suite first")])),
        ],
        false,
      );
    },
  );

  check(
    "All published pairings pass across separate reports and quote forms",
    () => {
      const quoted = matrix.map((test, index) => {
        const quote = index % 2 ? '"' : "'";
        const title = test.title.replace(
          /^completes (.+) with card/,
          `completes ${quote}$1${quote} with card`,
        );
        return assertion(
          `all published starter precon matchups ${title}`,
          "passed",
          title,
        );
      });
      verify(
        [
          report(
            preconFile,
            quoted.filter((_, index) => index % 2 === 0),
          ),
          report(
            preconFile,
            quoted.filter((_, index) => index % 2 === 1),
          ),
        ],
        true,
      );
    },
  );

  check("A missing published pairing is rejected", () => {
    verify([report(preconFile, matrix.slice(1))], false);
  });

  check("A duplicate published pairing is rejected", () => {
    verify([report(preconFile, [...matrix, matrix[0]])], false);
  });

  check("A skipped published pairing is rejected", () => {
    verify(
      [
        report(preconFile, [
          { ...matrix[0], status: "pending" },
          ...matrix.slice(1),
        ]),
      ],
      false,
    );
  });

  check("A failed published pairing is rejected", () => {
    verify(
      [
        report(preconFile, [
          { ...matrix[0], status: "failed" },
          ...matrix.slice(1),
        ]),
      ],
      false,
    );
  });

  check(
    "Reconciliation merges executed subsets without pending cases masking evidence",
    () => {
      const split = Math.floor(matrix.length / 2);
      const before = report(
        preconFile,
        [...matrix.slice(0, split), focused],
        null,
        {
          checkpointTime: 100,
          recovery: { kind: "retained-completed-assertions" },
        },
      );
      const continuation = report(
        preconFile,
        [
          ...matrix
            .slice(0, split)
            .map((test) => ({ ...test, status: "pending" })),
          ...matrix.slice(split),
          focused,
        ],
        200,
      );
      const reconciled = reconcile([continuation, before], true);
      assert.equal(reconciled.numPassedTests, preconManifest.length);
      assert.equal(reconciled.recovery.sources.length, 2);
      assert.ok(
        reconciled.recovery.sources.every((source) =>
          /^[a-f0-9]{64}$/.test(source.sha256),
        ),
      );
      assert.equal(
        reconciled.testResults[0].assertionResults[0].evidenceSource,
        reconciled.recovery.sources[0].path,
      );
      verify([reconciled], true);
    },
  );

  check("Reconciliation retains an unresolved executed failure", () => {
    reconcile(
      [
        report(preconFile, [...matrix, focused], 100),
        report(preconFile, [{ ...matrix[0], status: "failed" }], 200),
      ],
      false,
    );
  });

  check("Reconciliation rejects missing collected assertions", () => {
    reconcile([report(preconFile, matrix)], false);
  });

  check("A newer uncollected failed identity prevents a green summary", () => {
    const summary = summarize(
      exampleManifest,
      [
        report(
          exampleFile,
          [assertion("suite first"), assertion("suite second")],
          100,
        ),
        report(exampleFile, [assertion("suite renamed", "failed")], 200),
      ],
      false,
    );
    assert.equal(summary.unmatchedSourceAssertions, 1);
    assert.equal(summary.success, false);
  });

  check(
    "An unsuccessful runner cannot become a green reconciled report",
    () => {
      reconcile(
        [
          report(preconFile, [...matrix, focused], 100, {
            success: false,
            numFailedTests: 0,
          }),
        ],
        false,
      );
    },
  );

  console.log(`Passed ${passedChecks} synthetic regression-report checks.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
