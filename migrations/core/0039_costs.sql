-- Owner-entered planning and billing evidence; never a provider invoice feed.
CREATE TABLE pm_cost_previews (id TEXT PRIMARY KEY, month TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE pm_cost_budgets (month TEXT PRIMARY KEY, amount_cents INTEGER NOT NULL CHECK(amount_cents>=0), actor_id TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE pm_cost_invoices (id TEXT PRIMARY KEY, preview_id TEXT NOT NULL REFERENCES pm_cost_previews(id), reference TEXT NOT NULL UNIQUE, actor_id TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);
