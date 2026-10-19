// The popup's row editor (In use, "Edit from a suggestion"; G7, G25, L2; Composition, "Popup"): one line's
// editor as a view of its own, taking the popup's list while it is open: above, the row's name and URL as the
// list showed them; below the header, after an update from 1.x, the notice of what is new (G25); the editor
// scrolling between header and footer (G7); and a footer that says what Enter does where the focus is. It
// gives the editor what the popup has: the document as last read, and *Open in text* as a new tab on the
// options page's Text view at the line (Composition, "Settings views").
import { useRef, useState } from 'react';
import type { Anchor } from '../document/anchor';
import { mappingOfLine } from '../document/grammar';
import type { Outcome } from '../line-changes/outcomes';
import { RowEditor } from '../line-changes/RowEditor';
import { settingsFragment } from '../settings/settings-view';
import { useFitToViewport } from './fit-to-viewport';
import { MappingRowText, type MappingRow } from './Row';
import { footerWithNotice } from './upgrade-notice';
import { UpgradeNotice, type Notice } from './UpgradeNotice';

interface PopupRowEditorProps {
  /** The stored document as last read. */
  document: string;
  /** The line as the read the popup showed held it when the editor opened. */
  anchor: Anchor;
  /** The argument row's argument when opened from it, else null. */
  argument: string | null;
  /** The notice of what is new, while it shows. */
  notice: Notice;
  onStored(outcome: Outcome): void;
  onEditInstead(anchor: Anchor): void;
  onBack(): void;
}

export function PopupRowEditor({ document, anchor, argument, notice, onStored, onEditInstead, onBack }: PopupRowEditorProps) {
  const layout = useFitToViewport();
  const nameField = useRef<HTMLInputElement>(null);
  const [enterSays, setEnterSays] = useState('Enter does nothing');
  const row = listedRow(anchor, argument);

  return (
    <main className="popup" ref={layout.root}>
      <header className="editor-header">{row !== undefined && <MappingRowText row={row} />}</header>
      <UpgradeNotice notice={notice} start={nameField} />
      <div className="view" ref={layout.view} role="region" aria-label="Row editor">
        <div className="view-content" ref={layout.content}>
          <RowEditor
            document={document}
            anchor={anchor}
            argument={argument}
            start={nameField}
            openInText={openInText}
            onStored={onStored}
            onEditInstead={onEditInstead}
            onBack={onBack}
            sayWhatEnterDoes={setEnterSays}
          />
        </div>
      </div>
      <footer className="footer">{footerWithNotice(enterSays, notice)}</footer>
    </main>
  );
}

/** The row as the list showed it: the argument row with its argument, else the line's mapping. */
function listedRow(anchor: Anchor, argument: string | null): MappingRow | undefined {
  const mapping = mappingOfLine(anchor.text);
  if (mapping === undefined) return undefined;
  return argument === null ? { group: 'all', mapping } : { group: 'argument', mapping, argument };
}

/** A new tab on the options page's Text view with the caret on `line`; the tab takes the focus, and Chrome closes the popup. */
async function openInText(line: number): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${settingsFragment('text', line)}`) });
}
