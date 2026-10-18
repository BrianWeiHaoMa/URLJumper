// The worker's one queue: operations run one at a time, in the order they were queued, so no two
// read-modify-writes of storage interleave. An operation that fails does not hold up the ones after it.

let last: Promise<unknown> = Promise.resolve();

export function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const queued = last.then(operation);
  last = queued.catch(() => undefined);
  return queued;
}
