DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT *
    FROM (
      VALUES
        ('public', 'other_income', 'Members view other income'),
        ('public', 'other_income', 'Managers insert other income'),
        ('public', 'other_income', 'Managers update other income'),
        ('public', 'other_income', 'Managers delete other income'),
        ('storage', 'objects', 'Members read other income receipts'),
        ('storage', 'objects', 'Managers upload other income receipts'),
        ('storage', 'objects', 'Managers update other income receipts'),
        ('storage', 'objects', 'Managers delete other income receipts')
    ) AS policies(schema_name, table_name, policy_name)
  LOOP
    IF to_regclass(format('%I.%I', policy_row.schema_name, policy_row.table_name)) IS NOT NULL THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I.%I',
        policy_row.policy_name,
        policy_row.schema_name,
        policy_row.table_name
      );
    END IF;
  END LOOP;
END $$;
