import { Box, Heading, VStack, HStack } from '@chakra-ui/react'
import { useColorMode } from '@/components/ui/color-mode'
import { t } from '@/utils/i18n'

interface LivePreviewProps {
  backgroundEnabled: boolean
  backgroundUrl: string | null
  blurPx: number
  messageGlassEnabled: boolean
}

function PreviewGeminiIcon() {
  return (
    <Box w="14px" h="14px" flexShrink={0}>
      <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32" width="32" height="32" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', transform: 'translate3d(0px, 0px, 0px)', contentVisibility: 'visible' }}>
        <defs>
          <clipPath id="__lottie_element_519">
            <rect width="32" height="32" x="0" y="0" />
          </clipPath>
          <g id="__lottie_element_526">
            <g transform="matrix(0.12479999661445618,0,0,0.12479999661445618,4.986400604248047,4.986400604248047)" opacity="1" style={{ display: 'block' }}>
              <g opacity="1" transform="matrix(1,0,0,1,88.25,88.25)">
                <path fill="url(#__lottie_element_529)" fillOpacity="1" d=" M-3.9000000953674316,-84.94999694824219 C-5.28000020980835,-79.47000122070312 -7.079999923706055,-74.13999938964844 -9.319999694824219,-68.93000030517578 C-15.15999984741211,-55.369998931884766 -23.15999984741211,-43.5 -33.33000183105469,-33.33000183105469 C-43.5,-23.170000076293945 -55.369998931884766,-15.15999984741211 -68.93000030517578,-9.319999694824219 C-74.12999725341797,-7.079999923706055 -79.47000122070312,-5.28000020980835 -84.94999694824219,-3.9000000953674316 C-86.73999786376953,-3.450000047683716 -88,-1.850000023841858 -88,0 C-88,1.850000023841858 -86.73999786376953,3.450000047683716 -84.94999694824219,3.9000000953674316 C-79.47000122070312,5.28000020980835 -74.13999938964844,7.079999923706055 -68.93000030517578,9.319999694824219 C-55.369998931884766,15.15999984741211 -43.5099983215332,23.15999984741211 -33.33000183105469,33.33000183105469 C-23.15999984741211,43.5 -15.149999618530273,55.369998931884766 -9.319999694824219,68.93000030517578 C-7.079999923706055,74.12999725341797 -5.28000020980835,79.47000122070312 -3.9000000953674316,84.94999694824219 C-3.450000047683716,86.73999786376953 -1.840000033378601,88 0,88 C1.850000023841858,88 3.450000047683716,86.73999786376953 3.9000000953674316,84.94999694824219 C5.28000020980835,79.47000122070312 7.079999923706055,74.13999938964844 9.319999694824219,68.93000030517578 C15.15999984741211,55.369998931884766 23.15999984741211,43.5099983215332 33.33000183105469,33.33000183105469 C43.5,23.15999984741211 55.369998931884766,15.149999618530273 68.93000030517578,9.319999694824219 C74.12999725341797,7.079999923706055 79.47000122070312,5.28000020980835 84.94999694824219,3.9000000953674316 C86.73999786376953,3.450000047683716 88,1.840000033378601 88,0 C88,-1.850000023841858 86.73999786376953,-3.450000047683716 84.94999694824219,-3.9000000953674316 C79.47000122070312,-5.28000020980835 74.13999938964844,-7.079999923706055 68.93000030517578,-9.319999694824219 C55.369998931884766,-15.15999984741211 43.5099983215332,-23.15999984741211 33.33000183105469,-33.33000183105469 C23.15999984741211,-43.5 15.149999618530273,-55.369998931884766 9.319999694824219,-68.93000030517578 C7.079999923706055,-74.12999725341797 5.28000020980835,-79.47000122070312 3.9000000953674316,-84.94999694824219 C3.450000047683716,-86.73999786376953 1.850000023841858,-88 0,-88 C-1.850000023841858,-88 -3.450000047683716,-86.73999786376953 -3.9000000953674316,-84.94999694824219z" />
              </g>
            </g>
          </g>
          <linearGradient id="__lottie_element_529" spreadMethod="pad" gradientUnits="userSpaceOnUse" x1="-33" y1="26" x2="31" y2="-28">
            <stop offset="0%" stopColor="rgb(52,107,241)" />
            <stop offset="22%" stopColor="rgb(50,121,248)" />
            <stop offset="45%" stopColor="rgb(49,134,255)" />
            <stop offset="72%" stopColor="rgb(64,147,255)" />
            <stop offset="99%" stopColor="rgb(79,160,255)" />
          </linearGradient>
          <linearGradient id="__lottie_element_533" spreadMethod="pad" gradientUnits="userSpaceOnUse" x1="-33" y1="26" x2="31" y2="-28">
            <stop offset="0%" stopColor="rgb(52,107,241)" />
            <stop offset="22%" stopColor="rgb(50,121,248)" />
            <stop offset="45%" stopColor="rgb(49,134,255)" />
            <stop offset="72%" stopColor="rgb(64,147,255)" />
            <stop offset="99%" stopColor="rgb(79,160,255)" />
          </linearGradient>
          <mask id="__lottie_element_526_1" style={{ maskType: 'alpha' }}>
            <use xlinkHref="#__lottie_element_526" />
          </mask>
        </defs>
        <g clipPath="url(#__lottie_element_519)">
          <g mask="url(#__lottie_element_526_1)" style={{ display: 'block' }}>
            <g transform="matrix(0.12479999661445618,0,0,0.12479999661445618,4.986400604248047,4.986400604248047)" opacity="1">
              <g opacity="1" transform="matrix(1,0,0,1,88.25,88.25)">
                <path fill="url(#__lottie_element_533)" fillOpacity="1" d=" M-14.654000282287598,174.77099609375 C-14.654000282287598,174.77099609375 174.77099609375,14.654000282287598 174.77099609375,14.654000282287598 C174.77099609375,14.654000282287598 14.654000282287598,-174.77099609375 14.654000282287598,-174.77099609375 C14.654000282287598,-174.77099609375 -174.77099609375,-14.654000282287598 -174.77099609375,-14.654000282287598 C-174.77099609375,-14.654000282287598 -14.654000282287598,174.77099609375 -14.654000282287598,174.77099609375z" />
              </g>
            </g>
          </g>
        </g>
      </svg>
    </Box>
  )
}

