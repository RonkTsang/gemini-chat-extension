import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  Box,
  Text,
  Heading,
  VStack,
  HStack,
  Stack,
  Button,
  IconButton,
  Image,
  Slider,
  Switch,
  NativeSelect,
} from '@chakra-ui/react'
import {
  HiOutlineCloudUpload,
  HiOutlineInformationCircle,
  HiOutlineTrash,
} from 'react-icons/hi'
import type {
  GeminiTheme,
  ThemeBackgroundResolvedState,
  WelcomeGreetingReadabilityMode,
} from '@/entrypoints/content/gemini-theme'
import { MESSAGE_GLASS_BACKGROUND_VISIBILITY_DEFAULT } from '@/entrypoints/content/gemini-theme'
import { Tooltip } from '@/components/ui/tooltip'
import { tt } from '@/utils/i18n'
import { ChatTextColorControl } from './ChatTextColorControl'

interface CustomBackgroundProps {
  variant?: 'default' | 'compact'
  state: ThemeBackgroundResolvedState | null
  isLoading: boolean
  onToggleBackground: (enabled: boolean) => Promise<void>
  onBlurChange: (value: number) => Promise<void>
  onToggleSidebarScrim: (enabled: boolean) => Promise<void>
  onSidebarScrimIntensityChange: (value: number) => Promise<void>
  onToggleMessageGlass: (enabled: boolean) => Promise<void>
  onMessageGlassBackgroundVisibilityChange: (value: number) => Promise<void>
  onMessageGlassBlurChange: (value: number) => Promise<void>
  onResetGlassSettings: () => Promise<void>
  effectiveTheme: GeminiTheme
  chatTextColor: string | null
  defaultChatTextColor: string
  onChatTextColorChange: (color: string) => Promise<void>
  onResetChatTextColor: () => Promise<void>
  onWelcomeGreetingReadabilityModeChange: (
    mode: WelcomeGreetingReadabilityMode,
  ) => Promise<void>
  onUploadFile: (file: File) => Promise<void>
  onRemoveImage: () => Promise<void>
}

