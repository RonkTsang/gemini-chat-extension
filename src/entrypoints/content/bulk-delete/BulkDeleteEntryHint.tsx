import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { LuX } from 'react-icons/lu'
import { markFeatureHintSeen, shouldShowFeatureHint } from '@/components/feature-hint/storage'
import { t } from '@/utils/i18n'
import { BulkDeleteEntry } from './BulkDeleteEntry'

const HINT_ID = 'bulk-delete-entry'
const HINT_VERSION = '1'

interface BulkDeleteEntryHintProps {
  active: boolean
  onToggle: () => void
}

export function BulkDeleteEntryHint({ active, onToggle }: BulkDeleteEntryHintProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const dismissedRef = useRef(false)
  const [showHint, setShowHint] = useState(false)
  const titleId = useId()
  const descriptionId = useId()

  const dismissHint = useCallback(() => {
    if (dismissedRef.current) {
      return
    }

    dismissedRef.current = true
    setShowHint(false)
    void markFeatureHintSeen(HINT_ID, HINT_VERSION)
  }, [])

  useEffect(() => {
    if (active || dismissedRef.current) {
      return
    }

    let cancelled = false

    void shouldShowFeatureHint(HINT_ID, HINT_VERSION).then((shouldShow) => {
      if (!cancelled && !dismissedRef.current && shouldShow) {
        setShowHint(true)
      }
    })

    return () => {
      cancelled = true
    }
  }, [active])

  const handleToggle = () => {
    dismissHint()
    onToggle()
  }

  return (
    <>
      <span ref={anchorRef} className="gpk-bulk-delete-entry-anchor">
        <BulkDeleteEntry active={active} onToggle={handleToggle} />
        {showHint && (
          <section
            data-gpk-bulk-delete-entry-hint
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            aria-live="polite"
            onClick={(event) => {
              event.stopPropagation()
              dismissHint()
            }}
          >
            <div data-gpk-bulk-delete-entry-hint-copy>
              <div id={titleId} data-gpk-bulk-delete-entry-hint-title>
                {t('bulkDelete.entryHint.title')}
              </div>
              <div id={descriptionId} data-gpk-bulk-delete-entry-hint-description>
                {t('bulkDelete.entryHint.description')}
              </div>
            </div>
            <button
              type="button"
              data-gpk-bulk-delete-entry-hint-close
              aria-label={t('bulkDelete.entryHint.dismiss')}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                dismissHint()
              }}
            >
              <LuX aria-hidden="true" size={15} />
            </button>
          </section>
        )}
      </span>
    </>
  )
}
