import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __deleteQueueTestApi,
  deleteConversationRows,
  setDevForceBulkDeleteFailure,
} from './deleteQueue'

describe('delete queue confirmation dialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    setDevForceBulkDeleteFailure(false)
  })

  it('selects Gemini’s focused Delete action instead of the preceding Cancel action', () => {
    document.body.innerHTML = `
      <mat-dialog-container role="dialog" aria-label="Delete chat">
        <mat-dialog-actions>
          <gem-button><button type="button">Cancel</button></gem-button>
          <gem-button cdkfocusinitial><button type="button">Delete</button></gem-button>
        </mat-dialog-actions>
      </mat-dialog-container>
    `

    const dialog = document.querySelector('[role="dialog"]')!
    const confirmButton = __deleteQueueTestApi.findConfirmDeleteButton(dialog)

    expect(confirmButton?.textContent).toBe('Delete')
  })

  it('selects the fixed CDK overlay before an unrelated visible overlay container', () => {
    document.body.innerHTML = `
      <div class="cdk-overlay-container" style="position: fixed">
        <div role="menu"><button data-test-id="delete-button">Delete</button></div>
      </div>
      <div class="overlay-container">Image preview</div>
    `

    const overlay = __deleteQueueTestApi.findFirst([
      'div.cdk-overlay-container',
      '[role="dialog"]',
      '.modal-container',
      '.overlay-container',
    ])

    expect(overlay?.classList.contains('cdk-overlay-container')).toBe(true)
    expect(overlay?.querySelector('[data-test-id="delete-button"]')).not.toBeNull()
  })

  it('returns a failure without dispatching a synthetic Escape event', async () => {
    const row = document.createElement('div')
    document.body.append(row)
    setDevForceBulkDeleteFailure(true)
    const onFailed = vi.fn()
    const onKeyDown = vi.fn()
    document.addEventListener('keydown', onKeyDown)

    const result = await deleteConversationRows([row], undefined, { onFailed })

    expect(result).toMatchObject({ status: 'failed', succeeded: 0 })
    expect(onFailed).toHaveBeenCalledOnce()
    expect(onKeyDown).not.toHaveBeenCalled()
    document.removeEventListener('keydown', onKeyDown)
  })
})
