// Censo READ-ONLY de db/custom.db — documentar qué representa esta BD local
// NOTA: esta NO es la BD del Audit Harness PostgreSQL (esa se perdió con el sandbox)
import { Database } from "bun:sqlite";

const db = new Database("/home/z/my-project/Costpro/db/custom.db", { readonly: true });

const q = (sql: string) => db.query(sql).all();

try {
  const tables = q(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ) as { name: string }[];
  console.log(`TABLAS (${tables.length}):`, tables.map(t => t.name).join(", "));

  const one = (sql: string, label: string) => {
    try {
      const r = db.query(sql).get() as any;
      console.log(`${label}: ${Object.values(r)[0]}`);
    } catch (e) {
      console.log(`${label}: N/A (${(e as Error).message.slice(0, 60)})`);
    }
  };

  one("SELECT COUNT(*) c FROM stores", "tiendas");
  try {
    const stores = q("SELECT id, name FROM stores ORDER BY name") as any[];
    console.log("detalle tiendas:", stores.map(s => `${s.name}`).join(" | "));
  } catch {}
  one("SELECT COUNT(*) c FROM products", "productos");
  one("SELECT COUNT(*) c FROM transactions", "transacciones");
  one("SELECT COUNT(*) c FROM transaction_items", "transaction_items");
  one("SELECT COUNT(*) c FROM stock_movements", "stock_movements");
  one("SELECT COUNT(*) c FROM receipt_items", "receipt_items");
  one("SELECT COUNT(*) c FROM devolutions", "devoluciones");
  one("SELECT COUNT(*) c FROM production_orders", "production_orders");
  one("SELECT COUNT(*) c FROM payment_transactions", "payment_transactions");
  one("SELECT COUNT(*) c FROM users", "usuarios");
  one(
    "SELECT COUNT(*) c FROM products WHERE COALESCE(cost_average,0)=0",
    "productos cost_average=0"
  );
  one(
    "SELECT COUNT(*) c FROM products WHERE COALESCE(cost_price,0)=0",
    "productos cost_price=0"
  );
} finally {
  db.close();
}
console.log("— censo READ-ONLY completado, cero mutaciones —");
