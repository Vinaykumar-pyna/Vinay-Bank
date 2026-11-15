-- =============================================================================
-- ledger_pkg: posting rules enforced inside the database (PL/SQL)
-- The API checks balance too; doing it again here means no other client
-- (a batch job, a report tool, a careless script) can post an unbalanced entry.
-- =============================================================================

CREATE OR REPLACE PACKAGE ledger_pkg AS
  e_unbalanced   EXCEPTION;
  PRAGMA EXCEPTION_INIT(e_unbalanced, -20001);

  -- Posts one entry with all its lines atomically. Idempotent per (source_id, kind):
  -- a repeated call returns the id of the existing entry instead of posting twice.
  FUNCTION post_entry(
    p_source_id  IN journal_entries.source_id%TYPE,
    p_kind       IN journal_entries.kind%TYPE,
    p_reference  IN journal_entries.reference%TYPE,
    p_txn_type   IN journal_entries.txn_type%TYPE,
    p_rail       IN journal_entries.rail%TYPE,
    p_narration  IN journal_entries.narration%TYPE,
    p_posted_at  IN journal_entries.posted_at%TYPE,
    p_lines      IN ledger_line_tab
  ) RETURN journal_entries.id%TYPE;

  -- Customer sub-ledger balance in paise (credits minus debits).
  FUNCTION account_balance(p_account_number IN VARCHAR2) RETURN NUMBER;

  -- Raises if total debits differ from total credits across the whole ledger.
  PROCEDURE assert_ledger_balanced;
END ledger_pkg;
/

CREATE OR REPLACE PACKAGE BODY ledger_pkg AS

  FUNCTION post_entry(
    p_source_id  IN journal_entries.source_id%TYPE,
    p_kind       IN journal_entries.kind%TYPE,
    p_reference  IN journal_entries.reference%TYPE,
    p_txn_type   IN journal_entries.txn_type%TYPE,
    p_rail       IN journal_entries.rail%TYPE,
    p_narration  IN journal_entries.narration%TYPE,
    p_posted_at  IN journal_entries.posted_at%TYPE,
    p_lines      IN ledger_line_tab
  ) RETURN journal_entries.id%TYPE IS
    v_debit   NUMBER := 0;
    v_credit  NUMBER := 0;
    v_id      journal_entries.id%TYPE;
  BEGIN
    IF p_lines IS NULL OR p_lines.COUNT < 2 THEN
      RAISE_APPLICATION_ERROR(-20001, 'An entry needs at least two lines');
    END IF;

    FOR i IN 1 .. p_lines.COUNT LOOP
      v_debit  := v_debit  + NVL(p_lines(i).debit, 0);
      v_credit := v_credit + NVL(p_lines(i).credit, 0);
    END LOOP;

    IF v_debit <> v_credit OR v_debit = 0 THEN
      RAISE_APPLICATION_ERROR(-20001,
        'Unbalanced entry ' || p_reference || ': debits ' || v_debit || ', credits ' || v_credit);
    END IF;

    INSERT INTO journal_entries (source_id, kind, reference, txn_type, rail, narration, posted_at)
    VALUES (p_source_id, p_kind, p_reference, p_txn_type, p_rail, p_narration, p_posted_at)
    RETURNING id INTO v_id;

    -- Set-based insert of every line from the collection.
    INSERT INTO journal_lines (entry_id, gl_code, account_number, debit, credit)
    SELECT v_id, l.gl_code, l.account_number, NVL(l.debit, 0), NVL(l.credit, 0)
      FROM TABLE(p_lines) l;

    RETURN v_id;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
      -- Already posted (a retry): return the existing entry.
      SELECT id INTO v_id
        FROM journal_entries
       WHERE source_id = p_source_id AND kind = p_kind;
      RETURN v_id;
  END post_entry;

  FUNCTION account_balance(p_account_number IN VARCHAR2) RETURN NUMBER IS
    v_balance NUMBER;
  BEGIN
    SELECT NVL(SUM(credit) - SUM(debit), 0)
      INTO v_balance
      FROM journal_lines
     WHERE account_number = p_account_number;
    RETURN v_balance;
  END account_balance;

  PROCEDURE assert_ledger_balanced IS
    v_difference NUMBER;
  BEGIN
    SELECT NVL(SUM(debit) - SUM(credit), 0) INTO v_difference FROM journal_lines;
    IF v_difference <> 0 THEN
      RAISE_APPLICATION_ERROR(-20002, 'Ledger out of balance by ' || v_difference || ' paise');
    END IF;
  END assert_ledger_balanced;

END ledger_pkg;
/

-- Example call (SQL*Plus / SQL Developer):
-- DECLARE
--   v_id NUMBER;
-- BEGIN
--   v_id := ledger_pkg.post_entry(
--     '6735a1f0c2b3a4d5e6f70812', 'POSTING', 'AB2611140001', 'CASH_DEPOSIT', 'CASH',
--     'Cash deposit at Mumbai Fort', SYSTIMESTAMP,
--     ledger_line_tab(
--       ledger_line_t('1001', NULL, 1000000, 0),
--       ledger_line_t('2001', '000210000014', 0, 1000000)));
--   DBMS_OUTPUT.PUT_LINE('Posted entry ' || v_id);
-- END;
-- /
