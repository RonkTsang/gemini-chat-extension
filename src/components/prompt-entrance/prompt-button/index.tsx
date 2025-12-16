import React from 'react'
import PromptIcon from '~/assets/prompt.svg?react'
import styles from './index.module.css'
import { call } from '@/utils/bridge';

interface PromptButtonProps {
  onClick?: () => void
}

export const PromptButton: React.FC<PromptButtonProps> = ({ onClick }) => {
  const { emit } = useEventEmitter();

  const handleClick = async () => {
    emit('settings:open', {
      from: 'prompt-entrance',
      open: true
    })
    onClick?.()
    console.log('running in', location.origin)
    
    // Fire analytics event via bridge
    try {
      await call('analytics.fireEvent', {
        name: 'button_clicked',
        params: { button_name: 'prompt-entrance' }
      });
    } catch (error) {
      console.error('Failed to fire analytics event:', error);
    }
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
