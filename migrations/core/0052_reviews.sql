-- Public reviews are separate from private service feedback. No manager hide or delete capability.
CREATE TABLE pm_reviews (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL UNIQUE, guest_id TEXT NOT NULL,
 visit_date TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
 comment TEXT NOT NULL, published_at TEXT NOT NULL, consent_at TEXT NOT NULL,
 historical INTEGER NOT NULL DEFAULT 0 CHECK(historical IN (0,1)),
 reply TEXT NOT NULL DEFAULT '', reply_at TEXT, reply_by TEXT, revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE pm_review_reports (
 id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES pm_reviews(id) ON DELETE CASCADE,
 category TEXT NOT NULL CHECK(category IN ('spam','personal-data','threat','other')),
 detail TEXT NOT NULL, at TEXT NOT NULL, outcome TEXT NOT NULL DEFAULT 'pending'
 CHECK(outcome IN ('pending','retained','escalated')), decided_at TEXT, decided_by TEXT,
 reason TEXT NOT NULL DEFAULT ''
);
CREATE TABLE pm_review_events (
 id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES pm_reviews(id) ON DELETE CASCADE,
 booking_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, at TEXT NOT NULL,
 before_data TEXT, after_data TEXT NOT NULL
);
CREATE INDEX pm_reviews_guest ON pm_reviews(guest_id);
CREATE INDEX pm_review_reports_review ON pm_review_reports(review_id);
CREATE INDEX pm_review_events_review ON pm_review_events(review_id);
-- A merge retains the visit's review identity; it never establishes fresh publication permission.
CREATE TRIGGER pm_reviews_booking_guest AFTER UPDATE ON pm_state BEGIN
 UPDATE pm_reviews SET guest_id=(SELECT json_extract(b.value,'$.guestId') FROM json_each(NEW.data,'$.bookings') b WHERE json_extract(b.value,'$.id')=pm_reviews.booking_id)
 WHERE EXISTS(SELECT 1 FROM json_each(NEW.data,'$.bookings') b WHERE json_extract(b.value,'$.id')=pm_reviews.booking_id AND json_extract(b.value,'$.guestId')!=pm_reviews.guest_id);
END;
