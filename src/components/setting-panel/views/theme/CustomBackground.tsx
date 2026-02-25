import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  Box,
  Text,
  Heading,
  VStack,
  HStack,
  Button,
  IconButton,
  Image,
  Slider,
  Switch,
} from '@chakra-ui/react'
import {
  HiOutlineCloudUpload,
  HiOutlineInformationCircle,
  HiOutlineTrash,
} from 'react-icons/hi'
import type { ThemeBackgroundResolvedState } from '@/entrypoints/content/gemini-theme'
import { Tooltip } from '@/components/ui/tooltip'
import { t, tt } from '@/utils/i18n'

interface CustomBackgroundProps {
  state: ThemeBackgroundResolvedState | null
  isLoading: boolean
  onToggleBackground: (enabled: boolean) => Promise<void>
  onBlurChange: (value: number) => Promise<void>
  onToggleMessageGlass: (enabled: boolean) => Promise<void>
  onUploadFile: (file: File) => Promise<void>
  onRemoveImage: () => Promise<void>
}

export function CustomBackground(props: CustomBackgroundProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isFilePending, setIsFilePending] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const settings = props.state?.settings
  const isBackgroundEnabled = settings?.backgroundImageEnabled ?? false
  const blurValue = settings?.backgroundBlurPx ?? 5
  const hasImage = settings?.imageRef.kind === 'asset' && Boolean(props.state?.resolvedBackgroundUrl)
  const primaryTextColor = hasImage ? 'whiteAlpha.900' : 'gemOnSurface'
  const secondaryTextColor = hasImage ? 'whiteAlpha.700' : 'gray.400'
  const uploadIconColor = hasImage ? 'whiteAlpha.900' : 'blue.400'

  const handleSelectFile = () => {
    if (props.isLoading || isFilePending) return
    fileInputRef.current?.click()
  }

  const handleUpload = async (file: File) => {
    setIsFilePending(true)
    try {
      await props.onUploadFile(file)
    } catch {
      // The parent already handles user-facing errors.
    } finally {
      setIsFilePending(false)
    }
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    await handleUpload(file)
  }

  const handleRemoveImage = async () => {
    setIsFilePending(true)
    try {
      await props.onRemoveImage()
    } catch {
      // The parent already handles user-facing errors.
    } finally {
      setIsFilePending(false)
    }
  }

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (props.isLoading || isFilePending) return
    setIsDragging(true)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (props.isLoading || isFilePending) return
    event.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && event.currentTarget.contains(nextTarget)) return
    setIsDragging(false)
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    if (props.isLoading || isFilePending) return

    const file = event.dataTransfer.files?.[0]
    if (!file) return
    await handleUpload(file)
  }

  return (
    <Box>
      <Heading size="sm" mb={3}>
        {tt('settingPanel.theme.customBackground', 'Wallpaper')}
      </Heading>

      <HStack justify="space-between" mb={4}>
        <Text fontSize="sm" color="gemOnSurface">
          {tt('settingPanel.theme.enableBackgroundImage', 'Enable wallpaper')}
        </Text>
        <Switch.Root
          checked={settings?.backgroundImageEnabled ?? false}
          onCheckedChange={(details) => void props.onToggleBackground(details.checked)}
          disabled={props.isLoading || isFilePending}
        >
          <Switch.HiddenInput />
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Root>
      </HStack>

      <Box
        border="2px dashed"
        borderColor={isDragging ? 'blue.400' : 'border'}
        borderRadius="xl"
        py={6}
        px={4}
        textAlign="center"
        position="relative"
        mb={5}
        transition="border-color 0.2s ease, background-color 0.2s ease"
        bg={isDragging ? 'blue.subtle' : undefined}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(event) => void handleDrop(event)}
      >
        {hasImage && (
          <Box
            position="absolute"
            inset={2}
            borderRadius="lg"
            overflow="hidden"
            opacity={1}
            pointerEvents="none"
          >
            <Image
              src={props.state?.resolvedBackgroundUrl ?? undefined}
              alt="Theme background"
              width="100%"
              height="100%"
              objectFit="cover"
            />
          </Box>
        )}
        {hasImage && (
          <Box
            position="absolute"
            inset={2}
            borderRadius="lg"
            bg="blackAlpha.500"
            pointerEvents="none"
          />
        )}

        <VStack gap={3} position="relative" zIndex={1}>
          <Box color={uploadIconColor} fontSize="2xl">
            <HiOutlineCloudUpload size={32} />
          </Box>
          <Text fontSize="sm" color={primaryTextColor}>
            {tt('settingPanel.theme.dropBackground', 'Drop your image here')}
          </Text>
          <Text fontSize="xs" color={secondaryTextColor}>
            {tt('settingPanel.theme.fileTypes', 'PNG, JPG or WebP up to 5MB')}
          </Text>
          <HStack>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSelectFile}
              disabled={props.isLoading || isFilePending}
              color={hasImage ? 'whiteAlpha.900' : undefined}
              borderColor={hasImage ? 'whiteAlpha.700' : undefined}
              bg={hasImage ? 'blackAlpha.300' : undefined}
              _hover={hasImage ? { bg: 'blackAlpha.400' } : undefined}
            >
              {tt('settingPanel.theme.selectFile', 'Select File')}
            </Button>
            {hasImage && (
              <IconButton
                aria-label={tt('settingPanel.theme.removeBackgroundImage', 'Remove Background Image')}
                size="sm"
                variant="ghost"
                onClick={() => void handleRemoveImage()}
                disabled={props.isLoading || isFilePending}
                color={hasImage ? 'whiteAlpha.900' : undefined}
                _hover={hasImage ? { bg: 'blackAlpha.300' } : undefined}
              >
                <HiOutlineTrash />
              </IconButton>
            )}
          </HStack>
        </VStack>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={(event) => void handleFileChange(event)}
        />
      </Box>

      {isBackgroundEnabled && (
        <>
          <HStack justify="space-between" align="center" mb={5} gap={4}>
            <Text fontSize="sm" color="gemOnSurface">
              {tt('settingPanel.theme.blurIntensity', 'Blur')}
            </Text>
            <Slider.Root
              min={0}
              max={20}
              step={1}
              value={[blurValue]}
              onValueChange={(details) => void props.onBlurChange(details.value[0] ?? 0)}
              disabled={props.isLoading || isFilePending}
              width={{ base: '170px', md: '220px' }}
            >
              <Slider.Control>
                <Slider.Track>
                  <Slider.Range />
                </Slider.Track>
                <Slider.Thumb index={0}>
                  <Slider.DraggingIndicator
                    layerStyle="fill.solid"
                    top="6"
                    rounded="sm"
                    px="1.5"
                    fontSize="xs"
                  >
                    <HStack gap="0.5">
                      <Slider.ValueText />
                      <Box as="span">px</Box>
                    </HStack>
                  </Slider.DraggingIndicator>
                </Slider.Thumb>
              </Slider.Control>
            </Slider.Root>
          </HStack>

          <HStack justify="space-between">
            <HStack gap={1}>
              <Text fontSize="sm" color="gemOnSurface">
                {tt('settingPanel.theme.messageGlassEffect', 'Message Glass Effect')}
              </Text>
              <Tooltip
                content={tt(
                  'settingPanel.theme.messageGlassEffectInfo',
                  'Enabling this adds a glass effect. It may impact performance on low-end devices.',
                )}
              >
                <IconButton
                  aria-label={tt('settingPanel.theme.messageGlassEffect', 'Message Glass Effect')}
                  size="2xs"
                  variant="ghost"
                >
                  <HiOutlineInformationCircle />
                </IconButton>
              </Tooltip>
            </HStack>

            <Switch.Root
              checked={settings?.messageGlassEnabled ?? false}
              onCheckedChange={(details) => void props.onToggleMessageGlass(details.checked)}
              disabled={props.isLoading || isFilePending}
            >
              <Switch.HiddenInput />
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Root>
          </HStack>
        </>
      )}
    </Box>
  )
}
