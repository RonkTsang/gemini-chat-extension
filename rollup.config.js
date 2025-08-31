import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy';
import { rimraf } from 'rimraf';

const isProduction = process.env.NODE_ENV === 'production';

export default {
  // Input files for content script and popup
  input: ['content.js', 'popup.js'],

  // Output configuration
  output: {
    dir: 'dist',
    format: 'es' // Use ES module format for multiple outputs
  },

  // Plugin configuration
  plugins: [
    // Clean the dist directory before building
    {
      name: 'clean-dist',
      buildStart: async () => {
        await rimraf('dist');
      }
    },

    // In production, enable terser for minification
    isProduction && terser({
      compress: {
        drop_console: true,
      },
      mangle: true,
      format: {
        comments: false,
      },
    }),

    // Copy all static assets to the dist directory
    copy({
      targets: [
        { src: 'manifest.json', dest: 'dist' },
        { src: 'styles.css', dest: 'dist' },
        { src: 'popup.html', dest: 'dist' },
        { src: 'popup.css', dest: 'dist' },
        { src: 'images', dest: 'dist' },
        { src: '_locales', dest: 'dist' },
        { src: 'vendor', dest: 'dist' }
      ]
    })
  ]
};
