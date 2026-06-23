import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/save/entry.ts'),
      name: 'SmartboardRenderer',
      formats: ['iife'],
      fileName: () => 'renderer.js',
    },
    rollupOptions: {
      external: [],  // Bundle everything except what's loaded via <script> tags
      output: {
        globals: {},
        inlineDynamicImports: true,
      },
    },
    outDir: resolve(__dirname, 'dist-standalone'),
    emptyOutDir: true,
    minify: false,  // Keep readable for debugging
    target: 'es2020',
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
})
