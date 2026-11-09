import { Building2, Crosshair, Loader2, MapPin, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useSuggest } from '@/api/hooks'
import { api } from '@/api/client'
import type { Place } from '@/api/types'
import { cn } from '@/lib/cn'

interface Props {
  label: string
  placeholder: string
  value: Place | null
  onChange: (place: Place | null) => void
  near: { lat: number; lon: number } | null
  allowLocate?: boolean
  marker: 'origin' | 'destination'
}

export function PlaceInput({ label, placeholder, value, onChange, near, allowLocate, marker }: Props) {
  const id = useId()
  const listId = `${id}-list`
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: results = [], isFetching, isError } = useSuggest(open ? text : '', near)

  const choose = (p: Place) => {
    onChange(p)
    setText('')
    setOpen(false)
  }

  const locate = () => {
    if (!navigator.geolocation) {
      setLocateError('Location is not available in this browser.')
      return
    }
    setLocating(true)
    setLocateError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lon } = pos.coords
          const r = await api.reverse(lat, lon)
          choose(r.result ?? { label: 'Current location', detail: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon })
        } catch {
          setLocateError('Couldn’t look up your address.')
        } finally {
          setLocating(false)
        }
      },
      () => {
        setLocating(false)
        setLocateError('Location permission was denied.')
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }

  const dot = (
    <span
      aria-hidden="true"
      className={cn(
        'mt-0.5 shrink-0',
        marker === 'origin'
          ? 'size-3 rounded-full border-[3px] border-fg'
          : 'h-3.5 w-3 bg-fg [clip-path:polygon(0_0,100%_0,100%_62%,50%_100%,0_62%)]',
      )}
    />
  )

  if (value) {
    return (
      <div>
        <span className="mb-1.5 block text-[13px] font-semibold uppercase tracking-wider text-muted">{label}</span>
        <div className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-raised pl-4 pr-1.5">
          {dot}
          <div className="min-w-0 flex-1 py-2">
            <div className="truncate font-semibold">{value.label}</div>
            {value.detail && <div className="truncate text-sm text-muted">{value.detail}</div>}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null)
              requestAnimationFrame(() => inputRef.current?.focus())
            }}
            className="grid size-11 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-fg"
            aria-label={`Change ${label.toLowerCase()}`}
          >
            <X className="size-5" />
          </button>
        </div>
      </div>
    )
  }

  const showList = open && text.trim().length >= 2
  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </label>
      <div className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-raised pl-4 pr-1.5 focus-within:border-signal">
        {dot}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          className="h-12 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-faint"
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!showList) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(results.length - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            } else if (e.key === 'Enter' && results[active]) {
              e.preventDefault()
              choose(results[active] as Place)
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
        />
        {isFetching && <Loader2 className="size-5 animate-spin text-faint" aria-hidden="true" />}
        {allowLocate && (
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="grid size-11 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-fg disabled:opacity-60"
            aria-label="Use my current location"
            title="Use my current location"
          >
            {locating ? <Loader2 className="size-5 animate-spin" /> : <Crosshair className="size-5" />}
          </button>
        )}
      </div>
      {locateError && <p className="mt-1.5 text-sm text-sev">{locateError}</p>}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-auto rounded-xl border border-line-strong bg-raised p-1.5 shadow-2xl scroll-thin"
        >
          {isError && <li className="px-3 py-3 text-sm text-muted">Search is unavailable right now.</li>}
          {!isError && results.length === 0 && !isFetching && (
            <li className="px-3 py-3 text-sm text-muted">No US places match “{text.trim()}”.</li>
          )}
          {results.map((p, i) => (
            <li
              key={`${p.lat},${p.lon},${p.label}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(p)
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 py-2',
                i === active && 'bg-sunken',
              )}
            >
              {p.kind === 'Geography' ? (
                <Building2 className="size-4 shrink-0 text-faint" aria-hidden="true" />
              ) : (
                <MapPin className="size-4 shrink-0 text-faint" aria-hidden="true" />
              )}
              <span className="min-w-0">
                <span className="block truncate font-medium">{p.label}</span>
                <span className="block truncate text-sm text-muted">{p.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
