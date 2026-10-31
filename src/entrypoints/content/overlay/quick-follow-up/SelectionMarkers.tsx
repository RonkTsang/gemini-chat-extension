import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { t } from '@/utils/i18n'
import { findCurrentChatWindow, observeQuoteAnchorLayout, readQuoteAnchorEndPosition } from '../../quick-follow-up/dom'
import type { SelectionItem } from '../../quick-follow-up/protocol'

interface SelectionMarkersProps {
  items: readonly SelectionItem[]
  disabled: boolean
  onEdit: (id: string) => void
  onPreview: (id: string | null) => void
}

type MarkerPosition = { id: string; number: number; left: number; top: number }
const SIZE = 28
const MARGIN = 8

export function SelectionMarkers({ items, disabled, onEdit, onPreview }: SelectionMarkersProps) {
  const [positions, setPositions] = useState<MarkerPosition[]>([])
  const [host, setHost] = useState<HTMLElement | null>(null)
  const hoveredId = useRef<string | null>(null)
  const clearPreview = useCallback(() => {
    if (hoveredId.current === null) return
    hoveredId.current = null
    onPreview(null)
  }, [onPreview])

  useLayoutEffect(() => clearPreview, [clearPreview])
  useLayoutEffect(() => {
    if (disabled) clearPreview()
  }, [disabled, clearPreview])

  useLayoutEffect(() => {
    const update = () => {
      const nextHost = findCurrentChatWindow()
      setHost(nextHost)
      const next = nextHost ? items.flatMap((item, index) => {
        const position = item.anchor ? readQuoteAnchorEndPosition(item.anchor) : null
        if (!position) return []
        return [{ id: item.id, number: index + 1,
          left: Math.max(MARGIN, Math.min(position.clientX + 2, window.innerWidth - SIZE - MARGIN)),
          top: Math.max(SIZE + MARGIN, position.clientY + 6),
        }]
      }) : []
      if (hoveredId.current !== null && !next.some(position => position.id === hoveredId.current)) clearPreview()
      setPositions(previous => previous.length === next.length && previous.every((position, index) => {
        const other = next[index]
        return position.id === other.id && position.number === other.number
          && position.left === other.left && position.top === other.top
      }) ? previous : next)
    }
    update()
    return observeQuoteAnchorLayout(items.flatMap(item => item.anchor ? [item.anchor] : []), update)
  }, [items, clearPreview])

  if (!host) return null

  return createPortal(positions.map(position => (
    <div
      key={position.id}
      className="gpk-follow-source-marker"
      style={{ left: position.left, top: position.top }}
    >
      <button
        type="button"
        className="gpk-follow-source-marker-button"
        data-quick-follow-marker={position.id}
        aria-label={`${t('quickFollow.multiSelection.editComment')} · ${t('quickFollow.multiSelection.selectionNumber', String(position.number))}`}
        aria-haspopup="dialog"
        disabled={disabled}
        style={{ width: SIZE, height: SIZE }}
        onPointerDown={event => event.preventDefault()}
        onMouseEnter={() => {
          if (disabled) return
          hoveredId.current = position.id
          onPreview(position.id)
        }}
        onMouseLeave={clearPreview}
        onClick={() => onEdit(position.id)}
      >{position.number}</button>
    </div>
  )), host)
}
