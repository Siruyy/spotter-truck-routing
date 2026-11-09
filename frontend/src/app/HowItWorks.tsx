import { RiskChip } from '@/components/ui/RiskChip'

const ROWS = [
  { label: 'Wind', cells: ['< 25', '25–34', '35–44', '45–54', '≥ 55 mph'] },
  { label: 'Rain', cells: ['< 0.10', '0.10–0.24', '0.25–0.49', '0.50–1.00', '> 1.00 in/hr'] },
  { label: 'Snow', cells: ['< 0.5', '0.5–0.9', '1.0–1.9', '2.0–3.0', '> 3.0 in/hr'] },
]

/** The rules, stated plainly so drivers can trust the recommendation. */
export function HowItWorks() {
  return (
    <details className="group mt-6 rounded-2xl border border-line">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 font-semibold">
        How risk is scored
        <span className="text-muted transition-transform group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="px-4 pb-4 text-[15px] text-muted">
        <p>
          Each checkpoint uses the forecast for the hour your truck arrives. Its level is the worst of wind, rain and
          snow:
        </p>
        <div className="mt-3 overflow-x-auto scroll-thin">
          <table className="w-full min-w-[420px] border-separate border-spacing-y-1 text-sm">
            <thead>
              <tr>
                <th className="sr-only">Condition</th>
                {([0, 1, 2, 3, 4] as const).map((l) => (
                  <th key={l} className="px-0.5 text-left font-normal">
                    <RiskChip level={l} size="sm" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="pr-2 text-left font-semibold text-fg">
                    {r.label}
                  </th>
                  {r.cells.map((c) => (
                    <td key={c} className="px-0.5 tabular-nums">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          Heavy loads raise wind risk: over 30,000 lb at 45–54 mph is No Travel, and over 40,000 lb at 35–44 mph is
          Severe. Routes are ranked by fewest No Travel, then Severe, then High-risk miles, then average risk, then
          drive time.
        </p>
      </div>
    </details>
  )
}
