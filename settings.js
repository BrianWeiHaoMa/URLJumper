const message = document.querySelector('#message');
const textarea = document.querySelector('textarea');
const submitButton = document.querySelector('#submit');
const toggleColorSchemeButton = document.querySelector('#toggle-color-scheme');

loadChanges();

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

async function loadChanges() {
  await storage.get('mappings', function (items) {
    if ('mappings' in items) {
      textarea.value = items.mappings;
    }
  });
}

async function toggleColorScheme() {
  const items = await storage.get(['darkmode']);

  if (items.darkmode === '1') {
    await storage.set({ 'darkmode': '0' });
    document.body.classList.remove('dark-mode');
    console.log("removing dark mode");
  } else {
    await storage.set({ 'darkmode': '1' });
    document.body.classList.add('dark-mode');
    console.log("adding dark mode");
  }
}
