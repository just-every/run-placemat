export const publicInquiryLimits={
 replyTokenPerMinute:20,
 replyIpPerMinute:60,
 // Normal short conversations fit comfortably; maximum-size messages stop at 16 per inquiry.
 messagesPerInquiry:32,
 messageBytesPerInquiry:64*1024,
 // Active guest text plus its linear audit delta stays below the shared-row budget.
 activeMessageBytesPerVenue:512*1024,
 // D1 rows are limited to about 2 MiB; keep at least 512 KiB for close and reservation writes.
 stateBytes:1536*1024
}
