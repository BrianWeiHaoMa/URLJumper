chrome.commands.onCommand.addListener(async (command) => {
    const jump = "toggle-popup-jump";
    const jumpNewTab = "toggle-popup-jump-new-tab";

    if (command === jump) 
    {
        await chrome.action.openPopup();
        chrome.runtime.sendMessage({ command: jump });
    }
    else if (command === jumpNewTab) 
    {
        await chrome.action.openPopup();
        chrome.runtime.sendMessage({ command: jumpNewTab });
    }
});
