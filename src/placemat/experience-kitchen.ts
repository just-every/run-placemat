import type {Booking} from './model'
/** One authorized booking projection for the sheet and identity-free kitchen view. */
export function experienceOrder(booking:Booking){
 if(!booking.experience||!booking.experienceCart)return undefined
 return {name:booking.experience.name,tickets:booking.experienceCart.ticketQuantity,items:booking.experienceCart.items.map(item=>({name:item.name,quantity:item.quantity})),dietaryChoices:booking.experienceCart.dietaryChoices.map(choice=>({guestNumber:choice.guestNumber,name:choice.choiceName})),source:'guest-supplied' as const}
}
export function experienceTotals(bookings:Booking[]){
 const items=new Map<string,{experience:string;name:string;quantity:number}>(),choices=new Map<string,{experience:string;name:string;quantity:number}>()
 for(const booking of bookings){
  const order=experienceOrder(booking);if(!order)continue
  for(const item of booking.experienceCart!.items){const key=booking.experience!.id+':'+item.id,row=items.get(key)??{experience:order.name,name:item.name,quantity:0};row.quantity+=item.quantity;items.set(key,row)}
  for(const choice of booking.experienceCart!.dietaryChoices){const key=booking.experience!.id+':'+choice.choiceId,row=choices.get(key)??{experience:order.name,name:choice.choiceName,quantity:0};row.quantity++;choices.set(key,row)}
 }
 return {items:[...items.values()],dietaryChoices:[...choices.values()],source:'guest-supplied' as const}
}
export function experienceOrderLines(order:ReturnType<typeof experienceOrder>):string[]{
 if(!order)return []
 return [`Experience: ${order.name} | ${order.tickets} tickets | guest-supplied`,...order.items.map(item=>`Included add-on: ${item.name} | ${item.quantity} | guest-supplied`),...order.dietaryChoices.map(choice=>`Unverified dietary choice: Guest ${choice.guestNumber} | ${choice.name} | guest-supplied. No allergy-safe preparation is confirmed.`)]
}
