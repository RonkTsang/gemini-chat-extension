import { useState, useEffect } from 'react';
import { browser } from 'wxt/browser';

import { 
  Box, 
  Flex, 
  Heading, 
  Text, 
  Stack,
  Card,
  Separator,
  Switch,
  Button,
} from '@chakra-ui/react';
import { 
  useColorModeValue,
  useColorMode,
} from '@/components/ui/color-mode';
import { t } from '@/utils/i18n';
import { PRODUCT_NAME } from '@/common/config';
import { 
  getAllSettings,
  setChatOutlineEnabled,
} from './storage';
import { ChatOutlineIcon, QuickQuoteIcon, ExternalLinkIcon, NotificationIcon } from '@/components/icons';
import { quickFollowStore } from '@/stores/quickFollowStore'
import { useResponseCompleteNotificationSettings } from '@/hooks/useResponseCompleteNotificationSettings';

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState({
    enableChatOutline: true,
    enableQuickQuote: true,
  });
  const notificationSettings = useResponseCompleteNotificationSettings();
  // Theme responsive colors
  const textColor = useColorModeValue('gray.900', 'gray.100');
  const secondaryTextColor = useColorModeValue('gray.600', 'gray.400');
  const mutedTextColor = useColorModeValue('gray.500', 'gray.500');
  const hoverBg = useColorModeValue('gray.100', 'gray.700');

  // Get theme information
  const { colorMode, setTheme } = useColorMode();

  useEffect(() => {
    setTheme('system');
  }, [])

  // Load initial settings from storage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const allSettings = await getAllSettings();
        await quickFollowStore.getState().hydrate();

        let quickFollowEnabled = quickFollowStore.getState().settings.enabled;
        if (quickFollowEnabled !== allSettings.enableQuickQuote) {
          try {
            await quickFollowStore.getState().setEnabled(allSettings.enableQuickQuote);
            quickFollowEnabled = allSettings.enableQuickQuote;
          } catch (error) {
            console.error('Failed to sync quick follow toggle with repository:', error);
          }
        }

        setSettings({
          enableChatOutline: allSettings.enableChatOutline,
          enableQuickQuote: quickFollowEnabled,
        });
      } catch (error) {
        console.error('Failed to load settings from storage:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSettings();
  }, []);

  const handleChatOutlineToggle = async (enabled: boolean) => {
    try {
      await setChatOutlineEnabled(enabled);
      setSettings(prev => ({ ...prev, enableChatOutline: enabled }));
    } catch (error) {
      console.error('Failed to update chat outline setting:', error);
    }
  };

  const handleQuickQuoteToggle = async (enabled: boolean) => {
    try {
      await quickFollowStore.getState().setEnabled(enabled);
      setSettings(prev => ({ ...prev, enableQuickQuote: enabled }));
    } catch (error) {
      console.error('Failed to update quick quote setting:', error);
    }
  };

  const handleReportIssue = () => {
    browser.tabs.create({ 
      url: 'https://github.com/RonkTsang/gemini-chat-extension/issues/new' 
    });
  };

  if (isLoading || notificationSettings.isLoading) {
    return (
      <Box width="320px" p={3}>
        <Flex justify="center" align="center" h="100px">
          <Text>Loading...</Text>
        </Flex>
      </Box>
    );
  }

  return (
    <Box width="320px" fontFamily="system-ui, sans-serif" fontSize="14px" color={textColor}>
      <Card.Root border="none" shadow="none">
        <Card.Header pb={2} px={4} pt={4}>
          <Flex justify="space-between" align="center" mb={1}>
            <Heading size="lg" fontWeight="semibold">
              {t('settingsTitle', PRODUCT_NAME) || "Gemini Settings"}
            </Heading>
          </Flex>
          <Text fontSize="sm" color={secondaryTextColor}>
            {t('settingsDescription', PRODUCT_NAME) || "Customize your Gemini chat experience"}
          </Text>
        </Card.Header>
        
        <Card.Body px={4} py={3}>
          <Stack gap={3}>
            {/* Chat Outline Setting */}
            <Flex align="center" justify="space-between" gap={3}>
              <Flex align="center" gap={2}>
                <Box 
                  w="32px" 
                  h="32px" 
                  borderRadius="6px" 
                  display="flex" 
                  alignItems="center" 
                  justifyContent="center" 
                  flexShrink={0}
                  bg="#0eaaf0"
                >
                  <ChatOutlineIcon />
                </Box>
                <Box>
                  <Text fontSize="sm" fontWeight="medium" mb={0.5}>
                    {t('enableChatOutlineLabel') || "Enable Chat Outline"}
                  </Text>
                  <Text fontSize="xs" color={mutedTextColor}>
                    {t('chatOutlineDescription') || "Generate clickable outline for easy navigation"}
                  </Text>
                </Box>
              </Flex>
              <Switch.Root
                checked={settings.enableChatOutline}
                onCheckedChange={(e) => handleChatOutlineToggle(e.checked)}
              >
                <Switch.HiddenInput />
                <Switch.Control />
              </Switch.Root>
            </Flex>

            {/* Quick Follow-up Setting */}
            <Flex align="center" justify="space-between" gap={3}>
              <Flex align="center" gap={2}>
                <Box 
                  w="32px" 
                  h="32px" 
                  borderRadius="6px" 
                  display="flex" 
                  alignItems="center" 
                  justifyContent="center" 
                  flexShrink={0}
                  bg="#ff9800"
                >
                  <QuickQuoteIcon />
                </Box>
                <Box>
                  <Text fontSize="sm" fontWeight="medium" mb={0.5}>
                    {t('enableQuickQuoteLabel') || "Enable Quick Follow-up"}
                  </Text>
                  <Text fontSize="xs" color={mutedTextColor}>
                    {t('quickQuoteDescription') || "Select text to quickly quote and ask questions"}
                  </Text>
                </Box>
              </Flex>
              <Switch.Root
                checked={settings.enableQuickQuote}
                onCheckedChange={(e) => handleQuickQuoteToggle(e.checked)}
              >
                <Switch.HiddenInput />
                <Switch.Control />
              </Switch.Root>
            </Flex>

            {/* Response Complete Notification Setting */}
            <Box>
              <Flex align="center" justify="space-between" gap={3}>
                <Flex align="center" gap={2}>
                  <Box
                    w="32px"
                    h="32px"
                    borderRadius="6px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    flexShrink={0}
                    bg="#64748b"
                  >
                    <NotificationIcon />
                  </Box>
                  <Box>
                    <Text fontSize="sm" fontWeight="medium" mb={0.5}>
                      {t('responseNotificationLabel') || "Notify when Gemini finishes replying"}
                    </Text>
                    <Text fontSize="xs" color={mutedTextColor}>
                      {t('responseNotificationDescription') || "Show the chat title and a short response preview when Gemini finishes replying."}
                    </Text>
                  </Box>
                </Flex>
                <Switch.Root
                  checked={notificationSettings.enabled}
                  disabled={notificationSettings.isPending}
                  onCheckedChange={(e) => void notificationSettings.toggleEnabled(e.checked)}
                >
                  <Switch.HiddenInput />
                  <Switch.Control />
                </Switch.Root>
              </Flex>

              {notificationSettings.notice || notificationSettings.statusText ? (
                <Text fontSize="xs" color={mutedTextColor} mt={2} pl="40px">
                  {notificationSettings.notice || notificationSettings.statusText}
                </Text>
              ) : null}

              {notificationSettings.enabled ? (
                <Stack gap={1} mt={2} pl="40px">
                  <Button
                    variant="ghost"
                    justifyContent="flex-start"
                    color={mutedTextColor}
                    _hover={{ color: textColor, bg: hoverBg }}
                    disabled={!notificationSettings.canSendTest || notificationSettings.isPending}
                    onClick={() => void notificationSettings.sendTestNotification()}
                    fontWeight="normal"
                    fontSize="xs"
                    h="auto"
                    px={0}
                    py={1}
                  >
                    {t('responseNotificationTest') || "Send test notification"}
                  </Button>
                  <Button
                    variant="ghost"
                    justifyContent="flex-start"
                    color={mutedTextColor}
                    _hover={{ color: textColor, bg: hoverBg }}
                    onClick={notificationSettings.openTroubleshooting}
                    fontWeight="normal"
                    fontSize="xs"
                    h="auto"
                    px={0}
                    py={1}
                  >
                    {t('responseNotificationTroubleshooting') || "Notifications not showing? Check notification settings"}
                  </Button>
                </Stack>
              ) : null}
            </Box>

            {/* Separator */}
            <Separator />
          </Stack>
        </Card.Body>

        <Card.Body px={4} pt={0} pb={4}>
          <Button
            variant="ghost"
            width="100%"
            justifyContent="flex-start"
            color={mutedTextColor}
            _hover={{ color: textColor, bg: hoverBg }}
            onClick={handleReportIssue}
            fontWeight="normal"
            fontSize="sm"
            h="auto"
            py={2}
          >
            <ExternalLinkIcon />
            <Text ml={2}>{t('reportIssueLabel') || "Report an Issue"}</Text>
          </Button>
        </Card.Body>
      </Card.Root>
    </Box>
  );
}

export default App;
