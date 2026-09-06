-- R1 · POST-execution verification (READ ONLY) — §21/§24/§25/§27/§32
SELECT jsonb_build_object(
  'captured_at', now(),
  'batch', jsonb_build_object(
    'repair_batch_id', 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW',
    'movements', (SELECT count(*) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'distinct_ref_docs', (SELECT count(DISTINCT reference_doc) FROM stock_movements WHERE reference_doc LIKE 'B10B-OBS2-RECON-OPENING:%'),
    'family_rows', (SELECT count(*) FROM stock_movements WHERE reference_doc LIKE 'B10B-OBS2-RECON-OPENING:%'),
    'units', (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'value_exact', (SELECT COALESCE(SUM(quantity_change * unit_cost),0) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'kardex_rows', (SELECT count(*) FROM kardex_entries WHERE reference_description = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'kardex_value_2dp', (SELECT COALESCE(SUM(total_value),0) FROM kardex_entries WHERE reference_description = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'business_events', (SELECT count(*) FROM business_events WHERE payload->>'store_id' = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND payload->>'type' = 'initial'),
    'movement_types', (SELECT jsonb_agg(DISTINCT movement_type) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'min_created', (SELECT min(created_at) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'max_created', (SELECT max(created_at) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'created_by_distinct', (SELECT jsonb_agg(DISTINCT created_by) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'audit_rows', (SELECT count(*) FROM audit_logs WHERE action = 'STOCK_RECONCILIATION_OPENING' AND COALESCE(metadata->>'batch_id', new_data->>'batch_id') = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'audit_row', (SELECT to_jsonb(a) FROM audit_logs a WHERE action = 'STOCK_RECONCILIATION_OPENING' AND COALESCE(metadata->>'batch_id', new_data->>'batch_id') = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW')
  ),
  'per_product', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', v.pid,
      'inventory_qty', i.quantity,
      'inventory_version', i.version,
      'stock_current', p.stock_current,
      'cost_average', p.cost_average,
      'has_movements', p.has_movements,
      'movements_sum', m.s, 'movements_n', m.c,
      'kardex_n', k.c
    ) ORDER BY v.pid), '[]'::jsonb)
    FROM (VALUES
      ('e47421ea-f9aa-452b-b20b-4601ec12410f'),('da1c4090-3e10-4120-a2bc-24da53cffe16'),('c4870c06-9332-4db2-b060-70d1fa8ea90c'),('7d0751af-9fa4-4876-84b7-a28520f299d7'),('69824282-4994-4615-aaf2-896466f9e781'),('0e9d781a-4eed-42ef-baa2-09b3ea1d990c'),('e65916ea-9ca2-4e25-a78f-6be15b46a912'),('08c9acfd-e10d-44f2-b25f-870d632dbe18'),('5dd7ff57-9c62-4431-baba-229f9cf62acf'),('2a822efb-97fb-4235-b154-f983d1f840b5'),('64551ca6-5488-42e7-a230-428502fc2476'),('69e4f894-9bdc-4401-ad07-102da972b11b'),('60e81773-46ed-4995-8af1-771f85a97fa7'),('bc972d77-5e59-46f5-84a3-9249e1637f17'),('dd469f07-d038-458c-95c6-4e8cc1aac693'),('9da60d14-0a0e-4070-83ca-f3ea689bff25'),('194cfc6d-3752-4d2a-94c7-8cb29427cffc'),('5585361e-3eec-4d7d-a9f1-6c748d875a6a'),('01301a54-816a-4e32-9bd4-0d126d2f91c4'),('4af0518f-ff97-4129-b44c-10d62e5e0c68'),('bb1b6fd0-9a8e-4f3a-9623-17e9f9b5e73c'),('43370837-f188-401d-a90f-4cc7e2118ae9'),('3f108b20-f5d6-4604-930e-35c863331f5e'),('8d4c7a66-0b5c-4768-966c-b0ffb8ac3fb2'),('d097619e-6801-4f31-bee9-a76287af7530'),('45f4a79c-e449-4053-a293-60961773d734'),('3b68e6e7-303e-46e8-9a4a-0bd1d9a1b597'),('2a59f5e1-9dc8-440e-9746-26ae2fb30331'),('6e7331fa-ef32-4d29-928a-7d84922e3a66'),('0c2fcc6c-289f-4324-b55f-b5fd11a62002'),('af42b21f-217e-4ead-a65d-c69397c13cc6'),('b3e54ebe-ac35-4a11-b69b-3f0c8147fda1'),('017b2f62-0244-4bb0-8d88-82945aaa3726'),('2babc6c7-6b18-4d51-a59a-e9d5fc15cc6e'),('207b1d1e-9b8c-43e4-b6b4-9f4bd977b18a'),('6ac93fb5-0ca3-4dd1-8cff-8980658b3caf'),('ce3b523f-f616-489b-afa6-91c80e84cd8d'),('470847a9-f708-46bb-97c1-57bca13d635c'),('2b2f28e3-e2f4-4d58-840c-4e4af5d651d1'),('d640bf18-da13-4ef5-8754-d1226fadf660'),('5288a38f-85a0-4f2c-9edc-b745c03ef90c'),('f13436c1-85a7-430a-889b-a30f5208de85'),('4b15ea41-c8e3-4585-8c72-183133727b33'),('8d81d8dc-80ab-4456-833b-1901c986c827'),('55f7eb2b-8e95-475d-9375-b3b9390f5500'),('b06c20ed-cd3d-4c6b-b775-959a83b0887b'),('0f0f9cc8-1d72-4cab-973c-8dd35164fe79'),('d96b0781-88b3-4992-85c6-4187307de294'),('ac868bd7-20bb-4af5-bd63-e1eee73fb80c'),('0d95ec26-3421-4fbb-9551-8e864e7f516d'),('0ce83da7-afca-4ea8-bdff-2196b66fc1b8'),('85a6c248-21b4-46c0-b8f5-8eab4b966b02'),('2d706d15-6a07-4aa0-ba16-90f9dc1ffc3c'),('d6c8fb13-7d8d-44a8-8656-cfb6423a385e'),('6a64f76b-3f72-4d2f-a90c-67d3cc096adc'),('402c85ed-1067-418b-932f-5b6ead480975'),('bc4498c8-8208-4142-a418-acf3759bb48b'),('14fcc881-07b0-4d0b-a9d6-98f153a763ce'),('892b2bb1-518a-4198-bcc5-9145a8652641'),('52a00c8f-e313-45d5-89e5-c341aa8c9b01'),('5c57135f-b7a9-4953-93d9-d7718ab178ba'),('868d3a72-2805-4fff-b933-07540e053cdd'),('8b626748-d51b-407e-b2ef-ce9b51cca089'),('70ad936d-524b-49f7-9a7b-5b1f204c59c8'),('2999d90d-9d23-490b-8663-b75f818b7c32'),('2dbfb550-4caf-4325-9ba5-8cca6f812017'),('3006ba3e-ca21-4d15-92ab-c7a1a94171a1'),('c8b1ce8a-1ae2-44e5-a51e-53ad46b47f67'),('e533e794-cf92-4420-ac6b-f5caee2e0b88'),('26fdac16-4d7a-4e17-8864-c9cc690206ab'),('f648c3f8-0c60-4559-b76b-95bc02d9a816'),('1a571786-83ec-44e2-aed2-48b5dbe79f25'),('df97049c-0d66-4850-afc7-a964af2f52e7'),('de015bd9-ff44-48fc-bfd7-f37adf29b66e'),('983e5726-a068-44b0-98b8-fef76ac481f1'),('99885245-d370-46ea-99d9-176180574f77'),('7a73a85b-8a66-48d9-a7c3-7f9c91301ade'),('e1c23a92-e7b5-4b6a-8d8f-ee91aa053c81'),('8d00b701-caee-45b7-9f2f-3469e72baca5'),('435fb1f5-8089-4610-87d6-df60a7d7d95d'),('e05066d4-f1a4-44fe-98f4-b068afc571c7'),('c24ad180-6d3f-4dfd-9625-d569b396951b'),('32ac0c01-83af-47b3-8dfe-0b07c9810106'),('7f77f10d-f30f-4de3-888f-4888e1d63b33'),('6de05641-c590-4527-81b1-f220b6f9969e'),('fc605995-ed45-4e93-a774-27e0fa858e71'),('f5c8fd29-73e1-4b34-b2e3-7647437baf67'),('887141dc-e091-4406-aba7-95435fdd3ded'),('63f0eeea-3d37-4f9e-b76f-0174551e7dab'),('20113ad5-0460-4fa7-8521-52a5f16bc708'),('5d6de612-3f04-4a6f-9769-4102809eca79'),('54f03982-4f3e-42b5-a399-f5331833538c'),('670a4628-00d7-467d-bfc7-11f73a155bb1'),('5d7b5973-abab-4769-af06-78993d0a39b9'),('f9fa0dbc-9fdc-49b0-8d43-58e5df1c8fbe'),('0a1bce2e-6fbd-4cc3-9f90-91c3cc90aae6'),('53a5555e-9788-4cd8-a068-00f17a95ed60'),('721b1217-1812-449d-9c92-bb89b080f7f6')
    ) AS v(pid)
    LEFT JOIN inventory i ON i.product_id = v.pid::uuid AND i.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
    LEFT JOIN products p ON p.id = v.pid::uuid
    LEFT JOIN LATERAL (SELECT COALESCE(SUM(quantity_change),0) AS s, count(*) AS c FROM stock_movements sm WHERE sm.product_id = v.pid::uuid AND sm.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') m ON true
    LEFT JOIN LATERAL (SELECT count(*) AS c FROM kardex_entries k WHERE k.product_id = v.pid::uuid AND k.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') k ON true
  ),
  'store_totals', jsonb_build_object(
    'inventory_rows', (SELECT count(*) FROM inventory WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'movements_rows', (SELECT count(*) FROM stock_movements WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'kardex_rows', (SELECT count(*) FROM kardex_entries WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'transactions_rows', (SELECT count(*) FROM transactions WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'products_stock_sum', (SELECT COALESCE(SUM(stock_current),0) FROM products WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'products_cost_sum', (SELECT COALESCE(SUM(cost_average),0) FROM products WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'wac_log_rows', (SELECT count(*) FROM wac_change_log WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'audit_logs_rows', (SELECT count(*) FROM audit_logs WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'audit_update_product_new', (SELECT count(*) FROM audit_logs WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND action = 'UPDATE_PRODUCT' AND created_at > '2026-09-06T20:26:00+00:00')
  ),
  'isolation', jsonb_build_object(
    'inventory_other', (SELECT count(*) FROM inventory WHERE store_id <> 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'movements_other', (SELECT count(*) FROM stock_movements WHERE store_id <> 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'kardex_other', (SELECT count(*) FROM kardex_entries WHERE store_id <> 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'inventory_other_sum', (SELECT COALESCE(SUM(quantity),0) FROM inventory WHERE store_id <> 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')
  ),
  'financial', jsonb_build_object(
    'payments_all', (SELECT count(*) FROM payment_transactions),
    'transactions_all', (SELECT count(*) FROM transactions),
    'transaction_items_all', (SELECT count(*) FROM transaction_items),
    'commissions_all', (SELECT count(*) FROM commission_payments),
    'receipts_store', (SELECT count(*) FROM receipts WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'devolutions_store', (SELECT count(*) FROM devolutions WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'devolution_items_all', (SELECT count(*) FROM devolution_items),
    'transfers_all', (SELECT count(*) FROM transfers)
  ),
  'test_residue', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', id, 'sku', sku, 'stock_current', stock_current,
      'inventory_rows', (SELECT count(*) FROM inventory WHERE product_id = id),
      'movement_rows', (SELECT count(*) FROM stock_movements WHERE product_id = id)) ORDER BY id), '[]'::jsonb)
    FROM products WHERE id IN (
      '5bf782be-70c8-4870-9514-46bc2ae9db69','530e198c-0d42-4b36-852e-ba86f4431d94',
      'aa5e148b-df42-4349-a131-867767352669','94e53fd4-75ae-4924-a1b1-1b3d13f90df8',
      '185f1c6f-e58a-4231-b39a-3a52f2c7ef22','7049d300-7e08-42f0-b081-d373a331d88c',
      '7dbff68e-3ad1-479b-b228-f81021699ed4','b7bd618c-38b4-475c-b775-dc81b233a825',
      'e9541bb4-97c2-4f1d-9cb2-836c38beefd7','8f4e2708-540c-477b-bef7-9aed96771a8f')
  )
) AS post_verification;
