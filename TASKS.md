# Tareas pendientes

Derivadas del feedback de usuarios en producción (tabla `feedback`, autora: Nicole Arias — jul a sep 2026).
Esfuerzo: S (≤1h) · M (medio día) · L (1-2 días)

## Feedback del 11-sep-2026 (Nicole Arias)

- [x] **T29 · Comprobantes de gastos en Documentos** — S — Sección "Comprobantes de gastos" en la pestaña Documentos, con el gasto de origen. Se pueden sumar al ZIP, que los pone en su propia carpeta. *`comprobantesDelTramite()`; `/documentos/zip` acepta `comprobantes`, filtrados por trámite vía el gasto. Verificado: zip con un documento + un comprobante en `Comprobantes de gastos/`.*
- [x] **T30 · Saldo a favor en el Excel de liquidación** — S — Línea final "Saldo a favor de Fernando Arias (Intraservice) — a cobrar a \<cliente\>" / "a favor de \<cliente\>" / "Sin saldo pendiente". También en el PDF.
- [x] **T31 · Sub partida desplegable** — S — No era bug: se guardaba (E26-001-NOVA tenía `0710802000`). Se agregó datalist con las ya usadas.
- [x] **T32 · Mercadería / Consignatario** — S — "Mercadería importada" → "Mercadería". En exportación "Proveedor" → "Consignatario" (vía `data-label-exportacion`).
- [x] **T33 · Cantidad, unidad y liquidación completa** — M — Cantidad y unidad en valores de la mercadería (guardadas en `preliquidacion`). La liquidación final, PDF y Excel, lleva los valores de la mercadería y los 14 datos del trámite que pidió. *Verificado leyendo el xlsx: los 14 datos presentes.*
- [x] **T34 · Fecha Cut Off en lugar de Fecha de llegada** — S — Solo en exportación; en importación sigue "Fecha de llegada". Cut Off pasó de texto a `datetime-local`. *El único valor viejo ("28-jul-2026" en E26-001-NOVA) se migró a mano a `2026-07-28T00:00`.*
  - Cuidado: `applyTramiteForm` cortaba a `YYYY-MM-DD` todo valor con "T"; ahora solo lo hace en `input[type=date]`, si no el Cut Off perdía la hora.
- [x] **T35 · Campos ocultos en exportación** — S — Fecha de salida, Puerto de salida, Liquidación SENAE, Transporte y CDA. *Contradice su pedido del 07-sep (fecha y puerto de salida). Se ocultan, no se borran: verificado guardando E26-001-NOVA sin cambios, los valores quedaron intactos.*
  - Mecanismo nuevo: `data-ocultar-en`, `data-solo-en` y `data-label-exportacion` en el HTML, aplicados por `aplicarVisibilidadPorOperacion()`.
- [ ] **T36 · Retención y valor neto a pagar en gastos** — M — ⚠️ Esperando a Nicole: ¿retención en monto o en %? ¿El saldo usa el neto o el bruto?
- [ ] **T37 · Gastos logísticos en la preliquidación** — M — Almacenaje, THC/flete, V/B, otros. ⚠️ Esperando a Nicole: ¿se suman a los impuestos en un total? ¿Se saca "Seguridad", que ella no menciona?

## URLs compartibles (pedido de Edison, 24-sep)

- [x] **T38 · Link por pantalla y por trámite** — `/novedades`, `/tramite/:id/liquidacion`, etc. Botón 🔗 que copia el link. Atrás/adelante del navegador funcionan, y el login lleva a donde apuntaba el link.
- [x] **T39 · Filtros en la URL** — `/bitacora?q=NOVA&estado=En+proceso`, `/reportes?year=2026&desde=1&hasta=6`, `/feedback?estado=pendiente`. Se agregó el filtro por estado en Feedback.
  - ⚠️ **La API se movió a `/api`**: `/feedback`, `/clientes`, `/reportes` y `/auditoria` chocaban con los endpoints y el link devolvía JSON. `API_URL = '/api'`. `/files` quedó afuera.
  - ⚠️ **Assets con ruta absoluta** (`/styles.css`, `/app.js`): con ruta relativa, un link profundo cargaba la página sin estilos ni JS.

