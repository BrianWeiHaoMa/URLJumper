// The what's-new page, `whats-new.html` (G25; Composition, "What's-new page"): static text in the package,
// opened in a tab from the popup's notice. Its script only styles it and shows the stored theme, live, as
// every page of the extension does.
import '../theme.css';
import './whats-new.css';
import { followStoredTheme } from '../preferences';

followStoredTheme();
