/**
 * Message utilities for extracting chat messages from Gemini interface
 * Based on chat-outline and quick-quote functionality from content.ts
 */

export interface MessageElement {
  element: Element;
  index: number;
  timestamp?: Date;
}

export interface UserMessage extends MessageElement {
  type: 'user';
  text: string;
  isQuote?: boolean;
  quoteText?: string;
  questionText?: string;
}

export interface ModelMessage extends MessageElement {
  type: 'model';
  content: string;
  hasThoughts?: boolean;
}

export type Message = UserMessage | ModelMessage;

/**
 * Get all user messages from the page or a specific chat window
 * @param chatWindow Optional chat window element to search within
 * @returns Array of user message elements with extracted text
 */
export function getAllUserMessages(chatWindow?: Element): UserMessage[] {
  const container = chatWindow || document;
  const userQueries = container.querySelectorAll('user-query');
  
  return Array.from(userQueries).map((element, index) => {
    const userMessage: UserMessage = {
      element,
      index,
      type: 'user',
      text: '',
      timestamp: new Date()
    };

    // Extract text content using the same logic as in content.ts
    const queryTextEl = element.querySelector('.query-text');
    
    // Check if this is a quote message using dataset (transformed quotes)
    if ((element as HTMLElement).dataset?.isQuote === 'true') {
      userMessage.isQuote = true;
      userMessage.quoteText = (element as HTMLElement).dataset?.quoteText || '';
      userMessage.questionText = (element as HTMLElement).dataset?.questionText || '';
      userMessage.text = userMessage.questionText;
    } else {
      // Extract text from query-text element or fallback to innerText
      const currentText = (queryTextEl ? (queryTextEl as HTMLElement).innerText : (element as HTMLElement).innerText).trim();
      
      // Check for quote pattern in raw text (before transformation)
      const regardingThisText = 'Regarding this'; // Fallback if i18n not available
      const separatorIndex = currentText.indexOf('---------');
      
      if (currentText.startsWith(regardingThisText) && separatorIndex !== -1) {
        userMessage.isQuote = true;
        const fullQuotePart = currentText.substring(0, separatorIndex).replace(regardingThisText + ':', '').trim();
        userMessage.quoteText = fullQuotePart;
        userMessage.questionText = currentText.substring(separatorIndex + '---------'.length).trim();
        userMessage.text = userMessage.questionText || '';
      } else {
        userMessage.text = currentText;
      }
    }

    return userMessage;
  });
}

/**
 * Get all model responses from the page or a specific chat window
 * @param chatWindow Optional chat window element to search within
 * @returns Array of model message elements with extracted content
 */
export function getAllModelMessages(chatWindow?: Element): ModelMessage[] {
  const container = chatWindow || document;
  const modelResponses = container.querySelectorAll('model-response');
  
  return Array.from(modelResponses).map((element, index) => {
    const modelMessage: ModelMessage = {
      element,
      index,
      type: 'model',
      content: '',
      timestamp: new Date()
    };

    // Extract content from message-content element
    const messageContent = element.querySelector('message-content');
    if (messageContent) {
      // Get text content, excluding any UI elements
      const markdownContent = messageContent.querySelector('.markdown');
      if (markdownContent) {
        modelMessage.content = markdownContent.textContent?.trim() || '';
      } else {
        modelMessage.content = messageContent.textContent?.trim() || '';
      }
    }

    // Check if the response has thoughts (thinking process)
    const modelThoughts = element.querySelector('model-thoughts');
    modelMessage.hasThoughts = !!modelThoughts;

    return modelMessage;
  });
}

/**
 * Get the last model response from the page or a specific chat window
 * @param chatWindow Optional chat window element to search within
 * @returns The last model message or null if not found
 */
