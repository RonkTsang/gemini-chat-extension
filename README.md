<div align="center">
  <img src="images/gemini-power-kit.png" alt="Gemini Power Kit Logo" style="border-radius: 12px"/>
  <br/>
  <a href="https://github.com/google-gemini/gemini-cli">
    <img src="https://img.shields.io/badge/Made%20with-Gemini%20Cli-4285F4?style=for-the-badge&logo=google-gemini&logoColor=white" alt="Made with Gemini-Cli"/>
  </a>
</div>

# Gemini Power Kit - A Chrome Extension for Gemini

Transform your [Gemini](https://gemini.google.com) experience with powerful tools designed to boost your productivity and streamline your workflow. Gemini Power Kit is your essential companion, bringing together three powerful features: **Chat Outline**, **Quick Follow-up**, and **Chain Prompt**.

## Features

### 🗂️ Chat Outline
-   **Clickable Outline**: Generates a navigable list of all your prompts in a conversation.
-   **Easy Navigation**: Click any prompt to instantly scroll to that point in the chat.
-   **Pin Mode**: Keep the outline popover open and visible while you scroll and interact.
-   **Smart Organization**: Never get lost in long conversations again.

### ⚡ Quick Follow-up
-   **Text Selection Actions**: Select any text and instantly access custom prompts.
-   **Customizable Prompts**: Create your own quick-action templates (translate, explain, summarize, etc.).
-   **One-Click Execution**: Turn selected text into a follow-up question with a single click.
-   **Template Library**: Pre-built templates to get you started immediately.

### 🔗 Chain Prompt
-   **Multi-Step Automation**: Execute complex conversation workflows automatically.
-   **Variable Support**: Define reusable variables for dynamic prompt chains.
-   **Visual Editor**: Build and manage chain prompts with an intuitive interface.
-   **Real-time Monitoring**: Track execution progress with live status updates.

### 🎨 Design
-   **Minimalist UI**: Clean, unobtrusive interface that stays out of your way.
-   **Light & Dark Theme**: Automatically adapts to the Gemini website's theme.
-   **Shadow DOM Isolation**: Styles never conflict with Gemini's native interface.

## Install from Chrome Web Store

You can install the extension directly from the Chrome Web Store:

[**Add to Chrome**](https://chromewebstore.google.com/detail/ihakfpnmefdkllhkecanagmienfnmojn?utm_source=item-share-cb)

## How to Install (from source)

1.  Clone or download this repository.
2.  Open Google Chrome and navigate to `chrome://extensions`.
3.  Enable **Developer mode** using the toggle in the top-right corner.
4.  Click the **Load unpacked** button.
5.  Select the directory where you cloned or downloaded this repository.

The extension's icon will now appear in the top-left corner of the Gemini chat window.

---

## AI-Assisted Development Workflow (Recommended)

To maintain consistency and development speed, we highly recommend using an AI programming assistant like **Gemini CLI**, GitHub Copilot, or others for your contributions.

The key to success is providing the AI with the right context. Our project's "source of truth" for its architecture is the technical documentation.

### Recommended Steps

1.  **Define Your Goal**: Have a clear idea of the feature or bug fix you want to implement.

2.  **Gather Context**: Your primary context files are:
    *   `docs/tech.md` (The project's architectural blueprint)
    *   The specific file(s) you intend to modify (e.g., `content.js`, `styles.css`).

3.  **Write a Clear Prompt**: Describe your goal in detail to the AI. For example:
    > "I want to add a 'copy to clipboard' button next to each item in the outline list inside `#gemini-toc-list`. When a user clicks this button, the text content of that specific prompt should be copied to their clipboard. Please ensure the new button's styling matches the existing UI and that all logic adheres to the patterns described in the provided technical documentation and existing code."

4.  **Execute and **Review****:
    *   Use your preferred AI tool to generate the code.
    *   **This is the most critical step.** Always manually review, test, and refine the AI's output. You are the author of the final code, and you are responsible for its quality and correctness.

### Example using Gemini CLI

If you wanted to implement the "copy button" feature described above, you could use a command like this:

```bash
gemini

@docs/tech.md {YOUR PROMPT}
```

This command tells Gemini to edit using your prompt, with the additional context of the technical documentation.
