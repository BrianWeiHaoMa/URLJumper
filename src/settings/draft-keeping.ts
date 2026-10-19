// How a Text view keeps its unsaved text as the draft (G19; State `draft`): it asks the worker, the only writer
// of `draft` (R1), to keep what the text area holds as the user types, coalescing the changes of 300 ms and
// those made while its previous request awaits a reply, and to discard the draft once the stored document holds
// the text. Every draft request of a page waits for the reply to the one before, since the order in which one
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

/**
 * Removes the draft `name` names, once this page's earlier draft requests have their replies (Composition,
 * *draft discard*): as the user asked, or, given `ifStored`, only while the stored document is that text.
 */
export function discardDraft(name: DraftName, ifStored?: string): Promise<DraftDiscardReply> {
  return inTurn(() => send({ kind: 'draft-discard', ...name, ...(ifStored === undefined ? {} : { ifStored }) }));
}

export interface DraftKeeping {
  /**
   * The user made the text area hold `text`, typed against `base`, with the stored document last read as
   * `stored`: kept as the draft within 300 ms, or once the previous request has its reply; or, when `stored`
   * holds the text, the draft goes. `madeAt` is when the edit was made, now unless given.
   */
  edited(text: string, base: string, stored: string, madeAt?: number): void;
  /** The stored document was read as `stored` while the text area holds `text`, typed against `base`: when it holds the text, the draft goes. */
  storedRead(stored: string, text: string, base: string): void;
  /** The view took over `draft`, resumed or replaced by Import, and has sent none of its own since: the draft a discard names. */
  holds(draft: Draft): void;
  /** Sends the change not yet sent, if any, and resolves once the page's draft requests have their replies. */
  flush(): Promise<void>;
}

type Edit = { text: string; base: string; time: number };

/**
 * The keeping of one Text view opened, under an identifier of its own (Composition, *draft set*). `notKept` is
 * told Chrome's message when the worker did not store the view's draft, and null once it did, or once there
 * is nothing to keep.
 */
export function keepDraft(notKept: (message: string | null) => void): DraftKeeping {
  const view = crypto.randomUUID();
  let number = 0;
  // The change not yet sent, with the time it was made in the page: the edit's time, never the sending's.
  let unsent: Edit | null = null;
  // When the text the view holds was made: by its last edit, or the draft it took over.
  let madeAt: number | undefined;
  // Every draft of this view's that `draft` may hold: the last one stored, and any sent since whose reply has
  // not said it was, which a set Chrome refused or one that got no reply leaves in doubt.
  let held: DraftName[] = [];
  // The text let go because a read showed the stored document holding it, until the worker confirms it does:
  // a read answered late can show a document already changed again, and then the text is kept after all.
  let letGone: Edit | null = null;
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

  // The stored document holds the text: the change not yet sent is dropped, and each draft the view holds is
  // discarded once the requests before have their replies, only while the stored document still is the text.
  const letGo = (edit: Edit) => {
    clearTimeout(timer);
    timer = undefined;
    unsent = null;
    lettings++;
    letGone = edit;
    const names = held;
    held = [];
    notKept(null);
    for (const name of names) {
      void discardDraft(name, edit.text).then((reply) => {
        if (reply.kind === 'changed') {
          held.push(name);
          keepAgain(edit);
        } else if (reply.kind === 'done' && letGone === edit) letGone = null;
      });
    }
  };

  // Sent at once, so a flush under way, as before Save, waits for it.
  const keepAgain = (edit: Edit) => {
    if (letGone !== edit) return;
    letGone = null;
    unsent = edit;
    sendUnsent();
  };

  return {
    edited(text, base, stored, at = Date.now()) {
      madeAt = at;
      letGone = null;
      const edit = { text, base, time: madeAt };
      if (documentHolds(stored, text)) letGo(edit);
      else keep(edit);
    },
    storedRead(stored, text, base) {
      if (documentHolds(stored, text)) {
        if (unsent !== null || held.length > 0) letGo({ text, base, time: madeAt ?? Date.now() });
      } else if (letGone !== null && letGone.text === text) keepAgain(letGone);
    },
    holds(draft) {
      held = [{ view: draft.view, number: draft.number }];
      madeAt = draft.time;
      letGone = null;
    },
    flush() {
      if (unsent !== null) sendUnsent();
      return draftRequestsAnswered();
    },
  };
}
