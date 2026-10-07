import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = readFileSync(new URL('./retell-query-adapter.js', import.meta.url), 'utf8');
const codeNode = new Function('$input', source);
const run = bodies => codeNode({ all: () => bodies.map(body => ({ json: { body, headers: { authorization: 'synthetic-secret' } } })) });
const sqlRequest = sql => ({ name: 'db_query', args: { sql }, call: { call_id: 'call_synthetic' } });
const legacy = [
  "SELECT p.name, p.storage_gb, p.color, (i.stock_qty - i.reserved_qty - i.transfer_qty) AS available FROM products p JOIN inventories i ON i.product_id = p.id JOIN stores s ON s.id = i.store_id WHERE s.name = 'KT플라자 동성로점' AND p.name ILIKE '%Galaxy S26%' AND p.storage_gb = 512 AND p.color ILIKE '%실버%' ;",
  "SELECT SUM(i.stock_qty - i.reserved_qty - i.transfer_qty) AS other_store_available FROM products p JOIN inventories i ON i.product_id = p.id JOIN stores s ON s.id = i.store_id WHERE s.name <> 'KT플라자 동성로점' AND p.name = 'Galaxy S26 Ultra' AND p.storage_gb = 512 AND p.color = '티타늄 실버'",
  "SELECT p.name, p.maker, p.storage_gb, p.color, p.price, COALESCE(i.stock_qty - i.reserved_qty - i.transfer_qty, 0) AS available_qty FROM products p JOIN inventories i ON i.product_id = p.id JOIN stores s ON s.id = i.store_id WHERE s.name = 'KT플라자 동성로점' AND p.name ILIKE '%Galaxy S26%' AND p.storage_gb = 512 AND p.color ILIKE '%실버%'",
  "SELECT i.id AS customer_id, c.name AS customer_name, c.membership_grade, (SELECT count(*) FROM consultations s WHERE s.customer_id = i.id) AS consultation_count, (SELECT string_agg(r.purpose, ', ' ORDER BY r.started_at DESC) FROM (SELECT purpose, started_at FROM consultations WHERE customer_id = i.id ORDER BY started_at DESC LIMIT 3) r) AS recent_purposes FROM (SELECT 'customer_0013' AS id) i LEFT JOIN customers c ON c.id = i.id",
];
// These complete read-only shapes were rejected during the 2026-10-07 13:12 live inventory inquiry.
const inventoryOptions = [
  "SELECT p.id, p.name, p.storage_gb, p.color, (i.stock_qty - i.reserved_qty - i.transfer_qty) AS available_qty FROM stores s JOIN inventories i ON i.store_id = s.id JOIN products p ON p.id = i.product_id WHERE s.name = 'KT플라자 동성로점' AND p.name ILIKE '%Galaxy S26 Ultra%' AND p.color ILIKE '%실버%'",
  "SELECT p.name, p.storage_gb, p.color, i.stock_qty, i.reserved_qty, i.transfer_qty FROM stores s JOIN inventories i ON i.store_id = s.id JOIN products p ON p.id = i.product_id WHERE s.name = 'KT플라자 동성로점' AND p.name ILIKE '%Galaxy S26 Ultra%' AND p.color ILIKE '%실버%'",
  "SELECT p.name, p.storage_gb, p.color, i.stock_qty, i.reserved_qty, i.transfer_qty FROM inventories i JOIN products p ON i.product_id = p.id WHERE i.store_id = (SELECT id FROM stores WHERE name = 'KT플라자 동성로점') AND p.name ILIKE '%Galaxy S26 Ultra%' AND p.color ILIKE '%실버%'",
];

test('four observed legacy shapes become fixed SQL and separate values without mutating their bodies', () => {
  const bodies = legacy.map(sqlRequest), before = structuredClone(bodies);
  const results = run(bodies);
  assert.deepEqual(results.map(result => result.json.lookup), ['local_inventory', 'other_store_inventory', 'local_inventory_details', 'customer_briefing']);
  results.forEach((result, index) => {
    assert.equal(result.json.valid, true);
    assert.deepEqual(result.json.errors, []);
    assert.strictEqual(result.json.body, bodies[index]);
    assert.deepEqual(result.pairedItem, { item: index });
    assert.notEqual(result.json.query, legacy[index]);
    assert.match(result.json.query, /\$1/);
    assert.ok(!('headers' in result.json));
  });
  assert.deepEqual(results[0].json.params, ['KT플라자 동성로점', '%Galaxy S26%', 512, '%실버%']);
  assert.deepEqual(results[1].json.params, ['KT플라자 동성로점', 'Galaxy S26 Ultra', 512, '티타늄 실버']);
  assert.deepEqual(results[2].json.params, results[0].json.params);
  assert.deepEqual(results[3].json.params, ['customer_0013']);
  assert.deepEqual(bodies, before);
});

