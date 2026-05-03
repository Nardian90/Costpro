# Record of Processing Activities (ROPA)

**GDPR Article 30 Compliance Document**

| **Field** | **Value** |
|---|---|
| **Document ID** | ROPA-CP-001 |
| **Version** | 1.0 |
| **Date Created** | 2025-01-24 |
| **Last Reviewed** | 2025-01-24 |
| **Next Review** | 2026-01-24 |
| **Controller** | CostPro Team |
| **DPO Contact** | privacidad@costpro.app |
| **Lead Supervisory Authority** | To be determined based on main establishment |

---

## 1. Overview

CostPro Enterprise is a business management platform providing inventory management, point-of-sale (POS) transaction processing, cost control, financial analysis, and multi-store operations. The platform is built as a Next.js web application with Supabase (PostgreSQL) as the backend database and data hosted on Render.com infrastructure.

This Record of Processing Activities (ROPA) is maintained in accordance with **GDPR Article 30**, which requires controllers and processors to maintain a record of processing activities under their responsibility.

---

## 2. Controller & Processor Information

| **Role** | **Entity** | **Relationship** |
|---|---|---|
| **Data Controller** | CostPro Team | Determines purposes and means of processing |
| **Data Processor (Database)** | Supabase Inc. | PostgreSQL hosting, authentication, real-time subscriptions |
| **Data Processor (Hosting)** | Render.com | Application hosting, infrastructure provider |
| **Data Processor (AI/ML)** | Third-party LLM provider (where applicable) | Cost prediction and chatbot assistance |

---

## 3. Common Recipients

The following recipients may receive personal data depending on the processing activity:

| **Recipient** | **Category** | **Description** |
|---|---|---|
| **Supabase** | Data Processor | Database storage (PostgreSQL), authentication services, real-time API |
| **Render.com** | Data Processor | Application hosting, server logs, network infrastructure |
| **Authorized Employees** | Internal | Staff with role-based access via RBAC permissions |

---

## 4. Common Security Measures

All processing activities are protected by the following technical and organizational measures:

| **Measure** | **Description** |
|---|---|
| **TLS 1.3** | All data in transit is encrypted using Transport Layer Security 1.3 |
| **CSP Headers** | Content Security Policy headers mitigate XSS and injection attacks |
| **Rate Limiting** | API rate limiting prevents brute-force and abuse attempts |
| **RBAC** | Role-Based Access Control restricts data access by user role (admin, manager, cashier) |
| **Encrypted Auth Tokens** | JWT-based authentication with encrypted tokens; short expiry with refresh rotation |
| **Supabase RLS** | Row-Level Security policies enforce data isolation per store and user |
| **Environment Isolation** | Secrets managed via environment variables; never committed to source control |

---

## 5. Processing Activities

### 5.1 User Account Management

| **Aspect** | **Details** |
|---|---|
| **Activity Name** | User Account Management |
| **Purpose** | Platform access, user identification, authorization, and multi-store assignment |
| **Legal Basis** | Contract execution — Art. 6(1)(b) GDPR |
| **Data Categories** | Name, email address, role (admin/manager/cashier), store assignment, profile preferences |
| **Categories of Data Subjects** | Customers (business users), Employees |
| **Recipients** | Supabase (auth & DB), Render.com (hosting) |
| **International Transfers** | No (data processed within EU/EEA unless configured otherwise) |
| **Retention Period** | Duration of contract + 2 years |
| **Security Measures** | TLS 1.3, RBAC, encrypted auth tokens, CSP headers, rate limiting |
| **Data Subject Rights** | Access, rectification, erasure, portability, objection |

---

### 5.2 Sales & POS Transactions

| **Aspect** | **Details** |
|---|---|
| **Activity Name** | Sales & POS Transactions |
| **Purpose** | Transaction processing, order management, fiscal compliance, and receipt generation |
| **Legal Basis** | Contract execution (Art. 6(1)(b)) + Legal obligation for fiscal records (Art. 6(1)(c)) GDPR |
| **Data Categories** | Product details, quantity, unit price, discount, total amount, payment method (cash/transfer), customer identifier, timestamp, receipt number |
| **Categories of Data Subjects** | Customers, Transaction data subjects |
| **Recipients** | Supabase (DB storage), Render.com (hosting) |
| **International Transfers** | No |
| **Retention Period** | 6 years (fiscal/legal obligation) |
| **Security Measures** | TLS 1.3, RBAC, encrypted auth tokens, CSP headers, rate limiting, Supabase RLS per store |
| **Data Subject Rights** | Access, rectification (limited by fiscal records requirements), restriction |

**Note:** Retention of 6 years is based on fiscal record-keeping obligations. The right to erasure may be limited during this period due to legal obligation (Art. 17(3)(c)).

---

### 5.3 Inventory Management

