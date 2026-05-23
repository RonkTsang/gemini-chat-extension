import { startFirefoxBackground } from './firefox'

const includeBrowsers = import.meta.env.COMMAND === 'serve'
  ? [import.meta.env.BROWSER]
  : ['firefox']

export default defineBackground({
  include: includeBrowsers,
  persistent: true,
  main() {
    if (!import.meta.env.FIREFOX) {
      return
    }

    startFirefoxBackground()
  },
})
