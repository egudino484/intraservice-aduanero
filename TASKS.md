# Tareas pendientes

Derivadas del feedback de usuarios en producción (tabla `feedback`, autora: Nicole Arias — 02-jul-2026 y 04-ago-2026).
Esfuerzo: S (≤1h) · M (medio día) · L (1-2 días)

## P1 — Alta prioridad

- [x] **T1 · N° trámite consecutivo (T26-001)** — S — En "Nuevo trámite", el campo N° TRÁMITE sugiere automáticamente el siguiente consecutivo del año (T26-522 hoy en prod) basado en el último creado. Se puebla por default al abrir el form y sigue editable — sugerencia, no forzado. *Backend: `GET /tramites/next-numero` (`backend/routes/tramites.js`). Frontend: `suggestNextNumero()` en `app.js`. Pendiente de deploy.*

- [ ] **T2 · Registro de clientes (RUC, razón social, ECUAPASS, correos)** — L — Apartado/CRUD de clientes: RUC, nombre o razón social, clave de ECUAPASS, correo(s) de contacto (múltiples). Incluye popup "nuevo cliente" desde el campo Cliente del form de trámite (agrega también teléfono y descripción, del pedido previo). Migración: tabla `clientes` + FK `tramites.cliente_id`, manteniendo el texto libre actual como fallback. ⚠️ La clave ECUAPASS es una credencial: cifrada, fuera de listados y del log de auditoría.

- [ ] **T3 · Operación "Otro" + régimen aduanero** — M — Al elegir "Otro" en Operación, habilitar campo para especificar (y persistir el valor como opción futura, similar a etiquetas custom). Al elegir Importación: régimen `21 – Importación Temporal`, `10 – Importación para el Consumo`, `Otro (especificar)`. Al elegir Exportación: `49 – Exportación Temporal`, `Exportación Definitiva`, `Otro (especificar)`. Migración: columnas `operacion_otro`, `regimen`, `regimen_otro`.

- [ ] **T4 · Múltiples comprobantes por gasto** — M — En "Gastos de trámite" → "Comprobante adjunto", permitir cargar varios archivos en vez de uno solo. Backend: la relación hoy es 1:1 → tabla `gasto_archivos` (o `documentos` con `gasto_id`). Frontend: input `multiple`, lista con borrado individual y contador en la celda. Ajustar la métrica de "gastos sin comprobante" (pendiente = 0 archivos).

## P2 — Productividad

- [ ] **T5 · Dropdown de proveedores en gastos** — S/M — El campo "Proveedor" debe ser desplegable con los proveedores ya registrados, permitiendo texto libre para nuevos (se registran solos). Backend: `GET /proveedores` (`SELECT DISTINCT proveedor FROM gastos` como paso 1). Frontend: `<input list>` + `<datalist>`, conserva la edición inline.

- [ ] **T6 · Pestaña "Documentos" del trámite** — M — Pestaña dedicada para cargar y almacenar múltiples archivos asociados al trámite (hoy los documentos generales viven dentro de "Documentos y gastos").

- [ ] **T7 · Descarga múltiple en ZIP** — M — En "Documentos generales del expediente": selección múltiple (checkbox) + botón "Descargar seleccionados (.ZIP)". Backend: `POST /documentos/zip` con lista de ids → stream con `archiver` desde `/uploads`, validando permisos por trámite.

- [ ] **T8 · Fecha de llegada en Información general** — S — Agregar el campo al form de datos del trámite. ⚠️ Confirmar si es campo nuevo o si es la "fecha de arribo" ya existente.

- [ ] **T9 · Fecha de trámite default = fecha actual** — S — En "Nuevo trámite", poblar el campo de fecha con la fecha del sistema al abrir el form. Editable.

## P3 — Reportería

- [ ] **T10 · Preliquidaciones exportables (Excel / PDF)** — L — Para trámites de importación, apartado "Preliquidaciones" que genere el archivo descargable. El panel de cálculo CIF + impuestos ya existe; falta la generación y descarga. PDF: reutilizar el patrón `window.print()` + `@media print` de `exportReportePDF()`. Excel: server-side con `exceljs`.

## Descartadas

- **Eliminar pestaña "Estado y auditoría"** (feedback del 04-ago-2026) — **no se hace**. Decisión de Edison: la pestaña queda tal cual está. Ahí vive el cambio de estado con motivo y quitarla rompería el flujo.

## Preguntas abiertas para Nicole

1. T8 — ¿"fecha de llegada" es lo mismo que la "fecha de arribo" existente?
2. T10 — ¿Excel, PDF o ambos? ¿Qué columnas lleva el Excel?
3. T2 — ¿quién puede ver la clave de ECUAPASS, solo admin?

---

## Hecho

- [x] **Botón de feedback por pantalla + pantalla admin para verlo** — Botón flotante (💬) visible en toda la app, abre modal para escribir feedback de la pantalla activa. Se guarda en tabla `feedback` (Postgres). Pantalla "Feedback" (solo admin, bajo Auditoría) lista todo filtrable por pantalla/fecha.
