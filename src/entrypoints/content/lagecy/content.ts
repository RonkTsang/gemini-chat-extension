// @ts-nocheck

import './style.css';
import { SEPARATOR } from '@/common/const';
import tippy, { createSingleton } from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import { eventBus } from '@/utils/eventbus';
import { type AppEvents, EVENTS } from '@/common/event';
import { useChainPromptStore } from '@/stores/chainPromptStore'
import { browser } from 'wxt/browser';
import { quickFollowStore } from '@/stores/quickFollowStore'
import { i18nCache } from '@/utils/i18nCache'

/**
 * i18n keys used by legacy content script features
 * These keys are cached on module initialization to ensure availability after extension context invalidation
 */
const LEGACY_I18N_KEYS = {
  EMPTY_TOC_MESSAGE: 'emptyTocMessage',
  REGARDING_THIS: 'regardingThis',
  ATTACHMENT_LABEL: 'attachmentLabel',
  CLICK_TO_PIN: 'clickToPin',
  UNPIN: 'unpin',
  IMAGE: 'common.image',
  IMAGES: 'common.images',
  VIDEO: 'common.video',
  VIDEOS: 'common.videos'
} as const

requestIdleCallback(() => {
  // Pre-cache i18n strings for legacy UI features
  // This ensures strings are available even if extension context becomes invalid
  i18nCache.preCache(
    [
      { key: LEGACY_I18N_KEYS.EMPTY_TOC_MESSAGE },
      { key: LEGACY_I18N_KEYS.REGARDING_THIS },
      { key: LEGACY_I18N_KEYS.ATTACHMENT_LABEL },
      { key: LEGACY_I18N_KEYS.CLICK_TO_PIN },
      { key: LEGACY_I18N_KEYS.UNPIN },
      { key: LEGACY_I18N_KEYS.IMAGE },
      { key: LEGACY_I18N_KEYS.IMAGES },
      { key: LEGACY_I18N_KEYS.VIDEO },
      { key: LEGACY_I18N_KEYS.VIDEOS }
    ]
  )
})


let isQuickQuoteEnabled = quickFollowStore.getState().settings.enabled;

quickFollowStore.getState().hydrate().catch((error) => {
  console.error('Failed to hydrate quick follow store:', error)
})

quickFollowStore.subscribe((state, previousState) => {
  const prevEnabled = previousState?.settings?.enabled
  if (prevEnabled === state.settings.enabled) {
    return
  }

  isQuickQuoteEnabled = state.settings.enabled
  const chatWindows = document.querySelectorAll('chat-window')
  chatWindows.forEach((cw) => {
    if (isQuickQuoteEnabled) {
      initializeQuoteFeature(cw)
    } else {
      destroyQuoteFeature(cw)
    }
  })
})

