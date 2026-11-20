'use server'

// The LR-5 transitions (docs/specs/02-design.md, Leave Request §3).
// Like login, the checking lives in *Core functions so tests can call
// them without a browser; the thin exported actions add session,
// revalidation and the ?done= redirect (LR-14). The button rendering on
// the page is polish — the server re-check here is the control.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import {
  assertAllowedTransition,
  STATUSES,
  TRANSITIONS,
  type ActorUser,
  type LeaveAction,
  type StatusCode,
} from '@/lib/leave'

export type ActionState = { message?: string }

export type TransitionResult = { ok: true } | { error: string }

// LR-5: role + current status must match the transition table, or the
// attempt is refused with a fixed wording (LR-8: decided means done).
// Pure core: session-free, Next-API-free, so tests call it directly
// (same split as authenticateUser). revalidatePath/redirect stay in the
// exported actions around it.
async function transitionCore(
  action: LeaveAction,
  user: ActorUser,
  requestId: number,
  data: Record<string, unknown>,
): Promise<TransitionResult> {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
  })
  if (!request) return { error: 'This request does not exist.' }

  try {
    assertAllowedTransition(action, user, request)
  } catch (e) {
    return { error: (e as Error).message }
  }

  await prisma.leaveRequest.update({ where: { id: requestId }, data })
  return { ok: true }
}

export async function withdrawRequestCore(
  user: ActorUser,
  requestId: number,
): Promise<TransitionResult> {
  return transitionCore('withdraw', user, requestId, {
    status: 'WITHDRAWN',
    withdrawnAt: new Date(),
  })
}

export async function withdraw(
  _state: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?expired=1')
  const id = Number(formData.get('id'))

  const result = await withdrawRequestCore(user, id)
  if ('error' in result) return { message: result.error }

  revalidatePath('/employee')
  revalidatePath(`/requests/${id}`)
  redirect('/employee?done=withdrawn')
}

export async function signRequestCore(
  user: ActorUser,
  requestId: number,
  remark: string,
): Promise<TransitionResult> {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
  })
  if (!request) return { error: 'This request does not exist.' }
  try {
    assertAllowedTransition('sign', user, request)
  } catch (e) {
    return { error: (e as Error).message }
  }
  await prisma.leaveRequest.update({
    where: { id: requestId },
    data: {
      status: 'SIGNED',
      signedAt: new Date(),
      supervisorRemark: remark.trim() || null,
    },
  })
  return { ok: true }
}

export async function rejectBySupervisorCore(
  user: ActorUser,
  requestId: number,
  remark: string,
): Promise<TransitionResult> {
  // LR-6: the remark is mandatory for rejection — checked before any
  // write, exactly like the other checks.
  if (!remark.trim()) return { error: 'Write a remark when rejecting.' }
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
  })
  if (!request) return { error: 'This request does not exist.' }
  try {
    assertAllowedTransition('rejectSupervisor', user, request)
  } catch (e) {
    return { error: (e as Error).message }
  }
  await prisma.leaveRequest.update({
    where: { id: requestId },
    data: { status: 'REJECTED_SUPERVISOR', supervisorRemark: remark.trim() },
  })
  return { ok: true }
}

export async function sign(
  _state: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?expired=1')
  const id = Number(formData.get('id'))

  const result = await signRequestCore(user, id, String(formData.get('remark') ?? ''))
  if ('error' in result) return { message: result.error }

  revalidatePath('/supervisor')
  revalidatePath('/employee')
  revalidatePath(`/requests/${id}`)
  redirect(`/requests/${id}?done=signed`)
}

export async function rejectBySupervisor(
  _state: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?expired=1')
  const id = Number(formData.get('id'))

  const result = await rejectBySupervisorCore(
    user,
    id,
    String(formData.get('remark') ?? ''),
  )
  if ('error' in result) return { message: result.error }

  revalidatePath('/supervisor')
  revalidatePath('/employee')
  revalidatePath(`/requests/${id}`)
  redirect(`/requests/${id}?done=rejected`)
}

// LR-9 + interview Q4: two HR officers share one queue, so the first
// decision must win. Here the guarded updateMany (status must still be
// PENDING_HR) IS the LR-5 status check — a plain assertAllowedTransition
// up front would answer a late officer before the row is re-read, losing
// the "decided by X" wording. The table still supplies the target status;
// only the role is checked directly (LR-13: Admin is not HR, so it is
// refused here like any non-officer).
async function hrDecisionCore(
  action: 'approve' | 'rejectHr',
  user: ActorUser,
  requestId: number,
  remark: string,
): Promise<TransitionResult> {
  if (action === 'rejectHr' && !remark.trim()) {
    return { error: 'Write a remark when rejecting.' }
  }
  if (user.role !== 'HR') return { error: 'This action is not allowed for you.' }
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
  })
  if (!request) return { error: 'This request does not exist.' }

  const { count } = await prisma.leaveRequest.updateMany({
    where: { id: requestId, status: 'PENDING_HR' },
    data: {
      status: TRANSITIONS[action].to,
      hrOfficerId: user.id,
      decidedAt: new Date(),
      ...(action === 'rejectHr' ? { hrRemark: remark.trim() } : {}),
    },
  })
  if (count === 0) {
    const now = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
    })
    if (now?.hrOfficerId) {
      const officer = await prisma.user.findUnique({
        where: { id: now.hrOfficerId },
      })
      if (officer) {
        return {
          error: `This request has already been decided by ${officer.name} (${
            STATUSES[now.status as StatusCode] ?? now.status
          }).`,
        }
      }
    }
    return { error: 'This request has already been handled.' }
  }
  return { ok: true }
}

export async function approveRequestCore(
  user: ActorUser,
  requestId: number,
): Promise<TransitionResult> {
  return hrDecisionCore('approve', user, requestId, '')
}

export async function rejectByHrCore(
  user: ActorUser,
  requestId: number,
  remark: string,
): Promise<TransitionResult> {
  return hrDecisionCore('rejectHr', user, requestId, remark)
}

export async function approve(
  _state: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?expired=1')
  const id = Number(formData.get('id'))

  const result = await approveRequestCore(user, id)
  if ('error' in result) return { message: result.error }

  revalidatePath('/hr')
  revalidatePath('/employee')
  revalidatePath(`/requests/${id}`)
  redirect(`/requests/${id}?done=approved`)
}

export async function rejectByHr(
  _state: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?expired=1')
  const id = Number(formData.get('id'))

  const result = await rejectByHrCore(user, id, String(formData.get('remark') ?? ''))
  if ('error' in result) return { message: result.error }

  revalidatePath('/hr')
  revalidatePath('/employee')
  revalidatePath(`/requests/${id}`)
  redirect(`/requests/${id}?done=rejected`)
}

export async function sendToHrCore(
  user: ActorUser,
  requestId: number,
): Promise<TransitionResult> {
  return transitionCore('sendToHr', user, requestId, { status: 'PENDING_HR' })
}

export async function sendToHr(
  _state: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?expired=1')
  const id = Number(formData.get('id'))

  const result = await sendToHrCore(user, id)
  if ('error' in result) return { message: result.error }

  revalidatePath('/employee')
  revalidatePath('/hr')
  revalidatePath(`/requests/${id}`)
  redirect(`/requests/${id}?done=sent`)
}
