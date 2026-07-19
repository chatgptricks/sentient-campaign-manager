# Handover para Gemini — Sentient Promotion Manager

Fecha: 2026-07-19  
Repo local: `/Users/tbnalfaro/Documents/Codex/2026-07-18/he/outputs/sentient-campaign-manager`  
GitHub: `chatgptricks/sentient-campaign-manager`  
Producción: `https://chatgptricks.github.io/sentient-campaign-manager/`  
Supabase project ref: `tylfdcnzxdqkqnneohol`

## Objetivo del proyecto

Terminar el CRM/Promotion Manager interno de Sentient para operar promociones desde intake hasta publicación, verificación e invoice/sales tracking.

La app debe quedar usable, gris/iOS, con acento amarillo neon, priorizando operación y claridad sobre estilo decorativo.

## Estado actual corto

La app ya existe, corre con Vite + React + Supabase, está en GitHub y tiene GitHub Pages configurado. Producción responde `HTTP 200`.

El último deploy funcional exitoso fue:

- `e7c0838` — `Keep new clients selectable during promotion intake`

El `HEAD` local/remoto actual al momento del handover es:

- `94046cd` — `Wait for resource validation in e2e`

Los commits posteriores a `e7c0838` son ajustes de tests E2E, no cambios funcionales de UI/backend para usuarios.

## Cambios importantes ya hechos

### Naming y producto

La UI visible debe decir siempre `Promotion(s)`, no `Campaign(s)`.

Ya se cambió:

- Sidebar: `Promotions`
- Product name visible: `Promotion Manager`
- Create flow: `Create promotion`, `Promotion name`, `Promotion type`
- Dashboard, calendar, clients, finance/sales, channels y auth copy

No cambiar sin cuidado:

- Ruta `/campaigns`
- Repo/base path `sentient-campaign-manager`
- DB/internal names como `campaign_metadata`, `campaignType`

Esos son técnicos y cambiarlos puede romper rutas, GitHub Pages o migraciones.

### Record publication

El usuario pidió quitar el campo:

- `Approved artifact`
- Mensaje `Choose the approved artifact.`

Estado actual:

- El campo ya no se muestra.
- El frontend usa automáticamente el primer recurso no archivado disponible como `artifactResourceLinkId`.
- El backend todavía exige un artefacto aprobado, lo cual está bien para preservar historial/auditoría.

Archivo relevante:

- `src/features/promotions/ActionForms.tsx`

### Usuarios y roles

La lógica de roles definida por el usuario quedó simplificada a:

1. `ADMINISTRATOR`
2. `SALES`
3. `CREATOR`

Reglas de negocio esperadas:

- Administrator puede editar usuarios, promociones y casi todo.
- Sales puede crear promociones, delegar tareas al creator, editar sus propias promociones y hacer acciones operativas similares al Creator.
- Creator puede tomar la promoción desde creative, marcar en espera de aprobación, aprobar, publicar y continuar el flujo.
- Approver, Publisher y Finance fueron eliminados del flujo de negocio visible.
- Finance se fusionó conceptualmente en Sales.

Archivos/migraciones relevantes:

- `supabase/migrations/20260718001800_collapse_workflow_to_creator.sql`
- `supabase/migrations/20260718002000_fix_three_role_runtime_gaps.sql`
- `src/domain/permissions.ts`
- `src/features/administration/AdministrationPage.tsx`

### Channels

`Publishing Accounts` debe llamarse `Channels`.

Canales permitidos:

- Instagram
- X
- LinkedIn

Archivos relevantes:

- `src/domain/channels.ts`
- `src/features/publishing-accounts/PublishingAccountsPage.tsx`
- `src/features/promotions/CreatePromotionPage.tsx`

### Calendario

La app tiene Calendar con tabs/vistas.

Requisitos del usuario:

- Un solo calendario con vistas en tabs.
- Vista para posting/planning.
- Vista restringida para sales/finance milestones cuando aplique.
- Click derecho custom en fechas para acciones contextuales.
- Vista semanal debe poder avanzar y devolverse entre semanas.
- No mostrar calendario en Overview porque ya tiene tab propio.
- Evitar saltos visuales entre tabs: posiciones, márgenes, paddings, tamaños de fuente y espaciado no deben cambiar de forma “jumpy”.

Archivos relevantes:

- `src/features/calendar/CalendarPage.tsx`
- `src/components/calendar/CalendarPanel.tsx`
- `src/components/calendar/CalendarPanel.test.tsx`

### Right-click/context menus

El usuario quiere click derecho potente en toda la app.

Estado actual:

- Calendario tiene context menu para fechas.
- Promotions table tiene context menu para abrir/copiar/borrar promoción.
- Users table debía tener eliminar usuario por click derecho; revisar si está 100% funcional.

Pendiente probable:

- Verificar manualmente click derecho en:
  - Promotions list
  - Promotion detail sections
  - Users & roles
  - Clients
  - Channels
  - Calendar dates
