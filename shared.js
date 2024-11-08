function applyThemeBasedOnSystem() {
    const darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.body.classList.toggle("dark-mode", darkMode);
}

// Apply theme on load
applyThemeBasedOnSystem();

// Listen for theme changes
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyThemeBasedOnSystem);
