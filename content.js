// content.js

function updateTocList(popover) {
  const list = popover.querySelector('ul');
  if (!list) return;

  list.innerHTML = ''; // Clear old items
  const userQueries = document.querySelectorAll('user-query');

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
      list.appendChild(listItem);
    }
  });
}

function showPopover() {
  const popover = document.getElementById('gemini-toc-popover');
  const icon = document.getElementById('gemini-entry-icon');
  if (popover && icon) {
    updateTocList(popover);
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
      window.geminiTocUpdater = setTimeout(() => updateTocList(popover), 300);
    }
  });
  observer.observe(chatWindow, { childList: true, subtree: true });
}


const checkInterval = setInterval(() => {
  const chatWindow = document.querySelector('chat-window');
  if (chatWindow && !document.getElementById('gemini-entry-icon')) {
    clearInterval(checkInterval);
    initializeUI(chatWindow);
  }
}, 500);