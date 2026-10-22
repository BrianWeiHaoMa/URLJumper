// Preferences (In use, "Preferences"; F3, F6, F15, G27, E6): the search order with *Reset learned order*, the
// theme, the view the popup's settings open on, the address-bar keyword, and the shortcuts. What is chosen is
// read from storage when the view opens and after every change, so every surface shows the same; a choice is
// stored as it is made, and nothing is stored until one is, so a profile that never chose keeps Document order,
// System, and Preferences (G23). The learned usage is removed by the worker, its only writer (R1).
import { useEffect, useState } from 'react';
import type { SearchOrder } from '../document/search';
import {
  readPopupSettingsView,
  readSearchOrder,
  readTheme,
  storePopupSettingsView,
  storeSearchOrder,
  storeTheme,
  type PopupSettingsView,
  type Theme,
} from '../preferences';
import { chromeMessage, send } from '../requests';
import { Choice, type ChoiceOption } from './Choice';
import type { SettingsViewProps } from './settings-view';
import { Shortcuts } from './Shortcuts';
import './settings.css';

const ORDERS: readonly ChoiceOption<SearchOrder>[] = [
  { value: 'document', label: 'Document order' },
  { value: 'smart', label: 'Smart order' },
];
const THEMES: readonly ChoiceOption<Theme>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
// The ids and titles of `./views`, which lists this view and so cannot be imported here.
const POPUP_SETTINGS_VIEWS: readonly ChoiceOption<PopupSettingsView>[] = [
  { value: 'preferences', label: 'Preferences' },
  { value: 'list', label: 'List' },
  { value: 'text', label: 'Text' },
];

interface Chosen {
  order: SearchOrder;
  theme: Theme;
  popupSettingsView: PopupSettingsView;
}

/** Where the focus is among the view's controls, which says what Enter does. */
type Focused = 'order' | 'theme' | 'popup-settings-view' | 'reset' | 'shortcuts' | null;

/** The reset of the learned order: not asked for, awaiting the worker, or done. */
type Reset = 'none' | 'resetting' | 'done';

export function Preferences({ beside, sayWhatEnterDoes }: SettingsViewProps) {
  const [chosen, setChosen] = useState<Chosen | undefined>(undefined);
  const [focused, setFocused] = useState<Focused>(null);
  const [reset, setReset] = useState<Reset>('none');
  // Why the last choice or reset stored nothing, until the next.
  const [message, setMessage] = useState<string | null>(null);
  // The keyword's one home is the manifest (F6); it is shown, never changed (N10).
  const keyword = chrome.runtime.getManifest().omnibox?.keyword;

  useEffect(() => {
    // Every read asks again, and Chrome answers reads in the order they were made, so the last shows the latest.
    const read = () =>
      void chrome.storage.local
        .get(['searchOrder', 'themePref', 'popupSettingsView'])
        .then(({ searchOrder, themePref, popupSettingsView }) =>
          setChosen({ order: readSearchOrder(searchOrder), theme: readTheme(themePref), popupSettingsView: readPopupSettingsView(popupSettingsView) }),
        );
    const changed = (_changes: unknown, area: string) => {
      if (area === 'local') read();
    };
    chrome.storage.onChanged.addListener(changed);
    read();
    return () => chrome.storage.onChanged.removeListener(changed);
  }, []);

  const enter =
    focused === 'order' || focused === 'theme' || focused === 'popup-settings-view'
      ? 'The arrow keys choose · Enter does nothing'
      : focused === 'reset'
        ? reset === 'resetting'
          ? 'Resetting · Enter does nothing until it is done'
          : 'Enter removes the learned order'
        : focused === 'shortcuts'
          ? "Enter opens Chrome's shortcuts page"
          : 'Enter does nothing';
  useEffect(() => sayWhatEnterDoes?.(enter), [enter, sayWhatEnterDoes]);

  // Shown as stored: the change it makes shows when Chrome reports it, and a refused one leaves the old choice shown.
  const choose = (store: () => Promise<void>, what: string) => {
    setMessage(null);
    setReset('none');
    store().catch((error: unknown) => setMessage(`${what} was not stored. Chrome said: ${chromeMessage(error)}`));
  };

  const resetLearnedOrder = async () => {
    if (reset === 'resetting') return;
    setMessage(null);
    setReset('resetting');
    const reply = await send({ kind: 'reset-usage' });
    if (reply.kind === 'done') setReset('done');
    else {
      setReset('none');
      setMessage(`The learned order was not reset. Chrome said: ${reply.message}`);
    }
  };

  return (
    <div className="preferences">
      {message !== null && (
        <p className="settings-alert" role="alert">
          {message}
        </p>
      )}
      <section className="settings-section" aria-labelledby="order-heading">
        <h2 className="settings-heading" id="order-heading">
          Search order
        </h2>
        <Choice
          labelledBy="order-heading"
          options={ORDERS}
          chosen={chosen?.order}
          onChoose={(order) => choose(() => storeSearchOrder(order), labelOf(ORDERS, order))}
          onFocusChange={(on) => setFocused(on ? 'order' : null)}
        />
        <p className="settings-text">Smart order lists the mappings you used recently first; Document order lists them as the document does.</p>
        <div className="settings-action">
          <button
            type="button"
            className="settings-button"
            aria-disabled={reset === 'resetting'}
            onClick={() => void resetLearnedOrder()}
            onFocus={() => setFocused('reset')}
            onBlur={() => setFocused(null)}
          >
            Reset learned order
          </button>
          {reset === 'done' && (
            <p className="settings-status" role="status">
              Learned order removed: Smart order starts learning again.
            </p>
          )}
        </div>
      </section>
      <section className="settings-section" aria-labelledby="theme-heading">
        <h2 className="settings-heading" id="theme-heading">
          Theme
        </h2>
        <Choice
          labelledBy="theme-heading"
          options={THEMES}
          chosen={chosen?.theme}
          onChoose={(theme) => choose(() => storeTheme(theme), `The ${labelOf(THEMES, theme)} theme`)}
          onFocusChange={(on) => setFocused(on ? 'theme' : null)}
        />
      </section>
      <section className="settings-section" aria-labelledby="popup-settings-view-heading">
        <h2 className="settings-heading" id="popup-settings-view-heading">
          Popup settings open on
        </h2>
        <Choice
          labelledBy="popup-settings-view-heading"
          options={POPUP_SETTINGS_VIEWS}
          chosen={chosen?.popupSettingsView}
          onChoose={(view) => choose(() => storePopupSettingsView(view), `Opening on ${labelOf(POPUP_SETTINGS_VIEWS, view)}`)}
          onFocusChange={(on) => setFocused(on ? 'popup-settings-view' : null)}
        />
      </section>
      <section className="settings-section" aria-labelledby="keyword-heading">
        <h2 className="settings-heading" id="keyword-heading">
          Address bar
        </h2>
        <p className="settings-text">
          In Chrome's address bar, type <kbd className="keyword">{keyword}</kbd> and a space, then a name. The keyword is always {keyword}.
        </p>
      </section>
      <section className="settings-section" aria-labelledby="shortcuts-heading">
        <h2 className="settings-heading" id="shortcuts-heading">
          Shortcuts
        </h2>
        <Shortcuts onFocusChange={(on) => setFocused(on ? 'shortcuts' : null)} onMessage={setMessage} />
      </section>
      {beside}
    </div>
  );
}

function labelOf<T extends string>(options: readonly ChoiceOption<T>[], value: T): string {
  return options.find((option) => option.value === value)!.label;
}
