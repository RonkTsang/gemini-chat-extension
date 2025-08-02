# Contributing to Chat Outline for Gemini

First off, thank you for considering contributing! It's people like you that make open source such a great community.

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

## How Can I Contribute?

### Reporting Bugs

- **Ensure the bug was not already reported** by searching on GitHub under [Issues](https://github.com/RonkTsang/gemini-chat-extension/issues).
- If you're unable to find an open issue addressing the problem, [open a new one](https://github.com/RonkTsang/gemini-chat-extension/issues/new). Be sure to include a **title and clear description**, as much relevant information as possible, and a **code sample** or an **executable test case** demonstrating the expected behavior that is not occurring.

### Suggesting Enhancements

- Open a new issue to discuss your enhancement idea. This is the best way to ensure your suggestion aligns with the project's goals.
- Clearly describe the proposed enhancement, why it's needed, and how it would work.

### Pull Requests

1.  Fork the repo and create your branch from `main`.
2.  Set up your development environment: `npm install`.
3.  Make your changes. Please ensure your code follows the existing style.
4.  Run `npm run build:rollup` to ensure the bundled code is updated.
5.  Update the `README.md` or technical docs if you change any functionality.
6.  Ensure your commit messages are clear and descriptive.
7.  Issue that pull request!

## Code Style

This project does not yet have a formal linter setup. For now, please try to match the style and formatting of the existing codebase.

## Any questions?

Feel free to open an issue and ask.

Thank you for your contribution!
