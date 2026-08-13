# Tareas pendientes

Derivadas del feedback de usuarios en producción (tabla `feedback`, autora: Nicole Arias — 02-jul-2026 y 04-ago-2026).
Esfuerzo: S (≤1h) · M (medio día) · L (1-2 días)

## P1 — Alta prioridad

- [x] **T1 · N° trámite consecutivo (T26-001)** — S — En "Nuevo trámite", el campo N° TRÁMITE sugiere automáticamente el siguiente consecutivo del año (T26-522 hoy en prod) basado en el último creado. Se puebla por default al abrir el form y sigue editable — sugerencia, no forzado. *Backend: `GET /tramites/next-numero` (`backend/routes/tramites.js`). Frontend: `suggestNextNumero()` en `app.js`. Verificado en producción.*

- [x] **T2 · Registro de clientes (RUC, razón social, ECUAPASS, correos)** — L — Pantalla "Clientes" con alta, edición y baja: RUC, nombre o razón social, teléfono, descripción, correos múltiples y clave de ECUAPASS. El desplegable de Cliente del form de trámite se alimenta del servidor (antes era localStorage por navegador) y tiene un botón "+" para registrar uno nuevo sin perder lo cargado. *Tabla `clientes` sembrada con los clientes que ya aparecían en los trámites. La clave va cifrada con AES-256-GCM (`backend/lib/cripto.js`), nunca sale en los listados, solo un admin puede verla y cada consulta queda en auditoría como `ecuapass_consultada`. No se puede borrar un cliente con trámites asociados. Verificado en producción, incluido que la clave está cifrada en la base.*
  - ⚠️ **Falta configurar `ECUAPASS_KEY` en Railway.** Hoy la llave de cifrado se deriva de `JWT_SECRET` como fallback. Si algún día se rota el `JWT_SECRET`, las claves guardadas quedan indescifrables. Conviene definir la variable propia antes de cargar claves reales.
  - Pendiente decidir: los trámites siguen guardando el cliente como texto libre, sin FK a `clientes`. Renombrar un cliente no actualiza sus trámites.

- [x] **T3 · Operación "Otro" + régimen aduanero** — M — Al elegir "Otro" en Operación aparece el campo para especificar. El selector de Régimen cambia con la operación: en importación `21 – Importación Temporal` y `10 – Importación para el Consumo`; en exportación `49 – Exportación Temporal` y `Exportación Definitiva`; `Otro (especificar)` en ambas, que habilita su propio campo libre. *Columnas `operacion_otro`, `regimen`, `regimen_otro`, sumadas al mismo mapeo `CAMPOS_EXTRA`/`EXTRA` de T14. Los valores libres ya usados en otros trámites se ofrecen como sugerencia en un datalist, sin endpoint nuevo: salen de los trámites ya cargados en la bitácora. Verificado en producción: las tres listas de opciones, el guardado de ambas combinaciones y la relectura tras recargar.*

- [x] **T4 · Múltiples comprobantes por gasto** — M — "Comprobante adjunto" acepta varios archivos (hasta 10 por vez, 5MB c/u), con chip por archivo para ver, descargar y quitar individualmente. *Tabla `gasto_archivos` (1:N) + migración idempotente en `backend/index.js` que reubicó los 4 comprobantes 1:1 existentes; `comprobante_url/key` quedan por compatibilidad. `POST /gastos/:id/archivos` y `DELETE .../archivos/:archivoId`; el PUT de gasto pasó a ser solo de campos de texto. Al borrar un gasto se borran sus archivos del volumen. La métrica "sin comprobante" cuenta archivos. Verificado en producción: subida de 2 archivos a la vez, borrado individual y limpieza del volumen.*

## P2 — Productividad

- [x] **T5 · Dropdown de proveedores en gastos** — S/M — El campo "Proveedor" es desplegable con los proveedores ya registrados y admite texto libre para nuevos. Aplicado a la columna Proveedor de la tabla de gastos y al campo de Información general. *Backend: `GET /proveedores` (`backend/routes/proveedores.js`) + normalización a mayúsculas al guardar en `routes/gastos.js`. Frontend: registro `proveedorRegistry` sembrado desde el servidor, `<input list>` + `<datalist>`. Datos existentes normalizados en prod (1 fila: `mega` → `MEGA`). Verificado en producción.*
  - Pendiente decidir: la columna Proveedor de "Detalle de gastos pagados" (pestaña Liquidación) sigue siendo texto plano. Esa tabla es un espejo de solo lectura — ninguna celda es editable — así que poner el desplegable ahí implica volverla editable y cablear el guardado.

