import { createToaster } from '@chakra-ui/react'
import { useLayoutEffect, useState } from 'react'

import { Toaster } from '@/components/ui/toaster'

export const settingsToaster = createToaster({
  placement: 'top',
  duration: 4500,
  max: 3,
  pauseOnPageIdle: true,
})

export function SettingsToaster({ anchor, open }: { anchor: HTMLElement | null; open: boolean }) {
  const [bounds, setBounds] = useState<{ top: number; left: number; width: number }>()

  useLayoutEffect(() => {
    if (!open || !anchor) return
    const measure = () => {
      const rect = anchor.getBoundingClientRect()
      setBounds({ top: rect.top + 16, left: rect.left + rect.width / 2, width: Math.max(0, Math.min(384, rect.width - 32)) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(anchor)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      settingsToaster.remove()
    }
  }, [anchor, open])

  if (!open || !anchor || !bounds) return null

  // Portal keeps notifications above nested confirmation dialogs and out of layout.
  return <Toaster store={settingsToaster} viewportProps={{
    style: { top: bounds.top, left: bounds.left, width: bounds.width, insetInlineStart: 'auto', insetInlineEnd: 'auto', transform: 'translateX(-50%)' },
  }} />
}
