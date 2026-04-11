## 2025-05-15 - [Optimization of recalculateIPVReportsChain]
**Learning:** Nested array filtering and reduction inside multiple loops (O(N^3) or O(N*P*M)) is a major performance bottleneck for IPV report generation. Pre-grouping data into Maps for O(1) lookup dramatically improves speed.
**Action:** Always pre-calculate aggregates or use Maps for lookups when dealing with historical data transformations involving multiple entities (Reports, Products, Movements).
