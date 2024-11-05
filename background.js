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