- Agregar acciones útiles, pero no sobrecargar con confirmaciones obvias.

Componentes relevantes:

- `src/components/ui/ContextMenu.tsx`
- `src/features/promotions/PromotionTable.tsx`
- `src/features/administration/AdministrationPage.tsx`

## Estado de producción y CI

### Producción

Producción responde:

```bash
curl -I -L --max-time 20 https://chatgptricks.github.io/sentient-campaign-manager/
```

Resultado esperado:

```text
HTTP/2 200
```

### Último deploy exitoso

Deploy production successful:

- Run: `29677094485`
- Commit: `e7c0838`
- Backend Supabase: success
- GitHub Pages: success

### Últimos problemas de deploy

Varios deploys fallaron en `Deploy Edge Functions` por rate limit externo de Docker/ECR:

```text
docker: toomanyrequests: Rate exceeded
failed to bundle function: exit 125
Unable to find image 'public.ecr.aws/supabase/edge-runtime:v1.74.2' locally
```

Esto no es error del código. Es rate limit al bajar `public.ecr.aws/supabase/edge-runtime:v1.74.2`.

Acción recomendada:

```bash
gh run rerun <RUN_ID> --repo chatgptricks/sentient-campaign-manager --failed
```

Si sigue fallando, esperar unos minutos y reintentar. Alternativa futura: ajustar workflow para cache/pull menos agresivo de Edge runtime si Supabase CLI lo permite.

## Problema abierto más importante: E2E real-backend

El CI pasa:

- format
- lint
- typecheck
- unit tests
- local Supabase start
- db reset
- database tests
- Edge Function tests
- build

Pero el E2E real-backend todavía falla en:

```text
e2e/real-backend-lifecycle.spec.ts
Resource validation did not complete for E2E creative v1.
```

Contexto:

- El test crea una promoción real local.
- Adjunta un recurso.
- Procesa outbox desde Administration > Operations.
- Espera que el recurso pase a `VALID`.
- El recurso no llega a `VALID` dentro del loop.

Archivos relevantes:

- `e2e/real-backend-lifecycle.spec.ts`
- `supabase/functions/validate-resource`
- `supabase/functions/_shared/outbox.ts`
- `src/features/administration/AdministrationPage.tsx`
- `src/features/promotions/PromotionDetailPage.tsx`

Cambios recientes ya hechos al E2E:

- Cambiar labels viejos de `Campaign` a `Promotion`.
- Quitar selección de `Approved artifact` porque el campo ya no existe.
- Resolver strict mode de toasts con `.last()`.
- Aumentar intentos/timing para resource validation.

Hipótesis que Gemini debe verificar:

1. El outbox worker procesa eventos pero el `validate-resource` no corre o no actualiza estado.
2. El recurso `Provider = OTHER` + URL `https://example.com/e2e-real-v1` puede estar quedando como `PENDING`, `FAILED` o no visible por permisos.
3. El test está buscando texto `VALID` en una card equivocada o antes de que la query cache refresque.
4. El worker puede dejar registros en failed delivery jobs y el test no está inspeccionando esa sección.
5. La validación SSRF/HEAD a `example.com` puede variar en CI.

Recomendación concreta:

- Descargar Playwright report del run fallido y mirar capturas/traces:

```bash
report_dir=$(mktemp -d /tmp/scm-playwright-report-XXXXXX)
gh run download 29677343979 \
  --repo chatgptricks/sentient-campaign-manager \
  --name playwright-report-29677343979 \
  --dir "$report_dir"
find "$report_dir" -maxdepth 3 -type f
```

- Ver qué estado muestra el resource card.
- Revisar failed delivery jobs en Administration > Operations durante el test.
- Si la validación real externa es flaky, usar una URL controlada/local o ajustar el test para aceptar el estado correcto según el diseño.

## Tareas pendientes para quedar 100%

### P0 — Release/CI

1. Arreglar `e2e/real-backend-lifecycle.spec.ts` hasta que pase.
2. Reintentar deploy si falla por Docker/ECR rate limit.
3. Confirmar que el último `HEAD` queda deployado, no solo el último commit funcional.
4. Correr:

```bash
npm run verify
gh run list --repo chatgptricks/sentient-campaign-manager --branch main --limit 8
curl -I -L --max-time 20 https://chatgptricks.github.io/sentient-campaign-manager/
```

Definition of Done P0:

- CI en verde.
- Deploy production en verde.
- GitHub Pages responde `HTTP 200`.
- `git status --short --branch` limpio.

### P0 — Validar creación real de promociones

Flujo que debe funcionar manualmente en producción/local:

