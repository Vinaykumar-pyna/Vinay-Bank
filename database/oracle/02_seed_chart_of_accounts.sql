-- Chart of accounts. MERGE makes the script safe to run repeatedly (an upsert).
MERGE INTO gl_accounts t
USING (
  SELECT '1001' AS code, 'Cash in branch vaults' AS name, 'ASSET' AS type FROM dual UNION ALL
  SELECT '1101', 'Settlement with RBI (NEFT, RTGS, IMPS)', 'ASSET' FROM dual UNION ALL
  SELECT '1201', 'Card network settlement (ATM, POS)', 'ASSET' FROM dual UNION ALL
  SELECT '2001', 'Customer deposits: savings', 'LIABILITY' FROM dual UNION ALL
  SELECT '2002', 'Customer deposits: current', 'LIABILITY' FROM dual UNION ALL
  SELECT '2301', 'GST payable on charges', 'LIABILITY' FROM dual UNION ALL
  SELECT '4001', 'Fee and commission income', 'INCOME' FROM dual UNION ALL
  SELECT '5001', 'Interest paid on deposits', 'EXPENSE' FROM dual
) s
ON (t.code = s.code)
WHEN MATCHED THEN UPDATE SET t.name = s.name, t.type = s.type
WHEN NOT MATCHED THEN INSERT (code, name, type) VALUES (s.code, s.name, s.type);

COMMIT;
