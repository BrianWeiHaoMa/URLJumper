chrome.commands.onCommand.addListener((command) => {
    const jump = "toggle-popup-jump";
    const jumpNewTab = "toggle-popup-jump-new-tab";

    if (command === jump) 
    {
        chrome.action.openPopup();
        setTimeout(() => {
            chrome.runtime.sendMessage({ command: jump });
        }, 1000);
    }
    else if (command === jumpNewTab) 
    {
        chrome.action.openPopup();
        setTimeout(() => {
            chrome.runtime.sendMessage({ command: jumpNewTab });
        }, 1000);
    }
});
