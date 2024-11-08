const storage = chrome.storage.local;

async function applyDefaultColorSchemeBasedOnSystem() {
    const items = await storage.get(['darkmode']);

    if (items.darkmode === undefined) {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
            await storage.set({ 'darkmode': true });
            items.darkmode = true;
        } else {
            await storage.set({ 'darkmode': false });
            items.darkmode = false;
        }
    }

    const res = await storage.get(['darkmode']);

    if (items.darkmode === true) {
        document.body.classList.add("dark-mode");
    } else {
        document.body.classList.remove("dark-mode");
    }
}

applyDefaultColorSchemeBasedOnSystem();
