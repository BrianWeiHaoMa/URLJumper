const storage = chrome.storage.local;

const submitButton = document.querySelector('button.submit');
const textarea = document.querySelector('textarea');

loadChanges();

submitButton.addEventListener('click', saveChanges);

async function saveChanges() {
  const textareaContent = textarea.value;
  
  // Save it using the Chrome extension storage API.
  await storage.set({ 'mappings': textareaContent });
  message('Mappings saved');
}

function loadChanges() {
  storage.get('mappings', function (items) {
    // To avoid checking items.css we could specify storage.get({css: ''}) to
    // return a default value of '' if there is no css value yet.
    if (items.mappings) {
      textarea.value = items.mappings;
      message('Loaded saved mappings.');
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
