'use server'

// LR-1..LR-4 (docs/specs/02-design.md, Leave Request part §3): the submit
// checks run here, server-side, on every attempt — the form is decoration.
// The checking lives in createLeaveRequestCore so tests can call it without
// a browser (same split as login/actions.ts → authenticateUser).
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import {
  LEAVE_TYPE_CODES,
  REQUIRES_DESCRIPTION,
  fmtLeaveDate,
  type ActorUser,
  type LeaveTypeCode,
} from '@/lib/leave'

// Statuses that still "hold" dates (LR-4): withdrawn and rejected rows
// release their dates (interview Q3).
const BLOCKING_STATUSES = ['PENDING_SUPERVISOR', 'SIGNED', 'PENDING_HR', 'APPROVED']

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseDate(s: string): Date | null {
  if (!DATE_RE.test(s)) return null
  const d = new Date(`${s}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export type CreateLeaveInput = {
  leaveType: string
  otherLeaveType: string
  startDate: string
  endDate: string
  supervisorId: string
}

export type CreateLeaveResult = { ok: true; id: number } | { error: string }

export async function createLeaveRequestCore(
  user: ActorUser,
  input: CreateLeaveInput,
): Promise<CreateLeaveResult> {
  // LR-1: only employees create requests. The UI never shows this form to
  // anyone else, but the action is an untrusted entry point.
  if (user.role !== 'EMPLOYEE') {
    return { error: 'This action is not allowed for you.' }
  }

  // LR-3: type from the agreed list; Other/Compassionate need a description.
  const type = input.leaveType as LeaveTypeCode
  if (!LEAVE_TYPE_CODES.includes(type)) {
    return { error: 'Choose a leave type from the list.' }
  }
  const description = (input.otherLeaveType ?? '').trim()
  if (REQUIRES_DESCRIPTION.includes(type) && !description) {
    return { error: 'Write what this leave is for.' }
  }

  // LR-3: valid dates, end on or after start. Past dates are fine (Q6).
  const start = parseDate((input.startDate ?? '').trim())
  const end = parseDate((input.endDate ?? '').trim())
  if (!start || !end) {
    return { error: 'Enter a valid start date and end date.' }
  }
  if (end < start) {
    return {
      error: `End date cannot be before the start date (${fmtLeaveDate(end)} is before ${fmtLeaveDate(start)}).`,
    }
  }

  // LR-2: the supervisor must be a real SUPERVISOR in the employee's own
  // division — re-read from the database, never trusted from the form.
  const employee = await prisma.user.findUnique({ where: { id: user.id } })
  if (!employee) return { error: 'Please sign in again.' }
  const supervisorIdNum = Number((input.supervisorId ?? '').trim())
  const supervisor = Number.isInteger(supervisorIdNum)
    ? await prisma.user.findUnique({ where: { id: supervisorIdNum } })
    : null
  if (
    !supervisor ||
    supervisor.role !== 'SUPERVISOR' ||
    supervisor.division !== employee.division
  ) {
    return { error: 'Choose a supervisor from your own division.' }
  }

  // LR-4: inclusive overlap against the employee's own active requests.
  const clash = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: user.id,
      status: { in: BLOCKING_STATUSES },
      startDate: { lte: end },
      endDate: { gte: start },
    },
    orderBy: { submittedAt: 'desc' },
  })
  if (clash) {
    return {
      error: `You already have a request for ${fmtLeaveDate(clash.startDate)} – ${fmtLeaveDate(clash.endDate)}.`,
    }
  }

  const row = await prisma.leaveRequest.create({
    data: {
      employeeId: user.id,
      supervisorId: supervisor.id,
      leaveType: type,
      otherLeaveType: REQUIRES_DESCRIPTION.includes(type) ? description : null,
      startDate: start,
      endDate: end,
      status: 'PENDING_SUPERVISOR',
    },
  })
  return { ok: true, id: row.id }
}

export type CreateLeaveFormState = { message?: string }

export async function createLeaveRequest(
  _state: CreateLeaveFormState | undefined,
  formData: FormData,
): Promise<CreateLeaveFormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?expired=1')

  const result = await createLeaveRequestCore(user, {
    leaveType: String(formData.get('leaveType') ?? ''),
    otherLeaveType: String(formData.get('otherLeaveType') ?? ''),
    startDate: String(formData.get('startDate') ?? ''),
    endDate: String(formData.get('endDate') ?? ''),
    supervisorId: String(formData.get('supervisorId') ?? ''),
  })

  if ('error' in result) return { message: result.error }

  // Fresh list data before the destination renders (Next server-actions
  // guide: revalidate before redirect, which throws).
  revalidatePath('/employee')
  redirect('/employee?done=submitted')
}
