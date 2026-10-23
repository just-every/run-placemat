/** The existing handover door owns human delivery work, including provider acceptance without
 * mailbox confirmation. Stable task identity preserves completion across duplicate sends. */
export function refundNoticeFollowup(db:D1Database,noticeId:string){
 const booking="(SELECT r.booking_id FROM pm_refund_notices n JOIN pm_refunds r ON r.id=n.refund_id WHERE n.id=?)"
 const path="'$.bookings['||(SELECT b.key FROM json_each(pm_state.data,'$.bookings') b WHERE json_extract(b.value,'$.id')="+booking+")||'].handover'"
 return db.prepare(`UPDATE pm_state SET data=json_set(data,${path},json_insert(
  COALESCE((SELECT json_extract(b.value,'$.handover') FROM json_each(pm_state.data,'$.bookings') b WHERE json_extract(b.value,'$.id')=${booking}),'[]'),
  '$[#]',json((SELECT json_object('id','refund-notice-'||n.id,'kind','callback',
   'text','Sender '||COALESCE(o.display_name,n.requested_by)||': confirm the guest received the saved '||n.outcome||' refund outcome. Due now while mailbox delivery is unconfirmed, including provider acceptance or a bounce. Contact the guest directly if needed and record the human outcome here. Do not resend the refund notice.',
   'ownerId',n.requested_by,'dueAt',n.requested_at,
   'history',json_array(json_object('actor',n.requested_by,'at',n.requested_at,'action','assigned','ownerId',n.requested_by,'dueAt',n.requested_at)))
   FROM pm_refund_notices n LEFT JOIN oa_operators o ON o.id=n.requested_by WHERE n.id=?)))),version=version+1
  WHERE id=1 AND EXISTS(SELECT 1 FROM json_each(pm_state.data,'$.bookings') b
   WHERE json_extract(b.value,'$.id')=${booking}
   AND COALESCE(json_array_length(b.value,'$.handover'),0)<40
   AND NOT EXISTS(SELECT 1 FROM json_each(b.value,'$.handover') t WHERE json_extract(t.value,'$.id')='refund-notice-'||?))`)
  .bind(noticeId,noticeId,noticeId,noticeId,noticeId)
}
