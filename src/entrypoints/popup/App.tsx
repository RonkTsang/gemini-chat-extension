import { useState, useEffect, useRef } from 'react';
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
  clearResponseCompleteNotificationPermissionIntent,
  getResponseCompleteNotificationPermissionIntent,
  type ResponseCompleteNotificationPermissionIntent,
} from '@/services/responseCompleteNotificationPermissionIntent';
import {
  getResponseCompleteNotificationAudioPermissionRequest,
  getResponseCompleteNotificationPermissionRequest,
  setResponseCompleteNotificationAudioEnabled,
  setResponseCompleteNotificationEnabled,
} from '@/services/responseCompleteNotificationSettings';
import { 
  getAllSettings,
  setChatOutlineEnabled,
} from './storage';
import { ChatOutlineIcon, QuickQuoteIcon, ExternalLinkIcon, NotificationIcon } from '@/components/icons';
import { NotificationTestButton } from '@/components/notification/NotificationTestButton';
import { quickFollowStore } from '@/stores/quickFollowStore'
import { useResponseCompleteNotificationSettings } from '@/hooks/useResponseCompleteNotificationSettings';

type BrowserWithOptionalPermissions = typeof browser & {
  permissions?: typeof browser.permissions
}

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [permissionIntent, setPermissionIntent] = useState<ResponseCompleteNotificationPermissionIntent | null>(null);
  const [permissionIntentLoaded, setPermissionIntentLoaded] = useState(false);
  const [permissionGrantPending, setPermissionGrantPending] = useState(false);
  const [permissionGrantError, setPermissionGrantError] = useState<string | null>(null);
  const permissionIntentLoadStarted = useRef(false);
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

  useEffect(() => {
    if (permissionIntentLoadStarted.current) {
      return;
    }
    permissionIntentLoadStarted.current = true;

    const loadPermissionIntent = async () => {
      try {
        const nonce = new URLSearchParams(window.location.search).get('nonce');
        const intent = await getResponseCompleteNotificationPermissionIntent(nonce);
        setPermissionIntent(await resolveGrantedPermissionIntent(intent));
      } catch (error) {
        console.error('Failed to load response notification permission intent:', error);
        setPermissionIntent(null);
      } finally {
        setPermissionIntentLoaded(true);
      }
    };

    loadPermissionIntent();
  }, []);

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

  const resolveGrantedPermissionIntent = async (
    intent: ResponseCompleteNotificationPermissionIntent | null,
  ): Promise<ResponseCompleteNotificationPermissionIntent | null> => {
    if (!intent) {
      return null;
    }

    const permissionsApi = (browser as BrowserWithOptionalPermissions).permissions;
    if (!permissionsApi?.contains) {
      return intent;
    }

    const permissionRequest = intent.permissionKind === 'audio'
      ? getResponseCompleteNotificationAudioPermissionRequest()
      : getResponseCompleteNotificationPermissionRequest();

    if (!await permissionsApi.contains(permissionRequest)) {
      return intent;
    }

    if (intent.permissionKind === 'audio') {
      await setResponseCompleteNotificationAudioEnabled(true);
    } else {
      await setResponseCompleteNotificationEnabled(true);
    }
    await clearResponseCompleteNotificationPermissionIntent();
    return null;
  };

  const handleGrantNotificationPermission = async () => {
    if (!permissionIntent) {
      return;
    }

    const permissionsApi = (browser as BrowserWithOptionalPermissions).permissions;
    if (!permissionsApi?.request) {
      setPermissionGrantError(t('responseNotificationPermissionDenied') || 'Required permissions were not granted.');
      return;
    }

    setPermissionGrantPending(true);
    setPermissionGrantError(null);
    try {
      const permissionRequest = permissionIntent.permissionKind === 'audio'
        ? getResponseCompleteNotificationAudioPermissionRequest()
        : getResponseCompleteNotificationPermissionRequest();
      const granted = await permissionsApi.contains(permissionRequest)
        || await permissionsApi.request(permissionRequest);

      if (!granted) {
        setPermissionGrantError(
          permissionIntent.permissionKind === 'audio'
            ? t('responseNotificationAudioPermissionDenied') || 'Audio permission was not granted.'
            : t('responseNotificationPermissionDenied') || 'Required permissions were not granted.',
        );
        await clearResponseCompleteNotificationPermissionIntent();
        return;
      }

      if (permissionIntent.permissionKind === 'audio') {
        await setResponseCompleteNotificationAudioEnabled(true);
      } else {
        await setResponseCompleteNotificationEnabled(true);
      }
      await clearResponseCompleteNotificationPermissionIntent();
      window.close();
    } catch (error) {
      console.error('Failed to grant response notification permission:', error);
      setPermissionGrantError(
        permissionIntent.permissionKind === 'audio'
          ? t('responseNotificationAudioPermissionDenied') || 'Audio permission was not granted.'
          : t('responseNotificationPermissionDenied') || 'Required permissions were not granted.',
      );
      await clearResponseCompleteNotificationPermissionIntent();
    } finally {
      setPermissionGrantPending(false);
    }
  };

  const handleCancelPermissionGrant = async () => {
    await clearResponseCompleteNotificationPermissionIntent();
    window.close();
  };

  if (isLoading || notificationSettings.isLoading || !permissionIntentLoaded) {
    return (
      <Box width="320px" p={3}>
        <Flex justify="center" align="center" h="100px">
          <Text>Loading...</Text>
        </Flex>
      </Box>
    );
  }

  if (permissionIntent) {
    const isAudioIntent = permissionIntent.permissionKind === 'audio';

    return (
      <Box width="320px" fontFamily="system-ui, sans-serif" fontSize="14px" color={textColor}>
        <Card.Root border="none" shadow="none">
          <Card.Header pb={2} px={4} pt={4}>
            <Flex align="center" gap={2} mb={2}>
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
              <Heading size="md" fontWeight="semibold">
                {isAudioIntent
                  ? t('responseNotificationAudioPermissionTitle') || 'Enable notification sound'
                  : t('responseNotificationPermissionTitle') || 'Enable response notifications'}
              </Heading>
            </Flex>
            <Text fontSize="sm" color={secondaryTextColor}>
              {isAudioIntent
                ? t('responseNotificationAudioPermissionDescription') || 'Grant the extension audio permission so it can play a short sound after a notification is created.'
                : t('responseNotificationPermissionDescription') || 'Grant notification permissions so Gemini Power Kit can notify you when Gemini finishes replying.'}
            </Text>
          </Card.Header>

          <Card.Body px={4} py={3}>
            <Stack gap={3}>
              {permissionGrantError ? (
                <Text fontSize="xs" color="red.500">
                  {permissionGrantError}
                </Text>
              ) : null}
              <Button
                colorPalette="blue"
                width="100%"
                loading={permissionGrantPending}
                onClick={() => void handleGrantNotificationPermission()}
              >
                {isAudioIntent
                  ? t('responseNotificationAudioPermissionButton') || 'Allow notification sound'
                  : t('responseNotificationPermissionButton') || 'Allow notifications'}
              </Button>
              <Button
                variant="ghost"
                width="100%"
                color={mutedTextColor}
                disabled={permissionGrantPending}
                onClick={() => void handleCancelPermissionGrant()}
              >
                {t('responseNotificationPermissionCancel') || 'Not now'}
              </Button>
            </Stack>
          </Card.Body>
        </Card.Root>
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
                  <NotificationTestButton
                    variant="ghost"
                    justifyContent="flex-start"
                    color={mutedTextColor}
                    _hover={{ color: textColor, bg: hoverBg }}
                    canSendTest={notificationSettings.canSendTest}
                    sendTestNotification={notificationSettings.sendTestNotification}
                    fontWeight="normal"
                    fontSize="xs"
                    h="auto"
                    px={0}
                    py={1}
                  >
                    {t('responseNotificationTest') || "Send test notification"}
                  </NotificationTestButton>
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
