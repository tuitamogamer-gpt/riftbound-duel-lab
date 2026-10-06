import { chooseDecision } from "./planner";
import type { PlannerOptions } from "./planner";
import type { DecisionRequest } from "./decisions";
import type { Observation } from "./observation";
self.onmessage = (
  event: MessageEvent<{
    request: DecisionRequest;
    observation: Observation;
    options: PlannerOptions;
  }>,
) => {
  try {
    self.postMessage({
      id: event.data.request.id,
      result: chooseDecision(
        event.data.request,
        event.data.observation,
        event.data.options,
      ),
    });
  } catch (error) {
    self.postMessage({
      id: event.data.request.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
