import threading

class Product:
    def __init__(self, stock, cost):
        self.stock = stock
        self.cost = cost
        self.lock = threading.Lock()

    def update_wac_no_lock(self, new_qty, new_unit_cost):
        # Simulate race condition: read, calculate, then write
        curr_stock = self.stock
        curr_cost = self.cost

        # Calculation
        total_qty = curr_stock + new_qty
        new_cost = ((curr_stock * curr_cost) + (new_qty * new_unit_cost)) / total_qty

        # Write back
        self.stock = total_qty
        self.cost = new_cost

# Initial State
prod = Product(10, 100)
print(f"Initial: Stock={prod.stock}, Cost={prod.cost}")

# Simulate two concurrent receptions
# Reception A: 5 units at 150
# Reception B: 5 units at 200

def reception_a():
    prod.update_wac_no_lock(5, 150)

def reception_b():
    prod.update_wac_no_lock(5, 200)

# In a real race, they both read 10, 100.
# Let's force that state in the simulation.

curr_stock_snapshot = prod.stock
curr_cost_snapshot = prod.cost

# A calculates
total_qty_a = curr_stock_snapshot + 5
new_cost_a = ((curr_stock_snapshot * curr_cost_snapshot) + (5 * 150)) / total_qty_a

# B calculates
total_qty_b = curr_stock_snapshot + 5
new_cost_b = ((curr_stock_snapshot * curr_cost_snapshot) + (5 * 200)) / total_qty_b

# A writes
prod.stock = total_qty_a
prod.cost = new_cost_a

# B writes (overwrites A's increment)
prod.stock = total_qty_b
prod.cost = new_cost_b

print(f"Final State (Race): Stock={prod.stock}, Cost={prod.cost}")

# Correct logic: Sequential
prod_correct = Product(10, 100)
prod_correct.update_wac_no_lock(5, 150)
prod_correct.update_wac_no_lock(5, 200)

print(f"Final State (Correct): Stock={prod_correct.stock}, Cost={prod_correct.cost}")

if prod.cost != prod_correct.cost:
    print("BUG DETECTED: WAC corruption due to concurrency (no row locking).")
