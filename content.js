// content.js

function updateTocList(popover, chatWindow) {
  const list = popover.querySelector('ul');
  if (!list || !chatWindow) return;

  list.innerHTML = ''; // Clear old items
  const userQueries = chatWindow.querySelectorAll('user-query');

  if (userQueries.length === 0) {
    const message = chrome.i18n.getMessage('emptyTocMessage');
    const listItem = document.createElement('li');
    listItem.textContent = message;
    listItem.style.padding = '10px';
    listItem.style.textAlign = 'center';
    listItem.style.color = '#888';
    list.appendChild(listItem);
    return;
  }

  const fragment = document.createDocumentFragment();
  userQueries.forEach((query) => {
    let text = '';
    const messageContent = query.querySelector('.message-content, rich-text-viewer');
    if (messageContent) text = messageContent.innerText;
    if (!text) text = query.innerText;
    
    text = text.trim();

    if (text) {
      const listItem = document.createElement('li');
      const button = document.createElement('button');
      button.textContent = text.substring(0, 80) + (text.length > 80 ? '...' : '');
      button.title = text;
      button.onclick = (e) => {
        e.stopPropagation();
        query.scrollIntoView({ behavior: 'smooth', block: 'start' });
        hidePopover();
      };
      listItem.appendChild(button);
      fragment.appendChild(listItem);
    }
  });
  list.appendChild(fragment);
}

function showPopover() {
  const popover = document.getElementById('gemini-toc-popover');
  const icon = document.getElementById('gemini-entry-icon');
  const chatWindow = document.querySelector('chat-window');
  if (popover && icon && chatWindow) {
    updateTocList(popover, chatWindow);
    popover.classList.remove('hidden');
    icon.classList.add('active');
    setTimeout(() => {
        document.addEventListener('click', hidePopover, { once: true });
    }, 0);
  }
}

function hidePopover() {
  const popover = document.getElementById('gemini-toc-popover');
  const icon = document.getElementById('gemini-entry-icon');
  if (popover) popover.classList.add('hidden');
  if (icon) icon.classList.remove('active');
}

function initializeUI(chatWindow) {
  if (window.getComputedStyle(chatWindow).position === 'static') {
    chatWindow.style.position = 'relative';
  }

  const popover = document.createElement('div');
  popover.id = 'gemini-toc-popover';
  popover.classList.add('hidden');
  popover.appendChild(document.createElement('ul'));
  popover.addEventListener('click', (e) => e.stopPropagation());
  chatWindow.appendChild(popover);

  const entryIcon = document.createElement('div');
  entryIcon.id = 'gemini-entry-icon';
  chatWindow.appendChild(entryIcon);

  // Initialize Tippy.js tooltip, which is now available globally
  tippy(entryIcon, {
    content: 'Chat Outline',
    placement: 'bottom',
    animation: 'shift-away-subtle',
    arrow: false,
    theme: 'gemini-tooltip'
  });

  entryIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = popover.classList.contains('hidden');
    if (isHidden) showPopover();
    else hidePopover();
  });

  const observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          // We only care about element nodes
          if (node.nodeType !== 1) continue;
          
          // Check if the added node is, or contains, a query or response
          if (node.matches('user-query, model-response') || node.querySelector('user-query, model-response')) {
            shouldUpdate = true;
            break;
          }
        }
      }
      if (shouldUpdate) break;
    }

    // Only update if a relevant change happened AND the popover is visible
    if (shouldUpdate && !popover.classList.contains('hidden')) {
      clearTimeout(window.geminiTocUpdater);
      window.geminiTocUpdater = setTimeout(() => updateTocList(popover, chatWindow), 300);
    }
  });
  observer.observe(chatWindow, { childList: true, subtree: true });
}

// --- Robust Initialization ---

function findAndInitialize(node) {
  if (node.nodeType !== 1) return; // We only care about elements

  // Case 1: The node itself is a chat-window
  if (node.matches('chat-window')) {
    // Check if it's already initialized to prevent re-running
    if (!node.querySelector('#gemini-entry-icon')) {
      initializeUI(node);
    }
  }

  // Case 2: The node contains one or more chat-windows
  // This is common when the main app container is added to the DOM
  const chatWindows = node.querySelectorAll('chat-window');
  chatWindows.forEach(cw => {
    if (!cw.querySelector('#gemini-entry-icon')) {
      initializeUI(cw);
    }
  });
}

// Create a persistent observer to watch for chat-window additions
const mainObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const addedNode of mutation.addedNodes) {
      findAndInitialize(addedNode);
    }
  }
});

// Start by checking if the chat-window is already on the page
findAndInitialize(document.body);

// Then, observe the entire body for future changes
mainObserver.observe(document.body, {
  childList: true,
  subtree: true
});