import { withDemo } from '../../src/modules/demo/index.mjs'
import worker from './worker'
import { seedDemo } from '../../src/demo'
export default withDemo(worker, { seed: seedDemo })