- [ ] **T6 · Pestaña "Documentos" del trámite** — M — Pestaña dedicada para cargar y almacenar múltiples archivos asociados al trámite (hoy los documentos generales viven dentro de "Documentos y gastos").

- [x] **T7 · Descarga múltiple en ZIP** — M — Checkbox por documento, "seleccionar todos", contador y botón "Descargar seleccionados (.ZIP)". *`POST /tramites/:id/documentos/zip` arma el zip con `archiver` desde el volumen; filtra por `tramite_id` (probado: un id de otro trámite se ignora), renombra duplicados dentro del zip y saltea archivos ausentes. La descarga va por fetch + blob porque la ruta necesita el token. Verificado en producción: 3 documentos → zip de 1.47MB con los 3 nombres correctos.*
  - ⚠️ **`archiver` debe quedar en el `package.json` de la RAÍZ.** Railway construye desde la raíz y usa su `start`; `backend/package.json` no se instala en el deploy. Declararlo solo ahí dejó el servicio caído con `MODULE_NOT_FOUND`.
  - ⚠️ **Pinneado a `archiver@^7`**: la v8 dejó de exportar la función `archiver('zip')` y pasó a exportar clases.

- [x] **T8 · Fecha de llegada en Información general** — S — Campo nuevo, confirmado con Edison que es distinta de la fecha de apertura. *Columna `fecha_llegada`. Verificado en producción: las dos fechas conviven y se releen bien tras recargar.*
  - Nota: la columna que hoy alimenta "Fecha de apertura de trámite" se llama `fecha_arribo` en la base. El nombre quedó del prototipo y ya no describe lo que guarda; renombrarla es cosmético pero evita confusiones con `fecha_llegada`.

- [x] **T9 · Fecha de trámite default = fecha actual** — S — "Nuevo trámite" pobla la fecha de apertura con la fecha de hoy, editable. *`todayISO()` en `app.js` usa fecha local a propósito: `toISOString()` daría el día siguiente después de las 19:00 en UTC-5. Verificado en producción.*

- [x] **T13 · `/files/...` inexistente devuelve `index.html` con 200** — S — El catch-all de `backend/index.js` ahora excluye el prefijo `/files`: un archivo que no está en el volumen responde 404 en vez de 200 con el HTML de la app. *Verificado en producción.*

- [x] **T12 · `saveState()` no existe** — S — Se quitaron las 19 llamadas de los `onchange` de `index.html`. No se definió la función: el guardado real ya pasa por el botón "Guardar cambios", y un autosave del form sería un cambio de comportamiento a decidir aparte (ver T14).

- [x] **T14 · 10 campos del trámite no se guardaban** — M — Mercadería, almacenera, MRN, liquidación SENAE, sub partida, N° entrega, transporte, proveedor, contenedores y CDA ahora se persisten y se repueblan al recargar. *Columnas nuevas en `tramites` (migración idempotente en `backend/index.js`) + `EXTRA` en `routes/tramites.js`. En el frontend un único mapeo `CAMPOS_EXTRA` sirve para enviar y para repoblar, así las dos listas no se vuelven a desincronizar. El PUT ahora avisa si falla en vez de decir "Trámite guardado" igual. Verificado en producción: los 10 campos escritos, guardados, releídos tras recargar y restaurados.*

