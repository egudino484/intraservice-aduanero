# Sistema Aduanero — Intraservice

Prototipo de sistema de gestión de trámites aduaneros para la empresa **Intraservice**. Implementado como una SPA en un único archivo HTML, sin frameworks ni dependencias externas (solo Google Fonts).

## Archivo principal

- `sistema_aduanero_prototipo_2.html` — toda la app vive aquí (HTML + CSS + JS)

## Módulos / pantallas

| ID nav | Pantalla | Descripción |
|---|---|---|
| `dashboard` | Dashboard | Métricas generales: trámites activos, pendientes, concluidos, liquidaciones por enviar |
| `bitacora` | Bitácora | Listado completo de trámites con filtros por texto, tipo, estado y mes |
| `tramite` | Detalle trámite | Vista principal con 4 pestañas (ver abajo) |
| `reportes` | Reporte financiero | Reporte de gastos por período con presets de fechas y exportación a PDF |
| `auditoria` | Historial | Log de actividad del sistema con filtros |

> **Nota:** La pantalla standalone `liquidacion` fue eliminada. Ahora vive como pestaña dentro del detalle de trámite.

### Pestañas del detalle de trámite

- **Datos del trámite** — formulario de información general (cliente, BL, DA, navieras, facturas, observaciones)
- **Documentos y gastos** — tabla editable de gastos, tabla de anticipos del cliente, y documentos generales del expediente
- **Estado y auditoría** — cambio de estado con motivo y línea de tiempo de historial del trámite
- **Liquidación** — resumen financiero del trámite (gastos, anticipos, saldo); importa datos automáticamente del trámite activo

## Entidades de datos

### Trámite
```
N° trámite, tipo (Importación/Exportación), cliente, fecha de arribo,
BL (guía de embarque), naviera, DA (declaración aduanera),
factura comercial, factura Intraservice, factura agente de aduanas, observaciones
```

### Gastos (`gastoData[]`)
```
concepto, proveedor, N° factura, monto (USD), categoría, comprobante (PDF)
```
Categorías: Agente, Puerto, Transporte, Intraservice, Varios

### Anticipos (`anticipoData[]`)
```
fecha, descripción/referencia, N° comprobante, monto (USD), forma de pago, documento respaldo
```
Formas de pago: Transferencia, Depósito, Cheque, Efectivo, Otro

### Estados de trámite
- `Concluido` — verde
- `En proceso` — ámbar
- `Pendiente documentación` — rojo
- `Cancelado`

## Lógica de negocio clave

- **Liquidación** = total gastos − total anticipos → saldo a cobrar (rojo) o a favor del cliente (verde)
- Los gastos sin comprobante adjunto se marcan como pendientes en el resumen superior
- El historial de auditoría registra cambios de estado, gastos agregados, documentos cargados y liquidaciones enviadas
- La liquidación importa automáticamente los datos de gastos y anticipos del trámite (no se reingresan)

## Stack técnico

- HTML5 / CSS3 / Vanilla JS — sin build, sin bundler
- Fuentes: `DM Sans` (UI) y `DM Mono` (valores numéricos y códigos)
- CSS custom properties en `:root` para todo el sistema de diseño
- Navegación por `nav(id)` + pantallas con `display:none/block`
- Notificaciones toast con `showNotif(msg)`
- Persistencia completa en `localStorage` (clave `LS_KEY`) — todos los datos del trámite, gastos y anticipos sobreviven recargas
- Export PDF via `window.print()` con estilos `@media print` dedicados (`exportReportePDF()`)

## Sistema de diseño

```
--bg: #F5F4F1         fondo general
--surface: #FFFFFF    tarjetas y paneles
--blue: #1E4FBF       color primario / acción
--green: #1A6B3C      estados positivos / ingresos
--amber: #7A4A00      advertencias / pendientes
--red: #8B1F1F        errores / saldo a cobrar
--radius: 10px        redondeo estándar
--sidebar-w: 220px
--topbar-h: 56px
```

## Usuario de referencia

- Nombre: Edison Gudiño
- Rol: Administrador
- Iniciales en avatar: EG

## Datos de ejemplo (trámite activo en el prototipo)

- Trámite: `IMP-2026-042` — Megock S.A. — Importación — Estado: Concluido
- BL: `BL-7834912` · DA: `DA-9921` · Naviera: MSC
- Total gastos: $830.50 · Total anticipos: $500.00 · Saldo: $330.50
