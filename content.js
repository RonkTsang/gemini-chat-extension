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
    // 1. Extract text from the 'query-text' element for accuracy
    let text = '';
    const textEl = query.querySelector('.query-text');
    if (textEl) {
      text = textEl.innerText;
    } else {
      // Fallback for older structures or plain text queries
      const messageContent = query.querySelector('.message-content, rich-text-viewer');
      if (messageContent) text = messageContent.innerText;
      if (!text) text = query.innerText;
    }
    text = text.trim();

    // 2. Check for a file preview icon or image
    const filePreview = query.querySelector('.new-file-icon, .preview-image');

    // Only create an entry if there is text or a file
    if (text || filePreview) {
      const listItem = document.createElement('li');
      const button = document.createElement('button');
      // Add a class for easier styling
      button.className = 'toc-item-button';

      // 3. Prepend cloned file icon if it exists
      if (filePreview) {
        const iconClone = filePreview.cloneNode(true);
        iconClone.className = 'toc-file-icon'; // Assign a class for styling
        button.appendChild(iconClone);
      }

      // 4. Append text content
      const textSpan = document.createElement('span');
      textSpan.className = 'toc-item-text';
      // If no text, use a placeholder like [Attachment]
      const buttonText = text ? (text.substring(0, 80) + (text.length > 80 ? '...' : '')) : chrome.i18n.getMessage('attachmentLabel');
      textSpan.textContent = buttonText;
      button.appendChild(textSpan);
      
      button.title = text || 'Attachment'; // Set tooltip for the full text or indicator

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
  // --- BUG FIX ---
  // If the popover is already visible, do nothing. This prevents
  // the list from being destructively re-rendered during quick mouse movements.
  if (popover && !popover.classList.contains('hidden')) {
    return;
  }
  // --- END FIX ---

  const icon = document.getElementById('gemini-entry-icon');
  const chatWindow = document.querySelector('chat-window');
  if (popover && icon && chatWindow) {
    updateTocList(popover, chatWindow);
    popover.classList.remove('hidden');
  }
}

function hidePopover() {
  const popover = document.getElementById('gemini-toc-popover');
  // Do not hide if it's pinned
  if (popover && popover.classList.contains('pinned')) {
    return;
  }
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
  chatWindow.appendChild(popover);

  const entryIcon = document.createElement('div');
  entryIcon.id = 'gemini-entry-icon';
  // Add the badge element inside the icon
  entryIcon.innerHTML = '<div id="gemini-pin-badge"></div>';
  chatWindow.appendChild(entryIcon);

  const entryTooltip = tippy(entryIcon, {
    content: chrome.i18n.getMessage('clickToPin'),
    placement: 'right',
    animation: 'shift-away-subtle',
    arrow: false,
    theme: 'gemini-tooltip',
    duration: [null, 0],
    // delay: [150, 0] // 150ms delay on entry, 0ms on exit
  });

  let hideTimeout;

  function togglePinState() {
    clearTimeout(hideTimeout); // Prevent hiding right after pinning
    
    // isNowPinned is true if the class was added, false if removed.
    const isNowPinned = popover.classList.toggle('pinned');
    entryIcon.classList.toggle('active');

    if (isNowPinned) {
      // This runs when we PIN the element.
      showPopover(); // Ensure it's visible. 
    }

    if (isNowPinned) {
      // This runs when we PIN the element.
      entryTooltip.setContent(chrome.i18n.getMessage('unpin'));
    } else {
      // This runs when we UNPIN the element.
      entryTooltip.setContent(chrome.i18n.getMessage('clickToPin'));
    }
  }

  // --- Hybrid Hover and Click Logic ---

  // 1. Hover Logic
  const setupHoverListeners = (element) => {
    element.addEventListener('mouseenter', () => {
      if (popover.classList.contains('pinned')) return;
      clearTimeout(hideTimeout);
      showPopover();
    });

    element.addEventListener('mouseleave', () => {
      hideTimeout = setTimeout(hidePopover, 300);
    });
  };

  setupHoverListeners(entryIcon);
  setupHoverListeners(popover);

  // 2. Click Logic
  entryIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    entryTooltip.hide();
    togglePinState();
  });

  const observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          
          if (node.matches('user-query, model-response') || node.querySelector('user-query, model-response')) {
            shouldUpdate = true;
            break;
          }
        }
      }
      if (shouldUpdate) break;
    }

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