## Feedback del 07/08-sep-2026 (Nicole Arias)

Todos hechos, desplegados y verificados en producción. Cada uno respondido en la pantalla de Feedback.

- [x] **T21 · Numeración de exportaciones E26-XXX-CLIENTE** — S — Serie propia para exportaciones, con el cliente pegado al final (`E26-001-NOVA`). Las importaciones siguen en `T26-XXX`. *`/tramites/next-numero?tipo=`. La sugerencia se recalcula al cambiar operación o cliente, pero no pisa el número si lo escribieron a mano — `ultimaSugerenciaNumero` en `app.js`. Verificado: T26-611 / E26-001 / E26-001-NOVA / respeta "MI-PROPIO-123".*

- [x] **T22 · Eliminar trámite** — S — Botón en "Datos del trámite", solo admin, que pide escribir el número para confirmar. *`DELETE /tramites/:id`. El cascade se lleva gastos, anticipos y documentos; los archivos del volumen se borran a mano. Queda en auditoría como `tramite_eliminado`. Verificado creando y borrando un trámite descartable, sin tocar datos reales.*
  - Decisión: borrado real, no archivado. El estado "Cancelado" ya cubre el otro caso.

- [x] **T23 · Gastos fuera de liquidación (honorarios EXIMSA)** — M — Columna "Liquidar" con casilla, tildada por defecto. Destildada, el gasto se registra pero no suma al total ni al saldo. *Columna `excluir_liquidacion` en `gastos`. El monto excluido se muestra aparte en el pie, la fila queda marcada en la liquidación, y el PDF y el Excel la identifican sin sumarla. Verificado: total pasó de $1246.53 a $547.33 + $699.20 fuera de liquidación.*

- [x] **T24 · Separar Preliquidación y Liquidación** — M — Dos documentos distintos, cada uno con sus botones de PDF y Excel. *`/tramites/:id/:doc(preliquidacion|liquidacion).xlsx`. Preliquidación: mercadería e impuestos. Liquidación: gastos, anticipos y saldo. Los dos llevan la cabecera del trámite. Verificado leyendo las secciones dentro de cada .xlsx: cero solapamiento.*

- [x] **T25 · Vista previa del PDF generado** — S — El PDF de preliquidación y liquidación se muestra dentro del sistema, con botón "Imprimir / Guardar PDF". Antes abría una ventana nueva y saltaba directo al diálogo de impresión. *`mostrarPreviewDocumento()` reutiliza el modal de preview con un iframe `srcdoc`.*
  - La vista previa de archivos adjuntos (documentos y comprobantes) ya funcionaba: se verificó que el servidor manda `application/pdf` y que el iframe los abre bien.

- [x] **T26 · Saldo a favor de quién** — Ya estaba implementado y **el cálculo era correcto**; el pedido venía con los dos casos invertidos. Confirmado por Nicole: Fernando Arias es Intraservice. El cliente entrega el anticipo, la empresa pone los gastos. *Se aclaró la etiqueta a "A favor de Fernando Arias (Intraservice) · a cobrar a \<cliente\>" y se adoptó "Sin saldo pendiente" para el empate, que es el texto que ella pidió.*

- [x] **T27 · Campos adicionales de exportación** — Ya estaba hecho (T21 del 21-ago) cuando llegó el pedido, el mismo día del deploy.

- [x] **T28 · La columna Pantalla del feedback mostraba el trámite abierto** — S — El listado leía `pageTitles`, cuya entrada `tramite` se reescribe con el trámite activo, así que todas las filas mostraban lo mismo. Ahora usa `NOMBRES_PANTALLA`, fijo. *Además el feedback guarda `tramite_id`, así los nuevos muestran de qué trámite salieron. Los 11 viejos no lo tienen: esa información nunca se guardó.*