export function getLastModelMessage(chatWindow?: Element): ModelMessage | null {
  const container = chatWindow || document;
  const modelResponses = container.querySelectorAll('model-response');
  
  if (modelResponses.length === 0) {
    return null;
  }

  // Get the last model-response element
  const lastElement = modelResponses[modelResponses.length - 1];
  const modelMessage: ModelMessage = {
    element: lastElement,
    index: modelResponses.length - 1,
    type: 'model',
    content: '',
    timestamp: new Date()
  };

  // Extract content from message-content element
  const messageContent = lastElement.querySelector('message-content');
  if (messageContent) {
    // Get text content, excluding any UI elements
    const markdownContent = messageContent.querySelector('.markdown');
    if (markdownContent) {
      modelMessage.content = markdownContent.textContent?.trim() || '';
    } else {
      modelMessage.content = messageContent.textContent?.trim() || '';
    }
  }

  // Check if the response has thoughts (thinking process)
  const modelThoughts = lastElement.querySelector('model-thoughts');
  modelMessage.hasThoughts = !!modelThoughts;

  return modelMessage;
}

/**
 * Check if a model message is currently in responding state by checking bard-avatar spinner
 * @param modelMessageOrElement The ModelMessage object or model-response element to check
 * @returns True if the model is currently responding (bard-avatar spinner is visible), false otherwise
 */
export function isModelRespondingByAvatar(modelMessageOrElement: ModelMessage | Element): boolean {
  const element = 'element' in modelMessageOrElement 
    ? modelMessageOrElement.element 
    : modelMessageOrElement;

  // Find bard-avatar element
  const bardAvatar = element.querySelector('bard-avatar');
  if (!bardAvatar) {
    return false;
  }

  // Find avatar_spinner_animation element
  const spinnerAnimation = bardAvatar.querySelector('.avatar_spinner_animation');
  if (!spinnerAnimation) {
    return false;
  }

  // Check if the spinner is visible (not hidden)
  const style = (spinnerAnimation as HTMLElement).style;
  const computedStyle = window.getComputedStyle(spinnerAnimation);
  
  // Check visibility, display, and opacity
  const isHidden = 
    style.visibility === 'hidden' ||
    computedStyle.visibility === 'hidden' ||
    style.display === 'none' ||
    computedStyle.display === 'none' ||
    style.opacity === '0' ||
    computedStyle.opacity === '0';

  return !isHidden;
}

/**
 * Get all messages (both user and model) from the page or a specific chat window
 * Returns messages in chronological order based on DOM order
 * @param chatWindow Optional chat window element to search within
 * @returns Array of all messages in order
 */
export function getAllMessages(chatWindow?: Element): Message[] {
  const container = chatWindow || document;
  
  // Get all message elements (both user-query and model-response)
  const allMessageElements = container.querySelectorAll('user-query, model-response');
  
  const messages: Message[] = [];
  let userIndex = 0;
  let modelIndex = 0;
  
  Array.from(allMessageElements).forEach((element) => {
    if (element.tagName.toLowerCase() === 'user-query') {
      const userMessages = getAllUserMessages(element.parentElement || undefined);
      const userMessage = userMessages.find(msg => msg.element === element);
      if (userMessage) {
        userMessage.index = userIndex++;
        messages.push(userMessage);
      }
    } else if (element.tagName.toLowerCase() === 'model-response') {
      const modelMessages = getAllModelMessages(element.parentElement || undefined);
      const modelMessage = modelMessages.find(msg => msg.element === element);
      if (modelMessage) {
        modelMessage.index = modelIndex++;
        messages.push(modelMessage);
      }
    }
  });
  
  return messages;
}

/**
 * Get the current active chat window
 * @returns Chat window element or null if not found
 */
export function getCurrentChatWindow(): Element | null {
  return document.querySelector('chat-window');
}

/**
 * Get all chat windows on the page
 * @returns Array of chat window elements
 */
export function getAllChatWindows(): Element[] {
  return Array.from(document.querySelectorAll('chat-window'));
}

/**
 * Get the default chat window
 * Returns the current active chat window, or the most recent one if multiple exist
 * @returns Default chat window element or null if not found
 */
