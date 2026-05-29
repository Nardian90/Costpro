import sys

with open('src/hooks/api/useMultiStoreDashboard.ts', 'r') as f:
    content = f.read()

# Fix StoreKPI mapping when RPC exists
content = content.replace(
    "pendingReceptions: rpcData.pending_receptions ?? 0,",
    "pendingReceptions: rpcData.pending_receptions ?? 0,\n                visibleProducts: rpcData.visible_products ?? 0,"
)

# Fix StoreKPI mapping in error catch
content = content.replace(
    "pendingReceptions: 0,",
    "pendingReceptions: 0,\n              visibleProducts: 0,"
)

# Fix StoreKPI mapping in final results map
content = content.replace(
    "lowStockCount: 0, pendingTransfersOut: 0, pendingReceptions: 0,",
    "lowStockCount: 0, pendingTransfersOut: 0, pendingReceptions: 0,\n              visibleProducts: 0,"
)

with open('src/hooks/api/useMultiStoreDashboard.ts', 'w') as f:
    f.write(content)
