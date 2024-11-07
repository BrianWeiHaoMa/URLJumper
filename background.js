chrome.commands.onCommand.addListener((command) => {
    const jump = "toggle-popup-jump";
    const jumpNewTab = "toggle-popup-jump-new-tab";
    
    if (command === jump) {
        chrome.action.openPopup();
        setTimeout(() => {
            chrome.runtime.sendMessage({ command: jump }, logResponseStatus);
        }, 1000);
    } else if (command === jumpNewTab) {
        chrome.action.openPopup();
        setTimeout(() => {
            chrome.runtime.sendMessage({ command: jumpNewTab }, logResponseStatus);
        }, 1000);
    }
});

function logResponseStatus(response) {
    console.log(response.status);
}

function applyThemeBasedOnSystem() {
    const darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.body.classList.toggle("dark-mode", darkMode);
}

// Apply theme on load
applyThemeBasedOnSystem();

// Listen for theme changes
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyThemeBasedOnSystem);
