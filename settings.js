const storage = chrome.storage.local;

const message = document.querySelector('#message');
const textarea = document.querySelector('textarea');
const submitButton = document.querySelector('#submit');

loadChanges();

submitButton.addEventListener('click', saveChanges);

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

function loadChanges() {
  storage.get('mappings', function (items) {
    if ('mappings' in items) {
      textarea.value = items.mappings;
    }
  });
}

