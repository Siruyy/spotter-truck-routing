import { localHourEpoch } from '@/lib/time'

export type DepartureChoice =
  | { kind: 'now' }
  | { kind: 'plus2' }
  | { kind: 'tomorrow6' }
  | { kind: 'custom'; epoch: number }

export function resolveDeparture(choice: DepartureChoice, tz: string, nowS = Date.now() / 1000): number {
  switch (choice.kind) {
    case 'now':
      return nowS
    case 'plus2':
      return nowS + 2 * 3600
    case 'tomorrow6':
      return localHourEpoch(6, tz, true, nowS)
    case 'custom':
      return choice.epoch
  }
}
