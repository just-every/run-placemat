import {service,publicGuest} from './harness.mjs'
export async function guestReviewFixture(h){
 const {service:s}=await service(h)
 const csv='guest_id,name,email,phone,notes,visit_date,party_size,visit_status\nreview-a,Álex Rivera,alex.one@example.test,+1 (415) 555-0123,Quiet table,2026-08-10,2,completed\nreview-b,Alex Rivera,alex.two@example.test,+1 415 555 0123,<script>conflicting note</script>,2026-08-11,4,completed\nreview-c,Taylor Rivera,unrelated@example.test,+1 650 555 0123,,2026-08-12,2,completed\n'
 const dry=(await h.api('/api/import/dry-run',{csv})).result
 await h.api('/api/import/apply',{csv,confirm:dry.fingerprint})
 const a=(await h.api('/api/guests?search=alex.one')).guests[0],b=(await h.api('/api/guests?search=alex.two')).guests[0]
 const booking=(await h.api('/api/public/book',publicGuest(s,0,{name:a.name,email:a.email,phone:a.phone}),{as:'',status:201})).result
 const join=async(extra)=>(await h.api('/api/public/queue/join',{...publicGuest(s,0),...extra},{as:'',status:201}))
 const first=await join({name:b.name,email:b.email,phone:b.phone,contactConsent:false})
 const family=await join({name:'Morgan Rivera',email:'morgan.family@example.test',phone:'1 415 555 0123',contactConsent:true})
 const guest=(await h.api('/api/guests?search=morgan.family')).guests[0]
 return {s,a,b,booking,first,family,guest}
}
