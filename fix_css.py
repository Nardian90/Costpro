import sys

with open('src/app/globals.css', 'r') as f:
    lines = f.readlines()

# Remove the previously added buggy part if it exists
# (Assuming it's the last ~50 lines I added)
new_lines = []
for line in lines:
    if "MOBILE HARDENING UTILITIES" in line:
        break
    new_lines.append(line)

addition = """
/* ============================================
   MOBILE HARDENING UTILITIES (FIXED)
   ============================================ */

.space-y-adaptive {
  display: flex;
  flex-direction: column;
  row-gap: clamp(0.75rem, 2vw, 1.5rem);
}

.gap-adaptive {
  gap: clamp(0.5rem, 1.5vw, 1rem);
}

.badge-responsive {
  font-size: clamp(8px, 2.5vw, 10px);
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.label-no-wrap {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.table-container {
  overflow-x: auto;
  margin-left: -1rem;
  margin-right: -1rem;
  padding-left: 1rem;
  padding-right: 1rem;
  scrollbar-width: thin;
  scrollbar-color: rgba(0,0,0,0.1) transparent;
}

.table-responsive {
  min-width: 100%;
}

.action-buttons-mobile {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

@media (min-width: 768px) {
  .action-buttons-mobile {
    flex-wrap: nowrap;
  }
}

/* Custom Scrollbar for better UX on Mobile */
.table-container::-webkit-scrollbar {
  height: 4px;
}

.table-container::-webkit-scrollbar-track {
  background: transparent;
}

.table-container::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.1);
  border-radius: 10px;
}
"""

with open('src/app/globals.css', 'w') as f:
    f.writelines(new_lines)
    f.write(addition)