| **Aspect** | **Details** |
|---|---|
| **Activity Name** | Inventory Management |
| **Purpose** | Stock control, product catalog management, supply chain operations, stock movement tracking, and multi-store inventory synchronization |
| **Legal Basis** | Contract execution (Art. 6(1)(b)) + Legitimate interest for business operations optimization (Art. 6(1)(f)) GDPR |
| **Data Categories** | Product name/SKU, description, stock levels, unit cost, sale price, supplier info, stock movements (in/out/adjustments), store-specific quantities, images |
| **Categories of Data Subjects** | Product data (business information), Internal operations |
| **Recipients** | Supabase (DB storage, real-time sync), Render.com (hosting) |
| **International Transfers** | No |
| **Retention Period** | Duration of contract + 2 years |
| **Security Measures** | TLS 1.3, RBAC, encrypted auth tokens, CSP headers, rate limiting, Supabase RLS per store |
| **Data Subject Rights** | Access, rectification, portability |

---

### 5.4 Cost Sheets & Financial Analysis

| **Aspect** | **Details** |
|---|---|
| **Activity Name** | Cost Sheets & Financial Analysis |
| **Purpose** | Business intelligence, cost formula computation, margin analysis, financial planning, and pricing optimization |
| **Legal Basis** | Legitimate interest — Art. 6(1)(f) GDPR (business analytics and financial planning for operational efficiency) |
| **Data Categories** | Cost formulas, cost row structures, annexed data tables, calculated margins, target prices, header metadata (product/service classification), scenario simulation results |
| **Categories of Data Subjects** | Financial data, Business analytics |
| **Recipients** | Supabase (DB storage), Render.com (hosting) |
| **International Transfers** | No |
| **Retention Period** | 5 years |
| **Security Measures** | TLS 1.3, RBAC, encrypted auth tokens, CSP headers, rate limiting |
| **Data Subject Rights** | Access, rectification |

---

### 5.5 Technical Logs & Security

| **Aspect** | **Details** |
|---|---|
| **Activity Name** | Technical Logs & Security Monitoring |
| **Purpose** | Security monitoring, incident investigation, anomaly detection, audit trail, and system performance analysis |
| **Legal Basis** | Legitimate interest — Art. 6(1)(f) GDPR (network and information security, Art. 32 obligation) |
| **Data Categories** | IP addresses, browser User-Agent strings, API access logs, request timestamps, error logs, authentication events, session metadata |
| **Categories of Data Subjects** | Technical identifiers (all platform users) |
| **Recipients** | Render.com (hosting logs), Supabase (auth logs) |
| **International Transfers** | Logs may be stored on Render.com infrastructure (verify DPA) |
| **Retention Period** | 12 months |
| **Security Measures** | TLS 1.3, CSP headers, rate limiting, log access restricted to admin role, automated log rotation |
| **Data Subject Rights** | Access, objection (may be limited for security purposes) |

**Note:** IP addresses are processed as technical identifiers for security purposes. This processing is strictly necessary for the legitimate interest of maintaining platform security (GDPR Recital 30).

---

### 5.6 Cookies & Tracking

| **Aspect** | **Details** |
|---|---|
| **Activity Name** | Cookies & Tracking |
| **Purpose** | Session authentication, user experience preferences, and analytics (where consented) |
| **Legal Basis** | Consent — Art. 6(1)(a) GDPR (except strictly necessary cookies exempt per ePrivacy Directive) |
| **Data Categories** | Session tokens, preference cookies (theme, language, layout), analytics identifiers (when consented) |
| **Categories of Data Subjects** | Online identifiers (all website visitors) |
| **Recipients** | Render.com (hosting), Analytics provider (if applicable) |
| **International Transfers** | Dependent on analytics provider (verify DPA) |
| **Retention Period** | 1 year (essential/session cookies: session duration) / Consent-based (analytics: until consent withdrawn) |
| **Security Measures** | TLS 1.3, Secure and HttpOnly cookie flags, SameSite attribute, CSP headers |
| **Data Subject Rights** | Access, right to withdraw consent at any time |

**Cookie Classification:**

| **Cookie Type** | **Purpose** | **Legal Basis** | **Duration** | **Consent Required** |
|---|---|---|---|---|
| **Strictly Necessary** | Authentication session, CSRF protection, load balancing | Legitimate interest / ePrivacy exemption | Session | No |
| **Preferences** | Theme, language, UI layout settings | Consent (Art. 6(1)(a)) | 1 year | Yes |
| **Analytics** | Page views, feature usage, performance metrics | Consent (Art. 6(1)(a)) | Until withdrawn | Yes |

---

### 5.7 AI/ML Processing

| **Aspect** | **Details** |
|---|---|
| **Activity Name** | AI/ML Processing |
| **Purpose** | AI-assisted features including chatbot interactions for cost sheet assistance, cost predictions, and smart recommendations |
| **Legal Basis** | Consent (Art. 6(1)(a)) + Legitimate interest (Art. 6(1)(f)) for platform optimization GDPR |
| **Data Categories** | User queries (text prompts), cost sheet context data sent to AI model, generated content/responses, prediction parameters |
| **Categories of Data Subjects** | User queries, Generated content |
| **Recipients** | Third-party LLM provider (AI inference), Supabase (interaction history), Render.com (hosting) |
| **International Transfers** | Yes — AI model API calls may transfer data outside EEA (DPA and SCCs required) |
| **Retention Period** | 12 months |
| **Security Measures** | TLS 1.3, RBAC, encrypted auth tokens, minimal data sent to AI (anonymization where possible), CSP headers, rate limiting |
| **Data Subject Rights** | Access, rectification, erasure, right to object to automated processing (Art. 22), right not to be subject to solely automated decisions |

