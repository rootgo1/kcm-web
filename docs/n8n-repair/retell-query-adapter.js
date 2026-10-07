// n8n Code node: Run Once for All Items. This never executes incoming SQL.
// Connect valid=true to Postgres Execute Query using query and params.
// Connect valid=false to Respond to Webhook with HTTP 400.
const FIXED_QUERIES = Object.freeze({
  local_inventory: `SELECT p.name, p.storage_gb, p.color,
  (i.stock_qty - i.reserved_qty - i.transfer_qty) AS available
FROM products p
JOIN inventories i ON i.product_id = p.id
JOIN stores s ON s.id = i.store_id
WHERE s.name = $1 AND p.name ILIKE $2 AND p.storage_gb = $3 AND p.color ILIKE $4`,
  local_inventory_details: `SELECT p.name, p.maker, p.storage_gb, p.color, p.price,
  COALESCE(i.stock_qty - i.reserved_qty - i.transfer_qty, 0) AS available_qty
FROM products p
JOIN inventories i ON i.product_id = p.id
JOIN stores s ON s.id = i.store_id
WHERE s.name = $1 AND p.name ILIKE $2 AND p.storage_gb = $3 AND p.color ILIKE $4`,
  other_store_inventory: `SELECT SUM(i.stock_qty - i.reserved_qty - i.transfer_qty) AS other_store_available
FROM products p
JOIN inventories i ON i.product_id = p.id
JOIN stores s ON s.id = i.store_id
WHERE s.name <> $1 AND p.name = $2 AND p.storage_gb = $3 AND p.color = $4`,
  local_inventory_available_options: `SELECT p.id, p.name, p.storage_gb, p.color,
  (i.stock_qty - i.reserved_qty - i.transfer_qty) AS available_qty
FROM stores s
JOIN inventories i ON i.store_id = s.id
JOIN products p ON p.id = i.product_id
WHERE s.name = $1 AND p.name ILIKE $2
  AND ($3::integer IS NULL OR p.storage_gb = $3) AND p.color ILIKE $4`,
  local_inventory_count_options: `SELECT p.name, p.storage_gb, p.color,
  i.stock_qty, i.reserved_qty, i.transfer_qty
FROM stores s
JOIN inventories i ON i.store_id = s.id
JOIN products p ON p.id = i.product_id
WHERE s.name = $1 AND p.name ILIKE $2
  AND ($3::integer IS NULL OR p.storage_gb = $3) AND p.color ILIKE $4`,
  local_inventory_count_options_by_store: `SELECT p.name, p.storage_gb, p.color,
  i.stock_qty, i.reserved_qty, i.transfer_qty
FROM inventories i JOIN products p ON i.product_id = p.id
WHERE i.store_id = (SELECT id FROM stores WHERE name = $1) AND p.name ILIKE $2
  AND ($3::integer IS NULL OR p.storage_gb = $3) AND p.color ILIKE $4`,
  local_inventory_balance_options: `SELECT p.name, p.storage_gb, p.color,
  (i.stock_qty - i.reserved_qty - i.transfer_qty) AS available
FROM products p
JOIN inventories i ON i.product_id = p.id
JOIN stores s ON s.id = i.store_id
WHERE s.name = $1 AND p.name ILIKE $2
  AND ($3::integer IS NULL OR p.storage_gb = $3) AND p.color ILIKE $4`,
  customer_briefing: `SELECT i.id AS customer_id, c.name AS customer_name, c.membership_grade,
  (SELECT count(*) FROM consultations s WHERE s.customer_id = i.id) AS consultation_count,
  (SELECT string_agg(r.purpose, ', ' ORDER BY r.started_at DESC)
   FROM (SELECT purpose, started_at FROM consultations WHERE customer_id = i.id
         ORDER BY started_at DESC LIMIT 3) r) AS recent_purposes
FROM (SELECT $1::text AS id) i LEFT JOIN customers c ON c.id = i.id`,
});

