import { chromium } from 'playwright'
/**
 * Live end-to-end check + README screenshots against the deployed app.
 *   npx playwright@1.65.0 install chromium
 *   node scripts/e2e-live.mjs docs/screenshots-raw [https://truckroute.siruyy.dev]
 * Set HTTPS_PROXY if the browser needs a proxy. Exits non-zero on failure.
 */
const OUT = process.argv[2] ?? '.'
const BASE = process.argv[3] ?? 'https://truckroute.siruyy.dev'
const SHARE = `${BASE}/t/piC-IHMBQp`
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined
const browser = await chromium.launch({ proxy, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const log = (...a) => console.log(...a)

async function ctx(opts = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, ...opts })
  const p = await c.newPage()
  p.on('pageerror', (e) => log('pageerror', e.message.slice(0, 160)))
  return { c, p }
}
const setHour = (p, h) => p.evaluate((h) => {
  const i = document.querySelector('input[aria-label="Forecast hour"]')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, String(h))
  i.dispatchEvent(new Event('input', { bubbles: true }))
}, h)

// 1) Full-size desktop shots from the shared trip
{
  const { c, p } = await ctx()
  await p.goto(SHARE, { waitUntil: 'load' }); await p.waitForTimeout(9000)
  await p.screenshot({ path: `${OUT}/desktop-results.png` })
  await p.locator('section[aria-label="Route options"] button[aria-pressed]').nth(1).click()
  await p.waitForTimeout(800)
  const sev = p.locator('ol[aria-label^="Weather checkpoints"] li button', { hasText: 'Severe' }).first()
  await sev.scrollIntoViewIfNeeded(); await sev.click()
  await p.getByRole('radio', { name: 'Rain' }).click()
  await setHour(p, 5); await p.waitForTimeout(3500)
  await p.screenshot({ path: `${OUT}/desktop-checkpoint.png` })
  await p.getByRole('button', { name: 'Switch to light theme' }).click()
  await p.waitForTimeout(4000)
  await p.screenshot({ path: `${OUT}/desktop-light.png` })
  await c.close()
}

// 2) Mobile
{
  const { c, p } = await ctx({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await p.goto(SHARE, { waitUntil: 'load' }); await p.waitForTimeout(9000)
  await p.screenshot({ path: `${OUT}/mobile-results.png` })
  await c.close()
}

// 3) Real end-to-end plan through the form, then offline reload
{
  const { c, p } = await ctx({ deviceScaleFactor: 1 })
  await p.goto(BASE, { waitUntil: 'load' }); await p.waitForTimeout(3000)
  const from = p.getByRole('combobox', { name: 'From' })
  await from.fill('Kansas City MO'); await p.getByRole('option').first().waitFor(); await p.keyboard.press('Enter')
  const to = p.getByRole('combobox', { name: 'To' })
  await to.fill('Nashville TN'); await p.getByRole('option').first().waitFor(); await p.keyboard.press('Enter')
  const t0 = Date.now()
  await p.getByRole('button', { name: /Plan routes/ }).click()
  await p.getByText(/Take Route [ABC]|No safe route/).waitFor({ timeout: 45000 })
  log('plan via UI', ((Date.now() - t0) / 1000).toFixed(1) + 's', '| verdict:', (await p.locator('section[aria-live]').first().innerText()).replace(/\s+/g, ' ').slice(0, 120))
  await p.waitForTimeout(2500)
  // Scrub benchmark: sweep 0 -> 48 h over 5 s, count app requests and slow frames.
  const bench = await p.evaluate(async () => {
    const input = document.querySelector('input[aria-label="Forecast hour"]')
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    const before = performance.getEntriesByType('resource').length
    const frames = []
    let last = performance.now()
    const start = last
    await new Promise((done) => {
      const step = (t) => {
        frames.push(t - last); last = t
        set.call(input, String(Math.min(48, ((t - start) / 5000) * 48)))
        input.dispatchEvent(new Event('input', { bubbles: true }))
        if (t - start < 5000) requestAnimationFrame(step); else done()
      }
      requestAnimationFrame(step)
    })
    frames.shift()
    const appRequests = performance.getEntriesByType('resource').slice(before).filter((e) => e.name.startsWith(location.origin)).length
    return { fps: 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length), slow: frames.filter((f) => f > 33).length, appRequests }
  })
  // Headless runs use software GL (SwiftShader), so fps here is not representative; the
  // hard requirement checked is that scrubbing makes zero network requests.
  log('scrub (software GL):', JSON.stringify(bench))
  if (bench.appRequests > 0) { console.error('FAIL: slider made network requests'); process.exitCode = 1 }
  await c.setOffline(true)
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(4000)
  const offline = await p.getByText(/You’re offline/).isVisible().catch(() => false)
  const header = await p.locator('h2').first().innerText().catch(() => '')
  log('offline reload -> banner:', offline, '| trip:', header.replace(/\s+/g, ' '))
  if (!offline || !header.includes('Kansas City')) {
    console.error('FAIL: offline restore')
    process.exitCode = 1
  }
  await p.screenshot({ path: `${OUT}/offline.png` })
  await c.close()
}
await browser.close()
