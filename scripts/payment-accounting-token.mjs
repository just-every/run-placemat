// Run through _od08-env; credentials are consumed only from the injected environment.
// Usage: _od08-env node scripts/payment-accounting-token.mjs --output /private/path/token.json
import { open, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

// Set PLACEMAT_ENV_INGEST to the fleet command before exchanging a refresh token.
const ingest = process.env.PLACEMAT_ENV_INGEST
const tokenString = value => typeof value === 'string' && value.length > 0 && !/[\r\n\0]/.test(value)
let output, handle, scratch, complete = false
try {
  const args = process.argv.slice(2)
  if (!ingest) throw new Error('ingest_configuration')
  if (args.length !== 2 || args[0] !== '--output' || !args[1]) throw new Error('arguments')
  const { QBO_CLIENT_ID: clientId, QBO_CLIENT_SECRET: clientSecret, QBO_REFRESH_TOKEN: refreshToken, QBO_REALM_ID: realmId } = process.env
  if (![clientId, clientSecret, refreshToken].every(tokenString) || !/^\d+$/.test(realmId ?? '')) throw new Error('configuration')
  output = resolve(args[1])
  // Refuse existing files and symlinks. Establish private output before rotating a token.
  handle = await open(output, 'wx', 0o600)
  const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error('exchange')
  const data = await response.json()
  // Save a rotated refresh token before any other processing or access-token output.
  if (!tokenString(data.refresh_token)) throw new Error('refresh_token')
  if (data.refresh_token !== refreshToken) {
    // Ingest accepts NAME=value lines. OAuth refresh tokens must not introduce quoting or whitespace.
    if (!/^[A-Za-z0-9._~+\/-]+=*$/.test(data.refresh_token)) throw new Error('refresh_token_format')
    scratch = await mkdtemp(join(tmpdir(), 'placemat-qbo-'))
    const input = join(scratch, 'refresh.env')
    await writeFile(input, `QBO_REFRESH_TOKEN=${data.refresh_token}\n`, { mode: 0o600, flag: 'wx' })
    const saved = spawnSync('python3', ['-I', ingest, input], { stdio: 'ignore', timeout: 20_000 })
    if (saved.status !== 0 || saved.error) throw new Error('refresh_storage')
    await rm(scratch, { recursive: true, force: true })
    scratch = undefined
  }
  if (!tokenString(data.access_token) || typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer') throw new Error('access_token')
  await handle.writeFile(JSON.stringify({ QBO_ACCESS_TOKEN: data.access_token, QBO_REALM_ID: realmId }) + '\n')
  await handle.sync()
  complete = true
} catch {
  process.exitCode = 1
} finally {
  if (handle) await handle.close().catch(() => {})
  if (handle && !complete) await rm(output, { force: true }).catch(() => {})
  // On an ingest failure keep the mode-0600 rotated refresh token for recovery.
  console.log(complete ? 'true' : 'false')
}