## Feedback del 21-ago-2026 (Nicole Arias)

- [x] **T16 · Estado de pago en los gastos** — S — Columna "Pago" con `Cancelado` / `Pendiente de pago`, en verde o ámbar, y el resumen de cuántos quedan sin pagar y por cuánto en el pie de la tabla. *Columna `estado_pago` en `gastos`, con los existentes en "Pendiente de pago". Verificado en producción.*
- [x] **T17 · A favor de quién queda el saldo** — S — Bajo el saldo neto se lee "A favor de Fernando Arias · a cobrar a MEGASTOCKEC", "A favor de \<cliente\>" o "Liquidado, sin saldo". *Regla: gastos por encima de los anticipos quedan a favor de Fernando Arias; al revés, a favor del cliente. **Confirmada por Nicole en sep-2026** (ver T26): Fernando Arias es Intraservice.*
- [x] **T18 · Autoformato de DAE y DAI** — S — Los guiones se ponen solos al escribir. *No valida el largo a propósito: si un documento viene distinto, lo deja pasar con un guion extra en vez de bloquear la carga. Verificado escribiendo carácter por carácter en producción.*
- [x] **T19 · Campos de facturación de Fernando Arias** — S — Factura EXIMSA, Factura Reembolso – Fernando Arias y Honorarios – Fernando Arias. *Columnas nuevas, sumadas al mapeo `CAMPOS_EXTRA`. Verificado guardando y releyendo.*
- [x] **T20 · Puerto de salida y referencia del cliente** — S — Puerto de salida (con sugerencias de los ya usados en otros trámites) y N° de referencia del cliente. *De paso se sacaron los valores de ejemplo del prototipo que quedaban fijos en Contenedores, CDA y DAI.*

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

- [x] **T6 · Pestaña "Documentos" del trámite** — M — Los documentos del expediente pasaron a su propia pestaña, con contador de archivos; la anterior se llama ahora "Gastos y anticipos". Se movió el panel existente en vez de duplicarlo, así que la carga múltiple y la descarga en ZIP de T7 siguen funcionando igual. Se actualizaron las tres referencias al nombre viejo que aparecían en pantalla. *Verificado en producción: 5 pestañas, los 4 documentos de T26-521 listados y el resto de los paneles ocultos.*
  - De paso: la pestaña que se abría al entrar a un trámite se elegía por posición (`.tab[1]`), así que agregar una pestaña antes la habría roto. Ahora va por id.

- [x] **T7 · Descarga múltiple en ZIP** — M — Checkbox por documento, "seleccionar todos", contador y botón "Descargar seleccionados (.ZIP)". *`POST /tramites/:id/documentos/zip` arma el zip con `archiver` desde el volumen; filtra por `tramite_id` (probado: un id de otro trámite se ignora), renombra duplicados dentro del zip y saltea archivos ausentes. La descarga va por fetch + blob porque la ruta necesita el token. Verificado en producción: 3 documentos → zip de 1.47MB con los 3 nombres correctos.*
  - ⚠️ **`archiver` debe quedar en el `package.json` de la RAÍZ.** Railway construye desde la raíz y usa su `start`; `backend/package.json` no se instala en el deploy. Declararlo solo ahí dejó el servicio caído con `MODULE_NOT_FOUND`.
  - ⚠️ **Pinneado a `archiver@^7`**: la v8 dejó de exportar la función `archiver('zip')` y pasó a exportar clases.

- [x] **T8 · Fecha de llegada en Información general** — S — Campo nuevo, confirmado con Edison que es distinta de la fecha de apertura. *Columna `fecha_llegada`. Verificado en producción: las dos fechas conviven y se releen bien tras recargar.*
  - Nota: la columna que hoy alimenta "Fecha de apertura de trámite" se llama `fecha_arribo` en la base. El nombre quedó del prototipo y ya no describe lo que guarda; renombrarla es cosmético pero evita confusiones con `fecha_llegada`.

