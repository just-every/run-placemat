type MoneyRow=Record<string,any>
export type SettlementView={
 id:string;source:string;amount:number;fee:number;net:number;currency:'usd'
 signedFact:{sourceId:string;kind:'charge'|'refund';chargeId:string;bookingId:string|null;amountCents:number;currency:'usd';recordedAt:string}|null
 differenceCents:number|null;bookingId:string|null;adjustmentId:string|null
}
export type PayoutView={
 id:string;amountCents:number;currency:'usd';actorId:string;recordedAt:string;items:SettlementView[]
 grossCents:number;feeCents:number;netCents:number;unmatched:string[];discrepancies:string[];unverified:string[]
}
export function moneySettlements(facts:MoneyRow[],payouts:MoneyRow[],adjustments:MoneyRow[],bookingIds:string[]):PayoutView[]
