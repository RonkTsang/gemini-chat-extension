import { afterEach, describe, expect, it } from 'vitest'
import { __deleteQueueTestApi } from './deleteQueue'

describe('delete queue confirmation dialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
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
})
