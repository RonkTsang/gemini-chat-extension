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
      initializeQuoteFeature(node);
    }
  }

  // Case 2: The node contains one or more chat-windows
  // This is common when the main app container is added to the DOM
  const chatWindows = node.querySelectorAll('chat-window');
  chatWindows.forEach(cw => {
    if (!cw.querySelector('#gemini-entry-icon')) {
      initializeUI(cw);
      initializeQuoteFeature(cw);
    }
  });
}

function initializeQuoteFeature(chatWindow) {
  const quoteTooltip = tippy(chatWindow, {
    content: chrome.i18n.getMessage('askGemini'),
    placement: 'top',
    animation: 'shift-away-subtle',
    arrow: false,
    theme: 'quote-tooltip-theme',
    trigger: 'manual',
    hideOnClick: false,
    interactive: true,
    appendTo: chatWindow,
    onShow(instance) {
      const button = document.createElement('button');
      button.className = 'gemini-quote-button';
      button.innerHTML = `
        <span class="gemini-quote-button-icon"></span>
        <span>${chrome.i18n.getMessage('askGemini')}</span>
      `;
      button.onclick = () => {
        const selectedText = window.getSelection().toString();
        if (selectedText) {
          addQuoteUI(selectedText);
        }
        instance.hide();
      };
      instance.setContent(button);
    },
  });

  chatWindow.addEventListener('mouseup', (event) => {
    // Debounce the event to prevent firing multiple times
    if (window.geminiQuoteTooltipDebounce) {
      clearTimeout(window.geminiQuoteTooltipDebounce);
    }
    window.geminiQuoteTooltipDebounce = setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      if (selectedText && event.target.closest('message-content') && selection.rangeCount > 0) {
        // Prevent the tooltip from showing if the selection is part of the TOC popover
        if (event.target.closest('#gemini-toc-popover')) {
          quoteTooltip.hide();
          return;
        }

        const range = selection.getRangeAt(0);
        const selectionRect = range.getBoundingClientRect();

        // Clamp the mouse position to be within the selection's bounds
        const clampedX = Math.max(
          selectionRect.left,
          Math.min(event.clientX, selectionRect.right)
        );
        const clampedY = Math.max(
          selectionRect.top,
          Math.min(event.clientY, selectionRect.bottom)
        );

        const virtualRect = {
          width: 0,
          height: 0,
          top: clampedY,
          bottom: clampedY,
          left: clampedX,
          right: clampedX,
        };

        quoteTooltip.setProps({
          getReferenceClientRect: () => virtualRect,
        });
        quoteTooltip.show();
      } else {
        quoteTooltip.hide();
      }
    }, 100);
  });

  document.addEventListener('mousedown', (event) => {
    // Also check the tippy's parent, which is now chatWindow
    if (!event.target.closest('.tippy-box') && !event.target.closest('#gemini-quote-button')) {
      quoteTooltip.hide();
    }
  });
}

function addQuoteUI(selectedText) {
  const inputContainer = document.querySelector('rich-textarea');
  if (!inputContainer) return;

  // --- Robust Cleanup ---
  // Disconnect any existing observer before removing elements
  const existingQuoteUI = document.getElementById('gemini-quote-ui');
  if (existingQuoteUI && existingQuoteUI.observer) {
    existingQuoteUI.observer.disconnect();
  }
  // Now, safely remove old elements
  if (existingQuoteUI) {
    existingQuoteUI.remove();
  }
  const existingFakeContent = document.getElementById('gemini-fake-content');
  if (existingFakeContent) {
    existingFakeContent.remove();
  }
  // --- End Cleanup ---

  const quoteUI = document.createElement('div');
  quoteUI.id = 'gemini-quote-ui';
  quoteUI.innerHTML = `
    <span class="quote-icon"></span>
    <span class="quote-text">"${selectedText}"</span>
    <button id="gemini-quote-close-btn">&times;</button>
  `;

  const qlEditor = inputContainer.querySelector('.ql-editor');
  if (qlEditor) {
    inputContainer.insertBefore(quoteUI, qlEditor);
  }

  const fakeContent = document.createElement('p');
  fakeContent.id = 'gemini-fake-content';
  fakeContent.style.display = 'none';
  fakeContent.style.userSelect = 'none';
  fakeContent.style.pointerEvents = 'none';
  fakeContent.contentEditable = 'false';
  fakeContent.innerHTML = `Referring to this in particular: ${selectedText}<br/>`;
  
  if (qlEditor) {
    qlEditor.prepend(fakeContent);
    qlEditor.focus();

    // --- State Synchronization Logic ---
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (Array.from(mutation.removedNodes).includes(fakeContent)) {
          quoteUI.remove();
          observer.disconnect();
          return;
        }
      }
    });

    observer.observe(qlEditor, { childList: true });
    // Store the observer on the UI element for later cleanup
    quoteUI.observer = observer;
  }

  const closeButton = document.getElementById('gemini-quote-close-btn');
  closeButton.onclick = () => {
    // Manually trigger cleanup
    if (quoteUI.observer) {
      quoteUI.observer.disconnect();
    }
    quoteUI.remove();
    fakeContent.remove();
  };
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