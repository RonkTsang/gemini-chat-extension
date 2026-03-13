import { startFirefoxBackground } from './firefox'

export default defineBackground({
  include: ['firefox'],
  persistent: true,
  main() {
    startFirefoxBackground()
  },
})