test('whitespace outside strings and terminal semicolon variations preserve exact literal values', () => {
  for (const original of legacy) {
    const multiline = original.replace(/ FROM /g, '\n FROM\t').replace(/ JOIN /g, '\n JOIN\t');
    assert.equal(run([sqlRequest(multiline)])[0].json.valid, true);
    assert.equal(run([sqlRequest(original.replace(/\s*;$/, '') + '; \n')])[0].json.valid, true);
  }
  const spaced = legacy[0].replace("'KT플라자 동성로점'", "'KT플라자  동성로점'");
  assert.equal(run([sqlRequest(spaced)])[0].json.params[0], 'KT플라자  동성로점');
});

test('escaped quotes decode only into bound parameters, including SQL-looking literal text', () => {
  const escaped = legacy[0].replace("'KT플라자 동성로점'", "'O''Brien; DROP TABLE products' ");
  const result = run([sqlRequest(escaped)])[0].json;
  assert.equal(result.valid, true);
  assert.equal(result.params[0], "O'Brien; DROP TABLE products");
  assert.ok(!result.query.includes('DROP'));
  assert.ok(!result.query.includes("O'Brien"));
});

test('extra SQL statements, comments, functions, union and unknown shapes all reject before DB', () => {
  const attacks = [
    legacy[0] + ' DROP TABLE products;',
    legacy[0].replace(/\s*;$/, '') + '; DROP TABLE products;',
    legacy[0].replace(/\s*;$/, '') + ';SELECT 1',
    legacy[0].replace(/\s*;$/, '') + ' UNION SELECT 1, 2, 3, 4',
    legacy[0] + '-- comment',
    legacy[0].replace('FROM products', '/*comment*/ FROM products'),
    legacy[0].replace('p.storage_gb = 512', 'p.storage_gb = pg_sleep(5)'),
    legacy[0].replace('p.name,', 'pg_sleep(5),'),
    legacy[0].replace('products p', 'customers p'),
    legacy[0].replace("s.name = 'KT플라자 동성로점'", "s.name = 'x' OR true"),
    legacy[0].replace('p.storage_gb = 512', 'p.storage_gb = 512::integer'),
    legacy[3].replace('LIMIT 3', 'LIMIT 1000'),
    'SELECT * FROM products',
    "SELECT pg_sleep(5)",
    "INSERT INTO products(name) VALUES ('synthetic')",
    legacy[0].replace("'%실버%'", "'%실버%"),
  ];
  for (const sql of attacks) {
    const result = run([sqlRequest(sql)])[0].json;
    assert.equal(result.valid, false, sql);
    assert.equal(result.query, null);
    assert.deepEqual(result.params, []);
    assert.deepEqual(result.errors, ['UNSUPPORTED_SQL_SHAPE']);
  }
});

test('structured inventory lookups validate values and keep wildcard-looking names literal', () => {
  const args = { lookup: 'local_inventory', store_name: "O'Brien", product_name: 'Galaxy_100%\\Special', storage_gb: 512, color: '실버' };
  const local = run([{ name: 'db_query', args }])[0].json;
  assert.equal(local.valid, true);
  assert.deepEqual(local.params, ["O'Brien", '%Galaxy\\_100\\%\\\\Special%', 512, '%실버%']);
  const other = run([{ name: 'db_query', args: { ...args, lookup: 'other_store_inventory' } }])[0].json;
  assert.equal(other.valid, true);
  assert.equal(other.params[1], args.product_name);
  assert.match(other.query, /s\.name <> \$1/);
});

