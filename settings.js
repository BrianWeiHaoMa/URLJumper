const message = document.querySelector('#message');
const textarea = document.querySelector('textarea');
const submitButton = document.querySelector('#submit');
const toggleColorSchemeButton = document.querySelector('#toggle-color-scheme');
const copyButton = document.querySelector('#copy-url');

loadMappings();

submitButton.addEventListener('click', saveChanges);
toggleColorSchemeButton.addEventListener('click', toggleColorScheme);


async function saveChanges() {
  if (textarea.value !== '') {
    const lines = textarea.value.split('\n');
    
    const alreadyUsedNames = new Set();
    for (const line of lines) {
      const firstBackslashIndex = line.indexOf('\\');

      let lineToCheck = line;
      if (firstBackslashIndex !== -1) {
        // Remove comments from the check.
        lineToCheck = line.substring(0, firstBackslashIndex);
      }

      const words = lineToCheck.trimStart().trimEnd().split(/\s+/);
      if (words.length === 1 && words[0] === '') {
        continue;
      }

      if (words.length !== 2) {
        message.style.color = 'var(--failure)';
        message.textContent = `Error: Each line must contain exactly two items. Found: "${lineToCheck}".`;
        return;
      }

      if (alreadyUsedNames.has(words[0])) {
        message.style.color = 'var(--failure)';
        message.textContent = `Error: Each name must be unique. Already found: "${words[0]}".`;
        return;
      }

        alreadyUsedNames.add(words[0]);
    }
  }

  await storage.set({ 'mappings': textarea.value });

  message.style.color = 'var(--success)';
  message.textContent = 'Changes have been saved.';
}


async function loadMappings() {
  const mappings = await storage.get('mappings')
  textarea.value = mappings.mappings || '';
}


async function toggleColorScheme() {
  const items = await storage.get(['darkmode']);

  if (items.darkmode === true) {
    await storage.set({ 'darkmode': false });
    document.body.classList.remove('dark-mode');
  } else {
    await storage.set({ 'darkmode': true });
    document.body.classList.add('dark-mode');
  }
}

copyButton.style.width = `${copyButton.offsetWidth}px`; // Set the width dynamically
let pendingTimeout;
let activeTabId;

// Listen for tab activation changes and store the active tab ID
chrome.tabs.onActivated.addListener(function(activeInfo) {
    activeTabId = activeInfo.tabId;
});


// Get the active tab, or last active tab if there is no active tab
function getActiveTab(callback) {
    // Adapted from workaround discussed here: https://stackoverflow.com/a/34214430
    chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
        let tab = tabs[0];

        // If tab not available, fall back to using the stored activeTabId
        if (tab) {
            callback(tab);
        } else {
            chrome.tabs.get(activeTabId, function (tab) {
                if (tab) {
                    callback(tab);
                } else {
                    console.log('No active tab identified.');
                }
            });
        }
    });
}


// Save the active tab to clipboard
async function copyCurrentUrl() {
    getActiveTab(async (tab) => {
        if (tab && tab.url) {
            await navigator.clipboard.writeText(tab.url); // Copy URL to clipboard

            copyButton.textContent = "Copied!";
            textarea.focus();

            // Timeout configuration
            if (pendingTimeout) {
                clearTimeout(pendingTimeout);
            }

            pendingTimeout = setTimeout(() => {
                copyButton.textContent = "Copy Current URL";
            }, 600);
        } else {
            console.error("No valid URL available in the active tab.");
        }
    });
}

// Attach the click event to the button
copyButton.addEventListener('click', copyCurrentUrl);
