import { defineConfig } from 'wxt';
import svgr from 'vite-plugin-svgr';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/i18n/module'],
  srcDir: 'src',
  vite: () => ({
    plugins: [svgr()],
    esbuild: {
      charset: 'ascii',
    },
  }),
  manifest: () => {
    return {
      name: "Gemini Power Kit: Your Essential Companion",
      default_locale: "en",
      permissions: [
        "storage"
      ],
      web_accessible_resources: [
        {
          resources: ["url-monitor-main-world.js", "icon/512.png"],
          matches: ["*://gemini.google.com/*"]
        }
      ]
    };
  },
});
