const storage = chrome.storage.local;

const message = document.querySelector('#message');
const jump = document.querySelector('#jump');
const jumpNewTab = document.querySelector('#jump-new-tab');
const input = document.querySelector('textarea');

input.jumpNewTabPopup = true;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === "toggle-popup-jump") {
    input.jumpNewTabPopup = false;
    sendResponse({ status: "toggle-popup-jump" });
  } else if (message.command === "toggle-popup-jump-new-tab") {
    input.jumpNewTabPopup = true;
    sendResponse({ status: "toggle-popup-jump-new-tab" });
  } else {
    sendResponse({ status: "nothing chosen" });
  }
});


jump.addEventListener('click', () => {
  handleJump(false);
});

jumpNewTab.addEventListener('click', () => {
  handleJump(true)
});

input.addEventListener('input', (event) => {
  const jumpNewTabPopup = event.target.jumpNewTabPopup;
  if (input.value.includes('\n')) {
    handleJump(jumpNewTabPopup);
  }
});

input.focus();


async function handleJump (newTab) {
  let items = await storage.get(['mappings']);

  if (!items.mappings) {
    await storage.set({ 'mappings': '' });
    items = await storage.get(['mappings']);
  }

  const mappings = items.mappings.split('\n').map(line => {
    const [name, url] = line.split(' ');
    return { name, url };
  });

  const textarea = document.querySelector('textarea');
  const firstWord = textarea.value.replace(/\s+/g, '').split(' ')[0];
  const mapping = mappings.find(mapping => mapping.name === firstWord);

  if (mapping) {
    let url = mapping.url
    if (!/^https?:\/\//i.test(url)) {
      url = 'http://' + url;
    }

    if (newTab) {
      chrome.tabs.create({ 'url': url });
    } else {
      chrome.tabs.update({ 'url': url });
    }

    textarea.value = '';
  } else {
    message.innerText = 'No matching name found.';
    textarea.value = textarea.value.replace(/\s+/g, '');
  }
}
