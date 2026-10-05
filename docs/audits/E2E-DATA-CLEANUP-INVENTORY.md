# E2E DATA CLEANUP — INVENTARIO PRE-ELIMINACIÓN (FASE 5)

> **Artefacto de la tarea "Limpieza definitiva de datos E2E + política
> anti-contaminación de Supabase".** Generado por
> `scripts/classify-e2e-data.cjs` (fuera del repo) el 2026-10-05T03:03:09.597Z.
>
> **Regla de oro:** SOLO se eliminan entidades clasificadas **C — E2E
> RESIDUAL** con evidencia documentada. Las clasificadas **A (protegidas)**,
> **B (reales)** y **D (indeterminadas)** NO se tocan.

## Resumen ejecutivo

```text
TIENDAS
------------------------
Total encontradas: 2586
Protegidas (A): 3
Reales adicionales (B): 0
E2E residuales (C): 2577
Indeterminadas (D): 6

USUARIOS
------------------------
Total encontrados (auth.users): 386
Protegidos (A): 8
Reales adicionales (B): 3
E2E residuales (C): 359
Indeterminados (D): 16
(auth.users sin profile: 2 — ambos clasificados D)
```

⚠️ Nota: el proyecto Supabase estaba **recibiendo contaminación EN VIVO**
durante el inventario (el job E2E de CI corre en cada push/PR a main): las
tiendas pasaron de 2532 → 2586 durante la auditoría. El conteo final se
reconcilia tras la limpieza y el fix de causa raíz.

## TIENDAS PROTEGIDAS (A) — identidad exacta resuelta

| store_id | name | slug | is_active | creada | Evidencia de identidad |
|---|---|---|---|---|---|
| `d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576` | TIENDA CENTRAL COSTPRO | tienda-central-costpro | true | 2026-02-09 | Autorizada por el usuario; id resuelto por búsqueda ILIKE sobre todas las variantes de nombre |
| `43a4dabc-b8b4-4b66-82b3-0c75335ca5d1` | Puerto Padre VITALLCONS | puerto-padre-vitallcons | true | 2026-06-24 | Autorizada por el usuario; id resuelto por búsqueda ILIKE sobre todas las variantes de nombre |
| `5e6fe821-5465-48b1-b3f1-3aa3182edc38` | ENERVIDA-VITALLCONS | enervida-vitallcons | true | 2026-07-04 | Autorizada por el usuario; id resuelto por búsqueda ILIKE sobre todas las variantes de nombre |

**"Tienda A" y "Tienda B" NO EXISTEN** en `stores` (verificado con
ILIKE '%tienda a%' / '%tienda b%'): no se crean identidades arbitrarias ni se
fuerza correspondencia. La lista protegida efectiva es de 3 tiendas.

## USUARIOS PROTEGIDOS (A)

| user_id (auth.users.id = profiles.id) | email | full_name | role | memberships |
|---|---|---|---|---|
| `c3333333-3333-3333-3333-333333333333` | cajero@demo.com | Cajero Demo | clerk | 1 |
| `b4444444-4444-4444-4444-444444444444` | almacen@demo.com | Almacen Demo | warehouse | 1 |
| `e2222222-2222-2222-2222-222222222222` | encargado@demo.com | Encargado Demo | encargado | 1 |
| `a1111111-1111-1111-1111-111111111111` | admin@demo.com | Admin Demo | admin | 32 |
| `d5555555-5555-5555-5555-555555555555` | costo@demo.com | Costo Demo | costo | 1 |
| `8c90b7b8-3e6a-449e-84e0-ac19ff6c3945` | adrianpompasantana@gmail.com | adrianpompasantana | costo | 1 |
| `051c6157-600b-425e-b8c0-72388bacf541` | admin@costpro.com | Admin CostPro | admin | 1770 |
| `28ebdfa1-f012-4de3-b5da-137ae9b764c9` | belkis9999@gmail.com | Belkis | encargado | 2 |

## USUARIOS REALES (B) — conservados

| user_id | email | full_name | Evidencia |
|---|---|---|---|
| `03524340-a81c-4273-94c5-ef9f3da9d340` | tery201194@gmail.com | Eliannis Santi | Email personal (gmail) + last_sign_in 2026-07-17 |
| `40b264b3-dcff-48c3-86db-abf8d5e268e3` | ronaldoguerra984@gmail.com | Ronaldo Guerra | Email personal (gmail) + last_sign_in 2026-07-28 |
| `6b0aac3b-5ff4-40d4-9ffb-223832c7ed58` | juanmanuelcabreravargas@gmail.com | JUAN MANUEL CABRERA VARGAS | Email personal (gmail) + last_sign_in 2026-09-16 |

## TIENDAS — D INDETERMINADAS (NO se eliminan; requieren confirmación humana)

| store_id | name | Motivo |
|---|---|---|
| `11111111-1111-1111-1111-111111111111` | `Tienda Auditor` | Sin patrón E2E y sin evidencia de negocio real concluyente ('Tienda Auditor', creada 2026-06-19, activa=false, archivada=true, 5 productos, 0 transacciones) — requiere confirmación humana. |
| `2ef293a3-23b4-4816-aa2b-9752627a1175` | `No Address` | Nombre vacío/basura sin patrón E2E concluyente ('No Address') — creada 2026-07-13 por admin@costpro.com; archivada=true. Se reporta, no se elimina. |
| `2dabe459-4b37-4be2-b8f4-d102047cc18a` | `   ` | Nombre vacío/basura sin patrón E2E concluyente ('   ') — creada 2026-07-13 por admin@costpro.com; archivada=true. Se reporta, no se elimina. |
| `dcfd74bf-ebfa-4630-b532-ebbd4c5b42a2` | `Store Tenant 2` | Sin patrón E2E y sin evidencia de negocio real concluyente ('Store Tenant 2', creada 2026-08-06, activa=false, archivada=true, 1 productos, 0 transacciones) — requiere confirmación humana. |
| `a5b81cbf-8ffc-4525-8ac4-f2ec92b912d2` | `QA-H1-A` | Sin patrón E2E y sin evidencia de negocio real concluyente ('QA-H1-A', creada 2026-10-04, activa=true, archivada=false, 2 productos, 349 transacciones) — requiere confirmación humana. |
| `b9cfacda-3731-47a2-8588-f524c6ec3456` | `QA-H1-B` | Sin patrón E2E y sin evidencia de negocio real concluyente ('QA-H1-B', creada 2026-10-04, activa=true, archivada=false, 1 productos, 20 transacciones) — requiere confirmación humana. |

## USUARIOS — D INDETERMINADOS (NO se eliminan)

| user_id | email | Motivo |
|---|---|---|
| `d9ad29df-ba36-488c-b912-6e4cd3371dee` | `auditor@costpro.test` | Patrón no atribuible inequívocamente al repo ('auditor@costpro.test') — posible prueba manual externa o cuenta anonimizada; NO se elimina sin confirmación. |
| `f5fa6d11-61a8-41eb-9e09-f5ce0d1da83d` | `f243he2en2ejpm@uberip.com` | Patrón no atribuible inequívocamente al repo ('%@uberip.com') — posible prueba manual externa o cuenta anonimizada; NO se elimina sin confirmación. |
| `0a9e3d54-7729-4e5c-ab7d-7e7f57106292` | `f244ab40u9o0m@uberip.com` | Patrón no atribuible inequívocamente al repo ('%@uberip.com') — posible prueba manual externa o cuenta anonimizada; NO se elimina sin confirmación. |
| `bfcbc06d-1bd7-4a43-916f-0a4891c169a0` | `f244zxe5gmk@uberip.com` | Patrón no atribuible inequívocamente al repo ('%@uberip.com') — posible prueba manual externa o cuenta anonimizada; NO se elimina sin confirmación. |
| `ccff0c17-b436-4ecc-95dd-a53bdfe051d2` | `f244bc7klbb6p@uberip.com` | Patrón no atribuible inequívocamente al repo ('%@uberip.com') — posible prueba manual externa o cuenta anonimizada; NO se elimina sin confirmación. |
| `a491c932-1c4e-491f-a006-093b692b7c5e` | `f244beh00he8i@uberip.com` | Patrón no atribuible inequívocamente al repo ('%@uberip.com') — posible prueba manual externa o cuenta anonimizada; NO se elimina sin confirmación. |
| `4ac61783-a99c-46ab-ae3f-5e110471cb39` | `g3g3af38ck3v6@uberip.com` | Patrón no atribuible inequívocamente al repo ('%@uberip.com') — posible prueba manual externa o cuenta anonimizada; NO se elimina sin confirmación. |
| `db311037-7527-4647-9ecf-1d1ef0813520` | `g3g3b4isid7xo@uberip.com` | Patrón no atribuible inequívocamente al repo ('%@uberip.com') — posible prueba manual externa o cuenta anonimizada; NO se elimina sin confirmación. |
| `ca0f16d1-f067-4b2d-9126-396e06dc36d4` | `f246empresa01@uberip.com` | Patrón no atribuible inequívocamente al repo ('%@uberip.com') — posible prueba manual externa o cuenta anonimizada; NO se elimina sin confirmación. |
| `819fdf44-568e-4e84-8ba9-4c3a590461fb` | `qa-acc-center@costpro.test` | Patrón no atribuible inequívocamente al repo ('qa-acc-center@%') — posible prueba manual externa o cuenta anonimizada; NO se elimina sin confirmación. |
| `5554101c-25a4-4694-b59f-bd8712b87f80` | `qa-nav-defaults@costpro.test` | Patrón no atribuible inequívocamente al repo ('qa-nav-defaults@%') — posible prueba manual externa o cuenta anonimizada; NO se elimina sin confirmación. |
| `6eb29691-d253-4e03-b593-2b0cdd1415bc` | `qa.h1.a@costpro.test` | Patrón no atribuible inequívocamente al repo ('qa.h1.%@costpro.test') — posible prueba manual externa o cuenta anonimizada; NO se elimina sin confirmación. |
| `8b04b1a9-80c3-444e-952b-6b0256155d65` | `qa.h1.b@costpro.test` | Patrón no atribuible inequívocamente al repo ('qa.h1.%@costpro.test') — posible prueba manual externa o cuenta anonimizada; NO se elimina sin confirmación. |
| `a4c8c759-bbf8-48ab-a45a-24c0ead4f3fc` | `qa.h1.sup@costpro.test` | Patrón no atribuible inequívocamente al repo ('qa.h1.%@costpro.test') — posible prueba manual externa o cuenta anonimizada; NO se elimina sin confirmación. |
| `db818264-0525-4c25-80f6-b00b7ef74415` | `qa.h1.enc@costpro.test` | Patrón no atribuible inequívocamente al repo ('qa.h1.%@costpro.test') — posible prueba manual externa o cuenta anonimizada; NO se elimina sin confirmación. |
| `c0000000-0000-0000-0000-00000000000c` | `user_c@tenant_b.com` | Patrón no atribuible inequívocamente al repo ('user_c@tenant_b.com') — posible prueba manual externa o cuenta anonimizada; NO se elimina sin confirmación. |

## TIENDAS — C E2E RESIDUALES (2577) por patrón

Criterio de clasificación (documentado): el nombre coincide con un patrón
inequívoco de prueba Y está corroborado por al menos una de: creador usuario
test / tenant de run E2E / ventana temporal de ejecución E2E / archivado por
barridos de higiene. **El nombre nunca es el único criterio.**

| Patrón | Cantidad |
|---|---|
| E2E-<otros> / Updated Name E2E | 2411 |
| TEST-* / Test Store* | 4 |
| HOT <suite> <timestamp> (hot-path tests) | 27 |
| AUDIT F4E1 STORE <hex> | 2 |
| REM-F4-06dR FIXTURE | 2 |
| FASE-D TEST FASED<ts> | 2 |
| ESEC TEST ESEC<ts> | 3 |
| E2E PILOT A/B CostPro <run-id> (run-env.ts) | 103 |
| E2E Tienda <n> | 23 |

### Detalle por tienda (id · nombre · creada · archivada · tenant · memberships · productos · transacciones)

**E2E-<otros> / Updated Name E2E** (2411):

```text
7aedc55d-f7e8-4938-8d98-8330c358e8d9 | E2E Extra extra-mrioqepf                             | 2026-07-13 | arch | Default Tenant | m=1 p=0 t=0
2f69abc4-2fe1-425c-8cbb-3ccdb7136645 | E2E Slug Sanitize mrioqg7v                           | 2026-07-13 | arch | Default Tenant | m=1 p=0 t=0
45f46ded-bd3f-4659-848d-cb0cd9cec1d8 | E2E Multi mrip2zpuztfw                               | 2026-07-13 | arch | Default Tenant | m=1 p=0 t=0
4bcb61e4-be93-44cd-ba10-a54d771cd393 | E2E No Addr noaddr-mrip32ho                          | 2026-07-13 | arch | Default Tenant | m=1 p=0 t=0
85a2cba5-09b2-4b14-9051-4bff31892f25 | E2E Multi dup-mrip3468                               | 2026-07-13 | arch | Default Tenant | m=1 p=0 t=0
fa2c0fe5-d4b8-4a3d-929a-0c9ee8363000 | E2E Multi arch-mrip86q3                              | 2026-07-13 | arch | Default Tenant | m=1 p=0 t=0
e1ede2fd-e7d3-4fc0-ba1f-476633c5591a | E2E2-ALPHA                                           | 2026-09-10 | arch | NULL | m=3 p=10 t=52
60896157-6b0a-439c-833f-3d55d64456ba | E2E2-BETA                                            | 2026-09-10 | arch | NULL | m=2 p=5 t=17
170416cf-89b3-48e4-8e27-ab7a85198a12 | E2E80 POS mujbwssctwo2                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
25e8c6d6-d0ff-4864-9d4a-fc374009cab4 | E2E80 Probe Store                                    | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
40d34801-9a17-4ab7-9eb7-5e878e4b1ba7 | E2E80 POS mujbzld25w6y                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
f6aeb507-9804-47a3-89c7-a6e671d3457a | E2E80 POS mujc01h9kzh1                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=3
2050fd3c-80ac-48fc-bdb2-9083e0ee7936 | E2E80 Probe RPC                                      | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
9af6d066-6dd6-4bc4-ba90-5b9d72ca2bdd | E2E80 DBG mujc4burttla                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
719eedf7-b02c-46be-b3e4-4e651baf3899 | E2E80 DBG mujc66dr526q                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
60680e18-42be-437a-b304-56ad423a49b3 | E2E80 POS mujc8kqh85k6                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=3
8dd969db-7856-4320-84da-83a03f310e38 | E2E80 POS mujcc2bk8gwg                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=3
225afbad-c942-4636-985f-276266d02235 | E2E80 DBG2 mujcdugqlrmm                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
eb80af2e-898d-4451-a466-3e909646c099 | E2E80 DBG3 mujcf4jk4yu8                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
dfd18180-cc95-4c39-bdf1-9f97d2ab5bb5 | E2E80 POS mujcfxax4wlm                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=4
6c0e5acf-7081-4f4d-aa71-ce5be1f4fde0 | E2E80 INV mujcl1283c1b                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
62adfbc7-9fe9-444e-ba01-69a3f99e8804 | E2E80 INV mujcldk1k6w4                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
46170154-0c57-4a05-bf64-92c35ba2ef75 | E2E80 INV-UI mujclga39jv6                            | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
9a334817-f0c0-4bba-9846-e28c5a75e336 | E2E80 EnumProbe                                      | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
d6669383-59af-4a49-be39-b1398ab01509 | E2E80 INV mujcpq9xvsoa                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
e5af9a38-9904-49cd-b9d6-7a457a5e2d8b | E2E80 INV-UI mujcpzmukl30                            | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
12d908e5-86a5-44e6-a14c-890424d4a500 | E2E80 DBG4 mujcrn2hsm24                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
eebbbebc-90a5-497d-9201-2197b4318bd7 | E2E80 INV mujcsvmhtncx                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
8c82c84d-ec65-4fec-aaf0-f5328f4e5c6a | E2E80 INV mujcu0u6e1m5                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
96629074-97b6-4a17-a0be-1ed17807470a | E2E80 INV-UI mujcub112zfs                            | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
d10201dc-6278-403c-a70a-48e166571992 | E2E80 DBG5 mujcvntwgc73                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
402a6214-bb6b-43ac-aae6-3d61b1c5a147 | E2E80 INV mujcyniml3o8                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
c3cad282-bf91-4191-8408-732c87bbab82 | E2E80 INV-UI mujcyxf1hy2i                            | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
4cc06f18-488a-46d9-b334-5f838a7ecc7e | E2E80 DBG6 mujd09k2ud9n                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
ee19274c-f6eb-41f0-bbe5-53fd9ab7bc89 | E2E80 DBG6 mujd18eh3uvx                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
2e5aeff7-d644-471f-8794-dc52779abc8f | E2E80 INV mujd22dlaoz8                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
8331cf4e-3a76-49d3-a17f-e16288ffae28 | E2E80 INV-UI mujd2hsgded8                            | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
fb1c8f0f-da6e-4961-be69-b0ef3801f63c | E2E80 TRA mujd3y9uf6da                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=1
0d53b673-fbfb-4fba-80c0-ff8f9e67c106 | E2E80 TRB mujd404avppo                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
4469fa9e-aad7-4d8e-8906-2e81895f80e6 | E2E80 TRA mujd4qgb2yvk                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=1
ef341639-e525-4045-88ad-5b3203828aca | E2E80 TRB mujd4rx86he9                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
6ad5bb6f-3017-4610-a365-27e9c94223cc | E2E80 TRA mujd8061k2s9                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
f3d7fa0f-0c47-4fcd-af23-4531b828b4f6 | E2E80 TRB mujd81plrzys                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
d4ca7a94-3a31-458a-a044-20e00d9a0962 | E2E80 DEV mujd93fhjdp1                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=1
3acb0faa-0ed6-4dd7-918c-3c338c13dda6 | E2E80 REV mujd9bsqlju7                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=4
10a3142a-1989-4040-932f-f4e18469b1db | E2E80 RevDup Probe                                   | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
2e0312fc-4f37-4b66-a699-79a696e0706a | E2E80 RevDup2                                        | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
7a74af1d-6091-4d96-b891-5ffcdcc80bad | E2E80 DEV mujdc48s5gql                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=1
f1c360e8-9c3e-4432-aaf7-d022f6a46b90 | E2E80 REV mujdcdv9noa4                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=4
ffd71ff9-4956-46e9-9ee0-115a97586a41 | E2E80 RBAC mujdeu5f7zc9                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
87c59c54-dcb0-4026-a7f9-610fc3fbf8e1 | E2E80 RBAC mujdgv3j55ou                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
84a828fe-7a02-42f3-8dac-256b7ef8ab6d | E2E Multi mujdqxab3hyv                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
4ecdd019-7d2c-4ee4-a65a-ccb5d6ebfb01 | E2E No Addr noaddr-mujdr06j                          | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
44c8d15a-573d-4784-bf0f-6590b423ba8e | E2E Multi dup-mujdr1tb                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
57e5b6af-ee03-41c1-b484-e7d99fd15c70 | E2E Extra extra-mujdsh79                             | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
5fd02fce-e6f2-4f50-991d-e0aeac4a3d8f | E2E Slug Sanitize mujdsiah                           | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
35ca10a7-b113-48e3-9008-c97a979e6a8b | E2E80 CASH mujejykldwqo                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=1
10acb38c-1f00-44a2-b05c-b3b38de94bf5 | E2E80 CASH mujek8cjgm5t                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=1
e7addb9c-bdf1-4f3d-bf4c-3e8607ea0c24 | E2E80 CASH mujekfwby8ro                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=1
70271f28-8186-4c9c-9835-f569f70d2ba4 | E2E80 CAT mujekt7be01f                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
009984a1-ce64-4864-bdea-21e226aac5d2 | E2E80 PRD mujemgtezqgz                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
21797265-9d71-4415-8bbf-962ce631e391 | E2E80 PO mujemo8tqunk                                | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
4da5c67b-6ed8-4c05-87d0-8246e3447b4e | E2E80 PO mujemuklsyjv                                | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
25bf506d-fa50-4f62-9ffe-4cc11f338975 | E2E80 PO mujen1lje85w                                | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
8ccea015-a968-4b20-8ab2-d214eb4e887c | E2E80 CashProbe3                                     | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
29dc622b-16c6-4b58-be0c-64ed20d5528e | E2E80 POProbe2                                       | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
c3111f45-3fb6-4d81-95b5-b3c555b4a902 | E2E80 CASH mujerkpwodgx                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=1
ddd2b666-1bae-4577-8e8a-eda7d0d8c57e | E2E80 CASH mujert34232m                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=1
6e3e4410-a112-4ae0-9040-61555c2bce6a | E2E80 CASH mujes0t1du0k                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=1
7818f555-cd3d-4b7a-b33c-7c6287f2a17a | E2E80 PO mujes7ocke52                                | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
0e3c5979-47c4-471b-826b-e7f4fac7c80d | E2E80 PO mujese9g88az                                | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
57d3287a-0c44-48c3-b40f-cd71ad0c9556 | E2E80 PO mujesll7ht18                                | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
34cfbe4b-f5b8-4bcd-8ec2-2a55011bbcb2 | E2E80 CASH mujeu6q3g28y                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=1
6c8a81a4-f632-4fc6-9eba-65f9d1d32fc4 | E2E80 CASH mujeufgaexaa                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=1
bfcdd5ac-d27b-493c-8347-3a5c9e83a744 | E2E80 CASH mujeun2gtbio                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=1
663a75fd-9f80-4099-8ecd-80c06f75f413 | E2E80 CASH mujev64ds8p5                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=1
63588b6f-08e2-495c-b445-27fd86f8ffd9 | E2E80 PO mujew3ebrjyk                                | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
409ad665-fa3c-4de4-a886-c802bdebbb8c | E2E80 CAT mujewshudmj3                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
4aef0753-b2d2-4592-af81-a966a1c58d67 | E2E80 PRD mujexu97fuq4                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
53040a52-a109-423a-b537-258924751cb4 | E2E80 CASH mujf22vsfmzo                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=1
dd907147-b751-4b24-8ac3-71cf248be005 | E2E80 CAT mujf2cfz13wn                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
34471b52-3d5c-4c3f-bd14-a65d96af7eef | E2E80 DEV mujf3f8dceux                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=1
03b00ecc-0648-4cec-99d9-61da2cec128d | E2E80 INV mujf3prozu0u                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
cac0d114-a5b9-4452-85e7-22c4e46d18d6 | E2E80 INV-UI mujf3zrdp011                            | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
7276e33a-8a52-4afd-8537-3bd604294298 | E2E80 POS mujf4f1jox4g                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=4
2d8237be-1493-4385-af9f-df004a790dbf | E2E80 PRD mujf52ugkt61                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
e8ee2eea-b7cb-4dff-8a02-ce0a305bd441 | E2E80 PO mujf59xzl5r3                                | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
a79b9431-1ff4-4864-8d35-ab4b6544a658 | E2E80 REV mujf5ie07pfk                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=4
0530cf95-5d45-4c81-b5b4-868f06b7c000 | E2E80 RBAC mujf61lflmnf                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
876ab43c-7bd2-438c-995c-d5d85fd6497b | E2E80 TRA mujf6gogh1yn                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
1fd1500f-38d7-4d54-9355-fb265b5bd573 | E2E80 TRB mujf6j5n63uj                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
66f41ba9-84b3-4854-bcf9-cf79303487f4 | E2E80 CASH mujg1gwofkot                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=1
f2080b66-608b-4c10-894f-b7279227abed | E2E80 CAT mujg1qgy4dys                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
7ed5dfaa-69fb-4296-8307-1031e9c10a5b | E2E80 DEV mujg2rjwurkr                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=1
91ce525d-fc7c-4cdc-b652-8308a620e48f | E2E80 INV mujg30yjwjl6                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
ce802826-999e-4b28-a343-73137d481c62 | E2E80 INV-UI mujg3bfu7tri                            | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
cefa4460-c912-495b-8c05-f7dd8efed0c2 | E2E80 POS mujg3rih87ub                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=4
e672cf5d-2bc9-447d-b984-a6164d050813 | E2E80 PRD mujg4e5w8c2q                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
9566e5d1-4386-436f-ad81-ea001c573487 | E2E80 PO mujg4kixtoa4                                | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
db437859-96c5-414d-b2df-516a8e86cb90 | E2E80 REV mujg4t0ov21w                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=4
23b484f9-8354-4ab2-a067-4edd38b4906a | E2E80 RBAC mujg5a4jeu3y                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
cf564cf1-dfb4-49ee-b189-ac43031dc3ae | E2E80 TRA mujg5p8sl2ks                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
7ccb1b8d-e4e3-4b46-a349-460ba2d6e2bc | E2E80 TRB mujg5rxqx3n8                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
caae39a9-028a-4934-968b-96678bbac52e | E2E80 DEV mujgjvu47dif                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=1
24a5bc76-f041-4cea-bda7-adb159a534ec | E2E80 INV mujgk6upqew2                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
577792d0-2ec3-4224-bca2-df5a253bac6a | E2E80 INV-UI mujgkhcwelu3                            | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
cc5d3cd6-6c2d-4972-a2ab-e22134e68889 | E2E80 POS mujgkwu08ozu                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=4
61c6ec4a-e84f-4163-b313-363632d4c6e4 | E2E80 REV mujglkurm5iw                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=4
8bb4f07f-d6e5-49ee-9f70-953b3a05c149 | E2E80 RBAC mujgm0zwm8la                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
9f261457-51e5-4cc7-92d1-4cd23f2a57e2 | E2E80 TRA mujgmg1uxt8h                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
dc1a88c9-76ea-448e-8683-4ef3c4f04187 | E2E80 TRB mujgminqt3c3                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
a6e5bc1a-1df6-4188-ada1-ba096a3b3f3b | E2E80 CASH mujh6azi3bvg                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=1
b7a46fe0-ad40-4d7a-bff0-074439827424 | E2E80 CAT mujh6kzul6se                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
8059fdf8-1c49-4138-ab92-8a24bb22827a | E2E80 DEV mujh7lyldszi                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=1
411cde61-8f75-48ed-9d9a-c2770dd1b404 | E2E80 INV mujh7wav68kz                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
79db0c7a-dbc8-4337-8edb-818cc74ac227 | E2E80 INV-UI mujh869ddpqg                            | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
9c12b091-0648-4abc-a9a0-c62c8855d41a | E2E80 POS mujh8nrd4p28                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=4
d19ad1bd-a9e5-4ebe-af51-1dc0f42f67bb | E2E80 PRD mujh9bnm9vaj                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
fe71625b-2c7b-47c6-b943-64f548c76078 | E2E80 PO mujh9iehz768                                | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
9357ba8b-45cd-4703-96e6-772bc15c39f4 | E2E80 REV mujh9qw78ju1                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=4
2db35a9e-e140-4f38-88c4-6a093cd1398b | E2E80 RBAC mujha8bmhulv                              | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
aa30b4c5-11e9-4e79-b27d-8f25e558274a | E2E80 TRA mujhanmz68el                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
2afe2f8d-1cc0-4aed-9acd-550340db1df8 | E2E80 TRB mujhaqdy3m0i                               | 2026-09-27 | arch | Default Tenant | m=1 p=1 t=0
19e176c3-dbc7-4959-8e7a-8dbce1c38028 | E2E Multi mujhrqr2jxfn                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
107d15a1-80df-4e9b-96cb-1cb57191db2c | E2E No Addr noaddr-mujhrtyb                          | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
211a7fe2-1312-4e31-a422-1fa5244f5204 | E2E Multi dup-mujhrvvh                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
b95226f6-ea7b-4e1a-94d0-79a557b36d6c | E2E Extra extra-mujhtap6                             | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
e41d1a70-c7a0-4132-9e59-949fcc227e6b | E2E Slug Sanitize mujhtbzn                           | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
9518612b-71fd-482b-a6e3-91da5451f308 | E2E Multi mujjuvsdxcih                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
504cff54-4669-4a19-8fe1-5c09268413fe | E2E No Addr noaddr-mujjuywf                          | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
e919ad26-e70d-4cb6-99a7-e264b23039e4 | E2E Multi dup-mujjv0md                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
81d42071-8b82-497d-a091-96d828237259 | E2E Extra extra-mujjwghs                             | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
da8926c4-09c0-43da-8eb9-9bbb66d02e7f | E2E Slug Sanitize mujjwhld                           | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
404cf7f0-d06a-49b7-8a0d-b44f5fc43274 | E2E80 POS muk308l5xzlc                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=0
391a58a6-bdb3-4ccc-962b-c2c331de43c2 | E2E80 POS muk31c65kcs2                               | 2026-09-27 | arch | Default Tenant | m=1 p=0 t=1
dbfe8d6d-af03-4e51-a5ca-4723a56583f5 | E2E80 TRA muluwoq700yh                               | 2026-09-28 | arch | Default Tenant | m=1 p=1 t=0
7b6384ec-d70f-4b76-8ddd-ec61eccc4ad1 | E2E80 TRB muluwsgrs8rp                               | 2026-09-28 | arch | Default Tenant | m=1 p=1 t=0
d06ef096-15de-40f0-94cf-7e9fb49c089c | E2E80 TRA mulv8r2vi0i2                               | 2026-09-28 | arch | Default Tenant | m=1 p=1 t=0
ba929abb-2f52-4b88-ad2c-f569109c8bce | E2E80 TRB mulv8u6nq4wl                               | 2026-09-28 | arch | Default Tenant | m=1 p=1 t=0
a2c1c1af-104d-4151-b419-8a62822e5e3c | E2E80 TRA mulvc5li0art                               | 2026-09-28 | arch | Default Tenant | m=1 p=1 t=0
d31aae17-99d3-424b-b25e-e48ed41c38cb | E2E80 TRB mulvc96imhxf                               | 2026-09-28 | arch | Default Tenant | m=1 p=1 t=0
df387bf8-ba0d-4b65-ab07-29b2279733df | E2E80 TRA mulvcu10h8r8                               | 2026-09-28 | arch | Default Tenant | m=1 p=1 t=0
4ae7f36e-fdf0-4f05-82da-daaa7d73df6a | E2E80 TRB mulvcxrgw59i                               | 2026-09-28 | arch | Default Tenant | m=1 p=1 t=0
367cdede-c360-41f5-b038-cbfdddc8f2a7 | E2E80 CASH muly8ruzo0cc                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
59560578-56a8-4c19-b25b-10141546df5a | E2E80 CAT muly984dgmlw                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
1b7e34d5-2097-484e-949d-34fff9523a7b | E2E80 CAT muly9gzihlzu                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
3ec5fe1f-c534-48f5-ae25-39e2fee765bc | E2E80 DEV muly9pu562p9                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
2fda5f52-c36a-43af-8ed2-bebbc13af2f7 | E2E80 INV mulya0860f8b                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
882252a5-151e-40d3-bce4-0b83d852a337 | E2E80 POS mulyag005688                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=2
81692580-1fcf-4f5f-98a1-e17dd085f713 | E2E80 POS mulyay7se8ft                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
e2f5ea0a-1bec-4033-be52-e07fc7217e01 | E2E80 PRD mulyb6p0469x                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
4fdc24f9-63c9-4391-a189-af953ecb7df8 | E2E80 PO mulybo6f31si                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
799b69f8-7a8c-4c37-9980-9886a9edb35e | E2E80 REV mulycuw8jkap                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=3
856e27b3-2a5a-476b-80ff-1c53e41615e9 | E2E80 CASH mulyd6elwqsj                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
305ffd41-56d6-4517-8544-4a78a10916d5 | E2E80 CAT mulydrdzjgvz                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
4efb3adb-997c-42d4-b28e-2a029153986d | E2E80 RBAC mulyf5813d11                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
c87b2d41-fbe4-483a-ba5a-29740503d589 | E2E80 DEV mulyflzpbn5u                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
78102ff6-40a7-4986-8f5e-3831f6adad9d | E2E80 RBAC mulyfops96rf                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
24f5272b-9237-4e21-8140-a5cacb4e29eb | E2E80 DEV mulyg5sfydi8                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
edbd92ca-71f9-48cc-92a6-b6d937f952b8 | E2E80 TRA mulygatebbfz                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
71007b65-824f-48e2-b824-21895363fac7 | E2E80 TRB mulygfqvfde8                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
41503a80-ccbd-4657-961f-ed08cade11b8 | E2E80 DEV mulygj8x6mnc                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
a772f2dd-632c-41b1-b986-09d62ff80269 | E2E80 DEV mulyhjxhmw3g                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
e38f50f2-aaf4-4be1-a97e-a1750d05ae4d | E2E80 DEV mulyi7yy3c49                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
48cf5da1-ca4b-4dba-8265-8062ccd396e7 | E2E80 DEV mulyix3hsgud                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
c6f4b920-d5e4-4725-a9c7-9e7d24563e59 | E2E80 DEV mulyjkhjwq63                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
771ed3ad-6fd3-4611-8618-bdcd67c02083 | E2E80 DEV mulykvezntv0                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
2c8442cc-219a-494d-933e-96a7d525e677 | E2E80 CASH mulykw47ao12                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
9b5e3bce-8f46-4867-9b8d-bb8abfc95d0c | E2E80 INV mulyllphtedc                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
516e873d-c162-46e6-8200-c9982473d108 | E2E80 CAT mulylo3dirr2                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
0ed5f192-e9d8-4e15-a470-ebe0267a5dd8 | E2E80 CAT mulynmzcet6d                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
772cdbc2-29df-4f87-be4d-e9328147bd4b | E2E80 INV-UI mulynqtiwjrc                            | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
618fdd0c-e89c-4030-9eb7-e4f6510aea91 | E2E80 POS mulyo6e684bt                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=2
dee94181-2e7f-409f-a75f-c13aab2ad3a0 | E2E80 CASH mulyoi5rma7x                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
65954511-61d7-4478-b0a2-cdd28b2b6631 | E2E80 CAT mulyp5kw4l94                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
4db5e157-c341-499a-8b7c-96e3745c356d | E2E80 DEV mulyp66gtl55                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
afe9f043-9544-4155-b44c-0cda61fe9fb9 | E2E80 CAT mulyp7nd5ev6                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
a7b89c68-ef92-4c6b-bdde-a9346870ffa7 | E2E80 DEV mulypfjgssvo                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
cb618856-0135-4846-ae46-3950b228f041 | E2E80 PO mulyqlxn0rls                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
ff4207d9-1eae-4378-861e-f31a4b270482 | E2E80 INV mulyqq66j5eu                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
c0ef4a50-a48a-407d-a7e7-5a994797d23a | E2E80 DEV mulyr0xrwvlp                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
85c41d5d-c439-4027-8832-e50d37a0cf25 | E2E80 INV mulys00daxdl                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
e9bae669-4ae7-4664-965b-341a57f3b4ad | E2E80 REV mulys3j5r2xp                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
5d01e4d8-a3f3-496c-957e-f18d438f69f4 | E2E80 INV mulytb4tocib                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
2d0ecfb3-c992-49e3-8219-74c0a32c4a52 | E2E80 INV mulytqwztjr5                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
59c8a9e1-b1d6-4a3b-a1b5-c07070d6ad06 | E2E80 INV-UI mulytr1sr1ny                            | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
bcd4798e-21bf-48f3-8c96-dd22ed779d7c | E2E80 REV mulyu7ob2k0o                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=3
5f324621-0129-4585-bce9-885df35d61c4 | E2E80 INV-UI mulyujjrre4y                            | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
f2d321b8-333c-453e-a124-f0b8b2cf1f6f | E2E80 POS mulyuls1wqf8                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=2
a7d3bfaa-406b-405d-89e0-ef06f80f2ef3 | E2E80 POS mulyvbjtwa9g                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=2
1c5e8274-8bc1-43a1-b978-e7fb41e13703 | E2E80 INV-UI mulyvv01aujj                            | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
e3f9143c-9c6d-44d4-b268-e723e5932c28 | E2E80 RBAC mulyvuiryqsu                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
c1ddb9c1-d62f-413d-a145-750b96c6f53e | E2E80 POS mulyw2pp69fn                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
4ca35cd5-9d2c-48b1-9c13-9f0bf653c3b5 | E2E80 POS mulywoo124ae                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=2
d40ab995-c238-40c6-8311-89a0be993b7f | E2E80 POS mulywpkvpmn7                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
096a86cc-0099-44b5-88e7-a485c2876d79 | E2E80 POS mulywvpz2bz5                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
087810dd-a0e4-49fd-9872-520dcda26b73 | E2E80 TRA mulywwe6x5h2                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
dc2f4818-26b4-4d6c-82b9-e4c68ad5f266 | E2E80 POS mulyx37twytl                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
7821dd63-842e-4e5b-976f-ed2bf03b4323 | E2E80 TRA mulyx3mkgzlk                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
3ad4737d-468f-4d5e-8226-7f739d6b6f75 | E2E80 POS mulyx7avwn1p                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
efa19236-1025-4bcf-bd04-4fb2b312ecbe | E2E80 TRB mulyx6oi5gob                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
44762db9-e265-4399-a224-18143701d4bf | E2E80 PRD mulyxemftm1p                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
27d6eae9-af03-4653-8ea3-8779d15a46f3 | E2E80 PO mulyyj4oisi5                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
b5829fcd-e81d-4cca-b299-02d0d657c4fb | E2E80 PO mulyywcnq3kq                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
0cf95bd4-8ef5-46b3-9794-37271dc68a2e | E2E80 PRD mulyywxw6ol6                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
c3ffe9b9-0601-4724-b819-18c92ca4c9b3 | E2E80 REV mulyzlgeunv4                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
32b967a1-0082-457a-a45a-3b74f07acee3 | E2E80 PO mulyzx6tgdo5                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
b0711475-7be8-48d5-9601-e95fcf71357c | E2E80 REV mulz0q91mlav                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
6777288d-b7ac-4bf1-a269-399d5421cb2a | E2E80 RBAC mulz0s51veat                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
6334da97-cbf8-4d83-a51d-65107231b97f | E2E80 TRA mulz1hp5o3m0                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
c6f029b6-ffbd-4c65-ae2d-b6cf034800d8 | E2E80 TRB mulz1swln2df                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
f35381f4-398a-40a2-9e61-45ac7b3f74b6 | E2E80 RBAC mulz1v64cncm                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
efd5c6fc-02d7-4495-8eb1-975af52b3dd3 | E2E80 TRA mulz2ezk6i2h                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
60a87458-ca83-4d99-85ec-7eb346f413e7 | E2E80 TRB mulz2n4iekru                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
d85d1d8a-1940-4d46-ad2d-42f356cccdce | E2E80 REV mulzf8iicbjn                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
2dbc182a-ea93-4a96-be7d-8c1aa8418408 | E2E80 CASH mulzrmeinsnu                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
847006c4-0085-495a-b0df-e84a4a8b9c1f | E2E80 CAT mulzrx8eapfm                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
8f5e7dd9-da54-4463-aa28-11d7957ec223 | E2E80 DEV mulzt3pz6t4c                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
99ed7645-d0f9-4db0-b6e3-7d68548fbf4f | E2E80 INV mulzte7ymxfm                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
23a01867-717a-4272-a1de-9fc4c3cf44f2 | E2E80 INV-UI mulztpno095b                            | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
5127eb63-b4f0-433b-9a2a-22c93a7c3a65 | E2E80 POS mulzu5ozavaw                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=2
60fa3bb0-253d-43fc-996c-02c169c23113 | E2E80 POS mulzuk0pw1wk                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
6dc2f20a-b6f7-42a4-8e5b-924f204d97eb | E2E80 PRD mulzutbap7ln                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
a2732886-45db-435f-995a-43203d9f1a79 | E2E80 PO mulzv4qvieza                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
e7dbea84-1eb9-419f-869c-3c5152225ca0 | E2E80 REV mulzvfg32nnn                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
bf559a16-0504-46db-8376-e662518af0b0 | E2E80 RBAC mulzvw7zm4qu                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
1d1348e8-faff-48d7-a43e-cc6a5257ea30 | E2E80 TRA mulzwek4birx                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
39207aab-8c62-45e5-80f5-c272d9f6172c | E2E80 TRB mulzwj2jbhqz                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
c97af468-29aa-4bcc-af1e-f630146f2665 | E2E Multi mum0l7jtv4b9                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
0e50f4b2-a2e8-47c4-8a41-9cc4fb78cef1 | E2E No Addr noaddr-mum0lalv                          | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
0af1671c-30c8-4f55-9e7e-5eb367dc341e | E2E80 CASH mum0rkg9icbm                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
9eb2c3a7-bb0e-4156-a005-568db3ecb033 | E2E80 CAT mum0rptunrnx                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
b6f0e48f-8ddc-4f23-9b42-36f2f751d151 | E2E80 DEV mum0smueggmt                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
02756a6b-9b19-495c-945e-21e20d1b4fe1 | E2E80 DEV mum0srg0hftp                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
fffe0397-b79c-41b7-a93e-5169b6791c69 | E2E80 DEV mum0svb1nafr                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
e4a33eb6-aa21-4f84-b76d-09c4aa497cc5 | E2E80 DEV mum0t1iek2sy                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
227803a9-a381-4004-af5d-be2707bf6502 | E2E80 DEV mum0ta22fdma                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
02be3019-b86c-4627-8689-4642a41f2810 | E2E80 DEV mum0tpf8vzsd                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
fbba2549-f52e-4ce7-b4a1-7c43993a02c6 | E2E80 PO mum0tw0w17j3                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
fe1a054d-5990-4680-935f-524fed02d7fe | E2E80 INV mum0ujoso61t                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
891fe85a-a200-4f89-82c4-918bd4475d87 | E2E80 INV-UI mum0vjkbn5ut                            | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
70a5f5d0-f19e-40a1-bde8-d29e35775217 | E2E80 CASH mum0ytl5urzz                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
216832f9-4852-4ebf-abda-ec60b9880523 | E2E80 CAT mum0z8f2j3e7                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
a6d4153d-84ee-4d6e-ae1b-345ae155d03c | E2E80 DEV mum10bcq3383                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
e02e1e83-fd5d-4f7e-9a88-16b60ebd0e72 | E2E80 INV mum10oq9gijj                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
4bc1a395-e03b-47c9-9952-9e9ec20c3b8a | E2E80 INV-UI mum11176lcxx                            | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
4368822c-b862-4c27-ac47-b2198a4a01be | E2E80 POS mum11iy12f99                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=2
1f85b31f-39f5-485b-8e85-ee6769a80a74 | E2E80 POS mum1243bdwk9                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
71c48884-185b-4049-92b5-494923a7529a | E2E80 PRD mum12dyx3svw                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
07420f7d-6d58-4c5a-8d84-2c17e1e7bc09 | E2E80 PO mum12meb4frl                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
82af426b-2a44-4304-887c-d2ac50cb2d84 | E2E80 POS mum1axx4b6wt                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=2
6e81beeb-b358-4a46-ba6d-67711626bdd3 | E2E80 POS mum1bdxeuid1                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=2
23c96633-03a5-4520-b0c7-62a80e47547b | E2E Multi mum1c63zfmzw                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
23ab9c2e-4ed7-4f3e-9818-0006355ebf00 | E2E No Addr noaddr-mum1c9ah                          | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
75d60ea2-15a6-4cc1-a855-ee0a5daf7310 | E2E Multi dup-mum1cax4                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
1d39354d-14b7-41b2-ad71-b73ade73aceb | E2E Multi upd-mum1cdgq                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
5c8bc366-e1e4-4534-80a0-8371d2839b40 | E2E Extra extra-mum1dvbt                             | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
75784ee0-dfec-49ec-ba8b-8520ff0c43ba | E2E80 CASH mum20yzqk5s1                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
67211297-65a4-4172-b5f0-853a4b7d312b | E2E80 CAT mum21befir7m                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
beddca8c-9fb1-45ae-bb55-e3da90f61a06 | E2E80 DEV mum22cs6rzix                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
23d7f4a5-f337-42f1-bef6-ea143652bfd7 | E2E80 INV mum22r6b9frw                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
aadcb78b-33c2-4720-a34c-13f813a85739 | E2E80 INV-UI mum2369onjki                            | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
12f2818f-e7ff-4d5c-939a-d4baa9a87859 | E2E80 POS mum23ma942hw                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=2
d72ff92a-c002-4d83-b338-98589a8ab231 | E2E80 POS mum242183rvw                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=2
ef1fb2c7-a4e4-47f7-a45e-1026b6419cdf | E2E80 PRD mum24its9gek                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
3f4c420d-5d10-4736-a248-bf0016cee563 | E2E80 PO mum24q40yrrp                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
2878ee9e-3017-4f37-be66-193166566754 | E2E80 REV mum24ydocapb                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
e2858ee8-1e95-4ce2-ba66-cc887e4bd4dd | E2E80 RBAC mum25hacisd9                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
58000cdb-f30e-4a97-ba92-1113a92d9333 | E2E80 TRA mum261098lwv                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
f5bfc974-e298-462e-9530-36943ba74e7c | E2E80 TRB mum26417qfbb                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
b8ffe3d0-6fa7-48f8-83d9-4bb75a6ef884 | E2E Multi mum2abfhon7i                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
8896e1ac-419c-4988-9b73-e70d49eb3c66 | E2E No Addr noaddr-mum2ahf7                          | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
ec62d28f-d727-4275-a59e-4e59243a59c9 | E2E80 CASH mum3pk29l6u2                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
6cf4072a-c813-419a-b644-6bcd55235bd8 | E2E80 CAT mum3pr8ifoa0                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
8d94d75c-2912-4dff-8d58-8487dfb4ed46 | E2E80 DEV mum3qoqhgswq                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
8590bb46-7ace-4083-8cd4-1042d99a9350 | E2E80 DEV mum3r830kbo0                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
39ef97a5-3aae-43ab-ab62-cac3577392a1 | E2E80 DEV mum3riap9y74                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
6059b8ca-d82a-40ad-bcd1-9b60da93f06e | E2E80 DEV mum3rm6r3hz0                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
2975a62a-73c7-424b-a04d-1344ba2c71f0 | E2E80 DEV mum3rppbv3eh                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
dd71b065-b20a-48c0-9728-2c14bc9ea249 | E2E80 DEV mum3rt9wb3n5                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
bc276241-8803-491a-a8b3-3b6285c05ebd | E2E80 PO mum3sl8wxnu6                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
c4879acd-0445-44a8-806f-27233312f816 | E2E80 REV mum3sptcfqjp                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
44ef25bf-a83d-42c4-9beb-d45211eee71e | E2E80 RBAC mum3t32zcpov                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
3fcc72f9-641c-4c2b-86e7-53d59a15603c | E2E80 TRA mum3tbqe3kkp                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
81e5919a-0fcb-4e92-b49c-39d4cd7e89e5 | E2E80 TRB mum3tczhv21x                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
2682688e-6fe9-4e73-b5db-e27280fc4564 | E2E80 PO mum44qiatw8k                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
0ba92a4d-9c5f-4e22-aff5-5d4c583983d7 | E2E80 REV mum44z23tqty                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
3691ef42-634e-48af-a8d5-2a9c958df05a | E2E80 RBAC mum45d2j0v8h                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
8ee32dd2-f4d7-483e-82f3-c8e8f6719833 | E2E80 TRA mum45lxjimp1                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
709689d9-6f8c-4517-b8e5-34d09022c71c | E2E80 TRB mum45o3rdafi                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
38ee872c-3efe-428b-81cf-601ab1a39942 | E2E Multi mum49vlvambw                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
cce826f1-39a7-4581-9dcc-18c20b17271b | E2E80 CASH mum4f7syfq4g                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
1c5c79cf-c4ac-4658-a917-52b0a637ba88 | E2E80 CAT mum4fhvstz1a                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
783943fc-7c27-49e1-a2d7-185e1ac883f2 | E2E80 DEV mum4gdfb8ufo                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
c39b60fb-d449-4caf-af86-62a8700af07e | E2E80 DEV mum4gi7s1p31                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
e01d73d2-ba36-4011-8c02-36ef3791ea95 | E2E80 DEV mum4gm8v2c1h                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
70ab5461-2016-4110-aa81-7366ed3fc06f | E2E80 DEV mum4gt3x0xyg                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
db8fdc95-ef62-4e3a-a658-536e879608e2 | E2E80 DEV mum4gxgxfla4                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
ede05b94-d2c3-4c54-92b9-409e9bbcaa87 | E2E80 DEV mum4h1hde1ic                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
2bf23f8a-b742-4252-94e9-c57e8fdc244b | E2E80 CASH mum4mxa009bo                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
831f4293-e14d-4ce3-81c7-42efaee98ff6 | E2E80 CAT mum4n2tamcuw                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
d09aa751-b091-46b8-b970-dd41c1fea8e3 | E2E Extra extra-mum4o28f                             | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
19208b26-2277-4a70-bdf7-5efbf3100f3b | E2E80 DEV mum4o1jkfp7e                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
2a6e3732-5b4f-4950-98fb-1bbc6f5a4d4e | E2E Slug Sanitize mum4o2rp                           | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
5a330bb1-6542-4135-809b-e83ea786641c | E2E80 DEV mum4o5tu89r9                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
27c14113-502b-4c03-bee0-e0abc1e37321 | E2E80 CASH mumknlezjuqg                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
237dd213-5e75-469e-b0c3-3d14bb792285 | E2E80 CAT mumknxezhfxt                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
3d4be2bd-76c9-434a-901b-b2c5b6fb80a9 | E2E80 CAT mumko4i3top9                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
45a69a7a-3ec6-4ade-853f-040b0c22b8ca | E2E80 DEV mumkocwqeued                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
f3679c35-8d29-4c9a-a81e-f89f534d7fd8 | E2E80 INV mumkon4a4t37                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
80ea7e8f-c423-46dc-9be8-ebddb0351cc2 | E2E80 POS mumkp0pnch97                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=2
70fafb4b-24de-4542-981f-880048f1a641 | E2E80 POS mumkpguys3fr                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
00e2b0bd-0e7d-4979-ae30-7bd991a5f469 | E2E80 PRD mumkponzprud                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
27313823-81cf-4613-8228-64242ad64d6f | E2E80 PO mumkpx24qbhx                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
0e2e7f0b-9156-4cd6-9005-ccc2bcc34b9f | E2E80 REV mumkq69rkycr                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
57fdfb52-d60f-4694-882b-389aa9ed8035 | E2E80 RBAC mumkqn834ns7                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
98aa5acf-0951-408b-af43-da060689ee64 | E2E80 RBAC mumkqxhvgjvu                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
28526bd1-c650-4d50-9df0-e1600b0ff1f1 | E2E80 TRA mumkr5u5q63q                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
78ee3675-acd4-4d29-84eb-04a375571859 | E2E Multi mumkslcz9vgg                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
7e4da462-8082-440d-b14d-07c4b44d5bb1 | E2E80 CASH mumlt7acgbpj                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
c757da6d-9b1c-4986-9e62-4a08a9cc127d | E2E80 CAT mumlthxmlfpn                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
37b2d819-8cbb-4569-947e-cbab479cc4ae | E2E80 DEV mumlunrqg4ro                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
78fb29f7-8260-4a31-9400-5cafa2853dbe | E2E80 INV mumluyj1nidd                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
8bcf2560-4f96-48c4-8fb6-0189a14ab631 | E2E80 INV-UI mumlv9v9bcmc                            | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
75a685d8-6a11-47b6-9eaa-eb3b6575add7 | E2E80 POS mumlw9tz4675                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
af32008e-22ed-4120-a7c4-4f3c7e3f74fa | E2E80 PRD mumlx8ilmxpz                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
ce6f2d95-2da1-43e7-993a-d3bb94941a94 | E2E80 PO mumlxk59lb4e                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
e611e80f-b638-433c-b793-5bf02fea2869 | E2E80 REV mumlyjm0hl5q                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
78de42c1-9ed8-434b-9e0a-422f261bfc28 | E2E80 RBAC mumlz14u5wob                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
15478038-4c11-440b-8869-f84d7d9fcc87 | E2E80 TRA mumlzud3lr62                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
2b072ff3-4cc3-44dd-9f65-02ce95d606c0 | E2E80 TRB mumlzxxq8env                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
46b9b0e8-0bbc-4448-8576-25c84a906d6d | E2E Multi mumm4u1vn1ur                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
d352dba3-18e0-431c-8ab7-9b7f7501d4d7 | E2E No Addr noaddr-mumm4xx2                          | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
bc747ee3-2614-4414-b66a-da559374529d | E2E Multi dup-mumm4znx                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
1bedc648-0623-47dc-b0fd-2479d2d89170 | E2E Extra extra-mumm6mhe                             | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
4e665b83-722d-4ce8-948e-4ae2e42ded6a | E2E80 CASH mumnb51xla4l                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
1d8dc799-50b5-411b-ac8b-2a6e7cc11ae6 | E2E80 CAT mumnbgxd4fum                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
1d1ace25-cc1f-463d-99f9-8d9fc03b37b8 | E2E80 DEV mumncskv8qyx                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
7b3bbe93-9ad9-4639-b07d-b5861f4ba184 | E2E80 INV mumnd4ga6jrm                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
cd7e611e-a343-4de2-a3e6-fd2fafff2a74 | E2E80 INV-UI mumndgsxlkli                            | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
78012802-213a-4372-9829-e81a3e097d39 | E2E80 POS mumnefiaf3vh                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
5651e90b-4934-4adc-b861-5de8cf000bb5 | E2E80 PRD mumnfda4vbhm                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
071c21e2-845f-4deb-a6ae-0337d4af177b | E2E80 PO mumnfpsov2u0                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
ba1420bb-8ea6-4522-90f7-6c4633efd97a | E2E80 CASH mumnqjry5b5a                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
c164d280-985e-40b5-aa61-de27f022f7c8 | E2E80 CAT mumnr202x2tn                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
bf1e3219-de8f-45d5-8fc0-26b3c70813e7 | E2E80 DEV mumns5zfwr9l                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
f2dd871b-7984-4441-8a92-7c5b92d6084b | E2E80 INV mumnsh1n4k6x                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
a85ec9d0-8829-4419-99d5-2a74c663b2b1 | E2E80 INV-UI mumnsrz6tm60                            | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
5e33c378-de43-4ac9-a83f-e2841ec94966 | E2E80 POS mumnts909o68                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
19ecc680-87ac-4af3-954c-e7004f10912f | E2E80 PRD mumnuqqbqw2d                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
7c91c070-49c7-4138-ae45-574684800af8 | E2E80 PO mumnv2j2pwkb                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
66e0afff-877e-478c-b637-57a5754d724f | E2E80 REV mumnw1mbbbrn                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
70b8786f-a68a-4268-bd02-f880bf95b719 | E2E80 RBAC mumnwjrak8da                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
5418a486-a025-475d-914c-c2be277fb812 | E2E80 TRA mumnxchzpi15                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
6e54130c-325e-465e-9f6f-5d94fd0bcee6 | E2E80 TRB mumnxg0pkwbk                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
3bc1e4bf-eb64-4cc2-a465-6f6e28df90e2 | E2E Multi mumo0wk6qb09                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
7b7ef656-f43b-4749-bfbf-90a60e7ecb90 | E2E No Addr noaddr-mumo0yeq                          | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
be5f9077-4167-421a-8c54-4a3763374860 | E2E Multi dup-mumo101e                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
dd83d8b5-35c5-43df-8eae-62a9bce36f5e | Updated Name E2E                                     | 2026-09-29 | inact  | Default Tenant | m=1 p=0 t=0
a8e96b93-1762-4516-8899-431f739e3184 | E2E Multi del-mumo2mfu                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
c8886c0b-fb26-4c56-8f85-cb814579ad37 | E2E Multi arch-mumo3zne                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
17bc7c65-16f3-4d33-8808-35274fd28ef7 | E2E Multi dblarch-mumo45tz                           | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
44dc4d9f-ff6a-42ce-bcba-e7d12ddfe97b | E2E Multi rest-mumo4as1                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
92ea76d4-bcdf-4565-aea8-bb403241ded3 | E2E Multi restactive-mumo4ff4                        | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
ed44f31e-925e-45d4-b520-6783fef4f943 | E2E Multi hb1-mumo4oho                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
0de0d5c4-133a-4588-a1ff-c3ad55bf5b63 | E2E Extra extra-mumo5myk                             | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
a4362314-8fdc-44a5-b2e1-4779c1e14f72 | E2E Slug Sanitize mumo5o4k                           | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
87d484e9-f958-40b3-b483-27a231592e40 | E2E80 CASH mumpbrpbbk9q                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
a5ee68dc-89a0-4ba7-bda4-41824800b253 | E2E80 CAT mumpc3ud9zuv                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
11378453-d080-42b9-8be4-ec80218fa5e5 | E2E80 DEV mumpd99a9rbe                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
ed630ca8-2f04-45d0-9585-acf814ebba61 | E2E80 INV mumpdl62lh8e                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
0c6ef18f-b7e4-4f79-b4fc-2e02f3def0ef | E2E80 INV-UI mumpdx7awge1                            | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
85363399-5588-4c11-ba7e-75d36b6cf072 | E2E80 POS mumpew14v4e6                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
1abefff0-5985-4ee8-ae80-9e2f5c6ea995 | E2E80 PRD mumpfu7lngj0                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
09efdb44-ade0-464d-86b4-1baf6d4ccf43 | E2E80 PO mumpg6l1an90                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
ba3e3ed3-1269-4d32-95c9-8c154a28fa08 | E2E80 REV mumph55r2u2f                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
2c8c8628-14e6-47e8-b0d6-2849a4107037 | E2E80 RBAC mumphssbbazz                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
e383623c-babb-45cd-bf05-875658ab9425 | E2E80 TRA mumpip2ougs9                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
56872b9a-8826-4083-8741-5397bb05372c | E2E80 TRB mumpiutnbs5q                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
756e4217-a49e-4eca-8465-3ef05d3eded6 | E2E Multi mumpmg34xhfh                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
c3eaca6c-a3a7-427b-b95b-7d42c2bdc169 | E2E No Addr noaddr-mumpmib1                          | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
b3d125e3-7f43-405d-9a85-e8c29ab19d7c | E2E Multi dup-mumpmk45                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
0654e761-016d-4099-a44c-d1402676b212 | Updated Name E2E                                     | 2026-09-29 | inact  | Default Tenant | m=1 p=0 t=0
93de0fee-b74d-46e8-8afa-09e070e15828 | E2E Multi del-mumpo4xp                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
659a8cd9-bfd9-48ac-aef3-9ec0514e433d | E2E Multi arch-mumppjcu                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
41c7efa5-537f-4bcd-968d-4d540d28949a | E2E Multi dblarch-mumppnvk                           | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
3bfe015f-d36c-4d5e-9725-b5f66f44f6da | E2E Multi rest-mumppr18                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
43c655c4-10a8-4098-a37a-3fea487f80bb | E2E Multi restactive-mumppvk6                        | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
23e35cb6-4da3-493f-9ec1-aa1880659fb1 | E2E80 CASH mumqnk0dgjyp                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
6bf123a4-6e24-416d-b769-89c42c2794c6 | E2E80 CAT mumqnvx0578g                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
8854f890-408a-49de-8ca5-d4a62c2e1dca | E2E80 DEV mumqp1ji8t7q                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
10a517dd-bd7f-4906-a7bc-a3966d8455a3 | E2E80 INV mumqpdn19v11                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
14c0fc6d-a9fc-4418-a928-65efb79771c9 | E2E80 INV-UI mumqpq5wbu8s                            | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
05ac08e0-aecf-450c-ba51-8f679171bcef | E2E80 POS mumqqnzsrzm7                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
6d2c8287-cbb6-49d0-be73-9647be81dcaa | E2E80 PRD mumqrmawyi0v                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
5227fc25-05e2-47d5-be1f-612f0fd81dc6 | E2E80 PO mumqrz0jyg3v                                | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
e6dcaed9-abe4-4f77-8d81-a86ca3666393 | E2E80 REV mumqsxbtbgae                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
b61dec03-8d3a-4fe1-9939-be2f3f1c92b0 | E2E80 RBAC mumqth06pqmp                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
2c6a4839-11e4-42a6-9f03-21dd252816a4 | E2E80 TRA mumqu80lpwtr                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
5ae8cfb0-6ed1-41b8-aac4-8e0724c4bf72 | E2E80 TRB mumqubod3a31                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=0
d15cfd3f-b07e-4908-a837-8ef7d1a90feb | E2E Multi mumqxxy7q0ao                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
b08a4f96-ab3b-4245-bb7f-e17e790c58a5 | E2E No Addr noaddr-mumqxzyl                          | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
ca74c489-c14e-40c9-b72c-4a71f06a99da | E2E Multi dup-mumqy1tg                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
45e80ce6-83cc-4d41-a616-8b985a9cd968 | Updated Name E2E                                     | 2026-09-29 | inact  | Default Tenant | m=1 p=0 t=0
dcffb357-d4cb-4544-8c1d-691ab2096b31 | E2E Multi arch-mumr26ip                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
51f02111-1baa-4f1d-8752-acdf38c38574 | E2E Multi dblarch-mumr2cca                           | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
2e3095ea-1e5a-45b2-8b6d-5f6559f6347b | E2E Multi rest-mumr2fo0                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
e50a2094-79a7-4abd-99ad-97dde9c73bbc | E2E Multi restactive-mumr2jxj                        | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
a778a582-9f22-493c-a4b3-f07628bd00b1 | E2E Multi hb1-mumr2oxv                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
7bf5bfcb-3072-41a9-aec0-6499364be31c | E2E Multi blk1-mumr6dkc                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
8fb3002b-1cd6-49c3-a008-560a544d3de9 | E2E Multi blk2-mumr6f7n                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
89e1b214-c4e6-46b2-b302-92b987ec2b4c | E2E Multi blkd1-mumr6hm0                             | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
5c7e15ee-34c1-4a5e-960d-4ccd85d761a6 | E2E Multi blki-mumr7y2d                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
cd821c49-e646-4335-8e73-106142197a8f | E2E Multi rls1-mumr8215                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
a978c221-5dda-4586-981f-a4eb68b7353e | E2E Multi perm-mumr86ai                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
ad7ff6dd-b270-46a8-814e-6950a86b6820 | E2E Extra extra-mumr9ls2                             | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
08cd73e2-f12f-4db7-92d6-1953c4e01e26 | E2E Slug Sanitize mumr9nrr                           | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
669e81d4-e217-4b85-9943-7a4c88f812dd | E2E Test Store 1790691455641                         | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
ece8d515-554c-4bfa-8aa1-07fb4958df5b | E2E80 POS mun90ebggjej                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=3
765d5c88-b20e-4d70-8621-0649d50135bd | E2E Multi mun914qpbmva                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
a253d196-5f4a-4e26-8b75-b2e2fe39b3f9 | E2E No Addr noaddr-mun916g3                          | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
46eb5d7d-5d34-4e07-bdf9-b8d543a48a75 | E2E Multi dup-mun91844                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
b26643e0-45d2-42c7-861f-9298352ab742 | Updated Name E2E                                     | 2026-09-29 | inact  | Default Tenant | m=1 p=0 t=0
cb198cfd-6584-4288-b6f6-b0a82245300b | E2E Multi del-mun93u6c                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
d58f9000-48b2-47e7-a2ce-84daa709cce5 | E2E Multi arch-mun97tax                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
5cf82d33-4f44-46d9-a1f6-d78dc77fa6e0 | E2E Multi dblarch-mun97ybj                           | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
26e1f27b-36e6-4340-aa87-1f00adfd5f91 | E2E Multi rest-mun982nw                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
86be611a-2716-4de5-82ae-b12fa7d1e18c | E2E Multi restactive-mun9879k                        | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
5f462ac9-facf-4c62-96d8-80ac34ec1c6b | E2E Multi hb1-mun98ca2                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
64e022ea-e8f5-4ea5-8924-6f25764b4bf8 | E2E Multi hb2-mun9957q                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
a15ce7fe-40c6-4ac7-b0d4-8b332db41dd3 | E2E Multi blkd1-mun9c43g                             | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
d4b52f2c-e24b-45c4-baee-42e94be088ab | E2E Multi blkd2-mun9c5ek                             | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
b3e35e80-4229-42c6-85d5-8709f80eae99 | E2E Multi blki-mun9c7lb                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
83b960d6-7e10-4654-bb52-b7869c6d82f1 | E2E Multi rls1-mun9caqo                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
a3ad9da7-ee7a-4948-9e67-9719b277807f | E2E Multi perm-mun9cdji                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
25d89b79-385f-4b7c-a1f6-0fe1c17174ca | E2E Extra extra-mun9g8us                             | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
da761c79-3fd1-4800-93f4-7bbac97b77e1 | E2E Slug Sanitize mun9galo                           | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
d71fb0da-51b5-4397-8a0c-72896412b416 | E2E Test Store 1790721706466                         | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
e8f304f9-8f52-48e5-9e51-ef87a1bb0eaa | E2E Reset Test 1790721773702                         | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
ff0ac2df-c0a1-4017-8b7b-e75f4e0b1b8f | E2E80 POS mun9knjwnw6f                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=3
7c4d0f4c-e3b7-4680-ba6a-c4983a1565ec | E2E Multi mun9lhnnl4g5                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
b7dbda6a-7e4f-4fe2-aa41-2755402ad4be | E2E Multi dup-mun9ln11                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
11868db6-8052-40e2-8643-fa139aad5cd6 | E2E80 POS mun9wmpj5psx                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
7748c5ad-b045-487e-9943-eb5a23e2a99e | E2E Multi mun9xqe08m0l                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
6d76eb73-7c39-4a47-b1ad-103629bc3334 | E2E No Addr noaddr-mun9xyxn                          | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
b91131fc-7807-4388-8d96-66c4de94743e | E2E Multi dup-mun9y253                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
ecd38853-68ff-4bbb-9716-00ae7cf75bbd | Updated Name E2E                                     | 2026-09-29 | inact  | Default Tenant | m=1 p=0 t=0
58e7706c-e1ed-4270-ab1f-7d692f4684cf | E2E Multi del-muna0glp                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
c05014c6-a644-488d-900b-ec70a25e9820 | E2E Multi arch-muna1thy                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
d5043bd7-f726-478c-a698-7d51511677e8 | E2E Multi dblarch-muna1xcx                           | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
9d747816-3b30-415d-b3b3-e2b6363bd407 | E2E Multi rest-muna206v                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
049cc490-d386-426a-a702-e8592e2e62d3 | E2E Multi hb1-muna66j8                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
ed4d1386-72b5-47d7-a534-222be1bbe6bf | E2E Multi hb2-muna67ov                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
61bb688b-e53a-4cf3-a622-757b4f174551 | E2E Multi blk1-muna6b2g                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
b4efe293-f605-43a7-b25a-7a4011c2fe52 | E2E Multi blk2-muna6c4q                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
24685bac-b23b-42a8-8dab-209a46c82b24 | E2E Multi blki-muna8ws0                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
318ba025-30e7-48d8-bdea-dd1492250c47 | E2E Multi rls1-muna90ef                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
99ebb9ba-e8ec-497d-8de9-c7273c634635 | E2E Multi perm-muna939x                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
410886b8-afac-48c9-a377-7d638dfc1995 | E2E Extra extra-munaahwz                             | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
3ae29160-fda5-4c34-a560-8a7382f51688 | E2E Slug Sanitize munaaizh                           | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
356018f4-bf4f-46b2-bdba-3627c3b783bc | E2E Test Store 1790723116450                         | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
573b15fa-d395-4dd6-b34d-96b23ddeefe6 | E2E Reset Test 1790723182202                         | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
12619cc1-97cf-4ae5-9a43-31eec2abed6e | E2E80 CASH munar773ysny                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
3f7b89c1-0f1c-448a-990c-e8d3730b2c4a | E2E80 CAT munarezl74qe                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
9b3f39df-2ebe-4104-8d6f-846b07e6eacc | E2E80 DEV munas9ca3d6r                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
76bd8182-9430-4053-8597-297bd1e13ef4 | E2E80 DEV munascnq2xhk                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
7b33bb33-1f8a-4f7a-af86-a30ded17f11f | E2E80 DEV munasg0tvr41                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
7984d1da-a562-4bc7-83af-5b38e621128a | E2E80 DEV munasilcw9sx                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
7a8ac48f-95af-4e28-8d66-28cfd9c47f94 | E2E Extra extra-munaslsw                             | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
568ddc46-701f-48dc-b6c6-e194158de65e | E2E80 DEV munasmhrmvn7                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
d4bc3849-1a17-4479-ae99-8509dd8f4960 | E2E80 DEV munasqwuws2d                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
eab27e68-1c33-459e-9349-8b4118f39ce6 | E2E80 DEV munaswihrcca                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
0e2a0b7f-9764-4dbc-8696-e829459be285 | E2E80 DEV munat05r58ax                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
4ca98427-741f-4cb9-bc20-8d9454ac11b6 | E2E80 CASH munb5ilp8vt5                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
663d7dd1-4d5f-4807-9ebc-45ba82bf52d5 | E2E80 CAT munb5qoh4l9r                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
b4428d28-9418-4d1b-bafc-ebfbbcbc7589 | E2E80 DEV munb6nfvqkb8                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
102d4dd9-b1f2-4cb1-bbb0-6498d8cf64fc | E2E80 DEV munb6xhmdfsh                               | 2026-09-29 | arch | Default Tenant | m=1 p=1 t=1
ce9409db-f555-4845-b886-865b63620859 | E2E80 DEV munb726ceamz                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
f88e5fb4-d68f-4df1-990a-69c9cb2739bb | E2E80 DEV munb77lpf5l0                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
d6622c17-511c-4ec1-803b-b3fe38c85a42 | E2E Multi munb79vy93ia                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
17f871b9-e393-4f00-a5dc-cffc36f591c7 | E2E80 DEV munb7bzjkgm6                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
e245c66c-ee4c-4ce4-87c4-492718dca663 | E2E No Addr noaddr-munb7dix                          | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
1824122f-e045-4a8d-9285-c6a9057d94a5 | E2E80 DEV munb7fur7ui5                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=1
4378d6d4-ef8d-4005-b91a-165f193d938e | E2E80 REV munb88zdx79x                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=4
7a48ebb2-50ec-427d-a626-0193b95e6a7c | E2E Multi dup-munb7f8j                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
9020cea1-faca-4528-9eb3-0e1217a8e6d7 | E2E80 RBAC munb8pzl9266                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
46816ecd-0c17-42b1-9d11-acc98e85985d | E2E80 TRA munb8z6o1pw1                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
93171ac2-ad08-4d88-b232-35e574b03e4e | Updated Name E2E                                     | 2026-09-29 | inact  | Default Tenant | m=1 p=0 t=0
aa4d2418-8e92-4e03-b310-16876a336b66 | E2E Multi del-munba905                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
c3aea8ad-a2d2-47ad-939d-cfce9debe854 | E2E Multi arch-munbbq89                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
95ce3256-88a0-4493-80d2-cb040419f895 | E2E Multi dblarch-munbbwfj                           | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
a5407c53-36e7-4866-b16d-38bde0c18b15 | E2E Multi rest-munbc1gx                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
513c818a-d129-481b-9047-cba694418ab0 | E2E Multi restactive-munbc7mk                        | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
ac11f8f9-9558-4a33-8a33-fd1a6cc7d26d | E2E Multi blk1-munbekhw                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
96ca1cf9-2692-42b8-a41f-3efca170b40a | E2E Multi blk2-munbenza                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
64ff0445-8266-4755-b240-424a62a56741 | E2E Multi blki-munbeyhb                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
f5abeedb-bd29-42bf-b591-6f6cf996df31 | E2E Extra extra-munbf49k                             | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
d84fed24-fe14-4a66-8c44-93234725ce2f | E2E Extra extra-munbgf4e                             | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
bc59742e-64a3-4013-ab8d-d9d294d39134 | E2E Multi munbwvg4np9r                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
3be07c1e-e82f-478c-8862-118597e8fe43 | E2E No Addr noaddr-munbwzad                          | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
2c545209-0c8e-4610-8e0f-286d84584c5e | E2E Multi dup-munbx0ym                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
adb43e89-8804-4c6c-b8dc-83caca9e6772 | Updated Name E2E                                     | 2026-09-29 | inact  | Default Tenant | m=1 p=0 t=0
337a7fd3-8ecc-4b5d-8643-1b4c6d18af4a | E2E Multi del-munbzv06                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
e5bb0e0c-f47b-4873-8dc4-5a82f397c5cf | E2E Multi arch-munc1amd                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
2ccfdbab-ebf3-472b-af04-e2f2ddaf9ed7 | E2E Multi dblarch-munc1h99                           | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
6771530f-5d49-46a9-9529-7e04e19fe618 | E2E Multi rest-munc1m90                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
199adbd2-b295-4074-9527-57f5c353499b | E2E Multi restactive-munc1scb                        | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
34cacce1-fb8c-4773-a70a-be00374f6615 | E2E Multi hb1-munc1z5c                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
abbf0fc0-d6e9-4213-b186-df6e3198c443 | E2E Multi hb2-munc2p2l                               | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
0e9d0488-f210-4aff-a4ef-7f7fa8d1bf16 | E2E Multi blkd1-munc74cw                             | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
9572e5c5-f172-414c-94a9-26b75ce42cee | E2E Multi blkd2-munc77zb                             | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
d6221d9e-2123-4b2d-a29f-37ea0d806e30 | E2E Multi blki-munc7c1u                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
93ce4343-b65c-44c4-b12f-55e89f9a78a6 | E2E Multi rls1-munc7h6a                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
a49383fc-fe32-4480-9b44-cba75ac999a7 | E2E Multi perm-munc7m18                              | 2026-09-29 | arch | Default Tenant | m=1 p=0 t=0
8ca4e21e-8848-4126-9a83-da179bb2bda4 | E2E Extra extra-munc9lsw                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
fcf1619d-cba3-444b-98a3-fa58fd5b4a39 | E2E Slug Sanitize munc9my7                           | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
6446f073-1f69-455c-a13c-e9daae996249 | E2E Test Store 1790726556154                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
cc73d4e1-a135-4720-8850-0c806fcfc108 | E2E Reset Test 1790726680290                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
ee0c6b80-e945-40a9-ad34-d4d695fdf262 | E2E Reset Test 1790726688419                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
9dd17937-f447-4412-a412-011cf09e88aa | E2E Reset Test 1790726751935                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
91897ed4-c872-4000-9bcc-06fa4bec2dd2 | E2E Reset Test 1790726758289                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
01edc545-7cca-47f6-afdc-6d327abe23da | E2E Reset Test 1790726762365                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
61c10c33-d013-4c26-a58a-5d929a473b14 | E2E Reset Test 1790726900170                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
0cf1bfa4-d9a1-4a25-974a-7a16490d9d1f | E2E Multi muncuj2uti5v                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
e14faf8d-0cfd-4d3f-aff5-58c81f78a63d | E2E No Addr noaddr-muncumz9                          | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
81b46bcb-be8b-4bbf-86a9-e72c6210c994 | E2E Multi dup-muncuoqe                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
bf78bf28-3670-49b7-9ad3-2d516dfea95f | Updated Name E2E                                     | 2026-09-30 | inact  | Default Tenant | m=1 p=0 t=0
5c1f440c-3e5e-494c-b68b-2b1503e7d353 | E2E Multi del-muncxbju                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
d7652008-592d-471f-8081-03a092d955cd | E2E Multi arch-muncyspj                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
4fb297c1-c860-4d0a-a06e-0761790a64fe | E2E Multi dblarch-muncyz57                           | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
454d4c1e-afd7-4f25-82f5-05e1d4df1ec4 | E2E Multi rest-muncz41u                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
e4f9a02f-fff4-40c6-b73f-258c8cc802e3 | E2E Multi hb1-mund49hi                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
f14d107e-02ad-40e3-8a4f-34eafbf272cb | E2E Multi hb2-mund4cm7                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
9ac83b91-d685-4b5c-bf5f-c2cdb3322524 | E2E Multi blk1-mund4hud                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
a22c687d-bc71-42f9-a193-6f4facdfc281 | E2E Multi blk2-mund4ktl                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
aa0a3082-f319-49b3-a129-e12eb6f339d4 | E2E Multi blkd1-mund4osh                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
4a74cae9-eef8-4c1e-969c-cc82c8c85efd | E2E Multi blki-mund8joq                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
09a8b67e-82e6-40dd-8e2f-d77e10eadbf6 | E2E Multi rls1-mund8q1y                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
185ef442-3d1c-4a65-be37-3cb1c5b31aec | E2E Multi perm-mund8v0q                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
28d81daf-6cfc-4210-bca7-9b7cc26d8347 | E2E Extra extra-mund9xbk                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
fa5adbec-2dc9-4840-b3e4-74a97390d96a | E2E Slug Sanitize mund9yh9                           | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
419d2457-9e43-4a0e-9f3a-63b2c51f4c91 | E2E Test Store 1790728190213                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
2ad1c56d-9edd-4f7a-9ebd-4f137a96826d | E2E Reset Test 1790728310479                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
34b8953d-855c-44e0-89c0-434710122e8f | E2E Reset Test 1790728318665                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
116cd7d7-af91-40d7-9c50-1ebe698053e3 | E2E Reset Test 1790728382881                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
ea4b383d-abae-42f8-b688-8904a353e839 | E2E Reset Test 1790728387789                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
97eb06c1-53ab-4629-832e-67456272be42 | E2E Reset Test 1790728391647                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
a8c19274-7bbe-4af0-8e1c-d60c5f4329c5 | E2E Reset Test 1790728532789                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
d5181280-6b25-415e-85ac-b5494a624ae6 | E2E Multi mundrd39yd88                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
32c77569-9622-45c3-a28f-1547743c950a | E2E No Addr noaddr-mundrhck                          | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
34a18901-f213-4f6d-8640-d3483ea448a1 | E2E Multi dup-mundrj1o                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
37040de6-bf28-409f-a59e-d21bcdae9284 | Updated Name E2E                                     | 2026-09-30 | inact  | Default Tenant | m=1 p=0 t=0
563be2ed-d43e-4b69-ba1a-21a0076bd9d0 | E2E Multi del-mundu5d8                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
ed04d968-e2e5-40fd-aac3-07d5094ed978 | E2E Multi arch-mundvmqt                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
886d3a81-d10d-4b2d-bd71-df2e9847c3b8 | E2E Multi dblarch-mundvtta                           | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
a3e062d4-771b-4022-b136-8dcc8de546cf | E2E Multi rest-mundvywv                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
91107f82-1582-44df-bb7c-bf1a17fa8410 | E2E Multi restactive-mundw51l                        | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
729ea480-543d-4258-94d4-32eb324f6b81 | E2E Multi hb1-mundwbuj                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
07b24ef4-3203-4211-b5b3-ea8c80b58883 | E2E Multi hb2-mundx0wm                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
e27360f0-4026-49d1-bf23-e0056235ecb4 | E2E Multi blk1-mundxa1o                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
84e9d3b7-6883-40fa-9291-c4f5af7bd43b | E2E Multi blk2-mundxioq                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
fd90de77-0089-4659-8ff1-20d3e1e98734 | E2E Multi blkd1-mundyjqv                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
0e2ca1fe-6e63-46ee-97f6-3119d127d85c | E2E Multi blkd2-mundynrm                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
8bbff220-a60f-4dc0-8a76-bdb11662d959 | E2E Multi blki-mundznf9                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
87f27fc9-254b-4a75-9a84-f830ad767861 | E2E Multi rls1-mundzv9n                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
b42bce98-9fce-4355-9089-c13b6c4311c5 | E2E Multi perm-mune0051                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
e472c22c-cd47-431e-aa79-0eb970ebe547 | E2E Extra extra-mune16yc                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
80b2bf25-2a2b-4bd1-82d5-e5b4e7419fd5 | E2E Slug Sanitize mune1823                           | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
72ff4490-06f9-435b-aa0f-9fb6a63224da | E2E Reset Test 1790729949934                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
810d3444-d0a1-441e-9adc-323f79654821 | E2E Reset Test 1790729958846                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
65e1a88f-a90b-4a5c-bde8-8b801b277969 | E2E Reset Test 1790730020435                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
7794f80c-d305-4ef4-ab4b-8a87cd038b76 | E2E Reset Test 1790730024599                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
b6fea854-b5e5-4fea-87d9-8bfa1d2a96a2 | E2E Reset Test 1790730028661                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
a870cc19-219f-4b64-819e-c2ea55afe0c0 | E2E Reset Test 1790730167733                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
69a85bed-9650-4c11-98b7-9a0a58035dea | E2E80 CASH munexastc9wr                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
d23d04ff-9182-4f80-a06f-bc7efc3ba92d | E2E80 CAT munexn5fz5od                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
3e00c643-177a-490c-9912-57d21ca9bc13 | E2E80 DEV muneyy27qp3e                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=1
24f67141-c1e2-4909-bd48-4c0d648af3fa | E2E80 INV munez9c6toug                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=0
bd5616b7-7117-4829-987c-7467be7aedab | E2E80 INV-UI munezlhb4en0                            | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
2bf5b847-b902-4377-b80b-f3a7167bd2ef | E2E80 POS munf0kg4m7lo                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=4
0bd0bf5e-7268-472b-9404-ae04252ee924 | E2E80 PRD munf1ir2l9bp                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
43457b47-4975-44ba-a1ec-685a57ce74da | E2E80 PO munf1um9q5xf                                | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
e3a34d0d-411d-48f4-a744-56b3f9ff9a18 | E2E80 REV munf2trzgok9                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=4
942e79aa-4521-4353-9ab8-840d5edcf7f6 | E2E80 RBAC munf3dmi3tp6                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
7c642953-9394-43ae-8bc4-2a0343b8321a | E2E80 TRA munf44bpa47n                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=0
fc710c5a-57f6-475e-a1a2-7cecdca80127 | E2E80 TRB munf4812o1t9                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=0
6fa60880-e88c-42e4-87a3-f28407942864 | E2E Multi munf7sk3bqzu                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
d2b5b9c4-b31c-46f6-a706-275017042967 | E2E No Addr noaddr-munf7wid                          | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
ebcaf35a-e232-453d-a829-d97f230839d6 | E2E Multi dup-munf7y6z                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
b0279673-9123-40e6-8eb1-cb8e2d902079 | Updated Name E2E                                     | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
82a64e80-b509-421a-b383-a11731df6c82 | E2E Multi del-munfalfg                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
590ad92f-8a73-4f10-bcac-b00c2086ffaa | E2E Multi arch-munfc2bo                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
529eb25e-139a-487b-a085-609fa22a5dc2 | E2E80 CASH munfcjzzxheg                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
5771d095-ca93-4899-9857-6d7b7940596c | E2E80 CAT munfcngnpgc0                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
8bf6ce67-dbee-4220-b7c0-34d831513f42 | E2E80 DEV munfdiabse2m                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=1
e5d64d15-a962-4d14-9017-25d4c9ad7bb2 | E2E80 DEV munfdktsrf51                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=1
5527b1b4-a327-468c-bb64-31e680225f16 | E2E80 DEV munfdmt7m8ij                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
70959837-bbea-4796-9b2e-ba2cb23eaa69 | E2E80 INV-UI munfdvh6rqdh                            | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
0192d881-c4c0-49b7-9430-e036bc4916a6 | E2E80 POS munfe5fu55tn                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=2
86741720-0233-4c5c-bfac-919ddee85086 | E2E80 POS munfe9xside4                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
cb7e580f-1293-4de9-931c-54d9d2255f86 | E2E80 POS munfebooenhu                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=2
6d880271-36ac-4e4d-ad5b-68f2f785bb08 | E2E Multi rest-munfexc7                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
dffe30d2-af09-4ad2-8f27-0466edb569a9 | E2E Multi restactive-munff4xv                        | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
784aac51-8e62-4ccc-a232-22bf7d0cb2a2 | E2E Multi hb1-munffd5i                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
eb7aa1c8-13f3-47ca-be55-75f6bae96bdc | E2E Multi hb2-munffh6q                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
782d200f-28a2-4fab-9e74-f6e3ca0b34e5 | E2E Multi blk1-munfglch                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
21ffc6f5-591f-4bc7-a7c7-c4698de90405 | E2E Multi blk2-munfgonp                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
92f35e83-8339-48a2-99b2-19ebe477e97e | E2E Multi blkd1-munfgsrs                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
516f6e50-2fa5-475f-a3d3-659359ff67a0 | E2E Multi blkd2-munfhto9                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
7447c038-dbfd-408b-b29b-46fe03b8a901 | E2E Multi blki-munfi0f7                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
40a55cce-ed18-48e2-ac49-cabdee1509c9 | E2E Multi munfiqa6dwrv                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
e9309277-9aec-42f2-963e-c977e63f53a1 | E2E Multi rls1-munfi5sg                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
1b03c9c8-2b9d-4535-827c-cfe7f53bf6e7 | E2E Multi perm-munfj67l                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
fba6159d-c552-42a9-9f66-5ecbeb3eb3e4 | E2E Extra extra-munfkjcv                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
c1175cb5-1c04-4d4d-9d0e-465e62d95c1f | E2E Slug Sanitize munfklc0                           | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
c592e8c4-5602-4471-8379-f0f49e02613d | E2E Extra extra-munfklya                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
1b467e6b-2189-4b16-b08a-e9d6e9d8a065 | E2E80 CASH munfupaa7xk5                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
3d34be33-5562-434b-937c-95a8cd25ba11 | E2E80 CAT munfuumns950                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
e608a3e6-d510-4e47-90be-a3565a4544d2 | E2E80 DEV munfw4zv35hu                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=1
47192633-ed35-4d94-ba5f-494b01ed94eb | E2E80 DEV munfwdf833s2                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=1
049bfa8b-83c5-4dd8-a409-10cca70c773d | E2E80 DEV munfwujh0zp7                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
d5cbbed0-943e-48c5-9a4c-57c1d764f3aa | E2E80 DEV munfx8x67a8p                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
f92ab2be-6394-432d-afdb-aeecdf317223 | E2E80 DEV munfxjpmdzty                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
c0399be0-cb38-4347-bf1f-25482f3b31d2 | E2E80 DEV munfy1ybpd5w                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
c447406e-9abb-44c9-97ff-0a397739d62c | E2E80 DEV munfydkh3spf                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
e907b74b-dab0-4dd9-aae7-cbfb41460528 | E2E80 DEV munfyvna4tit                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
e2165ab2-48c5-455d-9b90-80320f9f3635 | E2E80 INV munfyzypodlm                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=0
7a8273e3-acb6-4d79-a71e-3fa158fed61e | E2E Test Store 1790732637197                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
b0ccaa85-5465-4a91-9690-444d9e95caae | E2E80 INV-UI munfz8gba0fi                            | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
c7021977-c6d7-448a-93d6-20169ee0427b | E2E80 POS munfzhwmxen7                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=2
d60a83fa-a350-4409-80d8-bf7f1d19cc83 | E2E80 POS munfzqvx4r7g                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
415aee88-36aa-4226-81e1-13d9ab620570 | E2E80 POS munfzuf44pf5                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=2
fff3ef77-b622-4e16-9842-fb725bb3093e | E2E Extra extra-mung6f9g                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
ea6c86ef-6555-4c98-be53-b2c2df3110a9 | E2E Slug Sanitize mung6fwn                           | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
1d47365e-9f83-47e7-b1fe-b7b55fc7c515 | E2E80 CASH muoozki5n45h                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
6d34854e-d09c-4035-b593-6a29b072cb14 | E2E80 CAT muoozo9vw76u                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
a285f557-25b3-45ca-bf74-f7f646df1ff6 | E2E80 DEV muop0iqh0i6c                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=1
7f10f96c-9670-4878-9a5e-9d19083b899f | E2E80 DEV muop0zswb4u6                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=1
7ab3ea7e-6b0c-4533-8c07-c9d05b7b7183 | E2E80 DEV muop13e6w46u                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
b6b8f63d-f9c8-4b1f-8455-ec08890f06d6 | E2E80 DEV muop1ccblci9                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
83b0d84c-09d3-4597-99c5-5deeae7fd1d6 | E2E80 DEV muop1f2op57a                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
9b827f13-8ae8-4482-80fa-eb2877315684 | E2E80 DEV muop1hdhdo4g                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
134d8e3b-c93d-407b-83e3-3b961fc24ff4 | E2E Multi muop3ekh16xv                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
a47f98d3-5b3e-4ee7-9a88-85fbf9ef5e19 | E2E No Addr noaddr-muop3fzn                          | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
df979587-1348-4c8b-bff3-26d165f1a55b | E2E Multi dup-muop3j95                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
b938b7d5-34f6-4c36-9e2e-d5ceb908b93c | E2E80 CASH muop5e5pp4mu                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
2516cd9e-d751-4fc3-b11a-cef4d99458d7 | E2E80 CAT muop5k6vy66c                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
d67b0f05-da1c-43d1-8aef-6be4d5968d80 | E2E80 DEV muop6i8wp8vv                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=1
213e948a-8952-466f-b35b-37ea87e00d4d | E2E80 DEV muop6vf9dkqq                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=1
021946e5-7442-4e5a-84f9-320c6fb55ecd | E2E80 DEV muop70nj4oba                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
05fcbc26-7299-4b7a-908b-6e8a90885f93 | E2E80 DEV muop75e5ukrm                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
b07eaf44-0a14-4a73-90da-5b7d2f2d2461 | E2E80 DEV muop7bnopktu                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
a2ba7aa7-4134-4367-927e-004a5785f93a | Updated Name E2E                                     | 2026-09-30 | inact  | Default Tenant | m=1 p=0 t=0
37a9d21d-182f-4d16-be9a-69d5016b18c6 | E2E Multi del-muop7eng                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
9a920c1f-b0b5-4790-a682-88b0e00dca97 | E2E80 DEV muop7g1u0ram                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
a641ab91-04f3-481b-8a6a-98b6dee41bc5 | E2E80 POS muop874wqrgp                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=4
f5ccdb27-5488-4212-9fb5-44599fa55bb4 | E2E80 PRD muop8o2fk89g                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
c61dae0e-5dcd-4ec1-9545-e1fef5547d21 | E2E Multi arch-muop8qa8                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
cb91c165-5354-462b-b265-10522aa2c1e6 | E2E Multi dblarch-muop8rkh                           | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
3d144a8b-6c0a-4e62-8dbd-c572c9a43807 | E2E Multi rest-muop8sct                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
0a0f87b9-d7a6-4f60-b348-6d20cc378dd9 | E2E80 PO muop8rxcvb13                                | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
551883ba-5532-49f8-9b5a-24faf0ff202b | E2E Multi restactive-muop8t9y                        | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
98a78f8e-68cf-4d7d-9c42-9362d249dbfa | E2E80 REV muop9z8dsbai                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=4
ab845661-de07-4bea-8e50-df98775ad103 | E2E Multi hb1-muop8ubr                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
0315e7ea-93b8-4035-9839-cb0ae686b063 | E2E80 RBAC muopa9gnrs1b                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
c1aeab0a-48f3-4850-92b6-f4a305865360 | E2E80 TRA muopbaa3yw3h                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=0
245e25dd-028e-4940-9468-eade9658b322 | E2E80 TRB muopbbq2f8j6                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=0
0b90901f-d566-4fd5-aede-7e33ece01e42 | E2E Multi hb1-muopcq4n                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
5e0e1e83-e177-46a9-b3ed-23e3514989a1 | E2E Multi hb2-muopcqxr                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
32770b15-6cd9-4031-9bdb-262d78955998 | E2E Multi blk1-muopcs8q                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
186d6d3e-7717-4f40-9d91-bcfe72e8c0fe | E2E Multi blk2-muopcsuo                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
0475ca39-f658-4a65-94e7-31778b0e04b8 | E2E Multi muopduxp4ia2                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
61f0b997-9913-496a-823f-51dba8f9262a | E2E No Addr noaddr-muopdyr0                          | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
1dc1a0e9-3d45-4d3c-97ee-152b835eb434 | E2E Multi blkd1-muopctlw                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
9849ae59-4b68-458d-9b06-bc78f5abc953 | E2E Multi blkd2-muope1so                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
39b5ea0d-0c13-4f87-bb38-27b3ee1cc533 | E2E Multi blki-muope3qq                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
d762e25b-fa98-4002-a44b-94d478e3eda6 | E2E Multi blkd1-muopf5vb                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
5253616b-4003-4d30-b11e-5f6fe508d3f3 | E2E Multi blkd2-muopf7cj                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
d79fc4d7-d753-42c0-ac90-dd4d4fcab402 | E2E Multi blki-muopf9ax                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
f89e207c-702e-49b7-a564-2456c6c334d5 | E2E Multi rls1-muope58f                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
35083802-a6b4-4844-a27f-60b6c3449d13 | E2E Multi rls1-muopfbma                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
09d77efa-b2ef-4dfb-b13b-a83fd25bd008 | E2E Multi perm-muopfcz6                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
477be4fe-6240-412e-8dee-17e87ae0aeb2 | E2E Multi perm-muopfdpf                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
4dd95e79-2d94-4a3d-a263-83fb30aa4738 | E2E Extra extra-muopjcxq                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
5a19b52e-6e1c-4897-873a-1776b04d3e6e | E2E Slug Sanitize muopjdj9                           | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
3f3d821e-d69c-4a0f-b218-15da695c17f7 | E2E Extra extra-muopl16e                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
94db0ab3-d788-408c-bd09-c6f90716ccf3 | E2E Slug Sanitize muopl277                           | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
3f3cfe59-7cfd-47ed-beab-6f80b1d9e519 | E2E Test Store 1790809336727                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
10d6aa3c-a11a-4af6-9a8a-72a8e1319abf | E2E Reset Test 1790809409135                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
39b157bc-a4b7-44b2-9d4b-e76efa5c169b | E2E Reset Test 1790809413624                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
a415c205-d64e-47f3-8ae6-4faf9b18accf | E2E Reset Test 1790809475314                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
f7fefe69-9a6b-4835-977c-e468e49ecf59 | E2E Reset Test 1790809477297                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
dd48da07-0568-49f2-8c72-b09638427c85 | E2E Reset Test 1790809479169                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
ee58edf3-832d-4be7-b56a-e47669d3167b | E2E Reset Test 1790809607308                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
3f25c932-24e4-40a2-8b21-fea4cc93d6fe | E2E Test Store 1790810802739                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
9f64362f-98e0-4929-88da-3de3c31556b4 | E2E Reset Test 1790810891107                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
816ba674-bdfb-418c-8fb3-fd3e8cd0e89d | E2E Reset Test 1790810899124                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
9f2260c5-b4f9-4625-95d6-64fa721037f6 | E2E Reset Test 1790810961521                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
43e4f219-8fdb-4786-873f-b7ebc220bfb7 | E2E Reset Test 1790810965987                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
548ccaff-29f9-4aa0-8e79-fa967cdeb598 | E2E Reset Test 1790810970337                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
2178a4e2-ca5d-4f92-9f07-6851ef8f7048 | E2E Reset Test 1790811109199                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
b9c3cb64-89cb-4428-bc5b-58f2c7c79868 | E2E80 CASH muoqwsnyfsii                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
b2545f98-1242-4d38-9b0b-1e6080732f72 | E2E80 CAT muoqx5i7vl74                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
226a4ecf-699c-4e9e-a049-ae951e0c43f4 | E2E80 DEV muoqy24rlh4s                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=1
2faeb8a1-fd38-4c6c-a24a-f5dcb3142643 | E2E80 DEV muoqygq3nxxc                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=1
3b080be0-d6ce-4da8-a107-c203ed1083d8 | E2E80 DEV muoqylw5nl2x                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
d9d4fd61-e919-4708-8d5f-c02986f2946a | E2E80 DEV muoqyqg2be3c                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
23fafceb-68cc-4192-ae14-876348e6814e | E2E80 DEV muoqyw3knrgy                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
62946b0a-2e3d-4873-aed7-af76fc2dbf62 | E2E80 DEV muoqz0dc8v0n                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
3bb1470d-103a-48fe-8746-228c27c5a679 | E2E80 PO muoqzrhvb0l4                                | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
a7ceca3a-8230-4a81-9d82-883c27d9977d | E2E80 REV muoqzw88cl9z                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=4
8338abe8-0fc4-4dd5-81e9-a53246205c02 | E2E80 RBAC muor0891kw1v                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
bece255e-49eb-4a96-88d1-3c63c7dc7267 | E2E80 TRA muor17b2up9j                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=0
3cd20c15-6752-477a-ae80-4c07aea4bb5f | E2E80 TRB muor18y8ytfn                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=0
6b2cf943-2657-46ed-9ae7-4a79094c38f2 | E2E80 CASH muor23c6djvn                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
6e7018d6-1b30-45e3-be2f-c3c8782d95a6 | E2E80 CAT muor26n59hip                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
78564cf9-dbea-4a8d-9236-26ac4a586d82 | E2E80 DEV muor30bo2lxx                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=1
8b5d501e-c403-45af-8b10-0efb5f6a1e81 | E2E80 DEV muor3hz8btv1                               | 2026-09-30 | arch | Default Tenant | m=1 p=1 t=1
148c3fd6-8781-4df0-96ef-dd8c1a3eed58 | E2E80 DEV muor3l7e0r6b                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
edacb611-7a46-45c6-bdad-02c4f81d630f | E2E80 DEV muor3nu4jlar                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
abf502aa-d3b0-4aed-b75c-b80007101c82 | E2E80 DEV muor3qbkqh02                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
77a23ec4-3281-419d-bb10-922671115ea6 | E2E80 DEV muor3syijcc9                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=1
a38d3a83-d70d-485e-911e-983b0a3fdaf6 | E2E Multi muor41qmpnug                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
d774f6f2-b211-4638-8ee9-32481df48fa9 | E2E No Addr noaddr-muor43l6                          | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
9a064183-e899-4ca5-a4d4-30476cab3e9e | E2E Multi dup-muor44do                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
7109003b-a6f7-4ba8-be19-96ab2c4b58cd | E2E Multi muor5liwwfk3                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
7f442cad-d518-4162-85de-0cde06135879 | E2E No Addr noaddr-muor5mss                          | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
f4234231-29d5-461b-87b1-2b1a2a9a9088 | E2E Multi muor5ti8m5ll                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
af2ff21f-7aa2-46cd-a617-f54a75b7e60a | E2E No Addr noaddr-muor5zpg                          | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
94c93253-c0e6-47e1-99c6-b57f66142467 | E2E Multi dup-muor5n3s                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
5f7072a9-0517-4576-8aba-fb0e9d4d7ac3 | E2E Multi dup-muor77af                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
739b205f-0b9e-4acc-aeca-24ca7f450a6f | Updated Name E2E                                     | 2026-09-30 | inact  | Default Tenant | m=1 p=0 t=0
5af71fc2-d8ed-4875-a712-29902bfa3459 | E2E Multi upd-muor87zp                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
6071a891-de89-4438-a349-d86219007f5d | E2E Multi del-muor892q                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
d2dfbdf8-c678-4c4d-b00d-56a08978ea22 | E2E Multi upd-muor8hta                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
a4a98178-2cc9-4a28-bbe3-673f93f8a0df | E2E Multi upd-muor9l08                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
60a28cc4-8643-40c4-ac93-1a56ea483856 | E2E Multi arch-muor9lkt                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
0119ba39-583c-41f9-9844-a077f89f5983 | E2E Multi del-muor9mvs                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
e21811f4-dff3-492e-8856-5762db160f6f | E2E Multi del-muor9obi                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
9608ef8a-a141-4b7d-b591-ea698535e306 | E2E Multi dblarch-muor9oay                           | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
277f8f77-6f4b-4500-a1f8-16ce3726a78a | E2E Multi rest-muor9r1a                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
9590f248-2516-4966-8ba9-c2016f6927bb | E2E Multi arch-muor9sn7                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
4f767650-2a9b-4b22-baf6-bf0451d2c5a4 | E2E Multi dblarch-muor9tqy                           | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
ea0eff00-491d-48a4-a9f3-ca90c8fe3c1d | E2E Multi restactive-muor9tyc                        | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
54627f52-fd8d-407c-a0a9-ec22a92346a4 | E2E Multi del-muora214                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
31e94859-cbec-4a5f-ab3d-1ed1a250acd9 | E2E Multi arch-muora999                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
c7045973-fb77-4b51-8dc6-f572a1de7d29 | E2E Multi dblarch-muorafhz                           | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
889b068f-0265-4fd5-aaa3-60e5314d584f | E2E Multi rest-muorali9                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
b27554d5-fb40-4662-a6e1-6fde79ed7ae7 | E2E Multi restactive-muorat25                        | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
b2da71a3-16bd-4720-8930-2eea58fbb7df | E2E Multi hb1-muorb039                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
4ef7b444-0f89-4972-9c84-7e4c8cf82120 | E2E Multi hb2-muorbnd1                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
ca679e28-9968-494b-a9a6-b553165eac94 | E2E Multi blk1-muorc2ko                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
6849bf3e-52a7-4e9a-a5d0-be2574fa3fd8 | E2E Test Store 1790812228311                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
3fd2ce33-9964-445f-a8b0-bfcc0b3fb8c1 | E2E Multi blk2-muorc71p                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
8e2eb5ca-24e7-4f56-adec-24f9e950eb54 | E2E Multi blkd1-muord6es                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
7fafbe07-095b-48eb-9cf4-a9bb21e0a480 | E2E Multi blkd2-muordb0t                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
f35a4282-3969-4786-9de5-f7075328053e | E2E Multi hb1-muordn8e                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
79e7493f-3d44-4d8f-9ee4-20a69dbb9533 | E2E Multi hb2-muordowd                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
1e968695-6f57-4455-84dc-20859db60032 | E2E Multi blk1-muordrpw                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
0224dbc0-8c84-498a-9eb8-4fab146d011e | E2E Multi blki-muordit4                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
3fa1ef84-a4e4-4d31-891b-68a1bfdae1e6 | E2E Reset Test 1790812293284                         | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
1862e67d-3dbd-4832-bc09-190aee2fffa0 | E2E Multi blk2-muordtvf                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
7a1fd035-1743-41c1-8dfb-54bc5ce872e0 | E2E Multi blkd1-muorf1j9                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
edf961e3-c9db-4c7d-b66d-bef08e2ba5cd | E2E Multi blkd2-muorf4py                             | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
6e9965f1-1f1f-4830-82d7-bbe3d7ab9b1b | E2E Multi blki-muorgaxr                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
ef8e8106-70cb-4343-a850-48d2fbdb45de | E2E Multi rls1-muorgdny                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
65915c04-985f-4dc9-b752-ce7902ec334d | E2E Multi perm-muorgfye                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
97da4627-1535-4cbf-a54e-0d889febe9df | E2E Multi muorhv8zs7c7                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
956f23bf-a309-4b73-baa1-2d5a98383a93 | E2E Multi dup-muori39m                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
30d2a7aa-9881-4941-b5c8-08a98a497f31 | E2E Multi restactive-muorj77x                        | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
6ee8f097-96d0-4868-adad-1ec11c53d8c6 | E2E Multi muorjv8s3qlw                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
07564bfc-760c-4db1-a028-74cecc045d03 | E2E No Addr noaddr-muorjz97                          | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
3612c9ca-4671-4eae-bd2a-eb87dfa2212a | E2E Multi dup-muork1ay                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
08225cac-d71f-4cbd-9243-4f1063074fbb | Updated Name E2E                                     | 2026-09-30 | inact  | Default Tenant | m=1 p=0 t=0
fd93d5f3-f53e-400d-9abf-c7b51cfc34f7 | E2E Multi del-muormvr4                               | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
7d9d7250-20b8-4c7a-94ef-0874054a2591 | E2E Multi arch-muoroban                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
f99981cf-7cca-4c00-b799-2068d1b46aa1 | E2E Multi dblarch-muoroi28                           | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
ef391c0a-863c-49ca-8783-d28bebd63089 | E2E Multi rest-muoron8g                              | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
f290de4b-9b28-4b3e-8256-9414766630bc | E2E Multi restactive-muorotfz                        | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
b851deea-e84a-43d9-9041-2b36412d868a | E2E Dup Test 1790812987                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
965d2e66-a39b-4447-b4db-141d9bfa6235 | E2E Multi dup-muorvi7n                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
42fa8055-54b7-4cff-8d80-a97a6c5b5160 | E2E Multi hb1-muorwlc6                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
17b27a07-89cb-4c72-b6cf-e6a17db0795b | E2E Multi hb2-muorwpfc                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
a5d6c873-5113-4b8c-a876-5ff717d166c5 | E2E Multi blk1-muorwv77                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
77684a1f-0f02-4393-8713-ecc9a6b8f13e | E2E Multi blkd1-muoryfay                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
f199e44a-8442-4932-9a9e-d775428142d5 | E2E Multi blkd2-muoryizr                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
0f1c0bd9-bacc-4afd-bbbc-3ae77d4d58f8 | E2E Multi blki-muoryn91                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
991f745e-9f14-419d-af37-b4d108f00863 | E2E Multi rls1-muorysr9                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
01cf5888-b074-455c-ba6c-fadd4a2a039d | E2E Multi perm-muoryxwb                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
87f2cdc2-e8a5-414d-8b45-08e774ce6c49 | E2E Extra extra-muos0wdj                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
4504123b-e688-4851-9ce8-80e373d15a3f | E2E Slug Sanitize muos0xjs                           | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
f7cafeec-becb-47b0-b461-dd37306396d7 | E2E Multi blk1-muos61c2                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
244cd0d9-11aa-4f61-9ff5-977ba1b3730d | E2E Multi blk2-muos65ll                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
55b56ce3-0ba6-4374-a334-2058b16cd979 | E2E80 CASH muosku99rowb                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
1b574265-7e2a-4139-bf01-96289f54d747 | E2E80 CAT muoskxorq43t                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
d181a07e-cba1-471a-86cd-f3cc2b6a54f7 | E2E80 DEV muoslsz6lqcu                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
2a91aebd-5acc-4863-81cd-d072599ff462 | E2E80 DEV muosm93ibh9e                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
e0c74102-471a-4587-bcc0-7657bd7e34a3 | E2E80 DEV muosmbxfifvt                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
605c53c1-59f2-4f73-afa5-3a23900f0bcf | E2E80 DEV muosmecwlif3                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
914c4473-0ed6-4d02-997f-ef35124ba2c5 | E2E80 DEV muosmgo1yi85                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
ce773bd5-6152-4675-8ca9-8b76d0008cd1 | E2E80 DEV muosmiwa0tpf                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
314e6253-c860-43c9-ad89-199e28971346 | E2E80 RBAC muosnk2t52wd                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
279764f7-bd77-4a8f-a865-e66df4d49a0d | E2E80 POS muosnjgklb35                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=4
06de9e4d-1982-4d45-ac67-e602fdff064d | E2E80 TRA muosntprzdeu                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=0
b914dfd0-44d6-44d8-991c-96d81d323cf9 | E2E80 TRB muosnudyt2lt                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=0
3f782d7e-4a5f-4ead-8703-bf0de63223cb | E2E80 CASH muosoqv37u58                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
47f1ed42-735a-47fd-a5c7-ae741cc7ec0a | E2E80 CAT muosotwhtn04                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
4b433ce7-9692-4ca4-88d6-d19ef5573519 | E2E80 DEV muospn5oot7z                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
b93c9045-35ad-44db-81ef-0530c68e9970 | E2E80 DEV muosq93gtl9e                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
4b6307a3-4d58-4790-8800-f3452f3fb999 | E2E Multi muosqag33y24                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
775cf0e2-5bb9-4f54-a20e-e71d8632366f | E2E No Addr noaddr-muosqbxi                          | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
ea49cb63-2bfd-4009-b3fa-71761e37552d | E2E80 DEV muosqe6z6ghf                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
54cf7d59-3919-4110-8399-a5f658f246c0 | E2E80 DEV muosqha276cu                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
fc12ce03-d17f-478a-8963-082ab8408162 | E2E80 DEV muosqm1e0lnk                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
0345b90c-ff57-4e3c-94d4-161b70a48d89 | E2E80 DEV muosqowkgw4e                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
18dfb0d7-a7e3-4315-9c94-426f5ced55e2 | E2E Multi dup-muosqcqq                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
fec68113-ff1d-4559-8239-fde06bb4b5dd | E2E Multi muossjxbqoi5                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
87f304fd-2488-4e37-ad4b-94e8fbb30363 | E2E No Addr noaddr-muossl96                          | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
6cff6ef8-fabc-4d06-bae4-83cc537a2c88 | E2E Multi upd-muosrndr                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
5db91ad4-c7a5-4ddb-9547-1423c9c3b41a | E2E Multi dup-muosslo1                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
52a4398e-fa7f-4a10-8b7c-1606451a59c4 | Updated Name E2E                                     | 2026-10-01 | inact  | Default Tenant | m=1 p=0 t=0
deea968b-3a2e-42e3-aa83-d249189d3918 | E2E Multi del-muosub5o                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
3d6e3724-13cf-4d3e-a39e-0b89b0d13358 | E2E Multi upd-muostxxp                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
e7cf7181-8bfe-4c67-81fd-c0b8f53803d6 | E2E Multi arch-muosvpbu                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
fa77ddca-2304-49ff-921f-bb12194b8135 | E2E Multi dblarch-muosvri8                           | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
723d76d8-9ff6-4212-808e-6e81dc158d04 | E2E Multi rest-muosvsev                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
0b301e50-3faa-4163-88b2-563c3dc9c1c5 | E2E Multi restactive-muosvtb0                        | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
36b28d6a-d4ed-48c3-96ee-9c39723221d3 | Updated Name E2E                                     | 2026-10-01 | inact  | Default Tenant | m=1 p=0 t=0
6a0a97a2-6907-4ea6-8577-572ff82b95e6 | E2E Multi del-muoswk9o                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
6b770eae-83b4-4fa4-9e63-83ffd7421ba1 | E2E Multi hb1-muosvuc0                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
64cc254c-2d9b-4986-86eb-a7302aa1a679 | E2E Multi arch-muosxx9g                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
f82d62fb-3654-4d89-9754-45d0ef09c2e8 | E2E Multi dblarch-muosxyyw                           | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
3ef0feca-17bb-4240-897d-716a2ddcec7f | E2E Multi rest-muosy05d                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
50004c1b-520f-4b8c-93b0-86e1fdedc9cd | E2E Multi restactive-muosy162                        | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
3c9c4c94-b5b0-4ad0-a200-98e62898ec51 | E2E Multi hb1-muosy23n                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
3576c717-4fb9-4111-9266-49f43c9e50b8 | E2E Multi hb2-muosz9lz                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
ea6c1aaf-5c1a-4aec-a525-9bd0de09c46c | E2E Multi blk1-muoszb7p                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
f46d1b29-96c7-474b-8029-fe835c362ae5 | E2E Multi hb1-muoszrp3                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
395a4111-7c36-4f86-a5e7-13628df92d9f | E2E Multi hb2-muoszst3                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
60e9a3c0-3b91-4057-903e-fc9a2f0cdbc5 | E2E Multi blk1-muoszuj5                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
6c4545fa-9b13-463e-82a6-807a5b2958ca | E2E Multi blk2-muot13na                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
12ab7058-2e3b-4608-9177-a56355e3b4e9 | E2E Multi blkd1-muot14oi                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
15365d3d-d889-4ec3-90ea-7bf33afd8122 | E2E Multi blkd2-muot15dv                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
7111aa92-ea62-45a8-a92e-8b7d6474bd79 | E2E Multi blki-muot2ee5                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
41bca8ff-5bdb-45ef-9472-9e67cc503b6d | E2E Multi rls1-muot2fez                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
8a99e079-0867-4692-95fb-40fc0579f95d | E2E Multi perm-muot2g5l                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
0a51f0f1-0533-474d-bddb-cafbe6ba3c7b | E2E Multi blk1-muot4iom                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
52e5fee8-1d97-4f1d-a104-6426083b1b21 | E2E Multi blk2-muot4jjz                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
bcabde9b-1dd5-43c3-9b65-696737f27614 | E2E Multi blkd1-muot4k8j                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
ef43e73e-51fc-49dd-b2ba-b3f3c3335d20 | E2E Multi blkd2-muot4koa                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
6ea6ad13-6d8f-43b5-be28-ddd43030abe0 | E2E Multi blkd1-muot76bw                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
377e4758-54fb-4e59-b534-8557888f66e8 | E2E Multi blkd2-muot771h                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
34b69a51-0d6d-4338-9a0c-d631518f7930 | E2E Multi blki-muot77s4                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
65edac20-61b9-4b3f-91a5-d3ab17334775 | E2E Multi rls1-muot78qu                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
7c984a9e-1776-4243-9069-ebf7a2d70ec2 | E2E Extra extra-muot7u80                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
cd3ae746-7ac0-4f94-85bf-1b29fa6758b3 | E2E Slug Sanitize muot7ufl                           | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
632e4faf-ed1a-48c9-93ff-295f63110609 | E2E Multi perm-muot79fo                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
865b398f-6e62-4b1d-b50a-e11c86a162ef | E2E Extra extra-muotbmad                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
94de9478-70bb-4d25-b867-94adecf36f2b | E2E Slug Sanitize muotbmqg                           | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
d2cf0963-4a44-4528-b3d1-e97ad3e97a24 | E2E Test Store 1790815630118                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
bf6f4070-892e-41bf-a7dd-c402f5d0649e | E2E Reset Test 1790815694662                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
3020526d-b2f6-4a31-9403-8df7d451af8a | E2E Reset Test 1790815697404                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
c593a6de-f67c-4312-8449-51338106e8d8 | E2E Reset Test 1790815758498                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
43c540fb-d822-49b3-b3a8-c6bf8be0d3f0 | E2E Reset Test 1790815759247                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
16d51392-1d42-422c-b5c5-c41c6ca62b9d | E2E Reset Test 1790815759915                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
fae65405-2871-492a-bd9d-9657aca65341 | E2E Reset Test 1790815886720                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
29989705-0a83-4406-9dad-8b2bf1c6c728 | E2E80 SW A muouskl10vgm                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
ddde67bc-f808-4bb7-8b44-6b1ecfea94d2 | E2E80 SW B muousplv6zn8                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
c4c1256d-8d9a-44a8-99df-7d6cd07b9661 | E2E80 FC muov2a1c0ws4                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
5dfff94d-1db1-4e54-a5a1-9d208bad85ea | E2E80 FC muov2pkdqra2                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
6a33eec9-8886-49a7-b3d3-980be4079376 | E2E80 FC muov33hgpwty                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
d02fa2c0-d2cd-4b81-b2c0-3202afd3d26d | E2E80 FC muov6o5lqj6z                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
557cd7c5-dbd4-441b-9ccd-1c51d19ce6b6 | E2E80 FC muov7e625qs5                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
807274f6-a431-4666-99ef-442642533129 | E2E DIAG FC muovauqb                                 | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
aad8a5ac-84db-4e58-8f98-e4f132e46e22 | E2E80 FC muovbzjlctx6                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
e262160a-1228-45e0-9e91-571e1155bddd | E2E80 FC muovd0lt8vux                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
7833cbe6-eed9-4f92-b365-43eac84ad86a | E2E80 CASH muovfcwjnl9u                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
6c053b23-de93-48df-986b-efb12e97155d | E2E80 CAT muovfishnrmm                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
e002593e-9736-4490-abc2-dde79de34db7 | E2E80 FC muovfzqkuwz5                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
cf1d4c7b-a581-4aa4-b7c5-06f3bdf916c4 | E2E80 DEV muovgm53ltp8                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
15351f07-cb43-4c9e-9065-dcec6dc39127 | E2E80 DEV muovgr1mm63p                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
1c3e96ba-57e3-417c-987d-5cee4e19f83b | E2E80 DEV muovguqt5nf3                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
59e3d2d3-4278-43ce-b201-cba89a6faea7 | E2E80 CASH muovgvjykrvg                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
b9bb3341-575a-48b7-9e28-7aa3213806e8 | E2E80 DEV muovh0mvjcrc                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
b633a615-3a1a-4426-90a7-03fe4e690b74 | E2E80 CAT muovh2xofs47                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
0588fdd1-6207-4450-b41a-34ba72361110 | E2E80 INV muovh5gut1nd                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=0
9b6e323c-15df-431f-971f-c0e3fa3bb5e6 | E2E80 INV-UI muovhabjhoym                            | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
93e29721-dae4-42f6-a2f5-3775027bdce0 | E2E80 DEV muovhz02mhzr                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
1f86b207-a5bb-4381-8788-3d7ceaabe344 | E2E80 REV muovi1i444np                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=4
05a1b4fe-8666-4649-8259-650818cf3904 | E2E80 DEV muoviesoh2ph                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
546ea0e3-fbce-4a1e-9e03-2956d573142b | E2E80 RBAC muoviibt6zqx                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
28f95cf4-ce2f-4586-9d68-6396f83aac6a | E2E80 DEV muovik1wvmj2                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
47d6f8c7-29f6-49b6-b039-86b1deeef670 | E2E80 DEV muovinyqy2gk                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
2883f2cd-8a95-4f14-aca9-7b65db6513b4 | E2E80 TRA muoviqujudt9                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=0
fb810e2f-7cdf-468a-85fa-48bdfc490de4 | E2E80 DEV muoviuh52zbl                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
3af6e5bd-03a8-41d7-8b2c-50ec60c26ead | E2E80 TRB muoviw4a7zd7                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=0
6ba221b5-6ce5-4b5b-a2fe-bcee78a3c779 | E2E80 DEV muovj0hicv1x                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
5283fac8-e5e2-4a65-a7df-d7f2badccad5 | E2E80 PROBE muovjcwt                                 | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
30acf72f-b3db-4ab1-9fae-275bbb467a57 | E2E80 CASH muovjnrv85lv                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
4c7187f7-e445-4dfd-8b23-8940d9bbcb69 | E2E80 CAT muovjqh6owhl                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
b3b53e0c-9e73-4fe1-a5c4-98262cd5b05b | E2E80 POS muovjrvukebv                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=4
fd71c9aa-3a0e-45a3-a4f6-47d679aa6b21 | E2E80 PRD muovk7e8z6dj                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
3e6c0a83-fb19-469e-8307-2ae9b9e9f9f3 | E2E80 PO muovkb0qofgu                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
0a3829a3-6aa7-4d7b-96bb-68f028f1eab0 | E2E80 CASH muovkha0k1j1                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
1f176a34-8b00-4eb3-8eec-9e739212b8cb | E2E80 DEV muovkj2xkys6                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
95b798ac-5a66-433e-924e-d24950d0d72b | E2E80 CAT muovkk47ijm2                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
67600e03-2d61-4ae4-8e78-613c15b57a41 | E2E80 DEV muovl3nj9130                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
1c8ce990-4f06-4162-911d-124e799d9d36 | E2E Multi muovl5v3l12v                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
dd174a52-2bca-4db3-89d4-ffb253c4edd5 | E2E80 DEV muovl72t2hut                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
1631fad0-be33-4295-b4db-4957e8966298 | E2E No Addr noaddr-muovl9hg                          | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
b54c50ca-ddad-43eb-b440-735c6eb903e2 | E2E80 DEV muovl9r6ks97                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
d8fe2d7d-5c58-4e2f-9101-fb3512334655 | E2E80 DEV muovlcsaam5p                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
45a1bf43-ba5b-4c74-990e-fd547efb20bd | E2E80 DEV muovlelgkm5r                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
24a3182b-3453-41f2-ac71-b9c76418cb47 | E2E80 REV muovliixgd5i                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=4
b1fef132-13bd-40e7-b18b-be13244997f1 | E2E80 DEV muovljk7k4b1                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
5c4899ab-d288-42c2-a56a-1d3f11a3e539 | E2E80 DEV muovlvfc9hsb                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
d3b6acc1-e305-4677-9242-3a5fca86a968 | E2E80 RBAC muovlvo06v8j                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
9806ffda-113d-4ade-97d8-628084e8c0f5 | E2E80 DEV muovly44ley1                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
ce603c64-5dce-49a4-8950-6f820b9f94c0 | E2E80 DEV muovm0a8l95f                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
43354bec-b2c2-40c8-99d2-44c9166af8c5 | E2E80 DEV muovm2deaevu                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
1acdce60-68c2-4cb8-8c05-e0482155ac13 | E2E80 DEV muovmctu3k3v                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
6d9a5211-daaf-4238-9f47-fd0f1533ad1c | E2E80 RBAC muovmffp18rs                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
77acf9a1-64f0-4f11-bf16-f6b7fa402035 | E2E Multi hb1-muovmgkf                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
f9584c64-81e0-4a31-892f-3f6a21b8f72d | E2E Multi hb2-muovmhzz                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
0827b979-eb32-4145-8477-89dade4d7c14 | E2E Multi blk1-muovmk1w                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
4e5dae0b-326d-4f25-a8e2-84f436d8ca00 | E2E80 TRA muovmov0x71b                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=0
9df3b274-3cc5-4a94-94ba-70d3d3e3874b | E2E80 TRB muovmtizvc2f                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=0
2926cb23-b6d8-4a94-b341-238534023413 | E2E80 TRA muovn69mhcvw                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=0
266f669a-22ac-41d8-9c1b-32206d33958e | E2E80 TRB muovn9b12v8i                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=0
1e6156e7-f78e-44e9-a317-6be9b51a05e2 | E2E Multi blk2-muovmlc0                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
7c152c79-be0f-4c26-85a9-76be9426d1aa | E2E Multi blkd1-muovnt73                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
f83681d0-bfee-4231-9fb5-43c9e99ff741 | E2E Multi blkd2-muovnuzd                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
271a2b99-a33f-4902-91be-8a7b58a5123a | E2E Multi muovo1ms6hmf                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
166a62f8-9465-461d-a731-cb30cb663432 | E2E No Addr noaddr-muovo2i0                          | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
3f6dbd44-dcc3-4bb8-8fe6-3b700693f86d | E2E Multi muovogvbxone                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
97c876e5-0549-4ba3-a392-7571d75a2bb5 | E2E Multi muovoi9jou9t                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
fde6aa32-4033-466b-ba9e-7acd450c6c15 | E2E No Addr noaddr-muovok08                          | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
ee393ff9-e006-4fd2-a280-bb63d4839b31 | E2E No Addr noaddr-muovok2c                          | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
7e143c35-4569-4872-9cc8-2e91625e9c84 | E2E Multi dup-muovolpd                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
67e709ca-d3c6-40d9-b3ff-44df6aeedeab | E2E Multi blki-muovnyyt                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
0d714863-201a-48ad-989d-6bc644bc042b | E2E Multi rls1-muovp4cj                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
c24f5fe3-4eea-407c-a823-d5dd7953a6cc | E2E Multi perm-muovp6co                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
d42a4ad1-f14c-4739-86df-1edc56ee0061 | E2E Multi dup-muovo2vw                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
f281e098-ed66-44cb-8f5d-0f8dfcd65d6e | E2E Multi hb1-muovpttz                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
b5ec4cd0-65f6-4919-9ad3-852c7cbef076 | E2E Extra extra-muovq6zh                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
3eb7666e-d8f0-450e-9057-921aedf49527 | E2E Multi hb2-muovq72p                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
b4d9110f-acd6-44fb-87c4-ec4305b35db8 | E2E Multi blk1-muovqgrr                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
030c348d-90fe-4019-94a7-7f41445bb1c6 | E2E Multi dup-muovqsq4                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
b912fd98-770d-4388-ad40-26757f89b2d4 | E2E Extra extra-muovr6ef                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
1a5143c7-74ae-4c97-90ee-0e6c0788f2ef | E2E Multi blk2-muovqsci                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
11ad8558-b697-48af-8f64-01783ba72a27 | E2E Slug Sanitize muovrq9y                           | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
352740b1-0ff1-41d9-bfd8-4fd1afd9ee72 | E2E Multi del-muovrywa                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
6bff830e-45c9-4643-a312-b67bb31a630e | E2E80 FC muovsifxy0ei                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
925c0839-9f49-4b09-9541-38edbced26f8 | E2E Multi blk1-muovtahi                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
af840864-0088-44ef-837d-174b7bb82714 | E2E Multi blk2-muovtiyu                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
d7e5a076-e6d5-4c0a-b8d6-fe5d438d3440 | E2E Multi arch-muovtr32                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
e075e2e7-13c2-4e38-9e00-683a79a96e5d | E2E Multi blkd1-muovtrgi                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
d38aac41-d204-46bb-9459-72696b913e58 | E2E Multi blkd2-muovudh1                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
b3c0e772-13f6-43d3-a981-c5cff6e13f7b | E2E Multi dblarch-muovundt                           | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
037c377f-f3c9-4c45-960c-02bd99fb45b8 | E2E Multi blki-muovv092                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
55656c19-bce8-4146-9b55-655144158fb6 | E2E Multi rest-muovv321                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
439b4d58-bbe5-435a-92f6-cfacea1d8d06 | E2E Slug Sanitize muovvy45                           | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
c1c9eedf-dc87-4974-b5f9-9388f8350f13 | E2E Multi restactive-muovw1b7                        | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
3e49f0aa-7a66-47a7-94cb-42f377752551 | E2E Multi rls1-muovw11e                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
06583f58-7623-4309-bdf2-68c997b6381c | E2E80 FC muovwafrkury                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
2e4acf7a-1336-4372-9db9-2714539ba28b | E2E Multi perm-muovwfr7                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
42ced129-a32b-4451-a69c-9e3a12e47a35 | E2E Multi hb1-muovyzab                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
dba1824d-e88f-4233-8a7c-038684130a71 | E2E Multi hb2-muovzako                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
df8fb57d-cfbb-42a4-ad84-dd784f434aad | E2E Multi blk1-muovzdjm                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
58e4f678-3657-403a-ae2d-842701349234 | E2E Multi blk2-muovzfnf                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
a6f6abed-1445-46ff-b6cc-00fbad115d30 | E2E Extra extra-muow09im                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
64662b99-db89-44ee-9982-26ee0419faa0 | E2E Multi blkd1-muovzmxg                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
8eaceaea-d688-4ba8-977d-00ac2f0b6903 | E2E Multi blkd2-muow0n8g                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
bd636b95-5443-4e44-aebc-120a5b93a182 | E2E Multi blki-muow0uq0                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
c2b9bb26-79fb-4dc6-8a28-cd8dddb502a7 | E2E Multi rls1-muow1yi8                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
1f97d2f3-29ff-4f91-b2bd-055a4200a14a | E2E Multi perm-muow22qu                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
9e8c3dc9-23b7-4b05-aaa8-62b5f5a144a2 | E2E80 FC muow2fiargts                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
9082d724-c049-4b39-8824-df2d2b027552 | E2E Test Store 1790820142106                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
676de5f1-b3b0-4c6b-8a8e-6547093397cd | E2E Reset Test 1790820212480                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
f69c1d0e-5142-41cd-8019-8a82aad3e2a9 | E2E Reset Test 1790820215705                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
21062a3c-076f-4bcd-8c33-1775962dc3db | E2E Reset Test 1790820275357                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
b3c45c01-746f-48c2-acd0-08bd317ad11a | E2E Reset Test 1790820276739                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
73f9f36b-4783-4121-8a8f-4384023fc667 | E2E Extra extra-muow85ms                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
6e7413c7-39a3-4635-a381-8d937dd77337 | E2E Slug Sanitize muow85x6                           | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
88a0c5ab-8736-43e8-a2bf-a33592d7fc5a | E2E80 FC muow8f9y5cy6                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
1696bddf-1bd7-4cb9-b5c7-9632c0f79327 | E2E80 FC muow9we1ag5o                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
c90a737c-b2af-4dff-aa61-e6fbb8229edf | E2E Test Store 1790820515396                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
e837875e-4fd0-4c3b-b83d-9e4f48777258 | E2E Reset Test 1790820578989                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
96c3a45c-1a90-41fb-a7b8-44793dc3a274 | E2E Reset Test 1790820581132                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
44e49a25-0dde-4b55-9605-8b10990c0596 | E2E80 FC muowd0k26xtj                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
3e745818-521b-4896-a1d5-ccdf0f0830c0 | E2E Reset Test 1790820641748                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
c2ce69f2-7959-4209-835e-3dfd17dd00dc | E2E Reset Test 1790820642540                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
db03eb5a-7966-4ca5-a79f-ebbe4d0af869 | E2E80 A11Y muowfw9clo2i                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
6ee72637-40cd-400c-84e8-4922f6be8958 | E2E80 AP muowiekxkvek                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
3f9f2386-4a52-4dbb-bc5d-8d812ac7842a | E2E80 SW A muowj1lnxwrj                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
9225827d-ca55-451e-9cfd-623731953956 | E2E80 SW B muowj652kswt                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
67e17b0c-d2a5-4749-99ad-3ee7d1ed3c1e | E2E80 A11Y muowuci6wpvg                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
c8b25ae4-3a3f-4e25-9c10-ffbececc387a | E2E80 FC muowvds3r2yk                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
45d8318b-78ed-42b3-a267-0733c120c437 | E2E80 AP muowz1dz7eyd                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
3daec2df-deef-413f-a54a-26993ed4de76 | E2E80 SW A muowze1ka3sd                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
6b179efd-7de2-43b6-8d04-1bbd6be334b6 | E2E80 SW B muowzio74d36                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
4f3e760c-51a8-4fd0-ad3f-efe15ec1b516 | E2E80 SW A muoxl0o8oc88                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
dd5e759d-a5a7-4129-895e-09958bbb8056 | E2E80 SW B muoxl6ccjgoc                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
0816c493-f971-409e-9bbb-48beaaace035 | E2E80 FC muoxo3nedgte                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
bbf2b5aa-9fcf-4f17-a4be-140c8fd5f008 | E2E80 A11Y muoxqkc3xinr                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
b9665ae2-01cb-4dc3-955c-8f9f67615541 | E2E80 AP muoxt3k55gb2                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
8deb99cc-93e2-40d8-86a5-49c8d19f218a | E2E80 CASH muoypnkj50ud                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
32156c7e-0ead-486e-835a-51002e47b0fe | E2E80 CAT muoypvi8m9ei                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
b70166cc-0ebe-4479-8ba4-0a4c0cff1a92 | E2E80 DEV muoyqrtxsdm2                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
9fb37189-6026-4840-86f4-713f8289af2a | E2E80 DEV muoyr6h17spm                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
4abda54e-f035-4801-8c8e-17a699c7013a | E2E80 DEV muoyr90uyijw                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
7f02f8de-ead3-48fd-833f-17362058c583 | E2E80 DEV muoyrbje7xqd                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
e45ce584-8ffa-42b2-af45-8bd544e8a6fe | E2E80 DEV muoyrewuaomb                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
9da6cba1-2777-46dd-bf0c-2207752a9831 | E2E80 DEV muoyrh94umi3                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
3264e449-e020-4c2a-8751-236d36e0d8b6 | E2E Multi muoyt4tckzya                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
6062a9c4-bb12-4b5e-ad4d-84649c4be300 | E2E No Addr noaddr-muoyt6no                          | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
dfb951d0-001b-4ab1-8e12-4a362a5c5ef9 | E2E Multi dup-muoyt74a                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
1fd6584e-aa25-4482-a338-326e1564da93 | E2E80 CASH muoyvqtvs5yo                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
a7a50cd1-fa78-4ce4-bf38-a56661b41ca0 | E2E80 CAT muoyvy0zg5dr                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
57fc8c43-2518-4131-9242-61668ad62c8d | E2E80 DEV muoywut5pfzw                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
951b8484-61a5-410e-95c6-c34bf143ca56 | Updated Name E2E                                     | 2026-10-01 | inact  | Default Tenant | m=1 p=0 t=0
4de39040-60b3-47fd-857e-f1150400a33b | E2E Multi del-muoyx4uv                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
da699281-6758-4ff7-a67e-4ef1055b586c | E2E80 DEV muoyx96y7yj6                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
32034dcf-db83-4fb9-9241-751d86904803 | E2E80 DEV muoyxdw55kk3                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
a0587633-4647-4ffa-b651-0c630f3ada06 | E2E80 DEV muoyxkgvx2fr                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
ba8644e1-8e55-4849-88a5-4cc9ebce18e1 | E2E80 DEV muoyxppe0mx3                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
0920e818-7e25-4f85-be34-826c3c5cdacb | E2E80 DEV muoyxud65gaf                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
82aa6dfb-fde9-4ef9-b014-3ee9fd1574ee | E2E Multi arch-muoyygqt                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
6cf837a6-2a49-44e8-a801-c1a131e18db6 | E2E80 INV-UI muoyyi53sldr                            | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
57a40def-cd5a-49f7-a1cd-843e5487e145 | E2E Multi dblarch-muoyyljt                           | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
ae21019b-91c5-4b73-a33e-678279e7eaab | E2E Multi rest-muoyyv8j                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
87dfee0f-c038-4cc6-bb47-406974279f7f | E2E Multi restactive-muoyz0sj                        | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
344a79e2-8dad-4f7b-95af-a44adf299a3d | E2E Multi hb1-muoyz738                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
270c881f-5f81-40fa-b09e-e3f7d3b79b64 | E2E Multi hb2-muoyzsyq                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
01ae1fee-7b7f-4512-ae5a-4b1b9907ced1 | E2E Multi blk1-muoz09j2                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
35b1f34f-ad4c-4095-b45e-4c99c3e442fb | E2E80 POS muoz162h8s2t                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=4
f3cb23fd-131b-4721-bb9c-bef4aadedc2f | E2E Multi blk2-muoz13y4                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
bc8a7685-0c27-4e32-872a-0340f443cfe3 | E2E80 PRD muoz1jpputaf                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
69ec5c2e-432b-4da2-9abd-d0f917a6bdf6 | E2E80 PO muoz1nxqs1p8                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
ede3c768-0071-43e2-9fb2-35d4fd6c44a9 | E2E80 REV muoz2vz4urz6                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=4
b6162d74-f2e9-4471-ba12-d91ba0997c53 | E2E80 RBAC muoz368y1qag                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
c87b98eb-8869-418a-95c4-488ea3fcabbd | E2E80 SW A muoz3cmneyrj                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
5baaa0d2-19e8-42ab-94c2-379398a64380 | E2E80 TRA muoz45c3l2ox                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
756c4e5a-9fe3-4f67-989e-b9a06aeb16bf | E2E80 TRA muoz4hc6pokx                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=0
71c37543-41d5-4b24-bc5e-bf3a98d0e501 | E2E80 TRB muoz4j25rtq5                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=0
0b7a934a-6354-482b-8ff5-8c2223ab6d22 | E2E Multi muoz645dmnyo                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
7e6960e3-de10-424d-98da-55bfa926d91b | E2E No Addr noaddr-muoz66ld                          | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
e03728b3-66aa-4bb6-bd88-138ba9a0fbfd | E2E Multi blk1-muoz6rqb                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
1c764b8b-6f26-4444-a5d8-ffa10268e431 | E2E Multi blk2-muoz6toj                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
b80109a3-a0a2-4cf7-9465-590fc0a26938 | E2E Multi blkd1-muoz6umh                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
b417b749-5e95-47a9-997d-235cb9aadeda | E2E Multi dup-muoz67hc                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
277e9069-1ecc-4a0d-b850-2a709401d317 | E2E80 SW A muoz7kwpb91g                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
03528a74-5d61-4072-bc06-6c05604b1294 | E2E Multi dup-muoz8uop                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
691339a1-8853-4736-b79f-4e0944b06384 | E2E Multi blkd1-muoz9gg0                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
e528d687-7e27-4370-8212-902b91fd842c | E2E Multi blkd2-muoz9hm5                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
a714f3da-b404-4d7e-abc0-b1a0c872927f | E2E Multi blki-muoz9ixm                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
75e75a0f-2dca-496a-b1cf-4393240059cd | E2E Multi rls1-muoz9k2d                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
f0a682d8-17a9-40bc-8abf-8bd8b0e7e277 | Updated Name E2E                                     | 2026-10-01 | inact  | Default Tenant | m=1 p=0 t=0
6e9271b3-f7fc-4773-9929-9699c1f304dd | Updated Name E2E                                     | 2026-10-01 | inact  | Default Tenant | m=1 p=0 t=0
20b3b964-3978-41ab-84b4-14c1abc9e284 | E2E Multi del-muozaehl                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
31cb5137-4cea-4088-808b-bc73e6f0c5aa | E2E Multi perm-muoz9kxc                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
e40cc333-2f68-47e9-a6a4-a64c060c293d | E2E80 SW A muozarfgfy4i                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
a0a71dd7-a552-4d15-a497-6d5af45e49ca | E2E80 SW B muozawaures2                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
d7897d9e-b60f-4991-92bb-d06d686576d4 | E2E Multi arch-muozbuqr                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
f9f28cd1-d797-4bc5-93c8-4dee605179c7 | E2E Multi dblarch-muozc7jz                           | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
9f6422f1-813e-4e57-973b-a645885d8e74 | E2E Multi rest-muozcbl0                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
0564f459-c8a2-4d83-83da-2e7284c650ba | E2E Multi restactive-muozcq82                        | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
29e372ab-ab09-44f4-b0f9-a5f70308fa07 | E2E Multi hb1-muozd11i                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
4d062b98-3398-4c74-b606-71a20366bace | E2E Multi hb2-muozdcvh                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
7338f176-876d-4a78-8de5-dfe4ed0334c6 | E2E Multi blk1-muozdyoc                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
7ba2f0b2-55b5-4999-9fa0-b205f6254d41 | E2E Multi blk2-muoze6b7                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
53c3c2fd-31dd-4a75-825a-301c21b4fbe3 | E2E Multi blkd1-muozew8e                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
06770449-399c-4c77-bedd-148ae6a34855 | E2E Multi blkd2-muozf2ci                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
2a96c015-47e1-415d-8ec8-d5a1e7551d97 | E2E Multi blki-muozfwrq                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
b75815b1-d2e4-4339-a4e3-20224ded9084 | E2E Multi rls1-muozg7q7                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
c2e3ccbd-76a4-4567-b819-09ed61f86af6 | E2E Multi perm-muozge08                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
adcb5c70-bc79-45d0-bef1-942027f5a706 | E2E Extra extra-muozorkl                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
3a078650-3562-4815-b6ff-d4a955d20620 | E2E Slug Sanitize muozos5z                           | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
5f7fb02a-8f5d-4057-a4e0-e3c9d70079dd | E2E80 SW A muozoxhqiijw                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
bd43035f-d5db-4bf0-b799-9670f64673e4 | E2E80 SW B muozp1jisofr                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
d6c2acfc-1e3c-4b4f-9fcc-96f8e8bf6bf4 | E2E80 SW A muozqcfttitn                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
2e9440b3-5cd3-438a-a38c-e6f9dba05780 | E2E80 SW B muozqgo796hk                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
f6049835-3fbc-47f1-822e-7886a7793784 | E2E Test Store 1790826349117                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
65910aaa-a21d-40bd-a7e9-bb87b1a82973 | E2E Reset Test 1790826422198                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
47976cd1-ba2c-4e87-905e-c9847548eacf | E2E Reset Test 1790826427321                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
64718c27-7b23-43e5-82ca-0b1d94791662 | E2E Reset Test 1790826488572                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
3944e591-b468-446d-9bab-e39245ee6050 | E2E Reset Test 1790826490987                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
e970199b-1ab4-4a6f-9e00-aad5b6f3dcad | E2E Reset Test 1790826493227                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
1e7ea466-7472-4de3-bf2a-b47a0d7223d2 | E2E80 SW A muozw2hue9nb                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
83f03109-ffe4-4256-907c-dcceb2de5bb3 | E2E80 SW B muozw7ktvt2w                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
f2717400-9837-487c-b66f-75901cd2c315 | E2E Reset Test 1790826622292                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
9c10e1a6-b144-43cc-811c-0257e9c81511 | E2E80 AP mup01bgicvt0                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
aa2334c9-942d-430b-ab11-a53a746d1100 | E2E80 A11Y mup01q1a7wgu                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
e49e6784-adc8-4599-a641-2520080effc2 | E2E80 A11Y mup02g2ay6xk                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
ad016646-74bf-4b33-8c12-313417800eb2 | E2E80 FC mup03b102nya                                | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
8184c7c4-77cb-4d60-998d-4e71d612c448 | E2E80 A11Y mup0b06w15xb                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
44f60c43-e989-4225-ab1d-1fe4e03f7b59 | E2E80 CASH mup1cga9f0lf                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
bbf20f8f-348b-4536-9785-37e1b10ddc43 | E2E80 CAT mup1clux7x7t                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
74e4647e-6cb4-4e6c-801a-020ee5017b88 | E2E80 DEV mup1dg538d5v                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
2824d431-78c0-49b8-93ce-19142dd2d7f2 | E2E80 DEV mup1dxgd0tat                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
567a2050-d6d2-442f-8807-788ec2f5ce39 | E2E80 DEV mup1e2ryju4y                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
e2a20c07-0180-4fef-8fd6-7e42715f0141 | E2E80 DEV mup1e7akoxo5                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
aac564e3-33f2-489b-b830-2c21ad603f1a | E2E80 DEV mup1e9jatkv3                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
cd6c27f1-d51c-423b-a3b7-bd3f28f81fca | E2E80 DEV mup1ebid3abb                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
dda0d5d6-0ed0-4bb0-9be0-e45e13fecd39 | E2E Multi mup1g32dofy7                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
55577b24-138d-404a-a803-5927bf23b247 | E2E No Addr noaddr-mup1g73u                          | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
86cf0aaf-0a8d-4aec-a6fd-7f5b59aa0401 | E2E Multi dup-mup1g82k                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
ddb9ab19-6b29-4426-8c4a-d31985b1c217 | E2E80 CASH mup1hs59iqmt                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
98fb7665-f907-46ad-971b-a6f4bf7d6e2d | E2E80 CAT mup1hxfw2h61                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
6b67c8a2-d03f-416b-acd7-d61260fee81e | Updated Name E2E                                     | 2026-10-01 | inact  | Default Tenant | m=1 p=0 t=0
31a68827-21ee-4bf6-8fea-b7e8fa9bd2fb | E2E80 DEV mup1ivhmco5y                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
2a366be4-4340-484e-a2e5-87f415cb8e86 | E2E Multi del-mup1iylg                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
7179b2ce-1872-4eef-ae13-e462c461f982 | E2E80 DEV mup1jaoprydc                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=1
660a2788-6793-4d85-8552-4c560c6a1fc6 | E2E80 DEV mup1jfnhqx0a                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
a9b5c730-fe8b-4e66-a155-6621af52203b | E2E80 DEV mup1jixahghe                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
87797a53-dee0-4ffc-be8f-4fa53812de93 | E2E80 DEV mup1jlyvovtp                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
f9058526-3918-4737-aeb4-28e26ba463e5 | E2E80 DEV mup1jp7shh8j                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=1
a05f05a7-57d4-477c-ba27-bdeedc03b764 | E2E Multi arch-mup1kaai                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
d6c100a3-6890-420e-a349-e7071d3671a0 | E2E Multi dblarch-mup1kbjb                           | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
55ac1191-50d8-4491-8e11-e5f70ab3f3b2 | E2E Multi rest-mup1kcnf                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
1b631000-9f29-449d-9acc-fde5e8fd3874 | E2E Multi restactive-mup1kdfw                        | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
771ba194-4cc4-4c8e-95b0-e68d998fd125 | E2E80 RBAC mup1kmgz2wbv                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
948c14af-6cd7-49e2-a7b8-7d85767131b9 | E2E80 TRA mup1ku7b1n66                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=0
8dcc3462-865a-409c-b693-bd9f0206c2f2 | E2E80 TRB mup1kv85w8yx                               | 2026-10-01 | arch | Default Tenant | m=1 p=1 t=0
4c9e4739-6b4b-4d60-aaef-f796075546cf | E2E Multi hb1-mup1keuy                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
756a70a2-d277-43c3-9b42-e6d4b148f52d | E2E Multi hb2-mup1lmii                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
7964b079-9d31-4f22-920b-c80d74e4eb7d | E2E Multi blk1-mup1lot2                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
a87e53f0-4c0b-4031-8119-7c4eb13c5dc6 | E2E Multi blk2-mup1mwhp                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
3452b6af-23cc-4386-ba0a-637480e314a4 | E2E Multi blkd1-mup1myr9                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
f5c69661-b51f-42ff-b087-9fc0eb22dc61 | E2E Multi mup1nb1gwmkb                               | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
400238cb-809f-4191-9a83-d217ee23201b | E2E No Addr noaddr-mup1ndtu                          | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
6759ce10-d063-42c0-8776-04d20e9dfbb7 | E2E Multi blkd2-mup1mzn0                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
9e36f5a1-520b-433e-895a-01a4ac293543 | E2E Multi blki-mup1o7it                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
bfddf260-a0d8-4b00-a26e-8457131ee743 | E2E Multi rls1-mup1o9xa                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
ba1e8c4c-aa4f-47ce-ac6c-b71e8f503a82 | E2E Multi perm-mup1oaqw                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
b1065f66-93fd-4469-9cd2-dfead4c65e0a | E2E Multi rls1-mup1omk9                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
068ff6ee-ed1c-4c45-b33d-ab3a3c3ec11c | E2E Multi perm-mup1oo72                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
ba67bbc4-0313-4f3c-bb3c-d34050482f89 | E2E Multi perm-mup1q12j                              | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
e2f4b61c-aa89-41da-8b0b-8a740415e045 | E2E Extra extra-mup1qk2x                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
e2641223-8f14-4ab5-a669-0c0cda69cad0 | E2E Slug Sanitize mup1qldr                           | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
e3510189-2116-48f7-9fa0-bbc5c4dcaea4 | E2E Test Store 1790829811139                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
a51fbf45-d794-47cd-9ba4-d6c2627aee87 | E2E Reset Test 1790829877977                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
09dbbfff-befc-492c-8b4b-55b396bc7c35 | E2E Reset Test 1790829881350                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
ff61dfb6-0f7a-4b6c-b05d-1e77670af8d5 | E2E Extra extra-mup1wpdt                             | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
f986f752-6680-4b65-b78b-5af08c4ae6c0 | E2E Slug Sanitize mup1wplw                           | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
4f9ee9c8-86dc-43e8-987d-af26b114dd0e | E2E Reset Test 1790829942905                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
9b7f35de-ef82-487b-90d4-558ccaaa6309 | E2E Reset Test 1790829944782                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
22bad64d-ff05-4885-b7ad-9680254caced | E2E Reset Test 1790829946194                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
49fbb288-33a1-4f36-8fdb-f8b8b75a124f | E2E Test Store 1790830046204                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
18df5fec-435f-42b6-b15c-1acf98c0d059 | E2E Reset Test 1790830076358                         | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
082744c0-021e-483f-964f-d505705c9100 | E2E80 AP mut04iww7oxu                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
17c67387-c0d0-4a89-83f0-568875f23cab | E2E80 A11Y mut04su2f4ry                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
b443cb7e-c490-4248-ac83-f24b324762b7 | E2E80 FC mut0594mfj4h                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
ec27c9e0-343a-4e0f-b0a2-64076919b80c | E2E80 FC mut05ysaawnw                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
6cd313eb-1d21-4b46-b335-63657fdf65e3 | E2E80 FC mut06huakb2w                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
fca1ac0e-26d6-45f1-938f-9593b82acb7a | E2E80 FC mut072s2r4ya                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
205874d8-073a-47f3-8115-1c67cf8f474a | E2E80 FC mut07minvrmq                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
9110dfd1-15e7-47a6-965a-f2e17dea7758 | E2E80 FC mut084xzm1n9                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
d0a255a9-454c-48c6-8958-f86b8f9042ac | E2E80 AP mut08n3c036d                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
2056606a-237e-44f1-87ad-c86be5f695c2 | E2E80 FC mut08obd38n7                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
25cd2c39-2dc6-43c7-af3a-51db96a8de77 | E2E80 A11Y mut08w8at6at                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
2ca5d1e8-f872-4d10-8859-c423ddb93ddb | E2E80 FC mut09nz40di1                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
de40f5e1-7109-4fa0-a77c-e52e588c99fc | E2E80 CASH mut0agit1zcv                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=1
9a1e0499-34e7-47f3-ad5d-7a2ae63ac106 | E2E80 FC mut0ajqq6shg                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
bc275f65-14ec-457d-b39a-624104d38fcc | E2E80 CAT mut0b0hs2o8e                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
58e8914e-bbb5-469f-bde6-ddaf97ee88d9 | E2E80 FC mut0briaz6q5                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
aec9649b-8386-4d1f-b813-b85a5eba7850 | E2E80 DEV mut0c7mndb10                               | 2026-10-03 | arch | Default Tenant | m=1 p=1 t=1
54084a9b-99f7-4a8e-b704-170b5fb9e9db | E2E80 FC mut0cd8ag32g                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
f28b9e4e-2b0d-4a16-8af1-15b20a028fde | E2E80 DEV mut0cee6bv2v                               | 2026-10-03 | arch | Default Tenant | m=1 p=1 t=1
caaf064d-6fe2-42be-990d-82965734b8cd | E2E80 DEV mut0chkua8ei                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=1
0c77b9a7-3c84-4447-9688-0edb71dc6640 | E2E80 DEV mut0cjtiigdp                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=1
dbaff865-6c2f-4ec9-bc22-d53ed754badf | E2E80 DEV mut0clvkbfg5                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=1
da38ef67-4258-4636-837b-184fd14480be | E2E80 FC mut0cw3c9sve                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
4122bd67-9bf7-40ce-ae1c-6ee9c54f4140 | E2E80 FC mut0dfvrtsts                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
daf05789-d489-4ffd-99a8-049a3a05d070 | E2E Multi mut0ebled7dc                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
7c0309c7-e0cc-419f-a580-1ff98c37ea84 | E2E No Addr noaddr-mut0ecmz                          | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
c9cfbf5f-784f-4275-96f6-64ea7fb123c5 | E2E80 CASH mut0eu49h8jp                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=1
bb5fa8c9-c6e2-4a48-a557-b70b634fe280 | E2E80 CAT mut0ez7x5eaq                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
6a30903c-daea-40e4-8980-32e065d58506 | E2E Multi dup-mut0fo3f                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
70c45c0a-539e-48c5-8b5e-ad6ac02f7c68 | E2E80 DEV mut0ft3hacgc                               | 2026-10-03 | arch | Default Tenant | m=1 p=1 t=1
5876f23e-d1b1-4255-8b22-8845c18b37bd | E2E80 RES190 mut0g4ec                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
38692bd4-3e8d-462f-b631-1ac58282c5cd | E2E80 DEV mut0gbpieupc                               | 2026-10-03 | arch | Default Tenant | m=1 p=1 t=1
09e528e7-c178-4dad-a4fe-54f464e997fc | E2E80 DEV mut0gff40qlc                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=1
d3797ea5-0515-4fdb-ab5d-b78adc3f4469 | E2E80 DEV mut0ghtjm736                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=1
de187808-abc1-4790-8d8e-0defcfbe9bb4 | E2E80 DEV mut0gk2dkfu4                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=1
e35f0f89-43fb-4025-935d-b0e81dafbcc5 | E2E80 DEV mut0gm852g03                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=1
99247a49-9111-49b6-8fb9-df9aa69236a0 | E2E Multi upd-mut0fpfp                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
bd247564-b4db-4e68-939b-84adcfeb1e35 | Updated Name E2E                                     | 2026-10-03 | inact  | Default Tenant | m=1 p=0 t=0
89398f11-3824-4423-8121-15cb5aed4492 | E2E Multi del-mut0h1t6                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
142ea889-6f63-4f03-9bb3-fa145256110b | E2E Multi arch-mut0id95                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
1eacb850-8246-4ef5-b9e7-881e17284d4d | E2E Multi mut0ie4zmvg6                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
3d7f5560-a6b0-4299-9cde-e0eb2e3554c0 | E2E No Addr noaddr-mut0ieyd                          | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
4afda6fa-4fa9-4bab-9bc6-eedfa00bb383 | E2E Multi dblarch-mut0iepz                           | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
a315393d-c7bb-48ad-bee6-4600d212b7d1 | E2E Multi rest-mut0ifrn                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
d26c0ef4-9b3e-44e0-add5-61e8923e73ce | E2E Multi restactive-mut0ij1r                        | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
b1643040-abae-4d9c-8501-f0e37162b87f | E2E Multi dup-mut0ifat                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
8ceb8791-fa0d-4aeb-a6c9-69c6ed499dc8 | E2E Multi hb1-mut0jq1u                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
34f279c9-93bf-4406-ba34-37ce4e71c5ee | E2E Multi hb2-mut0jqpc                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
a88e6d96-9197-4cef-98cb-8e63d57fcabe | E2E Multi upd-mut0l0ab                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
924b2c22-38b5-48c4-bfc3-7ab362d7523b | Updated Name E2E                                     | 2026-10-03 | inact  | Default Tenant | m=1 p=0 t=0
ef4040e9-b594-4206-a566-4f335766adaa | E2E Multi del-mut0megb                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
773ad024-4505-4b9b-9dff-cd3d6278f505 | E2E Multi arch-mut0nqwj                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
ba94f996-5224-4b9f-a89d-5b2a01768443 | E2E Multi dblarch-mut0nyj4                           | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
e0a8a0fc-e478-42fa-8425-8a62fe4f7fd8 | E2E Multi rest-mut0o0jc                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
75a0de0d-26af-4165-b044-9c2cbef5a90c | E2E Multi restactive-mut0o1s5                        | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
bd52c3f6-c625-4e07-9297-e3bd3621e5a6 | E2E Multi hb1-mut0o2wt                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
55a2a128-ce1e-4b54-b50c-44566a5df25f | E2E Multi blk1-mut0p1ef                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
71d305a4-8135-4bb8-836f-73f5d66cd4d4 | E2E Multi blk2-mut0pedk                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
340cb3e1-9bdb-4873-bdb2-211391a67919 | E2E Multi blkd1-mut0ph22                             | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
42ffb1de-1912-4e5e-a735-0d977c9b4c06 | E2E80 FC mut0pvz9j77v                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
f89452b4-352f-4cac-bcc5-5dcf344e2cd1 | E2E80 FC mut0q4ow5oe8                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
54023322-23fe-43ac-a8c5-e9a516de46e9 | E2E80 FC mut0qcf5dwfj                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
cbcbeff1-793b-477a-bab5-97f09fe35643 | E2E Multi blkd2-mut0piuf                             | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
29d9b8f5-fa85-4eab-9b39-501bc83a0bc7 | E2E80 FC mut0qk8o6wbh                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
80c843da-5db6-48f0-87f8-2073ad13ef64 | E2E Multi blki-mut0qlbj                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
08b20f63-7042-4810-aab1-cd4335b7b654 | E2E Multi rls1-mut0qr9n                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
86c3fa9f-5a77-4bc0-a99b-58da31731883 | E2E Multi perm-mut0qt1j                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
542e368d-faaa-4859-afc0-c8e4c0d943a5 | E2E80 FC mut0qrxmf80h                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
62d86c36-7d1f-4bb7-9314-598b6d2ee15f | E2E80 FC mut0r868ioew                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
66bf15f8-f2a2-4800-9841-8fbf77bec419 | E2E80 FC mut0rfba90ra                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
543fdacb-b91c-4cc1-9228-fcd2d66a47c0 | E2E80 FC mut0rqg6uc72                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
86a473a4-d23d-4df2-8fea-a18119369f32 | E2E Multi hb1-mut0rzxr                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
364c7dba-462c-46fa-a111-0067c2698b8d | E2E Multi hb2-mut0s0sq                               | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
ffff2725-9470-4954-b900-526928463f95 | E2E Multi blk1-mut0s20t                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
5c042e90-1872-4e16-b9ec-e056ade7e32b | E2E80 FC mut0s2qge26u                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
72ac1130-26f8-4d0a-a9eb-552fff48e559 | E2E80 FC mut0sa86p0cd                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
2a342fd1-1bf4-4fed-a06b-861a79f80566 | E2E80 FC mut0sldd27tk                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
f37e3c77-0fb5-46ee-a253-a9acd16ccc78 | E2E80 FC mut0st6rqkku                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
ad388258-101c-4499-bfb1-ba6b5bb3c5dc | E2E80 FC mut0t6ewjhu6                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
eedbaf03-88a4-44be-982a-ed34331db2a0 | E2E Multi blk2-mut0s35j                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
d99e26f9-d647-4f33-b183-961fbd03e8d4 | E2E Multi blkd1-mut0tc29                             | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
48fb5368-6f6e-44b9-9c1f-e150ef234629 | E2E Multi blkd2-mut0td40                             | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
ca9bc673-ed89-4e3b-af8f-a2c59661bd07 | E2E80 FC mut0ucu8pc33                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
ef3239f6-90da-4922-9cfd-0b19d13b6a4c | E2E Multi blki-mut0teqh                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
3508b644-bb58-4bae-bdc1-ab01e2bc336c | E2E Multi rls1-mut0umsu                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
d3b2ba1e-10dc-41ec-b537-64a809932a7a | E2E Multi perm-mut0unnt                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
1886eb47-24df-4b03-9fa2-1ecfd8ceaee4 | E2E Extra extra-mut0uyyb                             | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
11825730-dbaa-4b12-aec0-c4a064521fdb | E2E Slug Sanitize mut0v07x                           | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
90c3d1e7-ee2e-46b8-bdb7-f2c0f34f640c | E2E80 FC mut0wvav9j3s                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
a6872386-780b-4e90-ab77-917191feaadc | E2E Test Store 1791070155274                         | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
da4e447f-f0d7-4078-aaf4-4e5db91f0d4b | E2E Reset Test 1791070219208                         | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
9d91dfd4-c521-45af-953d-40d2bae5feef | E2E Reset Test 1791070222382                         | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
2507ddc6-a912-4b7c-a1b2-d33a6b82fa44 | E2E80 FC mut0zc0e8olh                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
5ce8b170-7230-49c4-800e-85eac1523794 | E2E Extra extra-mut1027c                             | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
afdd504e-be60-4f1a-9a21-1a6b17360778 | E2E Slug Sanitize mut102gp                           | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
65f65fc3-6798-4e1f-9b88-3db37a215d0b | E2E Reset Test 1791070281996                         | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
613107d5-82e3-4c50-b57a-b76a9f6bb5d7 | E2E80 FC mut10sfz84pu                                | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
598e3618-2a76-4dc0-b263-4dc48cfd7095 | E2E80 SW A mut10cpjwpco                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
30f52bb6-1667-4b62-a514-554b3d8dfe94 | E2E80 SW B mut11eabrefj                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
d86c2b4f-07d2-4cb3-a0f2-d0088f652ca7 | E2E Test Store 1791070393865                         | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
04cd80ae-7ced-471f-9194-987b1d653279 | E2E80 SW A mut12y1tkeri                              | 2026-10-03 | arch | Default Tenant | m=1 p=1 t=0
703fcc92-acce-47ec-8ca3-70f536d10752 | E2E80 SW B mut12yzwmmmm                              | 2026-10-03 | arch | Default Tenant | m=1 p=1 t=0
bc8fa1fb-a53a-40cd-a4f1-38939f6ddb2d | E2E80 A11Y mut131iboz6m                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
85ccf5fb-a805-4f3e-8c2e-b967749aea77 | E2E Reset Test 1791070457045                         | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
94f8d36c-e499-476a-abc7-7278b9dac9bb | E2E80 A11Y mut13rghap9f                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
5ae95bd2-8ed0-40fe-98dc-b1cd15af745d | E2E Reset Test 1791070462190                         | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
979fc482-12e3-4f44-8903-2c574dddaad6 | E2E80 SW A mut15gthfcsb                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
de66fde6-33b1-47dd-b9f6-a777b3f764d2 | E2E80 A11Y mut172gle3jo                              | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
0bee27a7-3ca7-49fc-b1e8-9ab67d4b6fc4 | E2E80 AP mut2agny8tak                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
df2bd943-f069-4f00-a6ff-459713faad0a | E2E80 A11Y mut2b1nld01b                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
e746e76b-ebef-4a27-ac18-7e4717f4a50e | E2E80 FC mut2boqya2o0                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
0d7caf09-b504-48ca-b86c-d7be08f6ae5c | E2E80 FC mut2ckyu1feo                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
2e7e5723-a7c5-4130-87e6-579df6744222 | E2E80 FC mut2d6q6how6                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8a6c7790-54d7-42c6-bd45-5e1b0239564f | E2E80 FC mut2drkulr6n                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
da075fd5-f981-408b-9eba-94692f44ca3f | E2E80 FC mut2ed1uxht8                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
bf7c6988-1a37-4cb3-b3ce-c0e15ed05c88 | E2E80 AP mut2emrw8vl2                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
034fcc2a-2928-40c2-b278-4c8860183f08 | E2E80 FC mut2f3ddnp68                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
84bb8fad-37b0-4919-9b69-5a4853e113f6 | E2E80 A11Y mut2f5z38var                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
4d10bec7-b55c-49dd-bc26-37cc0d351bb0 | E2E80 FC mut2fn25ik0o                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8c744e0a-673e-4c6d-8795-cc246e639f57 | E2E80 FC mut2fon6ozhu                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
695d1ad6-8f72-4135-ac2f-e6cad42acd85 | E2E80 FC mut2gdk3a75q                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
a1dff9e8-3958-4e99-9690-eb83dc877979 | E2E80 FC mut2gww2dq90                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
a7dbbdb8-312b-409f-9d24-e4bcb1a0d0a4 | E2E80 CASH mut2h9slp5ar                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
4284f99d-9c73-44e7-ac35-56cf099c04b8 | E2E80 FC mut2hqxtkrjg                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
b1add168-ebd3-4e4f-8858-ce84b3196fa9 | E2E80 CAT mut2i5o7n5sw                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
66eb1982-ab61-4a10-88de-4d821c26ac23 | E2E80 FC mut2ikmqk6md                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
78b3d226-ecc5-4f31-9045-2ae03e840864 | E2E80 FC mut2jbe95547                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
9dc4bb32-11e9-4363-bdd6-206c468665fc | E2E80 DEV mut2jbllp6wh                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
cf13d2bb-6d48-4050-a99f-b5609ad25900 | E2E80 DEV mut2jgjbukyz                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
f7a3ad28-4155-44c2-8179-d72e51e20153 | E2E80 DEV mut2jkwluvi3                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
645fab59-ef59-4684-9492-f0dc1d0955f0 | E2E80 DEV mut2jot4be01                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
37a748ae-5b81-42d9-8175-09d25cdcbb54 | E2E80 DEV mut2jsingvoa                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
c1514570-fd3d-4cad-b95e-23614bcd45ff | E2E80 FC mut2jxpjce2j                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
767d0cd6-dd8d-48bc-9511-1d7fd812fee9 | E2E80 POS mut2kn15imfn                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=4
6826e8d9-16da-441a-8c6d-42cc9dd98633 | E2E80 PRD mut2l1b9gvxm                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
87aa67e6-5997-46d7-9104-530d8de29ce8 | E2E80 PRD mut2l9hfsh98                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
6a6d0ca4-207b-4a05-9914-93839042c9f5 | E2E80 PRD mut2lg2eqmr9                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
eca036ba-24ca-417d-878c-7b8823921319 | E2E80 CASH mut2li7fekdl                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
86e6d5e5-453e-4819-901e-9fadda01c608 | E2E80 PO mut2lir63y1r                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
dae9e4c4-c69d-46b7-86aa-deef79c3d02c | E2E80 CAT mut2ll9qpqet                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f301a53b-7b9e-4973-a302-e79f13fc6a85 | E2E80 TRA mut2lycasvl9                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
17394bc8-e07d-4b98-8c09-b8c8c45643eb | E2E80 TRB mut2m0hwwa9z                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
c076e725-a9a4-4bbf-8794-d55836c652bd | E2E80 DEV mut2mhsohjx5                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
ad8690c2-1960-4154-b65f-253c3cb8cd53 | E2E80 DEV mut2mwt9l1yz                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
48ec5a15-afff-4106-b795-cd86a2d4091f | E2E80 DEV mut2n0vr2og6                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
0808e96a-86e2-4769-acf7-ade59ddef45c | E2E80 DEV mut2n3m8zx6j                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
c241de67-4365-43d9-abf9-b5757ba9b6e4 | E2E80 DEV mut2n68kniqt                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
9c749813-db15-4bb3-a803-a19140a4a9e1 | E2E80 DEV mut2n8lpbe6a                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
14ca7a01-2947-4672-89cd-fa1684f6c9b1 | E2E Multi mut2nkh2rqdt                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
6e0cd5fa-d067-42f5-887e-e5ded0bfb9c2 | E2E No Addr noaddr-mut2nm49                          | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
80efac1c-82df-406b-89d0-0010b56910f8 | E2E Multi dup-mut2nn1i                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
a9d9920a-24c0-43eb-b3db-1c848a79ebce | E2E Multi mut2p269fa50                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
d11201a4-06ef-4485-898b-91a0003cfd74 | E2E No Addr noaddr-mut2p3jp                          | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
4dd2deb2-dba8-499e-a2f5-4ae815fe16b4 | E2E Multi dup-mut2p3wx                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
db1f3b2a-858e-48b2-91fa-a47c181a222d | Updated Name E2E                                     | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
4226fc4a-98c8-4ca0-a90d-54e3025f8545 | E2E Multi del-mut2rz46                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
7dc4d29a-296a-4087-bd2c-c05c7be8bed0 | E2E Multi upd-mut2t0wo                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
7ca4002e-5736-442d-a67a-e797a61fa9c1 | E2E Multi del-mut2t3yy                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
694f2013-8b07-4667-b033-94cc839aae29 | E2E Multi arch-mut2tdsq                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
da5e4f89-bca4-450d-b7f9-11e0e97a3a6c | E2E Multi dblarch-mut2tgm3                           | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
b48f23a2-559b-43b8-9d9a-9006492bb86d | E2E Multi rest-mut2tiq2                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
3d39eebc-241c-4d13-97b9-c362e8ac596d | E2E Multi restactive-mut2tl7r                        | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
c43acee1-3096-4aba-bde3-da65789983e5 | E2E Multi arch-mut2uhox                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
9d4cc377-b727-4a9a-bfa1-b0656baba71a | E2E Multi dblarch-mut2ukee                           | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
4c5c4f90-6d1c-4d83-b163-6becf5bcd898 | E2E Multi rest-mut2ul81                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
de16e627-56a0-43e4-9eb1-1636da96555c | E2E Multi restactive-mut2um5h                        | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
0f25276f-3f71-4d14-91d4-bf310c9ebc8d | E2E Multi hb1-mut2un8w                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
5322bc77-5868-49b2-b3f3-fac31edda325 | E2E Multi hb2-mut2vv1f                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
d9465881-d08b-4cce-9732-19debd9ec1fc | E2E Multi blk1-mut2vwt2                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
cf2c98cc-3f0e-4143-8d6d-b697b70eaaf2 | E2E Multi hb1-mut2xfgl                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
4e4734bf-6be7-4f5d-9343-01e3ee2415cc | E2E Multi hb2-mut2xh9c                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8842cc44-f3f9-4205-9ce5-80d2c19a6d25 | E2E Multi blk1-mut2xk4x                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
705bdaab-4351-4ab0-bc20-db7aa80d0607 | E2E Multi blk2-mut2xll2                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
fb723728-8cb7-452f-9ec6-fb7d1dd0a559 | E2E Multi blkd1-mut2ysn5                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
1e9d6d42-fcb0-4e48-bfda-0093fdbecb68 | E2E Multi blkd2-mut2yw7z                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ecba8d03-f297-42b0-9ea1-997ed9575698 | E2E Multi blki-mut2yy3o                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
6d709608-3bbe-4ded-9675-a940dd2715d5 | E2E Multi rls1-mut303vt                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
55d39f8b-a6fa-410a-ab12-f108eac4cbc8 | E2E Multi perm-mut306gv                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8bf16ab2-d6cb-4d7d-99c3-06411cc4f531 | E2E Multi blk1-mut314ea                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f5e26823-3f8d-495e-bb97-69b1c77a5e0c | E2E Multi blk2-mut315tx                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
6af51647-09c9-4ad7-9491-dad17253226f | E2E Multi blkd1-mut3170g                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
c655863e-5bd8-4cd7-bfb8-ddc7165c6d0c | E2E80 SMOKE-Fl08 TRA mut31ibf83nq                    | 2026-10-04 | arch | E2E RUN SMOKE-Fl08 | m=0 p=1 t=0
ace68144-fa44-4d72-a39a-a3e665ce0f0c | E2E80 SMOKE-Fl08 TRB mut31jvmxa25                    | 2026-10-04 | arch | E2E RUN SMOKE-Fl08 | m=0 p=0 t=0
70585e82-9df1-460d-9750-e13b8c125f39 | E2E Multi blkd2-mut3185h                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
22616126-c5ca-488b-bb4a-92a32bfe07cf | E2E Multi blki-mut32h3z                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
93c8bed4-6c05-4d4d-b45e-a931aad3b93f | E2E Multi rls1-mut32ipl                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
0a3ae306-e1a3-40c8-b140-94918e02771b | E2E Multi perm-mut32jmc                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
d7775b8d-18d3-4dff-bbbd-deb3c2266d6d | E2E Extra extra-mut35nqd                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
a6c0c506-40e5-483a-b398-3883dda69cbd | E2E Slug Sanitize mut35ofn                           | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
579dd550-b8b2-4f06-b424-90df7371cae1 | E2E Extra extra-mut36nht                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
78453199-10c8-43cf-a971-16cee772e24a | E2E Slug Sanitize mut36nsq                           | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ba7d5558-c65f-4dfe-99c3-b616eb47ff42 | E2E Test Store 1791074139387                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
5db7a31d-6e46-4613-a02e-75d95830d07a | E2E80 CONC-Bb02 TRA mut3bv6hv9go                     | 2026-10-04 | arch | E2E RUN CONC-Bb02 | m=0 p=1 t=0
df96ea43-10f9-4814-b5e9-d5d6418a1c7f | E2E80 CONC-Aa01 TRA mut3bvdgjvhr                     | 2026-10-04 | arch | E2E RUN CONC-Aa01 | m=0 p=1 t=0
453e78d0-26dd-4388-a6a8-8b99acd2d376 | E2E80 CONC-Bb02 TRB mut3bwt26vsw                     | 2026-10-04 | arch | E2E RUN CONC-Bb02 | m=0 p=0 t=0
d3e5885e-844b-4889-a50e-5ff387629d63 | E2E80 CONC-Aa01 TRB mut3bwxy7fku                     | 2026-10-04 | arch | E2E RUN CONC-Aa01 | m=0 p=0 t=0
97877e72-d403-4b63-b60e-54178b0b7706 | E2E Reset Test 1791074204392                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
80f63cb6-8134-4611-947d-b1f5e4ba2d8b | E2E Reset Test 1791074207698                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
c41e01d3-93de-4df6-b0df-52fe2b6da8b9 | E2E Reset Test 1791074268117                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
d21d8d99-0814-4a61-a050-5b7c5fab9b7d | E2E Reset Test 1791074269305                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
81b910f0-e71f-4b45-9c10-c6f8659fd0f8 | E2E Reset Test 1791074270169                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
237221fa-13b0-4633-a4cc-4136ac2b4f33 | E2E80 CLEAN-Aa03 TRA mut3fx2c5j63                    | 2026-10-04 | arch | E2E RUN CLEAN-Aa03 | m=0 p=1 t=0
52a47ea1-c0fd-4567-aea1-bb125e66c768 | E2E80 CLEAN-Aa03 TRB mut3fyl2mqlh                    | 2026-10-04 | arch | E2E RUN CLEAN-Aa03 | m=0 p=0 t=0
da1908e9-ac40-4be0-9955-a19275a4e519 | E2E Reset Test 1791074396389                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
5766427e-978b-47b4-8244-d0db7731d96c | E2E80 SW A mut3hkml0ikf                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
e47872dd-6b88-4d89-bd6f-4c966bdf1e21 | E2E80 SW B mut3hm1avw6i                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
378a86ee-1973-4eba-8ef2-52137fda1a59 | E2E80 CLEAN-Aa05 TRA mut3i2mzdi79                    | 2026-10-04 | arch | E2E RUN CLEAN-Aa05 | m=0 p=1 t=0
45d3c9cb-3cc6-47e6-b958-ceadc79fa0dc | E2E80 CLEAN-Aa05 TRB mut3i47yxr3n                    | 2026-10-04 | arch | E2E RUN CLEAN-Aa05 | m=0 p=0 t=0
492ac325-3b10-4369-b5b0-95898614649c | E2E80 CLEAN-Aa07 TRA mut3l1hcagvi                    | 2026-10-04 | arch | E2E RUN CLEAN-Aa07 | m=0 p=1 t=0
a283d74f-338d-49fd-8580-d742a71db7fb | E2E80 CLEAN-Aa07 TRB mut3l33xyyp9                    | 2026-10-04 | arch | E2E RUN CLEAN-Aa07 | m=0 p=0 t=0
0a845d4b-98c4-4182-816f-27592a9cd30e | E2E80 CLEAN-Bb06 TRA mut3ly3vgl2u                    | 2026-10-04 | arch | E2E RUN CLEAN-Bb06 | m=0 p=1 t=0
2df0a725-ac7e-4d01-99bf-74afb8c35264 | E2E80 CLEAN-Bb06 TRB mut3lzmyib0z                    | 2026-10-04 | arch | E2E RUN CLEAN-Bb06 | m=0 p=0 t=0
427a0027-9a69-46e3-9a3a-3975635dcf48 | E2E80 FULL-Su01 AP mut3xuiqptc2                      | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
20ab1ae4-2833-4fe2-bf19-1f17792077de | E2E80 FULL-Su01 A11Y mut3zw8iz8gd                    | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
0794419d-cc18-4f25-b52f-bf41dc33fad2 | E2E80 FULL-Su01 FC mut40sogn609                      | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
fc46348f-0bdd-4be1-8e3c-8f594fd07fc8 | E2E80 FULL-Su01 FC mut41uqmr3cc                      | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
c121d599-501c-4e72-a1f6-52b6a1435525 | E2E80 FULL-Su01 FC mut42jcbxukf                      | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
e7c65f37-f17e-4442-9c9e-6e984fb68a16 | E2E80 FULL-Su01 FC mut437pubpvh                      | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
02a75126-a68e-46d3-a61c-d960cac06f45 | E2E80 FULL-Su01 CASH mut45hxuyyz0                    | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=1
ebc82b74-2233-40e6-8a31-db613421a840 | E2E80 FULL-Su01 CAT mut45saqqxge                     | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
e03434f6-8ad1-415c-ac13-3bbcd9fcbd49 | E2E80 FULL-Su01 DEV mut4727t1ozo                     | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=1 t=1
e8e9a7fe-9fc9-4531-92d5-b6b7a40c110c | E2E80 FULL-Su01 INV mut47bqnnr6o                     | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
0d8c8831-76f6-45b6-890c-5828fd91c3ad | E2E80 FULL-Su01 INV-UI mut47nrm8wr3                  | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
cc2fb561-90b1-45ca-aec0-d200c2541399 | E2E80 FULL-Su01 POS mut4ag1lklon                     | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=4
46b89738-0aad-4fc5-902e-1b4ce702c4bc | E2E80 FULL-Su01 PRD mut4b3gw3jjr                     | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
ac05a28f-458e-4d60-b72f-bdf667cc4a0c | E2E80 FULL-Su01 PO mut4ba2q3yjo                      | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
739b87be-fbab-4ecb-a4df-9251a8e6d143 | E2E80 FULL-Su01 REV mut4cfdh9aul                     | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=4
52e75a59-dc99-4346-8907-8376099ee8a3 | E2E80 FULL-Su01 RBAC mut4cy4q1ndn                    | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
ce6806e8-df54-498e-b175-90d0cf8684eb | E2E80 FULL-Su01 RBAC mut4e9p2sryh                    | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
74142dc4-5b2c-4b78-95c9-73504e99eefc | E2E80 FULL-Su01 TRA mut4eglho7fc                     | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=1 t=0
334b2497-493a-4678-9e7f-5c137f63b96e | E2E80 FULL-Su01 TRB mut4ehu1yg2b                     | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
e623be30-2b60-40cf-8d1a-74d0dac1be3a | E2E Multi mut4i4rcayfw                               | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
f3b8d436-4f3a-4c46-9f2f-fb3d140dac4e | E2E No Addr noaddr-mut4i7pg                          | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
c8884add-ccf7-4969-bf33-3f3cd38d24ba | E2E Multi dup-mut4i9ik                               | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
e1a2cf56-c7bd-4b6d-ae5e-efd69fe3f32d | Updated Name E2E                                     | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
2510e0a9-1cd9-456a-b08c-916f854396b2 | E2E Multi del-mut4kwab                               | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
cd50f898-3e72-430f-9408-2e9f49ab8cd7 | E2E Multi arch-mut4m9s2                              | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
aac1dc1f-5fa2-4f06-a0a8-c9c8e99289bb | E2E Multi dblarch-mut4mf9i                           | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
7acd49a4-2483-424c-b8bf-ef182400f1e3 | E2E Multi rest-mut4mif2                              | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
8eab27fe-93bd-4c97-81d5-c89d8e8de82e | E2E Multi restactive-mut4mnvx                        | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
842807e1-7aa3-484d-8253-dcc890ab0410 | E2E Multi hb1-mut4mtgf                               | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
7388b2c3-812f-41b9-989c-61f072655b90 | E2E Multi hb2-mut4nm15                               | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
e72ee3b9-7c02-488c-bcc0-83804d90a05f | E2E Multi blk1-mut4ntkv                              | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
c2d215ca-61b0-4daf-8f15-f5a2e8714718 | E2E Multi blk2-mut4o02i                              | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
68596817-a502-453a-86eb-656df5c65c60 | E2E Multi blkd1-mut4oxy5                             | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
428b3574-794c-4cc3-97ba-514d6f22de96 | E2E Multi blkd2-mut4p1wh                             | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
55f44657-51a9-4c6c-ba88-2d8eacd701c1 | E2E Multi blki-mut4p6lb                              | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
67affe10-6aad-4a5f-a719-e20078d9ebcd | E2E Multi rls1-mut4pctx                              | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
e29f6777-8797-46a9-b7bd-4fc829197f68 | E2E Multi perm-mut4q9lg                              | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
f92e50ac-0579-4554-a1eb-dd9fe4b37a33 | E2E Extra extra-mut4razt                             | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
9c248b54-62f1-47df-bc7c-3e430f28dc10 | E2E Test Store 1791077363858                         | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
706434d1-e2ec-49e9-9570-0637688cd846 | E2E Reset Test 1791077436495                         | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
b82be67f-af5b-428c-86ad-1e36a5fa550c | E2E Reset Test 1791077442051                         | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
0505660e-d9af-4660-8312-9df595e19eb6 | E2E Reset Test 1791077506989                         | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
bac681ae-d314-4465-91cd-d5f70729345e | E2E Reset Test 1791077508701                         | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
b8f2d221-cb6f-42df-a197-b3d13a3b9870 | E2E Reset Test 1791077510359                         | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
2add0cf2-6e82-43a3-ac7d-1c534b4a19bd | E2E Reset Test 1791077645250                         | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
658256fd-b349-4bcc-8dc1-2aabd567f511 | E2E80 FULL-Su01 SW A mut5f6vzim8p                    | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
f37761b1-3a9a-4c5a-9bb1-b0ee6944eb5c | E2E80 FULL-Su01 SW B mut5f8x9djb5                    | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
8f079fd5-4e3d-4c49-bcae-71ee9b6b545d | E2E80 AP mut6y962h9na                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8787d516-54ac-4e47-aef3-ae96d450ccda | E2E80 A11Y mut6yoe0y3vl                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f1d65a1b-5efc-4e33-895f-061d68766077 | E2E80 FC mut6z8bzghsm                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
a32f06a3-61fd-4ef5-b869-65b8a6799e76 | E2E80 FC mut700b5trru                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
4260d194-1310-425f-b697-49fa02f8e8f2 | E2E80 FC mut70no8wipy                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
851676c4-efdb-41c8-b93c-1e2dc5f30196 | E2E80 AP mut712ykh774                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
cae5e85f-c73a-48fc-9cf4-6cf0733c471d | E2E80 FC mut717sug5nj                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
596edb92-d252-44ac-8578-96b79cae4b3d | E2E80 A11Y mut71ibd7llz                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
95914555-45c7-4782-b16e-5ba32729e767 | E2E80 FC mut71ryy2f73                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
b3db028a-ec7d-4755-8709-36ce15777991 | E2E80 FC mut7227rvdj0                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
49d4733a-5b78-4751-b280-d324178f6e43 | E2E80 FC mut72c1oy7h6                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8eb02ba3-584b-459b-99a4-2c25efdc8e88 | E2E80 FC mut72woajc0i                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
bb488614-977e-4b26-9cba-16e34a0e4dcc | E2E80 FC mut72yqfxrpd                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
78ad92cb-83dc-48ec-a022-760f137b404a | E2E80 FC mut73isk9ob1                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
d4925a91-25d2-49ca-89a3-b4c5052e0b0a | E2E80 FC mut7427v8fp1                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8f10a87e-3712-4534-9786-11cb00bf5352 | E2E80 CASH mut74h37jijd                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
c350dcbd-4a05-418b-a15e-8ab4af1b9bc9 | E2E80 FC mut74oaysxaw                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
75a8f627-735c-42cc-96d2-febc04dd3801 | E2E80 CAT mut74sj3eua4                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
199cfded-afd8-441e-8184-d1f59eff7928 | E2E80 FC mut75cyy8xt6                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
24ee5235-e878-4f35-8d9e-5e28cfc37442 | E2E80 DEV mut75prl4x5u                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
dec07c85-714f-4142-8646-6c265756fe2c | E2E80 FC mut7600syajp                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
47812fe1-d45b-4516-a603-31122025d49a | E2E80 DEV mut7622f43ci                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
7224f341-1e9a-48ec-ac7f-7daf0d3a80ae | E2E80 DEV mut766f21rr1                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
6b9284e0-ebc0-4181-a930-9ef28e0d25c3 | E2E80 DEV mut769u0xzz9                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
a4b12be5-25b8-46ba-9845-387738c4f158 | E2E80 DEV mut76dc2gsbg                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
75f8222d-e3d6-4b10-bd39-cc019b1f477c | E2E80 DEV mut76gl2adib                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
5f5aa1b4-2567-4b4d-ae0e-6284c93676cb | E2E80 PO mut77nodwndg                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
c3d18127-e932-49a1-a5e0-c7af62fc4be8 | E2E80 CASH mut77vzmyznr                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
0ee8347b-9c6c-4148-9fa3-e25ec7620541 | E2E80 REV mut783kkderc                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=4
b3d93359-85a3-4819-9b2f-7af1a49edd08 | E2E80 CAT mut78bwfhvxq                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
2819b7a8-2964-4d0c-a075-a0784b7e2294 | E2E80 RBAC mut7990ih319                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
c34bbb73-d02d-426a-a76b-c4cbd9600237 | E2E80 TRA mut79nufki3b                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
a0f5a7d9-b95b-4bbe-ba8f-bcf904441875 | E2E80 DEV mut7a9cb75og                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
afc7defc-e3f9-4fe7-9dc2-8d2d1063993b | E2E80 TRB mut7a8b6hh58                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
a1bf6b4b-1803-4321-8cbe-c03c2a7bf903 | E2E80 DEV mut7ay16qvfs                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
77874616-75ac-4b88-9315-f06c07369091 | E2E80 DEV mut7bomtnzcx                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
177596a6-3b04-4b82-8e07-286888bb8dfd | E2E80 DEV mut7c4tz23kz                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
3d4cfd1c-57d5-4995-8563-9b8d69c62780 | E2E80 DEV mut7ctgi6pdn                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
9d42a2ee-4b63-4faa-8995-bcc013630c65 | E2E Multi mut7db54jj5f                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
c192d108-6028-4450-8e5c-1654a43f7708 | E2E No Addr noaddr-mut7dg8m                          | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8974bdab-eeaf-4626-9764-90b9899877a8 | E2E80 DEV mut7dfsf98g4                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
a4e1a1a6-7cc9-43cb-891b-1425a190aaaf | E2E80 DEV mut7e3szpy5d                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
69df3e79-54eb-43f2-83b4-ac2798b2f19b | E2E80 DEV mut7eca3zbyo                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
7f814328-01e1-4a5c-8458-d3afdeb3b86a | E2E80 INV mut7eifsdzsc                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
5c98d763-5893-4921-8487-2db240d8b014 | E2E Multi dup-mut7dhk7                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
b74286a6-f406-49d9-875b-1863e2472c75 | E2E80 INV-UI mut7euhp6dhn                            | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
4e835891-d225-439f-9ca9-2ed6fd92de18 | Updated Name E2E                                     | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
e53a6ad0-88e1-4ba7-ada4-969b2039be48 | E2E Multi del-mut7hk4o                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
d74ee40d-a0dd-4d2b-b125-a7e79f9c795f | E2E80 INV-UI mut7hl6jp2bq                            | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
0ed41703-e0bc-441c-ba43-08f2ddeb9bfd | E2E Multi arch-mut7iyaa                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
5dbb4c84-03fc-4d25-8325-3236b1dcfa47 | E2E Multi dblarch-mut7j1gj                           | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
d3bcad03-b87b-46a8-b4c7-fe02f2dff621 | E2E Multi rest-mut7j3jj                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f4d14ef7-4889-4c48-beeb-413c4e62615f | E2E Multi restactive-mut7j5p3                        | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
9842a7a0-8abe-40c0-8167-6df9be0607d7 | E2E Multi hb1-mut7j80v                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
4424d894-2f44-436a-8bf3-6c8a7cb215fb | E2E80 POS mut7kcr7hn67                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=4
91bb7380-d984-4d32-87d5-70be79a2b06f | E2E80 PRD mut7ko9k1rfw                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
b06dbafc-13bb-4a88-92ca-e350e0a84bae | E2E80 PO mut7ktw5sx50                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
3f8677ac-5ac5-4e4a-9ce5-f6db288a5908 | E2E80 REV mut7lz7gkb5g                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=4
b72a0f85-63cb-4741-b35d-cac84fade5f2 | E2E80 RBAC mut7m9c917iu                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
5f382d64-a8da-4e8d-b383-885a5df480d0 | E2E Multi hb1-mut7n2ms                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
b128a32a-6c9b-4f72-a425-b8d7e448dc62 | E2E Multi hb2-mut7n4ci                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
0ac1abab-5e5e-403b-8e10-95cfde6def10 | E2E Multi blk1-mut7n6lk                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
5863caba-7171-4bbe-af5f-e193e15b9a5b | E2E Multi blk2-mut7n7os                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
a1ebbb5c-e836-4967-9f71-ba086b3cd078 | E2E80 TRA mut7na1g5dcz                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
13f50b0c-8813-4749-8ccb-58b4dcd74c49 | E2E80 TRA mut7nk7x21vu                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
c3793371-a4eb-42b0-91ba-dcb5c9b19685 | E2E Multi blkd1-mut7n953                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
fa6f1171-5564-4ef1-9f54-3cdb04526d63 | E2E Multi blkd2-mut7of78                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
2b8723a8-544c-4b4c-9bc9-2cc81498cd33 | E2E Multi blki-mut7oiv8                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
e1ad7efd-2288-4313-b56d-9275c0a65586 | E2E Multi mut7ovsvecuw                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
9030df7b-c8ff-4a23-a1cb-0c1fb032e0ad | E2E No Addr noaddr-mut7ox9d                          | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
49912b4a-c5e7-4869-b5b4-918c5121afde | E2E Multi rls1-mut7oky8                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
c97d3d2a-700a-403b-95c2-8927d81e24b1 | E2E Multi perm-mut7psfb                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
734a12ff-b7a8-4cc4-9ce4-9c4ea53a0b65 | E2E Multi dup-mut7oxwz                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
e3bfa056-689a-49db-9936-b7aed04fd4b0 | E2E Multi upd-mut7q8l7                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
56e859f6-be0c-4ad0-bd5e-773f0ebb0a39 | Updated Name E2E                                     | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
9e73fa32-aa22-4abc-bb23-c8707570691a | E2E Multi del-mut7sxuj                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
41ceb608-c0dc-444f-813c-3b273ff3a6bd | E2E Multi arch-mut7ua51                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
abc44284-0a91-4346-9b2a-6d5d8a5f0506 | E2E Multi dblarch-mut7udck                           | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
47a3c0b0-4595-4b9c-96fe-9d0cc28f216c | E2E Multi rest-mut7ufw0                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
19760602-9434-4389-9b2d-a1ebcae58b99 | E2E Multi restactive-mut7ui6a                        | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
3ead0a30-82fc-4123-9779-f584520cb564 | E2E Extra extra-mut7v9vy                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
e2068b03-964a-4bd6-a5ab-696df184a720 | E2E Slug Sanitize mut7vbqh                           | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
2cdb0a4a-5b1b-4513-9038-654347dd1198 | E2E Multi hb1-mut7ukn0                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
00999ae8-749a-41bb-8e35-3682c556b128 | E2E Multi hb1-mut7yi2v                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
5f3a0701-1a2d-4da1-9fd4-553d51b5cbc9 | E2E Multi hb2-mut7yk1b                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
126a02a6-1206-461a-8462-42dbf1484381 | E2E Multi blk1-mut7ymfl                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
39c5824c-e031-4ba9-a384-369c469e7005 | E2E Multi blk2-mut7ynmv                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
eaf5a0dc-16d2-49e6-a4bf-d82841db7918 | E2E Multi blkd1-mut7yp7n                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f0d612c4-eff3-4d79-bace-e53dd7a108b7 | E2E Multi blkd2-mut7zw6l                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
fefebae9-c8df-4c69-81b1-d4da9ff9e479 | E2E Multi blki-mut7zyoa                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
b4598250-2afc-4b7e-affd-4ee738ed0540 | E2E Multi rls1-mut800l7                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
0006abc8-b6d5-44cd-89e1-a9ec484fde17 | E2E Multi perm-mut816m1                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
560b5ded-7d3b-4780-bac5-65b91a2d6a72 | E2E Extra extra-mut86msv                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
3e74865d-1f14-409a-9715-700570b6d9d2 | E2E Slug Sanitize mut86n6r                           | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
3b0d54c8-0888-4b4b-bc7d-176251ad095a | E2E Test Store 1791082513503                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ffa1bfc9-7f69-4e2c-af82-dda9ddb6b4fb | E2E Reset Test 1791082579781                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
a76be7dc-fca2-4c59-a47c-e52aaa1d31c4 | E2E Reset Test 1791082583641                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
cded17cd-42da-4a5f-800d-7aeeff83f7fc | E2E Reset Test 1791082644557                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
e7a989f6-009e-4221-a823-21a7d653452b | E2E Reset Test 1791082646358                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
c23f4524-762a-4674-a6c8-0b287b0e0687 | E2E Reset Test 1791082649297                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
c9c8a858-381e-40fd-8cc9-ce731e527b40 | E2E Reset Test 1791082779126                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
d4f0ff44-d992-4774-a815-09f49b4c297d | E2E80 SW A mut8hcqvdmzo                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
b7e1380e-31b5-4c32-b9ac-bfb1e10a2fd9 | E2E80 SW B mut8hht03y3q                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
0df41a79-5df9-4d1c-a13f-1aee99dd3f5c | E2E80 AP mut8t2tg0zma                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
56ba5fb4-24bf-42d7-bf0e-f0e0987e7eee | E2E80 A11Y mut8tnbumwv8                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
1cabbcd2-158f-4654-b9d2-5b8da1880eae | E2E80 FC mut8utpzzkc6                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
89fcf8f1-7632-411c-962d-e1a5e56c970b | E2E80 FC mut8vsm409fq                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8da79379-370c-4d34-bc44-23e73500a272 | E2E80 FC mut8we44mf1o                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
c1211d74-de24-4166-9336-8c80794c92a6 | E2E80 FC mut8x2pz1w06                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
25dae238-10a5-47e8-87d7-7fb82077dc13 | E2E80 AP mut8xgpoja54                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
319b465f-40fa-455d-8981-4d1924776da2 | E2E80 FC mut8xuo2euge                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
99a99039-a344-4cc5-99ae-cd8b003c976f | E2E80 A11Y mut8y46jra77                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f0e77ccb-31d0-47fe-8e23-39c51af3b922 | E2E80 FC mut8yh11eeaj                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8ee11159-0b47-4c96-ba8f-ed8063d69110 | E2E80 FC mut8yruve0yj                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
cc667fce-7121-4beb-8897-c78b722f3cfd | E2E80 FC mut8z2przb6q                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ff623622-7102-4741-b432-e58fe681c315 | E2E80 FC mut8zor8prxi                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
328b0a0f-6a3b-4d36-bdb6-8901c1909721 | E2E80 FC mut909kt30og                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
6c3d9102-8444-4f71-81d0-175279a9e74a | E2E80 CASH mut90q29locz                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
8ec75e38-a22f-4848-bcca-4c3479ccaaad | E2E80 FC mut90xo9klfy                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ff74a03f-74cf-4795-aaac-d3b1a198dbb9 | E2E80 CAT mut910htqrrx                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
786105eb-da40-4fdd-8350-96296909f0c4 | E2E80 FC mut91hxbqj3l                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
a60859bf-da8f-4894-ac11-91ab460e891c | E2E80 DEV mut91xfy3ysd                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
ba8ee077-d1f1-40e5-afac-68c34788cb58 | E2E80 FC mut92176rbek                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f7b352ae-21e0-4f29-85ee-af84f1968a33 | E2E80 DEV mut92c10fwnf                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
1f6fb9e8-9266-433f-a3dd-f64a8205f1ec | E2E80 DEV mut92hbdrbc2                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
2570c914-20f5-4d17-a2b4-02081683b96a | E2E80 DEV mut92lrvrv6c                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
274a644d-a018-492b-bde4-e35ba3793650 | E2E80 FC mut92pl7fa7x                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
53e06b67-18e8-468a-a7c6-fedf813d576c | E2E80 DEV mut92q57oo9n                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
b66337cc-1541-41b9-92f5-6198abe48d13 | E2E80 DEV mut92v6n7vbl                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
ef26a76f-4e7a-4775-9675-a69588108b61 | E2E80 POS mut93ncpt3jq                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=3
f2f4b829-c673-4c8c-a39e-6302c4799bc5 | E2E80 CASH mut946yabaia                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
b316bd67-3b29-4051-b577-14bffc010eaf | E2E80 CAT mut94bc5e9ah                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ab763d90-cc77-4a62-85a7-9d2241c882f2 | E2E80 PRD mut950l4dr8w                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f22d4b54-0db2-4d20-a409-0e00cddc2785 | E2E80 DEV mut954zd67zm                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
ab3210c4-c578-4b07-8985-169d15666c46 | E2E80 PO mut957cgjwuf                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
cc71a150-7108-483e-8734-950131c20160 | E2E80 REV mut95cgq8v0y                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=4
7a82a506-c16f-4e44-a33a-4d506c9f0cc6 | E2E80 DEV mut95n1ps47k                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
9cafe9db-2b8b-4d5d-8baa-457cb1df43b8 | E2E80 DEV mut95qzpzkes                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
de1c91d5-2d83-46ad-bf93-355087dcd52d | E2E80 DEV mut95u3f3id3                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
b11ef034-09ca-4161-9599-628698732c15 | E2E80 DEV mut95y9d1hgm                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
950940d0-6a6c-4619-b5ff-239240dc7cb9 | E2E80 DEV mut968071pcz                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
9f349d0c-0ded-4295-b695-5173bfbfdec0 | E2E80 RBAC mut96imzd3ue                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ef8495c2-6939-44d4-8937-a86261014bc7 | E2E80 TRA mut96rqflee6                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
4dbba216-d3aa-4390-b991-3e08ebac1403 | E2E80 TRB mut96t9x9gxj                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
d4677ac0-e833-4a1d-a3ec-45e88f55a617 | E2E80 RBAC mut96ylt6amp                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
fa3fc51b-e126-4719-93e1-775930d072d4 | E2E80 TRA mut9750veblr                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
e2f6e2b7-0891-4582-a131-a76a05488e5b | E2E80 TRB mut97618ncp7                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
5041535a-086c-4a68-8145-a5101f754bce | E2E Multi mut99f36tbqq                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
56687283-e3d5-4b16-a7eb-3b97530a1df9 | E2E No Addr noaddr-mut99hj2                          | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f152a955-0a9e-4a38-b197-53e054054297 | E2E Multi mut99hwfa8qo                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
fd417493-f0e7-4553-b788-74232e8c1dc0 | E2E No Addr noaddr-mut99j8c                          | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f461053d-2303-4ab1-97a8-66f205f09da0 | E2E Multi dup-mut99ied                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
4eb880ef-7348-4299-8827-2de099afa6e3 | E2E Multi dup-mut99jox                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
06902fc3-bd44-4553-8f0b-0256a985a8c0 | E2E Multi dup-mut9c8yf                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
da8b4af2-642b-488b-becf-2529104f6cd4 | Updated Name E2E                                     | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
1a81270c-0e92-42e3-b8d2-1d0ab178b098 | E2E Multi del-mut9dkkk                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
692387e6-3b1c-454a-9d65-b4e6dd8de778 | E2E Multi upd-mut9cjg8                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
3dff4c22-200f-4c53-a00e-cde3427e39d6 | E2E Multi upd-mut9dpv2                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
6bd7d3d4-a172-4864-8fe5-c8bc99c2403d | E2E Multi del-mut9dufz                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
718772f3-b0b6-4d64-b80a-fa60d2dcc95f | E2E Multi del-mut9dxc4                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
e9bfb6c5-25e9-4a90-b454-59b7a235c9b0 | E2E Multi arch-mut9e3qj                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
60223f7c-9a67-478e-844c-e6d4ca71d168 | E2E Multi blki-mut9evlh                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
7be29bd7-55a4-444e-a399-d52eb9b4edf7 | E2E Multi arch-mut9ewnk                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
897c6473-a706-4ae0-8b10-13c3ea2ee397 | E2E Multi rls1-mut9f0oq                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
bb96993c-e832-49dc-88c3-1b1e94c64c1c | E2E Multi dblarch-mut9f5cu                           | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
a1cea526-a686-4bf3-a932-c780c12be979 | E2E Multi rest-mut9f7lg                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
faa015ff-7640-4f9c-9fbe-72c5d80784b3 | E2E Multi perm-mut9f7jk                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ea8d1293-91bd-46ed-9406-d0aabccc9017 | E2E Multi restactive-mut9f9u8                        | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f19df1c0-a134-4a4e-8c46-48d39eb96bbd | E2E Multi hb1-mut9fbya                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
313929ea-a40f-4e98-bc14-fedadc914252 | E2E Multi hb2-mut9g9hr                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
68abbf7f-4a01-4e84-9592-a5b935fec6a6 | E2E Multi blk1-mut9gid7                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
6c660f68-8cd1-43dd-980e-5b97b9abf3df | E2E Multi blk2-mut9glsi                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
404f1812-6af0-479d-888f-79831e910d42 | E2E Test Store 1791084659401                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
eebc9d35-ac3f-4d2b-81fa-51cf5887eb4e | E2E Reset Test 1791084732107                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
cfecc843-41a4-4b1c-a538-5497a035097b | E2E Reset Test 1791084742036                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ebadd081-6475-4418-8db2-7aaa701bbd0d | E2E Multi blk1-mut9n0y1                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
37b81a99-2e30-4b70-8002-a96f01ef78fc | E2E Multi blk2-mut9n2c3                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
419b850b-286e-4486-8c01-39982b8d973f | E2E Multi blkd1-mut9n3n8                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f18e7eec-1415-441b-88d3-e388322fe88d | E2E Reset Test 1791084792666                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
2ac90026-5d2c-41c2-ac06-2e51c838a91f | E2E Reset Test 1791084800461                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f649859c-ff97-4b32-a4a7-46f73906ee6b | E2E Reset Test 1791084806271                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
093db089-49c9-4bdc-9665-dd4fc4cf8d9d | E2E Reset Test 1791084857111                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
03f6d16d-9884-4c2f-ad6b-acb34f321182 | E2E80 SW A mut9ot4j46oo                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
0b99e3d4-2288-4591-a385-d79b3a2d5dfc | E2E Multi blkd1-mut9ppkx                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
a3e9f9e9-de8f-43a8-9f58-9c4ecfa8a584 | E2E Multi blkd2-mut9pqxq                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
d717d0e5-1e8f-4461-bbf0-2825482df497 | E2E Multi blki-mut9ps8z                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
67db91c8-6e82-462f-8b7e-2cedd3d9488c | E2E Multi rls1-mut9ptom                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
c44307bf-ae83-4e68-86eb-edb1d7c12502 | E2E Multi perm-mut9pv10                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
fff32012-24d9-492e-8fa3-531b50e5a46a | E2E Extra extra-mut9tvnc                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
b65b37bf-d4a6-43cf-bd39-e71bb083f140 | E2E Slug Sanitize mut9tw13                           | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
6128cb08-8967-4f4a-951c-a89bea9c6b6a | E2E Test Store 1791085233482                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
9738c2c7-6e85-48c3-98a6-68c8ec828055 | E2E Reset Test 1791085299980                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
dc3b864d-3162-431f-bd5a-e85d1dabf5f8 | E2E Reset Test 1791085303781                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
aa4a6773-97ca-469c-863f-7e878b36dd97 | E2E Reset Test 1791085361618                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f515e525-a5a1-448a-8134-a35ce39a6c7f | E2E Reset Test 1791085366221                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ed8cb5ac-41ae-4397-8272-6853c084b2ab | E2E80 SW A muta0uvex3ur                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
04f7ce2e-7a0d-4041-85da-063e3de45d31 | E2E80 E2E-20261004-A7E782 ISO mutbj3t5va8m           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
04873685-349e-4a77-94c0-1d27230d8b63 | E2E80 E2E-20261004-B3D261 ISO mutbj4ae7pgs           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
05cbaade-952b-4978-9ad2-aaf1a42702a1 | E2E80 E2E-20261004-FEEDCB ISO mutbpnsy6fs6           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
21bdafce-50f6-4b5b-b0da-b6dae9fe2fb2 | E2E80 E2E-20261004-9CE289 ISO mutbpnx4veq3           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
75957ebe-662c-478d-9311-55806ec449cf | E2E80 E2E-20261004-A1ADA4 AP mutbyjbxihea            | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
fb54c22b-3d48-4d05-aa48-f3e9d746660a | E2E80 E2E-20261004-5CFBD5 AP mutc9jir4ey1            | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
75b93c32-3e1a-43ac-9754-d800f3071d48 | E2E80 E2E-20261004-F4F183 AP mutcost8o46u            | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
0e7d7f19-f2f8-4077-84d6-272f9bf4f431 | E2E80 E2E-20261004-F4F183 A11Y mutcqa8wz4hw          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
72bc7bc6-72ca-423a-b661-84ff78780d89 | E2E80 E2E-20261004-F4F183 FC mutcrdanuj52            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
64d864e3-9b19-447e-90cc-adde3a2f0a51 | E2E80 E2E-20261004-F4F183 FC mutcsmav25pz            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
6ce04e31-2891-467d-981e-d534c5899950 | E2E80 E2E-20261004-F4F183 FC mutctcmaun4f            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
bd433a4a-3e4d-46c8-86f5-1b08e6099c9e | E2E80 E2E-20261004-F4F183 FC mutcu3ute8qv            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
cedad205-1496-4510-96d8-81a0e5144b16 | E2E80 E2E-20261004-F4F183 CASH mutcwj3nj6ww          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
3f88a5fc-5ae8-43d3-ae92-a265f3ce5443 | E2E80 E2E-20261004-F4F183 CAT mutcwxbo4ujg           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
804327d7-1f5d-4cbe-8f8b-e5f5ecf25da7 | E2E80 E2E-20261004-F4F183 DEV mutcy9fpr491           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
3118cb59-b0f4-4bfe-a886-bc7257e1d271 | E2E80 E2E-20261004-F4F183 DEV mutcyis0o65c           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
94563c5a-1df0-4055-b5c2-7bb21c8aecf7 | E2E80 E2E-20261004-F4F183 DEV mutcypypsysg           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
710b12ea-e7ff-4068-a88e-37bce8977e9a | E2E80 E2E-20261004-F4F183 DEV mutcyxt8ojcw           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
3e5cd05c-bb8d-4a30-96ec-374722c0198f | E2E80 E2E-20261004-F4F183 INV mutcz5gwd4im           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
b3e8cd51-2d86-41a1-ad41-0dfca5a69b2f | E2E80 E2E-20261004-F4F183 INV-UI mutczn2ojssg        | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
2aac0459-2e82-4640-b9ca-768060acfe6f | E2E80 E2E-20261004-F4F183 POS mutd2fkg2msz           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=4
237e7fd9-67bf-4c57-b6ee-60e852a27883 | E2E80 E2E-20261004-F4F183 PRD mutd347c2wtx           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
19a73ed3-d4a5-4ccd-98f1-1e2e9fa1a786 | E2E80 E2E-20261004-F4F183 PO mutd3bk19j2e            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
51389a74-3ca8-417a-a299-6dee3fce5ab5 | E2E80 E2E-20261004-F4F183 REV mutd4f6vevnp           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=4
9bc8d6d5-deaa-4bee-9f4b-6635cbbf4fe9 | E2E80 E2E-20261004-F4F183 RBAC mutd5261nd96          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e12e2024-3a54-4ee7-99fc-2cc1dffefc50 | E2E80 E2E-20261004-F4F183 TRA mutd5pxi47g4           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
ee33f518-b860-4252-8903-33fd550c1da4 | E2E80 E2E-20261004-F4F183 TRB mutd5tw82euj           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
a39ee45e-9d57-4d87-83ba-f751143a2636 | E2E80 E2E-20261004-F4F183 ISO mutd7z6th7hp           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
6a0e45a0-51a4-4ee4-baf4-e119f23227a9 | E2E Multi mutd9mqdupaw                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c9fc9ed1-b893-49f3-9e71-dc197fafd2f3 | E2E No Addr noaddr-mutd9qwx                          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c1608f3c-963a-48fb-b997-d2dfe41bf413 | E2E Multi dup-mutd9sma                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
fda92083-7b8e-4e94-a877-932b23f9fd2f | Updated Name E2E                                     | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9241df37-30fd-4108-99a4-f01f3368e83c | E2E Multi del-mutdcfko                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
06143625-054e-489a-94dd-7e1bd3af0bc3 | E2E Multi arch-mutddu66                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
cf315437-8e79-48d4-8bb1-df5c377d3268 | E2E Multi dblarch-mutde0y3                           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
0f88ba2f-a4af-4fed-8fcb-e4e371075bab | E2E Multi rest-mutde5m3                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
41bc75fc-01a5-47f9-a9da-345bf8c331be | E2E Multi restactive-mutdec30                        | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
b718f372-1adb-4baf-9a42-98c13fadcdb8 | E2E Multi hb1-mutdeilg                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3d7a7fe2-134c-43ec-9d65-5c98fe790592 | E2E Multi hb2-mutdf8lq                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a1ac9cfd-203d-4610-b2b3-6222545c033a | E2E Multi blk1-mutdfgs5                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
915f0e59-944e-4179-9fb9-d3f2b5b19f96 | E2E Multi blk2-mutdfph9                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
38a6970b-0c2a-40d2-bb4e-db5268497ccd | E2E Multi blkd1-mutdgk2d                             | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
09a8e487-6e3e-4108-a6e8-c638981c9613 | E2E Multi blkd2-mutdgp4l                             | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
066fbf0b-893a-41e6-ac51-73787b5b2389 | E2E Multi blki-mutdgz5z                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e298c93f-bc9a-481d-a5d0-b32aa0ce6db3 | E2E Multi rls1-mutdh5s0                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a8f4734c-1f93-4e01-b759-41e8c2ff0db4 | E2E Multi perm-mutdhvru                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
5731bd55-b206-46aa-92ca-914ce9813ce8 | E2E Extra extra-mutdj012                             | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
32b6fb94-3f3c-40f7-bccc-ef9b2d9a2280 | E2E Test Store 1791092034960                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
2b055b99-8d9b-471c-936c-4e8410116efd | E2E Reset Test 1791092111636                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
fb3804f0-3876-486a-abb7-5d29c70e1870 | E2E Reset Test 1791092119866                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
b64e36aa-a296-4782-a126-d90305842d4f | E2E Reset Test 1791092182389                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
56143c3a-05b6-4d8d-8b92-61a216c2cef9 | E2E Reset Test 1791092185968                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1d7685fc-d8f2-4ce1-8852-f207da64ea17 | E2E Reset Test 1791092189501                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
28e97c45-f73b-41db-b0f9-076c5ee983ce | E2E Reset Test 1791092325485                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
dc0be0ca-4e09-4608-b7ec-0600975f4bef | E2E80 E2E-20261004-F4F183 SW A mute5utfsabt          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
2799f2e5-d599-4fcb-a74c-31ecf613e12b | E2E80 E2E-20261004-F4F183 SW B mute5y6qhaaz          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
245e675f-c778-4429-893b-b74fe3694112 | E2E80 E2E-20261004-54A1AB FC mutejou7w2h7            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
5cd6506a-3df2-4854-83d4-0930132a0e6c | E2E80 E2E-20261004-54A1AB FC mutekfu3p209            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
5a09e04e-a83d-40e4-bd49-d43b7131e8a0 | E2E80 AP muteyez7nwlv                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
53f62bce-3f4f-4ca0-bc52-ce09e910020f | E2E80 A11Y mutez189z4ew                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8d8ba071-6fa5-4da8-b0e9-38559364c6e9 | E2E80 FC mutezsryrwme                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
e3410344-7b17-4702-85bb-0afaee6d3e9b | E2E80 FC mutf0ut9d72y                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
261269d2-5e7a-4907-add0-ebc0f7ace358 | E2E80 FC mutf1i1fczx0                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
fc06a26e-6ad7-4c6c-8e41-323e03237cf2 | E2E80 AP mutf1xnyekqt                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
0fbe6dbe-111c-416c-b08d-9a5fffe74cc7 | E2E80 FC mutf246oqxwo                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
5c7f164e-b6a8-4897-b8d8-c937571b0a16 | E2E80 A11Y mutf2k0c5yb1                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8eff526c-4e92-46b3-bde6-04b903aaffce | E2E80 FC mutf2xao2aj9                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
71a6818b-50c4-4b02-9ca7-dc05c232c7f9 | E2E80 FC mutf3263wkiy                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
d596a75d-5cdb-4b38-854e-e4887319f7f5 | E2E80 FC mutf3iilwflg                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
45acead2-f19b-454a-a7bd-97e770e8d5a9 | E2E80 FC mutf3s2utrmp                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
4973c7d6-c5c1-4bad-9cfc-38f4831c0382 | E2E80 FC mutf44dkc1bn                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
2a6b51e4-f563-4b1f-91d0-e910d0d208d4 | E2E80 FC mutf4b7eybzn                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
2a382fe0-73bf-4944-9527-ccf573b609b2 | E2E80 FC mutf4zxjb7w9                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
584d1c33-86ec-4cda-ad6d-2f9ba0c22e90 | E2E80 FC mutf5ja38y9h                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
3b77bd1d-735b-42de-9d2c-549f4789df0a | E2E80 CASH mutf5rtsd3dj                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
2b737e98-7cad-4fd3-ac0f-a75157de7985 | E2E80 CAT mutf5y62ik6s                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
bc53a5d4-7ad1-4ebf-ba27-9112b0326ced | E2E80 FC mutf62kn4056                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
373fb387-868b-4d08-ad60-c18a950baf10 | E2E80 FC mutf6m2ah763                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
a9a316ef-99d2-4075-a5a1-7eb5a9e50c85 | E2E80 DEV mutf702cqcy5                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
efbdb301-7e3d-4b76-a749-129ca6f47e45 | E2E80 DEV mutf7eme3iwd                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
ec2237ab-f5e4-4737-9a69-a79a597796af | E2E80 DEV mutf7on1o5ub                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
5c548a39-76b6-4e05-bfee-1f117265ef44 | E2E80 DEV mutf7t9t0ge7                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
b87201ed-8289-4a0f-aede-6eed0b5811ff | E2E80 DEV mutf7x2mgacq                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
f3a557c2-f036-464b-a17a-41c0c13a897e | E2E80 DEV mutf828epzzx                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
c7d61ee6-25dd-4f34-a3ef-e4f20f9f5cd8 | E2E80 CASH mutf84b1t4aq                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
721f2967-d300-4581-9519-cb428c993a84 | E2E80 CAT mutf8839ufrq                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
9fed5e25-a782-40b6-963f-17225e43896b | E2E80 PO mutf8s36t4rf                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
0f902a99-2ac5-4991-a145-ec646ab50fc4 | E2E80 REV mutf90x2aakk                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=4
584c323f-d554-4d1c-9507-eb59ff11e8ca | E2E80 DEV mutf91mg36j6                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
c7b1d38e-e982-4f98-a765-749dba907e57 | E2E80 RBAC mutf9c4jjlgl                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
fbb621f2-e142-4793-baaf-0d5aae973130 | E2E80 DEV mutf9jhsdxmo                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
56848ec3-42f2-41d2-8282-8bac20fa26e0 | E2E80 DEV mutf9n927vs4                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
c3a10941-cd24-467d-89f3-787854c5ec4a | E2E80 DEV mutf9qd0ni1f                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
3901027f-7635-4246-bf01-f34f87be9907 | E2E80 DEV mutf9vcprr5z                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
cf22f26a-2010-442d-aae1-52da39627325 | E2E80 DEV mutfa0n6pi4k                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
9720ad5c-3f4e-4924-b606-7b0b80f92376 | E2E80 TRA mutfabvu1fxf                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
b46b8648-f2c7-4688-9891-45a2365c154d | E2E80 TRB mutfadmqtgtl                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
e5c62da9-5385-4e94-a192-a1192142eb67 | E2E80 TRA mutfauy7j62l                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
963c7052-eceb-4c0a-a700-3001cd5ef3a3 | E2E80 TRB mutfavvydpl3                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
8249caf6-932d-4741-9c8f-1d20ec12363f | E2E Multi mutfc4c4ghq7                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f6048798-4bc8-47c0-8a06-5282a733b7de | E2E No Addr noaddr-mutfc7nr                          | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
88438426-df57-4e7f-aeaa-d196ab17e12c | E2E Multi dup-mutfc8f8                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
64217c07-76a7-4e18-9141-6f2bf9456046 | E2E Multi mutfdimu7e5h                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
9e5c5ed1-0023-4c97-8670-123aef66a3c3 | E2E No Addr noaddr-mutfdkwx                          | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f2f9a817-541f-44fa-973c-1aa062d6150c | E2E Multi dup-mutfdlr2                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
e41676f8-cfc7-4929-bc1b-17395b1ef70d | E2E Multi upd-mutfewg1                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
408cede7-136a-49b1-a14a-f45771d6e10a | Updated Name E2E                                     | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
dea62184-9526-40af-994c-908c0358fe2e | E2E Multi del-mutfg8lj                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
35f82996-18f4-4086-a091-e91f41e02799 | E2E Multi arch-mutfho50                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
6f37e01a-3be6-435a-94e1-b687c94f8254 | E2E Multi upd-mutfhmpd                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
25becc3a-df5e-4002-af37-22e3e1d634d8 | E2E Multi dblarch-mutfhri8                           | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
14df6304-6d28-4567-ad59-047f38a19449 | E2E Multi rest-mutfhsu0                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
7c4aad68-dc24-4cdf-a280-97bfc25fd04b | E2E Multi restactive-mutfhub7                        | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
62a807da-192f-4821-956e-aa55121c5525 | E2E Multi del-mutfhtul                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
9714f910-5cf3-4e85-b184-6036af56e70f | E2E Multi del-mutfhwor                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
77609406-a42a-4022-a23e-38edff9b9db3 | E2E Multi arch-mutfi3km                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
28b68e25-2bdb-4c20-985e-ad8af661d57b | E2E Multi dblarch-mutfi6c2                           | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
3e66ab3d-c772-47e3-889b-dc6d0a6a820b | E2E Multi hb1-mutfhw12                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
10a2b7f0-6917-4ed3-9c3e-2c6233349b4b | E2E Multi hb2-mutfj1jm                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
3e2e2b59-c62c-445a-9457-2cc15b36103b | E2E Multi blk1-mutfj3ti                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
7437cb65-1cb1-4c86-b6bb-b5806bc8972b | E2E Multi rls1-mutfj59p                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
6acd00d1-dc52-4383-aca6-d4b23ace1c6a | E2E Multi perm-mutfj8lz                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
4cf8efc9-fbbe-4182-9172-6a6c3bfa37b0 | E2E Multi blk2-mutfj625                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
83d6feff-3dec-445f-9bd3-777a28f47067 | E2E Multi blkd1-mutfkdma                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
7f943be7-4baf-4095-b209-b6ec40e9efa3 | E2E Multi blkd2-mutfkfd2                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
de393253-1b01-4580-a507-c005cd9620de | E2E Multi blki-mutfkgln                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
22816383-3dee-4ca3-b256-1b02227213c2 | E2E Multi rls1-mutflnj3                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
fccd37ec-8924-456c-aacb-3c84897d61ef | E2E Multi perm-mutfltqi                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
2a3238d6-09dd-4af5-967f-781740a5311e | E2E Test Store 1791094878306                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
18428de5-bb33-4f7f-93b8-61fe0e463e0d | E2E Reset Test 1791094946709                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
5181737d-e400-450f-bf0e-ba36a14e17ca | E2E Reset Test 1791094951752                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
33baf406-588f-4670-b207-b3603ce5aae9 | E2E Reset Test 1791095012606                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
9b45109c-9699-4517-86af-9fe5c89f8668 | E2E80 SW A mutfqk7csbe5                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ca4483b2-ca13-487c-be99-2a4099eee0f6 | E2E80 SW B mutfri26vvua                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
97a57261-0209-4089-91c1-5f042cc06fd4 | E2E Extra extra-mutfu3qd                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
a9cf9741-865d-4afd-ae1e-c2a58d3ed0d5 | E2E Slug Sanitize mutfu47b                           | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
04d98987-97c5-44fb-a25e-4b7acc10813c | E2E Test Store 1791095319725                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
0deecd28-f1f5-4ea1-842a-25889503357f | E2E Reset Test 1791095386979                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
63a278e9-881c-442a-a045-3ce09575164d | E2E Reset Test 1791095390774                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
791187c4-0482-40c7-b3f1-1025f4f58fe9 | E2E Reset Test 1791095465291                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
1f3b3f57-c6a5-447d-b6a5-9a57047f4d54 | E2E Reset Test 1791095469709                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
313bf778-f7c3-4b26-bcb4-4b0eb285de79 | E2E Reset Test 1791095471851                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
9c627fad-df71-475d-b927-651944055883 | E2E Reset Test 1791095604398                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8013192a-5db6-4677-9124-a4e7948d82f8 | E2E80 SW A mutg44wuhq33                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
70635f75-196c-4f83-a615-0750f636cc20 | E2E80 SW B mutg46qwk8ry                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
caf9ec09-b226-499e-be27-35b9b5260214 | E2E80 AP mutuc5zul7b0                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
2e11defe-e136-4639-90ae-99c9ccdb74e9 | E2E80 A11Y mutucl95o77v                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
4e56faf4-b79c-4fcf-8860-c4383286bbe9 | E2E80 FC mutudfcy79dr                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ecf19552-0a27-48c1-bcbe-5a253ec6fe6c | E2E80 FC mutue7yny5r9                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
89b2e96e-e067-45e3-8d92-a2b74ebc274e | E2E80 FC mutuesvnrlk5                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
a48ac6b9-6bf9-4b55-a01c-c120d1492600 | E2E80 FC mutufdj73gre                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
bf2080c5-1284-4ce2-b296-8f3d4e5aacfd | E2E80 FC mutufxlkkdbu                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8629df16-9262-43e2-b600-b08ec1eeb363 | E2E80 AP mutug7hazp0v                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
c62dc112-e90d-46a3-ba2d-faaffe401c98 | E2E80 FC mutughqtsdk4                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
1df54a05-3c4b-4459-ba5f-796a5843246c | E2E80 A11Y mutugui0kgoq                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
5aff2525-3530-4769-a5ca-9876c508614b | E2E80 FC mutuh2bivn0l                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
3decf074-8d1f-47ea-abf7-ef6f5978e5e9 | E2E80 A11Y mutuhil8v5pw                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
eab01255-886e-4ad1-9a0c-4cadb0813bc9 | E2E80 FC mutui352za25                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8b648722-12e5-42fd-8829-67a3cf5e0d21 | E2E80 CASH mutuihojrbsu                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
9a7a59d9-68eb-49fb-a931-e17b06cef242 | E2E80 CAT mutuin1nbohw                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
92dc5dba-0c6f-4e0d-a89a-4850a0e501f8 | E2E80 FC mutuj0z4840l                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
1390bbd1-520e-4227-8c0b-57596cd59fa0 | E2E80 DEV mutujhipujse                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
56f70354-8975-41b2-a9c3-d94849f3719a | E2E80 FC mutujobi5p4h                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ce6e8fa2-3ede-426c-8897-e2bb6b3b0d41 | E2E80 DEV mutujybz4fz9                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
58db3b7b-3a40-47b1-8323-ed49c24b91c8 | E2E80 DEV mutuk24x2f60                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
aa5ea42c-65bd-47ef-aec9-e7469261f340 | E2E80 DEV mutuk56km2os                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
11b33a7a-abbd-4e9b-8671-2f8d26ce30da | E2E80 DEV mutuk84drzov                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
0e7008fd-bb11-403a-9080-a4e53e85ebaa | E2E80 FC mutukboskbtu                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
4e47b20c-6731-43a0-bbd6-c21b01e3b87f | E2E80 DEV mutukevahey3                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
3f2b41cd-6af4-4eb6-bff5-79925a7dd168 | E2E80 FC mutukzucf33n                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
0ff066f4-09f9-479b-bd31-56f2af4ad619 | E2E80 TRA mutul9uvugmk                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
dd93a9c4-f956-4c4a-ab3a-d6fc15728fcb | E2E80 TRB mutulb0dsulq                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
c4f0b23e-d0d9-460f-b7f0-f26a61c18299 | E2E80 FC mutulkojjxpw                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
cdb4433e-92b8-4669-a953-19e3da7b4af5 | E2E80 FC mutum6c7ft7r                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
587e40e0-cefb-461e-b9aa-b2f3c2c8f94f | E2E Multi mutummhob58b                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
832cb9b5-5faa-4f67-b3ad-212feca59dcf | E2E No Addr noaddr-mutumnql                          | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
02b1ffb8-7f0f-44b9-a625-fa885ca03e1d | E2E80 CASH mutunuaabgbk                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
778f4045-faf5-4481-8c14-e33a15ccaa46 | E2E Multi dup-mutuo0hq                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f718a84e-024b-4e10-8704-a4d341ad614d | E2E80 CAT mutuopuopitb                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
35fff507-3568-4029-8a59-a6807a862172 | Updated Name E2E                                     | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
61776f22-112c-4a89-98f1-dad43ddca9b6 | E2E Multi del-mutupkr4                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
eb261a1f-9f82-4c38-8f7b-e576777038b5 | E2E80 DEV mutupr5l2l3l                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
93d2c5ca-eb46-42e9-81f1-352dd97af7c2 | E2E80 DEV mutupwrzfwcc                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=1
4f6fd829-3b83-45eb-921b-e227b1661074 | E2E80 DEV mutuq3sws2k1                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
74c875b4-6323-48f7-9b44-8fb3671ba3d8 | E2E80 DEV mutuq93s7ga4                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
db4fab3a-26d9-47cf-982b-5243c9e17949 | E2E80 DEV mutuqdmz6uzh                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=1
39472c28-fd0a-4d1f-9aac-497957538bb2 | E2E Multi arch-mutuqxkd                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
e12a3933-784d-4dc2-8af4-3dc810005563 | E2E Multi dblarch-mutuqzpn                           | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
fccb18cf-a329-4adb-b264-e5e5ab83e631 | E2E Multi rest-mutur1aw                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
824a0f2d-985b-46bc-b588-4ba9bff8924a | E2E Multi restactive-mutur2sh                        | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f5cdd58e-c9ee-42e5-8810-a1166e39bc15 | E2E80 PRD mutur4t2i4mv                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
5f306951-947e-4e3d-a273-b265bba7ae40 | E2E80 PO mutur909hmc8                                | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
05e787d2-c438-4751-b4bd-b116cc4889db | E2E80 REV muturgj23bje                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=4
3154f5a3-6f2b-4926-9150-263d0beb82df | E2E Multi hb1-mutur4kv                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
c186bf31-e3b5-4ec0-b96f-a59bbc04bbad | E2E Multi hb2-mutusbgw                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
42d72bb1-b50e-45af-9a24-a728e1e4e5bf | E2E80 RBAC mutuskgxzgwz                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
f0445533-7bdc-48bc-9841-d199ec1bd760 | E2E80 TRA mutuszme7btr                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
b72d5dc8-a953-4fc2-837f-18e68ea6feb0 | E2E Multi blk1-mutusf49                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
d4899050-c67b-48a6-99bd-fd8dfcc708c1 | E2E Multi blk2-mututm3x                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
7a361725-7e56-4127-b682-fd4e11c8f9ef | E2E80 TRA mututva4xqs1                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
f4c28481-b0dc-4fb4-b9e9-5d853c89d4a6 | E2E80 TRB mutuu0aseroj                               | 2026-10-04 | arch | Default Tenant | m=1 p=1 t=0
63baed9c-22c4-4854-ac11-70cde0db56a3 | E2E Multi mutuvny8nbue                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
2157892c-7cc4-44c6-85f0-c36fad778c85 | E2E No Addr noaddr-mutuvrdz                          | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8ca93ca9-807e-4c97-8d10-cf3f51b7a6f8 | E2E Multi dup-mutuvshl                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
2275f3a9-ff43-43cf-9931-8660c10a963f | Updated Name E2E                                     | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
02afb113-e578-4b98-b190-446794263114 | E2E Multi del-mutuyh3a                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ea34ee83-6cb9-49f4-a738-add0c0d649fd | E2E Multi blk1-mutuyxtn                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
83d9db68-af05-4567-9061-de2bf66a5009 | E2E Multi blk2-mutuyyvk                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ff9f864f-6716-4f2a-9e3d-9908b1656694 | E2E Multi blkd1-mutuz00t                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
094a19ad-63b5-4040-982b-c953015addfa | E2E Multi arch-mutuzu6u                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
683f904e-44f8-43b1-8781-a54f72ca4329 | E2E Multi dblarch-mutuzxbc                           | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
98e45746-ccd7-411d-87b6-32019d24d574 | E2E Multi rest-mutv013x                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
6dd5d683-b1a7-4a4e-964b-2a4e469c6a4a | E2E Multi restactive-mutv0716                        | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ee711428-f0ef-4dc8-b9e2-f7f40b2ed116 | E2E Multi hb1-mutv0d68                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
af85d09f-7013-47b5-a816-9b4e65a1780a | E2E Multi hb2-mutv17qh                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
cbc7780e-a2f2-4e9f-8df8-bdc639829951 | E2E Multi blkd1-mutv1m4n                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
aa0d987c-9449-48f1-b684-2513da6b45e1 | E2E Multi blkd2-mutv1n1u                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
5f8db485-34e1-49c4-a3c4-1fef7a10f81d | E2E Multi blki-mutv1o8b                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
33a79062-b81b-4fb2-82a1-6ccad9dfc630 | E2E Multi rls1-mutv1ppi                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
993a556d-eae6-448f-ae85-7d2b15d438fd | E2E Multi blk1-mutv1fmc                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
665fce54-04ac-483a-814d-f8dcf87c370c | E2E Multi blk2-mutv2hkx                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
4c4d1143-0bc1-4808-b416-578ef972a366 | E2E Multi perm-mutv1qy4                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
ef904ccd-7b0a-41d0-a374-ada66a0f0aea | E2E Multi blkd1-mutv2pfx                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
04279611-9488-4484-9542-047e10ad63d1 | E2E Multi blkd2-mutv3suo                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
215ebc3a-d56d-4b85-930e-2ee72dd38ebe | E2E Extra extra-mutv5r44                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
13b442fe-80f7-4283-97a9-2d4a2a543954 | E2E Slug Sanitize mutv5rjv                           | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
0fbce7d3-49b3-4591-9da6-32ea7985e0d8 | E2E Test Store 1791121065535                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
0166fe9b-6a82-406a-944e-259a6e29d80c | E2E Reset Test 1791121135870                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
535eff14-6edf-4786-8852-2622b65a0918 | E2E Reset Test 1791121144195                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
9537fd92-00bc-4b44-875a-df37a3d04845 | E2E Reset Test 1791121205026                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
2ee1fc52-4ffb-4f7c-95af-ab9d85dddf79 | E2E Reset Test 1791121206813                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
95f0b2f2-3ee0-4ded-8b0f-67319fe020ce | E2E Multi blkd1-mutvbto4                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
2b6298e1-bae3-443b-b339-98c50f4c62a8 | E2E Multi blkd2-mutvbv6p                             | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
588ac115-195c-4499-bc39-486ee2faa825 | E2E Multi blki-mutvbxzd                              | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
1ebaee8b-8eee-4aa1-97a4-8cb517764d07 | E2E Multi rls1-mutvc0k6                              | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
d1758ce9-c15c-4f28-9acc-bae2682faa3e | E2E Multi perm-mutvd7d8                              | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
cae3b73b-23c4-463d-acc8-57258fc994e6 | E2E Extra extra-mutvg3i6                             | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
a6664d7f-07f1-4735-96db-2176f5b1c975 | E2E Slug Sanitize mutvg42u                           | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
658d8ca0-b229-47b7-be58-e70d48ad8a5d | E2E Test Store 1791121575704                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
51fab070-c439-4f15-9aba-38a4e04e6084 | E2E Reset Test 1791121644251                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
3777b2fa-8bf4-475c-8cbf-fc118b935953 | E2E Reset Test 1791121648744                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
1527fad9-c348-4fa1-aca8-07ccca7c8e82 | E2E Reset Test 1791121706469                         | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
3187d684-3d39-49aa-8a27-a3ae514b9675 | E2E Reset Test 1791121712544                         | 2026-10-04 | ACTIVA | Default Tenant | m=1 p=0 t=0
b973727a-480b-4321-8bb3-a86118f34e93 | E2E Reset Test 1791121714695                         | 2026-10-04 | ACTIVA | Default Tenant | m=1 p=0 t=0
15c3c1ad-9cb6-4d62-ac21-ec061c711dc6 | E2E80 E2E-20261004-225F77 AP mutxdna6qyws            | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
b3d9afb3-a2f9-4429-b7de-8864476ad19c | E2E80 E2E-20261004-225F77 A11Y mutxe94u9hyn          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
5268cc35-fa6c-4bbc-a471-31270c5085f8 | E2E80 E2E-20261004-225F77 FC mutxes624bb0            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
7ced2e9f-1846-48c9-8096-279005f4b770 | E2E80 E2E-20261004-225F77 FC mutxfjen92ah            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f0c96337-4542-4dab-9e2e-03694af8a2a5 | E2E80 E2E-20261004-225F77 FC mutxg3gan9te            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
bebbe6e7-9ff0-4211-9136-2d7eeb94d271 | E2E80 E2E-20261004-225F77 FC mutxgp7349pm            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
af9c6436-2aa9-4dfb-8649-67283db6ea75 | E2E80 E2E-20261004-225F77 FC mutxha6wzgql            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
306ecb5a-c284-44cb-91c5-263019fa1dce | E2E80 E2E-20261004-6B1C25 AP mutxhmnrhuvr            | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
1806ce8c-0d0e-4b47-8bae-f5ebd808ff22 | E2E80 E2E-20261004-225F77 FC mutxhu3r70yg            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3600256a-86ce-4b32-a283-71b7a81318a0 | E2E80 E2E-20261004-6B1C25 A11Y mutxi3d228t1          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
6bab50bd-44c6-472f-9ba6-c2140609b95b | E2E80 E2E-20261004-225F77 FC mutxido2un9i            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
7093c977-a806-4956-a9ed-d7928ac23c21 | E2E80 E2E-20261004-6B1C25 FC mutxik83gvgk            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
94dd13d4-e0b4-4f52-bcbc-6138975fa180 | E2E80 E2E-20261004-6B1C25 FC mutxjaimrkjv            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c019baa8-510d-4b98-89d2-4bb3afa64be9 | E2E80 E2E-20261004-6B1C25 FC mutxjtbqxuq4            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
60f674ce-2a28-48c9-bc3c-6b8ca5c3c4b2 | E2E80 E2E-20261004-225F77 CASH mutxjt5u7d1s          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
7a7616ad-9e6c-46f2-b7cc-db7610fba882 | E2E80 E2E-20261004-225F77 CAT mutxjyaz8gq6           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
8fd628b8-e751-4c8b-a8ed-25968afc53e0 | E2E80 E2E-20261004-6B1C25 FC mutxkc5xfe6j            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1f0e7585-7ec5-447c-aa0c-b3b7b43d7a16 | E2E80 E2E-20261004-225F77 DEV mutxkx47p5z9           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
90f0f77d-bae2-48ad-90fe-bc8c63afddfd | E2E80 E2E-20261004-6B1C25 FC mutxkxqu5s0r            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
635074d8-35f7-4a98-96d0-ddf69da25b15 | E2E80 E2E-20261004-225F77 DEV mutxlebipgua           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
33907aaa-2e2a-4da1-9a7a-a69979cc04ef | E2E80 E2E-20261004-6B1C25 FC mutxlwcd3g5q            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ff097f38-0057-4345-90ca-a9f95576cc34 | E2E80 E2E-20261004-225F77 DEV mutxlyb3cv29           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
7fc559e8-d9b9-4c51-aa53-86f3219ec212 | E2E80 E2E-20261004-225F77 DEV mutxm9p25xts           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
f28bd59b-13d8-49ea-8712-2c821cb0c66a | E2E80 E2E-20261004-225F77 DEV mutxmi302h6v           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
c460b3e3-fa69-4963-92b0-68d20f016639 | E2E80 E2E-20261004-6B1C25 FC mutxmjtuucv0            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ee44eb6c-e127-485a-afde-112520dcf045 | E2E80 E2E-20261004-225F77 DEV mutxmp4us0hk           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
304ecb02-4b36-4cf2-a2ec-f7917ff20e30 | E2E80 E2E-20261004-225F77 DEV mutxmsvyb181           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
71ee128a-4f96-4215-94b8-90e3c4ea29c2 | E2E80 E2E-20261004-225F77 DEV mutxmz5g9zgs           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
c80d7b9c-bd2e-4d2b-8a0b-78995ee21e4b | E2E80 E2E-20261004-225F77 INV mutxn37rvu89           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
396171b0-6f4d-460a-a2bb-b1dbc4cb1a01 | E2E80 E2E-20261004-225F77 INV-UI mutxn7sfit71        | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
d9cb1a7b-7599-498d-9fa2-98beea6d4ca3 | E2E80 E2E-20261004-6B1C25 CASH mutxnzjge0ww          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
43513977-b3c3-4c99-b63c-4fcb589c8910 | E2E80 E2E-20261004-6B1C25 CAT mutxo4eisx33           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
981cdcba-286c-4506-9cba-1d411f2df6f8 | E2E80 E2E-20261004-6B1C25 DEV mutxp48aazov           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
ad973487-3876-4e32-b444-b37a01de6b56 | E2E80 E2E-20261004-6B1C25 DEV mutxpeyz1hsm           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
0b890989-c4ce-42ca-a273-bb5aca9e6f44 | E2E80 E2E-20261004-6B1C25 DEV mutxpi08i7zj           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
c8f75803-ba12-4629-a24a-987e72612fab | E2E80 E2E-20261004-6B1C25 DEV mutxpkr71pl5           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
72efff42-a345-4d41-9ee6-c73f5fdab9a3 | E2E80 E2E-20261004-6B1C25 DEV mutxpncivn7h           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
ae31c391-5ee6-4988-9cd6-fce76ad298cb | E2E80 E2E-20261004-6B1C25 DEV mutxpq0l2bgb           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
4d5cbdf0-7f33-4ec1-89b4-bf36633b32bb | E2E80 E2E-20261004-225F77 INV-UI mutxpwp0ehav        | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
d9823169-05dc-4604-bf63-06fcc034a1a5 | E2E80 E2E-20261004-6B1C25 ISO mutxqyrrabh0           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
018fd8e6-de85-4010-a67d-8cf8aef6203c | E2E Multi mutxrpo0chh1                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
5734642d-5efe-4f69-b63b-b786d5e5dbfc | E2E No Addr noaddr-mutxrqqk                          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
94d678f4-a6cf-4268-8f6e-21341dcddfb3 | E2E80 E2E-20261004-225F77 POS mutxsl73f4rf           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=4
08a4682c-6814-4cb0-99cc-f1e337dbf2ed | E2E80 E2E-20261004-225F77 PRD mutxsz3hyxn6           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
7de870e4-be85-4ca9-a2df-0512de6628b7 | E2E Multi dup-mutxsadc                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
767e1579-6a71-46ff-bf21-707c702c1b24 | E2E80 E2E-20261004-225F77 PO mutxt2ej43lb            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
577df2e1-c7e0-48c2-aa9f-86d19ee2b8c5 | Updated Name E2E                                     | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c4912eda-e21e-4b45-9f45-76942d39cfd9 | E2E80 E2E-20261004-225F77 REV mutxub16n250           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=4
b63eee74-7996-464c-9f6e-c91d21da049c | E2E Multi del-mutxud5w                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
30d6176c-33c2-4449-b4c2-5cff8b2ef76d | E2E80 E2E-20261004-225F77 RBAC mutxujcabd6v          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
eaa9ded2-3855-490e-b1f6-933bb3d7c586 | E2E80 E2E-20261004-225F77 TRA mutxvmbeviny           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
5d578653-080c-46ce-b99a-d544bf3a4eac | E2E80 E2E-20261004-225F77 TRB mutxvoe6lfd7           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
f9b71e4f-4b39-4ca5-aae7-a43cac1073a9 | E2E Multi arch-mutxvp8i                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
87c64408-3367-40c3-bd6b-498a26f36052 | E2E Multi dblarch-mutxvrdc                           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f3fbccbf-fabf-4b84-8657-2e72c03d6038 | E2E Multi rest-mutxvssd                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
514f2483-90dc-43ea-b5b3-c601da551967 | E2E Multi restactive-mutxvvch                        | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
2e377c1a-4c8d-4d4f-ba93-28ee02cc942c | E2E Multi hb1-mutxw1su                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
4c9ce5fb-201b-4b29-b7a4-9fc416882c8b | E2E Multi hb2-mutxx100                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
2d91fe7b-4a8c-44d3-951b-86291c9cb9fd | E2E Multi blk1-mutxx3f5                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ecc9c3c8-15d6-4fa4-a710-97b7f2771e9c | E2E80 E2E-20261004-225F77 ISO mutxxacmr2b7           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
d66b2b17-9edb-4346-b047-dd71318fe197 | E2E Multi mutxxzxve05v                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
186e7c81-c7f7-4524-87b7-b9c9a402b1ae | E2E No Addr noaddr-mutxy1ac                          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
2e25e459-b9e8-4693-af02-62494a48fc66 | E2E Multi blk2-mutxx80m                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9e49400b-5ad5-4aa4-aec6-e8981de3e215 | E2E Multi blkd1-mutxyc5q                             | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
61152d94-c6f8-43e0-b512-eb28c41e4a24 | E2E Multi blkd2-mutxydk3                             | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f8ed798d-f0d5-4875-849c-5965d5d937aa | E2E Multi blki-mutxyfj3                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
654da79e-e5f7-443c-ba68-8c60fe657255 | E2E Multi dup-mutxym4o                               | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
0e1ff3d4-0571-4c4a-add8-eb8e4bd92549 | E2E Multi rls1-mutxylcj                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f139043a-84e9-4186-bd0b-1ac19b8ec204 | E2E Multi perm-mutxzn40                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f355456f-202f-4cc9-be49-8bf25608136d | E2E Multi upd-mutxzwqb                               | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
d8b1b503-8e74-413c-bbca-9078ffe5ab6c | E2E Multi upd-muty202u                               | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
88ee3372-82da-464c-9caa-6284b3f89382 | E2E Multi del-muty23zr                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
cece4622-4d51-4cdb-9aa1-e10b57ab0570 | E2E Multi del-muty262v                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c16b9845-2470-4203-be7f-a18825bd93e0 | E2E Multi arch-muty2bah                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3d85150b-08e3-4d12-a25b-bef5fe567882 | E2E Multi dblarch-muty2djr                           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
20ede1a9-8d1b-4f42-b364-ef94baa0485d | E2E Extra extra-muty3iym                             | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
817e82c2-fe69-49d2-89a5-2c95c4e1d393 | E2E Slug Sanitize muty3jht                           | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ed6ee1fa-4192-4f71-8493-39bf8b108e47 | E2E Test Store 1791126010740                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ccc4ed43-9f01-43de-9c94-832260fa6143 | E2E Reset Test 1791126077591                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
7ea7be64-9047-4c26-983c-0b03d61bcd7c | E2E Reset Test 1791126081692                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a352797e-509a-496b-8688-0a51a41706cc | E2E Reset Test 1791126141730                         | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
dcdc953c-b7da-481f-9023-9a9a7c480acf | E2E Reset Test 1791126143284                         | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
5d71caa0-7180-4d5b-9863-4992ebc51706 | E2E Reset Test 1791126144561                         | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
5f8276c5-7d23-4591-ae00-98d1fdf68d77 | E2E Extra extra-mutyaic9                             | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e63910ea-22d6-4f5e-bc17-80c5fc61d249 | E2E Slug Sanitize mutyairi                           | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1c970c5a-abe6-4663-ab90-749331fe9023 | E2E Reset Test 1791126275056                         | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1c93e7d7-d030-4da7-8b8f-a2d1e5b8522b | E2E Test Store 1791126353132                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
01aa82b2-42b0-4ce6-8f54-51ddf77c0a8c | E2E Reset Test 1791126421872                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
645d1442-9830-4003-af30-dd76d7a6dd4f | E2E Reset Test 1791126425524                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c287608b-2dbd-4732-9d9f-868118f57a3b | E2E Reset Test 1791126485238                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e3e76357-a2b8-4e22-b0ad-98d8d032e542 | E2E Reset Test 1791126489593                         | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
cb728989-e8d1-4f96-820b-a481013990e7 | E2E Reset Test 1791126490658                         | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e1e6eea5-7ab6-4c6c-909a-be98612f55df | E2E Reset Test 1791126491621                         | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
0bca7775-ebd9-4717-b6fc-ddf03f1f4265 | E2E Reset Test 1791126618267                         | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
356c19e0-2fb0-4050-aa0d-f1b92cb086c5 | E2E80 E2E-20261004-6B1C25 SW A mutyju0niy05          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
601a55f7-8225-4e7d-b6b9-265ab5237fed | E2E80 E2E-20261004-6B1C25 SW B mutyjv2usrlj          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
635eb257-9cb0-432a-82fc-97aa7a0a5ca4 | E2E80 E2E-20261004-0F6F71 AP muu3yplxl7td            | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
03e8fa82-54ab-4b54-858f-63c594deaf2f | E2E80 E2E-20261004-0F6F71 A11Y muu3yzlocq7p          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
abee8e2d-80c9-4d8b-8910-1e0e28d3c924 | E2E80 E2E-20261004-0F6F71 FC muu3zk5khe6r            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c725bd98-5b0a-47aa-92e4-4fc27769ca5e | E2E80 E2E-20261004-0F6F71 FC muu40be2etz9            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a3e775ea-8f62-4514-a22c-6282395e8918 | E2E80 E2E-20261004-0F6F71 FC muu40txeog4g            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
5e469a96-1f1a-464d-8a01-33cd2e9ae713 | E2E80 E2E-20261004-0F6F71 FC muu41cazhig0            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
37d7f986-32f1-4596-8ff5-a6ff75ed05a0 | E2E80 E2E-20261004-0F6F71 FC muu41w11x2eq            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
8dfafa9f-e432-4ec7-896c-e8ba2f1dfbed | E2E80 E2E-20261004-0F6F71 FC muu42km9vy5t            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
03c12b94-59ef-4d6f-88e0-812c959e4161 | E2E80 E2E-20261004-0F6F71 FC muu43749iiqg            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1f03de99-61e2-4eb1-bca7-817e28bc0595 | E2E80 E2E-20261004-0F6F71 CASH muu44osuvbip          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
bec94301-a175-48dc-9e11-1b0cf9251896 | E2E80 E2E-20261004-0F6F71 CAT muu44rsssxjc           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
b55d69e1-3daa-42c6-b572-ca6125432c8a | E2E80 E2E-20261004-4F0978 AP muu457fpt0a1            | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
3a3b4e6a-cd61-42eb-acd2-4018047e6ca5 | E2E80 E2E-20261004-0F6F71 DEV muu45kz3tmq5           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
9d8d4714-ffb0-44c5-8190-c2b7b83f097d | E2E80 E2E-20261004-4F0978 A11Y muu45q2aq9mb          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
cf1bbbfc-7b8f-48f4-b745-870423a1da33 | E2E80 E2E-20261004-0F6F71 DEV muu4634mi6cj           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
bdafdb60-1464-452f-87c1-7759b7454723 | E2E80 E2E-20261004-0F6F71 DEV muu465ho106y           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
ced57853-e2a3-4231-b2c4-0e24f63b2788 | E2E80 E2E-20261004-0F6F71 DEV muu469g5l007           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
c15355a3-7073-443f-8076-2ccb3fd11bce | E2E80 E2E-20261004-4F0978 FC muu46asiwarz            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
711c8647-58ae-4d9e-a1b3-74fa14ab504a | E2E80 E2E-20261004-0F6F71 DEV muu46bt6j7wb           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
bba57499-346f-48da-85c7-28976886ce70 | E2E80 E2E-20261004-0F6F71 DEV muu46dyshh25           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
631db447-9cb7-49d9-bd61-833285ae8858 | E2E80 E2E-20261004-4F0978 FC muu475uzfp2y            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9774d25f-a91e-4e30-9664-19d4a4e9accb | E2E80 E2E-20261004-0F6F71 ISO muu47ff09t16           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f305b24e-0d3f-4e41-8ba2-b1f8b3c88c5b | E2E80 E2E-20261004-4F0978 FC muu47r29zy69            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
b27b5c93-18b6-4a54-837a-165345dc306f | E2E Multi muu487enxjvi                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
00780fe0-a59b-49f4-a45f-32599d7f2a93 | E2E No Addr noaddr-muu4884a                          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
6c1f5f06-8748-4001-881f-33497331cbfb | E2E80 E2E-20261004-4F0978 FC muu48bkffsnj            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c18964f8-4876-43c6-aa97-2198c89e9b12 | E2E80 E2E-20261004-4F0978 FC muu48wba4jxk            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
be4e3a1d-56c0-4fb9-a5f0-52bfedc58152 | E2E Multi dup-muu48qlq                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c99ffc98-ffa5-4971-b9c4-eaedcc3ad9d5 | E2E80 E2E-20261004-4F0978 FC muu49hjmp6hc            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
90301bc1-7c84-4c48-8dbe-d6887c549e55 | E2E80 E2E-20261004-4F0978 FC muu4a43ntq07            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
69f1493e-7cbc-44e5-be66-c86aa03220d1 | Updated Name E2E                                     | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1093eea8-c7e1-4872-aa25-72a448b8f487 | E2E Multi del-muu4auf2                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
2ee96eb2-a8c4-4830-b524-8ed3b2cd76f7 | E2E80 E2E-20261004-4F0978 CASH muu4bq3nvq2n          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
2ec214ec-f795-4fcd-bf40-a05f85299091 | E2E80 E2E-20261004-4F0978 CAT muu4bvdetueu           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
b08f1f6d-5f7b-4ff5-9fb7-55438eb658bc | E2E Multi arch-muu4c629                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9baba218-a4c6-4ae4-baf2-042fb34bca03 | E2E Multi dblarch-muu4c7go                           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
7f1d560e-eb82-41f3-a6cd-7e98abbc5447 | E2E Multi rest-muu4caw4                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
4d17a659-657e-463d-b182-5cd57bded31e | E2E Multi restactive-muu4ccdf                        | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e4b9e345-9611-4559-9f91-ec0445d85f5c | E2E80 E2E-20261004-4F0978 DEV muu4cth8yxi7           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
7dfe6a1f-fffb-46aa-b235-e6400c5b0e26 | E2E80 E2E-20261004-4F0978 DEV muu4d8gjvac4           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
44e02aac-f596-449e-b8f0-7de4be8849a7 | E2E Multi hb1-muu4cdl8                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
8e7d8774-f2ae-49d0-ac47-ffa90edc8980 | E2E80 E2E-20261004-4F0978 DEV muu4dsdegw0v           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
c2d3d61c-957b-4c67-ad59-8418f0547fe9 | E2E80 E2E-20261004-4F0978 DEV muu4eavaznpe           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
c4d96563-fbb5-48ca-a47b-bfcc1ec9f3cd | E2E80 E2E-20261004-4F0978 DEV muu4et7vodwb           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
03363d72-d0a3-4b2e-88dc-9c134e6b1179 | E2E80 E2E-20261004-4F0978 DEV muu4f91a7t15           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
11784e6f-4da0-476a-9bd1-5b6efa5c279b | E2E80 E2E-20261004-4F0978 DEV muu4fppelrxd           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
cd201882-770d-4f18-bf09-22aab9237a96 | E2E80 E2E-20261004-4F0978 DEV muu4g0n6ap5c           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
fc5393e2-96fd-4ce5-abbf-45341242257e | E2E80 E2E-20261004-4F0978 INV muu4g5k7y6gp           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
cd300e3f-2166-4547-8786-1b54a743bb6f | E2E80 E2E-20261004-4F0978 INV-UI muu4gbnrjoig        | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1eb44b8a-6176-4252-aa55-397627d496ce | E2E Multi hb1-muu4ivzj                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
2de4d8c8-7a82-48cd-810a-1cf7e902c1e7 | E2E Multi hb2-muu4iwop                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f5808e1b-a194-43d7-b78e-038a2350880f | E2E Multi blk1-muu4ixph                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
98140e79-2c1c-4c0f-b277-a4bb937b896d | E2E Multi blk2-muu4iy4b                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1e484b3d-4dd8-4037-9ea4-08a0f4a4c490 | E2E80 E2E-20261004-4F0978 INV-UI muu4j24xu9nh        | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ee315c87-afad-45cd-8e99-3912bbef55f5 | E2E Multi blkd1-muu4iyns                             | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
50373266-15ef-46c3-87a6-fdcb3a894666 | E2E Multi blkd2-muu4k7xo                             | 2026-10-04 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3dfe3f8b-85f2-46a0-96fd-cf7685268132 | E2E80 E2E-20261004-4F0978 POS muu4ls4rhfmf           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=4
0985820f-7040-49d9-b06d-37f1f081354b | E2E80 E2E-20261004-4F0978 PRD muu4m6hfwjtq           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3cb9907b-d5fa-4f1f-9b7e-1ff9be03a052 | E2E80 E2E-20261004-4F0978 PO muu4mb7buto1            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c3c0fb9c-1418-4ed2-9b38-fe4cc94e0647 | E2E Multi blkd1-muu4mvuf                             | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
240a1263-503c-4b44-be83-ae697e58a0f8 | E2E Multi blkd2-muu4mz24                             | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f26b9ff2-47fc-49a8-b9dc-a6cbb9068f7f | E2E Multi blki-muu4n0y7                              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9a3f4f41-cad3-4e1e-9407-d46b7d0f9909 | E2E Multi rls1-muu4n24x                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
4cf4121f-69ea-49fd-b528-5ecf99996fb6 | E2E80 E2E-20261004-4F0978 REV muu4nhi0k16x           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=4
c4282f65-687f-42de-bb75-4074432d75bc | E2E80 E2E-20261004-4F0978 RBAC muu4nr6va40b          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
7f4529f1-80cf-4cc3-a6c8-d2b4bc52d0f2 | E2E Multi perm-muu4n3c2                              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
af084ab0-bbd0-4ac2-92f6-cffbe1404d14 | E2E80 E2E-20261004-4F0978 TRA muu4osf2xoyx           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
0b70a3e8-0d0e-4885-81ba-cf44f4679356 | E2E80 E2E-20261004-4F0978 TRB muu4ov5raio7           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
c845c4ed-6e60-4b86-b80f-da6ae4270447 | E2E80 E2E-20261004-4F0978 ISO muu4ql87dndb           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f28af692-a51d-4ae8-ba90-b83297c349b8 | E2E Multi muu4rm382tpo                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
0f645683-e878-48ba-93ac-a901d8b72a00 | E2E No Addr noaddr-muu4rnqn                          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a16974fe-1593-4058-9b90-606a50bd75b0 | E2E Extra extra-muu4ro12                             | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e8047cd0-ed65-4150-84fb-7a2bf967102a | E2E Slug Sanitize muu4robz                           | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
552103dd-d8a8-4d6b-86d5-9eb21713f954 | E2E Multi dup-muu4rx0j                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
75b79ff8-4ac4-4908-9b8d-67eaef131a45 | E2E Test Store 1791137180734                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e76de0f4-9c3b-4c58-8c2a-629394a7d7f8 | Updated Name E2E                                     | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
d8e3d3d9-1d84-4945-b4cc-dc2b70fd9993 | E2E Multi del-muu4ucda                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
4518e099-4e15-4049-8bb5-d60bccbcb769 | E2E Reset Test 1791137246779                         | 2026-10-04 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=0 t=0
32a1f608-317f-4c46-863d-4be928f7315f | E2E Reset Test 1791137249445                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
cb5f5440-7121-4129-bb37-f7b3b63d5ba8 | E2E Multi arch-muu4vpac                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
63934a2d-1b0a-4a60-98e2-835003b024d5 | E2E Multi dblarch-muu4vrul                           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ac38aa0d-ece8-4c6b-83ad-438d706e00b8 | E2E Multi rest-muu4vtvr                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
d3004712-b4a6-45d7-94fd-e77bdec7be98 | E2E Multi restactive-muu4vwkw                        | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f683a1bf-1d5e-4f4f-8db7-969e9b086087 | E2E Reset Test 1791137311223                         | 2026-10-04 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=0 t=0
6e64f405-4183-4046-a7fe-923de0c6076d | E2E Reset Test 1791137312128                         | 2026-10-04 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1ffc7561-710b-4fb5-b1ce-a543dec80da7 | E2E Reset Test 1791137312928                         | 2026-10-04 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f0d52c3b-e425-4ef1-a1df-6bfdd080a126 | E2E Multi hb1-muu4vzhk                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
92a5175b-842c-466c-bc72-88d93abe2b2d | E2E Multi hb2-muu4x1gi                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3c239392-f78f-4afa-a114-a7fe5e65a55c | E2E Multi blk1-muu4x4o0                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
0b20593b-944c-4b01-8712-3fd58c76bf50 | E2E Multi blk2-muu4x8nr                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
813e0fb8-2391-4aea-901b-7a465508ef1c | E2E Multi blkd1-muu4ycya                             | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e0395a26-615a-4f10-91ff-7f7978c47c35 | E2E Multi blkd2-muu4ye87                             | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
72177bd8-d4f0-4b87-9f4f-059bf826032c | E2E Multi blki-muu4ygzo                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
0b958161-4fe2-4c43-8187-cdfaa76c66a4 | E2E Multi rls1-muu4yk2a                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a65c9617-a1dc-4c44-8fac-b2d539818b01 | E2E Multi perm-muu4zo44                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
0a8474de-2d6a-462d-b234-a0e94211057e | E2E80 E2E-20261004-4F0978 SW A muu7hoonisj3          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ade642c4-43c4-4c3b-ac20-a61980357588 | E2E80 E2E-20261004-4F0978 SW B muu7ikhi9z4l          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
4aa75df1-6e82-4d04-8232-89ac1085d8c5 | E2E80 E2E-20261004-4F0978 SW A muu7jij57er3          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
28c74d18-0cac-4cc1-a7d6-e7946272b958 | E2E80 E2E-20261004-4F0978 SW B muu7jkdree95          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a9f23ef9-12c7-4cd9-a86c-0cdf01b4e6c1 | E2E80 E2E-20261004-4F0978 SW A muu7k1rv01qt          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a431e4e8-1f23-40e0-b0c3-a45ddd2883bc | E2E80 E2E-20261004-4F0978 SW B muu7k3bs3awg          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3bf75315-dbc1-4e69-92ec-4d70c82939f1 | E2E80 E2E-20261004-4F0978 SW A muu7km8omwv1          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
0ad870c2-245b-4d05-b53c-8a9d944b81f3 | E2E80 E2E-20261004-4F0978 SW B muu7knytozmk          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
8ab139e7-1046-40cb-ba58-1c8b6c1c9d26 | E2E80 E2E-20261004-4F0978 SW A muu7l53cw070          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
dfca8de2-4627-43b5-a57a-838777a61b22 | E2E80 E2E-20261004-4F0978 SW A muu7lm2ffgtz          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
28d4242d-a665-48ed-ab06-c19cea19aecb | E2E80 E2E-20261004-4F0978 SW B muu7lnfe5kkk          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
24915370-0bd6-4f3d-b33d-520b2a0b098c | E2E80 E2E-20261004-4F0978 SW A muu7m4bj5rqf          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f9b8733a-6ac6-4471-9acc-40c1957841de | E2E80 E2E-20261004-4F0978 SW B muu7m5umcpov          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f10dc65e-9d94-4665-84b3-cdef9d07827f | E2E80 E2E-20261004-D4E310 DEV muu9240co3wn           | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=1 t=1
0e7eec98-9e5a-4185-a384-4b42eb155185 | E2E80 E2E-20261004-E6AE59 INV muu93wbx0bnb           | 2026-10-04 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=1 t=0
6c139eb7-44b0-4764-bdbc-3a0188b31adf | E2E80 E2E-20261004-E6AE59 INV-UI muu949faj964        | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
fd355092-a2b2-4023-845d-58b797f65ca2 | E2E80 E2E-20261004-AA8BD0 INV-UI muu9a4skfvrc        | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c8017882-14af-4df1-9097-2335ff188ad1 | E2E80 E2E-20261004-8ABD6F INV muu9b66ib5af           | 2026-10-04 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=1 t=0
d1072876-eabe-473c-b74e-404a52ace5dd | E2E80 E2E-20261004-8ABD6F INV-UI muu9bhbfgbpd        | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9bdb8ef1-7bcf-4b27-bbb6-39ac2502814c | E2E80 E2E-20261004-AB992B AP muu9k32ula87            | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
0a300db9-6893-49e2-9dec-d834c4e1fe69 | E2E80 E2E-20261004-AB992B A11Y muu9kemu8qp5          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e1363330-1079-4d25-98ba-7c354fa4767e | E2E80 E2E-20261004-9DFA94 AP muu9khir6r9d            | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
a0172e76-b9fa-49a0-ba73-ccdc1ec2d65a | E2E80 E2E-20261004-AB992B FC muu9kxx5l9rm            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
11142d02-fc78-4372-9534-23ae91aa567e | E2E80 E2E-20261004-AB992B FC muu9lcrckv7q            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
8ea448a8-a753-49ed-94e6-39d58bec021e | E2E80 E2E-20261004-AB992B FC muu9lrwvah1g            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3a54256e-4b53-4a5d-9804-f0b428c51af8 | E2E80 E2E-20261004-AB992B FC muu9m7m78ohv            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
06c567d5-6df5-49a1-900c-a6ec46913e4f | E2E80 E2E-20261004-9DFA94 A11Y muu9m9ugzhcz          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
4b892704-aea6-4709-a746-c8f43ad7cec6 | E2E80 E2E-20261004-AB992B FC muu9mmuy9nx3            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9e3f4aee-e383-4d3e-aeec-96ebf7d7234d | E2E80 E2E-20261004-AB992B FC muu9n5w5pgg9            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
47246cd5-5dfd-4eac-ba6b-d8f889b108ac | E2E80 E2E-20261004-AB992B FC muu9npyaqckk            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
32ae39c0-e161-4dc8-b3ed-dd88a8221b6e | E2E80 E2E-20261004-AB992B FC muu9o8avah65            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
775825b7-a6a2-4ff6-8385-d1b9837a8d2b | E2E80 E2E-20261004-AB992B FC muu9orbl5r8u            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e36903bd-6418-4537-8892-25f46a950a4c | E2E80 E2E-20261004-9DFA94 FC muu9opgq8fky            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
6ee8ea7d-8a35-4dfa-be07-fb1c26e32c7b | E2E80 E2E-20261004-AB992B FC muu9pc01bwpj            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
96f3a2ca-25d5-4c40-a93e-44c72846fa2b | E2E80 E2E-20261004-AB992B FC muu9q3hoef5f            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ce7c104b-e074-4336-ba2e-34af0c42f6a9 | E2E80 E2E-20261004-720EED AP muu9q7k2u5po            | 2026-10-04 | inact  | Default Tenant | m=1 p=0 t=0
b78ca66d-104d-462b-ad39-fa1708c8c238 | E2E80 E2E-20261004-720EED A11Y muu9qvfx484z          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e35749de-baf7-493d-ae0e-5a3f855966fd | E2E80 E2E-20261004-9DFA94 CASH muu9ra18tvgb          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
748ccea5-228e-40ea-afa8-1da843e53ee8 | E2E80 E2E-20261004-720EED FC muu9ri5dn2bv            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
fedb7a9b-f82f-463c-a455-9b6624720fd7 | E2E80 E2E-20261004-9DFA94 CAT muu9ro8n4c04           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e98a1720-4d91-4103-a159-474383216133 | E2E80 E2E-20261004-AB992B CASH muu9rpzou8sc          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
cb94e94f-7c67-468b-892a-203dfcd7b0ce | E2E80 E2E-20261004-AB992B CAT muu9rtnmrd09           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
553b37c7-bdc2-45bb-85e2-fa19c5074a7a | E2E80 E2E-20261004-720EED FC muu9rx195029            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
61c160cb-9036-45aa-b034-6fad43afbcbc | E2E80 E2E-20261004-720EED FC muu9sedrp0yz            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
fbfe27a3-53ee-474e-8fbf-b63180e4ce61 | E2E80 E2E-20261004-AB992B DEV muu9sna6404i           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
ab8b1c51-4914-49d4-bfef-34e04745785f | E2E80 E2E-20261004-720EED FC muu9suj66net            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c2d38228-61a1-4c37-bde6-9d9068eb06b8 | E2E80 E2E-20261004-9DFA94 DEV muu9suv7f67b           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
d7cae2ae-8289-4b40-b66d-cad18fc3e3bd | E2E80 E2E-20261004-AB992B DEV muu9t530lmik           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
bfb22f76-05b2-44fb-ab0b-1118908d33a6 | E2E80 E2E-20261004-9DFA94 INV muu9t53hcsly           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
2849fc86-9261-4441-abea-33420a2cff11 | E2E80 E2E-20261004-AB992B DEV muu9t7zsy8mo           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
982c6f4b-169b-4264-8ba8-f49e1e6795f2 | E2E80 E2E-20261004-720EED FC muu9t9ow3q07            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
50c67542-4500-40cc-8e1a-da166ab185e2 | E2E80 E2E-20261004-AB992B DEV muu9tai1kr92           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
5c07a909-0848-42b8-a4f7-f3553b8b530e | E2E80 E2E-20261004-AB992B DEV muu9td3zomxd           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
005f5c45-8c26-45bb-9a7d-378b7fb2bd83 | E2E80 E2E-20261004-AB992B DEV muu9tfmwxc98           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
13515c70-8afb-46d1-8397-5191e6ae3c8e | E2E80 E2E-20261004-9DFA94 INV-UI muu9tgf5cpb3        | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
49e638fa-779e-49b2-a123-46d6d9820a21 | E2E80 E2E-20261004-720EED FC muu9tsaox3e7            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
227a917b-29a7-4e41-ad45-d923bbad4512 | E2E80 E2E-20261004-720EED FC muu9ubepks5z            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
32f26562-7f63-4c20-8a5c-66f0bc256e51 | E2E80 E2E-20261004-9DFA94 POS muu9ufpfo81s           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=4
899b0999-d08a-4bb2-a37b-d8c17c55af11 | E2E80 E2E-20261004-AB992B ISO muu9uld9oibf           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
7bd18fc9-f537-4433-a8d3-567cb6f5b89f | E2E80 E2E-20261004-720EED FC muu9uuaszrpx            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ab9f9266-5d07-4ab3-9b4f-73594b466a98 | E2E Multi muu9vdgt23rp                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9b0fccee-adf2-4124-a6dd-64dc1d22c023 | E2E No Addr noaddr-muu9verv                          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
055992cb-19bb-48de-b6c2-f2cabd3c6b08 | E2E80 E2E-20261004-9DFA94 PRD muu9vfylwzen           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
4519ab41-f80c-4cbd-9d90-302b5e40daac | E2E80 E2E-20261004-720EED FC muu9vjyf9cij            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3a718336-9ae5-4736-b9f0-476debbd8b18 | E2E80 E2E-20261004-9DFA94 PO muu9vq4vgfny            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
d621c71b-f367-4c0a-9dad-3dd395d7e459 | E2E80 E2E-20261004-720EED FC muu9w2md1swu            | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
5e9b07f3-055c-40d7-a26b-163263a7bc35 | E2E Multi dup-muu9vwsd                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
4f77b736-6427-40cd-8b38-9cf93eb4484c | E2E80 E2E-20261004-9DFA94 REV muu9wqxhc0j1           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=4
be907684-94bc-4aa3-afe0-b1bb6d1de435 | E2E80 E2E-20261004-9DFA94 RBAC muu9x9rdla2k          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
165661f3-f4ad-40fc-ab69-b450d3d3ee0c | E2E80 E2E-20261004-720EED CASH muu9xdeig9wm          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
a7164e56-9b9a-4d2c-8630-c6dce7ec95d0 | E2E80 E2E-20261004-720EED CAT muu9xhz4481f           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
90339646-4d90-4efd-ae80-5951241609d3 | Updated Name E2E                                     | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
b6184696-a5ae-4452-a153-b2278a7a8b15 | E2E Multi del-muu9y1gd                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e4fbc998-0a2b-4a10-a9df-e90b1e8e0717 | E2E80 E2E-20261004-9DFA94 TRA muu9y1u7dmf1           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
3a01277d-3c89-4ce6-85ef-8d7063ebb7cf | E2E80 E2E-20261004-9DFA94 TRB muu9y4pr4fxk           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
1686b885-fcd8-4ca9-b83c-d06289526742 | E2E80 E2E-20261004-720EED DEV muu9yb98lke5           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
c8ec03bd-dea9-4234-982c-b266b44bee0f | E2E80 E2E-20261004-720EED DEV muu9yv0o0zjw           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
543ebe73-2dff-4fb0-86c4-ee7bde14c79b | E2E80 E2E-20261004-720EED DEV muu9yz293etx           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
f1b79cfc-6852-4f67-b079-b852d522491a | E2E80 E2E-20261004-720EED DEV muu9z1x27mzo           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
d4f2577a-2b2d-43ad-b87f-ab602b69797d | E2E80 E2E-20261004-720EED DEV muu9z4tb9wyi           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
471d6025-69dc-4e05-a675-4e8057b23052 | E2E80 E2E-20261004-720EED DEV muu9z7q537u5           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
742b99ca-fbfd-4c46-849b-480eac41942b | E2E Multi arch-muu9zdmk                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
93c894b4-0834-40eb-bdb9-d2828c1cf01a | E2E Multi dblarch-muu9zf86                           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
2ed2d843-40f7-4ff2-9704-583e39acba24 | E2E Multi rest-muu9zge9                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
7fdd6245-d9d6-480c-b8d8-192d883d0f07 | E2E Multi restactive-muu9zhxb                        | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a237aab6-d5fb-405c-9b48-7971c93792bf | E2E80 E2E-20261004-720EED ISO muua0bw6z2wh           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9f8d09e8-8dc9-41f7-9849-786afb709d12 | E2E80 E2E-20261004-9DFA94 ISO muua0dklqdy2           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a4954f27-767d-4254-9ca7-208286771f44 | E2E Multi hb1-muu9zjrn                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3b169fc5-e834-4657-8cdb-98aed908eafe | E2E Multi hb2-muua0pbo                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
32d143e4-0466-4144-9035-95b0cc735e6d | E2E Multi blk1-muua0rej                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c777772e-6864-46ba-b325-e13aada73bab | E2E Multi muua111i1f8h                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
998bc645-93b9-446c-a7be-486f1412ed07 | E2E No Addr noaddr-muua11yi                          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
958f7eae-e352-447a-92fc-8f06bb3bc8a6 | E2E Multi blk2-muua0td0                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
d6bbf15f-25cd-4b89-9b36-38d04c4c2cfb | E2E Multi muua1y84p013                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
374635d9-f8b2-4056-a15f-d7df5d58d73b | E2E Multi blkd1-muua20jt                             | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
71f6a404-a1e8-4bc6-ad77-2dc5c87a7466 | E2E No Addr noaddr-muua21ny                          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
55b08980-b1b6-4b3d-b6bd-dd977013c23b | E2E Multi blkd2-muua21f8                             | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e57aedd0-a035-490d-b5ed-06338dbc95d0 | E2E Multi blki-muua239p                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ec849aeb-6e1a-49d7-9904-f2d538746fa2 | E2E Multi dup-muua1njz                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
d34c00e7-2b19-4e2c-a832-4abcffec8345 | E2E Multi rls1-muua24jw                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e02472a6-b54c-438d-8fb4-0b8bb0bc90c5 | E2E Multi dup-muua23c9                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
bb3c5804-ce94-4fd4-8dce-c15a6659684a | E2E Multi perm-muua3bvg                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
baaf3e0d-21e1-4d58-8008-268e577648df | E2E Multi upd-muua2ymd                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ed151730-63d5-4c2c-bbae-40a729a61d26 | E2E Multi upd-muua3e1d                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
d8173e9d-c74a-49e6-bdc9-1f1bc7054c6a | E2E Multi upd-muua4zj1                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
630ec28f-8ec7-4c27-8589-1f4926f5ed0b | E2E Multi del-muua51u6                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
cd1802fb-b76b-4d74-b6a4-2facfd4f557e | E2E Multi del-muua53bu                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
47084ee2-ef1e-422d-8941-756a99ef523e | E2E Multi arch-muua57o4                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
69b609d9-cd28-4e48-98bf-ef1276076886 | E2E Multi dblarch-muua594a                           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
d3b6c348-3887-4eef-b1e5-d873de57fe11 | E2E Multi del-muua632t                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a904bafe-7def-4ce6-a6b4-3a060e901c45 | E2E Extra extra-muua6jni                             | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
408056d3-7e0c-4bc2-90f9-b8ab11261dcf | E2E Slug Sanitize muua6k1y                           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
de07256c-c267-4722-8645-8ec007bf22ab | E2E Multi arch-muua7hdl                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ba1d4290-e2d2-4797-8bd2-09c970a099a1 | E2E Multi dblarch-muua7ns0                           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
57d74093-4998-4077-aa08-3b85ad573b6a | E2E Multi rest-muua7t3z                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
26ee4e69-41c9-4b1d-bd02-01c371dcc21e | E2E Multi restactive-muua80oe                        | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
094be627-8bde-4f5e-800b-7b823359b1b0 | E2E Multi hb1-muua87l4                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e5d67435-f3c1-4855-bb59-c47fe29954e8 | E2E Multi hb2-muua8uvg                               | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
5a3c3fcc-cfc4-4b72-9aa8-26af0c7afe78 | E2E Test Store 1791146284300                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
d0298977-7a75-4fb9-a2ed-159650f5cc06 | E2E Multi blk1-muua947q                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c50d91f3-0869-4532-bad1-e5b05f702e38 | E2E Multi blk2-muua9714                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
494803fc-9bf4-40b2-9202-dcce541bc880 | E2E Multi blkd1-muua9fi8                             | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1c29fb69-6049-41b6-aa5c-4a9c41e28c03 | E2E Reset Test 1791146349620                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
b4a67632-d493-4c65-8c8b-c33b39d3ff1b | E2E Multi blkd2-muuaa5kp                             | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
58217fee-18b1-4075-906d-5c011326904d | E2E Reset Test 1791146352690                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
4156f47f-a554-45af-b462-1d66bf9c8137 | E2E Multi blki-muuaaitb                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
412b1d1c-50a0-47d4-afeb-a15accc9b2f8 | E2E Multi rls1-muuaaroh                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
0986bcf1-ad31-4716-b186-6b1f71b6a534 | E2E Multi perm-muuabi79                              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9104f72c-61cc-4c06-bc3b-b5d7b5a1357f | E2E Reset Test 1791146413079                         | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e2aff851-aa75-4ca7-8500-ea8969978681 | E2E Reset Test 1791146414285                         | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
52f3efc5-2ac4-4c62-93c8-22caf1f1fa08 | E2E Reset Test 1791146415282                         | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
82c81d6e-2484-43ff-af47-b40773cb0164 | E2E Reset Test 1791146546906                         | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
6f4bcdd0-d636-474c-b93a-d300f34348d1 | E2E Extra extra-muuaf1qr                             | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
0354f819-54b2-4d15-b4e6-f9cd48a357a1 | E2E Slug Sanitize muuaf243                           | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
bf1f4665-c9f9-4ebb-91eb-5c137a59a9a4 | E2E80 E2E-20261004-720EED SW A muuafwdtjs4d          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1e7b15ff-d78f-4dc3-9f69-f54f83ac6c81 | E2E80 E2E-20261004-720EED SW B muuafy055hv2          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
10632819-e2b2-4cae-8c19-7f40618ae5c8 | E2E80 E2E-20261004-720EED SW A muuah72b2f9v          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c0dce5f1-5423-4e12-8e15-168a6428ad3d | E2E80 E2E-20261004-720EED SW B muuah8fdv1oc          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f9295ef9-bb61-4aa4-8504-741c5636e7e1 | E2E80 E2E-20261004-720EED SW A muuaho2utjeq          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f49c23f9-2617-4aa0-a493-995d9ab7cc98 | E2E80 E2E-20261004-720EED SW B muuahp40s3rz          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9dc06ed8-5bba-4cf7-a9b0-942b47d49fdc | E2E Test Store 1791146689321                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a54d0c64-dced-415f-ab87-9344dd5a20e0 | E2E80 E2E-20261004-720EED SW A muuai6ww2710          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
8798ab37-3aff-4f9c-8027-c9cb526fbf38 | E2E80 E2E-20261004-720EED SW A muuaingdxq70          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9c9f79bf-8278-4521-8de4-bb004722f669 | E2E80 E2E-20261004-720EED SW B muuaiosx3y26          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1b6971e4-3a59-4189-9871-6f23c9f057b9 | E2E Reset Test 1791146753981                         | 2026-10-04 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=0 t=0
80d2692f-83d2-43e3-bf37-5d93d06dbc00 | E2E Reset Test 1791146756550                         | 2026-10-04 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c8dde993-fc00-4010-a547-2ed0dcdc8420 | E2E80 E2E-20261004-720EED SW A muuaj9fj2ll8          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
85d3056b-0ce1-4f69-b0b2-9c24230be3e9 | E2E80 E2E-20261004-720EED SW B muuajb62445c          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
46e994a2-5a8d-4417-8e2c-0e2c7bff0689 | E2E80 E2E-20261004-720EED SW A muuajs0e7s6x          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a2dab25f-0e2e-40d1-af67-9cadb0f58d96 | E2E Extra extra-muuak858                             | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
fbfdfe01-d65e-4f5c-9780-9562f760e9d3 | E2E Slug Sanitize muuak99m                           | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
faf8c188-6d04-418f-96f0-01ee90ff34da | E2E Test Store 1791147087688                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
d7b43ac4-6dbe-4580-b338-20780b362638 | E2E Reset Test 1791147161841                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c9f26f5e-0e20-4fa7-ab65-5eeacc0897da | E2E Reset Test 1791147170751                         | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
30c3b21d-ab5f-4b84-b175-649a89875970 | E2E Reset Test 1791147233206                         | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1b8acfa8-cabc-4798-ae32-904afbb17df9 | E2E Reset Test 1791147236787                         | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
63212117-58bc-4c63-a6ed-8c97b6716cb4 | E2E Reset Test 1791147241027                         | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3ff5dc45-b69c-45a3-b749-be1f99033471 | E2E Reset Test 1791147375437                         | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ba9bd566-9c5b-4191-9ed5-0be6eabc1d63 | E2E80 E2E-20261004-9DFA94 SW A muuaxrko7eyp          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
22bb4d10-7ec5-4f23-bb47-bed23d7b7486 | E2E80 E2E-20261004-9DFA94 SW B muuaxxin2jkx          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
67fa4f47-133e-4e95-bbb9-ceea37796940 | E2E80 E2E-20261004-9DFA94 SW A muuaz3iryftl          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9fd9d758-7ad1-4da3-875d-951d27d55b6a | E2E80 E2E-20261004-9DFA94 SW B muuaz717gbg2          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
632f2fb8-4574-4704-bc56-aa0e9b87fff7 | E2E80 E2E-20261004-9DFA94 SW A muuazsnbddfo          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f840d4af-1381-4766-b8e4-13e767c6e94c | E2E80 E2E-20261004-9DFA94 SW B muuazw18ob80          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1b1d4b30-97c2-4921-88f1-8224ee155f6e | E2E80 E2E-20261004-9DFA94 SW A muub0r20fpw6          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3b201c83-6c7b-46d6-9c3c-5c063ea7dafb | E2E80 E2E-20261004-9DFA94 SW B muub0uqpxsrd          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
eb10d9ac-d976-4d59-822e-918eebd35f62 | E2E80 E2E-20261004-719B7C SW A muubb2xl8dvq          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
5af937a5-0c12-4ebe-ae8f-7f8c8d335edd | E2E80 E2E-20261004-719B7C SW B muubb6dh2544          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
4e828059-e198-457c-8a36-1b236f9a596e | E2E80 E2E-20261004-719B7C SW A muubcd73p808          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
29fd5075-3026-4ca7-b6fc-39ffbd00becb | E2E80 E2E-20261004-719B7C SW B muubcgq1rafu          | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
33fdad82-58d2-42b8-b3c7-d6afeb0134fb | E2E80 E2E-20261004-719B7C SW A muubd24di3zb          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
80b36264-aef8-44b1-b4f8-8a4c8a8802ab | E2E80 E2E-20261004-719B7C SW B muubd5oqr8uj          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
744f6b00-c034-40c0-83be-bf2bd9d90995 | E2E80 E2E-20261004-719B7C SW A muube15dcj19          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
5f1aa1e5-6d60-4465-be97-f19543aa67f4 | E2E80 E2E-20261004-719B7C SW B muube4o49xl0          | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
bb77ecaf-b952-48d5-81c2-68355c4a630e | E2E80 E2E-20261005-FBD7DC AP muume0597442            | 2026-10-05 | inact  | Default Tenant | m=1 p=0 t=0
078173a5-29f0-4e5d-a188-d2c028bd84e5 | E2E80 E2E-20261005-FBD7DC A11Y muume9wr3vtw          | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
75f08d83-d244-418b-927a-4e623f56c070 | E2E80 E2E-20261005-FBD7DC FC muumeqpnbas6            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e2366ea6-8c0c-46ab-8992-0158795fc1af | E2E80 E2E-20261005-FBD7DC FC muumf5emj1hi            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
df39f7d0-2335-46f9-aa09-bdfdee52a354 | E2E80 E2E-20261005-5C592C AP muumfcgxu7fj            | 2026-10-05 | inact  | Default Tenant | m=1 p=0 t=0
0cb7347a-3d75-474d-9a65-06025f53c0fa | E2E80 E2E-20261005-FBD7DC FC muumfkp512gu            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
4097f121-b887-4c62-8d22-e1dee4ef81db | E2E80 E2E-20261005-5C592C A11Y muumfxnstxvg          | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ab79ee8e-921c-4d05-80ae-2229a8db011e | E2E80 E2E-20261005-FBD7DC FC muumfzm2ipla            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
b1ae8e97-8fce-4548-937b-c0c161eae8a1 | E2E80 E2E-20261005-FBD7DC FC muumgeo9jt2e            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
09933705-8d48-4187-86a1-65a0beda3cd1 | E2E80 E2E-20261005-5C592C FC muumgih3vux6            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
cc056363-3449-4dec-bbd8-33c257566102 | E2E80 E2E-20261005-FBD7DC FC muumgxc1sw8c            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ed3f5e81-a8c7-4e64-b25a-7b74960ed44e | E2E80 E2E-20261005-5C592C FC muumgynnlhup            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
40c8dda1-2a47-4c32-94b8-064c6b026fb0 | E2E80 E2E-20261005-FBD7DC FC muumhgndweka            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
384bec35-3537-4d43-94f2-1aec5ed957df | E2E80 E2E-20261005-5C592C FC muumhge38en5            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
26cb12ba-497d-46e5-a700-dd8639ee5814 | E2E80 E2E-20261005-5C592C FC muumhwkqddpq            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9f242476-abd2-44f1-8436-91cf4de2f390 | E2E80 E2E-20261005-FBD7DC FC muumhyxn5xxn            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
8ac241c2-d170-4681-b7eb-944fd6529c70 | E2E80 E2E-20261005-5C592C FC muumidj80u9k            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
af956dc4-4c49-4724-a44e-3c9fa20997b8 | E2E80 E2E-20261005-FBD7DC FC muumihnne46w            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a2131c74-cd21-4120-afd3-57b61c777318 | E2E80 E2E-20261005-5C592C FC muumiz2hvu04            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3ae95763-ac04-42d3-9d1d-0a7a2b448798 | E2E80 E2E-20261005-FBD7DC FC muumj2gubrcr            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
bdb6a80d-e97f-46f1-b5c3-d4ed293c1a75 | E2E80 E2E-20261005-E6282B AP muumjhi0byen            | 2026-10-05 | inact  | Default Tenant | m=1 p=0 t=0
aaeb6159-c785-4224-9afe-e1a87524824a | E2E80 E2E-20261005-FBD7DC FC muumjle6t9nb            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e0aeb15b-e729-49af-aeb4-5281184b83de | E2E80 E2E-20261005-5C592C FC muumjm9hlaxa            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3a994044-a13d-4291-af46-0c91d00938f4 | E2E80 E2E-20261005-E6282B A11Y muumjuay4xye          | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
efdbd429-e53e-429a-a65a-5e0c0e5b4267 | E2E80 E2E-20261005-5C592C FC muumk6gdxyl1            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a36a9e96-a6f5-49ae-853c-5a5132e013ed | E2E80 E2E-20261005-E6282B FC muumkcvkbt76            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a926990f-4163-412f-b0b8-02f8e2ae1483 | E2E80 E2E-20261005-5C592C FC muumkquc6d75            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
01d67374-cba0-414e-9837-18ecdb58d458 | E2E80 E2E-20261005-E6282B FC muumkrruk7eh            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
8d4a5c4f-9d60-4080-aa29-55cadbad56a8 | E2E80 E2E-20261005-FBD7DC CASH muumkzfwjst1          | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
bbf133f9-3f48-4aea-a19d-c65e8143cde7 | E2E80 E2E-20261005-FBD7DC CAT muuml28g5uli           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
295526c7-35e2-49c9-9f22-74df1b68b473 | E2E80 E2E-20261005-B459E6 AP muuml21ccbyt            | 2026-10-05 | inact  | Default Tenant | m=1 p=0 t=0
e13895f3-0ab6-40f7-9941-873c3a34c942 | E2E80 E2E-20261005-E6282B FC muuml7c31uhi            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
bb530ccd-3012-43c3-9862-ab5af4d56346 | E2E80 E2E-20261005-5C592C FC muumlamlgmu4            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
0b00480b-ef67-478c-8316-6583166b4af6 | E2E80 E2E-20261005-E6282B FC muumlmua5p0l            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
4391f129-9fb5-487c-892a-7fa45f99e6c4 | E2E80 E2E-20261005-B459E6 A11Y muumlpirjihv          | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
b6aeafcc-75f5-4f8d-91a8-7b243b76645d | E2E80 E2E-20261005-5C592C FC muumlvdhjxnm            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c1c1e2b8-a2af-40c3-a0ee-f08741bb187a | E2E80 E2E-20261005-FBD7DC DEV muumm1inist0           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
90a144af-e692-4090-a77f-890d013146a3 | E2E80 E2E-20261005-E6282B FC muumm5ycagfx            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
4cb4f604-dd07-4144-b7b4-e64fcbfded47 | E2E80 E2E-20261005-FBD7DC DEV muummdjv3cn6           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
df7b2103-19f9-441e-917b-d794d6a5b009 | E2E80 E2E-20261005-B459E6 FC muummfttf1g3            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e8c1b5b0-b7ef-4daa-bec6-dad7a5e88f88 | E2E80 E2E-20261005-FBD7DC DEV muummj1udxop           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
969b4c2b-06e2-497f-94e8-1f8c61cbcde9 | E2E80 E2E-20261005-E6282B FC muummw0gaa6e            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
ac8074b0-26be-4b7e-b287-4eb26b53664c | E2E80 E2E-20261005-FBD7DC DEV muummyutewiq           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
a8e82cc5-5d07-492b-9a73-3d63d0f218be | E2E80 E2E-20261005-B459E6 FC muumn0dou1d7            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
474f9fdf-93d7-49c6-a10c-d681e770fdfc | E2E80 E2E-20261005-FBD7DC DEV muumnocup2lc           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
755994fb-2a8a-4760-ad7f-1855c553b668 | E2E80 E2E-20261005-E6282B FC muumnrixsqiv            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
6cd8cf9e-05bd-40de-816b-05c871e50aee | E2E80 E2E-20261005-B459E6 FC muumns6dp2oc            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
d3f2e45e-7c2d-4e86-ba93-1b015851d5ee | E2E80 E2E-20261005-5C592C CASH muumo5mst5ot          | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
33ce0933-722b-4a85-bcb0-03097ab0dd57 | E2E80 E2E-20261005-FBD7DC DEV muumofw6b1in           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
53bdca86-8a68-4180-b6ed-1150a50dd9c6 | E2E80 E2E-20261005-E6282B FC muumos7ak6kf            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
afcbb454-469e-46a5-8208-0acf61261e95 | E2E80 E2E-20261005-B459E6 FC muumormpkw7l            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
7100cd39-cdd1-4b28-a58a-12f923ffe351 | E2E80 E2E-20261005-5C592C CAT muumou48lw51           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
6317bdaf-b391-4042-9e1c-fa7b9c992ccd | E2E80 E2E-20261005-FBD7DC DEV muumowfrkfd7           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
888635e9-fee7-4817-ba8a-488b2da58f63 | E2E80 E2E-20261005-E6282B FC muumplrxtmvm            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
05bab571-eca9-4b6c-98e9-ed84c0673f6c | E2E80 E2E-20261005-FBD7DC DEV muumplpm4iu9           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
2a7f50e6-dddb-422e-b2fe-bb58d75feab8 | E2E80 E2E-20261005-B459E6 FC muumpmhdatcf            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
389489f3-f824-4118-ab0f-5ce840b87220 | E2E80 E2E-20261005-FBD7DC INV muumqaxdkjtq           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
cee54a67-1a67-4af0-a2a8-59805f09c677 | E2E80 E2E-20261005-5C592C CAT muumqlu43oi2           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
0f980520-4acc-4496-a5af-9d956940da3b | E2E80 E2E-20261005-FBD7DC INV-UI muumriu6ie0j        | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9ad7754a-e612-4bb6-957b-efe3362d109e | E2E80 E2E-20261005-5C592C DEV muums22evrt5           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
fdf97e10-1010-4a9e-8ffe-87aa3a853cf8 | E2E80 E2E-20261005-E6282B CASH muums33qcvqo          | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
e382c6c7-677e-411d-8345-8900f258509b | E2E80 E2E-20261005-5C592C DEV muumsnp4xtrh           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
746e20f8-284b-49f8-a914-6db67682a408 | E2E80 E2E-20261005-E6282B CAT muumsq6befs8           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
7ed86e1c-ddb3-4764-a8d7-aee1ed5cf6b6 | E2E80 E2E-20261005-B459E6 CASH muumsszdrpst          | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
598951d4-4c85-4ffa-ae24-f9726fedc801 | E2E80 E2E-20261005-5C592C DEV muumtl7y6qsr           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
233a0b34-58b9-4449-a177-9e1cc48e54f6 | E2E80 E2E-20261005-B459E6 CASH muumty8pdf7p          | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
2764562a-2c90-4df1-9c66-5ddb36c88ef7 | E2E80 E2E-20261005-E6282B DEV muumui77649d           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
bd70f66b-7b66-44e0-87b7-3b25ee386228 | E2E80 E2E-20261005-FBD7DC INV-UI muumuimjjtrq        | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
b070b967-d322-4246-8e91-50eb41e4f8f0 | E2E80 E2E-20261005-5C592C DEV muumuihv5zee           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
066fdb88-bff0-43cd-9389-76b09bdd37d7 | E2E80 E2E-20261005-E6282B DEV muumv23v6xyd           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
b0108d92-3335-451b-b21b-d41510249085 | E2E80 E2E-20261005-B459E6 CAT muumv14so19k           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
8e7b4552-4e09-4ead-972c-1a1123fc9ce0 | E2E80 E2E-20261005-5C592C DEV muumv4a10pcp           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
c7dce6f8-d117-4bbe-aea4-08cd7f11e40a | E2E80 E2E-20261005-5C592C DEV muumvtb000ad           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
c80d3ed1-6887-4ef9-a225-1fc92b725e95 | E2E80 E2E-20261005-E6282B DEV muumvtnfmwki           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
c6f2e26d-6091-4391-bcea-4d3aa0797a48 | E2E80 E2E-20261005-E6282B DEV muumwjvw492t           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
57126dfb-3d30-4a27-a753-24dd1e4ef277 | E2E80 E2E-20261005-5C592C DEV muumwkjunktc           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
c3fc1521-653c-4e1b-950c-2027127285da | E2E80 E2E-20261005-E6282B DEV muumx43hyqyi           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
6d825836-95bb-43c5-8b2f-8c223cd3fbe2 | E2E80 E2E-20261005-B459E6 DEV muumx4wbawme           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
754e38ea-95a8-41b6-8b62-e3d5ee5ee93f | E2E80 E2E-20261005-5C592C DEV muumx883g1ha           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
6a567c44-454b-4a04-a5d3-3d9245468594 | E2E80 E2E-20261005-FBD7DC POS muumxa63y9d3           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=4
b12b3c1f-0def-46d4-a79e-02fa2ca1888a | E2E80 E2E-20261005-E6282B DEV muumxegr9n5e           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
3038a87b-6eb8-4c5a-8613-8b590daa064a | E2E80 E2E-20261005-B459E6 DEV muumxgtokptv           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=1
72c3af24-55b3-4704-83de-bd18c14b69ff | E2E80 E2E-20261005-5C592C INV muumxqlz79ev           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
d51da437-bddd-464b-92a7-29d9aeb2e965 | E2E80 E2E-20261005-E6282B DEV muumxxyxii58           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
2eae591f-db01-4c8e-ae9b-61288ac0323a | E2E80 E2E-20261005-B459E6 DEV muumy1xp10un           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
07b4bcfe-eff7-4afe-9ee6-25f99d600adc | E2E80 E2E-20261005-FBD7DC PRD muumyc429d4p           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
70cfb9da-488b-400e-aea1-d27984e9e416 | E2E80 E2E-20261005-E6282B DEV muumyejzmary           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
6411dc78-008e-44dc-8b5b-a451f3d99e36 | E2E80 E2E-20261005-B459E6 DEV muumyh9wiwgi           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
59f909f8-b10c-47a9-affd-54c1dc3fab72 | E2E80 E2E-20261005-5C592C INV-UI muumygfrj8pj        | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
7b1ffc0d-5ea4-4dc9-abc0-fc2eac5b2158 | E2E80 E2E-20261005-FBD7DC PO muumytvjmvbw            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
54eb44aa-bb62-4276-b85e-a2f4b62220f9 | E2E80 E2E-20261005-E6282B INV muumz5216382           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
aad6f353-dfe8-4697-917d-9ce938457dae | E2E80 E2E-20261005-B459E6 DEV muumz4o1d53o           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
a9088646-a1e1-4e94-8648-0f38dd7eb0b1 | E2E80 E2E-20261005-5C592C POS muumzao5qi4y           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=4
1c9bd7e2-815c-48c1-8f49-7681dff3bd5d | E2E80 E2E-20261005-FBD7DC REV muumznm8hgdq           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=4
181ec6e5-6563-49d7-b59c-dab68829e328 | E2E80 E2E-20261005-B459E6 DEV muumzqpbazfc           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
a149b598-9980-4184-8c5d-f629392d3667 | E2E80 E2E-20261005-E6282B INV-UI muumzv6br482        | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a5966d91-d2ad-438d-8313-672f44a2d091 | E2E80 E2E-20261005-B459E6 DEV muun0k1h47nz           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
ced011ed-6624-42b0-b822-b682b4e77d7e | E2E80 E2E-20261005-B459E6 DEV muun19dsvz1x           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=1
eb5d3c16-ccf8-411e-9831-12e9022bdd37 | E2E80 E2E-20261005-FBD7DC RBAC muun1a5glsk7          | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
94590a08-d2d0-4f4b-87fa-6914022bd5fb | E2E80 E2E-20261005-5C592C PRD muun1hp8yscq           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
96123e34-681b-4f70-b3c0-7bffbd201bc4 | E2E80 E2E-20261005-B459E6 INV muun1romkcj8           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
c14094f7-b5a6-4b07-a838-454d70682742 | E2E80 E2E-20261005-5C592C PO muun1tdx8iai            | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
0eb5c9d5-30a8-4b51-85b4-01e850afe9fd | E2E80 E2E-20261005-FBD7DC TRA muun277yu4nj           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=1 t=0
388806ff-d2a9-4848-b8bf-6e28e130d388 | E2E80 E2E-20261005-FBD7DC TRB muun2alm9t35           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=1 t=0
07df4e07-3ea3-4d58-b3e3-a16a4fc4f928 | E2E80 E2E-20261005-B459E6 INV-UI muun2k5hkeef        | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
bdc49e97-6e1d-4411-a9bf-b48fe1b2e4b5 | E2E80 E2E-20261005-E6282B INV-UI muun2q39gyxg        | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
c7342361-f9bb-4fb0-b47d-b601c688524a | E2E80 E2E-20261005-5C592C REV muun2t3fbr2f           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
97832945-f01e-4ebb-8659-46ef8f03a4d4 | E2E80 E2E-20261005-5C592C REV muun47w9548i           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=4
fdc3c7ae-fe77-4dee-95f8-d28b87cada0c | E2E80 E2E-20261005-B459E6 INV-UI muun4bu4xzcr        | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
b351a45f-afc5-4b18-99cc-37b92e249563 | E2E80 E2E-20261005-FBD7DC ISO muun53yv0qbd           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9de0d482-28e8-4193-9159-8c4785487b12 | E2E80 E2E-20261005-B459E6 POS muun5c35pr4e           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=4
49c72337-7169-4e6d-88a5-16bf5cf679c1 | E2E80 E2E-20261005-E6282B POS muun5knj5a10           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=4
a8227d40-ddd0-48dc-9444-fd6886e4f776 | E2E80 E2E-20261005-5C592C RBAC muun6595ier2          | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e41c2752-9cf7-49b7-91b9-1e61cfda938d | E2E Multi muun81dgs8q2                               | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=0 t=0
69b4dea9-d619-4828-a8ce-633739f4d5af | E2E80 E2E-20261005-E6282B PRD muun883bhlay           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
afd28144-20bf-4cc8-a563-2640e749cb4e | E2E No Addr noaddr-muun89gt                          | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=0 t=0
732e0daa-5265-4ecc-a3a1-e5caace9da7e | E2E80 E2E-20261005-B459E6 PRD muun88n59kv0           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3ce0e70a-36f4-4eed-a233-f5219d8bf3d9 | E2E80 E2E-20261005-5C592C RBAC muun88kou8hl          | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
bcbfca4c-660c-408e-bac6-4fee6e651a29 | E2E80 E2E-20261005-E6282B PO muun8nq50nq9            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
0c80ec64-dccd-46bc-978b-575b55f7b12a | E2E80 E2E-20261005-B459E6 PO muun8ou2zqo4            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
935b0a75-c5f7-4044-81aa-8edbc858ecd3 | E2E80 E2E-20261005-5C592C TRA muun8tvvwdfr           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=1 t=0
0703c13f-189b-44ff-822c-8cc521c9ce66 | E2E80 E2E-20261005-5C592C TRB muun8wnt5vfd           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=1 t=0
fa544378-8070-45ad-b9ca-dc06e94d78d7 | E2E80 E2E-20261005-E6282B REV muun9c3q5hip           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=4
441ae922-f1a3-46f6-b356-8070c31852ff | E2E Multi dup-muun8ht7                               | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=0 t=0
8bddb585-94ab-4635-93b5-b7f6e78e5150 | E2E80 E2E-20261005-B459E6 REV muun9ft0l7bo           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=4
bd10a9d3-56a8-402a-a153-e97d9ec0a499 | E2E80 E2E-20261005-E6282B RBAC muuna6scvgez          | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
6af4be4b-ec22-4a77-bb64-f9c5ff9c1e86 | E2E80 E2E-20261005-B459E6 RBAC muunadri7mnc          | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
32c4918e-7ede-4368-8bb6-a932e399ef2a | Updated Name E2E                                     | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=0 t=0
e15218c9-39f7-435d-a1da-788d83b2cbe2 | E2E Multi del-muunavef                               | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
532732ae-0d89-499e-b963-743cdff0b379 | E2E80 E2E-20261005-E6282B TRA muunaw720xmt           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
e5c58a6c-c457-4300-9700-2f7b2fd8e9c5 | E2E80 E2E-20261005-E6282B TRB muunbdujmab4           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=1 t=0
541654d9-bcf5-4266-949a-56ae071511f1 | E2E80 E2E-20261005-B459E6 RBAC muunc0bhn5sk          | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
bb4fa71d-c51f-4c71-acfe-d207cf6f1da3 | E2E80 E2E-20261005-5C592C ISO muuncjo4guj4           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
8650043b-a608-4ef6-847c-0aa19c3e7e93 | E2E80 E2E-20261005-B459E6 TRA muuncmp87hb0           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=1 t=0
8dbbd3a7-a01e-478c-ae14-02807082b20b | E2E Multi arch-muuncpm4                              | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
4e96ddab-8f36-4369-af2f-b6482c33a428 | E2E80 E2E-20261005-B459E6 TRB muuncps7xqn1           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=1 t=0
456c0031-21c8-4357-8350-5a3a1a9c8ba0 | E2E Multi dblarch-muuncu0v                           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
de4665f9-e409-4e98-96c0-561251d14d1b | E2E Multi rest-muuncwr6                              | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9f0adb84-b62f-41bc-811b-f2689a30faeb | E2E80 E2E-20261005-E6282B ISO muundbkaxatc           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
05d56226-aa83-4075-93e6-51f704c21109 | E2E Multi muundzzfusyp                               | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a21eac3f-4858-4fec-b18a-4059fb0349b1 | E2E Multi muunf6f2w5is                               | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
7fe1c1c3-b2af-4ca6-bbd1-5e4fd6ff16c9 | E2E No Addr noaddr-muunff8d                          | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1fc0124c-9d86-43af-8725-b08b4c4049dd | E2E80 E2E-20261005-B459E6 ISO muunfrbzfbhd           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
23806a7c-6fa1-4509-8a16-74d4385c90b7 | E2E Multi dup-muunfitq                               | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
9b5cc7b3-d8c7-4a0a-b737-9b36eb592cd6 | E2E80 E2E-20261005-B7A9D4 AP muungjyfo0r0            | 2026-10-05 | inact  | Default Tenant | m=1 p=0 t=0
33d58b9d-c313-4414-b986-ded8780f7dcb | E2E80 E2E-20261005-B7A9D4 A11Y muungv7o64cs          | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
00b8c528-c448-40aa-947a-de25dbf6bfcb | E2E Multi muungxgvjth9                               | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
72644c67-dd76-4f9e-99a1-aa4b74ffc8b2 | E2E No Addr noaddr-muunh6dj                          | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1c4a3cf8-fc80-4879-9188-8ed8624bce98 | E2E80 E2E-20261005-B7A9D4 FC muunhleq7h4s            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
25b9d2cc-e39f-4f1b-8780-b99f017f3adc | E2E Multi upd-muungsye                               | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
afffb82a-d44a-4b83-9f3c-2618815c0ab1 | E2E80 E2E-20261005-B7A9D4 FC muunhzs5rkns            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
50a6adbd-2fbf-4402-bd18-7db04cd53540 | E2E Multi dup-muunhalh                               | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
23b75627-047c-4050-a8e0-db1497eed197 | E2E80 E2E-20261005-B7A9D4 FC muunif1ybv9d            | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
b066e2c6-fe7e-476c-ac6e-e28e27d17578 | E2E80 E2E-20261005-B7A9D4 FC muuniu36dvui            | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1efb5d39-2e97-42bf-b835-4f606e6af8fd | E2E Multi upd-muunj700                               | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
5d29faf8-0843-4d1f-803c-e72d25ee19ff | E2E80 E2E-20261005-B7A9D4 FC muunj92dq481            | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
a1c0c14a-7e78-4930-be7a-348390835ad1 | E2E Multi del-muunj9eq                               | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
f3e1885c-c09a-4a5d-8177-f91a1c70f581 | E2E Multi del-muunjb2z                               | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
2185192e-3acf-4b23-a757-7a9cb5fe2c7b | E2E Multi arch-muunjgr6                              | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
bc42ecb6-19c6-4eed-be3d-c6aebae394bf | E2E Multi dblarch-muunjihh                           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
0390584b-4f48-451f-82f5-11a43b9bc46b | E2E Multi upd-muuniki7                               | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
664f71d2-dec7-442d-82ad-8dade956bf7c | E2E80 E2E-20261005-B7A9D4 FC muunjrs701hz            | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
90830075-5142-4362-8ad5-8108cae9c760 | E2E80 E2E-20261005-B7A9D4 FC muunkb3mbsgo            | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
8bba6143-bcd6-4149-a178-41f0a3934d84 | E2E80 E2E-20261005-B7A9D4 FC muunkugc26jy            | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3aabbf39-7fed-4e6f-8782-518dfaa7a20f | E2E Multi upd-muunkxv4                               | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
2ffaf55d-525a-4b1d-8753-d4bf4d94be49 | E2E Extra extra-muunl2pz                             | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
85135c7a-d990-4ebb-b26e-83bdb1f409b5 | E2E Slug Sanitize muunl31z                           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
85d54689-3ffe-407b-a74b-e454c4c82e01 | E2E Multi del-muunl28h                               | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
38c4658d-786d-4312-a655-9ae851e6dac1 | E2E Multi del-muunl55s                               | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
8fcfb3b9-4e96-4a9b-af41-e6897db1713b | E2E Multi arch-muunlblc                              | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
cb94c08b-fbad-4e3e-bfba-7b2d78591c96 | E2E80 E2E-20261005-B7A9D4 FC muunle37wfaa            | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
3f40d34e-6f5b-4076-ad55-cc19b16d94bf | E2E Multi dblarch-muunle35                           | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
20b76100-a8cb-4a6e-ba8e-a08854174d27 | E2E80 E2E-20261005-B7A9D4 FC muunlwi3uxl8            | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
dd16f34a-921e-4eb6-bef1-f00d4dc453dd | E2E Multi rls1-muunm9a7                              | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
61c70f86-caba-45fe-b162-05fc0ad5b444 | E2E Multi perm-muunmd5e                              | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
2c8b4312-0842-4d66-b929-cac1cf0f5444 | E2E80 E2E-20261005-B7A9D4 FC muunmhw1oxd1            | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
266e3e24-a5a1-4d52-bc0e-15912d9f8e3e | E2E Extra extra-muunnkr2                             | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
b6e12bbd-6f83-4918-b4fa-aa0fb26b5892 | E2E Slug Sanitize muunnl91                           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
bddcdb83-7616-420f-9259-b33c7f3a3f1e | E2E Test Store 1791168812786                         | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
451a5b75-1aa7-4d43-a669-ac72e657c282 | E2E80 E2E-20261005-B7A9D4 CASH muuno5trh55s          | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=1
6372097f-1eb7-44aa-a9c5-0f61c3dbbcf1 | E2E80 E2E-20261005-B7A9D4 CAT muunonuokj4m           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
6a0066d8-de7e-45c9-82b2-6caf382603bc | E2E Reset Test 1791168880178                         | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
33519873-cba6-49e3-b05c-99c6d0672633 | E2E Reset Test 1791168894215                         | 2026-10-05 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
7f6f5340-e139-466c-82f0-d36626028918 | E2E80 E2E-20261005-B7A9D4 DEV muunq99qw0w7           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=1 t=1
f5a68fff-6304-4efa-b4e3-5bc01c5ae25f | E2E80 E2E-20261005-B7A9D4 DEV muunqoltqa63           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=1 t=1
a14913a9-78ef-440c-a245-bde0fedcdfa8 | E2E Reset Test 1791168957799                         | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1235ef9e-55af-4dde-81ed-c559f171198f | E2E Reset Test 1791168967062                         | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
19a95da0-e09d-4784-bd12-d8ae23964fad | E2E80 E2E-20261005-B7A9D4 DEV muunrad45wf5           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=1
a67ec448-5342-466e-af43-5897ebce7e39 | E2E Reset Test 1791168978130                         | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
800e8a77-7bd2-42d6-b896-4043abc9a800 | E2E80 E2E-20261005-B7A9D4 DEV muunrxc2nnxl           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=1
9a782705-afbd-418a-a690-7990c2444387 | E2E80 E2E-20261005-B7A9D4 DEV muuns97b3jtr           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=1
434ec07a-0ba1-4b47-9433-df171d0c3f59 | E2E80 E2E-20261005-B7A9D4 DEV muunstbcuq62           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=1
dd93b7db-ae16-4a4a-be5f-ef97f96b4d8d | E2E80 E2E-20261005-B7A9D4 DEV muunt9ya14c8           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=1
55667958-d57b-44f7-a3b6-01d14997d996 | E2E80 E2E-20261005-B7A9D4 DEV muunu3uzc7sl           | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=1
06073e5c-6a82-4d7d-b252-83d8e982c2d4 | E2E Reset Test 1791169126087                         | 2026-10-05 | inact  | E2E TENANT E2E-2026100 | m=1 p=0 t=0
1d40e0d6-801a-40a7-8eab-1f12ebd7de88 | E2E80 E2E-20261005-B7A9D4 INV muunutkvo6bh           | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=1 t=0
233b6114-ab55-44db-83ed-1f4aa707786b | E2E80 E2E-20261005-B7A9D4 INV-UI muunvfyj83az        | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=1 t=0
```

**TEST-* / Test Store*** (4):

```text
1384d4af-210a-4809-8374-466c3667af5f | TEST-REGRESION-1785629886030                         | 2026-08-02 | arch | Default Tenant | m=0 p=0 t=0
8a471be5-cf43-4667-ace8-229b31f3a1b1 | TEST-REGRESION-1785629953259                         | 2026-08-02 | arch | Default Tenant | m=0 p=0 t=0
9bc060c2-1a39-4cb5-aff1-1512e7b7b1f7 | TEST-REGRESION-1785631731646                         | 2026-08-02 | arch | Default Tenant | m=0 p=0 t=0
568bd7a1-f47d-44a3-8c35-fd1ad3dc9944 | TEST-TRANSFER-DEST                                   | 2026-08-02 | arch | Default Tenant | m=0 p=0 t=0
```

**HOT <suite> <timestamp> (hot-path tests)** (27):

```text
4ceef696-788b-4b3d-b0ff-0b0f0af14946 | HOT Sucursal A 1785995943                            | 2026-08-06 | arch | Default Tenant | m=1 p=2 t=0
67ac1e6d-56d4-42a1-98cd-4950e3090a65 | HOT Sucursal B 1785995943                            | 2026-08-06 | arch | Default Tenant | m=1 p=2 t=0
2d861da3-7b02-449d-bfcb-23e52b269fd3 | HOT Integral A 1786057681                            | 2026-08-06 | arch | Default Tenant | m=1 p=0 t=0
1e5c49e9-3607-4f17-b1b7-5b07921e1fcf | HOT Integral B 1786057681                            | 2026-08-06 | arch | Default Tenant | m=1 p=0 t=0
50865d50-e187-410c-a0d2-fcbf43aaa57b | HOT Integral A 1786057783                            | 2026-08-06 | arch | Default Tenant | m=1 p=1 t=0
58e9f839-e1de-43d6-823c-e7e073f8b0c3 | HOT Integral B 1786057783                            | 2026-08-06 | arch | Default Tenant | m=1 p=2 t=0
bbb7d9e6-a8b3-44da-bfa7-0179ac0995fb | HOT Integral A 1786057888                            | 2026-08-06 | arch | Default Tenant | m=1 p=1 t=0
1f44ac81-c165-483b-acb8-3eceb2229612 | HOT Integral B 1786057888                            | 2026-08-06 | arch | Default Tenant | m=1 p=2 t=0
e4cfe601-7239-4f64-aadd-2c32132d5901 | HOT Integral A UPDATED 1786058486                    | 2026-08-06 | arch | Default Tenant | m=1 p=1 t=0
9a46d5c7-6a1a-4276-83e0-cd616c85c00f | HOT Integral B 1786058486                            | 2026-08-06 | arch | Default Tenant | m=1 p=2 t=0
c3d20f20-a4e0-472e-8680-5cd821377543 | HOT R2 Store A 1786058718                            | 2026-08-06 | arch | Default Tenant | m=1 p=1 t=0
50e7ad25-25cb-412c-8b59-5df50f2be8bf | HOT R2 Store B 1786058718                            | 2026-08-06 | arch | Default Tenant | m=1 p=2 t=0
9fcc7ca2-bf06-4b46-b96f-75e510ad69eb | HOT R3 Store A 1786058841                            | 2026-08-06 | arch | Default Tenant | m=1 p=1 t=0
b3345abc-eb45-4c7f-9c25-76d1e31179a3 | HOT Archive Test 1786059177                          | 2026-08-06 | arch | Default Tenant | m=1 p=1 t=0
c3a45a39-28d9-417f-a8d4-7237ca11729e | HOT Cross Store 1786059177                           | 2026-08-06 | arch | Default Tenant | m=1 p=1 t=0
fe4a1ce9-4cf5-48f3-9400-9f31bd3308b6 | HOT R6 Store A 1786059359                            | 2026-08-06 | arch | Default Tenant | m=1 p=1 t=0
b73e5467-11c8-466d-9a9f-208570e9ea06 | HOT R6 Store B 1786059359                            | 2026-08-06 | arch | Default Tenant | m=1 p=0 t=0
007a3c33-a150-4442-85b9-be24c0f4b1cb | HOT R6B Store A 1786059504                           | 2026-08-06 | arch | Default Tenant | m=1 p=1 t=0
c135c50a-c2ff-4476-ac66-c1a698aec1e6 | HOT R6B Store B 1786059504                           | 2026-08-06 | arch | Default Tenant | m=1 p=1 t=0
aad38a68-8214-4ee5-8239-2232312ae787 | HOT R6C Store A 1786059605                           | 2026-08-06 | arch | Default Tenant | m=1 p=1 t=0
fd058f2c-a3c9-475c-9eff-e107f327d965 | HOT R6C Store B 1786059605                           | 2026-08-06 | arch | Default Tenant | m=1 p=1 t=0
0fed91c9-8a15-44b6-877c-1c1e561715c4 | HOT R6D Store A 1786059736                           | 2026-08-06 | arch | Default Tenant | m=1 p=2 t=0
40f651f4-2993-4d46-8459-6e3bbbb17b55 | HOT R6D Store B 1786059736                           | 2026-08-06 | arch | Default Tenant | m=1 p=1 t=0
beacb645-e77e-4f7b-800b-fa2c8f958541 | HOT Integral A UPDATED 1786060163                    | 2026-08-06 | arch | Default Tenant | m=1 p=1 t=0
68d301f2-8f4e-4577-a350-b2b01799fb7f | HOT Integral B 1786060163                            | 2026-08-06 | arch | Default Tenant | m=1 p=2 t=0
10fecc6a-58c2-433c-94eb-330dbb7fb7f4 | HOT FE Archive 1786060255                            | 2026-08-06 | arch | Default Tenant | m=1 p=0 t=0
20d080d5-65ae-4f9c-87da-5575bbffe27b | HOT Transfer Test 1786060918                         | 2026-08-07 | arch | Default Tenant | m=2 p=2 t=0
```

**AUDIT F4E1 STORE <hex>** (2):

```text
f91b0e17-ac23-42ba-b08e-8159a6b57d83 | AUDIT F4E1 STORE A 4f0d1e                            | 2026-09-07 | arch | Default Tenant | m=2 p=25 t=8
9e308fcd-391f-4b91-9866-f0155d8d5cbe | AUDIT F4E1 STORE B 4f0d1e                            | 2026-09-07 | arch | Default Tenant | m=1 p=4 t=0
```

**REM-F4-06dR FIXTURE** (2):

```text
e9a943d8-27c8-48de-88dd-b0d0763aa83e | REM-F4-06dR FIXTURE ALPHA                            | 2026-09-10 | arch | NULL | m=30 p=0 t=0
68b08d4d-8ba1-4adc-b362-b909cba9dc57 | REM-F4-06dR FIXTURE BETA                             | 2026-09-10 | arch | NULL | m=1 p=0 t=0
```

**FASE-D TEST FASED<ts>** (2):

```text
02af4a71-9be9-4ecb-9e2e-536c26c81eca | FASE-D TEST FASED0925233023                          | 2026-09-25 | arch | NULL | m=0 p=0 t=0
241c47df-8abf-41e3-956e-4905642e3c69 | FASE-D TEST FASED0925233117                          | 2026-09-25 | arch | NULL | m=0 p=0 t=3
```

**ESEC TEST ESEC<ts>** (3):

```text
fca060ba-8e21-44f6-946b-bfa2436be4e9 | ESEC TEST ESEC0926014054                             | 2026-09-26 | arch | NULL | m=1 p=0 t=0
3808206e-40d9-403c-b7d5-4be399059a48 | ESEC TEST ESEC0926014144                             | 2026-09-26 | arch | NULL | m=2 p=3 t=0
205ed126-e976-40cc-985b-cb8d6e44e1ab | ESEC TEST ESEC0926014201                             | 2026-09-26 | arch | NULL | m=2 p=7 t=104
```

**E2E PILOT A/B CostPro <run-id> (run-env.ts)** (103):

```text
6b5eff1a-0fc2-48fc-85af-098853e453f4 | E2E PILOT A CostPro                                  | 2026-09-28 | ACTIVA | Default Tenant | m=1 p=1 t=0
fbb8648f-daa0-417c-8cee-dd8128976279 | E2E PILOT B CostPro                                  | 2026-09-28 | ACTIVA | Default Tenant | m=1 p=1 t=0
de263b8f-4e0a-4819-aacd-f72ac8925594 | E2E PILOT A SMOKE-Ab04                               | 2026-10-04 | arch | Default Tenant | m=0 p=0 t=0
0a1b57ec-3b68-442e-b07d-71f0cc21e8e1 | E2E PILOT B SMOKE-Ab04                               | 2026-10-04 | arch | Default Tenant | m=0 p=0 t=0
008ac26e-3ced-4cb4-919a-8d5418d0faf5 | E2E PILOT A SMOKE-Ab05                               | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
d9ed32cc-659c-48d2-b5aa-eaa32ab439eb | E2E PILOT A SMOKE-Ab06                               | 2026-10-04 | arch | E2E RUN SMOKE-Ab06 | m=0 p=0 t=0
5c7ca4ce-5917-410a-b9d4-7a1d0fafda99 | E2E PILOT B SMOKE-Ab06                               | 2026-10-04 | arch | E2E RUN SMOKE-Ab06 | m=0 p=0 t=0
b763a23f-91a8-4771-96e9-796ba40f039e | E2E PILOT A SMOKE-Fl07                               | 2026-10-04 | arch | E2E RUN SMOKE-Fl07 | m=0 p=0 t=0
9a1f9c0a-0209-4fd8-a683-e1a6c408efcb | E2E PILOT B SMOKE-Fl07                               | 2026-10-04 | arch | E2E RUN SMOKE-Fl07 | m=0 p=0 t=0
86462150-278b-4a59-8ced-63d0320b7941 | E2E PILOT A SMOKE-Fl08                               | 2026-10-04 | arch | E2E RUN SMOKE-Fl08 | m=0 p=0 t=0
db8bd071-51be-4349-b167-305d4b964cae | E2E PILOT B SMOKE-Fl08                               | 2026-10-04 | arch | E2E RUN SMOKE-Fl08 | m=0 p=0 t=0
a57f0b55-358c-4029-92d8-f2b17630270f | E2E PILOT A SMOKE-Tt09                               | 2026-10-04 | arch | E2E RUN SMOKE-Tt09 | m=0 p=0 t=0
f7f9db5a-82f1-404c-87f7-c36371c08e22 | E2E PILOT B SMOKE-Tt09                               | 2026-10-04 | arch | E2E RUN SMOKE-Tt09 | m=0 p=0 t=0
c1c48add-9f30-4c3e-830e-e52bba990cd8 | E2E PILOT A CONC-Bb02                                | 2026-10-04 | arch | E2E RUN CONC-Bb02 | m=0 p=0 t=0
852d7328-4621-4b33-9b8d-69bc5e6780db | E2E PILOT A CONC-Aa01                                | 2026-10-04 | arch | E2E RUN CONC-Aa01 | m=0 p=0 t=0
3135be55-1c9c-460d-b802-fad89b307fa5 | E2E PILOT B CONC-Bb02                                | 2026-10-04 | arch | E2E RUN CONC-Bb02 | m=0 p=0 t=0
70e40808-8158-4808-92be-3a39c45b3188 | E2E PILOT B CONC-Aa01                                | 2026-10-04 | arch | E2E RUN CONC-Aa01 | m=0 p=0 t=0
26cd1230-37dc-4819-9005-f6726aa40e91 | E2E PILOT A CLEAN-Aa03                               | 2026-10-04 | arch | E2E RUN CLEAN-Aa03 | m=0 p=0 t=0
e773e53d-40a0-4c3f-bb61-1a6b71add19e | E2E PILOT B CLEAN-Aa03                               | 2026-10-04 | arch | E2E RUN CLEAN-Aa03 | m=0 p=0 t=0
4504a554-7996-4e7f-a89f-0ac76bcbbe3b | E2E PILOT A CLEAN-Aa05                               | 2026-10-04 | arch | E2E RUN CLEAN-Aa05 | m=0 p=0 t=0
2bcd848a-422f-4aef-a6b8-b1515fe577ce | E2E PILOT B CLEAN-Aa05                               | 2026-10-04 | arch | E2E RUN CLEAN-Aa05 | m=0 p=0 t=0
f2d03c3b-9671-43f8-b49a-9d5e7908dcd0 | E2E PILOT A CLEAN-Aa07                               | 2026-10-04 | arch | E2E RUN CLEAN-Aa07 | m=0 p=0 t=0
f0a5f290-a557-4ab5-9586-36bc2a5a302d | E2E PILOT B CLEAN-Aa07                               | 2026-10-04 | arch | E2E RUN CLEAN-Aa07 | m=0 p=0 t=0
5e630684-a1e0-4ec9-b432-78b033788812 | E2E PILOT A CLEAN-Bb06                               | 2026-10-04 | arch | E2E RUN CLEAN-Bb06 | m=0 p=0 t=0
f45fb077-59da-47eb-a1be-daeb8bcbf955 | E2E PILOT B CLEAN-Bb06                               | 2026-10-04 | arch | E2E RUN CLEAN-Bb06 | m=0 p=0 t=0
67eabef0-406c-444f-bd8f-bc137577f65f | E2E PILOT A FULL-Su01                                | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
a00c7668-b79c-44eb-9205-57fcdb39b737 | E2E PILOT B FULL-Su01                                | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
37719cdc-1b2b-4b30-8a2b-8b7ec9d1e11d | E2E PILOT A CostPro E2E-20261004-4FDD8A              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
6ec2a67f-2377-4272-adb8-17b245bfcc32 | E2E PILOT B CostPro E2E-20261004-4FDD8A              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
331fbc6b-e27e-4c39-9bab-082b985bb8c7 | E2E PILOT A CostPro E2E-20261004-888B89              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
7a314f35-15ec-429a-8593-c1f30bb1625f | E2E PILOT B CostPro E2E-20261004-888B89              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
0e995480-d1fa-4e92-8027-0a44fb8eb382 | E2E PILOT A CostPro E2E-20261004-A7E782              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
ddcfbdf7-9065-4101-83bd-b7b08fa728d8 | E2E PILOT A CostPro E2E-20261004-B3D261              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
d22555f4-b8f5-4bb5-b5bd-10b46982e5fb | E2E PILOT B CostPro E2E-20261004-B3D261              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
e26c006e-27e0-4a6c-9504-4a343c0ac023 | E2E PILOT B CostPro E2E-20261004-A7E782              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
89af2de6-02a0-4571-9f24-3a6fbca49c4a | E2E PILOT A CostPro E2E-20261004-9CE289              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
819fc2d3-3172-4ed0-85f0-0843c195109a | E2E PILOT A CostPro E2E-20261004-FEEDCB              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
520b36bc-4921-4043-81cb-531bdabc6d91 | E2E PILOT B CostPro E2E-20261004-9CE289              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
ef3c2480-7e91-48c6-81e9-c8f1f34e7e68 | E2E PILOT B CostPro E2E-20261004-FEEDCB              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
2d0c5b36-0707-43bb-bd31-cf1e0728dbc9 | E2E PILOT A CostPro E2E-20261004-F8F383              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
4beb44ae-9490-4c42-ada2-e1e95935bbca | E2E PILOT B CostPro E2E-20261004-F8F383              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
acc2082f-1673-4041-9dc5-064b0e7a5591 | E2E PILOT A CostPro E2E-20261004-A1ADA4              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
4f1e636f-ebde-4cc3-bb05-6d8c8ad6b32d | E2E PILOT B CostPro E2E-20261004-A1ADA4              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
9b426748-6363-4da9-b367-fc5ba75bc46c | E2E PILOT A CostPro E2E-20261004-5CFBD5              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
0e15e975-80ed-463f-845a-2c0eb6bb7fdb | E2E PILOT B CostPro E2E-20261004-5CFBD5              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
c3794bc1-7f34-48fc-a8e8-de0a98fd4684 | E2E PILOT A CostPro E2E-20261004-F4F183              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
7cdf1155-aed4-488c-85a2-fb704a3a46fa | E2E PILOT B CostPro E2E-20261004-F4F183              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
5bf1c3ef-dac5-4426-86f2-6bebedf6388b | E2E PILOT A CostPro E2E-20261004-54A1AB              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
5a5fd062-78fb-435d-910d-fe99a102642e | E2E PILOT B CostPro E2E-20261004-54A1AB              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
a13c3e5d-13de-449f-8fbe-5bb6a9225a03 | E2E PILOT A CostPro E2E-20261004-1EC90B              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
a2c15395-89bc-4a26-9daf-d4dfb5d015ea | E2E PILOT B CostPro E2E-20261004-1EC90B              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
d1c917c9-dcee-4503-b042-fbbbbe3dad7a | E2E PILOT A CostPro E2E-20261004-225F77              | 2026-10-04 | ACTIVA | E2E TENANT E2E-2026100 | m=2 p=1 t=0
d0e34680-9eee-4f9a-82c9-827586b8a868 | E2E PILOT B CostPro E2E-20261004-225F77              | 2026-10-04 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=1 t=0
1eb7f23b-e92b-4bca-8317-f743a2f48fa2 | E2E PILOT A CostPro E2E-20261004-6B1C25              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
ee58f119-510b-484a-88e7-8b6d08f941a4 | E2E PILOT B CostPro E2E-20261004-6B1C25              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=0 p=0 t=0
21bf5888-24e9-4f53-a0d1-d34d5abc891b | E2E PILOT A CostPro E2E-20261004-0F6F71              | 2026-10-04 | ACTIVA | E2E TENANT E2E-2026100 | m=2 p=1 t=0
33c9d49b-e9b9-44dc-bc97-3c1095031ca5 | E2E PILOT B CostPro E2E-20261004-0F6F71              | 2026-10-04 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=1 t=0
1cdbfeb8-515f-469c-90ad-8fa3e074226d | E2E PILOT A CostPro E2E-20261004-4F0978              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
fc4a9f03-f6a1-4816-af42-7c17ec222f32 | E2E PILOT B CostPro E2E-20261004-4F0978              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=0 p=0 t=0
bb3c6d4a-5365-4fdb-93fb-89c182cb9063 | E2E PILOT A CostPro E2E-20261004-B3FBA5              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
e965a6ae-9861-42e7-85f0-4a7bacd9cbe2 | E2E PILOT B CostPro E2E-20261004-B3FBA5              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=0 p=0 t=0
fd837847-38f1-4222-b5c2-95abf4b9d422 | E2E PILOT A CostPro E2E-20261004-7CAE71              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
9b97d8d8-908d-40e1-bf6d-80627c462c8e | E2E PILOT B CostPro E2E-20261004-7CAE71              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=0 p=0 t=0
502c01d2-06c2-4245-b5ca-116064763a94 | E2E PILOT A CostPro E2E-20261004-6F651B              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
749238c0-ba87-496b-a7e2-104a28abfe38 | E2E PILOT B CostPro E2E-20261004-6F651B              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=0 p=0 t=0
39478090-db9a-40ff-9f9d-3c3776c853a3 | E2E PILOT A CostPro E2E-20261004-361C56              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
7879b995-7a50-49f4-abe9-b3e547ddec8c | E2E PILOT B CostPro E2E-20261004-361C56              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=0 p=0 t=0
b3b13921-ebf6-476f-8d31-f25ce3283d68 | E2E PILOT A CostPro E2E-20261004-696E13              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
0e8aeb07-763f-48a4-9e6e-f21a7cb0af2a | E2E PILOT B CostPro E2E-20261004-696E13              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=0 p=0 t=0
d865591a-6501-4513-847a-4b0426e98234 | E2E PILOT A CostPro E2E-20261004-D4E310              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
a580ef42-f898-4666-94d4-7538be3ba5f9 | E2E PILOT B CostPro E2E-20261004-D4E310              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=0 p=0 t=0
4df47698-1769-4180-89af-5a6afe18a9ed | E2E PILOT A CostPro E2E-20261004-0A32FE              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
580d5b41-9315-4003-9b45-e8658779e51a | E2E PILOT B CostPro E2E-20261004-0A32FE              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=0 p=0 t=0
13aecea4-75d5-458e-b2b3-dd4c18e3223a | E2E PILOT A CostPro E2E-20261004-E6AE59              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
2702d7b2-3bad-4f54-8ff0-64c93a18685b | E2E PILOT B CostPro E2E-20261004-E6AE59              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=0 p=0 t=0
b9824939-c885-4ce3-91fe-fa2714e8cbf5 | E2E PILOT A CostPro E2E-20261004-AA8BD0              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
d1266f7b-72ef-4a27-9714-efa6a2b20840 | E2E PILOT B CostPro E2E-20261004-AA8BD0              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
68c34692-7f6b-4b34-a7d4-1e64b2447a98 | E2E PILOT A CostPro E2E-20261004-8ABD6F              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
ac773c8e-d123-4867-b07c-39f360105d47 | E2E PILOT B CostPro E2E-20261004-8ABD6F              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
fd73a0f6-d198-4852-a6cf-1026a82172e5 | E2E PILOT A CostPro E2E-20261004-9DFA94              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
5a60d93c-659c-4c06-b126-636009c4e515 | E2E PILOT B CostPro E2E-20261004-9DFA94              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=0 p=0 t=0
fac0617d-348b-42a3-9fa6-c406c9bfcd4e | E2E PILOT A CostPro E2E-20261004-AB992B              | 2026-10-04 | ACTIVA | E2E TENANT E2E-2026100 | m=2 p=1 t=0
d3f23152-aec3-4643-83f8-b4cdc16ddf82 | E2E PILOT B CostPro E2E-20261004-AB992B              | 2026-10-04 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=1 t=0
344052b4-05f4-4203-9c83-55b9b906dede | E2E PILOT A CostPro E2E-20261004-720EED              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
84befe8d-2fca-4b99-be2e-cdeae51e2356 | E2E PILOT B CostPro E2E-20261004-720EED              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=0 p=0 t=0
8cbbc689-95c1-46bb-890b-99e6f1c5911a | E2E PILOT A CostPro E2E-20261004-9F9C4D              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
669add57-7f7c-4762-a389-1fcd24f3ce11 | E2E PILOT B CostPro E2E-20261004-9F9C4D              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=0 p=0 t=0
12f34ec8-9d08-451d-8b0a-c16c80f1c9e6 | E2E PILOT A CostPro E2E-20261004-719B7C              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
9b0ffdca-9c6e-4d9e-9c6e-ae2d08c7a8f1 | E2E PILOT B CostPro E2E-20261004-719B7C              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=0 p=0 t=0
c7fce63e-7d0b-48a2-9c7d-c3dda6d5b04f | E2E PILOT A CostPro E2E-20261004-A7E32B              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
7ddc7d69-e5a9-423b-b927-b207edd9c3ae | E2E PILOT B CostPro E2E-20261004-A7E32B              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=0 p=0 t=0
894f581b-1be2-4688-99c1-4d495702cef9 | E2E PILOT A CostPro E2E-20261004-04FA0A              | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=0 p=0 t=0
b7015062-29ae-4e4c-9263-df3750fbbd35 | E2E PILOT B CostPro E2E-20261004-04FA0A              | 2026-10-04 | inact  | E2E TENANT E2E-2026100 | m=0 p=0 t=0
8b82aeee-8465-41f3-abb2-612f0b05d34f | E2E PILOT A CostPro E2E-20261005-FBD7DC              | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=2 p=1 t=0
4e4937c6-e03b-4e37-a887-848de993b540 | E2E PILOT B CostPro E2E-20261005-FBD7DC              | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=1 t=0
31342d30-ad1a-4e73-ad36-a6d150a9ce8f | E2E PILOT A CostPro E2E-20261005-5C592C              | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=2 p=1 t=0
c0718797-682b-4098-aad2-d591ae05b0b6 | E2E PILOT B CostPro E2E-20261005-5C592C              | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=1 t=0
9e428a0f-ff7f-42c4-994d-c59d1c74ee38 | E2E PILOT A CostPro E2E-20261005-E6282B              | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=2 p=1 t=0
793ac6aa-c770-4fc0-8078-bb8d89584dc2 | E2E PILOT B CostPro E2E-20261005-E6282B              | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=1 t=0
cf66510c-e042-4df8-95cf-ebec17f54c48 | E2E PILOT A CostPro E2E-20261005-B459E6              | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=2 p=1 t=0
f894b519-4f6a-4c89-8303-ea356f9bdfbf | E2E PILOT B CostPro E2E-20261005-B459E6              | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=1 t=0
fa7b3daf-f844-403a-9498-2a0395efcc5d | E2E PILOT A CostPro E2E-20261005-B7A9D4              | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=2 p=1 t=0
b63d4f41-1b70-4b2d-9e79-845a26a77980 | E2E PILOT B CostPro E2E-20261005-B7A9D4              | 2026-10-05 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=1 t=0
```

**E2E Tienda <n>** (23):

```text
536fc130-3c16-49a0-81a8-09776907b8d6 | E2E Tienda munckmtb                                  | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
ab992f20-5715-49a0-96b9-7ac4c20ddd2e | E2E Tienda mundjnwi                                  | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
f24bfc53-0383-4150-ba57-1d340e79be6c | E2E Tienda mung63nc                                  | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
5a710a3b-7b25-4e60-99a0-5def05b9f21e | E2E Tienda muoq03b2                                  | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
f1e84750-f4fd-4809-b475-07d47c6c05c9 | E2E Tienda muoqqjvd                                  | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
4499537f-883f-4abc-aa58-256945a154b0 | E2E Tienda muoqs3ml                                  | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
39d86f1b-0add-42e7-97c0-408388a482c7 | E2E Tienda muorlvwv                                  | 2026-09-30 | arch | Default Tenant | m=1 p=0 t=0
e1e7016e-b172-4856-923e-052ecbe0714d | E2E Tienda muotqbfg                                  | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
6b9f1ded-bb83-4ab8-a4b9-e43e40c05631 | E2E Tienda muowbeoi                                  | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
6feaaa53-e220-4e04-a907-25af0f7514b6 | E2E Tienda muowjmok                                  | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
595b6e95-d43a-408c-b539-77922e61eb72 | E2E Tienda mup04pm7                                  | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
d28e672c-cd8a-45d9-b4f9-2082d43b0f0b | E2E Tienda mup26oq0                                  | 2026-10-01 | arch | Default Tenant | m=1 p=0 t=0
ab24b3d5-327c-482f-8b18-b9ef0009a6c3 | E2E Tienda mut15z8k                                  | 2026-10-03 | arch | Default Tenant | m=1 p=0 t=0
04dd09ae-68cb-4743-9b1a-a0f924744a41 | E2E Tienda mut3j7lz                                  | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
94e90dd5-431d-42ae-8067-0e9203d6aaea | E2E Tienda mut5hncy                                  | 2026-10-04 | arch | E2E RUN FULL-Su01 | m=0 p=0 t=0
7456dc21-e003-4779-9400-b96470fec6bc | E2E Tienda mut8j3j0                                  | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
e7f201e6-d942-43a8-b0bc-077767572425 | E2E Tienda mut9ph1s                                  | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
faf7d268-a8ea-459a-b65b-57889babfed4 | E2E Tienda muta1bih                                  | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
8d737326-9e34-4f89-b0e8-b0cbeb974e45 | E2E Tienda mute8qyg                                  | 2026-10-04 | arch | E2E TENANT E2E-2026100 | m=1 p=0 t=0
0f9b4377-dc1e-4141-b017-fd1c70e9719b | E2E Tienda mutft8xm                                  | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
27526c3a-e19e-4da5-bb60-4c96db026d62 | E2E Tienda mutg5jot                                  | 2026-10-04 | arch | Default Tenant | m=1 p=0 t=0
d38c4b6f-fb68-4b3e-a7be-be65bd05c58b | E2E Tienda mutvod6y                                  | 2026-10-04 | ACTIVA | Default Tenant | m=1 p=0 t=0
3bd69704-2eed-4c44-8d4d-7e31ccf9ba08 | E2E Tienda mutyma0h                                  | 2026-10-04 | ACTIVA | E2E TENANT E2E-2026100 | m=1 p=0 t=0
```


## USUARIOS — C E2E RESIDUALES (359) por patrón

| Patrón | Cantidad |
|---|---|
| hot-* (hot-path tests) | 10 |
| test_no_admin@example.com | 1 |
| audit-ph3-* / audit-clerk-4f0d1e | 6 |
| b10b-*@test.local | 4 |
| gate-f406d-* | 2 |
| f06dr-*@fixture.local (REM-F4-06dR s01-s30) | 35 |
| e2e2-*@fixture.costpro (ALPHA/BETA) | 7 |
| fc-* / fc.e2e.* (ficha de costo) | 4 |
| fase-d-e2e-*@costpro-test.local | 2 |
| esec-*@costpro-test | 6 |
| e2e-attacker-*@costpro.local (seguridad) | 52 |
| e2e80-created-*@costpro.test (roles-permissions) | 45 |
| e2e-<run>-adm/usr/wh/enc@costpro.test (run aislado) | 184 |
| qa-costpro-pwdadmin-* | 1 |

### Detalle por usuario

**hot-* (hot-path tests)** (10):

```text
b667c1ce-f51a-4b88-adc4-bb622f6de9da | hot-test-1785124504524@costpro.local           | 2026-07-27 | last=2026-07-27 | no-ban | m=0
58a3e8d9-12bd-4648-9dae-e5b33d835d89 | hot-test-1785124663457@costpro.local           | 2026-07-27 | last=2026-07-27 | no-ban | m=0
a5de6b2e-fba8-4cad-84d5-f51e9022f4e6 | hot-test-1785125001099@costpro.local           | 2026-07-27 | last=2026-07-27 | no-ban | m=0
4bc6e86e-09c6-4536-8f4b-f6711c6458a2 | hot-test-1785125100635@costpro.local           | 2026-07-27 | last=2026-07-27 | no-ban | m=0
3b86daa5-aaec-48c2-addd-8eaeedd9a5c9 | hot-test-1785125168984@costpro.local           | 2026-07-27 | last=2026-07-27 | no-ban | m=0
6aee02da-e7dc-4d3b-a106-2092c43e8714 | hot-test-1785125252425@costpro.local           | 2026-07-27 | last=2026-07-27 | no-ban | m=0
6017d31a-067a-4cf6-bc7c-7346c4c484ee | hot-test-1785125313548@costpro.local           | 2026-07-27 | last=2026-07-27 | no-ban | m=0
91c67d14-98b7-429f-8765-faebfa206a80 | hot-test-dcf5b2b7-d765-4e80-b68c-909e3913f2e9@ | 2026-08-06 | last=2026-08-22 | no-ban | m=0
e1e34a4e-5c3c-4dfe-9e96-aba35a6acaee | hot-regular@costpro.local                      | 2026-08-23 | last=2026-08-23 | no-ban | m=0
f0750794-3201-4e16-b506-9f2837493eab | hot-test@costpro.local                         | 2026-08-23 | last=2026-08-23 | no-ban | m=1
```

**test_no_admin@example.com** (1):

```text
89f614e3-5f20-4a21-82a4-39210ec51925 | test_no_admin@example.com                      | 2026-08-02 | last=2026-08-02 | no-ban | m=0
```

**audit-ph3-* / audit-clerk-4f0d1e** (6):

```text
225dfa4b-df58-403f-9b5a-1ad183badb99 | audit-ph3-a@audit.costpro.test                 | 2026-08-26 | last=2026-08-26 | no-ban | m=1
c147b1ee-23b4-4756-a4c6-a95457f6d8fc | audit-ph3-b@audit.costpro.test                 | 2026-08-26 | last=2026-08-26 | no-ban | m=1
0d3909ef-3114-4f4d-a43e-32f701b01a7f | audit-ph3-rev@audit.costpro.test               | 2026-08-26 | last=2026-08-26 | no-ban | m=1
7897d089-82d1-4da8-8f07-fb723a320557 | audit-ph3-none@audit.costpro.test              | 2026-08-26 | last=2026-08-26 | no-ban | m=0
037b50b2-0757-4e95-8503-55c57a48d56b | audit-ph3-mgr@audit.costpro.test               | 2026-08-26 | last=2026-09-09 | no-ban | m=0
9adf2009-9828-4d82-b923-f84d77f63a44 | audit-clerk-4f0d1e@costpro.test                | 2026-09-07 | last=2026-09-09 | no-ban | m=1
```

**b10b-*@test.local** (4):

```text
b10b0000-0000-4000-8000-0000000001a1 | b10b-u1@test.local                             | 2026-09-05 | last=— | no-ban | m=0
b10b0000-0000-4000-8000-0000000001c3 | b10b-ga@test.local                             | 2026-09-05 | last=— | no-ban | m=0
b10b0000-0000-4000-8000-0000000001b2 | b10b-u2@test.local                             | 2026-09-05 | last=— | no-ban | m=0
b10b0000-0000-4000-8000-0000000001d4 | b10b-u3@test.local                             | 2026-09-05 | last=— | no-ban | m=0
```

**gate-f406d-*** (2):

```text
7d406f01-0000-4000-8000-00000000d001 | gate-f406d-m1@audit.costpro.test               | 2026-09-10 | last=2026-09-10 | BANNED | m=0
7d406f01-0000-4000-8000-00000000d002 | gate-f406d-x1@audit.costpro.test               | 2026-09-10 | last=2026-09-10 | BANNED | m=0
```

**f06dr-*@fixture.local (REM-F4-06dR s01-s30)** (35):

```text
d4478b5d-3822-43a3-b3b4-6f1cd8a9a263 | f06dr-admin@fixture.local                      | 2026-09-10 | last=— | no-ban | m=0
88f83495-bfc5-4acd-94c6-fd28ea07acbf | f06dr-nonmember@fixture.local                  | 2026-09-10 | last=— | no-ban | m=0
42a357a9-b6b9-46d6-9877-4096d3971ce3 | f06dr-admin-v2@fixture.local                   | 2026-09-10 | last=2026-09-10 | no-ban | m=0
c52cab6b-2cc3-4de3-92a5-2f150bf679e7 | f06dr-nonmember-v2@fixture.local               | 2026-09-10 | last=2026-09-10 | no-ban | m=0
e5ad0d19-823d-49aa-ade7-69ff00190e87 | f06dr-cross-v2@fixture.local                   | 2026-09-10 | last=2026-09-10 | no-ban | m=1
980c44c1-c85a-4fdb-b7c6-7627dc4054f2 | f06dr-s01-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
52eb9c00-4b5b-4b89-8f52-cf621cbe35f3 | f06dr-s02-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
7fb76450-def1-434a-9b3f-2b45134fd3b5 | f06dr-s03-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
6b5015f1-9b46-478c-87b4-43df74a46b43 | f06dr-s04-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
e79f6f91-e3ed-4634-8ae8-9e420505a287 | f06dr-s05-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
90b5af2e-fea6-4fe1-a5f8-aa9cb0c37b15 | f06dr-s06-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
4045d557-606e-455f-8b04-4079503c0014 | f06dr-s07-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
e5cbc23e-622e-42fb-a9f5-74484c715d12 | f06dr-s08-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
0ce58fbc-44ad-4b9d-94bc-b40523bdb276 | f06dr-s09-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
046de9b6-9f23-4113-a47a-3321c569dbc1 | f06dr-s10-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
66ac3e27-f826-4670-9e9c-80b23ed7fa25 | f06dr-s11-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
7061b800-c186-499e-bcc3-9e4942d1559b | f06dr-s12-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
d1e4e255-821b-4656-8d9a-37fd077937d3 | f06dr-s13-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
7e295799-6561-4c8f-b4cf-941a6556b39a | f06dr-s14-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
9592930d-ce1c-4a54-b95b-f1fa9d8ce2ea | f06dr-s15-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
0d500cc6-61ea-4f87-9f75-e0524cd8a8fe | f06dr-s16-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
f5f8144b-68a5-4f86-b10d-b4e5a0ecbdcc | f06dr-s17-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
2daa15b3-29a0-4853-aa0c-c6f000f9a6ab | f06dr-s18-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
e03af8db-c2e3-4c77-b19f-8203d6ec4357 | f06dr-s19-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
88d91ee2-d39e-4416-8978-e0b223a18708 | f06dr-s20-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
fafcbab2-4db6-46b6-a710-bc8d285af310 | f06dr-s21-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
b9a10c49-853b-4064-a78b-7bb01c7358d7 | f06dr-s22-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
8067119a-4020-4770-a288-a2f127e13e5b | f06dr-s23-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
2e2e9081-11eb-49b6-9813-8bf9a70d3aa1 | f06dr-s24-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
dbdd7621-e11b-4288-8a94-28112da49099 | f06dr-s25-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
7d1c83d5-c002-4c52-acd8-035ed3851dea | f06dr-s26-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
dbac1438-a0e5-4bdc-bb36-82c1c8d8f1de | f06dr-s27-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
6fab31db-c14a-4108-a818-d3ec1cdb92ae | f06dr-s28-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
fc17e42d-2f3e-413b-b97a-06ca1aee2374 | f06dr-s29-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
9c31cb43-dfab-4038-852e-8d86e4295f98 | f06dr-s30-v2@fixture.local                     | 2026-09-10 | last=2026-09-10 | no-ban | m=1
```

**e2e2-*@fixture.costpro (ALPHA/BETA)** (7):

```text
7613f105-7b0d-4f4c-8792-b45c1e35fd4e | e2e2-alpha-admin@fixture.costpro               | 2026-09-10 | last=2026-09-11 | no-ban | m=1
bf3b9fae-b2a0-43c4-b8c1-1cbab5fa28b8 | e2e2-dbg@fixture.costpro                       | 2026-09-10 | last=— | BANNED | m=0
4c71ba55-d2a5-499e-a34e-ccf508b8df7f | e2e2-alpha-manager@fixture.costpro             | 2026-09-10 | last=2026-09-11 | no-ban | m=1
a063a1db-f8e4-4a5f-a898-f643548c0b3b | e2e2-alpha-clerk@fixture.costpro               | 2026-09-10 | last=2026-09-11 | no-ban | m=1
c37cd9f7-cfe4-46c2-bad3-a48c721f2c29 | e2e2-beta-manager@fixture.costpro              | 2026-09-10 | last=2026-09-11 | no-ban | m=1
cf37edac-4bfa-4295-98e3-cb745574daf2 | e2e2-beta-clerk@fixture.costpro                | 2026-09-10 | last=2026-09-10 | no-ban | m=1
83af9b60-2265-4e3c-bdac-2cc52eb49cd2 | e2e2-outsider@fixture.costpro                  | 2026-09-10 | last=2026-09-11 | no-ban | m=0
```

**fc-* / fc.e2e.* (ficha de costo)** (4):

```text
65f87559-8823-48fe-ae5c-61349c595d51 | fc-mvp-smoke@costpro-test.local                | 2026-09-16 | last=2026-09-16 | BANNED | m=0
d3c793e1-8e93-44a2-b624-bd860198ec40 | fc-access-e2e-0916@costpro-test.local          | 2026-09-16 | last=2026-09-16 | BANNED | m=0
a3a18e53-2721-4563-b09c-771a408bc560 | fc.e2e.n28@costpro-test.dev                    | 2026-09-19 | last=2026-09-19 | BANNED | m=0
bbeebf0f-ed88-4db8-925b-b99d0c3ec35f | fc.e2e.p3@costpro-test.dev                     | 2026-09-19 | last=2026-09-19 | BANNED | m=0
```

**fase-d-e2e-*@costpro-test.local** (2):

```text
80f63bfe-2723-4294-83d4-57b2fb999870 | fase-d-e2e-0925233023@costpro-test.local       | 2026-09-25 | last=— | no-ban | m=0
7d5760a3-806c-4fe6-9eb1-f6e906fb17b5 | fase-d-e2e-0925233117@costpro-test.local       | 2026-09-25 | last=2026-09-25 | no-ban | m=0
```

**esec-*@costpro-test** (6):

```text
f6d2feb6-a148-4edf-aa35-2974b58e7334 | esec-admin-0926014054@costpro-test.local       | 2026-09-26 | last=— | no-ban | m=1
46fdb41a-7ace-4190-9743-2c594aad67cb | esec-encargado-0926014054@costpro-test.local   | 2026-09-26 | last=— | no-ban | m=0
696f4d23-5fd8-4bba-8dc9-d539dfa44335 | esec-admin-0926014144@costpro-test.local       | 2026-09-26 | last=— | no-ban | m=1
98257fcd-e365-4bee-8dae-e8f4468f8ece | esec-encargado-0926014144@costpro-test.local   | 2026-09-26 | last=— | no-ban | m=1
cea2dc34-790a-4a87-aeca-ecb683ad3836 | esec-admin-0926014201@costpro-test.local       | 2026-09-26 | last=2026-09-26 | no-ban | m=1
e763a8f8-17a1-4625-90f6-409535769ccd | esec-encargado-0926014201@costpro-test.local   | 2026-09-26 | last=2026-09-26 | no-ban | m=1
```

**e2e-attacker-*@costpro.local (seguridad)** (52):

```text
b235847e-a58a-480e-856e-ed782aaad16d | e2e-attacker-1790482786398@costpro.local       | 2026-09-27 | last=2026-09-30 | no-ban | m=0
3f966ae1-6473-4cf8-a700-e144e2fca38a | e2e-attacker-1790482959187@costpro.local       | 2026-09-27 | last=2026-09-27 | no-ban | m=0
9f2575c3-7727-4a38-84cd-1d0dfdfea04d | e2e-attacker-1790493960772@costpro.local       | 2026-09-27 | last=2026-09-27 | no-ban | m=0
29cb3ad5-f10d-4ecf-9766-97eefdfbcec1 | e2e-attacker-1790497996235@costpro.local       | 2026-09-27 | last=2026-09-27 | no-ban | m=0
cd4568e3-7843-44ed-9dfe-51075ac70159 | e2e-attacker-1790643227894@costpro.local       | 2026-09-29 | last=2026-09-29 | no-ban | m=0
be8da7d5-b0da-4c3d-b7ed-276e8566c3c8 | e2e-attacker-1790644219368@costpro.local       | 2026-09-29 | last=2026-09-29 | no-ban | m=0
bc1c7367-d9cb-44a3-bb64-8b1de75c2624 | e2e-attacker-1790644221519@costpro.local       | 2026-09-29 | last=2026-09-29 | no-ban | m=0
7f4c7d38-b60b-43de-93e9-de7d7da7d9d4 | e2e-attacker-1790645671871@costpro.local       | 2026-09-29 | last=2026-09-29 | no-ban | m=0
7ee83044-19c4-4b96-96aa-c8c6202fdfa1 | e2e-attacker-1790647350944@costpro.local       | 2026-09-29 | last=2026-09-29 | no-ban | m=0
0d3f6a29-d64e-419d-b8cc-a5a5892ccefd | e2e-attacker-1790647686110@costpro.local       | 2026-09-29 | last=2026-09-29 | no-ban | m=0
0e90dbb9-73ef-46b0-9995-88d3ab91ec5f | e2e-attacker-1790649527224@costpro.local       | 2026-09-29 | last=2026-09-29 | no-ban | m=0
760fb2be-51a6-4d97-ae93-11138d9b86d8 | e2e-attacker-1790652184222@costpro.local       | 2026-09-29 | last=2026-09-29 | no-ban | m=0
70316bf6-75b2-4860-ac4b-a2b550079b45 | e2e-attacker-1790652801669@costpro.local       | 2026-09-29 | last=2026-09-29 | no-ban | m=0
e403667c-2f3b-4832-b915-8c95f6e94b21 | e2e-attacker-1790653364586@costpro.local       | 2026-09-29 | last=2026-09-29 | no-ban | m=0
7bab3423-78b5-45ba-840e-8392855968f2 | e2e-attacker-1790680429757@costpro.local       | 2026-09-29 | last=2026-09-29 | no-ban | m=0
4f3975dd-f5c0-4de1-b8b3-cc8ede12174a | e2e-attacker-1790682878442@costpro.local       | 2026-09-29 | last=2026-09-29 | no-ban | m=0
fd6f4f03-a26b-4535-8f37-fd5a3f9317ec | e2e-attacker-1790689011862@costpro.local       | 2026-09-29 | last=2026-09-29 | no-ban | m=0
84206543-a5d0-4b33-852f-0d2b239873ae | e2e-attacker-1790691427721@costpro.local       | 2026-09-29 | last=2026-09-29 | no-ban | m=0
bdf3344d-cff9-42f3-b6a0-b894a159d85e | e2e-attacker-1790724364984@costpro.local       | 2026-09-29 | last=2026-09-29 | no-ban | m=0
b3e3b066-23b0-4aaf-8622-d1c08c12d1e0 | e2e-attacker-1790725154852@costpro.local       | 2026-09-29 | last=2026-09-29 | no-ban | m=0
43321d7b-71e2-42e7-89eb-964c32583f66 | e2e-attacker-1790732086824@costpro.local       | 2026-09-30 | last=2026-09-30 | no-ban | m=0
edff693e-c14a-4983-958d-e9d2ee27b130 | e2e-attacker-1790732588935@costpro.local       | 2026-09-30 | last=2026-09-30 | no-ban | m=0
3e884cfb-a959-4f38-ab7f-addff0bc6b45 | e2e-attacker-1790733131397@costpro.local       | 2026-09-30 | last=2026-09-30 | no-ban | m=0
929210c4-e2c0-46cc-b749-d4b8acf5d94b | e2e-attacker-1790809327667@costpro.local       | 2026-09-30 | last=2026-09-30 | no-ban | m=0
46f49ab3-489b-4650-9b42-0e3913ffb4cf | e2e-attacker-1790812222097@costpro.local       | 2026-09-30 | last=2026-09-30 | no-ban | m=0
d6644e75-0cd9-49c7-b937-05c3d89306de | e2e-attacker-1790815623291@costpro.local       | 2026-10-01 | last=2026-10-01 | no-ban | m=0
2dd8482d-b527-496c-adc7-c9dc25852e40 | e2e-attacker-1790820102759@costpro.local       | 2026-10-01 | last=2026-10-01 | no-ban | m=0
8da377a3-e683-4e68-bb0b-13a005a7e88c | e2e-attacker-1790820509101@costpro.local       | 2026-10-01 | last=2026-10-01 | no-ban | m=0
21a3a905-4d89-48d2-938a-91f6da5501f7 | e2e-attacker-1790826340391@costpro.local       | 2026-10-01 | last=2026-10-01 | no-ban | m=0
8f6a5ba1-5826-4098-84ca-2fe19784d3a7 | e2e-attacker-1790829803418@costpro.local       | 2026-10-01 | last=2026-10-01 | no-ban | m=0
e89b8d49-87d2-428b-825b-9aea31341cb1 | e2e-attacker-1790830040403@costpro.local       | 2026-10-01 | last=2026-10-01 | no-ban | m=0
a9a30249-d433-4d29-9f5b-82a45c36265e | e2e-attacker-1791070149310@costpro.local       | 2026-10-03 | last=2026-10-03 | no-ban | m=0
6e1c701f-ff7a-4cd4-8d74-1c5243ded39d | e2e-attacker-1791070387834@costpro.local       | 2026-10-03 | last=2026-10-03 | no-ban | m=0
e6c161b8-190f-448b-a7dc-b4525adf418b | e2e-attacker-1791074058927@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
e2f76fa2-69f7-4720-b6a1-c0aa3e048b75 | e2e-attacker-1791074132783@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
6d9024e9-e98b-417b-9fa2-d2a7a5b5d47e | e2e-attacker-1791077337619@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
79764985-0117-4408-8e59-bb33a72aff0d | e2e-attacker-1791082505489@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
95d3134f-7bd0-4991-8317-a1d6e7f91c38 | e2e-attacker-1791084645383@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
5fa9db90-39c4-46a3-b0e8-c9494f50f3ef | e2e-attacker-1791085225981@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
a0e1e251-8a9b-4491-8d0c-72f39fcaa4c4 | e2e-attacker-1791092007337@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
8fe9368f-5fec-44bc-ac9a-7b230806c8a3 | e2e-attacker-1791094868660@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
ce4c9b4a-5342-4ad1-b14b-18aed9a85270 | e2e-attacker-1791095312881@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
0e567c92-0942-48ba-a6c1-ad32c343c1b3 | e2e-attacker-1791121055979@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
fa8fa76f-7387-467e-a9a4-79712889a98e | e2e-attacker-1791121566429@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
a6880276-8653-4e78-bae7-1e7fa107edd5 | e2e-attacker-1791125991466@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
f2b54f84-42c0-427b-9c6a-d1215052bcf8 | e2e-attacker-1791126344862@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
855b9cb6-a4e4-4537-827c-68d1bfc68a22 | e2e-attacker-1791137173742@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
d40a9c9d-6efe-424b-9e41-25e01ce424e3 | e2e-attacker-1791146276825@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
0f33d8a0-26b2-4953-b4a0-bf999e3d78b6 | e2e-attacker-1791146681845@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
a7161f53-bf5a-4c68-99d9-c5c3da295ff5 | e2e-attacker-1791147058368@costpro.local       | 2026-10-04 | last=2026-10-04 | no-ban | m=0
3edbc0be-03de-4c23-a2a6-97665184acf7 | e2e-attacker-1791168805995@costpro.local       | 2026-10-05 | last=2026-10-05 | no-ban | m=0
6901fa2a-42d0-4f3a-b373-879d03133593 | e2e-attacker-1791169138603@costpro.local       | 2026-10-05 | last=2026-10-05 | no-ban | m=0
```

**e2e80-created-*@costpro.test (roles-permissions)** (45):

```text
da234e33-9847-424b-97d7-a6f947cd1962 | e2e80-created-mujdf6ce@costpro.test            | 2026-09-27 | last=2026-09-27 | no-ban | m=0
486ad0e7-aa63-4242-a009-2ca12bcb8d4f | e2e80-created-mujdh6ob@costpro.test            | 2026-09-27 | last=2026-09-27 | no-ban | m=0
8ca8ab43-9556-4d4e-b261-c18415c32c15 | e2e80-created-mujf6c6z@costpro.test            | 2026-09-27 | last=2026-09-27 | no-ban | m=0
1baf9a26-1df8-4afd-9b9e-297f89e51097 | e2e80-created-mujg5kgu@costpro.test            | 2026-09-27 | last=2026-09-27 | no-ban | m=0
a548f681-9674-4808-8d48-329dbfbf89d4 | e2e80-created-mujgmbep@costpro.test            | 2026-09-27 | last=2026-09-27 | no-ban | m=0
95b9552b-abc7-40ec-9852-972dbf2e982f | e2e80-created-mujhaivw@costpro.test            | 2026-09-27 | last=2026-09-27 | no-ban | m=0
58800df6-cbac-4eee-aace-1cccfe52defe | e2e80-created-mulyg0ej@costpro.test            | 2026-09-29 | last=2026-09-29 | no-ban | m=0
30457f76-b456-4355-99d9-d8c49be8ca0b | e2e80-created-mulywd7x@costpro.test            | 2026-09-29 | last=2026-09-29 | no-ban | m=0
4072bf86-3955-4848-a18a-03177c6111ee | e2e80-created-mulz14va@costpro.test            | 2026-09-29 | last=2026-09-29 | no-ban | m=0
4f2f8423-d631-4a93-aa52-a8421a8e1d1e | e2e80-created-mulz25vo@costpro.test            | 2026-09-29 | last=2026-09-29 | no-ban | m=0
57cd1f29-63dc-47b7-805c-be250f3d0e18 | e2e80-created-mulzw9et@costpro.test            | 2026-09-29 | last=2026-09-29 | no-ban | m=0
95ed34a5-91fd-4e0e-9e57-67fb5f36fe04 | e2e80-created-mum25w02@costpro.test            | 2026-09-29 | last=2026-09-29 | no-ban | m=0
d41b78bf-6cef-45db-bb12-081ac40a0949 | e2e80-created-mum3t989@costpro.test            | 2026-09-29 | last=2026-09-29 | no-ban | m=0
952b3b55-5004-48d6-b5f4-6716d91c14b3 | e2e80-created-mum45jcf@costpro.test            | 2026-09-29 | last=2026-09-29 | no-ban | m=0
9868275b-2d85-428e-bdd7-f5bcdb40482a | e2e80-created-mumkr0nv@costpro.test            | 2026-09-29 | last=2026-09-29 | no-ban | m=0
b8b56ab4-719a-49f7-b2a7-81614fc9ef32 | e2e80-created-mumlzdi2@costpro.test            | 2026-09-29 | last=2026-09-29 | no-ban | m=0
02683428-de68-472a-a7f0-b8329f234759 | e2e80-created-mumnwwda@costpro.test            | 2026-09-29 | last=2026-09-29 | no-ban | m=0
bb192e7a-93a8-4ef5-b98f-01b2500fd099 | e2e80-created-mumpicve@costpro.test            | 2026-09-29 | last=2026-09-29 | no-ban | m=0
bd5e754e-107a-4bc1-8f84-990067b786b9 | e2e80-created-mumqtuup@costpro.test            | 2026-09-29 | last=2026-09-29 | no-ban | m=0
e1813195-2725-4fdb-a89b-20d5019cd31f | e2e80-created-munb8wqf@costpro.test            | 2026-09-29 | last=2026-09-29 | no-ban | m=0
933691c0-b07e-402d-a736-dc8d4a2af140 | e2e80-created-munf3q9r@costpro.test            | 2026-09-30 | last=2026-09-30 | no-ban | m=0
fd831014-0e88-4759-958c-5c3456d9502f | e2e80-created-muopahp9@costpro.test            | 2026-09-30 | last=2026-09-30 | no-ban | m=0
ac47a2d9-3f01-4695-8e89-338177bc6a3a | e2e80-created-muor0jua@costpro.test            | 2026-09-30 | last=2026-09-30 | no-ban | m=0
1856ac71-7e64-4e55-b534-d3aaadbc6894 | e2e80-created-muosns8q@costpro.test            | 2026-10-01 | last=2026-10-01 | no-ban | m=0
3ae1c233-c005-4a32-8e5d-5827aab0ecb3 | e2e80-created-muovio18@costpro.test            | 2026-10-01 | last=2026-10-01 | no-ban | m=0
3e6f4d48-1c0e-4cc2-9d39-c3599d884078 | e2e80-created-muovm15j@costpro.test            | 2026-10-01 | last=2026-10-01 | no-ban | m=0
b45e11f5-bf5a-459f-b8e7-1f3ac08716bf | e2e80-created-muovmjox@costpro.test            | 2026-10-01 | last=2026-10-01 | no-ban | m=0
26b7c154-e69f-4e58-b7bb-e8398eae9d59 | e2e80-created-muoz3c7m@costpro.test            | 2026-10-01 | last=2026-10-01 | no-ban | m=0
8fbfc378-e37f-4d04-a3d1-27fa75aaef5e | e2e80-created-mup1ks0w@costpro.test            | 2026-10-01 | last=2026-10-01 | no-ban | m=0
bced7edf-801e-41c8-99dd-9259ec49854c | e2e80-created-mut4ebhx@costpro.test            | 2026-10-04 | last=2026-10-04 | no-ban | m=0
0d955ee2-d884-4030-91a3-cd2deb5e4815 | e2e80-created-mut79jp3@costpro.test            | 2026-10-04 | last=2026-10-04 | no-ban | m=0
1fde5a1f-23af-4b1d-918f-58873cdc8c0d | e2e80-created-mut7mepc@costpro.test            | 2026-10-04 | last=2026-10-04 | no-ban | m=0
108fb0b0-d331-4194-9489-21e76a3f0a4f | e2e80-created-mut96ow2@costpro.test            | 2026-10-04 | last=2026-10-04 | no-ban | m=0
2ad11900-117b-49eb-841b-1a5063767ec9 | e2e80-created-mut9738c@costpro.test            | 2026-10-04 | last=2026-10-04 | no-ban | m=0
50b2f688-6124-47fd-8b51-7bc5eff38950 | e2e80-created-mutd5e7x@costpro.test            | 2026-10-04 | last=2026-10-04 | no-ban | m=0
9ff159e2-e350-4d8a-8557-3255f018c387 | e2e80-created-mutf9itc@costpro.test            | 2026-10-04 | last=2026-10-04 | no-ban | m=0
4ecc8853-53ea-4109-baab-efc6aa467801 | e2e80-created-mutuswb2@costpro.test            | 2026-10-04 | last=2026-10-04 | no-ban | m=0
d02facf7-ad62-48cf-820f-febd96f24de1 | e2e80-created-mutxurqd@costpro.test            | 2026-10-04 | last=2026-10-04 | no-ban | m=0
ffa9cf44-1f76-4121-b606-75e267b06dd7 | e2e80-created-muu4nxvw@costpro.test            | 2026-10-04 | last=2026-10-04 | no-ban | m=0
cdb37b51-4d1e-4a37-acce-11326e6d9de5 | e2e80-created-muu9xlsh@costpro.test            | 2026-10-04 | last=2026-10-04 | no-ban | m=0
998a4a5a-2a8c-46a0-936c-625558c1dda7 | e2e80-created-muun1par@costpro.test            | 2026-10-05 | last=2026-10-05 | no-ban | m=0
3d5ebe10-f454-4bf2-8dc9-dec27b170849 | e2e80-created-muun6nhr@costpro.test            | 2026-10-05 | last=— | no-ban | m=0
5e3e35c2-e4e6-4eb8-aece-ff3882187eea | e2e80-created-muun8k3f@costpro.test            | 2026-10-05 | last=2026-10-05 | no-ban | m=0
36a38f43-3f58-4949-8800-36d300257162 | e2e80-created-muunagx6@costpro.test            | 2026-10-05 | last=2026-10-05 | no-ban | m=0
e28d74c8-56cb-43e2-b864-a711134fad4d | e2e80-created-muunc97t@costpro.test            | 2026-10-05 | last=2026-10-05 | no-ban | m=0
```

**e2e-<run>-adm/usr/wh/enc@costpro.test (run aislado)** (184):

```text
4a7865ff-b521-485b-9cc4-56323c50792d | e2e-run-smoke-ab01-admin@e2e-run.costpro.test  | 2026-10-04 | last=— | no-ban | m=0
6838aa4d-44af-4f23-9dd8-c283f8f89da2 | e2e-run-smoke-ab02-admin@e2e-run.costpro.test  | 2026-10-04 | last=— | no-ban | m=0
98841cfa-589b-4b0e-a126-8baa992cc338 | e2e-run-smoke-ab03-admin@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
d8dd464a-3652-4af3-8c6c-a021c3e71776 | e2e-run-smoke-ab03-clerk@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
20ef1adc-537a-4468-967d-fff968bad94e | e2e-run-smoke-ab04-admin@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | no-ban | m=0
cb782c84-060e-4695-b16c-a5bf9ff18ce6 | e2e-run-smoke-ab04-clerk@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | no-ban | m=0
ff513b0f-5494-4dcd-aebc-095f3b6bed87 | e2e-run-smoke-ab05-admin@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=1
ecd9d1dc-8d4a-4274-9f8a-5840a7b12451 | e2e-run-smoke-ab05-clerk@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
869a4c38-caec-4a04-893b-ded48d552851 | e2e-run-smoke-ab05b-admin@e2e-run.costpro.test | 2026-10-04 | last=2026-10-04 | BANNED | m=0
be6abc0a-2559-407a-9c88-e5b21fff7e16 | e2e-run-smoke-ab05b-clerk@e2e-run.costpro.test | 2026-10-04 | last=2026-10-04 | BANNED | m=0
c3370e24-223d-4b79-b82c-9de4b59f7f76 | e2e-run-smoke-ab06-admin@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
b9f344c7-2af7-4de0-9593-bbd486868599 | e2e-run-smoke-ab06-clerk@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
2833c47c-d6fa-4e2c-a08b-cbd10c18105d | e2e-run-smoke-fl07-admin@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
a90c9e0c-d68f-460e-ba33-99294d57cb6f | e2e-run-smoke-fl07-clerk@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
421d0080-9581-4764-918d-880089266ba6 | e2e-run-smoke-fl08-admin@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
15b2546c-3378-45ed-95ab-2778243ec122 | e2e-run-smoke-fl08-clerk@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
d86a877b-7d49-4666-90d1-22419888031f | e2e-run-smoke-tt09-admin@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
4a6ad067-6d22-4efc-a490-a4a7da2a3408 | e2e-run-smoke-tt09-clerk@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
3e12b122-12f5-4759-9aa4-98ec3d265884 | e2e-run-conc-bb02-admin@e2e-run.costpro.test   | 2026-10-04 | last=2026-10-04 | BANNED | m=0
70f84697-8b93-47ff-93ee-f01fbf6a0a25 | e2e-run-conc-aa01-admin@e2e-run.costpro.test   | 2026-10-04 | last=2026-10-04 | BANNED | m=0
8266ae65-2afe-46dd-a4e4-04699df8e808 | e2e-run-conc-bb02-clerk@e2e-run.costpro.test   | 2026-10-04 | last=2026-10-04 | BANNED | m=0
81516628-3c30-45fd-ad61-4fd9c51ec372 | e2e-run-conc-aa01-clerk@e2e-run.costpro.test   | 2026-10-04 | last=2026-10-04 | BANNED | m=0
07976b2a-2d9d-4c99-ad15-d6f6379c6749 | e2e-run-clean-aa03-admin@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
a51c27c9-2db6-46f1-a0e1-f2d733398449 | e2e-run-clean-aa03-clerk@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
412c89c2-520e-47ac-8eda-c6f1173a4634 | e2e-run-clean-aa05-admin@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
8533acd9-b5a8-41ac-bd32-df053acea606 | e2e-run-clean-aa05-clerk@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
2d3cf415-f0a0-48db-898b-5d0f09ec3b13 | e2e-run-clean-aa07-admin@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
7952d23b-f665-435b-a058-aefa4764b1a8 | e2e-run-clean-aa07-clerk@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
299a43de-e5bf-4367-9a1e-ae84363fc4de | e2e-run-clean-bb06-admin@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
c2b86bbe-1a5c-4276-a23f-b327d6510e8e | e2e-run-clean-bb06-clerk@e2e-run.costpro.test  | 2026-10-04 | last=2026-10-04 | BANNED | m=0
3152e7ef-501b-4902-a1dd-67389351d816 | e2e-run-full-su01-admin@e2e-run.costpro.test   | 2026-10-04 | last=2026-10-04 | no-ban | m=0
828fdf3b-9810-424e-a1dc-5cb78985464e | e2e-run-full-su01-clerk@e2e-run.costpro.test   | 2026-10-04 | last=2026-10-04 | no-ban | m=0
f6ce4721-9c38-4ea7-96c5-5be3e5064785 | e2e-e2e202610044fdd8a-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
7647d0e4-d764-4f5b-9ef6-e89db8203a0c | e2e-e2e202610044fdd8a-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
9128c268-4ad2-4ccf-9567-6aff39405446 | e2e-e2e202610044fdd8a-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
395a4d98-dc56-4488-b3e1-caf8bfd63c06 | e2e-e2e202610044fdd8a-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
d2b72db1-6c27-4cd1-a625-b16d0dfc143d | e2e-e2e20261004888b89-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
5ea2a8c1-6196-4485-9102-b9914f3c3a0d | e2e-e2e20261004888b89-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
660ed37a-60d0-4305-8206-0ac565e534dc | e2e-e2e20261004888b89-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
612b00bf-0f20-4f50-9893-75f93b4aa034 | e2e-e2e20261004888b89-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
a9a3a7a8-61aa-4c09-8e01-4ce7c37416a1 | e2e-e2e20261004a7e782-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=1
ec93a755-0e0b-43a0-bfa2-1aa318a61ded | e2e-e2e20261004b3d261-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=1
aaface10-0d2b-4cfd-89af-a04424a4f392 | e2e-e2e20261004a7e782-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
1aec2de4-6dcf-4e3b-9d50-8e3af32ed3a1 | e2e-e2e20261004b3d261-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
53bd37fa-d981-4708-ad6e-2338c1b55af4 | e2e-e2e20261004a7e782-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
da7182a5-66a3-4ae4-8f3c-863207d26110 | e2e-e2e20261004b3d261-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
2b2a85bb-152b-4104-bac0-412c3e6d09dd | e2e-e2e20261004a7e782-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
0138a073-6cd1-49b2-b7e6-f093392bee6e | e2e-e2e20261004b3d261-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
4d1a9620-928c-426f-bd8f-4b199ae1ce27 | e2e-e2e202610049ce289-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=1
cbe5c477-d7b1-4bae-a189-883eaf332f43 | e2e-e2e20261004feedcb-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=1
15f855a6-cd01-4ada-90fd-377f8b35af73 | e2e-e2e202610049ce289-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
9c21dbc5-f2e6-4cd8-ae85-73a874922f29 | e2e-e2e202610049ce289-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
30d4b981-ead7-480d-869b-38edb385891b | e2e-e2e20261004feedcb-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
3e915234-90d5-4410-b730-042b86ffa4dc | e2e-e2e202610049ce289-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
f4b8657d-7e01-49f2-8d56-396ff146998d | e2e-e2e20261004feedcb-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
bab80f77-01e9-42a9-bec4-a0d5282566be | e2e-e2e20261004feedcb-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
8c967f49-a35c-44f8-b27d-102268e6cbf4 | e2e-e2e20261004f8f383-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
35ef4e97-5e65-478e-96e5-b8d2dd3832f5 | e2e-e2e20261004f8f383-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
99bd1d28-09d6-4002-b348-b9bce393be9f | e2e-e2e20261004f8f383-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
0f1e9244-651d-464f-8223-e1393bb5fb34 | e2e-e2e20261004f8f383-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
4083f895-dc29-4873-80b1-40dbefe0191c | e2e-e2e20261004a1ada4-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
a6036879-388b-4ce4-a0ef-e63a32aea143 | e2e-e2e20261004a1ada4-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
58848eeb-e610-4543-824d-01c3f9f8bc25 | e2e-e2e20261004a1ada4-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
204d1ca9-058f-4082-bc4b-fdc5e5c4b2e7 | e2e-e2e20261004a1ada4-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
3dc10c79-d645-4123-af1a-5dec933cf114 | e2e-e2e202610045cfbd5-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
78358b25-1a70-47e7-b684-6e900bd0b5f7 | e2e-e2e202610045cfbd5-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
39205544-cecb-434d-905b-3715f86cfcb5 | e2e-e2e202610045cfbd5-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
3947e26c-f0f6-4c48-b07e-af2589bee1b4 | e2e-e2e202610045cfbd5-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
e3e6e606-5e55-4981-933e-163c3b3ee304 | e2e-e2e20261004f4f183-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=50
bf5e773d-4b52-4d7d-bce1-856185d662bb | e2e-e2e20261004f4f183-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
1e71cd4b-4811-4e05-bf0d-473c09bd8ff6 | e2e-e2e20261004f4f183-wh@costpro.test          | 2026-10-04 | last=2026-10-04 | BANNED | m=0
4760662c-c323-4a8f-83c9-7ff771834c7a | e2e-e2e20261004f4f183-enc@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
02942aa9-b659-43a7-958a-12080a6e8bef | e2e-e2e2026100454a1ab-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=2
64f835a2-5552-4549-93ab-9fdbf50e9ff3 | e2e-e2e2026100454a1ab-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
758c2f0e-2eee-450f-acf7-ae2856b24312 | e2e-e2e2026100454a1ab-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
872506b0-cf82-484f-8e6f-99f107136de4 | e2e-e2e2026100454a1ab-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
a55c8388-0184-4bb8-8821-254e82d18cd1 | e2e-e2e202610041ec90b-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
5e2b8734-5e1c-4e55-b5f2-b7f140a6392e | e2e-e2e202610041ec90b-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
f920954e-aa93-42c4-b3c8-d69880a38dbf | e2e-e2e202610041ec90b-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
428edbf5-cea7-4eac-bf11-a48b0cb84df0 | e2e-e2e202610041ec90b-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
1e001d59-3c0d-49f9-835d-759417449803 | e2e-e2e20261004225f77-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | no-ban | m=49
957656b5-d91f-443f-9cc4-b7e5fe5ad913 | e2e-e2e20261004225f77-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | no-ban | m=1
8bf58734-0464-4ebc-93ab-15c93ec24685 | e2e-e2e20261004225f77-wh@costpro.test          | 2026-10-04 | last=2026-10-04 | no-ban | m=0
2835b6cb-efb9-4984-be76-19517c3f1140 | e2e-e2e20261004225f77-enc@costpro.test         | 2026-10-04 | last=2026-10-04 | no-ban | m=0
b9cd8d25-e53d-48ac-ada1-c7a36aba3cd1 | e2e-e2e202610046b1c25-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=48
29bbdcf9-e921-41ca-acc2-5a20e5446137 | e2e-e2e202610046b1c25-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
c4bf1b86-99fd-4be1-bd2c-149dc5bab092 | e2e-e2e202610046b1c25-wh@costpro.test          | 2026-10-04 | last=2026-10-04 | BANNED | m=0
bdf58097-1981-4135-b0e5-f7a357947a17 | e2e-e2e202610046b1c25-enc@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
6eed6072-4079-46f0-8c5f-fe752fff84ce | e2e-e2e202610040f6f71-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | no-ban | m=48
53461dde-05e0-4a6b-9b5f-2ac98b03f3cb | e2e-e2e202610040f6f71-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | no-ban | m=1
13e2e7ea-0afb-488b-8aa7-25569ad3a9d2 | e2e-e2e202610040f6f71-wh@costpro.test          | 2026-10-04 | last=2026-10-04 | no-ban | m=0
b08f06a5-b615-45b1-bce2-50705e4e88b8 | e2e-e2e202610040f6f71-enc@costpro.test         | 2026-10-04 | last=2026-10-04 | no-ban | m=0
ccacb0c1-f55b-431c-89a2-348553619c9a | e2e-e2e202610044f0978-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=60
9d971ff8-8ca1-467d-91c6-1e5be6b3f9e0 | e2e-e2e202610044f0978-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
44d713a5-7d5a-4b63-8fd4-21946862464a | e2e-e2e202610044f0978-wh@costpro.test          | 2026-10-04 | last=2026-10-04 | BANNED | m=0
b0ac5668-d210-4793-8a39-5af52112980c | e2e-e2e202610044f0978-enc@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
4fc068c9-81b5-44a1-9f82-db2b2cf87294 | e2e-e2e20261004b3fba5-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
96a31848-d31e-44c8-91c7-2532d4d77e7c | e2e-e2e20261004b3fba5-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
4f51629d-3c75-4131-bdf4-d6c4c50bf08c | e2e-e2e20261004b3fba5-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
2da217fc-2490-448b-8cab-17f60b060304 | e2e-e2e20261004b3fba5-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
1ea26af5-fb3f-4281-9cd7-d80fe6c82db5 | e2e-e2e202610047cae71-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
0b753e64-8bd1-4b80-99ec-84a3e0e29ff9 | e2e-e2e202610047cae71-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
e013b633-f6f3-4b73-9702-3f1775f56e88 | e2e-e2e202610047cae71-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
75b02222-0489-4cf9-a605-6935c235c8e7 | e2e-e2e202610047cae71-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
7ec36874-9515-4abd-9b60-cee7b055c112 | e2e-e2e202610046f651b-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
d3438380-04ed-4745-a6d9-58d788c5a973 | e2e-e2e202610046f651b-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
bb3944a3-a8f8-4142-b162-080319c67212 | e2e-e2e202610046f651b-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
9f91ae4f-49f5-47be-9632-3288d219fcca | e2e-e2e202610046f651b-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
1c6fa50a-3494-4862-bb62-addb57c17005 | e2e-e2e20261004361c56-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
81dff5ac-5962-4fea-a4d5-f3ff5ba338d7 | e2e-e2e20261004361c56-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
47ec6e5a-c741-440d-adb1-fd1d77c35db9 | e2e-e2e20261004361c56-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
e571917e-3eaf-4a5e-ab47-81a91aa42f98 | e2e-e2e20261004361c56-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
de68fca6-839d-44ac-a099-a4164d797f4a | e2e-e2e20261004696e13-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
f4cbced1-ace5-4530-8943-84f6141b2195 | e2e-e2e20261004696e13-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
d7563f49-e11e-4018-8f3e-fc5460d897fc | e2e-e2e20261004696e13-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
6032c043-fc8f-4e25-a484-afbdd09b460b | e2e-e2e20261004696e13-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
6a4e1445-823b-4b8e-930f-7be72517d230 | e2e-e2e20261004d4e310-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=1
eaad4471-07e0-4106-a79d-a9f529fae9ea | e2e-e2e20261004d4e310-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
175fa9f4-b5b6-40ed-9499-effb3da9481e | e2e-e2e20261004d4e310-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
3903b458-9546-43b9-a64d-ab948813a1be | e2e-e2e20261004d4e310-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
ee3c53a8-0d54-4ac0-bae1-c2843b66206a | e2e-e2e202610040a32fe-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
d656c9e2-8d6f-4964-9242-3ccb705b2f2b | e2e-e2e202610040a32fe-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
176e7c93-d25b-459d-8da2-f11530e5b0c4 | e2e-e2e202610040a32fe-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
3206e779-ba46-446f-bcd9-2f8d1d42717e | e2e-e2e202610040a32fe-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
a06e6f3a-7a97-4bc2-aada-b252d0adeb55 | e2e-e2e20261004e6ae59-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=2
c2ad450e-ed53-4906-bfd3-b272fedae2b1 | e2e-e2e20261004e6ae59-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
103ee68e-ed3a-4446-b0ec-2fdeddc3d579 | e2e-e2e20261004e6ae59-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
ca5990c8-93b1-47e5-8d29-66ef0444c1f4 | e2e-e2e20261004e6ae59-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
4173557a-c6fe-406d-8081-2ae50ce98a59 | e2e-e2e20261004aa8bd0-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=1
97e4aecd-8bbf-493e-9ccf-081a4f5c436a | e2e-e2e20261004aa8bd0-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
19b7b94c-773f-4277-b556-61373476853f | e2e-e2e20261004aa8bd0-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
fa616d47-059e-4ab0-b551-46591e557c4f | e2e-e2e20261004aa8bd0-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
969540fa-5839-4205-9854-c337a4cd4c40 | e2e-e2e202610048abd6f-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=2
d122ffae-ff5c-4de4-bf8d-e663689d16bb | e2e-e2e202610048abd6f-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
b6804fa6-9062-4315-bd18-5bf3b13c8e22 | e2e-e2e202610048abd6f-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
b3dc7f5c-5cac-40fb-a22f-6cdb04e99a85 | e2e-e2e202610048abd6f-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
55cb15b9-971f-4fbb-be24-8102c810d4ae | e2e-e2e202610049dfa94-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=50
1c1362c9-ae82-4eff-8220-26fddc3faf57 | e2e-e2e202610049dfa94-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
98d54adc-1e5a-4397-840c-acfb737ca936 | e2e-e2e202610049dfa94-wh@costpro.test          | 2026-10-04 | last=2026-10-04 | BANNED | m=0
0845e203-902e-4dcc-a355-6d95a8018c01 | e2e-e2e202610049dfa94-enc@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
d41a9471-3ddf-4087-b748-f10c7224206e | e2e-e2e20261004ab992b-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | no-ban | m=46
3c499a43-460b-4d41-bc20-a1f1fdcd4a83 | e2e-e2e20261004ab992b-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | no-ban | m=1
5ef44358-a448-4194-acde-eee7cb07529a | e2e-e2e20261004ab992b-wh@costpro.test          | 2026-10-04 | last=2026-10-04 | no-ban | m=0
14817ebc-d79e-43b5-ba44-9637dfd25b91 | e2e-e2e20261004ab992b-enc@costpro.test         | 2026-10-04 | last=2026-10-04 | no-ban | m=0
cfe903c3-344b-4b59-882c-95123185b1de | e2e-e2e20261004720eed-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=50
5c8748f3-29d8-48ad-8275-1e663883b104 | e2e-e2e20261004720eed-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
3ec53e55-98c0-4987-b6dd-d34c7d6f802b | e2e-e2e20261004720eed-wh@costpro.test          | 2026-10-04 | last=2026-10-04 | BANNED | m=0
4d8a7688-3f9a-46f9-8f23-35b056a7f7b1 | e2e-e2e20261004720eed-enc@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
c5777b0a-3512-4431-83e9-e8386a53faa6 | e2e-e2e202610049f9c4d-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
e22d862e-6c41-4c78-9b51-e4ffa9801a7e | e2e-e2e202610049f9c4d-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
5bef9a13-eb70-4249-97b8-30b18de4819f | e2e-e2e202610049f9c4d-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
2926acba-b5ca-4164-94ff-e9cb22106220 | e2e-e2e202610049f9c4d-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
a6612454-8b51-45e2-98bd-0aaeeae5d3e5 | e2e-e2e20261004719b7c-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=8
28f63984-37d1-4447-88ac-b000fd1b9a2e | e2e-e2e20261004719b7c-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
c7c2c156-e4a2-42ac-81a0-b01e928fb07a | e2e-e2e20261004719b7c-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
5d397d71-a906-4ebf-a673-90160ac079ce | e2e-e2e20261004719b7c-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
2f1b0eac-eec6-4873-9dc7-13bf9cf31694 | e2e-e2e20261004a7e32b-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
1ec77fcb-2991-4049-b8cb-530faa5c8a04 | e2e-e2e20261004a7e32b-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
3736652d-2085-40ef-b7b5-e50bc3a26eab | e2e-e2e20261004a7e32b-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
1dd195f3-be92-4871-a9bc-426aadf15b56 | e2e-e2e20261004a7e32b-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
e9762a69-087e-48a6-bbff-c1ff0dfa492c | e2e-e2e2026100404fa0a-adm@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
664ad7ba-705d-4b47-aaca-faba0949f606 | e2e-e2e2026100404fa0a-usr@costpro.test         | 2026-10-04 | last=2026-10-04 | BANNED | m=0
33fde656-0134-4668-8c6b-25c49e7153c2 | e2e-e2e2026100404fa0a-wh@costpro.test          | 2026-10-04 | last=— | BANNED | m=0
a99d1e9a-2779-4b19-92d5-210160bcce6e | e2e-e2e2026100404fa0a-enc@costpro.test         | 2026-10-04 | last=— | BANNED | m=0
db2ca147-e8b1-4806-a0d9-b5e552dc2424 | e2e-e2e20261005fbd7dc-adm@costpro.test         | 2026-10-05 | last=2026-10-05 | no-ban | m=43
eb051bf0-8a89-4440-abbc-5b7e88b4bd47 | e2e-e2e20261005fbd7dc-usr@costpro.test         | 2026-10-05 | last=2026-10-05 | no-ban | m=1
6cac47cc-b5c3-4ad2-b8fd-518f4720b44c | e2e-e2e20261005fbd7dc-wh@costpro.test          | 2026-10-05 | last=2026-10-05 | no-ban | m=0
8c1374c2-ace5-4c6d-b212-d5eb09f39f78 | e2e-e2e20261005fbd7dc-enc@costpro.test         | 2026-10-05 | last=2026-10-05 | no-ban | m=0
431ebdbb-9205-434b-ba1f-51c182d9ac5c | e2e-e2e202610055c592c-adm@costpro.test         | 2026-10-05 | last=2026-10-05 | no-ban | m=38
4f6eabf1-1c96-4c6f-a928-4a6af414ca7f | e2e-e2e202610055c592c-usr@costpro.test         | 2026-10-05 | last=2026-10-05 | no-ban | m=1
28938ded-41f0-42bc-be01-19eb0d120cfb | e2e-e2e202610055c592c-wh@costpro.test          | 2026-10-05 | last=2026-10-05 | no-ban | m=0
0f6e0783-6960-42bd-b303-96c4ce339fe1 | e2e-e2e202610055c592c-enc@costpro.test         | 2026-10-05 | last=2026-10-05 | no-ban | m=0
7ceb3c67-4166-441c-978b-2123e6ef4355 | e2e-e2e20261005e6282b-adm@costpro.test         | 2026-10-05 | last=2026-10-05 | no-ban | m=51
1b6db8c0-bc0b-44c6-a52f-7ee0e5bc0fa0 | e2e-e2e20261005e6282b-usr@costpro.test         | 2026-10-05 | last=2026-10-05 | no-ban | m=1
52f1e84a-14de-4d28-bac5-3692c807c291 | e2e-e2e20261005e6282b-wh@costpro.test          | 2026-10-05 | last=2026-10-05 | no-ban | m=0
3e459a10-fe27-4125-8dc5-9553d167d079 | e2e-e2e20261005e6282b-enc@costpro.test         | 2026-10-05 | last=2026-10-05 | no-ban | m=0
44ccf01f-571e-4876-81a1-2a16e77baf6f | e2e-e2e20261005b459e6-adm@costpro.test         | 2026-10-05 | last=2026-10-05 | no-ban | m=44
05e3548d-512d-486b-8a9e-6589029bb75a | e2e-e2e20261005b459e6-usr@costpro.test         | 2026-10-05 | last=2026-10-05 | no-ban | m=1
77d04768-5473-4cdb-87c3-c87651794930 | e2e-e2e20261005b459e6-wh@costpro.test          | 2026-10-05 | last=2026-10-05 | no-ban | m=0
30c9e528-2561-488c-ad73-6353d1fd94a1 | e2e-e2e20261005b459e6-enc@costpro.test         | 2026-10-05 | last=2026-10-05 | no-ban | m=0
06adaa24-e5f2-486f-92a3-945086e3c409 | e2e-e2e20261005b7a9d4-adm@costpro.test         | 2026-10-05 | last=2026-10-05 | no-ban | m=26
d7a8be17-62be-4b4b-aecb-10a17e913fcf | e2e-e2e20261005b7a9d4-usr@costpro.test         | 2026-10-05 | last=2026-10-05 | no-ban | m=1
1965b333-6bcd-4091-ad9c-e8670e48e990 | e2e-e2e20261005b7a9d4-wh@costpro.test          | 2026-10-05 | last=— | no-ban | m=0
1814114c-9c2b-4295-bb92-31d2e61dcc97 | e2e-e2e20261005b7a9d4-enc@costpro.test         | 2026-10-05 | last=— | no-ban | m=0
```

**qa-costpro-pwdadmin-*** (1):

```text
9b7b2d08-d412-4375-a2e8-2fb47feacde1 | qa-costpro-pwdadmin-1791082462003@qa-test.loca | 2026-10-04 | last=2026-10-04 | BANNED | m=0
```


## Dependencias relevantes (FASE 6 — resumen)

* **69 FKs referencian `stores`**: la mayoría CASCADE (productos, inventario,
  transacciones, memberships, whatsapp/telegram, etc.).
* **12 FKs NO ACTION que bloquean el DELETE directo** y requieren pre-limpieza
  por store_id: `audit_logs`, `cash_closures`, `cash_register_sessions`,
  `cost_sheet_templates`, `inventory_adjustments`, `inventory_batches`,
  `purchase_orders`, `receipts`, `report_definitions`, `report_runs`,
  `sync_log`, `transfers` (origin y destination).
* **Cadenas hijas**: `receipt_items`→receipts (NO ACTION),
  `cash_movements`→cash_register_sessions (NO ACTION),
  `z_reports`→cash_closures (RESTRICT),
  `payment_transactions`→transactions (RESTRICT),
  `receipts`→receipts (self NO ACTION), `transactions`→transactions
  (self NO ACTION).
* `profiles.active_store_id` → stores (SET NULL, automático);
  `profiles.store_id` → stores (NO ACTION → poner a NULL antes de borrar).
* `profiles` → auth.users (2 FKs, NO ACTION): el borrado de identidad Auth
  exige eliminar primero el profile del usuario C.
* Ninguna otra tabla `public` tiene FK hacia `auth.users`; las tablas
  user-scoped (preferences, usage, audit, invitations, pick3_*) se limpian
  por user_id sin bloqueo de FK.
