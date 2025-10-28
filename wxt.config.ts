import { defineConfig } from 'wxt';
import svgr from 'vite-plugin-svgr';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/i18n/module'],
  srcDir: 'src',
  vite: () => ({
    plugins: [svgr()],
  }),
  manifest: () => {
    return {
      name: "Chat Outline for Gemini: Reclaim Your Focus",
      default_locale: "en",
      permissions: [
        "storage"
      ],
      web_accessible_resources: [
        {
          resources: ["url-monitor-main-world.js"],
          matches: ["*://gemini.google.com/*"]
        }
      ]
    };
  },
});