export function CustomBackground(props: CustomBackgroundProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isFilePending, setIsFilePending] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const isCompact = props.variant === 'compact'
  const sectionGap = isCompact ? 3 : 5
  const headingMarginBottom = isCompact ? 2 : 3
  const uploadPaddingY = isCompact ? 3 : 6
  const uploadPaddingX = isCompact ? 3 : 4
  const wideControlWidth = isCompact ? '100%' : { base: '170px', md: '220px' }
  const narrowControlWidth = isCompact ? '100%' : { base: '132px', md: '180px' }

  const settings = props.state?.settings
  const previewUrl = props.state?.resolvedBackgroundUrl ?? null
  const isBackgroundEnabled = settings?.backgroundImageEnabled ?? false
  const blurValue = settings?.backgroundBlurPx ?? 5
  const messageGlassEnabled = settings?.messageGlassEnabled ?? false
  const messageGlassBackgroundVisibility =
    settings?.messageGlassBackgroundVisibility
    ?? MESSAGE_GLASS_BACKGROUND_VISIBILITY_DEFAULT
  const messageGlassBlurPx = settings?.messageGlassBlurPx ?? 20
  const sidebarScrimEnabled = settings?.sidebarScrimEnabled ?? true
  const sidebarScrimIntensity = settings?.sidebarScrimIntensity ?? 20
  const welcomeGreetingReadabilityMode
    = settings?.welcomeGreetingReadabilityMode ?? 'auto'

  const [localBlurValue, setLocalBlurValue] = useState(blurValue)
  const [localSidebarScrimValue, setLocalSidebarScrimValue] = useState(
    sidebarScrimIntensity,
  )
  const [
    localGlassBackgroundVisibilityValue,
    setLocalGlassBackgroundVisibilityValue,
  ] = useState(messageGlassBackgroundVisibility)
  const [localGlassBlurValue, setLocalGlassBlurValue] = useState(
    messageGlassBlurPx,
  )

  useEffect(() => {
    setLocalBlurValue(blurValue)
  }, [blurValue])

  useEffect(() => {
    setLocalSidebarScrimValue(sidebarScrimIntensity)
  }, [sidebarScrimIntensity])

  useEffect(() => {
    setLocalGlassBackgroundVisibilityValue(messageGlassBackgroundVisibility)
  }, [messageGlassBackgroundVisibility])

  useEffect(() => {
    setLocalGlassBlurValue(messageGlassBlurPx)
  }, [messageGlassBlurPx])

  const hasImage = settings?.imageRef.kind === 'asset' && Boolean(previewUrl)
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
      <Heading size="sm" mb={headingMarginBottom}>
        {tt('settingPanel.theme.customBackground', 'Wallpaper')}
      </Heading>

      <HStack justify="space-between" mb={4} gap={3}>
        <Text fontSize="sm" color="gemOnSurface" minW={0}>
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
        py={uploadPaddingY}
        px={uploadPaddingX}
        textAlign="center"
        position="relative"
        mb={sectionGap}
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
              src={previewUrl ?? undefined}
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

        <VStack gap={isCompact ? 2 : 3} position="relative" zIndex={1}>
          <Box color={uploadIconColor} fontSize={isCompact ? 'xl' : '2xl'}>
            <HiOutlineCloudUpload size={isCompact ? 24 : 32} />
          </Box>
          <Text fontSize={isCompact ? 'xs' : 'sm'} color={primaryTextColor}>
            {tt('settingPanel.theme.dropBackground', 'Drop your image here')}
          </Text>
          <Text fontSize={isCompact ? '2xs' : 'xs'} color={secondaryTextColor}>
            {tt('settingPanel.theme.fileTypes', 'PNG, JPG or WebP up to 5MB')}
          </Text>
          <HStack gap={isCompact ? 1.5 : 2}>
            <Button
              size={isCompact ? 'xs' : 'sm'}
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
                size={isCompact ? 'xs' : 'sm'}
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
          <Stack
            direction={isCompact ? 'column' : 'row'}
            justify="space-between"
            align={isCompact ? 'stretch' : 'center'}
            mb={sectionGap}
            gap={isCompact ? 2 : 4}
          >
            <Text fontSize="sm" color="gemOnSurface" minW={0}>
              {tt('settingPanel.theme.blurIntensity', 'Blur')}
            </Text>
            <Slider.Root
              min={0}
              max={20}
              step={1}
              value={[localBlurValue]}
              onValueChange={(details) => setLocalBlurValue(details.value[0] ?? 0)}
              onValueChangeEnd={(details) => void props.onBlurChange(details.value[0] ?? 0)}
              disabled={props.isLoading || isFilePending}
              width={wideControlWidth}
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
          </Stack>

          <HStack justify="space-between" mb={4} gap={3}>
            <HStack gap={1} minW={0} flex="1">
              <Text fontSize="sm" color="gemOnSurface" minW={0}>
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
              checked={messageGlassEnabled}
              onCheckedChange={(details) => void props.onToggleMessageGlass(details.checked)}
              disabled={props.isLoading || isFilePending}
            >
              <Switch.HiddenInput />
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Root>
          </HStack>

          {messageGlassEnabled && (
            <VStack
              align="stretch"
              gap={4}
              mb={sectionGap}
              pl={3}
              borderLeft="1px solid"
              borderColor="border"
            >
              <Stack
                direction={isCompact ? 'column' : 'row'}
                justify="space-between"
                align={isCompact ? 'stretch' : 'center'}
                gap={isCompact ? 2 : 4}
              >
                <Text fontSize="sm" color="gemOnSurface" minW={0}>
                  {tt('settingPanel.theme.messageGlassBackgroundVisibility', 'Background visibility')}
                </Text>
                <HStack gap={3} flexShrink={0} width={isCompact ? '100%' : undefined}>
                  <Slider.Root
                    min={0}
                    max={10}
                    step={1}
                    value={[localGlassBackgroundVisibilityValue]}
                    onValueChange={(details) => setLocalGlassBackgroundVisibilityValue(details.value[0] ?? 0)}
                    onValueChangeEnd={(details) => void props.onMessageGlassBackgroundVisibilityChange(details.value[0] ?? 0)}
                    disabled={props.isLoading || isFilePending}
                    width={narrowControlWidth}
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
                          zIndex={2}
                        >
                          <Slider.ValueText />
                        </Slider.DraggingIndicator>
                      </Slider.Thumb>
                    </Slider.Control>
                  </Slider.Root>
                  <Text
                    as="output"
                    fontSize="sm"
                    color="gemOnSurface"
                    minW="38px"
                    textAlign="right"
                  >
                    {localGlassBackgroundVisibilityValue}
                  </Text>
                </HStack>
              </Stack>

              <Stack
                direction={isCompact ? 'column' : 'row'}
                justify="space-between"
                align={isCompact ? 'stretch' : 'center'}
                gap={isCompact ? 2 : 4}
              >
                <Text fontSize="sm" color="gemOnSurface" minW={0}>
                  {tt('settingPanel.theme.glassBlur', 'Glass blur')}
                </Text>
                <HStack gap={3} flexShrink={0} width={isCompact ? '100%' : undefined}>
                  <Slider.Root
                    min={0}
                    max={20}
                    step={1}
                    value={[localGlassBlurValue]}
                    onValueChange={(details) => setLocalGlassBlurValue(details.value[0] ?? 0)}
                    onValueChangeEnd={(details) => void props.onMessageGlassBlurChange(details.value[0] ?? 0)}
                    disabled={props.isLoading || isFilePending}
                    width={narrowControlWidth}
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
                          zIndex={2}
                        >
                          <HStack gap="0.5">
                            <Slider.ValueText />
                            <Box as="span">px</Box>
                          </HStack>
                        </Slider.DraggingIndicator>
                      </Slider.Thumb>
                    </Slider.Control>
                  </Slider.Root>
                  <Text
                    as="output"
                    fontSize="sm"
                    color="gemOnSurface"
                    minW="38px"
                    textAlign="right"
                  >
                    {localGlassBlurValue}px
                  </Text>
                </HStack>
              </Stack>

              <Button
                size="xs"
                variant="ghost"
                alignSelf="flex-end"
                onClick={() => void props.onResetGlassSettings()}
                disabled={props.isLoading || isFilePending}
              >
                {tt('settingPanel.theme.resetGlassSettings', 'Reset glass settings')}
              </Button>
            </VStack>
          )}

          <HStack justify="space-between" mt={sectionGap} mb={4} gap={3}>
            <HStack gap={1} minW={0} flex="1">
              <Text fontSize="sm" color="gemOnSurface" minW={0}>
                {tt('settingPanel.theme.sidebarScrim', 'Sidebar readability scrim')}
              </Text>
              <Tooltip
                content={tt(
                  'settingPanel.theme.sidebarScrimInfo',
                  'Improves sidebar text contrast on wallpaper. This option only takes effect in Light mode.',
                )}
              >
                <IconButton
                  aria-label={tt('settingPanel.theme.sidebarScrim', 'Sidebar readability scrim')}
                  size="2xs"
                  variant="ghost"
                >
                  <HiOutlineInformationCircle />
                </IconButton>
              </Tooltip>
            </HStack>
            <Switch.Root
              checked={sidebarScrimEnabled}
              onCheckedChange={(details) => void props.onToggleSidebarScrim(details.checked)}
              disabled={props.isLoading || isFilePending}
            >
              <Switch.HiddenInput />
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Root>
          </HStack>

          {sidebarScrimEnabled && (
            <Stack
              direction={isCompact ? 'column' : 'row'}
              justify="space-between"
              align={isCompact ? 'stretch' : 'center'}
              mb={sectionGap}
              gap={isCompact ? 2 : 4}
              position="relative"
              zIndex={1}
            >
              <Text fontSize="sm" color="gemOnSurface" minW={0}>
                {tt('settingPanel.theme.sidebarScrimIntensity', 'Scrim intensity')}
              </Text>
              <Slider.Root
                min={0}
                max={100}
                step={1}
                value={[localSidebarScrimValue]}
                onValueChange={(details) => setLocalSidebarScrimValue(details.value[0] ?? 0)}
                onValueChangeEnd={(details) => void props.onSidebarScrimIntensityChange(details.value[0] ?? 0)}
                disabled={props.isLoading || isFilePending}
                width={wideControlWidth}
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
                      zIndex={2}
                    >
                      <HStack gap="0.5">
                        <Slider.ValueText />
                        <Box as="span">%</Box>
                      </HStack>
                    </Slider.DraggingIndicator>
                  </Slider.Thumb>
                </Slider.Control>
              </Slider.Root>
            </Stack>
          )}

          <Stack
            direction={isCompact ? 'column' : 'row'}
            justify="space-between"
            align={isCompact ? 'stretch' : 'center'}
            mb={sectionGap}
            gap={isCompact ? 2 : 4}
          >
            <HStack gap={1} minW={0}>
              <Text fontSize="sm" color="gemOnSurface" minW={0}>
                {tt('settingPanel.theme.welcomeGreetingReadability', 'Welcome greeting readability')}
              </Text>
              <Tooltip
                content={tt(
                  'settingPanel.theme.welcomeGreetingReadabilityInfo',
                  'Controls text color adaptation for the homepage welcome greeting when wallpaper is enabled. Use this if the greeting is hard to read in Light mode.',
                )}
              >
                <IconButton
                  aria-label={tt(
                    'settingPanel.theme.welcomeGreetingReadability',
                    'Welcome greeting readability',
                  )}
                  size="2xs"
                  variant="ghost"
                >
                  <HiOutlineInformationCircle />
                </IconButton>
              </Tooltip>
            </HStack>
            <NativeSelect.Root
              size="sm"
              width={wideControlWidth}
              disabled={props.isLoading || isFilePending}
            >
              <NativeSelect.Field
                value={welcomeGreetingReadabilityMode}
                onChange={(event) => {
                  void props.onWelcomeGreetingReadabilityModeChange(
                    event.target.value as WelcomeGreetingReadabilityMode,
                  )
                }}
              >
                <option value="default">
                  {tt('settingPanel.theme.welcomeGreetingReadabilityDefault', 'Keep default')}
                </option>
                <option value="auto">
                  {tt(
                    'settingPanel.theme.welcomeGreetingReadabilityAuto',
                    'Auto adapt (first estimate)',
                  )}
                </option>
                <option value="force-light">
                  {tt(
                    'settingPanel.theme.welcomeGreetingReadabilityForceLight',
                    'Force light text',
                  )}
                </option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Stack>

          <ChatTextColorControl
            variant={props.variant}
            mode={props.effectiveTheme}
            value={props.chatTextColor}
            defaultValue={props.defaultChatTextColor}
            disabled={props.isLoading || isFilePending}
            onChange={props.onChatTextColorChange}
            onReset={props.onResetChatTextColor}
          />
        </>
      )}
    </Box>
  )
}
