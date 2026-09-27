import { t } from '@/utils/i18n'
import { handleOpenInNewTab } from './navigation'
import { logLibraryTrace } from '@/utils/library/logger'

function getOpenInNewTabSvg(): string {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
    <g class="open-in-new-tab-outline">
      <g fill="currentColor" fill-rule="evenodd" class="Vector" clip-rule="evenodd">
        <path d="M5 4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5.263a1 1 0 1 1 2 0V19a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3h5.017a1 1 0 1 1 0 2z"></path>
        <path d="M21.411 2.572a.963.963 0 0 1 0 1.36l-8.772 8.786a.96.96 0 0 1-1.358 0a.963.963 0 0 1 0-1.36l8.773-8.786a.96.96 0 0 1 1.357 0"></path>
        <path d="M21.04 2c.53 0 .96.43.96.962V8c0 .531-.47 1-1 1s-1-.469-1-1V4h-4c-.53 0-1-.469-1-1s.43-1 .96-1z"></path>
      </g>
    </g>
  </svg>
`.trim()
}

export function createOpenInNewTabButton(url: string): HTMLDivElement {
  // Create button element
  const button = document.createElement('div')
  button.className = 'gem-ext-open-new-tab-btn'
  button.innerHTML = getOpenInNewTabSvg()
  button.setAttribute('role', 'button')
  button.setAttribute('tabindex', '0')
  button.setAttribute('aria-label', t('stuffPage.openInNewTab'))
  button.dataset.openUrl = url

  // Add click handler
  button.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    logLibraryTrace('content:open', () => ({ input: 'click', destination: button.dataset.openUrl }))
    handleOpenInNewTab(button.dataset.openUrl ?? url)
  })

  // Add keyboard support (Enter and Space)
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      logLibraryTrace('content:open', () => ({ input: e.key, destination: button.dataset.openUrl }))
      handleOpenInNewTab(button.dataset.openUrl ?? url)
    }
  })

  // Create Tooltip element
  const tooltip = document.createElement('div')
  tooltip.className = 'gem-ext-tooltip'
  tooltip.textContent = t('stuffPage.openInNewTab')
  button.appendChild(tooltip)

  return button
}
