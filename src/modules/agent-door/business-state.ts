import type { PeopleAdapter } from './types.ts'

/** Only a positively readable, running Business can retain Business authority. */
export async function businessRunning(people: PeopleAdapter, business?: string): Promise<boolean> {
  try { return typeof people.businessStopped === 'function' && await people.businessStopped(business) === false }
  catch { return false }
}