export function LivePreview({
  backgroundEnabled,
  backgroundUrl,
  blurPx,
  messageGlassEnabled,
}: LivePreviewProps) {
  const { colorMode } = useColorMode()
  const isDark = colorMode === 'dark'
  const isBackgroundMode = backgroundEnabled
  const canRenderBackground = backgroundEnabled && Boolean(backgroundUrl)
  const previewTitle = t('settingPanel.theme.livePreview')

  return (
    <Box>
      <Heading size="sm" mb={3} textAlign="center">
        {previewTitle === 'settingPanel.theme.livePreview' ? 'Live Preview' : previewTitle}
      </Heading>

      <Box
        borderRadius="2xl"
        shadow="lg"
        overflow="hidden"
        border="1px solid"
        borderColor="var(--gem-sys-color--outline-variant, color(from var(--gem-sys-color--on-surface-variant, #5f6368) srgb r g b/.25))"
        position="relative"
        isolation="isolate"
      >
        {canRenderBackground && (
          <Box
            position="absolute"
            inset={0}
            overflow="hidden"
            borderRadius="inherit"
            pointerEvents="none"
            zIndex={0}
          >
            <Box
              position="absolute"
              inset={`-${Math.max(8, blurPx * 2)}px`}
              bgImage={`url(${backgroundUrl})`}
              bgSize="cover"
              bgPos="center"
              filter={`blur(${blurPx}px)${isDark ? ' brightness(0.5)' : ''}`}
            />
          </Box>
        )}

        <HStack align="stretch" minH="320px" gap={0} position="relative" zIndex={1}>
          <VStack
            width="72px"
            p={3}
            gap={2}
            align="stretch"
            bg={canRenderBackground
              ? isDark
                ? 'color-mix(in srgb, var(--theme-600), transparent 80%)'
                : 'rgba(246, 240, 224, 0.11)'
              : 'gemSidenavBg'}
            borderRight={isBackgroundMode ? 'none' : '1px solid'}
            borderColor="var(--gem-sys-color--outline-variant, color(from var(--gem-sys-color--on-surface-variant, #5f6368) srgb r g b/.2))"
            backdropFilter={canRenderBackground ? 'blur(10px)' : undefined}
            borderTopLeftRadius="2xl"
            borderBottomLeftRadius="2xl"
            overflow="hidden"
          >
            <Box
              h="10px"
              w="14px"
              borderRadius="full"
              bg="color(from var(--gem-sys-color--on-surface-variant, #5f6368) srgb r g b/.42)"
            />
            <Box h={2} />
            {[false, false, true, false, false].map((isActive, idx) => (
              <HStack
                key={idx}
                h="24px"
                px={1.5}
                borderRadius="full"
                bg={isActive ? 'gemPrimaryContainer' : 'transparent'}
              >
                <Box
                  h="6px"
                  w={isActive ? '30px' : idx % 2 === 0 ? '20px' : '16px'}
                  borderRadius="full"
                  bg={
                    isActive
                      ? 'gemOnPrimaryContainer'
                      : 'color(from var(--gem-sys-color--on-surface-variant, #5f6368) srgb r g b/.45)'
                  }
                />
              </HStack>
            ))}
            <Box flex="1" />
            <Box
              h="24px"
              borderRadius="full"
              bg="color(from var(--gem-sys-color--on-surface-variant, #5f6368) srgb r g b/.14)"
            />
          </VStack>

          <VStack
            flex="1"
            p={4}
            gap={3}
            align="stretch"
            bg={isBackgroundMode
              ? 'transparent'
              : 'color-mix(in srgb, var(--gem-sys-color--surface) 88%, transparent)'}
          >
            <HStack justify="space-between">
              <Box
                h="8px"
                w="72px"
                borderRadius="full"
                bg="color(from var(--gem-sys-color--on-surface-variant, #5f6368) srgb r g b/.4)"
              />
              <HStack gap={1.5}>
                <Box
                  h="8px"
                  w="8px"
                  borderRadius="full"
                  bg="color(from var(--gem-sys-color--on-surface-variant, #5f6368) srgb r g b/.4)"
                />
                <Box
                  h="8px"
                  w="8px"
                  borderRadius="full"
                  bg="color(from var(--gem-sys-color--on-surface-variant, #5f6368) srgb r g b/.4)"
                />
              </HStack>
            </HStack>

            <Box alignSelf="flex-end" maxW="205px">
              <Box
                px={3}
                py={2}
                borderRadius="xl"
                borderBottomRightRadius="sm"
                bg={messageGlassEnabled
                  ? 'color-mix(in srgb, var(--gem-sys-color--surface-container-high), transparent 60%)'
                  : 'var(--gem-sys-color--surface-container-high, var(--gem-sys-color--surface-container, #eef2ef))'}
                backdropFilter={messageGlassEnabled ? 'blur(20px)' : undefined}
                border={messageGlassEnabled ? '1px solid #f2f2f2' : undefined}
                color="gemOnSurface"
                fontSize="xs"
                lineHeight="1.4"
              >
                Summarize Gemini Power Kit updates.
              </Box>
            </Box>

            <HStack
              alignSelf="flex-start"
              alignItems="flex-start"
              maxW="236px"
              gap={1.5}
              pt={0.5}
            >
              <PreviewGeminiIcon />
              <Box
                px={3}
                py={2}
                borderRadius="xl"
                bg={messageGlassEnabled
                  ? isDark
                    ? 'color-mix(in srgb, var(--theme-600), transparent 60%)'
                    : 'color-mix(in srgb, var(--theme-50), transparent 80%)'
                  : isDark
                    ? 'transparent'
                    : 'var(--theme-25, color-mix(in srgb, var(--gem-sys-color--surface-container), #ffffff 35%))'}
                backdropFilter={messageGlassEnabled ? 'blur(20px)' : undefined}
                border={messageGlassEnabled && !isDark ? '1px solid #f2f2f2' : undefined}
                boxShadow={messageGlassEnabled && isDark ? '0 0 1px 0 #ffffff' : undefined}
                color="gemOnSurface"
                fontSize="xs"
                lineHeight="1.45"
              >
                Added chat outline, quick follow-up, and prompt chaining support.
              </Box>
            </HStack>

            <Box flex="1" />

            <HStack
              gap={2}
              p={2}
              borderRadius="full"
              bg="var(--gem-sys-color--surface-bright, var(--gem-sys-color--surface-container, #eef2ef))"
            >
              <Box
                flex="1"
                h="12px"
                borderRadius="full"
                bg="color(from var(--gem-sys-color--on-surface-variant, #5f6368) srgb r g b/.26)"
              />
              <Box
                as="span"
                width="28px"
                height="28px"
                borderRadius="full"
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                bg="var(--gem-sys-color--primary-container, var(--gem-sys-color--primary, #1a73e8))"
                color="var(--gem-sys-color--on-primary-container, #ffffff)"
                fontSize="11px"
                fontWeight="bold"
              >
                ▶
              </Box>
            </HStack>
          </VStack>
        </HStack>
      </Box>
    </Box>
  )
}
