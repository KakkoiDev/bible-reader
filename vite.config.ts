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
        name: 'Bible · 14 editions',
        short_name: 'Bible',
        description:
          'Read the Bible in parallel across 14 editions — KJV, 文語訳 (furigana), 口語訳, KJF, 和合本 (traditional and simplified), Almeida, Reina-Valera, Van Dyck, Ang Dating Biblia, Textus Receptus, the Westminster Leningrad Codex, La Sankta Biblio and the Vulgata Clementina. Works offline.',
        // Match the app's own surfaces, not an orphan navy that appears nowhere in
        // tokens.css. background_color is the ground the OS paints before first
        // paint, so it must equal the splash's own --sbg or the launch flashes.
        theme_color: '#faf8f4',
        background_color: '#faf8f4',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/monochrome-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
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
        // Editions and glosses are cached the first time they're read and stay available
        // offline. StaleWhileRevalidate (not CacheFirst) so a re-fetch runs in the
        // background: a data update (e.g. added furigana, a repaired verse) is served on
        // the next visit instead of being pinned to the first-ever cached copy forever.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/data\/[a-z]+\/[a-z0-9-]+\.json$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
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
