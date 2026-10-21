export const restaurant={name:'Cedar & Salt',legalName:'Cedar & Salt Hospitality LLC',address:'125 Pacific Avenue, Los Angeles, CA 90291',phone:'(310) 555-0142',email:'reservations@cedar.example.test',website:'https://cedar.example.test',currency:'USD',timezone:'America/Los_Angeles',version:0,acknowledge:true}
export const logo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8n8AAAAASUVORK5CYII='
export async function floor72(h){for(let i=0;i<12;i++)await h.command('table.save',{label:`Dining ${i+1}`,seats:6,x:15+(i%4)*20,y:15+Math.floor(i/4)*25})}
export function nextService(){const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10);return {name:'Friday dinner',startAt:day+'T17:00',endAt:day+'T22:00',turnMinutes:90,coverLimit:72}}