function updateTocList(popover, chatWindow) {
  const list = popover.querySelector('ul');
  if (!list || !chatWindow) return;

  // Clean up all Tippy instances and stored data before clearing DOM
  // IMPORTANT: Must destroy individual instances before singleton
  const existingButtons = list.querySelectorAll('button[data-has-images="true"]');
  existingButtons.forEach((button) => {
    if (button._tippy) {
      button._tippy.destroy();
    }
    // Clear stored data to prevent memory leaks
    delete button._imageData;
  });

  // Now destroy the singleton (which manages the destroyed instances)
  if (popover._previewSingleton) {
    popover._previewSingleton.destroy();
    popover._previewSingleton = null;
  }

  list.innerHTML = ''; // Clear old items
  const userQueries = chatWindow.querySelectorAll('user-query');

  if (userQueries.length === 0) {
    const message = i18nCache.get(LEGACY_I18N_KEYS.EMPTY_TOC_MESSAGE);
    const listItem = document.createElement('li');
    listItem.textContent = message;
    listItem.style.padding = '10px';
    listItem.style.textAlign = 'center';
    listItem.style.color = '#888';
    list.appendChild(listItem);
    return;
  }

  const fragment = document.createDocumentFragment();
  const regardingThisText = i18nCache.get(LEGACY_I18N_KEYS.REGARDING_THIS);

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
    
    // Extract all file names and count attachments
    const fileNames: string[] = [];
    let totalAttachments = 0;
    
    // Get all file buttons (PDF, docs, etc.) with explicit file names
    const fileButtons = query.querySelectorAll('button.new-file-preview-file');
    fileButtons.forEach((btn) => {
      const ariaLabel = btn.getAttribute('aria-label');
      if (ariaLabel) {
        fileNames.push(ariaLabel);
        totalAttachments++;
      }
    });
    
    // Get all actual image elements (not just containers)
    // This ensures count matches what users can actually preview
    const imageElements = query.querySelectorAll('button.preview-image-button img[data-test-id="uploaded-img"]');
    const actualImageCount = imageElements.length;
    totalAttachments += actualImageCount;
    
    // Get all actual video thumbnail elements (not just containers)
    const videoThumbnails = query.querySelectorAll('img[data-test-id="video-thumbnail"]');
    const actualVideoCount = videoThumbnails.length;
    totalAttachments += actualVideoCount;
    
    if (!fullTextToDisplay && !filePreview && totalAttachments === 0) {
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
        
        // Display multiple icons for multiple attachments
        const MAX_ICONS_DISPLAY = 4; // Maximum number of icons to show
        if (totalAttachments > 0) {
          // Get all file/image/video preview elements
          const allPreviews = query.querySelectorAll('.new-file-icon, .preview-image, img[data-test-id="video-thumbnail"]');
          const iconsToShow = Math.min(allPreviews.length, MAX_ICONS_DISPLAY);
          
          if (iconsToShow === 1) {
            iconSpan.className = 'toc-file-icon single-icon';
          } else {
            iconSpan.className = 'toc-file-icon';
          }
          
          // Clone and append up to MAX_ICONS_DISPLAY icons
          for (let i = 0; i < iconsToShow; i++) {
            const iconClone = allPreviews[i].cloneNode(true);
            iconSpan.appendChild(iconClone);
          }
          
          // If there are more attachments, show "+N" indicator
          if (allPreviews.length > MAX_ICONS_DISPLAY) {
            const moreSpan = document.createElement('span');
            moreSpan.className = 'toc-file-icon-more';
            moreSpan.textContent = `+${allPreviews.length - MAX_ICONS_DISPLAY}`;
            iconSpan.appendChild(moreSpan);
          }
        } else if (filePreview) {
          // Fallback: if no totalAttachments but filePreview exists
          const iconClone = filePreview.cloneNode(true);
          iconSpan.className = 'toc-file-icon single-icon';
          iconSpan.appendChild(iconClone);
        }
        
        button.appendChild(iconSpan);

        const textSpan = document.createElement('span');
        textSpan.className = 'toc-item-text';
        
        // Logic 1 & 3: Display text based on attachments and user message
        let buttonText;
        if (fullTextToDisplay) {
          // Has user message text
          buttonText = fullTextToDisplay.substring(0, 80) + (fullTextToDisplay.length > 80 ? '...' : '');
        } else if (totalAttachments > 0) {
          // No user message but has attachments
          if (fileNames.length > 0) {
            // Has explicit file names
            if (fileNames.length === 1 && totalAttachments === 1) {
              // Single file with name
              buttonText = fileNames[0].substring(0, 80) + (fileNames[0].length > 80 ? '...' : '');
            } else if (fileNames.length === totalAttachments) {
              // All attachments have names
              const otherCount = totalAttachments - 1;
              buttonText = `${fileNames[0]} ${otherCount > 0 ? `+${otherCount}` : ''}`;
              if (buttonText.length > 80) {
                buttonText = buttonText.substring(0, 80) + '...';
              }
            } else {
              // Mix of named files and attachments (images/videos)
              const unnamedCount = totalAttachments - fileNames.length;
              const attachmentLabel = unnamedCount === 1 
                ? i18nCache.get(LEGACY_I18N_KEYS.ATTACHMENT_LABEL)
                : `${unnamedCount} ${i18nCache.get(LEGACY_I18N_KEYS.ATTACHMENT_LABEL)}`;
              buttonText = `${fileNames[0]} + ${attachmentLabel}`;
              if (buttonText.length > 80) {
                buttonText = buttonText.substring(0, 80) + '...';
              }
            }
          } else {
            // Only images/videos without explicit names
            // Use actual element counts (not container counts) to match preview data
            if (actualImageCount > 0 && actualVideoCount === 0) {
              // Only images
              if (actualImageCount === 1) {
                buttonText = i18nCache.get(LEGACY_I18N_KEYS.IMAGE);
              } else {
                buttonText = `${actualImageCount} ${i18nCache.get(LEGACY_I18N_KEYS.IMAGES)}`;
              }
            } else if (actualVideoCount > 0 && actualImageCount === 0) {
              // Only videos
              if (actualVideoCount === 1) {
                buttonText = i18nCache.get(LEGACY_I18N_KEYS.VIDEO);
              } else {
                buttonText = `${actualVideoCount} ${i18nCache.get(LEGACY_I18N_KEYS.VIDEOS)}`;
              }
            } else {
              // Mixed or fallback
              if (totalAttachments === 1) {
                buttonText = i18nCache.get(LEGACY_I18N_KEYS.ATTACHMENT_LABEL);
              } else {
                buttonText = `${totalAttachments} ${i18nCache.get(LEGACY_I18N_KEYS.ATTACHMENT_LABEL)}`;
              }
            }
          }
        } else {
          // No user message and no attachments
          buttonText = i18nCache.get(LEGACY_I18N_KEYS.ATTACHMENT_LABEL);
        }
        
        textSpan.textContent = buttonText;
        button.appendChild(textSpan);
    }

    if (isQuote) {
      button.title = `"${quoteText}"
${questionText}`;
    } else {
      // Logic 2: Build tooltip with file names and user message
      let tooltipParts: string[] = [];
      
      // Add file names section if any
      if (fileNames.length > 0) {
        if (fileNames.length === 1) {
          tooltipParts.push(`📎 ${fileNames[0]}`);
        } else {
          tooltipParts.push(`📎 Attachments (${fileNames.length}):`);
          fileNames.forEach((name, idx) => {
            tooltipParts.push(`  ${idx + 1}. ${name}`);
          });
        }
      } else if (totalAttachments > 0) {
        // Only images without explicit names
        const label = totalAttachments === 1 ? 'attachment' : 'attachments';
        tooltipParts.push(`📎 ${totalAttachments} ${label}`);
      }
      
      // Add user message if any
      if (fullTextToDisplay) {
        if (tooltipParts.length > 0) {
          tooltipParts.push(''); // Empty line separator
        }
        tooltipParts.push(fullTextToDisplay);
      }
      
      // Fallback if no content
      if (tooltipParts.length === 0) {
        tooltipParts.push('Attachment');
      }
      
      button.title = tooltipParts.join('\n');
    }

    button.onclick = (e) => {
      e.stopPropagation();
      query.scrollIntoView({ behavior: 'smooth', block: 'start' });
      hidePopover();
    };

    // Reuse image and video elements already queried above (avoid redundant DOM queries)
    const totalPreviewableItems = actualImageCount + actualVideoCount;
    
    if (totalPreviewableItems > 0) {
      // Store preview data on button element for later initialization
      button.dataset.hasImages = 'true';
      button.dataset.imageCount = totalPreviewableItems;
      
      // Store image and video thumbnail sources
      const previewSrcs = [];
      
      // Add images
      imageElements.forEach((img) => {
        previewSrcs.push({
          src: img.src,
          alt: img.alt || 'Image Preview',
          type: 'image'
        });
      });
      
      // Add video thumbnails
      videoThumbnails.forEach((img) => {
        previewSrcs.push({
          src: img.src,
          alt: img.alt || 'Video Preview',
          type: 'video'
        });
      });
      
      button._imageData = previewSrcs; // Store in memory, not as dataset
    }

    listItem.appendChild(button);
    fragment.appendChild(listItem);
  });
  
  list.appendChild(fragment);
  
  // Initialize Tippy instances AFTER elements are added to DOM
  const buttonsWithImages = list.querySelectorAll('button[data-has-images="true"]');
  const previewInstances = [];
  
  buttonsWithImages.forEach((button) => {
    const imageData = button._imageData;
    
    if (!imageData || imageData.length === 0) {
      return;
    }
    
    // Create preview content container
    const previewContainer = document.createElement('div');
    previewContainer.className = 'toc-image-preview-container';
    
    // Add all images and videos
    imageData.forEach((itemData) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'preview-item-wrapper';
      
      const img = document.createElement('img');
      img.src = itemData.src;
      img.alt = itemData.alt;
      wrapper.appendChild(img);
      
      // Add video indicator if it's a video
      if (itemData.type === 'video') {
        const videoIndicator = document.createElement('div');
        videoIndicator.className = 'preview-video-indicator';
        videoIndicator.innerHTML = '▶'; // Play icon
        wrapper.appendChild(videoIndicator);
        wrapper.classList.add('is-video');
      }
      
      previewContainer.appendChild(wrapper);
    });

    // Get reference to popover for coordination
    const tocPopoverRef = list.closest('#gemini-toc-popover');

    // Add mouse event listeners to preview container
    // These handle the coordination with Chat Outline visibility
    previewContainer.addEventListener('mouseenter', () => {
      // When mouse enters preview, prevent Chat Outline from hiding
      if (tocPopoverRef && tocPopoverRef._clearHideTimeout) {
        tocPopoverRef._clearHideTimeout();
      }
    });

    previewContainer.addEventListener('mouseleave', () => {
      // When mouse leaves preview, allow Chat Outline to hide if mouse is not over it
      if (tocPopoverRef && tocPopoverRef._setHideTimeout) {
        // Small delay to check final mouse position
        setTimeout(() => {
          if (!tocPopoverRef.matches(':hover')) {
            tocPopoverRef._setHideTimeout(300);
          }
        }, 50);
      }
    });

    // Create Tippy instance (now button is in DOM)
    try {
      const instance = tippy(button, {
        content: previewContainer,
      });
      previewInstances.push(instance);
    } catch (error) {
      console.error('[Image Preview] Error creating Tippy:', error);
    }
  });

  if (previewInstances.length > 0) {
    popover._previewSingleton = createSingleton(previewInstances, {
      placement: 'right',
      arrow: false,
      theme: 'image-preview',
      delay: [200, null],           // 200ms delay on show, instant hide
      duration: [200, 150],      // Smooth animation
      offset: [0, 8],            // 8px spacing from button
      maxWidth: 240,             // Match TOC popover width
      interactive: true,         // Allow mouse interaction with preview
      interactiveBorder: 15,
      interactiveDebounce: 100,
      animation: 'shift-away-subtle',
      appendTo: () => document.body,   // Use function to ensure body is ready
      overrides: ['content'],
    });
  }
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
    content: i18nCache.get(LEGACY_I18N_KEYS.CLICK_TO_PIN),
    placement: 'right',
    animation: 'shift-away-subtle',
    arrow: false,
    theme: 'gemini-tooltip',
    duration: [null, 0],
    // delay: [150, 0] // 150ms delay on entry, 0ms on exit
  });

  let hideTimeout;
  
  // Store hideTimeout in a place accessible by Tippy instances
  // This allows image preview to prevent Chat Outline from hiding
  popover._hideTimeout = null;
  popover._clearHideTimeout = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  };
  popover._setHideTimeout = (delay = 300) => {
    popover._clearHideTimeout();
    hideTimeout = setTimeout(hidePopover, delay);
  };

  function togglePinState() {
    popover._clearHideTimeout(); // Prevent hiding right after pinning
    
    // isNowPinned is true if the class was added, false if removed.
    const isNowPinned = popover.classList.toggle('pinned');
    entryIcon.classList.toggle('active');

    if (isNowPinned) {
      // This runs when we PIN the element.
      showPopover(); // Ensure it's visible. 
    }

    if (isNowPinned) {
      // This runs when we PIN the element.
      entryTooltip.setContent(i18nCache.get(LEGACY_I18N_KEYS.UNPIN));
    } else {
      // This runs when we UNPIN the element.
      entryTooltip.setContent(i18nCache.get(LEGACY_I18N_KEYS.CLICK_TO_PIN));
    }
  }

  // --- Hybrid Hover and Click Logic ---

  // 1. Hover Logic
  const setupHoverListeners = (element) => {
    element.addEventListener('mouseenter', () => {
      if (popover.classList.contains('pinned')) return;
      popover._clearHideTimeout();
      showPopover();
    });

    element.addEventListener('mouseleave', () => {
      popover._setHideTimeout(300);
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
    const checkMessaNodeMutation = (nodes: NodeList) => {
      for (const node of nodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches('user-query, model-response') || node.querySelector('user-query, model-response')) {
          shouldUpdate = true;
          break;
        }
      }
    }
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        if (mutation.addedNodes.length > 0) {
          checkMessaNodeMutation(mutation.addedNodes);
        }
        if (mutation.removedNodes.length > 0) {
          checkMessaNodeMutation(mutation.removedNodes);
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
  
  // Store observer reference for cleanup
  chatWindow._tocObserver = observer;
}

// --- Robust Initialization ---

let isChatOutlineEnabled = true;

function destroyUI(chatWindow) {
  const popover = chatWindow.querySelector('#gemini-toc-popover');
  if (popover) {
    // Clear any pending hide timeout
    if (popover._clearHideTimeout) {
      popover._clearHideTimeout();
    }

    // IMPORTANT: Must destroy individual instances before singleton
    const buttonsWithTippy = popover.querySelectorAll('button[data-has-images="true"]');
    buttonsWithTippy.forEach((button) => {
      if (button._tippy) {
        button._tippy.destroy();
      }
      // Clear stored data
      delete button._imageData;
    });

    // Now destroy the singleton
    if (popover._previewSingleton) {
      popover._previewSingleton.destroy();
      popover._previewSingleton = null;
    }

    popover.remove();
  }

  const entryIcon = chatWindow.querySelector('#gemini-entry-icon');
  if (entryIcon) {
    if (entryIcon._tippy) {
      entryIcon._tippy.destroy();
    }
    entryIcon.remove();
  }

  // Disconnect mutation observer if it exists
  if (chatWindow._tocObserver) {
    chatWindow._tocObserver.disconnect();
    chatWindow._tocObserver = null;
  }
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

    if (window.geminiQuoteTooltipDebounce) {
        clearTimeout(window.geminiQuoteTooltipDebounce);
    }
    window.geminiQuoteTooltipDebounce = setTimeout(() => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (selectedText && event.target.closest('message-content') && selection.rangeCount > 0) {
            if (event.target.closest('#gemini-toc-popover')) {
                eventBus.emit(EVENTS.QUICK_FOLLOW_UP_HIDE);
                return;
            }

            const range = selection.getRangeAt(0);
            const selectionRect = range.getBoundingClientRect();
            const clampedX = Math.max(selectionRect.left, Math.min(event.clientX, selectionRect.right));
            const clampedY = Math.max(selectionRect.top, Math.min(event.clientY, selectionRect.bottom));

            const virtualRect = {
                width: 0, height: 0, top: clampedY, bottom: clampedY, left: clampedX, right: clampedX,
            };

            eventBus.emit(EVENTS.QUICK_FOLLOW_UP_SHOW, {
              text: selectedText,
              event: {
                rangeRect: selectionRect,
                clientX: event.clientX,
                clientY: event.clientY,
                virtualRect: virtualRect,
              },
            });
        } else {
            eventBus.emit(EVENTS.QUICK_FOLLOW_UP_HIDE);
        }
    }, 100);
}

function initializeQuoteFeature(chatWindow) {
  if (chatWindow._geminiQuoteInitialized) return;

  chatWindow.addEventListener('mouseup', handleMouseUp);
  chatWindow._geminiQuoteInitialized = true;
}

function destroyQuoteFeature(chatWindow) {
    chatWindow.removeEventListener('mouseup', handleMouseUp);
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
  const regardingThisText = i18nCache.get(LEGACY_I18N_KEYS.REGARDING_THIS);
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

  const regardingThisText = i18nCache.get(LEGACY_I18N_KEYS.REGARDING_THIS);

  // 1. Find the separator line index dynamically
  const separatorLineIndex = lines.findIndex(line => line.textContent.trim() === SEPARATOR);

  // 2. Validation:
  // - Separator must exist and not be the first line (need quote) or last line (need question)
  if (separatorLineIndex <= 0 || separatorLineIndex >= lines.length - 1) return;

  // - First line must start with the prefix
  const firstLineText = lines[0].textContent.trim();
  if (!firstLineText.startsWith(regardingThisText + ':')) return;

  // 3. Extract content
  // Quote part: All lines before separator, minus the prefix
  // Filter out empty lines to avoid awkward gaps in multiline quotes
  const fullQuoteTextWithPrefix = lines
    .slice(0, separatorLineIndex)
    .map(l => (l.textContent || '').trim())
    .filter(text => text.length > 0)
    .join('\n');
  const prefix = regardingThisText + ':';
  // Use indexOf to be safe about leading whitespace
  const prefixStart = fullQuoteTextWithPrefix.indexOf(prefix);
  // Fallback if not found (shouldn't happen given check above)
  const quotePart = prefixStart !== -1 
    ? fullQuoteTextWithPrefix.substring(prefixStart + prefix.length).trim()
    : fullQuoteTextWithPrefix.replace(prefix, '').trim();

  // Question part: All lines after separator
  const questionPart = lines.slice(separatorLineIndex + 1).map(l => l.textContent).join('\n').trim();

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
  
  // Hide all original lines
  lines.forEach(line => line.style.display = 'none');
  
  const newQuestionLine = document.createElement('p');
  newQuestionLine.className = 'query-text-line';
  newQuestionLine.textContent = questionPart;
  queryTextEl.appendChild(newQuestionLine);

  queryTextEl.dataset.transformed = 'true';
}


// --- Main Execution ---
function safeParseBoolean(value: any): boolean {
  // If already a boolean, return directly
  if (typeof value === 'boolean') {
    return value;
  }
  
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Boolean(parsed);
    } catch (e) {
      return value.toLowerCase() === 'true';
    }
  }
  
  return Boolean(value);
}