test('only typed permitted structured arguments are accepted', () => {
  const args = { lookup: 'local_inventory', store_name: 'synthetic store', product_name: 'synthetic product', storage_gb: 512, color: 'synthetic color' };
  for (const storage_gb of [null, '', '512', false, 0, -1, 512.5, NaN, Infinity, 8193]) {
    assert.equal(run([{ name: 'db_query', args: { ...args, storage_gb } }])[0].json.valid, false);
  }
  for (const value of [null, '', ' ', 5, 'a\u0000b', 'a'.repeat(257)]) {
    assert.equal(run([{ name: 'db_query', args: { ...args, color: value } }])[0].json.valid, false);
  }
  assert.equal(run([{ name: 'db_query', args: { ...args, sql: legacy[0] } }])[0].json.errors[0], 'AMBIGUOUS_LOOKUP_AND_SQL');
  assert.equal(run([{ name: 'db_query', args: { ...args, limit: 100 } }])[0].json.errors[0], 'UNSUPPORTED_ARGUMENT');
  assert.equal(run([{ name: 'db_query', args: { ...args, lookup: 'execute_sql' } }])[0].json.errors[0], 'UNSUPPORTED_LOOKUP');
});

test('briefing lookup and legacy shape require the approved customer ID syntax', () => {
  const structured = run([{ name: 'db_query', args: { lookup: 'customer_briefing', customer_id: 'customer_0013' } }])[0].json;
  assert.equal(structured.valid, true);
  assert.deepEqual(structured.params, ['customer_0013']);
  assert.equal(structured.query, run([sqlRequest(legacy[3])])[0].json.query);
  for (const customer_id of ['customer_1', 'customer_abc', "customer_0013' OR 1=1", 'other_0013', null]) {
    assert.equal(run([{ name: 'db_query', args: { lookup: 'customer_briefing', customer_id } }])[0].json.valid, false);
  }
  assert.equal(run([sqlRequest(legacy[3].replace('customer_0013', 'customer_abc'))])[0].json.errors[0], 'INVALID_CUSTOMER_ID');
});

test('malformed requests never produce query output or borrow another item payload', () => {
  const malformed = [null, undefined, false, [], {}, { name: 'db_query' }, { name: 'db_query', args: [] }, { name: 'untrusted', args: { sql: legacy[0] } }, sqlRequest('a'.repeat(12001))];
  const results = run([sqlRequest(legacy[0]), ...malformed, sqlRequest(legacy[1])]);
  results.forEach((result, index) => assert.deepEqual(result.pairedItem, { item: index }));
  assert.equal(results[0].json.valid, true);
  assert.equal(results.at(-1).json.valid, true);
  for (const result of results.slice(1, -1)) {
    assert.equal(result.json.valid, false);
    assert.equal(result.json.query, null);
    assert.deepEqual(result.json.params, []);
  }
  assert.deepEqual(codeNode({ all: () => [] }), []);
});

test('three observed rejected inventory SELECTs become fixed parameterized lookups without inventing storage', () => {
  const bodies = inventoryOptions.map(sqlRequest), before = structuredClone(bodies);
  const results = run(bodies).map(item => item.json);
  assert.deepEqual(results.map(result => result.lookup), [
    'local_inventory_available_options', 'local_inventory_count_options', 'local_inventory_count_options_by_store',
  ]);
  results.forEach((result, index) => {
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.params, ['KT플라자 동성로점', '%Galaxy S26 Ultra%', null, '%실버%']);
    assert.strictEqual(result.body, bodies[index]);
    assert.notEqual(result.query, inventoryOptions[index]);
    assert.ok(!result.query.includes('KT플라자 동성로점'));
    assert.ok(!result.query.includes('Galaxy S26 Ultra'));
    assert.match(result.query, /\(\$3::integer IS NULL OR p\.storage_gb = \$3\)/);
    assert.match(result.query, /^SELECT /);
  });
  assert.match(results[0].query, /^SELECT p\.id, p\.name, p\.storage_gb, p\.color,/);
  assert.match(results[0].query, /AS available_qty/);
  assert.match(results[1].query, /i\.stock_qty, i\.reserved_qty, i\.transfer_qty/);
  assert.match(results[2].query, /i\.store_id = \(SELECT id FROM stores WHERE name = \$1\)/);
  assert.deepEqual(bodies, before);
});

