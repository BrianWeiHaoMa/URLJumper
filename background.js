chrome.commands.onCommand.addListener((command) => {
    const jump = "toggle-popup-jump";
    const jumpNewTab = "toggle-popup-jump-new-tab";
    
    if (command === jump) {
        chrome.action.openPopup();
        setTimeout(() => {
            chrome.runtime.sendMessage({ command: jump }, (response) => {
                console.log(response.status);
            });
        }, 1000);
    } else if (command === jumpNewTab) {
        chrome.action.openPopup();
        setTimeout(() => {
            chrome.runtime.sendMessage({ command: jumpNewTab }, (response) => {
                console.log(response.status);
            });
        }, 1000);
    }
});