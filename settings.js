const message = document.querySelector('#message');
const textarea = document.querySelector('textarea');
const submitButton = document.querySelector('#submit');
const toggleColorSchemeButton = document.querySelector('#toggle-color-scheme');
const currentUrl = document.querySelector('#current-url');

(async () => {
  const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
  currentUrl.textContent = tab.url;
})();

loadMappings();

submitButton.addEventListener('click', saveChanges);
toggleColorSchemeButton.addEventListener('click', toggleColorScheme);

async function saveChanges() {
  if (textarea.value !== '') {
    const lines = textarea.value.split('\n');
    
    let res = '';
    const alreadyUsed = new Set();
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine === '') {
        res += '\n';
      } else {
        const words = trimmedLine.split(/\s+/);        
        
        if (words.length !== 2) {
          message.style.color = 'var(--failure)';
          message.textContent = `Error: Each line must contain exactly two items. Found: "${line}".`;
          return;
        }

        if (alreadyUsed.has(words[0])) {
          message.style.color = 'var(--failure)';
          message.textContent = `Error: Each name must be unique. Already found: "${words[0]}".`;
          return;
        }

        alreadyUsed.add(words[0]);
        res += trimmedLine + '\n';
      }
    }

    const lastChar = textarea.value.slice(-1);
    if (lastChar === '\n' || lastChar === ' ') {
      res = res.slice(0, -1);
    }
    
    textarea.value = res;
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
