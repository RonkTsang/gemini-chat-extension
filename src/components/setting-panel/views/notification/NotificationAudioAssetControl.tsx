import { useRef, useState, type ChangeEvent } from 'react'
import { Box, Button, HStack, Stack, Text } from '@chakra-ui/react'
import {
  HiOutlineMusicNote,
  HiOutlineTrash,
  HiOutlineUpload,
} from 'react-icons/hi'
import { t } from '@/utils/i18n'
import { useNotificationAudioAsset } from './useNotificationAudioAsset'

interface NotificationAudioAssetControlProps {
  disabled: boolean
}

export function NotificationAudioAssetControl({ disabled }: NotificationAudioAssetControlProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isSelectingFile, setIsSelectingFile] = useState(false)
  const {
    metadata,
    fileSizeLabel,
    isLoading,
    isPending,
    uploadAudio,
    restoreDefault,
  } = useNotificationAudioAsset(true)
  const isControlDisabled = disabled || isLoading || isPending || isSelectingFile
  const soundName = metadata?.fileName || t('responseNotificationAudioDefault') || 'Default'
  const soundMeta = metadata
    ? fileSizeLabel
    : t('responseNotificationAudioDefaultDescription') || 'Built-in sound'

  const handleSelectFile = () => {
    if (isControlDisabled) return
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setIsSelectingFile(true)
    try {
      await uploadAudio(file)
    } catch {
      // The hook already reports a user-facing error.
    } finally {
      setIsSelectingFile(false)
    }
  }

  const handleRestoreDefault = async () => {
    try {
      await restoreDefault()
    } catch {
      // The hook already reports a user-facing error.
    }
  }

  return (
    <Stack
      gap={3}
      pt={3}
      borderTop="1px solid"
      borderColor="border"
    >
      <Stack
        direction={{ base: 'column', sm: 'row' }}
        align={{ base: 'stretch', sm: 'center' }}
        justify="space-between"
        gap={3}
      >
        <HStack gap={3} minW={0}>
          <Box aria-hidden="true" flexShrink={0}>
            <HiOutlineMusicNote />
          </Box>
          <Stack gap={0} minW={0}>
            <Text fontSize="sm" color="fg.muted">
              {t('responseNotificationAudioCustomLabel') || 'Notification sound'}
            </Text>
            <Text fontSize="sm" fontWeight="medium" truncate>
              {soundName}
            </Text>
            {soundMeta ? (
              <Text fontSize="xs" color="fg.muted">
                {soundMeta}
              </Text>
            ) : null}
          </Stack>
        </HStack>

        <HStack gap={2} flexShrink={0}>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSelectFile}
            disabled={isControlDisabled}
          >
            <HiOutlineUpload />
            {metadata
              ? t('responseNotificationAudioReplace') || 'Replace'
              : t('responseNotificationAudioUpload') || 'Upload audio'}
          </Button>
          {metadata ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleRestoreDefault()}
              disabled={isControlDisabled}
            >
              <HiOutlineTrash />
              {t('responseNotificationAudioRestoreDefault') || 'Restore default'}
            </Button>
          ) : null}
        </HStack>
      </Stack>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={(event) => void handleFileChange(event)}
      />
    </Stack>
  )
}

NotificationAudioAssetControl.displayName = 'NotificationAudioAssetControl'
