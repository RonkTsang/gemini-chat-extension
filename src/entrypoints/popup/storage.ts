import { storage } from '#imports';

// Define storage items using WXT storage API.
export const enableChatOutline = storage.defineItem<boolean>(
  'sync:enableChatOutline',
  {
    fallback: true,
  }
);

export const enableQuickQuote = storage.defineItem<boolean>(
  'sync:enableQuickQuote',
  {
    fallback: true,
  }
);

export const enableBulkDelete = storage.defineItem<boolean>(
  'sync:enableBulkDelete',
  {
    fallback: true,
  }
);

export const enableGemAvatar = storage.defineItem<boolean>(
  'sync:enableGemAvatar',
  {
    fallback: false,
  }
);

export const DEFAULT_THEME_BLOOM_ENABLED = true;

export const enableThemeBloom = storage.defineItem<boolean>(
  'sync:enableThemeBloom',
  {
    fallback: DEFAULT_THEME_BLOOM_ENABLED,
  }
);

// Helper functions for individual settings
export const getChatOutlineEnabled = () => enableChatOutline.getValue();
export const setChatOutlineEnabled = (enabled: boolean) => enableChatOutline.setValue(enabled);

export const getQuickQuoteEnabled = () => enableQuickQuote.getValue();
export const setQuickQuoteEnabled = (enabled: boolean) => enableQuickQuote.setValue(enabled);

export const getBulkDeleteEnabled = () => enableBulkDelete.getValue();
export const setBulkDeleteEnabled = (enabled: boolean) => enableBulkDelete.setValue(enabled);

export const getGemAvatarEnabled = () => enableGemAvatar.getValue();
export const setGemAvatarEnabled = (enabled: boolean) => enableGemAvatar.setValue(enabled);

export const getThemeBloomEnabled = () => enableThemeBloom.getValue();
export const setThemeBloomEnabled = (enabled: boolean) => enableThemeBloom.setValue(enabled);

// Helper function to get all settings at once
export const getAllSettings = async () => {
  const [chatOutline, quickQuote] = await Promise.all([
    getChatOutlineEnabled(),
    getQuickQuoteEnabled(),
  ]);
  return {
    enableChatOutline: chatOutline,
    enableQuickQuote: quickQuote,
  };
};
