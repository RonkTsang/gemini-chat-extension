import { defineConfig } from 'wxt';
import svgr from 'vite-plugin-svgr';
import removeConsole from 'vite-plugin-remove-console';
import { visualizer } from 'rollup-plugin-visualizer';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/i18n/module'],
  srcDir: 'src',
  vite: (configEnv) => ({
    define: {
      global: 'globalThis',
    },
    plugins: [
      svgr(),
      configEnv.mode === 'production' ? removeConsole({ includes: ['log'] }) : undefined,
      process.env.ANALYZE === 'true' ? visualizer({
        open: true,
        filename: '.output/stats.html',
        gzipSize: true,
        brotliSize: true,
      }) : undefined,
    ].filter(Boolean),
    esbuild: {
      charset: 'ascii',
    },
  }),
  manifest: (env) => {
    const isProduction = env.mode === 'production';

    // Support dynamic version from CI/CD pipeline (dry-run)
    // Falls back to package.json version for local development
    const version = process.env.RELEASE_VERSION || require('./package.json').version;

    const manifest: any = {
      name: "Gemini Power Kit: Your Essential Companion",
      version: version,
      default_locale: "en",
      permissions: [
        "storage"
      ],
      web_accessible_resources: [
        {
          resources: ["url-monitor-main-world.js", "theme-sync-main-world.js", "icon/512.png"],
          matches: ["*://gemini.google.com/*"]
        }
      ]
    };

    if (env.browser === 'firefox') {
      manifest.permissions.push(
        'webRequest',
        'webRequestBlocking',
        '*://gemini.google.com/*',
      )
      manifest.browser_specific_settings = {
        gecko: {
          id: 'gemini-power-kit@temporary.local',
          strict_min_version: '128.0',
          data_collection_permissions: {
            required: [],
            optional: [],
          },
        },
      }
    }

    if (!isProduction) {
      manifest.name = `🔴 ${manifest.name}`
    }

    return manifest
  },
});