// Match only complete observed SELECT shapes, including five rejected inventory lookups.
// SQL comments, extra statements, casts, identifiers and expressions cannot be added.
const literal = "('(?:[^']|'')*')";
const count = '(\\d+)';
const balance = '\\(\\s*i\\.stock_qty\\s*-\\s*i\\.reserved_qty\\s*-\\s*i\\.transfer_qty\\s*\\)';
const unparenthesizedBalance = 'i\\.stock_qty\\s*-\\s*i\\.reserved_qty\\s*-\\s*i\\.transfer_qty';
const joins = ' FROM products p JOIN inventories i ON i\\.product_id = p\\.id JOIN stores s ON s\\.id = i\\.store_id';
const localWhere = ` WHERE s\\.name = ${literal} AND p\\.name ILIKE ${literal} AND p\\.storage_gb = ${count} AND p\\.color ILIKE ${literal}`;
const optionJoins = ' FROM stores s JOIN inventories i ON i\\.store_id = s\\.id JOIN products p ON p\\.id = i\\.product_id';
// Missing storage means return matching storage options; it never silently assumes 512GB.
const optionalStorage = `(?: AND p\\.storage_gb = ${count})?`;
const optionWhere = ` WHERE s\\.name = ${literal} AND p\\.name ILIKE ${literal}${optionalStorage} AND p\\.color ILIKE ${literal}`;
const countProjection = '^SELECT p\\.name, ?p\\.storage_gb, ?p\\.color, ?i\\.stock_qty, ?i\\.reserved_qty, ?i\\.transfer_qty';
const end = ' ?;? *$';
const LEGACY_PATTERNS = [
  { lookup: 'local_inventory', pattern: new RegExp('^SELECT p\\.name, ?p\\.storage_gb, ?p\\.color, ?' + balance + ' AS available' + joins + localWhere + end, 'i') },
  { lookup: 'other_store_inventory', pattern: new RegExp('^SELECT SUM' + balance + ' AS other_store_available' + joins + ` WHERE s\\.name <> ${literal} AND p\\.name = ${literal} AND p\\.storage_gb = ${count} AND p\\.color = ${literal}` + end, 'i') },
  { lookup: 'local_inventory_details', pattern: new RegExp('^SELECT p\\.name, ?p\\.maker, ?p\\.storage_gb, ?p\\.color, ?p\\.price, ?COALESCE\\( ?i\\.stock_qty\\s*-\\s*i\\.reserved_qty\\s*-\\s*i\\.transfer_qty, ?0 ?\\) AS available_qty' + joins + localWhere + end, 'i') },
  { lookup: 'customer_briefing', pattern: new RegExp("^SELECT i\\.id AS customer_id, ?c\\.name AS customer_name, ?c\\.membership_grade, ?\\(SELECT count\\(\\*\\) FROM consultations s WHERE s\\.customer_id = i\\.id\\) AS consultation_count, ?\\(SELECT string_agg\\(r\\.purpose, ?', ' ORDER BY r\\.started_at DESC\\) FROM \\(SELECT purpose, ?started_at FROM consultations WHERE customer_id = i\\.id ORDER BY started_at DESC LIMIT 3\\) r\\) AS recent_purposes FROM \\(SELECT " + literal + " AS id\\) i LEFT JOIN customers c ON c\\.id = i\\.id" + end, 'i') },
  { lookup: 'local_inventory_available_options', optionalStorage: true, pattern: new RegExp('^SELECT p\\.id, ?p\\.name, ?p\\.storage_gb, ?p\\.color, ?' + balance + ' AS available_qty' + optionJoins + optionWhere + end, 'i') },
  { lookup: 'local_inventory_count_options', optionalStorage: true, pattern: new RegExp(countProjection + optionJoins + optionWhere + end, 'i') },
  { lookup: 'local_inventory_count_options_by_store', optionalStorage: true, pattern: new RegExp(countProjection + ' FROM inventories i JOIN products p ON i\\.product_id = p\\.id WHERE i\\.store_id = \\(SELECT id FROM stores WHERE name = ' + literal + `\\) AND p\\.name ILIKE ${literal}${optionalStorage} AND p\\.color ILIKE ${literal}` + end, 'i') },
  { lookup: 'local_inventory_balance_options', optionalStorage: true, pattern: new RegExp('^SELECT p\\.name, ?p\\.storage_gb, ?p\\.color, ?' + unparenthesizedBalance + ' AS available' + joins + optionWhere + end, 'i') },
  { lookup: 'local_inventory_count_options', optionalStorage: true, pattern: new RegExp(countProjection + joins + optionWhere + end, 'i') },
];

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validText = (value, max = 256) => typeof value === 'string' && value.length > 0 && value.length <= max && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
const validStorage = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 8192;
const decodeLiteral = value => value.slice(1, -1).replace(/''/g, "'");
const literalContainsPattern = value => '%' + value.replace(/[\\%_]/g, '\\$&') + '%';

