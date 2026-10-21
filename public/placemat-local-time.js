// Venue-local entry resolves the same gaps and repeated hours as service schedules.
const offsetLabel = ms => `${ms < 0 ? '-' : '+'}${String(Math.floor(Math.abs(ms) / 3600000)).padStart(2, '0')}:${String(Math.floor(Math.abs(ms) / 60000) % 60).padStart(2, '0')}`;

export function localTime(value, timezone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function resolveLocalTime(value, timezone, choice) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Enter a complete valid local date and time.');
  const naive = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0, 16) !== value) throw new Error('Enter a complete valid local date and time.');
  // Validate the zone before calculating offsets, including when the input is a gap.
  new Intl.DateTimeFormat('en', {timeZone: timezone});
  const offsetsByDate = new Map();
  const candidates = local => {
    const date = local.slice(0, 10), wall = Date.parse(`${local}:00Z`);
    let offsets = offsetsByDate.get(date);
    if (!offsets) {
      const center = Date.parse(`${date}T12:00:00Z`), found = new Set();
      for (let hour = -36; hour <= 36; hour += 6) {
        const sample = center + hour * 3600000;
        found.add(Date.parse(`${localTime(sample, timezone)}:00Z`) - sample);
      }
      offsets = [...found]; offsetsByDate.set(date, offsets);
    }
    return offsets.map(offset => ({at: wall - offset, offset})).filter(candidate => localTime(candidate.at, timezone) === local);
  };
  const matches = candidates(value), dateAndTime = value.replace('T', ' ');
  if (!matches.length) {
    let next = naive, nextLocal, nextMatches;
    do {
      next += 60000; nextLocal = new Date(next).toISOString().slice(0, 16); nextMatches = candidates(nextLocal);
    } while (!nextMatches.length);
    throw new Error(`${dateAndTime} does not exist in ${timezone}. The next valid local time is ${nextLocal.replace('T', ' ')} (${offsetLabel(nextMatches[0].offset)}). Choose that time or another valid local time.`);
  }
  if (matches.length > 1 && !choice) throw new Error(`${dateAndTime} occurs twice in ${timezone}. Choose an explicit offset: ${matches.map(candidate => offsetLabel(candidate.offset)).join(' or ')}.`);
  const selected = choice ? matches.find(candidate => offsetLabel(candidate.offset) === (choice === 'Z' ? '+00:00' : choice)) : matches[0];
  if (!selected) throw new Error(`${choice} is not a valid offset for ${dateAndTime} in ${timezone}.`);
  return {at: new Date(selected.at).toISOString(), offset: offsetLabel(selected.offset)};
}

export const toUtc = (value, timezone, choice) => resolveLocalTime(value, timezone, choice).at;
