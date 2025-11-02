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
        tocBg: {
          value: { _light: "#ffffff", _dark: "#2d2d2d",  },
        },
        tocHoverBg: {
          value: { _light: "#f1f3f4", _dark: "#3a3a3a" },
        },
        tocText: {
          value: { _light: "#3c4043", _dark: "#e8eaed" },
        },
        separatorColor: {
          value: { _light: "{colors.gray.200}", _dark: "{colors.gray.600}" },
        },
      },
      shadows: {
        tocShadow: {
          value: {
            _light: "0 4px 12px rgba(0,0,0,0.1), 0 0 1px rgba(0,0,0,0.1)",
            _dark: "0 4px 12px rgba(0,0,0,0.3), 0 0 1px rgba(0,0,0,0.3)",
          }
        }
      }
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