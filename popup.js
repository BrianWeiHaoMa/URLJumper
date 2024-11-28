const message = document.querySelector('#message');
const jump = document.querySelector('#jump');
const jumpNewTab = document.querySelector('#jump-new-tab');
const input = document.querySelector('#input');

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

  console.log("made it to popup.js");
});

getMappingNames().then(mappingNames => {
  autocomplete(input, mappingNames);
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


async function handleJump(newTab) {
  let items = await storage.get(['mappings']);

  if (!items.mappings) {
    items.mappings = '';
  }

  const mappings = [];
  const lines = items.mappings.split('\n');
  for (line of lines) {
    const firstBackslashIndex = line.indexOf('\\');

    let lineToCheck = line;
    if (firstBackslashIndex !== -1) {
      // Remove comments from the check.
      lineToCheck = line.substring(0, firstBackslashIndex);
    }

    const words = lineToCheck.trimStart().trimEnd().split(/\s+/);
    if (words.length === 2) {
      const name = words[0];
      const url = words[1];
      mappings.push({ name, url });
    }
  }

  const inputToCheck = input.value.trimStart().trimEnd();

  if (inputToCheck.split(/\s+/g).length !== 1) {
    message.style.color = 'var(--failure)';
    message.innerText = 'Enter exactly 1 word.';
    input.value = input.value.replace(/\s+/g, '');
  } else {
    const mapping = mappings.find(mapping => mapping.name === inputToCheck);

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

      input.value = '';
    } else {
      message.style.color = 'var(--failure)';
      message.innerText = 'No matching name found.';
      input.value = input.value.replace(/\s+/g, '');
    }
  }
}


async function getMappingNames() {
  let items = await storage.get(['mappings']);

  if (!items.mappings) {
    return [];
  }

  const res = [];

  const lines = items.mappings.split('\n');

  for (line of lines) {
    const firstBackslashIndex = line.indexOf('\\');

    let lineToCheck = line;
    if (firstBackslashIndex !== -1) {
      // Remove comments from the check.
      lineToCheck = line.substring(0, firstBackslashIndex);
    }

    const words = lineToCheck.trimStart().trimEnd().split(/\s+/);
    if (words.length === 2) {
      const name = words[0];
      res.push(name);
    }
  }

  return res;
}


// Taken from https://www.w3schools.com/howto/howto_js_autocomplete.asp
// Modified a bit to allow using enter key to submit
function autocomplete(inp, arr) {
  /*the autocomplete function takes two arguments,
  the text field element and an array of possible autocompleted values:*/
  var currentFocus;
  /*execute a function when someone writes in the text field:*/
  inp.addEventListener("input", function(e) {
      var a, b, i, val = this.value;
      /*close any already open lists of autocompleted values*/
      closeAllLists();
      if (!val) { return false;}
      currentFocus = -1;
      /*create a DIV element that will contain the items (values):*/
      a = document.createElement("DIV");
      a.setAttribute("id", this.id + "autocomplete-list");
      a.setAttribute("class", "autocomplete-items");
      /*append the DIV element as a child of the autocomplete container:*/
      this.parentNode.appendChild(a);
      /*for each item in the array...*/
      for (i = 0; i < arr.length; i++) {
        /*check if the item starts with the same letters as the text field value:*/
        if (arr[i].substr(0, val.length).toUpperCase() == val.toUpperCase()) {
          /*create a DIV element for each matching element:*/
          b = document.createElement("DIV");
          /*make the matching letters bold:*/
          b.innerHTML = "<strong>" + arr[i].substr(0, val.length) + "</strong>";
          b.innerHTML += arr[i].substr(val.length);
          /*insert a input field that will hold the current array item's value:*/
          b.innerHTML += "<input type='hidden' value='" + arr[i] + "'>";
          /*execute a function when someone clicks on the item value (DIV element):*/
              b.addEventListener("click", function(e) {
              /*insert the value for the autocomplete text field:*/
              inp.value = this.getElementsByTagName("input")[0].value;
              /*close the list of autocompleted values,
              (or any other open lists of autocompleted values:*/
              closeAllLists();
              /* trigger the jump action */
              handleJump(inp.jumpNewTabPopup);
          });
          a.appendChild(b);
        }
      }
  });
  /*execute a function presses a key on the keyboard:*/
  inp.addEventListener("keydown", function(e) {
      var x = document.getElementById(this.id + "autocomplete-list");
      if (x) x = x.getElementsByTagName("div");
      if (e.keyCode == 40) {
        /*If the arrow DOWN key is pressed,
        increase the currentFocus variable:*/
        currentFocus++;
        /*and and make the current item more visible:*/
        addActive(x);
      } else if (e.keyCode == 38) { //up
        /*If the arrow UP key is pressed,
        decrease the currentFocus variable:*/
        currentFocus--;
        /*and and make the current item more visible:*/
        addActive(x);
      } else if (e.keyCode == 13) {
        /*If the ENTER key is pressed, prevent the form from being submitted,*/
        e.preventDefault();
        if (x && x.length > 0) { /*and simulate a click on the "active" item:*/
          if (currentFocus > -1) {
            x[currentFocus].click();
          } else { /*trigger the jump action on the first item*/
            x[0].click();
          }
        } else {
          /*trigger the jump action*/
          handleJump(inp.jumpNewTabPopup);
        }
      }
  });
  function addActive(x) {
    /*a function to classify an item as "active":*/
    if (!x) return false;
    /*start by removing the "active" class on all items:*/
    removeActive(x);
    if (currentFocus >= x.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = (x.length - 1);
    /*add class "autocomplete-active":*/
    x[currentFocus].classList.add("autocomplete-active");
  }
  function removeActive(x) {
    /*a function to remove the "active" class from all autocomplete items:*/
    for (var i = 0; i < x.length; i++) {
      x[i].classList.remove("autocomplete-active");
    }
  }
  function closeAllLists(elmnt) {
    /*close all autocomplete lists in the document,
    except the one passed as an argument:*/
    var x = document.getElementsByClassName("autocomplete-items");
    for (var i = 0; i < x.length; i++) {
      if (elmnt != x[i] && elmnt != inp) {
      x[i].parentNode.removeChild(x[i]);
    }
  }
}
/*execute a function when someone clicks in the document:*/
document.addEventListener("click", function (e) {
    closeAllLists(e.target);
});
}