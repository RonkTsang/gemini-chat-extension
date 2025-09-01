document.addEventListener('DOMContentLoaded', () => {
    const chatOutlineToggle = document.getElementById('chatOutlineToggle');
    const chatOutlineLabel = document.getElementById('chatOutlineLabel');
    const quickQuoteToggle = document.getElementById('quickQuoteToggle');
    const quickQuoteLabel = document.getElementById('quickQuoteLabel');
    const reportIssueLink = document.getElementById('reportIssueLink');
    const reportIssueText = document.getElementById('reportIssueText');

    // Set translated text for UI elements
    chatOutlineLabel.textContent = chrome.i18n.getMessage('enableChatOutlineLabel');
    quickQuoteLabel.textContent = chrome.i18n.getMessage('enableQuickQuoteLabel');
    reportIssueText.textContent = chrome.i18n.getMessage('reportIssueLabel');

    // Load saved states from chrome.storage.sync
    chrome.storage.sync.get({ 
        enableChatOutline: true, // Default to true
        enableQuickQuote: true 
    }, (data) => {
        chatOutlineToggle.checked = data.enableChatOutline;
        quickQuoteToggle.checked = data.enableQuickQuote;
    });

    // Save the new state when the toggles are changed
    chatOutlineToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ enableChatOutline: chatOutlineToggle.checked });
    });

    quickQuoteToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ enableQuickQuote: quickQuoteToggle.checked });
    });

    // Handle the feedback link click
    reportIssueLink.addEventListener('click', (event) => {
        event.preventDefault();
        chrome.tabs.create({ url: reportIssueLink.href });
    });
});