- [x] **T9 · Fecha de trámite default = fecha actual** — S — "Nuevo trámite" pobla la fecha de apertura con la fecha de hoy, editable. *`todayISO()` en `app.js` usa fecha local a propósito: `toISOString()` daría el día siguiente después de las 19:00 en UTC-5. Verificado en producción.*

- [x] **T13 · `/files/...` inexistente devuelve `index.html` con 200** — S — El catch-all de `backend/index.js` ahora excluye el prefijo `/files`: un archivo que no está en el volumen responde 404 en vez de 200 con el HTML de la app. *Verificado en producción.*

- [x] **T12 · `saveState()` no existe** — S — Se quitaron las 19 llamadas de los `onchange` de `index.html`. No se definió la función: el guardado real ya pasa por el botón "Guardar cambios", y un autosave del form sería un cambio de comportamiento a decidir aparte (ver T14).

- [x] **T14 · 10 campos del trámite no se guardaban** — M — Mercadería, almacenera, MRN, liquidación SENAE, sub partida, N° entrega, transporte, proveedor, contenedores y CDA ahora se persisten y se repueblan al recargar. *Columnas nuevas en `tramites` (migración idempotente en `backend/index.js`) + `EXTRA` en `routes/tramites.js`. En el frontend un único mapeo `CAMPOS_EXTRA` sirve para enviar y para repoblar, así las dos listas no se vuelven a desincronizar. El PUT ahora avisa si falla en vez de decir "Trámite guardado" igual. Verificado en producción: los 10 campos escritos, guardados, releídos tras recargar y restaurados.*

- [x] **T15 · Mejorar el componente de etiquetas** — M — Pedido de Edison: que sea más intuitivo agregar una etiqueta nueva o usar las ya creadas.
  - **Las etiquetas ya creadas se muestran como chips** bajo el buscador: un clic las agrega con su color. Antes había que acordarse del nombre y escribirlo en un datalist invisible.
  - El buscador **filtra las sugerencias mientras se escribe**; Enter crea la que no existe, Escape limpia.
  - **El selector de color aparece solo al crear una etiqueta nueva.** Antes estaba siempre visible y era engañoso: una etiqueta existente conserva su color e ignoraba el elegido.
  - **No deja agregar dos veces la misma**, y las que ya están puestas desaparecen de las sugerencias.
  - **Se guardan solas** al agregar o quitar, como gastos y anticipos. Antes se perdían si no se apretaba "Guardar cambios".
  - Cada sugerencia se puede **sacar del registro** con su ×, para las mal escritas, sin tocar los trámites que ya la tengan.
  - Los círculos de color y las × pasan a ser `<button>`: se llega por teclado.
  - *Verificado en producción: agregar de un clic conservando el color, rechazo del duplicado, autosave confirmado contra el servidor y borrado desde la UI.*
  - **Registro movido al servidor** (pedido de Edison): tabla `etiquetas` con índice único sobre `lower(text)`, sembrada con las que ya tenían puestas los trámites. `GET/POST/DELETE /etiquetas`; el alta actualiza el color si el nombre ya existía. El frontend dejó de sembrar el registro desde la bitácora y de escribir en localStorage — la clave vieja `sa_etiquetas` se borra al cargar, así que los colores locales que cada uno tuviera no ensucian la lista compartida. *Verificado en producción: registro leído del servidor, clave vieja eliminada, alta y baja persistidas.*

## P3 — Reportería

