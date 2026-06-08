const path = require('path');
const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

module.exports = defineConfig({
  root: path.resolve(__dirname, 'src/renderer-react'),
  base: './',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'src/renderer-dist'),
    emptyOutDir: true
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  }
});