1. Login con Sales.
2. Crear client desde el modal de `Create promotion`.
3. Confirmar que el nuevo client queda seleccionado.
4. Crear promoción.
5. Asignar creator.
6. Creator empieza creative.
7. Adjuntar resource.
8. Marcar ready for approval.
9. Creator aprueba.
10. Start publishing.
11. Record publication sin pedir approved artifact.
12. Request verification.
13. Verify publication.
14. Complete verification.
15. Register invoice / sales item.

### P1 — UX/copy audit

El usuario rechaza textos explicativos obvios o condescendientes.

Eliminar o compactar textos tipo:

- “Read this as…”
- “How many promotions are…”
- “Manual adapters, honestly labeled”
- Cualquier ayuda obvia que parezca tutorial para usuario experto.

Prioridad: operación clara, menos explicación.

Revisar:

- `src/features/dashboard/DashboardPage.tsx`
- `src/features/auth/LoginPage.tsx`
- `src/features/calendar/CalendarPage.tsx`
- `src/features/promotions/ActionForms.tsx`
- `src/features/promotions/PromotionDetailPage.tsx`

### P1 — Right-click fuerte en toda la app

Agregar/verificar context menus:

- Users: open/edit/delete/reset password/copy email/copy user id.
- Promotions: open/edit/delete/copy id/copy summary/change status if allowed.
- Clients: open/edit/archive/copy billing info.
- Channels: open/edit/deactivate/copy handle/url.
- Calendar dates: new promotion, view day, copy date, maybe filter by date.

Reglas:

- Para destructive actions, usar confirmación simple.
- No pedir confirmaciones obvias para acciones no destructivas.
- No romper RLS/backend; usar service methods existentes.

### P1 — Calendar polish

Validar:

- Monthly tiene padding correcto.
- Weekly navega anterior/siguiente semana.
- Tabs no son “jumpy”.
- Finance/Sales calendar solo visible para roles altos adecuados.
- No hay calendar en dashboard overview.

### P1 — Roles/permissions audit

Confirmar que ya no aparece:

- Approver
- Publisher
- Finance como rol independiente

Confirmar jerarquía actual:

- Administrator
- Sales
- Creator

Buscar:

```bash
rg -n "APPROVER|PUBLISHER|FINANCE|Approver|Publisher|Finance" src supabase e2e README.md
```

Algunos términos pueden existir en migraciones antiguas por historial; no necesariamente cambiarlos si son migrations ya aplicadas. Revisar solo UI/runtime.

### P2 — Naming cleanup técnico opcional

Hay nombres internos antiguos:

- `campaignService`
- `CampaignMetadata`
- `campaign_metadata`
- `campaignType`
- `/campaigns`

No cambiarlos ahora salvo que haya tiempo y pruebas completas, porque no aportan al usuario y pueden romper DB/rutas.

Si se decide limpiar:

- Hacerlo en una rama separada.
- Mantener redirects para `/campaigns`.
- Crear migraciones forward-only.
- No reescribir migrations aplicadas.

## Comandos útiles

### Local

```bash
cd /Users/tbnalfaro/Documents/Codex/2026-07-18/he/outputs/sentient-campaign-manager
npm install
npm run dev
npm run verify
```

### Supabase local

```bash
npm run supabase:start
npm run supabase:reset
npm run test:db
npm run test:functions
E2E_REAL_BACKEND=true npm run build
E2E_REAL_BACKEND=true npm run test:e2e
```

### GitHub

```bash
git status --short --branch
git log --oneline -8
gh run list --repo chatgptricks/sentient-campaign-manager --branch main --limit 8
gh run view <RUN_ID> --repo chatgptricks/sentient-campaign-manager --log-failed
gh run rerun <RUN_ID> --repo chatgptricks/sentient-campaign-manager --failed
```

### Deploy verification

```bash
curl -I -L --max-time 20 https://chatgptricks.github.io/sentient-campaign-manager/
```

## Constraints importantes

- No reescribir migrations ya aplicadas.
- No cambiar Supabase secrets en repo.
- No committear `.env`.
- No cambiar `sentient-campaign-manager` base path sin actualizar GitHub Pages, Vite y Auth redirects.
- El usuario quiere ejecución directa, no explicaciones largas.
- Mantener estilo gris/iOS con acento amarillo neon y texto negro sobre botones amarillos.
- Priorizar uso/operación sobre estilo decorativo.

## Mensaje sugerido para arrancar con Gemini

Usa este repo:

```text
/Users/tbnalfaro/Documents/Codex/2026-07-18/he/outputs/sentient-campaign-manager
```

Primero revisa este handover, luego:

1. Arregla el E2E real-backend que falla en validación de recursos.
2. Confirma CI completo en verde.
3. Reintenta deploy si falla por rate limit externo de Docker/ECR.
4. Haz un audit funcional de UI/runtime para asegurar que todo dice Promotions, no Campaigns, y que el flujo Sales/Creator/Admin funciona.
5. Luego continúa con right-click/context menus y polish final del calendario/overview.

No cambies rutas técnicas ni migrations aplicadas salvo que sea estrictamente necesario.
