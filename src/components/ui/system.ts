"use client"

import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"
import themeConfig from "./theme"

const varRoot = ":host"

const config = defineConfig({
  cssVarsRoot: varRoot,
  conditions: {
    light: `${varRoot} &, .light &`,
    dark: `${varRoot}(.dark) &, .dark &`,
  },
  preflight: { scope: varRoot },
  globalCss: {
    [varRoot]: {
      ...defaultConfig.globalCss?.html ?? {},
      colorPalette: "blue", // Default
    },
  },
})

export const system = createSystem(defaultConfig, config, themeConfig)
