// Status word in a coloured pill (leave design §4). The colour is
// decoration only — the word always shows next to it.
import { STATUSES, CHIP_CLASS, type StatusCode } from '@/lib/leave'

export function StatusChip({ status }: { status: string }) {
  const code = status as StatusCode
  const label = STATUSES[code] ?? status
  const cls = CHIP_CLASS[code] ?? 'bg-[#6b7280]/10 text-[#6b7280]'
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-3 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  )
}
