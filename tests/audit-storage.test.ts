import { describe, expect, it } from "vitest";
import { applyAction, createGame, getLegalActions } from "../src/game/engine";
import { createReplay } from "../src/game/ai/replay";
import { recoverStoredAudit } from "../src/game/ai/audit-storage";

function fixture() {
  const initial = createGame({ seed: 71 });
  const action = getLegalActions(initial, 0).find(
    (entry) => !entry.cardIndices?.length,
  )!;
  const match = applyAction(initial, action);
  const replay = createReplay(initial);
  replay.decisions.push({ action });
  replay.finalRevision = match.revision!;
  return { match, replay };
}
describe("optional audit recovery", () => {
  it("retains a matching action record from either supported planner version", () => {
    const { match, replay } = fixture();
    for (const version of ["battlefield-planner-1", "battlefield-planner-2"])
      expect(
        recoverStoredAudit(JSON.stringify({ ...replay, version }), match)
          ?.decisions,
      ).toEqual(replay.decisions);
  });
  it("discards missing, null and malformed decisions without affecting the valid match", () => {
    const { match, replay } = fixture();
    for (const decisions of [
      undefined,
      null,
      {},
      [null],
      [{ action: null }],
      [{ action: { ...replay.decisions[0].action, player: 9 } }],
    ])
      expect(
        recoverStoredAudit(JSON.stringify({ ...replay, decisions }), match),
      ).toBeNull();
    const next = getLegalActions(match, match.priorityPlayer)[0];
    expect(applyAction(match, next).revision).toBe(match.revision! + 1);
  });
  it("rejects unrelated seeds, revisions, unknown versions and invalid initial states", () => {
    const { match, replay } = fixture();
    for (const candidate of [
      { ...replay, initial: { ...replay.initial, seed: 72 } },
      { ...replay, finalRevision: match.revision! + 1 },
      { ...replay, decisions: [] },
      { ...replay, version: "future" },
      { ...replay, initial: { ...replay.initial, players: [] } },
    ])
      expect(recoverStoredAudit(JSON.stringify(candidate), match)).toBeNull();
  });
  it("drops corrupt optional trace data while preserving recorded actions", () => {
    const { match, replay } = fixture();
    const raw = JSON.stringify({
      ...replay,
      decisions: [{ ...replay.decisions[0], trace: { alternatives: null } }],
    });
    expect(recoverStoredAudit(raw, match)?.decisions).toEqual(replay.decisions);
  });
  it("ignores damaged JSON, absent matches and excessive telemetry", () => {
    const { match, replay } = fixture();
    expect(recoverStoredAudit("{", match)).toBeNull();
    expect(recoverStoredAudit(JSON.stringify(replay), null)).toBeNull();
    expect(
      recoverStoredAudit(" ".repeat(8 * 1024 * 1024 + 1), match),
    ).toBeNull();
  });
});
