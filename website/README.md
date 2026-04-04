# Gemini Power Kit Documentation Website

This is the official documentation website for [Gemini Power Kit](https://github.com/RonkTsang/gemini-chat-extension), a Chrome extension that supercharges your Gemini experience with productivity-focused features.

The site is built using [Astro](https://astro.build/) and the [Starlight](https://starlight.astro.build/) documentation framework.

## 🚀 Getting Started

### Prerequisites

- Node.js v18.14.1 or higher
- [pnpm](https://pnpm.io/) (recommended)

### Installation

```bash
# Install dependencies from the project root
pnpm install
```

### Development

To start the development server for the website:

```bash
cd website
pnpm run dev
```

The documentation will be live at `http://localhost:4321`.

## 📂 Project Structure

Inside the `website` directory, you'll find:

- `src/content/docs/`: Contains the documentation content in Markdown (`.md`) or MDX (`.mdx`).
  - `zh-cn/`: Chinese translations of the documentation.
- `src/assets/`: Static assets like images and logos.
- `src/styles/`: Custom CSS styling for the site.
- `astro.config.mjs`: Configuration for Astro and Starlight integrations.

## 🧞 Commands

All commands should be run from within the `website` directory:

| Command | Action |
| :--- | :--- |
| `pnpm run dev` | Starts local dev server |
| `pnpm run build` | Builds the production site to `./dist/` |
| `pnpm run preview` | Previews the build locally |
| `pnpm run astro ...` | Runs Astro CLI commands |

## 🌐 Localization

This documentation supports multiple languages:
- **English**: Located in `src/content/docs/`
- **Chinese (简体中文)**: Located in `src/content/docs/zh-cn/`

## 👀 Learn More

- [Starlight Documentation](https://starlight.astro.build/)
- [Astro Documentation](https://docs.astro.build)
- [Gemini Power Kit GitHub](https://github.com/RonkTsang/gemini-chat-extension)