// 1. Load settings and then initialize
chrome.storage.sync.get({
  enableChatOutline: true
}, (data) => {
    isChatOutlineEnabled = safeParseBoolean(data.enableChatOutline);

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
        isChatOutlineEnabled = safeParseBoolean(changes.enableChatOutline.newValue);
        chatWindows.forEach(cw => {
            if (isChatOutlineEnabled) {
                initializeUI(cw);
            } else {
                destroyUI(cw);
            }
        });
    }

    if (changes.enableQuickQuote) {
        isQuickQuoteEnabled = safeParseBoolean(changes.enableQuickQuote.newValue);
        chatWindows.forEach(cw => {
            if (isQuickQuoteEnabled) {
                initializeQuoteFeature(cw);
            } else {
                destroyQuoteFeature(cw);
            }
        });

        quickFollowStore.getState().hydrate().catch((error) => {
          console.error('Failed to refresh quick follow settings after storage change:', error)
        })
    }

});

function openChatoutline() {
  browser.storage.sync.get(['enableChatOutline'], (result) => {
    const isEnabled = safeParseBoolean(result.enableChatOutline);
    
    if (!isEnabled) {
      console.log('Chat outline is disabled, ignoring open request');
      return;
    }
    
    showPopover();
  });
}

function setupChatoutlineOpenEvent() {
  /**
   * Handle chatoutline:open event
   * Uses browser storage to get the latest setting value
   */
  function handleChatoutlineOpenEvent(data: AppEvents['chatoutline:open']) {
    openChatoutline();
  }
  eventBus.on('chatoutline:open', handleChatoutlineOpenEvent);
}

function setupQuickFollowUpEvent() {
  eventBus.on(EVENTS.QUICK_FOLLOW_UP_ADD_QUOTE, (data: AppEvents['quick-follow-up:addQuote']) => {
    addQuoteUI(data.text);
  });
}

function setupEventListeners() {
  setupChatoutlineOpenEvent()
  setupQuickFollowUpEvent()
}

setupEventListeners()