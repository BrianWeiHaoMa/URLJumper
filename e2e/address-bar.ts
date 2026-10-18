// Chrome's address bar, which headless Chrome cannot show: what a check needs to type after the keyword `j`
// and press Enter there, re-exported by e2e/extension.ts. Both dispatch Chrome's omnibox events to the
// worker's own listeners with the arguments Chrome passes; what the worker hands Chrome is recorded on the
// way and still reaches it.
import type { Worker } from '@playwright/test';
import type { Request } from '../src/requests.ts';

export type Disposition = `${chrome.omnibox.OnInputEnteredDisposition}`;

/** What the worker did for one input. */
export interface AddressBarInput {
  /** The description it set as the default suggestion, or undefined when it set none. */
  defaultDescription: string | undefined;
  /** What it passed to `suggest`. */
  suggestions: chrome.omnibox.SuggestResult[];
}

export interface AddressBar {
  /**
   * Types `text` after the keyword: Chrome's `onInputChanged`, with a `suggest` that records what it is
   * given. Resolves once the worker called it, and fails unless its write of `omnibox` and its default
   * suggestion had both settled by then, since later Chrome ignores a default set after `suggest` (S7).
   */
  type(text: string): Promise<AddressBarInput>;
  /** Presses Enter on `text` (Chrome's `onInputEntered`) and resolves once the worker has done all it does for it. */
  enter(text: string, disposition: Disposition): Promise<void>;
}

/** `requests` is a page of the extension, opened before any tab a check brings to the front. */
export function addressBar(worker: Worker, requests: { send(request: Request): Promise<unknown> }): AddressBar {
  return {
    type: async (text) => {
      const { steps, ...input } = await worker.evaluate(typeInWorker, text);
      if (steps.at(-1) !== 'suggest' || !steps.includes('omnibox stored') || !steps.includes('default set')) {
        throw new Error(`the worker called suggest before its record and default suggestion settled: ${JSON.stringify(steps)}`);
      }
      return input;
    },
    enter: async (text, disposition) => {
      await worker.evaluate(([text, disposition]) => (chrome.omnibox.onInputEntered as unknown as Dispatchable).dispatch(text, disposition), [text, disposition] as const);
      // A request that writes nothing: the worker runs it on its one queue after everything queued before it.
      await requests.send({ kind: 'remove-intent', windowId: -1, time: 0 });
    },
  };
}

// Runs in the worker. The recorders are added once per worker instance, so again after a restart.
async function typeInWorker(text: string) {
  const scope = globalThis as unknown as { addressBarSteps?: string[]; addressBarDefault?: string };
  if (scope.addressBarSteps === undefined) {
    const steps: string[] = [];
    scope.addressBarSteps = steps;
    const setDefault = chrome.omnibox.setDefaultSuggestion.bind(chrome.omnibox) as (suggestion: chrome.omnibox.DefaultSuggestResult) => Promise<void>;
    (chrome.omnibox as unknown as Record<string, unknown>).setDefaultSuggestion = (suggestion: chrome.omnibox.DefaultSuggestResult) => {
      scope.addressBarDefault = suggestion.description;
      return setDefault(suggestion).finally(() => steps.push('default set'));
    };
    const local = chrome.storage.local;
    const set = local.set.bind(local) as (items: Record<string, unknown>) => Promise<void>;
    (local as unknown as Record<string, unknown>).set = (items: Record<string, unknown>) =>
      'omnibox' in items ? set(items).finally(() => steps.push('omnibox stored')) : set(items);
  }
  const steps = scope.addressBarSteps;
  steps.length = 0;
  scope.addressBarDefault = undefined;
  const suggestions = await new Promise<chrome.omnibox.SuggestResult[]>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the worker did not call suggest for ${JSON.stringify(text.slice(0, 100))}`)), 10_000);
    (chrome.omnibox.onInputChanged as unknown as Dispatchable).dispatch(text, (given: chrome.omnibox.SuggestResult[]) => {
      clearTimeout(timer);
      steps.push('suggest');
      resolve(given);
    });
  });
  return { steps: [...steps], defaultDescription: scope.addressBarDefault, suggestions };
}

// Chrome's events in the worker have a `dispatch` its typings leave out.
interface Dispatchable {
  dispatch(...args: unknown[]): void;
}
