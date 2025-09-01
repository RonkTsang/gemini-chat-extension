// content.js
const SEPARATOR = '---------';
let isQuickQuoteEnabled = true; // Default value

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
  const regardingThisText = chrome.i18n.getMessage('regardingThis');

  userQueries.forEach((query) => {
    const listItem = document.createElement('li');
    const button = document.createElement('button');
    
    let isQuote = false;
    let questionText = '';
    let quoteText = '';
    let fullTextToDisplay = '';

    // --- Defensive Reading Logic ---
    // 1. Prioritize the dataset as the source of truth if it exists.
    if (query.dataset.isQuote === 'true') {
      isQuote = true;
      questionText = query.dataset.questionText || '';
      quoteText = query.dataset.quoteText || '';
      fullTextToDisplay = questionText;
    // 2. Fallback: If dataset is not ready, check the raw text content.
    // This handles the race condition where TOC updates before the transformation runs.
    } else {
      const textEl = query.querySelector('.query-text');
      const currentText = (textEl ? textEl.innerText : query.innerText).trim();
      const separatorIndex = currentText.indexOf(SEPARATOR);

      if (currentText.startsWith(regardingThisText) && separatorIndex !== -1) {
        isQuote = true;
        const fullQuotePart = currentText.substring(0, separatorIndex).replace(regardingThisText, '').trim();
        quoteText = fullQuotePart.substring(1); // Remove leading 
        questionText = currentText.substring(separatorIndex + SEPARATOR.length).trim();
        fullTextToDisplay = questionText;
      } else {
        fullTextToDisplay = currentText;
      }
    }

    const filePreview = query.querySelector('.new-file-icon, .preview-image');
    if (!fullTextToDisplay && !filePreview) {
      return; // Skip empty or unprocessed queries
    }

    // --- UI Construction ---
    if (isQuote) {
        button.className = 'toc-item-button toc-item-button-multiline';

        const quoteLine = document.createElement('div');
        quoteLine.className = 'toc-quote-line';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'toc-quote-refer-icon';
        quoteLine.appendChild(iconSpan);

        const quoteSpan = document.createElement('span');
        quoteSpan.className = 'toc-item-quote-text';
        const truncatedQuote = quoteText.substring(0, 70) + (quoteText.length > 70 ? '...' : '');
        quoteSpan.textContent = `"${truncatedQuote}"`;
        quoteLine.appendChild(quoteSpan);

        button.appendChild(quoteLine);

        const textSpan = document.createElement('span');
        textSpan.className = 'toc-item-text';
        const buttonText = fullTextToDisplay.substring(0, 80) + (fullTextToDisplay.length > 80 ? '...' : '');
        textSpan.textContent = buttonText;
        button.appendChild(textSpan);

    } else {
        button.className = 'toc-item-button';
        const iconSpan = document.createElement('span');
        if (filePreview) {
            const iconClone = filePreview.cloneNode(true);
            iconSpan.className = 'toc-file-icon';
            iconSpan.appendChild(iconClone);
        }
        button.appendChild(iconSpan);

        const textSpan = document.createElement('span');
        textSpan.className = 'toc-item-text';
        const buttonText = fullTextToDisplay ? (fullTextToDisplay.substring(0, 80) + (fullTextToDisplay.length > 80 ? '...' : '')) : chrome.i18n.getMessage('attachmentLabel');
        textSpan.textContent = buttonText;
        button.appendChild(textSpan);
    }

    if (isQuote) {
      button.title = `"${quoteText}"
${questionText}`;
    } else {
      button.title = fullTextToDisplay || 'Attachment';
    }

    button.onclick = (e) => {
      e.stopPropagation();
      query.scrollIntoView({ behavior: 'smooth', block: 'start' });
      hidePopover();
    };

    listItem.appendChild(button);
    fragment.appendChild(listItem);
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

let isChatOutlineEnabled = true;

function destroyUI(chatWindow) {
  const popover = chatWindow.querySelector('#gemini-toc-popover');
  if (popover) popover.remove();

  const entryIcon = chatWindow.querySelector('#gemini-entry-icon');
  if (entryIcon) {
    if (entryIcon._tippy) {
      entryIcon._tippy.destroy();
    }
    entryIcon.remove();
  }
  // Note: This doesn't remove the mutation observer from initializeUI for simplicity.
}

function findAndInitialize(node) {
  if (node.nodeType !== 1) return; // We only care about elements

  const processChatWindow = (cw) => {
    if (isChatOutlineEnabled) {
      if (!cw.querySelector('#gemini-entry-icon')) {
        initializeUI(cw);
      }
    } else {
      destroyUI(cw);
    }

    if (isQuickQuoteEnabled) {
      initializeQuoteFeature(cw);
    } else {
      destroyQuoteFeature(cw);
    }
  };

  // Case 1: The node itself is a chat-window
  if (node.matches('chat-window')) {
    processChatWindow(node);
  }

  // Case 2: The node contains one or more chat-windows
  const chatWindows = node.querySelectorAll('chat-window');
  chatWindows.forEach(processChatWindow);
}

function handleMouseUp(event) {
    const chatWindow = event.currentTarget;
    const quoteTooltip = chatWindow._geminiQuoteTooltip;
    if (!quoteTooltip) return;

    if (window.geminiQuoteTooltipDebounce) {
        clearTimeout(window.geminiQuoteTooltipDebounce);
    }
    window.geminiQuoteTooltipDebounce = setTimeout(() => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (selectedText && event.target.closest('message-content') && selection.rangeCount > 0) {
            if (event.target.closest('#gemini-toc-popover')) {
                quoteTooltip.hide();
                return;
            }

            const range = selection.getRangeAt(0);
            const selectionRect = range.getBoundingClientRect();
            const clampedX = Math.max(selectionRect.left, Math.min(event.clientX, selectionRect.right));
            const clampedY = Math.max(selectionRect.top, Math.min(event.clientY, selectionRect.bottom));

            const virtualRect = {
                width: 0, height: 0, top: clampedY, bottom: clampedY, left: clampedX, right: clampedX,
            };

            quoteTooltip.setProps({ getReferenceClientRect: () => virtualRect });
            quoteTooltip.show();
        } else {
            quoteTooltip.hide();
        }
    }, 100);
}

function handleMouseDown(event) {
    const quoteTooltip = document.body._geminiGlobalQuoteTooltip;
    if (quoteTooltip && !event.target.closest('.tippy-box') && !event.target.closest('#gemini-quote-button')) {
        quoteTooltip.hide();
    }
}

function initializeQuoteFeature(chatWindow) {
  if (chatWindow._geminiQuoteInitialized) return;

  const quoteTooltip = tippy(chatWindow, {
    content: chrome.i18n.getMessage('askGemini'),
    placement: 'top',
    animation: 'slide-up-subtle',
    arrow: false,
    theme: 'quote-tooltip-theme',
    trigger: 'manual',
    hideOnClick: false,
    interactive: true,
    appendTo: chatWindow,
    onShow(instance) {
      const button = document.createElement('button');
      button.className = 'gemini-quote-button';
      const icon = document.createElement('span');
      icon.className = 'gemini-quote-button-icon';
      const label = document.createElement('span');
      label.textContent = chrome.i18n.getMessage('askGemini');
      button.appendChild(icon);
      button.appendChild(label);
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

  chatWindow._geminiQuoteTooltip = quoteTooltip;
  document.body._geminiGlobalQuoteTooltip = quoteTooltip; // For global mousedown access

  chatWindow.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('mousedown', handleMouseDown);

  chatWindow._geminiQuoteInitialized = true;
}

function destroyQuoteFeature(chatWindow) {
    if (!chatWindow._geminiQuoteInitialized) return;

    chatWindow.removeEventListener('mouseup', handleMouseUp);
    // The mousedown listener is on document, handle it carefully
    // For simplicity, we'll leave it, but in a complex app, we'd manage it better.
    
    if (chatWindow._geminiQuoteTooltip) {
        chatWindow._geminiQuoteTooltip.destroy();
        chatWindow._geminiQuoteTooltip = null;
    }
    
    document.body._geminiGlobalQuoteTooltip = null;
    chatWindow._geminiQuoteInitialized = false;
}

function removeQuoteUI() {
  const quoteUI = document.getElementById('gemini-quote-ui');
  if (quoteUI) {
    if (quoteUI.observer) {
      quoteUI.observer.disconnect();
    }
    quoteUI.remove();
  }
  
  const refText = document.getElementById('gemini-quote-reference-text');
  if (refText) refText.remove();
  
  const separator = document.getElementById('gemini-quote-separator');
  if (separator) separator.remove();

  const sentinel = document.getElementById('gemini-quote-sentinel');
  if (sentinel) sentinel.remove();
}

function addQuoteUI(selectedText) {
  const inputContainer = document.querySelector('rich-textarea');
  if (!inputContainer) return;

  // --- Truncation Constants ---
  const MAX_DISPLAY_LENGTH = 150;
  const DISPLAY_START_SNIPPET = 80;
  const DISPLAY_END_SNIPPET = 60;
  const MAX_HIDDEN_LENGTH = 2000;
  const HIDDEN_START_SNIPPET = 1000;
  const HIDDEN_END_SNIPPET = 900;

  // --- Robust Cleanup ---
  removeQuoteUI();

  // --- Prepare Text Versions ---
  let displayText = selectedText;
  if (selectedText.length > MAX_DISPLAY_LENGTH) {
    const start = selectedText.substring(0, DISPLAY_START_SNIPPET);
    const end = selectedText.substring(selectedText.length - DISPLAY_END_SNIPPET);
    displayText = `${start.trim()} ... ${end.trim()}`;
  }
  displayText = displayText.replace(/\s+/g, ' ').trim();

  let hiddenText = selectedText;
  if (selectedText.length > MAX_HIDDEN_LENGTH) {
    const start = selectedText.substring(0, HIDDEN_START_SNIPPET);
    const end = selectedText.substring(selectedText.length - HIDDEN_END_SNIPPET);
    hiddenText = `${start} ... ${end}`;
  }

  // --- Secure UI Construction ---
  const quoteUI = document.createElement('div');
  quoteUI.id = 'gemini-quote-ui';

  const iconSpan = document.createElement('span');
  iconSpan.className = 'quote-icon';

  const textSpan = document.createElement('span');
  textSpan.className = 'quote-text';
  textSpan.textContent = `"${displayText}"`;
  textSpan.title = selectedText; // Full text on hover

  const closeButton = document.createElement('button');
  closeButton.id = 'gemini-quote-close-btn';
  closeButton.textContent = '\u00d7';

  quoteUI.appendChild(iconSpan);
  quoteUI.appendChild(textSpan);
  quoteUI.appendChild(closeButton);

  const qlEditor = inputContainer.querySelector('.ql-editor');
  if (qlEditor) {
    inputContainer.insertBefore(quoteUI, qlEditor);
  }

  // --- Create Hidden Elements ---
  const referenceText = document.createElement('p');
  referenceText.id = 'gemini-quote-reference-text';
  referenceText.style.display = 'none';
  referenceText.style.userSelect = 'none';
  referenceText.style.pointerEvents = 'none';
  referenceText.contentEditable = 'false';
  const regardingThisText = chrome.i18n.getMessage('regardingThis');
  referenceText.textContent = `${regardingThisText}: ${hiddenText}`;
  referenceText.appendChild(document.createElement('br'));

  const separator = document.createElement('p');
  separator.id = 'gemini-quote-separator';
  separator.style.display = 'none';
  separator.style.userSelect = 'none';
  separator.style.pointerEvents = 'none';
  separator.contentEditable = 'false';
  separator.innerHTML = SEPARATOR;

  const sentinel = document.createElement('p');
  sentinel.id = 'gemini-quote-sentinel';
  sentinel.style.display = 'none';
  sentinel.style.userSelect = 'none';
  sentinel.style.pointerEvents = 'none';
  sentinel.contentEditable = 'false';
  sentinel.innerHTML = '<br/>';
  
  if (qlEditor) {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(referenceText);
    fragment.appendChild(separator);
    fragment.appendChild(sentinel);
    qlEditor.prepend(fragment);
    
    qlEditor.focus();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (Array.from(mutation.removedNodes).includes(sentinel)) {
          removeQuoteUI();
          return;
        }
      }
    });

    observer.observe(qlEditor, { childList: true });
    quoteUI.observer = observer;
  }

  closeButton.onclick = removeQuoteUI;
}

function transformQuoteInHistory(userQueryElement) {
  const queryTextEl = userQueryElement.querySelector('.query-text');
  if (!queryTextEl || queryTextEl.dataset.transformed) return;

  const lines = Array.from(queryTextEl.querySelectorAll('p.query-text-line'));
  if (lines.length < 2) return;

  const regardingThisText = chrome.i18n.getMessage('regardingThis');
  const firstLineText = lines[0].textContent.trim();
  const secondLineText = lines[1].textContent.trim();

  if (firstLineText.startsWith(regardingThisText + ':') && secondLineText === SEPARATOR) {
    const fullText = lines.map(p => p.textContent).join('\n');
    const separatorIndex = fullText.indexOf(SEPARATOR);
    
    const quotePart = firstLineText.substring(regardingThisText.length + 1).trim();
    const questionPart = fullText.substring(separatorIndex + SEPARATOR.length).trim();

    // --- Write to dataset for other functions to use ---
    userQueryElement.dataset.isQuote = 'true';
    userQueryElement.dataset.quoteText = quotePart;
    userQueryElement.dataset.questionText = questionPart;
    
    // --- Create new UI ---
    const quoteDisplay = document.createElement('div');
    quoteDisplay.className = 'gemini-quote-display';

    // Create and add the icon to align with gemini-quote-ui
    const iconSpan = document.createElement('span');
    iconSpan.className = 'quote-icon';
    quoteDisplay.appendChild(iconSpan);

    const quoteDisplayText = document.createElement('span');
    quoteDisplayText.className = 'gemini-quote-display-text';
    
    const MAX_HISTORY_DISPLAY_LENGTH = 120;
    if (quotePart.length > MAX_HISTORY_DISPLAY_LENGTH) {
      quoteDisplayText.textContent = quotePart.substring(0, MAX_HISTORY_DISPLAY_LENGTH).trim() + '...';
    } else {
      quoteDisplayText.textContent = quotePart;
    }
    quoteDisplay.title = quotePart; // Full quote on hover
    
    quoteDisplay.appendChild(quoteDisplayText);

    // --- Modify existing DOM ---
    queryTextEl.prepend(quoteDisplay);
    
    const originalLines = queryTextEl.querySelectorAll('p.query-text-line');
    originalLines.forEach(line => line.style.display = 'none');
    
    const newQuestionLine = document.createElement('p');
    newQuestionLine.className = 'query-text-line';
    newQuestionLine.textContent = questionPart;
    queryTextEl.appendChild(newQuestionLine);

    queryTextEl.dataset.transformed = 'true';
  }
}


// --- Main Execution ---

// 1. Load settings and then initialize
chrome.storage.sync.get({
  enableChatOutline: true,
  enableQuickQuote: true 
}, (data) => {
    isChatOutlineEnabled = data.enableChatOutline;
    isQuickQuoteEnabled = data.enableQuickQuote;

    // Create a persistent observer to watch for chat-window additions
    const mainObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            // Proactive cleanup on chat switch
            if (mutation.removedNodes.length > 0 && document.getElementById('gemini-quote-sentinel')) {
                let chatWasCleared = false;
                for (const node of mutation.removedNodes) {
                    if (node.nodeType === 1 && (node.matches('user-query, model-response') || node.querySelector('user-query, model-response'))) {
                        chatWasCleared = true;
                        break;
                    }
                }
                if (chatWasCleared) {
                    removeQuoteUI();
                }
            }

            for (const addedNode of mutation.addedNodes) {
                if (addedNode.nodeType !== 1) continue;
                
                // Initialize main features if a chat-window is added
                findAndInitialize(addedNode);

                // Also, check if a user-query was added to transform it
                if (addedNode.matches('user-query')) {
                    transformQuoteInHistory(addedNode);
                }
                addedNode.querySelectorAll('user-query').forEach(transformQuoteInHistory);
            }
        }
    });

    // Start by checking if the chat-window is already on the page
    findAndInitialize(document.body);
    // Also transform any existing user queries on load
    document.querySelectorAll('user-query').forEach(transformQuoteInHistory);


    // Then, observe the entire body for future changes
    mainObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
});

// 2. Listen for changes in settings
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'sync') return;
    const chatWindows = document.querySelectorAll('chat-window');

    if (changes.enableChatOutline) {
        isChatOutlineEnabled = changes.enableChatOutline.newValue;
        chatWindows.forEach(cw => {
            if (isChatOutlineEnabled) {
                initializeUI(cw);
            } else {
                destroyUI(cw);
            }
        });
    }

    if (changes.enableQuickQuote) {
        isQuickQuoteEnabled = changes.enableQuickQuote.newValue;
        chatWindows.forEach(cw => {
            if (isQuickQuoteEnabled) {
                initializeQuoteFeature(cw);
            } else {
                destroyQuoteFeature(cw);
            }
        });
    }
});
