-- =============================================================================
-- Vinay Bank general ledger: Oracle schema (Oracle Database 19c or later)
-- The same tables the API maps with TypeORM (apps/api/src/modules/ledger).
-- Amounts are in paise (NUMBER(19)), so there is no floating point anywhere.
-- =============================================================================

CREATE TABLE gl_accounts (
  code        VARCHAR2(10)  NOT NULL,
  name        VARCHAR2(80)  NOT NULL,
  type        VARCHAR2(10)  NOT NULL,
  CONSTRAINT pk_gl_accounts PRIMARY KEY (code),
  CONSTRAINT ck_gl_type CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'))
);

CREATE TABLE journal_entries (
  id          NUMBER(19)    GENERATED ALWAYS AS IDENTITY,
  source_id   VARCHAR2(24)  NOT NULL,          -- MongoDB transaction _id
  kind        VARCHAR2(10)  NOT NULL,
  reference   VARCHAR2(32)  NOT NULL,
  txn_type    VARCHAR2(30)  NOT NULL,
  rail        VARCHAR2(12)  NOT NULL,
  narration   VARCHAR2(200) NOT NULL,
  posted_at   TIMESTAMP     NOT NULL,
  CONSTRAINT pk_journal_entries PRIMARY KEY (id),
  -- Idempotency: one posting and at most one reversal per core transaction.
  CONSTRAINT uq_journal_source UNIQUE (source_id, kind),
  CONSTRAINT ck_journal_kind CHECK (kind IN ('POSTING', 'REVERSAL'))
);

CREATE INDEX ix_journal_posted_at ON journal_entries (posted_at);

CREATE TABLE journal_lines (
  id              NUMBER(19)   GENERATED ALWAYS AS IDENTITY,
  entry_id        NUMBER(19)   NOT NULL,
  gl_code         VARCHAR2(10) NOT NULL,
  account_number  VARCHAR2(20),               -- customer sub-ledger, NULL for bank GLs
  debit           NUMBER(19)   DEFAULT 0 NOT NULL,
  credit          NUMBER(19)   DEFAULT 0 NOT NULL,
  CONSTRAINT pk_journal_lines PRIMARY KEY (id),
  CONSTRAINT fk_line_entry FOREIGN KEY (entry_id) REFERENCES journal_entries (id) ON DELETE CASCADE,
  CONSTRAINT fk_line_gl FOREIGN KEY (gl_code) REFERENCES gl_accounts (code),
  -- A line is either a debit or a credit, never negative.
  CONSTRAINT ck_line_amounts CHECK (debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0))
);

CREATE INDEX ix_line_entry   ON journal_lines (entry_id);
CREATE INDEX ix_line_gl_code ON journal_lines (gl_code);
CREATE INDEX ix_line_account ON journal_lines (account_number);

COMMENT ON TABLE journal_entries IS 'Balanced accounting entries projected from core banking transactions';
COMMENT ON COLUMN journal_lines.debit IS 'Amount in paise';
COMMENT ON COLUMN journal_lines.credit IS 'Amount in paise';

-- Collection type used by ledger_pkg.post_entry to pass all lines in one call.
CREATE OR REPLACE TYPE ledger_line_t AS OBJECT (
  gl_code         VARCHAR2(10),
  account_number  VARCHAR2(20),
  debit           NUMBER(19),
  credit          NUMBER(19)
);
/

CREATE OR REPLACE TYPE ledger_line_tab AS TABLE OF ledger_line_t;
/
