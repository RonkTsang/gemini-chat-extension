document.addEventListener('DOMContentLoaded', () => {
    const quickQuoteToggle = document.getElementById('quickQuoteToggle');
    const quickQuoteLabel = document.getElementById('quickQuoteLabel');

    // Set the translated label text
    quickQuoteLabel.textContent = chrome.i18n.getMessage('enableQuickQuoteLabel');

    // Load the saved state from chrome.storage.sync
    // Default to 'true' (enabled) if no setting is found.
    chrome.storage.sync.get({ enableQuickQuote: true }, (data) => {
        quickQuoteToggle.checked = data.enableQuickQuote;
    });

    // Save the new state when the toggle is changed
    quickQuoteToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ enableQuickQuote: quickQuoteToggle.checked });
    });
});
