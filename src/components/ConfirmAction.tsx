'use client'

// LR-14 (FR-07): every action is button → inline confirm row → done.
// Nothing posts until "Confirm". When the action needs a remark (sign,
// reject, HR decisions) the remark field lives inside the confirm row.
// Built in Task 16; wired up by the action tasks (17, 19, 20, 22).
import { useActionState, useState, type ReactNode } from 'react'

export type ConfirmActionState = { message?: string }

export type ConfirmActionProps = {
  action: (
    state: ConfirmActionState | undefined,
    formData: FormData,
  ) => Promise<ConfirmActionState | void>
  label: string
  confirmLabel?: string
  hidden?: Record<string, string | number>
  remarkLabel?: string
  remarkRequired?: boolean
  children?: ReactNode
}

const BUTTON =
  'rounded-full bg-[#23a55a] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1c8b4b] disabled:opacity-50'

export function ConfirmAction({
  action,
  label,
  confirmLabel = 'Confirm',
  hidden = {},
  remarkLabel,
  remarkRequired,
  children,
}: ConfirmActionProps) {
  const [state, formAction, isPending] = useActionState<
    ConfirmActionState | undefined,
    FormData
  >(async (s, fd) => (await action(s, fd)) ?? undefined, undefined)
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={BUTTON}>
        {label}
      </button>
    )
  }

  return (
    <form action={formAction} className="rounded-2xl border border-[#dfe3df] bg-white p-5">
      {children}
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
      {remarkLabel ? (
        <div className="mt-1">
          <label className="mb-1.5 block text-sm font-medium text-[#1f2937]">
            {remarkLabel}
          </label>
          <textarea
            name="remark"
            required={remarkRequired}
            maxLength={500}
            rows={3}
            className="w-full rounded-2xl border border-[#dfe3df] bg-white px-4 py-2.5 text-sm text-[#1f2937] focus:border-[#23a55a] focus:outline-none focus:ring-2 focus:ring-[#23a55a]/20"
          />
        </div>
      ) : null}
      {state?.message ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {state.message}
        </p>
      ) : null}
      <div className="mt-4 flex gap-3">
        <button type="submit" disabled={isPending} className={BUTTON}>
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-full border border-[#dfe3df] bg-white px-5 py-2 text-sm font-medium text-[#1f2937] transition-colors hover:bg-[#f0f2f0]"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
