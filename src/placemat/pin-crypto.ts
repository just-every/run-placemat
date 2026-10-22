/** Worker-only PIN credentials. The pepper must never be stored with the digest. */
export const PIN_ITERATIONS = 100000

export type PinPepperConfig = {
  currentVersion: string
  peppers: Readonly<Record<string, string | undefined>>
}

export type PinDigest = {
  salt: string
  digest: string
  pepperVersion: string
  iterations: number
}

export type PinVerification = {valid: false} | {valid: true; upgrade?: PinDigest}

export class PinCryptoUnavailableError extends Error {
  constructor() {
    super('PIN security configuration is unavailable. Use a full personal session.')
    this.name = 'PinCryptoUnavailableError'
  }
}

export class PinPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PinPolicyError'
  }
}

// Common keypad paths and grouped choices that are not caught by repetition or
// ascending/descending runs. Repeating any of these also remains disallowed.
const commonPins = new Set([
  '112233', '123321', '111222', '123654', '123789', '147258', '258369',
  '159753', '789456', '456123', '741852', '852963', '100000', '200000',
  '123000', '123111', '112211', '102030', '010203', '121314', '696969',
  '8675309', '12345678', '87654321', '12344321', '11223344', '10203040',
])
const encoder = new TextEncoder()
const pinShape = (pin: unknown): pin is string => typeof pin === 'string' && /^[0-9]{6,12}$/.test(pin)

function predictable(pin: string): boolean {
  if (commonPins.has(pin)) return true
  // Include wrapped runs (789012), repeated digits and repeated groups (482482).
  if (['0123456789012345678901', '9876543210987654321098'].some(run => run.includes(pin))) return true
  for (let period = 1; period <= pin.length / 2; period++) {
    if (pin.length % period === 0 && pin.slice(0, period).repeat(pin.length / period) === pin) return true
  }
  for (const common of commonPins) {
    if (pin.length > common.length && pin.length % common.length === 0 && common.repeat(pin.length / common.length) === pin) return true
  }
  return false
}

export function assertPinAllowed(pin: unknown): asserts pin is string {
  if (!pinShape(pin)) throw new PinPolicyError('Choose a personal PIN of 6–12 digits.')
  if (predictable(pin)) throw new PinPolicyError('Choose a PIN without common, repeated or sequential patterns.')
}

function pepperFor(config: PinPepperConfig, version: string): string {
  if (!config || typeof version !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(version)
    || !config.peppers || !Object.hasOwn(config.peppers, version)) throw new PinCryptoUnavailableError()
  const pepper = config.peppers[version]
  if (typeof pepper !== 'string' || !pepper.trim()) throw new PinCryptoUnavailableError()
  return pepper
}

function currentPepper(config: PinPepperConfig): string {
  return pepperFor(config, config?.currentVersion)
}

const hex = (bytes: Uint8Array) => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
const unhex = (value: string) => Uint8Array.from(value.match(/../g)!, byte => parseInt(byte, 16))

async function derive(pin: string, pepper: string, salt: string, iterations: number): Promise<string> {
  const pepperKey = await crypto.subtle.importKey('raw', encoder.encode(pepper), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign'])
  const keyedPin = await crypto.subtle.sign('HMAC', pepperKey, encoder.encode(pin))
  const key = await crypto.subtle.importKey('raw', keyedPin, 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations}, key, 256)
  return hex(new Uint8Array(bits))
}

async function createDigest(pin: string, config: PinPepperConfig, pepper: string): Promise<PinDigest> {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
  return {salt, digest: await derive(pin, pepper, salt, PIN_ITERATIONS), pepperVersion: config.currentVersion, iterations: PIN_ITERATIONS}
}

export async function hashPin(pin: unknown, config: PinPepperConfig): Promise<PinDigest> {
  const pepper = currentPepper(config)
  assertPinAllowed(pin)
  return createDigest(pin, config, pepper)
}

/** No legacy unpeppered path: absent/retired secrets require a full-session reset. */
export async function verifyPin(pin: unknown, stored: PinDigest, config: PinPepperConfig): Promise<PinVerification> {
  const activePepper = currentPepper(config)
  if (!pinShape(pin) || !stored || !/^[a-f0-9]{32}$/.test(stored.salt)
    || !/^[a-f0-9]{64}$/.test(stored.digest) || !Number.isInteger(stored.iterations)
    || stored.iterations < 1 || stored.iterations > PIN_ITERATIONS) return {valid: false}
  const pepper = pepperFor(config, stored.pepperVersion)
  const candidate = await derive(pin, pepper, stored.salt, stored.iterations)
  let difference = 0
  // Both digests have fixed length; never stop at the first unequal character.
  for (let i = 0; i < 64; i++) difference |= candidate.charCodeAt(i) ^ stored.digest.charCodeAt(i)
  if (difference !== 0) return {valid: false}
  if (stored.pepperVersion !== config.currentVersion || stored.iterations !== PIN_ITERATIONS) {
    return {valid: true, upgrade: await createDigest(pin, config, activePepper)}
  }
  return {valid: true}
}
