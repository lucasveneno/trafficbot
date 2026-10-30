import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    // Only run tests in src/; exclude bundled engine tests in src-tauri/
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['src-tauri/**', 'node_modules/**', 'dist/**'],
  },
})