test('the same three complete inventory shapes may include an explicit typed storage predicate', () => {
  for (const original of inventoryOptions) {
    const explicit = original.replace(' AND p.color ILIKE', ' AND p.storage_gb = 512 AND p.color ILIKE');
    const result = run([sqlRequest(explicit)])[0].json;
    assert.equal(result.valid, true);
    assert.deepEqual(result.params, ['KT플라자 동성로점', '%Galaxy S26 Ultra%', 512, '%실버%']);
    // Whitespace/case/one terminal semicolon are still syntactic variations only.
    const formatted = explicit.replace(/ FROM /g, '\n FROM\t').replace(/ JOIN /g, '\n JOIN\t') + '; \n';
    assert.equal(run([sqlRequest(formatted)])[0].json.valid, true);
    assert.equal(run([sqlRequest(explicit.replace('SELECT', 'select'))])[0].json.valid, true);
    for (const value of ['0', '8193', '99999999999999999999999999']) {
      const bad = run([sqlRequest(explicit.replace('storage_gb = 512', 'storage_gb = ' + value))])[0].json;
      assert.equal(bad.valid, false);
      assert.equal(bad.query, null);
      assert.deepEqual(bad.params, []);
      assert.deepEqual(bad.errors, ['INVALID_INVENTORY_ARGUMENTS']);
    }
  }
});

test('new option lookups continue rejecting additional SQL, altered scope, projections and expressions', () => {
  for (const original of inventoryOptions) {
    const unsupported = [
      original + '; SELECT 1', original + ' UNION SELECT 1', original + ' -- note',
      original.replace(' FROM ', ' /* note */ FROM '),
      original.replace('p.name,', 'pg_sleep(5),'),
      original.replace('p.color ILIKE', 'p.color ='), original + ' ORDER BY p.name', original + ' LIMIT 5',
      original.replace("p.name ILIKE '%Galaxy S26 Ultra%'", "p.name ILIKE '%Galaxy S26 Ultra%' OR TRUE"),
      original.replace(' AND p.color ILIKE', ' AND p.storage_gb = 512::integer AND p.color ILIKE'),
      original.replace(' AND p.color ILIKE', ' AND p.storage_gb = -1 AND p.color ILIKE'),
      original.replace(' AND p.color ILIKE', ' AND p.storage_gb = 512.5 AND p.color ILIKE'),
      original.replace("'%실버%'", "'%실버%"),
    ];
    for (const sql of unsupported) {
      const result = run([sqlRequest(sql)])[0].json;
      assert.equal(result.valid, false, sql);
      assert.equal(result.query, null);
      assert.deepEqual(result.params, []);
      assert.deepEqual(result.errors, ['UNSUPPORTED_SQL_SHAPE']);
    }
  }
  for (const sql of [
    "SELECT * FROM inventories",
    inventoryOptions[0].replace("WHERE s.name = 'KT플라자 동성로점' AND ", 'WHERE '),
    inventoryOptions[2].replace("WHERE i.store_id = (SELECT id FROM stores WHERE name = 'KT플라자 동성로점') AND ", 'WHERE '),
  ]) assert.equal(run([sqlRequest(sql)])[0].json.valid, false);
});

test('SQL-looking text stays bound as data, and new internal lookup keys cannot bypass structured input restrictions', () => {
  for (const original of inventoryOptions) {
    const escaped = original.replace("'KT플라자 동성로점'", "'O''Brien; DROP TABLE products'");
    const result = run([sqlRequest(escaped)])[0].json;
    assert.equal(result.valid, true);
    assert.equal(result.params[0], "O'Brien; DROP TABLE products");
    assert.ok(!result.query.includes('DROP'));
    const newKeys = ['local_inventory_available_options', 'local_inventory_count_options', 'local_inventory_count_options_by_store'];
    for (const lookup of newKeys) {
      const rejected = run([{ name: 'db_query', args: { lookup } }])[0].json;
      assert.equal(rejected.valid, false);
      assert.equal(rejected.errors[0], 'UNSUPPORTED_LOOKUP');
    }
  }
});

const earlierInventoryOptions = [
  "SELECT p.name, p.storage_gb, p.color, i.stock_qty - i.reserved_qty - i.transfer_qty AS available FROM products p JOIN inventories i ON i.product_id = p.id JOIN stores s ON s.id = i.store_id WHERE s.name = 'KT플라자 동성로점' AND p.name ILIKE '%Galaxy S26 Ultra%' AND p.color ILIKE '%실버%'",
  "SELECT p.name, p.storage_gb, p.color, i.stock_qty, i.reserved_qty, i.transfer_qty FROM products p JOIN inventories i ON i.product_id = p.id JOIN stores s ON s.id = i.store_id WHERE s.name = 'KT플라자 동성로점' AND p.name ILIKE '%Galaxy S26 Ultra%' AND p.color ILIKE '%실버%'",
];

