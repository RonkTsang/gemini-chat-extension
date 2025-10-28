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
  
  // 查找富文本编辑器：rich-textarea 下的可编辑 div
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
  
  // 查找发送按钮（可能是发送状态或停止状态）
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
    // 清空现有内容
    editor.innerHTML = '';
    
    // 分割文本为行，每行用 <p> 标签包裹
    const lines = text.split('\n');
    
    lines.forEach((line, index) => {
      const p = document.createElement('p');
      p.textContent = line || ''; // 空行也需要保留
      editor.appendChild(p);
    });

    // 如果没有内容，添加一个空的 p 标签
    if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
      const p = document.createElement('p');
      p.innerHTML = '<br>'; // 使用 <br> 保持空行
      editor.appendChild(p);
    }

    // 设置焦点到编辑器
    editor.focus();
    
    // 将光标移动到最后
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);

    // 触发输入事件以通知系统内容已更改
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
    // 获取现有内容
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
    // 提取所有 p 标签的文本内容
    const paragraphs = editor.querySelectorAll('p');
    const lines: string[] = [];
    
    paragraphs.forEach(p => {
      // 处理空行（包含 <br> 的情况）
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
    // 检查是否正在响应中
    if (isResponding(sendButton)) {
      console.warn('Model is currently responding, cannot send new message');
      return {
        success: false,
        reason: 'model_is_responding'
      };
    }
    
    // 检查是否处于可发送状态
    if (!isReadyToSend(sendButton)) {
      console.warn('Send button is not in ready state');
      return {
        success: false,
        reason: 'send_button_not_in_ready_state'
      };
    }

    // 模拟点击发送按钮
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
    // 只有在确认响应中状态时才能停止
    if (!isResponding(sendButton)) {
      console.warn('Model is not currently responding');
      return false;
    }

    // 模拟点击停止按钮
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
  
  // 验证状态一致性 (使用工具函数)
  const isValidSendState = isReadyToSend(sendButton);
  const isValidStopState = isResponding(sendButton);
  
  // 确定当前状态
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

  // 创建 MutationObserver 来监听按钮状态变化
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const status = getModelStatus(chatWindow);
        callback(status);
      }
    });
  });

  // 开始监听按钮的类名变化
  observer.observe(sendButton, {
    attributes: true,
    attributeFilter: ['class']
  });

  // 立即调用一次回调，返回当前状态
  const initialStatus = getModelStatus(chatWindow);
  callback(initialStatus);

  // 返回清理函数
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

  // 输入事件处理函数
  const handleInput = () => {
    const content = getEditorContent(chatWindow);
    callback(content);
  };

  // 监听多种输入事件
  const events = ['input', 'keyup', 'paste'];
  
  events.forEach(eventType => {
    editor.addEventListener(eventType, handleInput);
  });

  // 立即调用一次回调，返回当前内容
  const initialContent = getEditorContent(chatWindow);
  callback(initialContent);

  // 返回清理函数
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
    // 插入消息内容
    const insertSuccess = insertTextToEditor(message, chatWindow);
    if (!insertSuccess) {
      throw new Error('Failed to insert message to editor');
    }

    // 等待一小段时间确保内容已经更新
    await new Promise(resolve => setTimeout(resolve, 100));

    // 发送消息
    const sendSuccess = sendMessage(chatWindow);
    if (!sendSuccess) {
      throw new Error('Failed to send message');
    }

    // 等待模型响应完成
    await waitForModelResponse(chatWindow, timeout);
    
    return true;
  } catch (error) {
    console.error('Failed to send message and wait:', error);
    return false;
  }
}
