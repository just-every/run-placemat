// The approved Placemat homepage, as the run site serves it at `/`: day one,
// then one Friday service at Fern & Fig from 3:05 PM to 11 PM, the light
// shifting from afternoon gold to night. Run Placemat opens /run.
import { serviceAgent } from './agent'
import { theBook } from './book'
import { close } from './close'
import { closing } from './closing'
import { confirmed } from './confirmations'
import { hero } from './hero'
import { hostStand } from './host-stand'
import { kitchenPace } from './kitchen'
import { moveIn } from './move-in'
import { theNoShow } from './no-show'
import { preShift } from './preshift'

export const landingMeta = {
  title: 'Placemat — Every table, filled.',
  description: 'Placemat takes reservations from your site, Google and Instagram, runs the host stand and waitlist, and remembers every guest. 100% free, open source alternative to OpenTable, Resy and SevenRooms.',
}

export const landingBody = (docs: boolean) => `<main class="landing">${hero(docs)}${moveIn()}${theBook()}${confirmed()}${preShift()}${hostStand()}${serviceAgent()}${theNoShow()}${kitchenPace()}${close()}${closing(docs)}</main>`
