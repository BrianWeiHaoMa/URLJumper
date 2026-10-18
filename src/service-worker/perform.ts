// Every request runs on the worker's one queue, in the order it arrived, and gets exactly one reply.
import { chromeMessage, type ReplyTo, type Request } from '../requests';
import { jump } from './jump';
import { enqueue } from './queue';

export function perform<R extends Request>(request: R): Promise<ReplyTo<R>> {
  return enqueue(() => operate(request)).catch(
    (error: unknown) => ({ kind: 'storage-failed', message: chromeMessage(error) }) as ReplyTo<R>,
  );
}

function operate<R extends Request>(request: R): Promise<ReplyTo<R>> {
  switch (request.kind) {
    case 'jump':
      return jump(request) as Promise<ReplyTo<R>>;
  }
}
