def calculate_wac(current_stock, current_cost, new_qty, new_unit_cost):
    total_new_qty = current_stock + new_qty
    if total_new_qty <= 0:
        return new_unit_cost
    new_total_cost = (current_stock * current_cost) + (new_qty * new_unit_cost)
    return new_total_cost / total_new_qty

# Initial state
stock = 10
cost = 100

print(f"Initial: Stock={stock}, Cost={cost}")

# Reception: 10 units at 200
reception_qty = 10
reception_cost = 200
new_cost = calculate_wac(stock, cost, reception_qty, reception_cost)
stock += reception_qty
cost = new_cost

print(f"After Reception: Stock={stock}, Cost={cost}")

# Annul Reception
# According to the SQL logic in cancel_reception, only quantity is reverted.
stock -= reception_qty
# cost remains the same!

print(f"After Annulment (SQL logic): Stock={stock}, Cost={cost}")
print(f"Expected (Back to initial): Stock=10, Cost=100")

if cost != 100:
    print("BUG DETECTED: Average cost not reverted on reception annulment.")
