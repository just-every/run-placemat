/** QuickBooks sandbox transport only. The caller owns durable attempts and journal mapping. */
export type AccountingProviderResult = {
  state: 'accepted' | 'rejected' | 'unconfirmed'
  providerId: string | null
  code: string
  traceId: string | null
}

type AccountingEnvironment = { QBO_ACCESS_TOKEN?: string; QBO_REALM_ID?: string }
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export async function postAccountingJournal(
  env: AccountingEnvironment,
  requestId: string,
  journal: unknown,
): Promise<AccountingProviderResult> {
  const result = (state: AccountingProviderResult['state'], code: string, traceId: string | null = null,
    providerId: string | null = null): AccountingProviderResult => ({ state, providerId, code, traceId })
  if (!env.QBO_ACCESS_TOKEN?.trim() || !/^\d+$/.test(env.QBO_REALM_ID ?? '')) {
    return result('rejected', 'not_configured')
  }
  // Intuit request IDs are limited to 50 characters. Never substitute a new ID on replay.
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(requestId)) return result('rejected', 'invalid_request_id')
  let body: string | undefined
  try { body = JSON.stringify(journal) } catch { return result('rejected', 'invalid_journal') }
  if (!body || !record(journal)) return result('rejected', 'invalid_journal')
  let traceId: string | null = null
  try {
    const response = await fetch(
      `https://sandbox-quickbooks.api.intuit.com/v3/company/${env.QBO_REALM_ID}/journalentry?requestid=${encodeURIComponent(requestId)}`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${env.QBO_ACCESS_TOKEN}`, accept: 'application/json', 'content-type': 'application/json' },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      },
    )
    const trace = response.headers.get('intuit_tid')
    traceId = trace && /^[a-zA-Z0-9_-]{1,128}$/.test(trace) ? trace : null
    const data: unknown = await response.json().catch(() => null)
    if (record(data) && Object.hasOwn(data, 'Fault')) {
      const fault = data.Fault
      const errors = record(fault) && Array.isArray(fault.Error) ? fault.Error : []
      const code = record(errors[0]) ? errors[0].code : null
      return result('rejected', typeof code === 'string' && /^\d{1,10}$/.test(code) ? code : 'provider_fault', traceId)
    }
    if (!response.ok) {
      return result(response.status >= 400 && response.status < 500 ? 'rejected' : 'unconfirmed', String(response.status), traceId)
    }
    const entry = record(data) ? data.JournalEntry : null
    if (!record(entry) || typeof entry.Id !== 'string' || !/^\d{1,50}$/.test(entry.Id)) {
      return result('unconfirmed', 'invalid_response', traceId)
    }
    return result('accepted', 'accepted', traceId, entry.Id)
  } catch {
    // The provider may have committed the journal before the connection failed.
    return result('unconfirmed', 'transport_error', traceId)
  }
}
