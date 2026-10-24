import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative asset paths, so the desktop app can load dist/index.html from disk
});
