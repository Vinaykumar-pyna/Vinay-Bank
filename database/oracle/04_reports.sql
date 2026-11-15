-- =============================================================================
-- Accounting reports (Oracle SQL): aggregation, ROLLUP, analytic functions
-- =============================================================================

-- 1. Trial balance by GL account, with a grand total row (ROLLUP).
--    Debits must equal credits on the total row.
CREATE OR REPLACE VIEW v_trial_balance AS
SELECT
  CASE WHEN GROUPING(g.code) = 1 THEN 'TOTAL' ELSE g.code END AS gl_code,
  CASE WHEN GROUPING(g.code) = 1 THEN NULL ELSE MAX(g.name) END AS gl_name,
  SUM(l.debit)  / 100 AS debit_rupees,
  SUM(l.credit) / 100 AS credit_rupees,
  (SUM(l.debit) - SUM(l.credit)) / 100 AS balance_rupees
FROM journal_lines l
JOIN gl_accounts g ON g.code = l.gl_code
GROUP BY ROLLUP (g.code);

-- 2. Customer statement from the ledger, with a running balance
--    (analytic SUM over a window ordered by posting time).
SELECT
  e.posted_at,
  e.reference,
  e.narration,
  l.debit / 100  AS debit_rupees,
  l.credit / 100 AS credit_rupees,
  SUM(l.credit - l.debit) OVER (
    PARTITION BY l.account_number
    ORDER BY e.posted_at, l.id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) / 100 AS running_balance_rupees
FROM journal_lines l
JOIN journal_entries e ON e.id = l.entry_id
WHERE l.account_number = :account_number
ORDER BY e.posted_at, l.id;

-- 3. Daily volume per payment rail for the last 30 days.
SELECT
  TRUNC(e.posted_at) AS business_day,
  e.rail,
  COUNT(DISTINCT e.id)    AS entries,
  SUM(l.debit) / 100      AS volume_rupees
FROM journal_entries e
JOIN journal_lines l ON l.entry_id = e.id
WHERE e.posted_at >= TRUNC(SYSDATE) - 30
  AND e.kind = 'POSTING'
GROUP BY TRUNC(e.posted_at), e.rail
ORDER BY business_day DESC, volume_rupees DESC;

-- 4. Top 10 customer accounts by turnover this month (RANK, FETCH FIRST).
SELECT *
FROM (
  SELECT
    l.account_number,
    SUM(l.debit + l.credit) / 100 AS turnover_rupees,
    RANK() OVER (ORDER BY SUM(l.debit + l.credit) DESC) AS turnover_rank
  FROM journal_lines l
  JOIN journal_entries e ON e.id = l.entry_id
  WHERE l.account_number IS NOT NULL
    AND e.posted_at >= TRUNC(SYSDATE, 'MM')
  GROUP BY l.account_number
)
WHERE turnover_rank <= 10
ORDER BY turnover_rank;

-- 5. Entries that do not balance (must return no rows; the package prevents them).
SELECT e.id, e.reference, SUM(l.debit) AS debits, SUM(l.credit) AS credits
FROM journal_entries e
JOIN journal_lines l ON l.entry_id = e.id
GROUP BY e.id, e.reference
HAVING SUM(l.debit) <> SUM(l.credit);

-- 6. Reversals and the entries they cancel (self-join on the source transaction).
SELECT o.reference, o.posted_at AS posted, r.posted_at AS reversed, o.txn_type, o.rail
FROM journal_entries o
JOIN journal_entries r ON r.source_id = o.source_id AND r.kind = 'REVERSAL'
WHERE o.kind = 'POSTING'
ORDER BY r.posted_at DESC;
