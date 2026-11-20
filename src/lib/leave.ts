// The one place that says what leave types and statuses are, how they read,
// how they look, and which transitions the LR-5 status machine allows
// (docs/specs/02-design.md, Leave Request part §1–§2).
// Pure module: no server-only imports, so pages, actions and tests share it.

export const LEAVE_TYPES = {
  ANNUAL: 'Annual leave',
  MATERNITY: 'Maternity leave',
  UNPAID: 'Unpaid leave',
  COMPASSIONATE: 'Compassionate leave',
  OTHER: 'Other',
} as const
export type LeaveTypeCode = keyof typeof LEAVE_TYPES
export const LEAVE_TYPE_CODES = Object.keys(LEAVE_TYPES) as LeaveTypeCode[]

// The employee must write what the leave is for (doc 7.2 + LR-3).
export const REQUIRES_DESCRIPTION: LeaveTypeCode[] = ['OTHER', 'COMPASSIONATE']

export const STATUSES = {
  PENDING_SUPERVISOR: 'Pending supervisor',
  SIGNED: 'Signed',
  PENDING_HR: 'Pending HR',
  APPROVED: 'Approved',
  REJECTED_SUPERVISOR: 'Rejected by supervisor',
  REJECTED_HR: 'Rejected by HR',
  WITHDRAWN: 'Withdrawn',
} as const
export type StatusCode = keyof typeof STATUSES
export const STATUS_CODES = Object.keys(STATUSES) as StatusCode[]

// Chip colours are decoration — the status word always shows (leave design §4).
export const CHIP_CLASS: Record<StatusCode, string> = {
  PENDING_SUPERVISOR: 'bg-[#b45309]/10 text-[#b45309]',
  SIGNED: 'bg-[#1d4ed8]/10 text-[#1d4ed8]',
  PENDING_HR: 'bg-[#1d4ed8]/10 text-[#1d4ed8]',
  APPROVED: 'bg-[#23a55a]/10 text-[#1c8b4b]',
  REJECTED_SUPERVISOR: 'bg-[#b91c1c]/10 text-[#b91c1c]',
  REJECTED_HR: 'bg-[#b91c1c]/10 text-[#b91c1c]',
  WITHDRAWN: 'bg-[#6b7280]/10 text-[#6b7280]',
}

export type LeaveAction =
  | 'sign'
  | 'rejectSupervisor'
  | 'withdraw'
  | 'sendToHr'
  | 'approve'
  | 'rejectHr'

export type Actor = 'owner' | 'namedSupervisor' | 'hr'

// LR-5: who may do it, from which status, to which status.
export const TRANSITIONS: Record<
  LeaveAction,
  { who: Actor; from: StatusCode[]; to: StatusCode; remarkRequired?: boolean }
> = {
  sign: { who: 'namedSupervisor', from: ['PENDING_SUPERVISOR'], to: 'SIGNED' },
  rejectSupervisor: {
    who: 'namedSupervisor',
    from: ['PENDING_SUPERVISOR'],
    to: 'REJECTED_SUPERVISOR',
    remarkRequired: true,
  },
  withdraw: { who: 'owner', from: ['PENDING_SUPERVISOR'], to: 'WITHDRAWN' },
  sendToHr: { who: 'owner', from: ['SIGNED'], to: 'PENDING_HR' },
  approve: { who: 'hr', from: ['PENDING_HR'], to: 'APPROVED' },
  rejectHr: {
    who: 'hr',
    from: ['PENDING_HR'],
    to: 'REJECTED_HR',
    remarkRequired: true,
  },
}

export type ActorUser = { id: number; role: string }
export type RequestLike = {
  employeeId: number
  supervisorId: number
  status: string
}

// "1 Dec 2027" — the date wording every error message and table uses
// (leave design §4). Pinned month names (en-GB would print "Sept") and
// UTC-anchored so a stored midnight date never shifts.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtLeaveDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

// Throws when the actor or the current status makes the action illegal.
// Callers pass the message straight through; the HR race wording is refined
// by the action after it re-reads the row (LR-5, interview Q4).
export function assertAllowedTransition(
  action: LeaveAction,
  user: ActorUser,
  request: RequestLike,
): void {
  const t = TRANSITIONS[action]
  if (!t) throw new Error('This action is not allowed.')

  if (t.who === 'owner') {
    if (user.role !== 'EMPLOYEE' || request.employeeId !== user.id) {
      throw new Error('This action is not allowed for you.')
    }
  } else if (t.who === 'namedSupervisor') {
    if (user.role !== 'SUPERVISOR' || request.supervisorId !== user.id) {
      throw new Error('This action is not allowed for you.')
    }
  } else if (t.who === 'hr') {
    if (user.role !== 'HR') {
      throw new Error('This action is not allowed for you.')
    }
  }

  if (!t.from.includes(request.status as StatusCode)) {
    throw new Error('This request has already been handled.')
  }
}
