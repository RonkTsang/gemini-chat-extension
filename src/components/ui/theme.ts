import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"
import { ButtonRecipe } from "./theme/button";

const config = defineConfig({
  theme: {
    recipes: {
      button: ButtonRecipe,
    },
    tokens: {
      colors: {
        gemPrimary: { value: "var(--gem-sys-color--primary)" },
        gemSecondary: { value: "var(--gem-sys-color--secondary)" },

        gemPrimaryContainer: { value: "var(--gem-sys-color--primary-container)" },
        gemSecondaryContainer: { value: "var(--gem-sys-color--secondary-container)" },
        gemSurface: { value: "var(--gem-sys-color--surface)" },
        gemSurfaceContainer: { value: "var(--gem-sys-color--surface-container)" },

        // font color
        gemOnPrimaryContainer: { value: "var(--gem-sys-color--on-primary-container)" },
        gemOnSurfaceVariant: { value: "var(--gem-sys-color--on-surface-variant)" },
        gemOnSurface: { value: "var(--gem-sys-color--on-surface)" },

        gemOutlineVariant: { value: "var(--gem-sys-color--outline-variant)" },
      },
    },
    semanticTokens: {
      colors: {
        surfaceContainerHover: {
          value: "color(from {colors.gemOnSurfaceVariant} srgb r g b/.08)",
        },
      },
    },
    keyframes: {
      spin: {
        from: { transform: 'rotate(0deg)' },
        to: { transform: 'rotate(360deg)' }
      }
    },
  },
})

export default config;