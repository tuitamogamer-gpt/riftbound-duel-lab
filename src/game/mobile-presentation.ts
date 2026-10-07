import type { Review } from "../components/StepFlow";
import { getMight } from "./engine";
import type { GameAction, GameState, LocationId, PlayerId } from "./types";

export function mobileBoardLocations(game: GameState): LocationId[] {
  return ["base:0", ...game.fields.map((field) => field.id), "base:1"];
}

function validLocation(
  game: GameState,
  value: string | undefined,
): LocationId | undefined {
  return mobileBoardLocations(game).find((location) => location === value);
}

/** Only public board objects and locations participate; card faces are not read. */
function objectLocations(game: GameState, value?: string): LocationId[] {
  const locations = new Set<LocationId>();
  for (const id of value?.split(/[~,]/) ?? []) {
    const location = validLocation(game, id);
    if (location) locations.add(location);
    const unit = game.units.find((entry) => entry.id === id);
    if (unit) locations.add(unit.location);
    const gear = game.gears.find((entry) => entry.id === id);
    if (gear) {
      const bearer = game.units.find((entry) => entry.id === gear.attachedTo);
      locations.add(bearer?.location ?? `base:${gear.owner}`);
    }
  }
  return [...locations];
}

/** Movement's selection buttons act on origins, not on their destination field. */
export function mobileTargetZones(
  game: GameState,
  actions: GameAction[],
): LocationId[] {
  const locations = new Set<LocationId>();
  for (const action of actions) {
    if (action.id.startsWith("move-toggle:")) {
      for (const location of objectLocations(game, action.sourceId))
        locations.add(location);
      continue;
    }
    for (const location of objectLocations(game, action.targetId))
      locations.add(location);
    const location = validLocation(game, action.locationId);
    if (location) locations.add(location);
  }
  return mobileBoardLocations(game).filter((location) =>
    locations.has(location),
  );
}

/** Reveal a target automatically only when there is one unambiguous board zone. */
export function soleMobileTargetZone(
  game: GameState,
  actions: GameAction[],
): LocationId | undefined {
  const locations = mobileTargetZones(game, actions);
  return locations.length === 1 ? locations[0] : undefined;
}

export interface MobileZoneSummary {
  location: LocationId;
  counts: [number, number];
  might: [number, number];
  hidden: [number, number];
  controller: PlayerId | null;
  combat: boolean;
}

/** A minimap exposes public unit totals and hidden counts, never hidden identities. */
export function mobileZoneSummary(
  game: GameState,
  location: LocationId,
): MobileZoneSummary {
  const summary: MobileZoneSummary = {
    location,
    counts: [0, 0],
    might: [0, 0],
    hidden: [0, 0],
    controller:
      game.fields.find((field) => field.id === location)?.controller ?? null,
    combat: game.combat?.fieldId === location,
  };
  for (const unit of game.units) {
    if (unit.location !== location) continue;
    summary.counts[unit.owner]++;
    summary.might[unit.owner] += getMight(game, unit);
  }
  for (const hidden of game.hidden ?? [])
    if (hidden.location === location) summary.hidden[hidden.owner]++;
  return summary;
}

export function defaultMobileZone(game: GameState | null): LocationId {
  if (!game) return "base:0";
  return (
    validLocation(game, game.combat?.fieldId) ??
    validLocation(game, game.pendingMove?.from) ??
    game.units.find((unit) => unit.location.startsWith("field:"))?.location ??
    "base:0"
  );
}

/** Follow the displayed frame and its public predecessor, never review.final. */
export function mobileReviewFocus(
  game: GameState | null,
  review: Review | null,
): LocationId | undefined {
  const frame = review?.frames[review.index];
  if (review && (!Number.isInteger(review.index) || review.index < 0 || !frame))
    return undefined;
  const shown = frame?.state ?? game;
  if (!shown) return undefined;
  const before = review
    ? review.index > 0
      ? review.frames[review.index - 1]?.state
      : review.before
    : undefined;
  const locate = (id?: string) =>
    objectLocations(shown, id)[0] ??
    (before ? objectLocations(before, id)[0] : undefined);
  const sourceLocation = (id?: string, player?: PlayerId) => {
    if ((id === "legend" || id === "champion") && player !== undefined)
      return `base:${player}` as LocationId;
    const boardLocation = locate(id);
    if (boardLocation) return boardLocation;
    // Hidden locations are public; source resolution never examines the face.
    if (id?.startsWith("hidden:"))
      return (shown.hidden ?? []).find((hidden) => `hidden:${hidden.id}` === id)
        ?.location;
    return undefined;
  };
  return (
    validLocation(shown, frame?.combat?.preview.fieldId) ??
    locate(frame?.effect?.targetId) ??
    validLocation(shown, frame?.effect?.locationId) ??
    validLocation(shown, frame?.score?.fieldId) ??
    validLocation(shown, shown.combat?.fieldId) ??
    (review?.action.id !== "move-confirm"
      ? validLocation(shown, shown.pendingMove?.from)
      : undefined) ??
    sourceLocation(frame?.effect?.sourceId, frame?.effect?.player) ??
    locate(review?.action.targetId) ??
    validLocation(shown, review?.action.locationId) ??
    sourceLocation(review?.action.sourceId, review?.action.player) ??
    (review?.action.id === "move-confirm"
      ? validLocation(shown, before?.pendingMove?.to)
      : undefined)
  );
}
