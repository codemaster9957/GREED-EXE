import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    target: 'es2020',
  },
  server: {
    port: 5173,
    host: true,
  },
  define: {
    // Expose env vars to client code
    __SERVER_URL__: JSON.stringify(process.env.VITE_SERVER_URL || 'ws://localhost:3000'),
  },
});
