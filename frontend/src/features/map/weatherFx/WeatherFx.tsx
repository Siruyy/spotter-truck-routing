import { useMap } from '@vis.gl/react-maplibre'
import { useEffect } from 'react'
import type { HeatLayer } from '@/api/types'
import { useUi } from '@/store/ui'
import { WeatherField } from './field'

interface Particle {
  x: number
  y: number
  age: number
  life: number
  seed: number
  vx: number // px/frame sideways drift (wind-driven for rain)
  vy: number // px/frame fall speed
  size: number // flake radius / streak length
  tier: number // 0 light, 1 moderate, 2 heavy: drawn with increasing opacity
}

const MAX_WIND = 2400
const MAX_DROPS = 1400
const MAX_FLAKES = 900

/**
 * Animated weather over the map for the active layer and slider hour:
 * wind particles that flow with direction and speed, falling rain streaks, and
 * drifting snow. Drawn on a 2D canvas between the map and its markers; paused
 * when hidden and replaced by static arrows under reduced motion.
 */
export function WeatherFx({ layer, visible }: { layer: HeatLayer; visible: boolean }) {
  const { current: mapRef } = useMap()
  const heat = useUi((s) => s.heatData)
  const theme = useUi((s) => s.theme)

  useEffect(() => {
    if (!mapRef || !heat || !visible || layer === 'risk') return
    const map = mapRef.getMap()
    const field = new WeatherField(heat)
    const canvas = document.createElement('canvas')
    canvas.className = 'weather-fx'
    canvas.setAttribute('aria-hidden', 'true')
    const host = map.getCanvasContainer()
    host.insertBefore(canvas, map.getCanvas().nextSibling)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let w = 0
    let h = 0
    const resize = () => {
      w = map.getCanvas().clientWidth
      h = map.getCanvas().clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const sampleAt = (x: number, y: number) => {
      const ll = map.unproject([x, y])
      return field.sample(ll.lng, ll.lat)
    }

    const count =
      layer === 'wind'
        ? Math.min(MAX_WIND, Math.round((w * h) / 520))
        : layer === 'rain'
          ? Math.min(MAX_DROPS, Math.round((w * h) / 700))
          : Math.min(MAX_FLAKES, Math.round((w * h) / 1100))
    const particles: Particle[] = []
    const spawn = (p: Particle, fresh: boolean) => {
      p.x = Math.random() * w
      p.y = Math.random() * h
      p.age = fresh ? Math.floor(Math.random() * 60) : 0
      p.life = layer === 'wind' ? 40 + Math.random() * 50 : 18 + Math.random() * 22
      p.seed = Math.random() * Math.PI * 2
    }
    /** Rain/snow: keep a drop only where the forecast has precipitation, denser where heavier. */
    const placePrecip = (p: Particle) => {
      spawn(p, false)
      const s = sampleAt(p.x, p.y)
      const isRain = layer === 'rain'
      const amount = s ? (isRain ? s.rain : s.snow) : 0
      // Density follows intensity; trace amounts get only a sprinkle.
      const odds = isRain ? amount / 0.2 : amount / 0.5
      if (!s || amount < 0.01 || Math.random() > Math.min(1, odds)) {
        p.life = -1
        return
      }
      p.tier = amount < (isRain ? 0.1 : 0.5) ? 0 : amount < (isRain ? 0.5 : 2) ? 1 : 2
      if (isRain) {
        // Short local streak (~40-70 px), slanted by the wind: never drifts out of the rain area.
        p.life = 5 + Math.random() * 4
        p.vy = 7 + Math.random() * 2
        p.vx = s.ux * Math.min(4, 1 + s.speed * 0.12)
        p.size = 7 + p.tier * 3
      } else {
        p.life = 50 + Math.random() * 40
        p.vy = 0.35 + Math.random() * 0.45
        p.vx = s.ux * Math.min(1.2, s.speed * 0.04)
        p.size = 0.9 + Math.random() * 1.3
      }
    }
    field.setHour(useUi.getState().hour)
    for (let i = 0; i < count; i++) {
      const p = { x: 0, y: 0, age: 0, life: 0, seed: 0, vx: 0, vy: 0, size: 1, tier: 0 }
      if (layer === 'wind') spawn(p, true)
      else placePrecip(p)
      particles.push(p)
    }
    const light = document.documentElement.dataset.theme === 'light'
    const palette = light
      ? {
          wind: ['rgba(40,52,66,0.28)', 'rgba(40,52,66,0.5)', 'rgba(196,120,0,0.8)', 'rgba(200,60,30,0.9)'],
          rain: 'rgb(30,100,190)',
          snow: 'rgb(90,110,140)',
          arrow: 'rgba(30,40,55,0.75)',
        }
      : {
          wind: ['rgba(236,233,226,0.35)', 'rgba(236,233,226,0.6)', 'rgba(255,214,120,0.8)', 'rgba(255,140,90,0.95)'],
          rain: 'rgb(175,212,255)',
          snow: 'rgb(245,248,255)',
          arrow: 'rgba(236,233,226,0.75)',
        }

    const drawStaticArrows = () => {
      ctx.clearRect(0, 0, w, h)
      if (layer !== 'wind') return
      ctx.strokeStyle = palette.arrow
      ctx.lineWidth = 1.5
      const step = 46
      for (let y = step / 2; y < h; y += step) {
        for (let x = step / 2; x < w; x += step) {
          const s = sampleAt(x, y)
          if (!s) continue
          const len = 6 + Math.min(16, s.speed * 0.45)
          const dx = s.ux * len
          const dy = -s.uy * len
          ctx.beginPath()
          ctx.moveTo(x - dx / 2, y - dy / 2)
          ctx.lineTo(x + dx / 2, y + dy / 2)
          const ang = Math.atan2(dy, dx)
          ctx.lineTo(x + dx / 2 - 5 * Math.cos(ang - 0.5), y + dy / 2 - 5 * Math.sin(ang - 0.5))
          ctx.moveTo(x + dx / 2, y + dy / 2)
          ctx.lineTo(x + dx / 2 - 5 * Math.cos(ang + 0.5), y + dy / 2 - 5 * Math.sin(ang + 0.5))
          ctx.stroke()
        }
      }
    }

    let raf = 0
    let frame = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (document.hidden) return
      frame++
      field.setHour(useUi.getState().hour)

      if (layer === 'wind') {
        // Fade previous frame to leave short trails.
        ctx.globalCompositeOperation = 'destination-in'
        ctx.fillStyle = 'rgba(0,0,0,0.9)'
        ctx.fillRect(0, 0, w, h)
        ctx.globalCompositeOperation = 'source-over'
        ctx.lineWidth = 1.25
        ctx.lineCap = 'round'
        const buckets: [number, number, number, number][][] = [[], [], [], []]
        for (const p of particles) {
          const s = sampleAt(p.x, p.y)
          if (!s || ++p.age > p.life) {
            spawn(p, false)
            continue
          }
          const step = 0.35 + s.speed * 0.075 // px/frame grows with wind speed
          const nx = p.x + s.ux * step
          const ny = p.y - s.uy * step
          const b = s.speed < 10 ? 0 : s.speed < 20 ? 1 : s.speed < 35 ? 2 : 3
          buckets[b]!.push([p.x, p.y, nx, ny])
          p.x = nx
          p.y = ny
          if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) spawn(p, false)
        }
        buckets.forEach((segs, i) => {
          if (!segs.length) return
          ctx.strokeStyle = palette.wind[i] as string
          ctx.beginPath()
          for (const [x0, y0, x1, y1] of segs) {
            ctx.moveTo(x0, y0)
            ctx.lineTo(x1, y1)
          }
          ctx.stroke()
        })
        return
      }

      ctx.clearRect(0, 0, w, h)
      const isRain = layer === 'rain'
      const alphaByTier = [0.35, 0.6, 0.9]
      // Update: age, re-place expired/empty drops, move live ones.
      for (const p of particles) {
        if (p.life < 0 || ++p.age > p.life) {
          placePrecip(p)
          continue
        }
        if (isRain) {
          p.x += p.vx
          p.y += p.vy
        } else {
          p.x += p.vx + Math.sin(frame / 24 + p.seed) * 0.35
          p.y += p.vy
        }
      }
      // Draw: one path per intensity tier, heavier tiers more opaque.
      ctx.lineCap = 'round'
      for (let tier = 0; tier < 3; tier++) {
        ctx.globalAlpha = alphaByTier[tier] as number
        ctx.beginPath()
        for (const p of particles) {
          if (p.life < 0 || p.tier !== tier) continue
          if (isRain) {
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p.x - p.vx * (p.size / p.vy), p.y - p.size)
          } else {
            ctx.moveTo(p.x + p.size, p.y)
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          }
        }
        if (isRain) {
          ctx.strokeStyle = palette.rain
          ctx.lineWidth = 1 + tier * 0.25
          ctx.stroke()
        } else {
          ctx.fillStyle = palette.snow
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    }

    // Particles live in screen space: re-seed when the view moves.
    const onMove = () => {
      ctx.clearRect(0, 0, w, h)
      for (const p of particles) {
        if (layer === 'wind') spawn(p, true)
        else placePrecip(p)
      }
      if (reduced) drawStaticArrows()
    }
    const onResize = () => {
      resize()
      onMove()
    }
    map.on('move', onMove)
    map.on('resize', onResize)
    let unsub = () => {}
    if (reduced) {
      drawStaticArrows()
      unsub = useUi.subscribe((s, prev) => {
        if (Math.round(s.hour) !== Math.round(prev.hour)) {
          field.setHour(s.hour)
          drawStaticArrows()
        }
      })
    } else {
      raf = requestAnimationFrame(tick)
    }
    return () => {
      cancelAnimationFrame(raf)
      unsub()
      map.off('move', onMove)
      map.off('resize', onResize)
      canvas.remove()
    }
  }, [mapRef, heat, layer, visible, theme])

  return null
}
