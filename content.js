// content.js

// content.js

function updateIndexList(panel) {
  const list = panel.querySelector('ul');
  if (!list) return;

  list.innerHTML = ''; // Clear old items
  const userQueries = document.querySelectorAll('user-query');

  userQueries.forEach((query) => {
    let text = '';
    // First, try to find the most specific text container.
    const messageContent = query.querySelector('.message-content, rich-text-viewer');
    if (messageContent) {
      text = messageContent.innerText;
    }

    // If that fails or returns empty text, fall back to the entire user-query element.
    if (!text) {
      text = query.innerText;
    }
    
    text = text.trim();

    if (text) {
      const listItem = document.createElement('li');
      const button = document.createElement('button');
      button.textContent = text.substring(0, 50) + (text.length > 50 ? '...' : '');
      button.title = text;
      button.onclick = () => {
        query.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      listItem.appendChild(button);
      list.appendChild(listItem);
    }
  });
}

function init(chatWindow) {
  // Ensure chat window can contain positioned elements
  if (window.getComputedStyle(chatWindow).position === 'static') {
    chatWindow.style.position = 'relative';
  }

  // 1. Create the main index panel (initially hidden)
  const indexPanel = document.createElement('div');
  indexPanel.id = 'gemini-chat-index';
  indexPanel.classList.add('hidden');
  
  const header = document.createElement('div');
  header.id = 'gemini-chat-index-header';
  
  const indexTitle = document.createElement('h3');
  indexTitle.textContent = 'Chat Index';
  header.appendChild(indexTitle);

  const closeButton = document.createElement('button');
  closeButton.id = 'gemini-index-close';
  closeButton.innerHTML = '&times;'; // 'X' symbol
  header.appendChild(closeButton);
  
  indexPanel.appendChild(header);
  indexPanel.appendChild(document.createElement('ul'));
  chatWindow.appendChild(indexPanel);

  // 2. Create the entry icon (as a div, styled by CSS)
  const entryIcon = document.createElement('div');
  entryIcon.id = 'gemini-entry-icon';
  chatWindow.appendChild(entryIcon);

  // 3. Add event listeners
  entryIcon.addEventListener('click', () => {
    updateIndexList(indexPanel);
    indexPanel.classList.remove('hidden');
    entryIcon.classList.add('hidden');
  });

  closeButton.addEventListener('click', () => {
    indexPanel.classList.add('hidden');
    entryIcon.classList.remove('hidden');
  });

  // 4. Set up MutationObserver to update the list when chat changes
  const observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    for (let mutation of mutations) {
      if (mutation.addedNodes.length) {
        for (let node of mutation.addedNodes) {
          if (node.nodeType === 1 && (node.tagName.toLowerCase() === 'user-query' || node.tagName.toLowerCase() === 'model-response' || node.querySelector('user-query'))) {
            shouldUpdate = true;
            break;
          }
        }
      }
      if(shouldUpdate) break;
    }
    if (shouldUpdate) {
      // If panel is visible, update it.
      if (!indexPanel.classList.contains('hidden')) {
        clearTimeout(window.geminiIndexUpdater);
        window.geminiIndexUpdater = setTimeout(() => updateIndexList(indexPanel), 300);
      }
    }
  });

  observer.observe(chatWindow, { childList: true, subtree: true });
}

// Dynamic detection of <chat-window>
const checkInterval = setInterval(() => {
  const chatWindow = document.querySelector('chat-window');
  if (chatWindow) {
    clearInterval(checkInterval);
    // Check if already initialized
    if (!document.getElementById('gemini-entry-icon')) {
        init(chatWindow);
    }
  }
}, 500);
