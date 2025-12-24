/**
 * Editor utilities for user message editing in Gemini interface
 * Based on input.html DOM structure analysis
 */

export interface EditorConfig {
  chatWindow?: Element;
}

export interface ModelStatus {
  isResponding: boolean;
  buttonElement: Element | null;
}

export type ModelStatusCallback = (status: ModelStatus) => void;
export type InputChangeCallback = (content: string) => void;

export interface DetailedButtonStatus {
  hasSubmitClass: boolean;
  hasStopClass: boolean;
  hasSendLabel: boolean;
  hasStopLabel: boolean;
  ariaLabel: string | null;
  isValidSendState: boolean;
  isValidStopState: boolean;
  currentState: 'ready' | 'responding' | 'unknown';
}

/**
 * Get the content editor (rich-textarea) element
 * @param chatWindow Optional chat window to search within
 * @returns Content editor element or null if not found
 */
export function getContentEditor(chatWindow?: Element): HTMLElement | null {
  const container = chatWindow || document;
  
  // Find rich text editor: editable div under rich-textarea
  const editor = container.querySelector('rich-textarea .ql-editor.textarea.new-input-ui[contenteditable="true"]') as HTMLElement;
  
  return editor;
}

/**
 * Get the send button element
 * @param chatWindow Optional chat window to search within
 * @returns Send button element or null if not found
 */
export function getSendButton(chatWindow?: Element): HTMLElement | null {
  const container = chatWindow || document;
  
  // Find send button (could be in send or stop state)
  const sendButton = container.querySelector('.send-button') as HTMLElement;
  
  return sendButton;
}

/**
 * Check if the model is currently responding (utility function)
 * @param sendButton The send button element
 * @returns True if model is responding, false otherwise
 */
export function isResponding(sendButton: HTMLElement): boolean {
  const hasStopClass = sendButton.classList.contains('stop');
  const hasStopLabel = sendButton.getAttribute('aria-label') === 'Stop response';
  return hasStopClass && hasStopLabel;
}

/**
 * Check if the button is ready to send a message (utility function)
 * @param sendButton The send button element
 * @returns True if ready to send, false otherwise
 */
export function isReadyToSend(sendButton: HTMLElement): boolean {
  const hasSubmitClass = sendButton.classList.contains('submit');
  const hasSendLabel = sendButton.getAttribute('aria-label') === 'Send message';
  return hasSubmitClass && hasSendLabel;
}

/**
 * Insert text into the content editor
 * @param text Text to insert (supports multiline)
 * @param chatWindow Optional chat window to target
 * @returns Success status
 */
export function insertTextToEditor(text: string, chatWindow?: Element): boolean {
  const editor = getContentEditor(chatWindow);
  if (!editor) {
    console.warn('Content editor not found');
    return false;
  }

  try {
    // Clear existing content
    editor.innerHTML = '';
    
    // Split text into lines, wrap each in a <p> tag
    const lines = text.split('\n');
    
    lines.forEach((line, index) => {
      const p = document.createElement('p');
      p.textContent = line || ''; // Preserve empty lines
      editor.appendChild(p);
    });

    // If no content, add an empty <p> tag
    if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
      const p = document.createElement('p');
      p.innerHTML = '<br>'; // Use <br> to keep empty line
      editor.appendChild(p);
    }

    // Focus on editor
    editor.focus();
    
    // Move cursor to the end
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);

    // Trigger input event to notify system that content has changed
    const inputEvent = new Event('input', { bubbles: true });
    editor.dispatchEvent(inputEvent);

    return true;
  } catch (error) {
    console.error('Failed to insert text to editor:', error);
    return false;
  }
}

/**
 * Append text to the content editor (preserving existing content)
 * @param text Text to append
 * @param chatWindow Optional chat window to target
 * @returns Success status
 */
export function appendTextToEditor(text: string, chatWindow?: Element): boolean {
  const editor = getContentEditor(chatWindow);
  if (!editor) {
    console.warn('Content editor not found');
    return false;
  }

  try {
    // Get existing content
    const existingContent = getEditorContent(chatWindow);
    const newContent = existingContent ? `${existingContent}\n${text}` : text;
    
    return insertTextToEditor(newContent, chatWindow);
  } catch (error) {
    console.error('Failed to append text to editor:', error);
    return false;
  }
}

