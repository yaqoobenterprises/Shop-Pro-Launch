import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { FEATURES } from './src/config/features';
import { isServerSupabaseKey } from './src/lib/supabaseSecurity';

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const unsafeViteKey = Object.entries(env).some(
    ([name, value]) => name.startsWith('VITE_') && isServerSupabaseKey(value),
  );
  const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;

  if (unsafeViteKey) {
    throw new Error(
      'Refusing to start or build with a Supabase secret/service-role key in a VITE_ variable. Use a publishable key.',
    );
  }

  if (!env.VITE_SUPABASE_URL || !supabaseKey) {
    console.info(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to enable cloud sign-in and sync.',
    );
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'language-feature-prepaint',
        transformIndexHtml(html) {
          return html.replace(
            /data-language-ur="(?:true|false)"/,
            `data-language-ur="${FEATURES.languageUr}"`,
          );
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(projectDirectory, './src'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'lucide-vendor': ['lucide-react'],
            'supabase-vendor': ['@supabase/supabase-js'],
          },
        },
      },
    },
    server: {
      host: 'localhost',
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
