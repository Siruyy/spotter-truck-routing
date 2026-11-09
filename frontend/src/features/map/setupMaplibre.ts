import { setWorkerUrl } from 'maplibre-gl'

// MapLibre v6 ships its worker as a separate ES module. vite.config.ts copies the
// prebuilt worker (and the chunk it shares with the main bundle) to /vendor.
setWorkerUrl('/vendor/maplibre/maplibre-gl-worker.mjs')
