import { afterEach } from "vitest";

// Fixed-node bot games deliberately do substantial synchronous CPU work.
// Let the worker process result/cancellation IPC between cases; otherwise a
// series of individually successful games can starve the runner's RPC replies.
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
