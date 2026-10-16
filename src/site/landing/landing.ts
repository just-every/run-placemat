// The approved Placemat homepage, as the run site serves it at `/`: its main
// action, Run Placemat, opens the Run page at /run.
import { closing, included } from './closing'
import { featureSections } from './features'
import { hero } from './hero'

export const landingMeta = {
  title: 'Placemat — restaurant table bookings',
  description: 'Guests book online, walk-ins and the waitlist share one floor, and every visit stays yours. Free and open source.',
}

export const landingBody = (docs: boolean) => `<main class="landing">${hero(docs)}${featureSections()}${included()}${closing(docs)}</main>`
