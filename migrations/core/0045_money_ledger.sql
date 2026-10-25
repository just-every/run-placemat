CREATE TABLE pm_money_items (
 source_id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('charge','refund')),
 charge_id TEXT NOT NULL,
 booking_id TEXT,
 amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents)='integer' AND amount_cents BETWEEN 1 AND 99999999),
 currency TEXT NOT NULL CHECK(currency='usd'),
 recorded_at TEXT NOT NULL
);
CREATE TABLE pm_money_receipts (event_id TEXT PRIMARY KEY,source_id TEXT NOT NULL,received_at TEXT NOT NULL);
CREATE TABLE pm_money_payouts (id TEXT PRIMARY KEY,amount_cents INTEGER NOT NULL,currency TEXT NOT NULL CHECK(currency='usd'),items TEXT NOT NULL CHECK(json_valid(items)),actor_id TEXT NOT NULL,recorded_at TEXT NOT NULL);
CREATE TABLE pm_money_adjustments (id TEXT PRIMARY KEY,payout_id TEXT NOT NULL,transaction_id TEXT NOT NULL,booking_id TEXT NOT NULL,actor_id TEXT NOT NULL,recorded_at TEXT NOT NULL,UNIQUE(payout_id,transaction_id));
CREATE TRIGGER pm_money_items_no_update BEFORE UPDATE ON pm_money_items BEGIN SELECT RAISE(ABORT,'Ledger is append only'); END;
CREATE TRIGGER pm_money_items_no_delete BEFORE DELETE ON pm_money_items BEGIN SELECT RAISE(ABORT,'Ledger is append only'); END;
CREATE TRIGGER pm_money_receipts_no_update BEFORE UPDATE ON pm_money_receipts BEGIN SELECT RAISE(ABORT,'Ledger is append only'); END;
CREATE TRIGGER pm_money_receipts_no_delete BEFORE DELETE ON pm_money_receipts BEGIN SELECT RAISE(ABORT,'Ledger is append only'); END;
CREATE TRIGGER pm_money_payouts_no_update BEFORE UPDATE ON pm_money_payouts BEGIN SELECT RAISE(ABORT,'Ledger is append only'); END;
CREATE TRIGGER pm_money_payouts_no_delete BEFORE DELETE ON pm_money_payouts BEGIN SELECT RAISE(ABORT,'Ledger is append only'); END;
CREATE TRIGGER pm_money_adjustments_no_update BEFORE UPDATE ON pm_money_adjustments BEGIN SELECT RAISE(ABORT,'Ledger is append only'); END;
CREATE TRIGGER pm_money_adjustments_no_delete BEFORE DELETE ON pm_money_adjustments BEGIN SELECT RAISE(ABORT,'Ledger is append only'); END;
