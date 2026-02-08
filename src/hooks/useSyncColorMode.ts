/**
 * Sync color mode with Gemini page theme
 * 
 * This hook monitors the body class changes and syncs the Chakra color mode
 * with the Gemini page theme (dark-theme / light-theme).
 */

import { useEffect, useRef } from 'react'
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
  const { colorMode, setColorMode } = useColorMode()
  
  // Use ref to store the latest colorMode without causing re-renders
  const colorModeRef = useRef(colorMode)

  useEffect(() => {
    const applyTheme = () => {
      const theme = getThemeFromBody()
      const targetTheme = theme || (
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      )
      
      // Only update if the target theme is different from the current color mode
      // Update ref immediately before calling setColorMode to keep them in sync
      if (targetTheme !== colorModeRef.current) {
        colorModeRef.current = targetTheme
        setColorMode(targetTheme)
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
