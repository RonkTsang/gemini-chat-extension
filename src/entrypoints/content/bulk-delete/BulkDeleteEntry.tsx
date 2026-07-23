import { LuX } from 'react-icons/lu'
import { MdOutlineLibraryAddCheck } from 'react-icons/md'
import { t } from '@/utils/i18n'

interface BulkDeleteEntryProps {
  active: boolean
  onToggle: () => void
}

export function BulkDeleteEntry({ active, onToggle }: BulkDeleteEntryProps) {
  return (
    <button
      type="button"
      className="gpk-bulk-delete-entry-button"
      aria-label={t('bulkDelete.entryLabel')}
      title={t('bulkDelete.entryLabel')}
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
