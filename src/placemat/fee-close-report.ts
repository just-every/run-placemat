/** Fee facts are evaluated inside the service-close INSERT, in the same D1 transaction. */
export type ClosedFees={recorded:true;currency:'usd';chargedCents:number;waivedCents:number;refundedCents:number;pendingCents:number;rows:{bookingId:string;assessmentId:string;policyId:string;status:string;amountCents:number;refundedCents:number}[]}
export type LegacyFees={recorded:false;note:string}
const refundedSql="COALESCE((SELECT c.imported_refunded_cents FROM pm_refund_charges c WHERE c.charge_id=f.charge_id),0)+(SELECT COALESCE(SUM(r.amount_cents),0) FROM pm_refunds r WHERE r.charge_id=f.charge_id AND r.status='succeeded')"
export const closedFeeSql=`json_object('recorded',json('true'),'currency','usd',
 'chargedCents',COALESCE(SUM(CASE WHEN f.status='succeeded' THEN f.amount_cents ELSE 0 END),0),
 'waivedCents',COALESCE(SUM(CASE WHEN f.status='waived' THEN f.amount_cents ELSE 0 END),0),
 'pendingCents',COALESCE(SUM(CASE WHEN f.status='pending' THEN f.amount_cents ELSE 0 END),0),
 'refundedCents',COALESCE(SUM(${refundedSql}),0),
 'rows',json(COALESCE(json_group_array(json_object('bookingId',f.booking_id,'assessmentId',f.id,'policyId',f.policy_id,'status',f.status,'amountCents',f.amount_cents,'refundedCents',${refundedSql})) FILTER(WHERE f.id IS NOT NULL),'[]')))`
export const feeSummary=(fees:ClosedFees|LegacyFees|null)=>!fees?'not recorded at close':!fees.recorded?fees.note:`Charged $${(fees.chargedCents/100).toFixed(2)} USD; waived $${(fees.waivedCents/100).toFixed(2)} USD; refunded $${(fees.refundedCents/100).toFixed(2)} USD; pending $${(fees.pendingCents/100).toFixed(2)} USD. Fixed at close; pending is not charged.`
export function bookingFees(fees:ClosedFees|LegacyFees|null,bookingId:string){
 if(!fees?.recorded)return null
 return fees.rows.filter(row=>row.bookingId===bookingId).reduce((n,row)=>({chargedCents:n.chargedCents+(row.status==='succeeded'?row.amountCents:0),waivedCents:n.waivedCents+(row.status==='waived'?row.amountCents:0),refundedCents:n.refundedCents+row.refundedCents,pendingCents:n.pendingCents+(row.status==='pending'?row.amountCents:0)}),{chargedCents:0,waivedCents:0,refundedCents:0,pendingCents:0})
}
