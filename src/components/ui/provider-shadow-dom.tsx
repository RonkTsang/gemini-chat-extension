"use client"

import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"
import { ChakraProvider, EnvironmentProvider } from "@chakra-ui/react"
import createCache from "@emotion/cache"
import { CacheProvider } from "@emotion/react"
import { ThemeProvider, type ThemeProviderProps, useTheme } from "next-themes"
import { useEffect, useState } from "react"
import root from "react-shadow/emotion"
import themeConfig from "./theme"
import { ColorModeProvider, ColorModeProviderProps } from "./color-mode"

const varRoot = ":host"

const config = defineConfig({
  cssVarsRoot: varRoot,
  conditions: {
    light: `${varRoot} &, .light &`,
    dark: `${varRoot}(.dark) &, .dark &`,  // 
  },
  preflight: { scope: varRoot },
  globalCss: {
    [varRoot]: {
      ...defaultConfig.globalCss?.html ?? {},
      colorPalette: "blue", // Change this to any color palette you prefer
    },
  },
})

export const system = createSystem(defaultConfig, config, themeConfig)

function ShadowThemeSync({ host }: { host: HTMLElement | null }) {
  const { resolvedTheme } = useTheme()
  useEffect(() => {
    if (!host) return
    const theme = resolvedTheme === "dark" ? "dark" : "light"
    host.classList.toggle("dark", theme === "dark")
    host.classList.toggle("light", theme === "light")
    host.setAttribute("data-theme", theme)
  }, [host, resolvedTheme])
  return null
}

export interface ProviderProps extends ColorModeProviderProps {
  host?: { style?: React.CSSProperties }
}

export function Provider(props: ProviderProps) {
  const [shadow, setShadow] = useState<HTMLElement | null>(null)
  const [cache, setCache] = useState<ReturnType<typeof createCache> | null>(
    null,
  )

  useEffect(() => {
    if (!shadow?.shadowRoot || cache) return
    const emotionCache = createCache({
      key: "root",
      container: shadow.shadowRoot,
    })
    setCache(emotionCache)
  }, [shadow, cache])

  return (
    <root.div ref={setShadow} style={props.host?.style}>
      {shadow && cache && (
        <EnvironmentProvider value={() => shadow.shadowRoot ?? document}>
          <CacheProvider value={cache}>
            <ChakraProvider value={system}>
              {/* <ColorModeProvider enableSystem {...props} /> */}
              <ThemeProvider {...props}>
                <ShadowThemeSync host={shadow} />
                {props.children}
              </ThemeProvider>
            </ChakraProvider>
          </CacheProvider>
        </EnvironmentProvider>
      )}
    </root.div>
  )
}