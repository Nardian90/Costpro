## 2025-05-22 - [Secure Password Generation]
**Vulnerability:** Use of `Math.random()` for default password generation in `managed-create` route.
**Learning:** `Math.random()` is not cryptographically secure and can lead to predictable passwords in administrative actions.
**Prevention:** Always use Node.js built-in `crypto.randomBytes()` or `crypto.randomUUID()` for generating sensitive strings like passwords or tokens.
