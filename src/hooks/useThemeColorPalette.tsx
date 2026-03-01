"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { Global } from "@emotion/react"
import { system } from "@/components/ui/system"
import { getThemeKey, themeKeyStorage } from "@/entrypoints/content/gemini-theme/themeStorage"

const ColorPaletteContext = createContext<{
  palette: string
  setPalette: (p: string) => void
}>({
  palette: "blue",
  setPalette: () => { },
})

export function useColorPalette() {
  return useContext(ColorPaletteContext)
}

export function ColorPaletteProvider({ children }: { children: React.ReactNode }) {
  const [palette, setPalette] = useState("blue")

  // Initialize from storage on mount, then watch for cross-tab changes
  useEffect(() => {
    getThemeKey().then((key) => {
      if (key) setPalette(key)
    })

    const unwatch = themeKeyStorage.watch((newKey) => {
      setPalette(newKey || 'blue')
    })
    return unwatch
  }, [])

  return (
    <ColorPaletteContext.Provider value={{ palette, setPalette }}>
      <Global
        styles={{
          ":host": system.css({ colorPalette: palette }) as any,
        }}
      />
      {children}
    </ColorPaletteContext.Provider>
  )
}
