import type {State} from './model'
import type {ServiceChange} from './service-changes'
export function portableServiceChanges(changes?:ServiceChange[]):ServiceChange[]
export function validateServiceDecisions(state:State):void
