// Every request runs on the worker's one queue, in the order it arrived, and gets exactly one reply. An
// operation that throws, as a refused `get` or `set` does, replies `storage-failed` with Chrome's message.
import { chromeMessage, type ReplyTo, type Request } from '../requests';
import { discardDraft, setDraft } from './draft';
import { insert } from './insert';
import { jump } from './jump';
import { loadExampleDocument } from './load-example';
import { removeHonoredIntent } from './open-popup';
import { enqueue } from './queue';
import { remove } from './remove';
import { replace } from './replace';
import { resetUsage } from './reset-usage';
import { rewrite } from './rewrite';
import { undo } from './undo';

export function perform<R extends Request>(request: R): Promise<ReplyTo<R>> {
  return enqueue(() => operate(request)).catch(
    (error: unknown) => ({ kind: 'storage-failed', message: chromeMessage(error) }) as ReplyTo<R>,
  );
}

function operate<R extends Request>(request: R): Promise<ReplyTo<R>> {
  switch (request.kind) {
    case 'jump':
      return jump(request) as Promise<ReplyTo<R>>;
    case 'remove-intent':
      return removeHonoredIntent(request) as Promise<ReplyTo<R>>;
    case 'insert':
      return insert(request) as Promise<ReplyTo<R>>;
    case 'rewrite':
      return rewrite(request) as Promise<ReplyTo<R>>;
    case 'remove':
      return remove(request) as Promise<ReplyTo<R>>;
    case 'undo':
      return undo(request) as Promise<ReplyTo<R>>;
    case 'replace':
      return replace(request) as Promise<ReplyTo<R>>;
    case 'load-example':
      return loadExampleDocument() as Promise<ReplyTo<R>>;
    case 'reset-usage':
      return resetUsage() as Promise<ReplyTo<R>>;
    case 'draft-set':
      return setDraft(request) as Promise<ReplyTo<R>>;
    case 'draft-discard':
      return discardDraft(request) as Promise<ReplyTo<R>>;
  }
}
