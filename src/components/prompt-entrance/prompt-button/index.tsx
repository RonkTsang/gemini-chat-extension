import React from 'react'
import PromptIcon from '~/assets/prompt.svg?react'
import styles from './index.module.css'
import { AppEvents } from '@/common/event'

interface PromptButtonProps {
  onClick?: () => void
}

export const PromptButton: React.FC<PromptButtonProps> = ({ onClick }) => {
  const { emit } = useEventEmitter<AppEvents>();

  const handleClick = () => {
    emit('settings:open', {
      from: 'prompt-entrance',
      open: true,
      module: 'chainPrompt'
    })
    onClick?.()
  }

  return (
    <div className={styles.container}>
      <button
        className={styles.button}
        onClick={handleClick}
      >
        <PromptIcon className={styles.icon} />
        <span className={styles.text}>Prompts</span>
      </button>
    </div>
  )
}
