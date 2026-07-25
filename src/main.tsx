import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// The service worker serves the app shell out of its precache, so a page that is
// already open keeps running the previous build even after a newly deployed worker
// installs and activates. Without this, a deploy took three reloads to become
// visible: the first triggers the update, and the page only picks it up once the new
// worker is in control.
//
// `controllerchange` fires when control passes to a new worker, which is the moment
// the shell in cache is actually new — so reload once, then. The `controller` guard
// matters: on a first-ever visit there is no controller yet, and claiming one would
// otherwise reload the page on itself.
//
// Reloading mid-read is safe here because the reader records its position
// continuously (`lastRead` in App.tsx) and restores it on boot.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
