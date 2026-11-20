import { test } from 'node:test'
import assert from 'node:assert/strict'
import { login } from '../src/app/login/actions'

function form(email: string, password: string): FormData {
  const f = new FormData()
  f.set('email', email)
  f.set('password', password)
  return f
}

test('AC-06: wrong password and unknown email give the identical generic wording', async () => {
  const wrong = await login(undefined, form('employee-1@budiman.com', 'wrongpass'))
  const unknown = await login(undefined, form('nobody@budiman.com', 'password123'))
  assert.equal(wrong.message, 'Email or password is incorrect')
  assert.equal(unknown.message, 'Email or password is incorrect')
  assert.equal(wrong.message, unknown.message)
})

test('AC-07: a non-Budiman email gets the format wording', async () => {
  const res = await login(undefined, form('someone@gmail.com', 'password123'))
  assert.match(res.message ?? '', /@budiman\.com/)
})
