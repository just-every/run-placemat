import {fail,type State,type Booking} from './model'
import type {ExperienceAddOn,ExperienceDietaryChoice} from './experiences'
import type {ExperienceCommitment} from './experience-fit'

export type ExperienceCartItem={id:string;name:string;quantity:number;unitAmountCents:0;totalCents:0}
export type ExperienceCartChoice={guestNumber:number;choiceId:string;choiceName:string}
export type ExperienceCart={items:ExperienceCartItem[];dietaryChoices:ExperienceCartChoice[];ticketQuantity:number;totalCents:0;currency:'USD';source:'guest-supplied'}
type CartExperience=ExperienceCommitment&{addOns?:ExperienceAddOn[];dietaryChoices?:ExperienceDietaryChoice[]}
type CartBooking=Booking&{experienceCart?:ExperienceCart}
type CartHold=NonNullable<State['holds']>[number]&{experienceCart?:ExperienceCart}
type CartState=Omit<State,'bookings'|'holds'>&{bookings:CartBooking[];holds?:CartHold[]}
type CartAllocation={serviceId:string;partySize:number;experience?:CartExperience;experienceCart?:ExperienceCart}
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const integer=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
function fields(value:unknown,keys:string[],message:string):Record<string,unknown>{
 if(!record(value)||Object.keys(value).some(key=>!keys.includes(key)))fail(400,message)
 return value as Record<string,unknown>
}
const stockKey=(experienceId:string,serviceId:string,itemId:string)=>JSON.stringify([experienceId,serviceId,itemId])
function liveAllocations(s:CartState):CartAllocation[]{
 const now=new Date().toISOString()
 return [...s.bookings.filter(row=>['booked','seated','completed'].includes(row.status)),...(s.holds??[]).filter(row=>row.expiresAt>now)]
}
function totals(s:CartState){
 const counts=new Map<string,number>()
 for(const row of liveAllocations(s))for(const item of row.experienceCart?.items??[]){
  if(!row.experience)fail(409,'An ordinary reservation cannot hold experience add-ons.')
  const key=stockKey(row.experience!.id,row.serviceId,item.id)
  counts.set(key,(counts.get(key)??0)+item.quantity)
 }
 return counts
}
function availableLimit(s:CartState,experienceId:string,itemId:string){
 const definition=s.experiences?.find(row=>row.id===experienceId)?.addOns?.find(row=>row.id===itemId)
 return definition?.quantityLimit??fail(409,'Retain add-on definitions while their quantities remain allocated.')
}
/** Caller excludes the booking or hold being replaced; all other channels retain their stock. */
export function normalizeExperienceCart(s:CartState,serviceId:string,experience:CartExperience|undefined,partySize:number,payload:unknown):ExperienceCart|undefined{
 const input=record(payload)?payload.experienceCart:undefined
 if(!experience){if(input!==undefined)fail(400,'Choose an experience before selecting add-ons or dietary choices.');return undefined}
 if(experience.kind!=='free'||experience.amountCents!==0)fail(409,'Paid experience checkout is not enabled. No money or reservation was taken.')
 if(!integer(partySize,1,500)||!experience.serviceIds.includes(serviceId))fail(400,'Choose a valid experience service and ticket quantity.')
 const cart:Record<string,unknown>=input===undefined?{}:fields(input,['items','dietaryChoices'],'Supply only add-on quantities and per-guest dietary choices.')
 const itemInputs=cart.items===undefined?[]:cart.items,choiceInputs=cart.dietaryChoices===undefined?[]:cart.dietaryChoices
 if(!Array.isArray(itemInputs)||itemInputs.length>50||!Array.isArray(choiceInputs)||choiceInputs.length>partySize)fail(400,'Choose listed add-ons and at most one dietary choice per guest.')
 const counts=totals(s),seenItems=new Set<string>(),seenGuests=new Set<number>()
 const items:ExperienceCartItem[]=[]
 for(const value of itemInputs){
  const row=fields(value,['id','quantity'],'Add-on selections accept an ID and integer quantity only.')
  const definition=(experience.addOns??[]).find(item=>item.id===row.id)
  if(!definition||seenItems.has(definition.id)||!integer(row.quantity,0,500))fail(400,'Choose each listed add-on once with an integer quantity from 0 to 500.')
  seenItems.add(definition!.id)
  if(definition!.unitAmountCents!==0)fail(409,'Paid add-on checkout is not enabled.')
  if(row.quantity===0)continue
  const limit=availableLimit(s,experience.id,definition!.id),used=counts.get(stockKey(experience.id,serviceId,definition!.id))??0
  if(used+(row.quantity as number)>limit)fail(409,'A selected experience add-on is sold out for this date. Refresh availability and choose again.')
  items.push({id:definition!.id,name:definition!.name,quantity:row.quantity as number,unitAmountCents:0,totalCents:0})
 }
 const dietaryChoices:ExperienceCartChoice[]=choiceInputs.map(value=>{
  const row=fields(value,['guestNumber','choiceId'],'Dietary selections accept a guest number and listed choice ID only.')
  const definition=(experience.dietaryChoices??[]).find(choice=>choice.id===row.choiceId)
  if(!definition||!integer(row.guestNumber,1,partySize)||seenGuests.has(row.guestNumber as number))fail(400,'Choose at most one listed dietary choice for each guest number.')
  seenGuests.add(row.guestNumber as number)
  return {guestNumber:row.guestNumber as number,choiceId:definition!.id,choiceName:definition!.name}
 })
 items.sort((a,b)=>a.id.localeCompare(b.id));dietaryChoices.sort((a,b)=>a.guestNumber-b.guestNumber)
 return {items,dietaryChoices,ticketQuantity:partySize,totalCents:0,currency:'USD',source:'guest-supplied'}
}
function assertShape(row:CartAllocation){
 const cart=row.experienceCart
 if(cart===undefined)return
 if(!row.experience||row.experience.kind!=='free'||row.experience.amountCents!==0||!record(cart)||!integer(cart.ticketQuantity,1,500)||cart.ticketQuantity!==row.partySize||cart.totalCents!==0||cart.currency!=='USD'||cart.source!=='guest-supplied'||!Array.isArray(cart.items)||cart.items.length>50||!Array.isArray(cart.dietaryChoices)||cart.dietaryChoices.length>row.partySize)fail(409,'Preserve the experience cart and its ticket quantity.')
 if(Object.keys(cart).some(key=>!['items','dietaryChoices','ticketQuantity','totalCents','currency','source'].includes(key)))fail(409,'Experience carts contain only declared option quantities.')
 const seenItems=new Set<string>(),seenGuests=new Set<number>()
 for(const item of cart.items){
  const definition=(row.experience!.addOns??[]).find(option=>option.id===item?.id)
  if(!record(item)||Object.keys(item).some(key=>!['id','name','quantity','unitAmountCents','totalCents'].includes(key))||!definition||definition.name!==item.name||definition.unitAmountCents!==0||seenItems.has(item.id)||!integer(item.quantity,1,500)||item.unitAmountCents!==0||item.totalCents!==0)fail(409,'Preserve the original experience add-on names, quantities and zero-charge terms.')
  seenItems.add(item.id)
 }
 for(const choice of cart.dietaryChoices){
  const definition=(row.experience!.dietaryChoices??[]).find(option=>option.id===choice?.choiceId)
  if(!record(choice)||Object.keys(choice).some(key=>!['guestNumber','choiceId','choiceName'].includes(key))||!definition||definition.name!==choice.choiceName||!integer(choice.guestNumber,1,row.partySize)||seenGuests.has(choice.guestNumber))fail(409,'Preserve each listed per-guest dietary choice.')
  seenGuests.add(choice.guestNumber)
 }
}
/** Store-level guard. Owner erasure separately clears choices in its fenced transaction. */
export function assertExperienceCarts(previous:CartState,next:CartState){
 for(const before of previous.bookings)if(before.experienceCart!==undefined){
  const after=next.bookings.find(row=>row.id===before.id)
  if(!after||!same(before.experienceCart,after.experienceCart))fail(409,'A saved experience cart cannot be replaced or edited.')
 }
 for(const row of next.bookings)assertShape(row)
 for(const hold of next.holds??[])if(hold.expiresAt>new Date().toISOString())assertShape(hold)
 const counts=totals(next)
 for(const [key,quantity] of counts){
  const [experienceId,,itemId]=JSON.parse(key) as string[]
  if(quantity>availableLimit(next,experienceId,itemId))fail(409,'The experience add-on limit cannot exclude existing bookings or live checkout holds.')
 }
}