/**
 * Get content from the editor
 * @param chatWindow Optional chat window to target
 * @returns Editor content as string
 */
export function getEditorContent(chatWindow?: Element): string {
  const editor = getContentEditor(chatWindow);
  if (!editor) {
    console.warn('Content editor not found');
    return '';
  }

  try {
    // Extract text content of all <p> tags
    const paragraphs = editor.querySelectorAll('p');
    const lines: string[] = [];
    
    paragraphs.forEach(p => {
      // Handle empty lines (including cases with <br>)
      if (p.innerHTML === '<br>' || p.innerHTML === '') {
        lines.push('');
      } else {
        lines.push(p.textContent || '');
      }
    });

    return lines.join('\n').trim();
  } catch (error) {
    console.error('Failed to get editor content:', error);
    return '';
  }
}

/**
 * Clear the editor content
 * @param chatWindow Optional chat window to target
 * @returns Success status
 */
export function clearEditor(chatWindow?: Element): boolean {
  return insertTextToEditor('', chatWindow);
}

interface SendMessageResult {
  success: boolean;
  reason: 'success' | 'model_is_responding' | 'send_button_not_found' | 'send_button_not_in_ready_state' | 'failed_to_send_message';
}

/**
 * Send the message by clicking the send button
 * @param chatWindow Optional chat window to target
 * @returns Success status
 */
export function sendMessage(chatWindow?: Element): SendMessageResult {
  const sendButton = getSendButton(chatWindow);
  if (!sendButton) {
    console.warn('Send button not found');
    return {
      success: false,
      reason: 'send_button_not_found'
    };
  }

  try {
    // Check if model is responding
    if (isResponding(sendButton)) {
      console.warn('Model is currently responding, cannot send new message');
      return {
        success: false,
        reason: 'model_is_responding'
      };
    }
    
    // Check if in ready-to-send state
    if (!isReadyToSend(sendButton)) {
      console.warn('Send button is not in ready state');
      return {
        success: false,
        reason: 'send_button_not_in_ready_state'
      };
    }

    // Simulate click on send button
    sendButton.click();
    return {
      success: true,
      reason: 'success'
    };
  } catch (error) {
    console.error('Failed to send message:', error);
    return {
      success: false,
      reason: 'failed_to_send_message'
    };
  }
}

/**
 * Stop the current model response
 * @param chatWindow Optional chat window to target
 * @returns Success status
 */
export function stopModelResponse(chatWindow?: Element): boolean {
  const sendButton = getSendButton(chatWindow);
  if (!sendButton) {
    console.warn('Send button not found');
    return false;
  }

  try {
    // Only stop when in responding state
    if (!isResponding(sendButton)) {
      console.warn('Model is not currently responding');
      return false;
    }

    // Simulate click on stop button
    sendButton.click();
    return true;
  } catch (error) {
    console.error('Failed to stop model response:', error);
    return false;
  }
}

/**
 * Get current model status with enhanced validation
 * @param chatWindow Optional chat window to target
 * @returns Model status object
 */
export function getModelStatus(chatWindow?: Element): ModelStatus {
  const sendButton = getSendButton(chatWindow);
  
  if (!sendButton) {
    return {
      isResponding: false,
      buttonElement: null
    };
  }

  return {
    isResponding: isResponding(sendButton),
    buttonElement: sendButton
  };
}

/**
 * Get detailed button status for debugging and validation
 * @param chatWindow Optional chat window to target
 * @returns Detailed button status information
 */
