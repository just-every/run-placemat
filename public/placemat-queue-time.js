// Venue-local input uses the same roundtrip checks as the booking screen.
export function queueLocalTime(value, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function queueTime(value, timezone) {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function queueToUtc(value, timezone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Enter a complete preferred date and time.');
  const wall = Date.parse(`${value}:00Z`), offsets = new Set();
  for (let hour = -48; hour <= 48; hour += 6) {
    const sample = wall + hour * 3600000;
    offsets.add(Date.parse(`${queueLocalTime(sample, timezone)}:00Z`) - sample);
  }
  const candidates = [...offsets].map(offset => wall - offset).filter(candidate => queueLocalTime(candidate, timezone) === value);
  if (candidates.length !== 1) throw new Error(candidates.length
    ? `That time repeats during a daylight-saving change in ${timezone}. Choose another time.`
    : `That local time does not exist in ${timezone}. Choose another time.`);
  return new Date(candidates[0]).toISOString();
}
