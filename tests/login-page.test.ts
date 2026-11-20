import { test, before } from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.APP_URL ?? 'http://localhost:3000'

async function getHtml(path: string): Promise<{ status: number; html: string }> {
  const res = await fetch(BASE + path, { redirect: 'manual' })
  return { status: res.status, html: await res.text() }
}

async function waitForServer(timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const res = await fetch(BASE + '/', { redirect: 'manual' })
      if (res.status < 500) return
    } catch {
      // server not listening yet
    }
    if (Date.now() > deadline) throw new Error('dev server did not start')
    await new Promise((r) => setTimeout(r, 1000))
  }
}

before(async () => {
  await waitForServer()
})

test('/login shows the email + password form from design §4', async () => {
  const { status, html } = await getHtml('/login')
  assert.equal(status, 200)
  assert.match(html, /type="email"/)
  assert.match(html, /type="password"/)
  assert.match(html, /name="email"/)
  assert.match(html, /name="password"/)
  assert.match(html, /Sign in/)
})

test('/login has no register or reset links (requirements §5)', async () => {
  const { html } = await getHtml('/login')
  assert.doesNotMatch(html, /register|sign up|forgot|reset/i)
})

test('/login shows the @budiman.com format hint', async () => {
  const { html } = await getHtml('/login')
  assert.match(html, /@budiman\.com/)
})
