const storage = chrome.storage.local;

const submitButton = document.querySelector('button.submit');
const textarea = document.querySelector('textarea');

loadChanges();

submitButton.addEventListener('click', saveChanges);

async function saveChanges() {
  const textareaContent = textarea.value;

  await storage.set({ 'mappings': textareaContent });
}

function loadChanges() {
  storage.get('mappings', function (items) {
    if ('mappings' in items) {
      textarea.value = items.mappings;
    } else {
      textarea.value = '';
      saveChanges();
    }
  });
}

let messageClearTimer;
function message(msg) {
  clearTimeout(messageClearTimer);
  const message = document.querySelector('.message');
  message.innerText = msg;
  messageClearTimer = setTimeout(function () {
    message.innerText = '';
  }, 3000);
}