- [x] **T10 · Preliquidaciones exportables (Excel y PDF)** — L — Panel de preliquidación en la pestaña Liquidación, visible solo en importaciones, con exportación a **PDF y Excel** (ambos, confirmado con Edison). El archivo lleva preliquidación + gastos + anticipos + saldo.
  - **El cálculo no existía**: el panel anterior era markup estático del prototipo, con los números de MEGASTOCKEC fijos, dentro de una pantalla desactivada y con un botón de exportar que solo mostraba un aviso.
  - FOB, flete y seguro se cargan por trámite; CFR y CIF se calculan. Las tarifas (Ad Valorem, Fodinfa, IVA, Seguridad) traen valor por defecto y **se editan en cada trámite** — decisión de Edison, para no fijar reglas fiscales en el código.
  - Cada impuesto se apoya en los anteriores: Ad Valorem y Fodinfa sobre CIF, IVA sobre CIF+AdValorem+Fodinfa, Seguridad sobre la suma de los tres. La fórmula se dedujo de los números del prototipo y los reproduce al centavo.
  - ⚠️ **El cálculo está duplicado**: `backend/lib/preliquidacion.js` y `calcPreliq()` en `app.js`. El backend lo necesita para el Excel y el frontend para mostrarlo en vivo. Si se toca uno hay que tocar el otro.
  - *Se guarda en la columna `preliquidacion` (JSONB) con autosave. Verificado en producción: cálculo contrastado contra los valores del prototipo, guardado en la base, y el .xlsx descargado y abierto para comprobar que trae las cinco secciones.*

## Descartadas

- **Eliminar pestaña "Estado y auditoría"** (feedback del 04-ago-2026) — **no se hace**. Decisión de Edison: la pestaña queda tal cual está. Ahí vive el cambio de estado con motivo y quitarla rompería el flujo.

## Decisiones tomadas

- **T8** — "fecha de llegada" es otra fecha, distinta de la apertura del trámite.
- **T10** — los dos formatos, PDF y Excel, con gastos y saldo incluidos.
- **T10** — las tarifas por defecto quedan como estaban (Ad Valorem 0%, Fodinfa 0.5%, IVA 15%, Seguridad 0%) pero **configurables desde la app**: tabla `configuracion`, editable desde el panel de preliquidación por admins y operadores. El Excel también las usa como base.
- **T2** — la clave de ECUAPASS la ven **admins y operadores**; los visores no. Toda consulta sigue quedando en auditoría.
- **T2** — no se crea `ECUAPASS_KEY`: se usa `JWT_SECRET` como llave, que no se va a rotar. ⚠️ Si algún día se cambia, hay que descifrar con el valor viejo y volver a cifrar.
- **T15** — lo que molestaba era agregar una etiqueta nueva y reutilizar las existentes.
- **T26** — Fernando Arias **es Intraservice**, la empresa. El anticipo lo entrega el cliente. Por eso gastos por encima del anticipo quedan a favor de Intraservice, y anticipo sin usar queda a favor del cliente. El pedido original decía lo contrario; se dejó como lo confirmó Nicole.
- **T22** — eliminar un trámite lo borra de verdad, no lo archiva.

## Pendiente de confirmar con Nicole

- **T10 — el orden de cálculo de los impuestos.** Ad Valorem y Fodinfa sobre CIF, IVA sobre CIF+AdValorem+Fodinfa, y Seguridad sobre la suma de los tres. Se dedujo de los números del prototipo, no de una fuente oficial.

## Novedades (changelog en la app)

Pantalla "Novedades" en el menú, con el detalle de lo que se fue agregando y un contador de entradas sin leer. **Al sumar algo al sistema, agregar una entrada arriba del array `NOVEDADES` en `app.js`**, con la fecha del día. Van 5 entradas.

## Feedback: responder en la app

La pantalla Feedback permite marcar cada pedido como Resuelto o No se hará y dejarle al usuario un comentario de qué se hizo. **Al cerrar un pedido, responderlo ahí**: es lo que ve quien lo reportó. Estado al 24-sep-2026: 24 resueltos, 1 descartado, 2 pendientes (T36 y T37, esperando respuesta).

---

## Hecho

- [x] **Botón de feedback por pantalla + pantalla admin para verlo** — Botón flotante (💬) visible en toda la app, abre modal para escribir feedback de la pantalla activa. Se guarda en tabla `feedback` (Postgres). Pantalla "Feedback" (solo admin, bajo Auditoría) lista todo filtrable por pantalla/fecha.
