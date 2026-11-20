'use client'

// The form itself (Leave Request design §4): pill inputs styled like /login,
// a two-step confirm (AC-28 — nothing is sent until Confirm), and the
// description field that only shows for Other / Compassionate.
import { useActionState, useState } from 'react'
import {
  createLeaveRequest,
  type CreateLeaveFormState,
} from './actions'
import { LEAVE_TYPES, REQUIRES_DESCRIPTION, type LeaveTypeCode } from '@/lib/leave'

export type SupervisorOption = { id: number; name: string }

const INPUT_CLASS =
  'w-full rounded-full border border-[#dfe3df] bg-white px-5 py-2.5 text-sm text-[#1f2937] focus:border-[#23a55a] focus:outline-none focus:ring-2 focus:ring-[#23a55a]/20'
const LABEL_CLASS = 'mb-1.5 block text-sm font-medium text-[#1f2937]'

export function LeaveForm({ supervisors }: { supervisors: SupervisorOption[] }) {
  const [state, formAction, isPending] = useActionState<
    CreateLeaveFormState | undefined,
    FormData
  >(createLeaveRequest, undefined)
  const [leaveType, setLeaveType] = useState<LeaveTypeCode>('ANNUAL')
  const [supervisorId, setSupervisorId] = useState(
    String(supervisors[0]?.id ?? ''),
  )
  const [confirming, setConfirming] = useState(false)

  const needsDescription = (REQUIRES_DESCRIPTION as string[]).includes(leaveType)
  const chosenSupervisor = supervisors.find((s) => String(s.id) === supervisorId)

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <div>
        <label htmlFor="leaveType" className={LABEL_CLASS}>
          Leave type
        </label>
        <select
          id="leaveType"
          name="leaveType"
          value={leaveType}
          onChange={(e) => {
            setLeaveType(e.target.value as LeaveTypeCode)
            setConfirming(false)
          }}
          className={INPUT_CLASS}
        >
          {(Object.keys(LEAVE_TYPES) as LeaveTypeCode[]).map((code) => (
            <option key={code} value={code}>
              {LEAVE_TYPES[code]}
            </option>
          ))}
        </select>
      </div>

      {/* Always in the DOM so the field is stable; hidden until the type
          that needs it (Other / Compassionate) is picked. */}
      <div hidden={!needsDescription}>
        <label htmlFor="otherLeaveType" className={LABEL_CLASS}>
          What is this leave for?
        </label>
        <input
          id="otherLeaveType"
          name="otherLeaveType"
          type="text"
          maxLength={300}
          placeholder="Briefly describe the reason"
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="startDate" className={LABEL_CLASS}>
            Start date
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            onChange={() => setConfirming(false)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="endDate" className={LABEL_CLASS}>
            End date
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            required
            onChange={() => setConfirming(false)}
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div>
        <label htmlFor="supervisorId" className={LABEL_CLASS}>
          Supervisor
        </label>
        <select
          id="supervisorId"
          name="supervisorId"
          value={supervisorId}
          onChange={(e) => {
            setSupervisorId(e.target.value)
            setConfirming(false)
          }}
          className={INPUT_CLASS}
        >
          {supervisors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {state?.message && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded-full bg-[#23a55a] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1c8b4b]"
        >
          Submit request
        </button>
      ) : (
        <div className="rounded-2xl border border-[#dfe3df] bg-white p-5">
          <p className="text-sm text-[#1f2937]">
            Send this request to{' '}
            <span className="font-medium">
              {chosenSupervisor?.name ?? 'your supervisor'}
            </span>{' '}
            for approval?
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-full bg-[#23a55a] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1c8b4b] disabled:opacity-50"
            >
              Confirm submit
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-full border border-[#dfe3df] bg-white px-4 py-2.5 text-sm font-medium text-[#1f2937] transition-colors hover:bg-[#f0f2f0]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
