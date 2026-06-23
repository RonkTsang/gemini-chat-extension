import { useCallback, useEffect, useMemo, useState } from 'react'
import { browser } from 'wxt/browser'
import {
  ResponseCompleteNotificationAudioAssetError,
  validateResponseCompleteNotificationAudioFile,
  type ResponseCompleteNotificationAudioAssetMetadata,
} from '@/services/responseCompleteNotificationAudioAsset'
import { toaster } from '@/components/ui/toaster'
import {
  RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_DELETE_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_GET_METADATA_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_SAVE_MESSAGE,
  type ResponseCompleteNotificationResponse,
} from '@/types/runtime-messages'
import { t } from '@/utils/i18n'

function getAudioAssetErrorMessage(error: unknown): string {
  if (error instanceof ResponseCompleteNotificationAudioAssetError) {
    if (error.code === 'file-too-large') {
      return t('responseNotificationAudioFileTooLarge') || 'Audio must be smaller than 2MB.'
    }
    if (error.code === 'unsupported-type') {
      return t('responseNotificationAudioUnsupportedType') || 'Choose an audio file.'
    }
    if (error.code === 'decode-failed') {
      return t('responseNotificationAudioDecodeFailed') || 'This browser cannot play that audio file.'
    }
  }

  return t('responseNotificationAudioSaveFailed') || 'Could not save notification sound.'
}

function formatAudioAssetSize(size: number): string {
  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 102.4) / 10} KB`
  }

  return `${Math.round(size / 1024 / 102.4) / 10} MB`
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Audio file could not be read'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Audio file could not be read'))
    reader.readAsDataURL(file)
  })
}

async function requestAudioAssetMetadata(): Promise<ResponseCompleteNotificationAudioAssetMetadata | null> {
  const response = await browser.runtime.sendMessage({
    type: RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_GET_METADATA_MESSAGE,
  }) as ResponseCompleteNotificationResponse | undefined

  return response?.ok ? response.audioAsset ?? null : null
}

async function requestSaveAudioAsset(file: File): Promise<ResponseCompleteNotificationAudioAssetMetadata> {
  await validateResponseCompleteNotificationAudioFile(file)
  const dataUrl = await fileToDataUrl(file)
  const response = await browser.runtime.sendMessage({
    type: RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_SAVE_MESSAGE,
    payload: {
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      dataUrl,
    },
  }) as ResponseCompleteNotificationResponse | undefined

  if (!response?.ok || !response.audioAsset) {
    throw new ResponseCompleteNotificationAudioAssetError(
      'storage-failed',
      'Could not save notification sound',
    )
  }

  return response.audioAsset
}

async function requestDeleteAudioAsset(): Promise<void> {
  const response = await browser.runtime.sendMessage({
    type: RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_DELETE_MESSAGE,
  }) as ResponseCompleteNotificationResponse | undefined

  if (!response?.ok) {
    throw new ResponseCompleteNotificationAudioAssetError(
      'storage-failed',
      'Could not delete notification sound',
    )
  }
}

export function useNotificationAudioAsset(enabled: boolean) {
  const [metadata, setMetadata] = useState<ResponseCompleteNotificationAudioAssetMetadata | null>(null)
  const [isLoading, setIsLoading] = useState(enabled)
  const [isPending, setIsPending] = useState(false)

  const loadMetadata = useCallback(async () => {
    if (!enabled) {
      setMetadata(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      setMetadata(await requestAudioAssetMetadata())
    } catch {
      setMetadata(null)
    } finally {
      setIsLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void loadMetadata()
  }, [loadMetadata])

  const uploadAudio = useCallback(async (file: File) => {
    setIsPending(true)
    try {
      setMetadata(await requestSaveAudioAsset(file))
    } catch (error) {
      toaster.create({ type: 'error', title: getAudioAssetErrorMessage(error) })
      throw error
    } finally {
      setIsPending(false)
    }
  }, [])

  const restoreDefault = useCallback(async () => {
    setIsPending(true)
    try {
      await requestDeleteAudioAsset()
      setMetadata(null)
    } catch (error) {
      toaster.create({ type: 'error', title: getAudioAssetErrorMessage(error) })
      throw error
    } finally {
      setIsPending(false)
    }
  }, [])

  const fileSizeLabel = useMemo(() => (
    metadata ? formatAudioAssetSize(metadata.size) : null
  ), [metadata])

  return {
    metadata,
    fileSizeLabel,
    isLoading,
    isPending,
    uploadAudio,
    restoreDefault,
  }
}
