// How a Text view keeps its unsaved text as the draft (G19; State `draft`): it asks the worker, the only writer
// of `draft` (R1), to keep what the text area holds as the user types, coalescing the changes of 300 ms and
// those made while its previous request awaits a reply, and to discard the draft once the stored document holds
// the text, as a read made since the text was made shows: a read made before can show a document another page
// has changed since, so the text stays kept and the view reads again. Every draft request of a page waits for the reply to the one before, since the order in which one
// page's messages reach the worker is not relied on: the worker gets them in the order the page made them, and a
// Text view opened again in the same page reads `draft` only once the requests the closed one made have their
// replies.
import { documentHolds, type Draft, type DraftName } from '../draft';
import { send, type DraftDiscardReply } from '../requests';

/** How long changes are gathered into one *draft set*: what G19 admits losing when the popup or Chrome closes. */
const COALESCE_MS = 300;

// The page's draft requests, one after another.
let turn: Promise<unknown> = Promise.resolve();

function inTurn<T>(request: () => Promise<T>): Promise<T> {
  const answered = turn.then(request);
  turn = answered.catch(() => undefined);
  return answered;
}

/** Resolves once every draft request this page has made, and any it makes meanwhile, has its reply. */
export async function draftRequestsAnswered(): Promise<void> {
  let seen: Promise<unknown>;
  do {
    seen = turn;
    await seen;
  } while (seen !== turn);
}

/** Removes the draft `name` names, once this page's earlier draft requests have their replies (Composition, *draft discard*). */
export function discardDraft(name: DraftName): Promise<DraftDiscardReply> {
  return inTurn(() => send({ kind: 'draft-discard', ...name }));
}

export interface DraftKeeping {
  /**
   * The user made the text area hold `text`, typed against `base`, at `madeAt`, now unless given: kept as the
   * draft within 300 ms, or once the previous request has its reply. When the stored document as last read,
   * `stored`, holds the text, that read was made before the text, so the view reads again (`readAgain`).
   */
  edited(text: string, base: string, stored: string, madeAt?: number): void;
  /** A read of the stored document is made now: what `storedRead` is given with its answer. */
  reading(): number;
  /**
   * The stored document was read as `stored`, by the read `reading` gave `read` for. Holding the text the view
   * holds, by a read made since the text was, it shows the text no unsaved edit: the draft goes, and nothing of
   * it is kept again. By a read made before, it leaves that in doubt, and the view reads again, unless a later
   * read was made since this one (`latest` false), whose answer then says.
   */
  storedRead(stored: string, read: number, latest: boolean): void;
  /** The view took over `draft`, resumed or replaced by Import, and has sent none of its own since: the draft a discard names. */
  holds(draft: Draft): void;
  /**
   * The text area holds the stored document, which the view's Save just stored or a read just loaded over a text
   * with no change since the last load: nothing is unsaved, and each draft the view holds goes.
   */
  settled(): void;
  /** Sends the change not yet sent, if any, and resolves once the page's draft requests have their replies. */
  flush(): Promise<void>;
}

type Edit = { text: string; base: string; time: number };

/**
 * The keeping of one Text view opened, under an identifier of its own (Composition, *draft set*). `notKept` is
 * told Chrome's message when the worker did not store the view's draft, and null once it did, or once there
 * is nothing to keep; `readAgain` makes a read of the stored document, whose answer the view gives `storedRead`.
 */
export function keepDraft(notKept: (message: string | null) => void, readAgain: () => void): DraftKeeping {
  const view = crypto.randomUUID();
  let number = 0;
  // The change not yet sent, with the time it was made in the page: the edit's time, never the sending's.
  let unsent: Edit | null = null;
  // The text the view holds, as its last edit made it or the draft it took over, and how many edits came so far:
  // a read the view made when as many had come shows the stored document after this text was made.
  let current: string | undefined;
  let edits = 0;
  // Every draft of this view's that `draft` may hold: the last one stored, and any sent since whose reply has
  // not said it was, which a set Chrome refused or one that got no reply leaves in doubt.
  let held: DraftName[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  // A request is waiting for its turn; it sends `unsent` as its turn comes, so changes made meanwhile go with it.
  let waiting = false;
  // Raised by each letting go, which a reply to a set sent before it must not undo.
  let lettings = 0;

  const sendUnsent = () => {
    clearTimeout(timer);
    timer = undefined;
    if (waiting) return;
    waiting = true;
    void inTurn(async () => {
      waiting = false;
      if (unsent === null) return;
      const change = unsent;
      unsent = null;
      const name = { view, number: ++number };
      held.push(name);
      const since = lettings;
      const reply = await send({ kind: 'draft-set', ...change, ...name });
      if (since !== lettings) return;
      if (reply.kind === 'done') {
        held = [name];
        notKept(null);
      } else {
        // Sent again with the next change or before Save, never in a loop while Chrome refuses it.
        unsent ??= change;
        notKept(reply.message);
      }
    });
  };

  const keep = (edit: Edit) => {
    unsent = edit;
    if (timer === undefined && !waiting) timer = setTimeout(sendUnsent, COALESCE_MS);
  };

  // The stored document held the text after it was made, so the text is no unsaved edit (G19, "as after its
  // Save"): the change not yet sent is dropped, and each draft the view holds is discarded by name once the
  // requests before have their replies; nothing of it is kept again, though the document changes since.
  const letGo = () => {
    clearTimeout(timer);
    timer = undefined;
    unsent = null;
    lettings++;
    const names = held;
    held = [];
    notKept(null);
    for (const name of names) void discardDraft(name);
  };

  return {
    edited(text, base, stored, madeAt = Date.now()) {
      current = text;
      edits++;
      keep({ text, base, time: madeAt });
      if (documentHolds(stored, text)) readAgain();
    },
    reading: () => edits,
    storedRead(stored, read, latest) {
      // Nothing kept: the text was let go, or none was typed.
      if ((unsent === null && held.length === 0) || current === undefined || !documentHolds(stored, current)) return;
      if (read === edits) letGo();
      else if (latest) readAgain();
    },
    holds(draft) {
      held = [{ view: draft.view, number: draft.number }];
      current = draft.text;
      edits++;
    },
    settled() {
      letGo();
    },
    flush() {
      if (unsent !== null) sendUnsent();
      return draftRequestsAnswered();
    },
  };
}
