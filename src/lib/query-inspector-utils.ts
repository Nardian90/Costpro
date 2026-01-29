
/**
 * Utility to format Supabase/PostgREST queries and RPC calls into pseudo-SQL for the Admin Inspector.
 */

export function formatPostgrestUrlToSql(
  urlStr: string,
  operation: 'select' | 'insert' | 'update' | 'delete' = 'select'
): string {
  try {
    const url = new URL(urlStr);
    const pathParts = url.pathname.split('/');
    const table = pathParts[pathParts.length - 1];
    const searchParams = url.searchParams;

    const select = searchParams.get('select') || '*';
    const filters: string[] = [];

    searchParams.forEach((value, key) => {
      if (key === 'select' || key === 'order' || key === 'limit' || key === 'offset') return;

      // PostgREST format: column=op.value or column=value (defaults to eq)
      const parts = value.split('.');
      let operator = 'eq';
      let val = value;

      if (parts.length > 1) {
        operator = parts[0];
        val = parts.slice(1).join('.');
      }

      const sqlOp = mapOperator(operator);
      filters.push(`${key} ${sqlOp} ${formatValue(val)}`);
    });

    let sql = '';

    switch (operation) {
      case 'select':
        sql = `SELECT ${select} FROM ${table}`;
        break;
      case 'insert':
        sql = `INSERT INTO ${table} (content in body)`;
        break;
      case 'update':
        sql = `UPDATE ${table} SET (content in body)`;
        break;
      case 'delete':
        sql = `DELETE FROM ${table}`;
        break;
    }

    if (filters.length > 0) {
      sql += ` WHERE ${filters.join(' AND ')}`;
    }

    if (operation === 'select') {
      const order = searchParams.get('order');
      if (order) {
        sql += ` ORDER BY ${order.replace('.', ' ')}`;
      }

      const limit = searchParams.get('limit');
      if (limit) {
        sql += ` LIMIT ${limit}`;
      }

      const offset = searchParams.get('offset');
      if (offset) {
        sql += ` OFFSET ${offset}`;
      }
    }

    return sql;
  } catch (error) {
    return `Error parsing query: ${urlStr}`;
  }
}

export function formatRpcToSql(rpcName: string, params: any): string {
  const paramString = params
    ? Object.entries(params)
        .map(([key, value]) => `${key} => ${formatValue(value)}`)
        .join(', ')
    : '';

  return `SELECT * FROM ${rpcName}(${paramString})`;
}

function mapOperator(op: string): string {
  const ops: Record<string, string> = {
    eq: '=',
    neq: '<>',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    like: 'LIKE',
    ilike: 'ILIKE',
    is: 'IS',
    in: 'IN',
  };
  return ops[op] || op.toUpperCase();
}

function formatValue(val: any): string {
  if (val === 'null') return 'NULL';
  if (val === 'true') return 'TRUE';
  if (val === 'false') return 'FALSE';
  if (typeof val === 'string') {
    if (val.startsWith('(') && val.endsWith(')')) return val; // Already formatted for IN
    return `'${val}'`;
  }
  return String(val);
}
