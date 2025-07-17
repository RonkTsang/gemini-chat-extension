// content.js

function updateTocList(popover) {
  const list = popover.querySelector('ul');
  if (!list) return;

  list.innerHTML = ''; // Clear old items
  const userQueries = document.querySelectorAll('user-query');

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
        e.stopPropagation(); // Prevent click from closing the popover
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
    // Add a one-time listener to close the popover
    setTimeout(() => {
        document.addEventListener('click', hidePopover, { once: true });
    }, 0);
  }
}

function hidePopover() {
  const popover = document.getElementById('gemini-toc-popover');
  const icon = document.getElementById('gemini-entry-icon');
  if (popover) {
    popover.classList.add('hidden');
  }
  if (icon) {
    icon.classList.remove('active');
  }
}

function init(chatWindow) {
  if (window.getComputedStyle(chatWindow).position === 'static') {
    chatWindow.style.position = 'relative';
  }

  // 1. Create the popover (initially hidden)
  const popover = document.createElement('div');
  popover.id = 'gemini-toc-popover';
  popover.classList.add('hidden');
  popover.appendChild(document.createElement('ul'));
  // Stop clicks inside the popover from closing it
  popover.addEventListener('click', (e) => e.stopPropagation());
  chatWindow.appendChild(popover);

  // 2. Create the entry icon
  const entryIcon = document.createElement('div');
  entryIcon.id = 'gemini-entry-icon';
  chatWindow.appendChild(entryIcon);

  // 3. Add event listener to the icon
  entryIcon.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent this click from being caught by the document listener
    const isHidden = popover.classList.contains('hidden');
    if (isHidden) {
      showPopover();
    } else {
      hidePopover();
    }
  });

  // 4. Set up MutationObserver
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

// Dynamic detection of <chat-window>
const checkInterval = setInterval(() => {
  const chatWindow = document.querySelector('chat-window');
  if (chatWindow) {
    clearInterval(checkInterval);
    if (!document.getElementById('gemini-entry-icon')) {
        init(chatWindow);
    }
  }
}, 500);