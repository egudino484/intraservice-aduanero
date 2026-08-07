# Tareas pendientes

Derivadas del feedback de usuarios en producción (tabla `feedback`, autora: Nicole Arias — 02-jul-2026 y 04-ago-2026).
Esfuerzo: S (≤1h) · M (medio día) · L (1-2 días)

## P1 — Alta prioridad

- [x] **T1 · N° trámite consecutivo (T26-001)** — S — En "Nuevo trámite", el campo N° TRÁMITE sugiere automáticamente el siguiente consecutivo del año (T26-522 hoy en prod) basado en el último creado. Se puebla por default al abrir el form y sigue editable — sugerencia, no forzado. *Backend: `GET /tramites/next-numero` (`backend/routes/tramites.js`). Frontend: `suggestNextNumero()` en `app.js`. Pendiente de deploy.*

- [ ] **T2 · Registro de clientes (RUC, razón social, ECUAPASS, correos)** — L — Apartado/CRUD de clientes: RUC, nombre o razón social, clave de ECUAPASS, correo(s) de contacto (múltiples). Incluye popup "nuevo cliente" desde el campo Cliente del form de trámite (agrega también teléfono y descripción, del pedido previo). Migración: tabla `clientes` + FK `tramites.cliente_id`, manteniendo el texto libre actual como fallback. ⚠️ La clave ECUAPASS es una credencial: cifrada, fuera de listados y del log de auditoría.

- [ ] **T3 · Operación "Otro" + régimen aduanero** — M — Al elegir "Otro" en Operación, habilitar campo para especificar (y persistir el valor como opción futura, similar a etiquetas custom). Al elegir Importación: régimen `21 – Importación Temporal`, `10 – Importación para el Consumo`, `Otro (especificar)`. Al elegir Exportación: `49 – Exportación Temporal`, `Exportación Definitiva`, `Otro (especificar)`. Migración: columnas `operacion_otro`, `regimen`, `regimen_otro`.

- [x] **T4 · Múltiples comprobantes por gasto** — M — "Comprobante adjunto" acepta varios archivos (hasta 10 por vez, 5MB c/u), con chip por archivo para ver, descargar y quitar individualmente. *Tabla `gasto_archivos` (1:N) + migración idempotente en `backend/index.js` que reubicó los 4 comprobantes 1:1 existentes; `comprobante_url/key` quedan por compatibilidad. `POST /gastos/:id/archivos` y `DELETE .../archivos/:archivoId`; el PUT de gasto pasó a ser solo de campos de texto. Al borrar un gasto se borran sus archivos del volumen. La métrica "sin comprobante" cuenta archivos. Verificado en producción: subida de 2 archivos a la vez, borrado individual y limpieza del volumen.*

## P2 — Productividad

- [x] **T5 · Dropdown de proveedores en gastos** — S/M — El campo "Proveedor" es desplegable con los proveedores ya registrados y admite texto libre para nuevos. Aplicado a la columna Proveedor de la tabla de gastos y al campo de Información general. *Backend: `GET /proveedores` (`backend/routes/proveedores.js`) + normalización a mayúsculas al guardar en `routes/gastos.js`. Frontend: registro `proveedorRegistry` sembrado desde el servidor, `<input list>` + `<datalist>`. Datos existentes normalizados en prod (1 fila: `mega` → `MEGA`). Verificado en producción.*
  - Pendiente decidir: la columna Proveedor de "Detalle de gastos pagados" (pestaña Liquidación) sigue siendo texto plano. Esa tabla es un espejo de solo lectura — ninguna celda es editable — así que poner el desplegable ahí implica volverla editable y cablear el guardado.

- [ ] **T6 · Pestaña "Documentos" del trámite** — M — Pestaña dedicada para cargar y almacenar múltiples archivos asociados al trámite (hoy los documentos generales viven dentro de "Documentos y gastos").

- [x] **T7 · Descarga múltiple en ZIP** — M — Checkbox por documento, "seleccionar todos", contador y botón "Descargar seleccionados (.ZIP)". *`POST /tramites/:id/documentos/zip` arma el zip con `archiver` desde el volumen; filtra por `tramite_id` (probado: un id de otro trámite se ignora), renombra duplicados dentro del zip y saltea archivos ausentes. La descarga va por fetch + blob porque la ruta necesita el token. Verificado en producción: 3 documentos → zip de 1.47MB con los 3 nombres correctos.*
  - ⚠️ **`archiver` debe quedar en el `package.json` de la RAÍZ.** Railway construye desde la raíz y usa su `start`; `backend/package.json` no se instala en el deploy. Declararlo solo ahí dejó el servicio caído con `MODULE_NOT_FOUND`.
  - ⚠️ **Pinneado a `archiver@^7`**: la v8 dejó de exportar la función `archiver('zip')` y pasó a exportar clases.

- [ ] **T8 · Fecha de llegada en Información general** — S — Agregar el campo al form de datos del trámite. ⚠️ Confirmar si es campo nuevo o si es la "fecha de arribo" ya existente.

- [x] **T9 · Fecha de trámite default = fecha actual** — S — "Nuevo trámite" pobla la fecha de apertura con la fecha de hoy, editable. *`todayISO()` en `app.js` usa fecha local a propósito: `toISOString()` daría el día siguiente después de las 19:00 en UTC-5. Verificado en producción.*

- [ ] **T13 · `/files/...` inexistente devuelve `index.html` con 200** — S — El catch-all `app.get('*')` de `backend/index.js` atrapa las rutas de archivos que no existen, así que un comprobante borrado o con ruta rota responde 200 con el HTML de la app en vez de 404. Excluir el prefijo `/files` del catch-all.

- [ ] **T12 · `saveState()` no existe** — S — Se invoca en 19 handlers `onchange` de `index.html` pero no está definido en `app.js`: cada cambio en esos campos tira un `ReferenceError` en consola. No rompe nada visible porque lo que va antes en el handler sí ejecuta, y los datos se guardan por otras vías (botón "Guardar cambios", autosave de gastos). Definirlo o quitar las llamadas.

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
