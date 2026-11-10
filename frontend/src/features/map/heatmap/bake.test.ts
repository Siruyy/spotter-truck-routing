import { bakeFrames, colorFor, mercY, rasterBounds, rasterSize } from './bake'

describe('heatmap baking', () => {
  const points: [number, number][] = []
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) points.push([40 + i * 0.5, -100 + j * 0.5])

  it('pads raster bounds so the kernel can fade out', () => {
    const [w, s, e, n] = rasterBounds({ points, spacing: 0.5 })
    expect(w).toBeLessThan(-100)
    expect(e).toBeGreaterThan(-98)
    expect(s).toBeLessThan(40)
    expect(n).toBeGreaterThan(42)
  })

  it('keeps roughly square mercator pixels', () => {
    const [w, h] = rasterSize([-100, 40, -90, 45], 256)
    expect(w).toBe(256)
    expect(h).toBeGreaterThan(100)
    expect(h).toBeLessThan(256)
  })

  it('produces one RGBA frame per hour, opaque inside, transparent outside', () => {
    const hours = 2
    const values = [...points.map(() => 3), ...points.map(() => -1)] // hour 1 all missing
    const bbox = rasterBounds({ points, spacing: 0.5 })
    const frames = bakeFrames({ layer: 'risk', hours, spacing: 0.5, bbox, points, values, width: 32, height: 32 })
    expect(frames).toHaveLength(2)
    const center = (16 * 32 + 16) * 4
    expect(frames[0]![center + 3]).toBeGreaterThan(150) // severe is bold
    expect(frames[0]![3]).toBe(0) // corner is outside the data
    expect(frames[1]!.every((v) => v === 0)).toBe(true)
  })

  it('paints risk as exact levels, never a blend between neighbours', () => {
    // Left half Low (0), right half No Travel (4): no pixel may come out Moderate/High/Severe.
    const values = points.map(([, lon]) => (lon < -99 ? 0 : 4))
    const bbox = rasterBounds({ points, spacing: 0.5 })
    const [frame] = bakeFrames({ layer: 'risk', hours: 1, spacing: 0.5, bbox, points, values, width: 64, height: 64 })
    const allowed = new Set([colorFor('risk', 0), colorFor('risk', 4)].map((c) => `${c[0]},${c[1]},${c[2]}`))
    for (let i = 0; i < frame!.length; i += 4) {
      if (frame![i + 3] === 0) continue
      expect(allowed.has(`${frame![i]},${frame![i + 1]},${frame![i + 2]}`)).toBe(true)
    }
  })

  it('maps layer values onto ordered ramps', () => {
    expect(colorFor('wind', 5)[3]).toBeGreaterThan(0) // calm is visible but faint
    expect(colorFor('wind', 5)[3]).toBeLessThan(100)
    expect(colorFor('wind', 45)[3]).toBeGreaterThan(colorFor('wind', 25)[3])
    expect(colorFor('risk', 0)[3]).toBeLessThan(colorFor('risk', 4)[3])
    expect(mercY(0)).toBe(0)
  })
})
