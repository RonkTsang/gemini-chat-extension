import { useEffect, useRef } from 'react'
import { LuX } from 'react-icons/lu'
import { MdOutlineLibraryAddCheck } from 'react-icons/md'
import { t } from '@/utils/i18n'
import { createGeminiTooltip, destroyGeminiTooltip } from '../gemini-tooltip'

interface BulkDeleteEntryProps {
  active: boolean
  onToggle: () => void
}

export function BulkDeleteEntry({ active, onToggle }: BulkDeleteEntryProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const button = buttonRef.current
    if (!button) {
      return
    }

    createGeminiTooltip(button, {
      content: t('bulkDelete.entryLabel'),
      owner: 'bulk-delete',
      placement: 'right',
    })

    return () => {
      destroyGeminiTooltip(button)
    }
  }, [])

  return (
    <button
      ref={buttonRef}
      type="button"
      className="gpk-bulk-delete-entry-button"
      aria-label={t('bulkDelete.entryLabel')}
      aria-pressed={active}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onToggle()
      }}
    >
      {active ? <LuX aria-hidden="true" size={16} /> : <MdOutlineLibraryAddCheck aria-hidden="true" size={16} />}
    </button>
  )
}