test('two earlier rejected product-first lookups retain available and raw-count projections with optional storage', () => {
  const bodies = earlierInventoryOptions.map(sqlRequest), before = structuredClone(bodies);
  const results = run(bodies).map(item => item.json);
  assert.deepEqual(results.map(result => result.lookup), ['local_inventory_balance_options', 'local_inventory_count_options']);
  results.forEach((result, index) => {
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.params, ['KT플라자 동성로점', '%Galaxy S26 Ultra%', null, '%실버%']);
    assert.strictEqual(result.body, bodies[index]);
    assert.notEqual(result.query, earlierInventoryOptions[index]);
    assert.ok(!result.query.includes('KT플라자 동성로점'));
    assert.ok(!result.query.includes('Galaxy S26 Ultra'));
    assert.match(result.query, /\(\$3::integer IS NULL OR p\.storage_gb = \$3\)/);
    const explicit = earlierInventoryOptions[index].replace(' AND p.color ILIKE', ' AND p.storage_gb = 512 AND p.color ILIKE');
    assert.deepEqual(run([sqlRequest(explicit)])[0].json.params, ['KT플라자 동성로점', '%Galaxy S26 Ultra%', 512, '%실버%']);
    assert.equal(run([sqlRequest(explicit + ';\n')])[0].json.valid, true);
  });
  assert.match(results[0].query, /\(i\.stock_qty - i\.reserved_qty - i\.transfer_qty\) AS available\n/);
  assert.match(results[1].query, /i\.stock_qty, i\.reserved_qty, i\.transfer_qty/);
  // Equivalent JOIN order is normalized to an existing fixed raw-count query, not a new SQL executor.
  assert.equal(results[1].query, run([sqlRequest(inventoryOptions[1])])[0].json.query);
  assert.deepEqual(bodies, before);
});

test('the two product-first compatibility shapes preserve statement, scope, expression and structured guards', () => {
  for (const original of earlierInventoryOptions) {
    const unsupported = [
      original + '; SELECT 1', original + ' UNION SELECT 1', original + '-- comment',
      original.replace(' FROM ', ' /* comment */ FROM '), original.replace('p.name,', 'pg_sleep(5),'),
      original.replace("WHERE s.name = 'KT플라자 동성로점' AND ", 'WHERE '),
      original.replace("s.name = 'KT플라자 동성로점'", "s.name = 'KT플라자 동성로점' OR TRUE"),
      original + ' LIMIT 1', original + ' ORDER BY p.name',
      original.replace(' AND p.color ILIKE', ' AND p.storage_gb = 512::integer AND p.color ILIKE'),
      original.replace(' AND p.color ILIKE', ' AND p.storage_gb = -1 AND p.color ILIKE'),
      original.replace(' AND p.color ILIKE', ' AND p.storage_gb = 512.5 AND p.color ILIKE'),
      original.replace('JOIN inventories i ON i.product_id = p.id', 'JOIN inventories i ON true'),
    ];
    for (const sql of unsupported) {
      const result = run([sqlRequest(sql)])[0].json;
      assert.equal(result.valid, false, sql);
      assert.equal(result.query, null);
      assert.deepEqual(result.params, []);
      assert.deepEqual(result.errors, ['UNSUPPORTED_SQL_SHAPE']);
    }
    for (const value of ['0', '8193', '999999999999999999999999999999']) {
      const sql = original.replace(' AND p.color ILIKE', ' AND p.storage_gb = ' + value + ' AND p.color ILIKE');
      assert.deepEqual(run([sqlRequest(sql)])[0].json.errors, ['INVALID_INVENTORY_ARGUMENTS']);
    }
    const quoted = original.replace("'KT플라자 동성로점'", "'O''Brien; DROP TABLE products'");
    const bound = run([sqlRequest(quoted)])[0].json;
    assert.equal(bound.valid, true);
    assert.equal(bound.params[0], "O'Brien; DROP TABLE products");
    assert.ok(!bound.query.includes('DROP'));
  }
  const rejected = run([{ name: 'db_query', args: { lookup: 'local_inventory_balance_options' } }])[0].json;
  assert.equal(rejected.valid, false);
  assert.deepEqual(rejected.errors, ['UNSUPPORTED_LOOKUP']);
});
