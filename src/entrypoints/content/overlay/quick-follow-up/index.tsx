import { Box, Presence, useDisclosure, Container, HStack } from "@chakra-ui/react"
import { useState, useMemo } from "react"

import { EVENTS, type AppEvents } from "@/common/event"
import { useEvent } from "@/hooks/useEventBus"
import { eventBus } from "@/utils/eventbus"
import { t } from "@/utils/i18n"
import QuoteIcon from '~/assets/quote.svg?react'
import { HiAtSymbol } from "react-icons/hi"
import { ActionButton } from "./action-button"


function QuickFollowUp() {

  const { open, setOpen } = useDisclosure()
  const [positionData, setPositionData] = useState<AppEvents['quick-follow-up:show']['event'] | null>(null);
  const [selectedText, setSelectedText] = useState<string>('');

  useEvent(EVENTS.QUICK_FOLLOW_UP_SHOW, (data) => {
    setPositionData(data.event);
    setSelectedText(data.text);
    setOpen(true);
  });

  useEvent(EVENTS.QUICK_FOLLOW_UP_HIDE, () => {
    setOpen(false);
  });

  const displayPosition = useMemo(() => {
    if (!positionData) return null;

    return {
      top: positionData.clientY - 15,
      left: positionData.clientX,
      transform: 'translate(-50%, -100%)',
    }
  }, [positionData])

  const handleAddQuote = () => {
    eventBus.emit(EVENTS.QUICK_FOLLOW_UP_ADD_QUOTE, { text: selectedText });
  }

  const handleCustomQuickFollowUpButtonClick = (data: any) => {
    console.log(data);
  }

  const customQuickFollowUp = [
    {
      icon: <HiAtSymbol />,
      name: 'test',
      prompt: 'test',
    },
  ]

  return (
    <Presence
      present={open}
      lazyMount
      animationName={{
        _open: "slide-from-bottom, fade-in",
        _closed: "slide-to-bottom, fade-out",
      }}
      animationDuration="250ms"
    >
      <div style={{
        position: 'absolute',
        ...displayPosition,
      }}>
        {/* 胶囊按钮 */}
        <Container
          borderRadius="lg"
          border="1px solid"
          borderColor="tocHoverBg"
          bg="tocBg"
          boxShadow="tocShadow"
          _hover={{
            boxShadow: '0 6px 16px rgba(0,0,0,0.12), 0 0 2px rgba(0,0,0,0.1)'
          }}
          p={0}
          transition="box-shadow 0.2s"
          overflow="hidden"
          height="38px"
        >
          <HStack height="100%" alignItems="center" gap={0}>
            {/* Ask Gemini */}
            <ActionButton
              icon={<QuoteIcon />}
              label={t('askGemini')}
              onClick={handleAddQuote}
            />

            {/* Custom Action Buttons */}
            {
              customQuickFollowUp.length > 0 && (
                <Box height="60%" width="1px" bg="separatorColor" />
              )
            }
            {
              customQuickFollowUp.map((data) => (
                <ActionButton
                  icon={data.icon}
                  label={data.name}
                  tooltipPositioning={{ placement: "top" }}
                  onClick={() => {
                    handleCustomQuickFollowUpButtonClick(data);
                  }}
                />
              ))
            }
          </HStack>

        </Container>
      </div>
    </Presence>
  );
}
export default QuickFollowUp;