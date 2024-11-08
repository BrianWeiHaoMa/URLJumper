const storage = chrome.storage.local;

async function applyDefaultColorSchemeBasedOnSystem() {
    const items = await storage.get(['darkmode']);

    if (items.darkmode === undefined) {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
            await storage.set({ 'darkmode': '1' });
            items.darkmode = '1';
        } else {
            await storage.set({ 'darkmode': '0' });
            items.darkmode = '0';
        }
    }

    const res = await storage.get(['darkmode']);
    console.log("res " + res.darkmode);

    if (items.darkmode === '1') {
        document.body.classList.add("dark-mode");
    } else {

        document.body.child
        document.body.classList.remove("dark-mode");
    }
}

applyDefaultColorSchemeBasedOnSystem();