// Collapse whitespace only outside quoted literals: customer/store names remain exact.
function normalizeSql(source) {
  let output = '', quoted = false, pendingSpace = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      output += char;
      if (char === "'") {
        if (source[index + 1] === "'") output += source[++index];
        else quoted = false;
      }
    } else if (/\s/.test(char)) {
      pendingSpace = output.length > 0;
    } else {
      if (pendingSpace) output += ' ';
      pendingSpace = false;
      output += char;
      if (char === "'") quoted = true;
    }
  }
  return quoted ? null : output.trim();
}

function resultFor(body) {
  const invalid = error => ({ body, valid: false, query: null, params: [], errors: [error] });
  if (!isObject(body) || !isObject(body.args)) return invalid('INVALID_RETELL_FUNCTION_BODY');
  if (body.name !== 'db_query') return invalid('UNSUPPORTED_FUNCTION');
  const args = body.args;
  let lookup, params;

  if (Object.prototype.hasOwnProperty.call(args, 'lookup')) {
    // Refuse ambiguous requests rather than choosing between an operation and SQL.
    if (Object.prototype.hasOwnProperty.call(args, 'sql')) return invalid('AMBIGUOUS_LOOKUP_AND_SQL');
    lookup = args.lookup;
    if (lookup === 'customer_briefing') {
      if (Object.keys(args).some(key => !['lookup', 'customer_id'].includes(key))) return invalid('UNSUPPORTED_ARGUMENT');
      if (typeof args.customer_id !== 'string' || !/^customer_[0-9]{3,}$/.test(args.customer_id) || args.customer_id.length > 128) return invalid('INVALID_CUSTOMER_ID');
      params = [args.customer_id];
    } else if (lookup === 'local_inventory' || lookup === 'other_store_inventory') {
      if (Object.keys(args).some(key => !['lookup', 'store_name', 'product_name', 'storage_gb', 'color'].includes(key))) return invalid('UNSUPPORTED_ARGUMENT');
      if (!validText(args.store_name) || !validText(args.product_name) || !validText(args.color) || !validStorage(args.storage_gb)) return invalid('INVALID_INVENTORY_ARGUMENTS');
      params = lookup === 'local_inventory'
        ? [args.store_name, literalContainsPattern(args.product_name), args.storage_gb, literalContainsPattern(args.color)]
        : [args.store_name, args.product_name, args.storage_gb, args.color];
    } else return invalid('UNSUPPORTED_LOOKUP');
  } else {
    if (Object.keys(args).some(key => key !== 'sql')) return invalid('UNSUPPORTED_ARGUMENT');
    if (typeof args.sql !== 'string' || args.sql.length === 0 || args.sql.length > 12000) return invalid('INVALID_SQL_INPUT');
    const normalized = normalizeSql(args.sql);
    if (normalized === null) return invalid('UNSUPPORTED_SQL_SHAPE');
    const entry = LEGACY_PATTERNS.find(candidate => candidate.pattern.test(normalized));
    if (!entry) return invalid('UNSUPPORTED_SQL_SHAPE');
    lookup = entry.lookup;
    const match = entry.pattern.exec(normalized);
    if (lookup === 'customer_briefing') {
      const customerId = decodeLiteral(match[1]);
      if (!/^customer_[0-9]{3,}$/.test(customerId) || customerId.length > 128) return invalid('INVALID_CUSTOMER_ID');
      params = [customerId];
    } else {
      const storage = entry.optionalStorage && match[3] === undefined ? null : Number(match[3]);
      params = [decodeLiteral(match[1]), decodeLiteral(match[2]), storage, decodeLiteral(match[4])];
      if (!validText(params[0]) || !validText(params[1], 258) || !validText(params[3], 258)
        || (!validStorage(storage) && !(entry.optionalStorage && storage === null))) return invalid('INVALID_INVENTORY_ARGUMENTS');
    }
  }
  // query is always selected from this local constant map. Incoming SQL is data only.
  return { body, valid: true, lookup, query: FIXED_QUERIES[lookup], params, errors: [] };
}

return $input.all().map((item, index) => ({
  json: resultFor(item.json?.body ?? null),
  pairedItem: { item: index },
}));
