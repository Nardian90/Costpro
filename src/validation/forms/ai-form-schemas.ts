export const AI_FORM_SCHEMAS = {
  costSheet: {
    name: "string",
    category: "string",
    base_unit: "string",
    target_price: "number",
    margin: "number",
    items: "array of { supply_id, quantity, unit_cost }"
  },
  product: {
    name: "string",
    sku: "string",
    category: "string",
    price: "number",
    cost: "number",
    stock_min: "number"
  },
  supply: {
    name: "string",
    unit: "string",
    unit_cost: "number",
    provider: "string"
  }
};
