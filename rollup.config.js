import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy';
import { rimraf } from 'rimraf';

const isProduction = process.env.NODE_ENV === 'production';

export default {
  // Input file
  input: 'content.js',

  // Output configuration
  output: {
    file: 'dist/content.js',
    format: 'iife' // Immediately Invoked Function Expression, suitable for browser scripts
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

    // In production, enable terser for minification and obfuscation
    isProduction && terser({
      compress: {
        drop_console: true, // Remove all console.* calls
      },
      mangle: true, // Obfuscate variable names
      format: {
        comments: false, // Remove all comments
      },
    }),

    // Copy all non-JS static assets to the dist directory
    copy({
      targets: [
        { src: 'manifest.json', dest: 'dist' },
        { src: 'styles.css', dest: 'dist' },
        { src: 'images', dest: 'dist' },
        { src: '_locales', dest: 'dist' },
        { src: 'vendor', dest: 'dist' }
      ]
    })
  ]
};
