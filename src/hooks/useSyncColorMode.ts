/**
 * Sync color mode with Gemini page theme
 * 
 * This hook monitors the body class changes and syncs the Chakra color mode
 * with the Gemini page theme (dark-theme / light-theme).
 */

import { useEffect } from 'react'
import { useColorMode } from '@/components/ui/color-mode'

/**
 * Get theme from body class
 */
function getThemeFromBody(): 'light' | 'dark' | undefined {
  const body = document.body
  if (body.classList.contains('dark-theme')) {
    return 'dark'
  }
  if (body.classList.contains('light-theme')) {
    return 'light'
  }
  return undefined
}

/**
 * Hook to sync Chakra color mode with Gemini page theme
 * 
 * Usage:
 * ```tsx
 * function App() {
 *   useSyncColorMode()
 *   return <YourContent />
 * }
 * ```
 */
export function useSyncColorMode() {
  const { setColorMode } = useColorMode()

  useEffect(() => {
    const applyTheme = () => {
      const theme = getThemeFromBody()
      if (theme) {
        setColorMode(theme)
      } else {
        // Fallback to system preference
        setColorMode(
          window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        )
      }
    }

    // Apply theme on mount
    applyTheme()

    // Observe body class changes
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          applyTheme()
          break
        }
      }
    })

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => {
      observer.disconnect()
    }
  }, [setColorMode])
}
