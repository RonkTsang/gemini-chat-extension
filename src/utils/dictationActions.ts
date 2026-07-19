const OPEN_DICTATION_BUTTON_SELECTOR = 'speech-dictation-mic-button gem-icon-button > button'
const STOP_DICTATION_BUTTON_SELECTOR = 'gem-icon-button[data-test-id="stop-dictation-button"] > button'

/** Toggle Gemini's native speech dictation control. */
export function toggleSpeechDictation(): boolean {
  const button = findVisibleButton([
    STOP_DICTATION_BUTTON_SELECTOR,
    OPEN_DICTATION_BUTTON_SELECTOR,
  ])

  if (!button || isButtonDisabled(button)) {
    console.warn('[Shortcut] Speech dictation button not found or disabled')
    return false
  }

  button.click()
  return true
}

function findVisibleButton(selectors: readonly string[]): HTMLButtonElement | null {
  for (const selector of selectors) {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>(selector))
      .find((element) => isVisible(element))

    if (button) {
      return button
    }
  }

  return null
}

function isVisible(element: HTMLElement): boolean {
  let current: HTMLElement | null = element

  while (current) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true') {
      return false
    }

    const styles = window.getComputedStyle(current)
    if (styles.display === 'none' || styles.visibility === 'hidden') {
      return false
    }

    current = current.parentElement
  }

  return true
}

function isButtonDisabled(button: HTMLButtonElement): boolean {
  return button.disabled || button.getAttribute('aria-disabled') === 'true'
}