export function getDefaultChatWindow(): Element | null {
  // First try to get the current active chat window
  const currentChatWindow = getCurrentChatWindow();
  if (currentChatWindow) {
    return currentChatWindow;
  }

  // If no current chat window, get all chat windows
  const allChatWindows = getAllChatWindows();
  if (allChatWindows.length === 0) {
    return null;
  }

  // Return the most recent (last) chat window
  // In most cases, this would be the active conversation
  return allChatWindows[allChatWindows.length - 1];
}

/**
 * Utility function to extract text from a user query element
 * Handles both transformed quotes and regular messages
 * @param userQueryElement The user-query element
 * @returns Extracted text content
 */
export function extractUserQueryText(userQueryElement: Element): string {
  // Check dataset first (for transformed quotes)
  if ((userQueryElement as HTMLElement).dataset?.isQuote === 'true') {
    return (userQueryElement as HTMLElement).dataset?.questionText || '';
  }
  
  // Fallback to text extraction
  const queryTextEl = userQueryElement.querySelector('.query-text');
  const text = (queryTextEl ? (queryTextEl as HTMLElement).innerText : (userQueryElement as HTMLElement).innerText).trim();
  
  // Handle quote pattern
  const separatorIndex = text.indexOf('---------');
  if (text.startsWith('Regarding this') && separatorIndex !== -1) {
    return text.substring(separatorIndex + '---------'.length).trim();
  }
  
  return text;
}

/**
 * Utility function to extract content from a model response element
 * @param modelResponseElement The model-response element  
 * @returns Extracted content text
 */
export function extractModelResponseContent(modelResponseElement: Element): string {
  const messageContent = modelResponseElement.querySelector('message-content .markdown');
  return messageContent?.textContent?.trim() || '';
}

/**
 * Check if the current chat has any message history
 * Optimized to return immediately upon finding any message
 * @param chatWindow Optional chat window element to check, defaults to current chat window
 * @returns True if chat has any messages, false otherwise
 */
export function hasChatHistory(chatWindow?: Element | null): boolean {
  // Get chat window
  const container = chatWindow ?? getDefaultChatWindow()
  
  if (!container) {
    // No chat window means no history
    return false
  }
  
  // Fast check: just look for the first occurrence of any message element
  // No need to traverse all messages
  const hasUserMessage = !!container.querySelector('user-query')
  const hasModelMessage = !!container.querySelector('model-response')
  
  return hasUserMessage || hasModelMessage
}

/**
 * Get a summary of chat messages without fetching all message contents
 * @param chatWindow Optional chat window element to check
 * @returns Summary with message counts
 */
export function getChatSummary(chatWindow?: Element | null) {
  const container = chatWindow ?? getDefaultChatWindow()
  
  if (!container) {
    return { 
      hasMessages: false, 
      messageCount: 0, 
      userCount: 0, 
      modelCount: 0 
    }
  }
  
  // Count messages efficiently without parsing content
  const userMessages = container.querySelectorAll('user-query')
  const modelMessages = container.querySelectorAll('model-response')
  
  const userCount = userMessages.length
  const modelCount = modelMessages.length
  const messageCount = userCount + modelCount
  
  return {
    hasMessages: messageCount > 0,
    messageCount,
    userCount,
    modelCount
  }
}

/**
 * Check if a chat window is a temporary chat
 * @param chatWindow Optional chat window element to check, defaults to current chat window
 * @returns True if the chat is temporary, false otherwise
 */
export function isTemporaryChat(chatWindow?: Element | null): boolean {
  const container = chatWindow ?? getDefaultChatWindow()
  
  if (!container) {
    return false
  }
  
  // Check for specific class names that indicate temporary chat
  const temporaryClassNames = [
    'temporary-chat-card-container',
    'temporary-chat-card', 
    'temp-chat-icon-container'
  ]
  
  // Check if any child element has one of the temporary class names
  for (const className of temporaryClassNames) {
    if (container.querySelector(`.${className}`)) {
      return true
    }
  }
  
  // Check if container contains temp-chat-icon element
  if (container.querySelector('temp-chat-icon')) {
    return true
  }
  
  return false
}