**AI Transparency Requirements:**
- Users are informed when interacting with AI-powered features
- AI-generated content is clearly labeled as such
- Users retain final decision authority over AI recommendations
- No fully automated decisions with legal or similarly significant effects are made

---

## 6. Consolidated Processing Activities Table

| # | Activity | Purpose | Legal Basis | Data Categories | Recipients | Retention |
|---|---|---|---|---|---|---|
| 1 | User Account Management | Platform access & authorization | Art. 6(1)(b) | Name, email, role, store | Supabase, Render.com | Contract + 2 years |
| 2 | Sales & POS Transactions | Transaction processing & fiscal compliance | Art. 6(1)(b)/(c) | Products, prices, payments, customer | Supabase, Render.com | 6 years |
| 3 | Inventory Management | Stock control & supply chain | Art. 6(1)(b)/(f) | Product data, stock levels, movements | Supabase, Render.com | Contract + 2 years |
| 4 | Cost Sheets & Financial Analysis | Business intelligence & planning | Art. 6(1)(f) | Cost formulas, calculations, margins | Supabase, Render.com | 5 years |
| 5 | Technical Logs & Security | Security monitoring & investigation | Art. 6(1)(f) | IP addresses, browser info, API logs | Render.com, Supabase | 12 months |
| 6 | Cookies & Tracking | Auth, preferences, analytics | Art. 6(1)(a) | Session tokens, preferences | Render.com, analytics provider | 1 year / consent-based |
| 7 | AI/ML Processing | AI features & recommendations | Art. 6(1)(a)/(f) | User queries, generated content | LLM provider, Supabase, Render.com | 12 months |

---

## 7. Data Subject Rights

In accordance with GDPR Articles 12–23, CostPro Enterprise recognizes the following rights for data subjects:

| **Right** | **GDPR Article** | **Description** | **How to Exercise** |
|---|---|---|---|
| **Right of Access** | Art. 15 | Obtain confirmation of and access to personal data processed | Contact DPO: privacidad@costpro.app |
| **Right to Rectification** | Art. 16 | Request correction of inaccurate or incomplete data | In-app profile settings or contact DPO |
| **Right to Erasure** | Art. 17 | Request deletion of personal data (subject to legal retention requirements) | Contact DPO |
| **Right to Restriction** | Art. 18 | Request limitation of processing in certain circumstances | Contact DPO |
| **Right to Data Portability** | Art. 20 | Receive personal data in a structured, commonly used, machine-readable format | Contact DPO |
| **Right to Object** | Art. 21 | Object to processing based on legitimate interest or for direct marketing | Contact DPO |
| **Rights Related to Automated Decisions** | Art. 22 | Not be subject to decisions based solely on automated processing | Contact DPO |

**Response Time:** Requests will be acknowledged within 72 hours and fulfilled within one month, extendable by two months for complex requests (with notification to the data subject).

---

## 8. Cross-Border Transfers

| **Processing Activity** | **Transfer** | **Safeguards** |
|---|---|---|
| User Account Management | No transfer | N/A |
| Sales & POS Transactions | No transfer | N/A |
| Inventory Management | No transfer | N/A |
| Cost Sheets & Financial Analysis | No transfer | N/A |
| Technical Logs & Security | Possible (Render.com) | DPA with Render.com; verify data residency settings |
| Cookies & Tracking | Possible (analytics provider) | Consent-based; DPA with analytics provider |
| AI/ML Processing | Yes (LLM API) | Standard Contractual Clauses (SCCs); DPA with AI provider; data minimization |

---

## 9. Data Retention Summary

```
12 months    |████████| Technical Logs, AI/ML Processing, Cookies
 1 year      |████████████████████| Cookies (preferences)
 Contract+2y |████████████████████████████| User Accounts, Inventory
 5 years     |████████████████████████████████████████████| Cost Sheets & Analysis
 6 years     |████████████████████████████████████████████████████| Sales & POS
             0        1        2        3        4        5        6  (years)
```

**Retention Principles:**
- Data is retained only for as long as necessary for the specified purpose
- Automated deletion processes are implemented where feasible
- Fiscal records (Sales & POS) are retained for the legally mandated 6-year period regardless of account deletion
- Upon contract termination, data is anonymized or deleted within 30 days after the applicable retention period expires

---

## 10. Document Control

| **Version** | **Date** | **Author** | **Changes** |
|---|---|---|---|
| 1.0 | 2025-01-24 | CostPro Team | Initial ROPA creation covering 7 processing activities |

---

## 11. Approval

| **Role** | **Name** | **Signature** | **Date** |
|---|---|---|---|
| Data Protection Officer | DPO | privacidad@costpro.app | 2025-01-24 |
| Controller Representative | CostPro Team | — | 2025-01-24 |
