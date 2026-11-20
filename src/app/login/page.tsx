'use client'

// Login form per docs/specs/02-design.md §4 + Visual design (reference
// src/image/login.webp): two-panel card, pill inputs, green pill button.
// Deliberately no register / reset / social controls (requirements §5).
// All checking happens server-side (src/app/login/actions.ts) — this file
// is appearance plus the show/hide password affordance.
import { useActionState, useState } from 'react'
import { login, type LoginFormState } from './actions'

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState<
    LoginFormState | undefined,
    FormData
  >(login, undefined)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eef0ee] px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-[18%] top-[14%] h-16 w-16 rounded-full bg-white/60" />
        <div className="absolute right-[32%] top-[9%] h-20 w-20 rounded-full bg-white/50" />
        <div className="absolute right-[24%] top-[15%] h-28 w-28 rounded-full bg-white/60" />
        <div className="absolute -left-28 -top-28 h-80 w-80 rounded-[45%] bg-white/40" />
        <div className="absolute -bottom-40 -left-24 h-96 w-[70%] rounded-[45%] bg-white/50" />
        <div className="absolute -right-32 -bottom-44 h-96 w-[60%] rounded-[45%] bg-white/40" />
      </div>

      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-3xl border border-[#dfe3df] bg-[#fafbfa] shadow-[0_24px_60px_-24px_rgba(31,41,55,0.25)] md:grid-cols-[45%_55%]">
        {/* Decorative brand panel (no image assets, pure CSS) */}
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-white to-[#f0f2f0] p-8 md:flex">
          <div className="flex items-center gap-2.5">
            <span className="h-6 w-6 rounded-full bg-[#23a55a]" />
            <span className="text-lg font-semibold text-[#1f2937]">
              Budiman HRMS
            </span>
          </div>
          <div aria-hidden className="relative mx-auto mb-2 h-44 w-60">
            <div className="absolute bottom-6 left-6 h-20 w-20 -rotate-6 rounded-2xl bg-[#23a55a]/80" />
            <div className="absolute bottom-8 left-[7.5rem] h-24 w-24 rotate-3 rounded-2xl border border-[#dfe3df] bg-white" />
            <div className="absolute bottom-4 right-6 h-24 w-16 rotate-6 rounded-2xl bg-[#23a55a]/25" />
            <div className="absolute bottom-16 right-[9.5rem] h-8 w-8 rounded-full border border-[#dfe3df] bg-white" />
          </div>
        </div>

        {/* Form panel */}
        <div className="p-8 sm:p-12">
          <h1 className="text-2xl font-medium text-[#1f2937]">Login</h1>
          <p className="mt-2 text-sm text-[#6b7280]">
            Sign in with your @budiman.com work email
          </p>

          <form action={formAction} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-[#1f2937]"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-full border border-[#dfe3df] bg-white px-5 py-2.5 text-sm text-[#1f2937] focus:border-[#23a55a] focus:outline-none focus:ring-2 focus:ring-[#23a55a]/20"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-[#1f2937]"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="w-full rounded-full border border-[#dfe3df] bg-white px-5 py-2.5 pr-12 text-sm text-[#1f2937] focus:border-[#23a55a] focus:outline-none focus:ring-2 focus:ring-[#23a55a]/20"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-[#1f2937]"
                >
                  {showPassword ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      className="h-5 w-5"
                    >
                      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                      <circle cx="12" cy="12" r="2.5" />
                      <path d="m4 20 16-16" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      className="h-5 w-5"
                    >
                      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                      <circle cx="12" cy="12" r="2.5" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {state?.message && (
              <p role="alert" className="text-sm text-red-600">
                {state.message}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-full bg-[#23a55a] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1c8b4b] disabled:opacity-50"
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
