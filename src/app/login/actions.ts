'use server'

// Design §2 rule 4: one login action. The checking itself lives in
// src/lib/auth.ts (authenticateUser) so it can be tested without a browser.
import { authenticateUser } from '@/lib/auth'
import { createSession, destroySession } from '@/lib/session'
import { ROLE_HOME } from '@/lib/roles'
import { redirect } from 'next/navigation'

export type LoginFormState = { message?: string }

export async function login(
  _state: LoginFormState | undefined,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const result = await authenticateUser(email, password)

  if ('error' in result) {
    // Three fixed wordings only — never a hint about which half was wrong.
    if (result.error === 'format') {
      return { message: 'Email must be a @budiman.com work email' }
    }
    if (result.error === 'locked') {
      return { message: 'Too many wrong attempts. Try again later.' }
    }
    return { message: 'Email or password is incorrect' }
  }

  await createSession(result.user.id, result.user.role)
  redirect(ROLE_HOME[result.user.role]) // typed Role — the browser never picks this
}

// Design §2 rule 7 (U5, AC-05): logging out clears the cookie server-side,
// so pressing Back afterwards hits the server with nothing to show.
export async function logout(): Promise<void> {
  await destroySession()
  redirect('/login')
}
