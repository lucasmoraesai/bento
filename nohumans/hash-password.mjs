#!/usr/bin/env node
// Turns a password into the value of DEPLOY_GATE_PASSWORD_HASH (`s2:<salt>:<hex>`).
//
//   node nohumans/hash-password.mjs
//
// It reads the password from STDIN, never from argv: an argument would land in
// shell history and in `ps` output. Paste the printed hash into the Vercel
// dashboard (Settings → Environment Variables), or pipe it straight into
// `vercel env update`. The plaintext never goes into the repo.
import { randomBytes, scryptSync } from 'node:crypto'
import { createInterface } from 'node:readline'

const MAX_PASSWORD_LENGTH = 256 // kept in sync with middleware.ts
const SCRYPT = { N: 16384, r: 8, p: 1 }

const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: process.stdin.isTTY })
const ask = (q) =>
  new Promise((resolve) => {
    if (process.stdin.isTTY) rl.question(q, resolve)
    else {
      let data = ''
      process.stdin.on('data', (c) => (data += c))
      process.stdin.on('end', () => resolve(data.replace(/\r?\n$/, '')))
    }
  })

const password = await ask('Senha: ')
rl.close()
if (!password) {
  console.error('✗ senha vazia')
  process.exit(1)
}
if (password.length > MAX_PASSWORD_LENGTH) {
  console.error(`✗ senha acima de ${MAX_PASSWORD_LENGTH} caracteres`)
  process.exit(1)
}
const salt = randomBytes(16).toString('hex')
const hash = scryptSync(password, salt, 32, SCRYPT).toString('hex')
process.stdout.write(`s2:${salt}:${hash}\n`)
