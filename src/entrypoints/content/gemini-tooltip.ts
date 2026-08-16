import tippy, { type Instance } from 'tippy.js'

export type GeminiTooltipPlacement = 'top' | 'right' | 'bottom' | 'left'
export type GeminiTooltipOwner = 'bulk-delete' | 'power-kit-entry' | 'top-bar-action'

export interface GeminiTooltipOptions {
  content: string
  owner: GeminiTooltipOwner
  placement: GeminiTooltipPlacement
}

const TOOLTIP_STYLE_ID = 'gpk-tooltip-style'

const TOOLTIP_CSS = `
.tippy-box[data-theme~='gemini-tooltip'] {
  background: rgb(0, 0, 0);
  border-radius: 12px;
  box-shadow: none;
  color: rgb(242, 240, 240);
  font-family: "Google Sans Flex", "Google Sans Text", "Google Sans", sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
}

body.dark-theme .tippy-box[data-theme~='gemini-tooltip'] {
  background: rgb(230, 230, 230);
  color: rgb(23, 23, 23);
}

.tippy-box[data-theme~='gemini-tooltip'] > .tippy-content {
  padding: 8px 16px;
}
`

interface TooltipRecord {
  instance: Instance
  owner: GeminiTooltipOwner
}

const tooltipInstances = new Map<HTMLElement, TooltipRecord>()

const ensureTooltipStyle = () => {
  let style = document.getElementById(TOOLTIP_STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = TOOLTIP_STYLE_ID
    document.head.appendChild(style)
  }

  if (style.textContent !== TOOLTIP_CSS) {
    style.textContent = TOOLTIP_CSS
  }
}

const removeTooltipStyleIfUnused = () => {
  if (tooltipInstances.size === 0) {
    document.getElementById(TOOLTIP_STYLE_ID)?.remove()
  }
}

export const getGeminiTooltip = (reference: HTMLElement): Instance | null =>
  tooltipInstances.get(reference)?.instance ?? null

export const createGeminiTooltip = (
  reference: HTMLElement,
  options: GeminiTooltipOptions,
): Instance | null => {
  ensureTooltipStyle()

  const existing = tooltipInstances.get(reference)
  if (existing) {
    existing.instance.setContent(options.content)
    existing.instance.setProps({ placement: options.placement })
    return existing.instance
  }

  try {
    const instance = tippy(reference, {
      appendTo: () => document.body,
      content: options.content,
      placement: options.placement,
      animation: 'shift-away-subtle',
      arrow: false,
      theme: 'gemini-tooltip',
      duration: [null, 0],
    })
    tooltipInstances.set(reference, {
      instance,
      owner: options.owner,
    })
    return instance
  } catch (error) {
    console.warn('[Gemini Power kit] Failed to initialize tooltip', error)
    removeTooltipStyleIfUnused()
    return null
  }
}

export const destroyGeminiTooltip = (reference: HTMLElement | null) => {
  if (!reference) return
  const record = tooltipInstances.get(reference)
  if (!record) return

  record.instance.destroy()
  tooltipInstances.delete(reference)
  removeTooltipStyleIfUnused()
}

export const destroyGeminiTooltipsWhere = (
  shouldDestroy: (
    reference: HTMLElement,
    owner: GeminiTooltipOwner,
  ) => boolean,
) => {
  for (const [reference, record] of Array.from(tooltipInstances.entries())) {
    if (shouldDestroy(reference, record.owner)) {
      destroyGeminiTooltip(reference)
    }
  }
}