- [ ] **T15 · Mejorar el componente de etiquetas** — M — Pedido de Edison (13-ago-2026). Rehacer el bloque "Etiquetas" del detalle de trámite (`index.html` + `renderEtiquetas`/`addEtiqueta` en `app.js`). Problemas concretos detectados en el código actual:
  - **Permite duplicados**: `addEtiqueta()` no revisa si la etiqueta ya está en el trámite, así que se puede agregar "pruebas" dos veces.
  - **No se guarda solo**: agregar o quitar una etiqueta solo toca `etiquetasData` en memoria; si el usuario no aprieta "Guardar cambios", se pierde. El resto de la pantalla (gastos, anticipos) sí tiene autosave, así que la inconsistencia sorprende.
  - **La paleta de 8 colores siempre visible** ocupa toda la fila. Además es engañosa: si la etiqueta ya existe en el registro, `addEtiqueta()` fuerza el color guardado e ignora el que se eligió.
  - **No se puede editar**: ni renombrar, ni cambiar el color de una etiqueta ya puesta, ni borrar una del registro global — una etiqueta mal escrita queda para siempre en el desplegable.
  - **El registro es solo localStorage** (`sa_etiquetas`), sembrado desde los trámites al cargar la bitácora: cada navegador arma su propia lista de colores. Conviene moverlo al servidor, como se hizo con proveedores en T5.
  - **Sin validación**: no hay largo máximo ni recorte de espacios.
  - **Accesibilidad**: los círculos de color y la "×" son `<span>` con `onclick`, sin foco por teclado ni rol.
  - ⚠️ Definir con Edison qué molesta más antes de rediseñar: la lista de arriba es lo que se ve en el código, no necesariamente su prioridad.

## P3 — Reportería

- [x] **T10 · Preliquidaciones exportables (Excel y PDF)** — L — Panel de preliquidación en la pestaña Liquidación, visible solo en importaciones, con exportación a **PDF y Excel** (ambos, confirmado con Edison). El archivo lleva preliquidación + gastos + anticipos + saldo.
  - **El cálculo no existía**: el panel anterior era markup estático del prototipo, con los números de MEGASTOCKEC fijos, dentro de una pantalla desactivada y con un botón de exportar que solo mostraba un aviso.
  - FOB, flete y seguro se cargan por trámite; CFR y CIF se calculan. Las tarifas (Ad Valorem, Fodinfa, IVA, Seguridad) traen valor por defecto y **se editan en cada trámite** — decisión de Edison, para no fijar reglas fiscales en el código.
  - Cada impuesto se apoya en los anteriores: Ad Valorem y Fodinfa sobre CIF, IVA sobre CIF+AdValorem+Fodinfa, Seguridad sobre la suma de los tres. La fórmula se dedujo de los números del prototipo y los reproduce al centavo.
  - ⚠️ **El cálculo está duplicado**: `backend/lib/preliquidacion.js` y `calcPreliq()` en `app.js`. El backend lo necesita para el Excel y el frontend para mostrarlo en vivo. Si se toca uno hay que tocar el otro.
  - *Se guarda en la columna `preliquidacion` (JSONB) con autosave. Verificado en producción: cálculo contrastado contra los valores del prototipo, guardado en la base, y el .xlsx descargado y abierto para comprobar que trae las cinco secciones.*

## Descartadas

- **Eliminar pestaña "Estado y auditoría"** (feedback del 04-ago-2026) — **no se hace**. Decisión de Edison: la pestaña queda tal cual está. Ahí vive el cambio de estado con motivo y quitarla rompería el flujo.

## Preguntas abiertas

1. **T10 — ¿son correctas las tarifas por defecto?** Hoy: Ad Valorem 0%, Fodinfa 0.5%, IVA 15%, Seguridad 0%. Y confirmar con Nicole que el orden de cálculo (cada impuesto sobre los anteriores) es el que usan.
2. **T2 — ¿quién puede ver la clave de ECUAPASS?** Se implementó solo admin, con registro en auditoría. Confirmar si los operadores también deberían poder.
3. **T2 — configurar `ECUAPASS_KEY` en Railway** antes de cargar claves reales.
4. **T15 — ¿qué molesta del componente de etiquetas?** La lista de problemas de la tarea salió de leer el código, no del uso.

*Respondidas: T8 (es otra fecha, distinta de la apertura) · T10 (los dos formatos, con gastos y saldo incluidos).*

---

## Hecho

- [x] **Botón de feedback por pantalla + pantalla admin para verlo** — Botón flotante (💬) visible en toda la app, abre modal para escribir feedback de la pantalla activa. Se guarda en tabla `feedback` (Postgres). Pantalla "Feedback" (solo admin, bajo Auditoría) lista todo filtrable por pantalla/fecha.
