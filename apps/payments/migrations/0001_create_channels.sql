-- Streaming Payment Channels
-- D1 index for queryable channel metadata

-- Channels table - indexes all active payment channels
CREATE TABLE IF NOT EXISTS channels (
    channel_id TEXT PRIMARY KEY,
    payer TEXT NOT NULL,
    payee TEXT NOT NULL,
    token TEXT NOT NULL,
    escrow_contract TEXT NOT NULL,
    chain_id INTEGER NOT NULL,
    deposit TEXT NOT NULL,
    settled TEXT DEFAULT '0',
    created_at TEXT NOT NULL,
    last_settlement_at TEXT,
    finalized_at TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_channels_payer ON channels(payer);
CREATE INDEX IF NOT EXISTS idx_channels_payee ON channels(payee);
CREATE INDEX IF NOT EXISTS idx_channels_created_at ON channels(created_at);

-- Settlements table - audit log of all settlements
CREATE TABLE IF NOT EXISTS settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    amount TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    settled_at TEXT NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES channels(channel_id)
);

CREATE INDEX IF NOT EXISTS idx_settlements_channel ON settlements(channel_id);
CREATE INDEX IF NOT EXISTS idx_settlements_date ON settlements(settled_at);

-- Vouchers table - optional: track voucher history for analytics
CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    cumulative_amount TEXT NOT NULL,
    delta TEXT NOT NULL,
    received_at TEXT NOT NULL,
    request_path TEXT,
    FOREIGN KEY (channel_id) REFERENCES channels(channel_id)
);

CREATE INDEX IF NOT EXISTS idx_vouchers_channel ON vouchers(channel_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(received_at);
