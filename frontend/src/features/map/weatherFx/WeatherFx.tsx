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
      const amount = s ? (layer === 'rain' ? s.rain : s.snow) : 0
      const odds = layer === 'rain' ? amount / 0.25 : amount / 0.6
      if (!s || amount < 0.003 || Math.random() > Math.min(1, 0.15 + odds)) p.life = -1
    }
    field.setHour(useUi.getState().hour)
    for (let i = 0; i < count; i++) {
      const p = { x: 0, y: 0, age: 0, life: 0, seed: 0 }
      if (layer === 'wind') spawn(p, true)
      else placePrecip(p)
      particles.push(p)
    }
    const light = document.documentElement.dataset.theme === 'light'
    const palette = light
      ? {
          wind: ['rgba(40,52,66,0.28)', 'rgba(40,52,66,0.5)', 'rgba(196,120,0,0.8)', 'rgba(200,60,30,0.9)'],
          rain: 'rgba(30,100,190,0.6)',
          snow: 'rgba(90,110,140,0.85)',
          arrow: 'rgba(30,40,55,0.75)',
        }
      : {
          wind: ['rgba(236,233,226,0.35)', 'rgba(236,233,226,0.6)', 'rgba(255,214,120,0.8)', 'rgba(255,140,90,0.95)'],
          rain: 'rgba(170,210,255,0.6)',
          snow: 'rgba(245,248,255,0.9)',
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
      ctx.strokeStyle = palette.rain
      ctx.fillStyle = palette.snow
      ctx.lineWidth = 1
      ctx.beginPath()
      for (const p of particles) {
        if (++p.age > p.life) {
          placePrecip(p)
          continue
        }
        if (p.life < 0) continue
        if (isRain) {
          const fall = 9 + (p.seed % 1) * 5
          p.y += fall
          p.x += 1.2
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - 1.6, p.y - 10)
        } else {
          p.y += 0.7 + (p.seed % 1) * 0.6
          p.x += Math.sin(frame / 22 + p.seed) * 0.6
          ctx.moveTo(p.x + 1.6, p.y)
          ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2)
        }
      }
      if (isRain) ctx.stroke()
      else ctx.fill()
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