export function getDetailedButtonStatus(chatWindow?: Element): DetailedButtonStatus {
  const sendButton = getSendButton(chatWindow);
  
  if (!sendButton) {
    return {
      hasSubmitClass: false,
      hasStopClass: false,
      hasSendLabel: false,
      hasStopLabel: false,
      ariaLabel: null,
      isValidSendState: false,
      isValidStopState: false,
      currentState: 'unknown'
    };
  }

  const ariaLabel = sendButton.getAttribute('aria-label');
  const hasSubmitClass = sendButton.classList.contains('submit');
  const hasStopClass = sendButton.classList.contains('stop');
  const hasSendLabel = ariaLabel === 'Send message';
  const hasStopLabel = ariaLabel === 'Stop response';
  
  // Validate state consistency (using utility functions)
  const isValidSendState = isReadyToSend(sendButton);
  const isValidStopState = isResponding(sendButton);
  
  // Determine current state
  let currentState: 'ready' | 'responding' | 'unknown';
  if (isValidSendState) {
    currentState = 'ready';
  } else if (isValidStopState) {
    currentState = 'responding';
  } else {
    currentState = 'unknown';
  }
  
  return {
    hasSubmitClass,
    hasStopClass,
    hasSendLabel,
    hasStopLabel,
    ariaLabel,
    isValidSendState,
    isValidStopState,
    currentState
  };
}

/**
 * Create a model status listener using MutationObserver
 * @param callback Callback function to handle status changes
 * @param chatWindow Optional chat window to monitor
 * @returns Cleanup function to stop listening
 */
export function createModelStatusListener(
  callback: ModelStatusCallback,
  chatWindow?: Element
): () => void {
  const sendButton = getSendButton(chatWindow);
  
  if (!sendButton) {
    console.warn('Send button not found, cannot create status listener');
    return () => {};
  }

  // Create MutationObserver to listen for button state changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const status = getModelStatus(chatWindow);
        callback(status);
      }
    });
  });

  // Start listening for button class changes
  observer.observe(sendButton, {
    attributes: true,
    attributeFilter: ['class']
  });

  // Call callback immediately once, return current status
  const initialStatus = getModelStatus(chatWindow);
  callback(initialStatus);

  // Return cleanup function
  return () => {
    observer.disconnect();
  };
}

/**
 * Create an input change listener for the content editor
 * @param callback Callback function to handle content changes
 * @param chatWindow Optional chat window to monitor
 * @returns Cleanup function to stop listening
 */
export function createInputChangeListener(
  callback: InputChangeCallback,
  chatWindow?: Element
): () => void {
  const editor = getContentEditor(chatWindow);
  
  if (!editor) {
    console.warn('Content editor not found, cannot create input listener');
    return () => {};
  }

  // Input event handler
  const handleInput = () => {
    const content = getEditorContent(chatWindow);
    callback(content);
  };

  // Listen for multiple input events
  const events = ['input', 'keyup', 'paste'];
  
  events.forEach(eventType => {
    editor.addEventListener(eventType, handleInput);
  });

  // Call callback immediately once, return current content
  const initialContent = getEditorContent(chatWindow);
  callback(initialContent);

  // Return cleanup function
  return () => {
    events.forEach(eventType => {
      editor.removeEventListener(eventType, handleInput);
    });
  };
}

/**
 * Utility function to wait for the model to finish responding
 * @param chatWindow Optional chat window to monitor
 * @param timeout Optional timeout in milliseconds (default: 30000)
 * @returns Promise that resolves when model finishes responding
 */
export function waitForModelResponse(chatWindow?: Element, timeout = 30000): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout waiting for model response'));
    }, timeout);

    let cleanup: () => void;

    cleanup = createModelStatusListener((status) => {
      if (!status.isResponding) {
        clearTimeout(timeoutId);
        cleanup();
        resolve(true);
      }
    }, chatWindow);
  });
}

/**
 * Send message and wait for response
 * @param message Message to send
 * @param chatWindow Optional chat window to target
 * @param timeout Optional timeout in milliseconds
 * @returns Promise that resolves when message is sent and response is complete
 */
export async function sendMessageAndWait(
  message: string,
  chatWindow?: Element,
  timeout = 30000
): Promise<boolean> {
  try {
    // Insert message content
    const insertSuccess = insertTextToEditor(message, chatWindow);
    if (!insertSuccess) {
      throw new Error('Failed to insert message to editor');
    }

    // Wait for a short time to ensure content update
    await new Promise(resolve => setTimeout(resolve, 100));

    // Send message
    const sendSuccess = sendMessage(chatWindow);
    if (!sendSuccess) {
      throw new Error('Failed to send message');
    }

    // Wait for model response to complete
    await waitForModelResponse(chatWindow, timeout);
    
    return true;
  } catch (error) {
    console.error('Failed to send message and wait:', error);
    return false;
  }
}
