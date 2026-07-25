import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Set base to the repo subpath if deploying under a subdirectory (e.g. GitHub Pages).
const base = process.env.BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Bible · 11 editions',
        short_name: 'Bible',
        description:
          'Read the Bible in parallel across 11 editions — KJV, 文語訳 (furigana), KJF, 和合本, Almeida, Reina-Valera, Van Dyck, Ang Dating Biblia, Textus Receptus and the Westminster Leningrad Codex. Works offline.',
        theme_color: '#1e1b4b',
        background_color: '#1e1b4b',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell, the book index, and only the editions that are
        // visible by default (en/ja/fr, ~18 MB). Precaching all eleven would force
        // ~55 MB onto every install for translations most readers never switch on.
        globPatterns: [
          '**/*.{js,css,html,svg,png,woff2}',
          'data/index.json',
          'data/paragraphs.json',
          'data/{en,ja,fr}/*.json',
        ],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // The other eight editions are cached the first time they're read, and stay
        // available offline from then on.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/data\/[a-z]+\/[a-z0-9-]+\.json$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'bible-editions',
              expiration: { maxEntries: 800 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
