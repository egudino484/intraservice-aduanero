# Sistema Aduanero — Intraservice

Sistema de gestión de trámites aduaneros para la empresa **Intraservice**. SPA en un único archivo HTML conectada a un backend Node.js + PostgreSQL desplegado en Railway.

## Estructura del proyecto

```
/
├── index.html              # Frontend: toda la app (HTML + CSS + JS)
├── package.json            # Solo para serve en Railway (frontend)
├── backend/
│   ├── index.js            # Entrypoint Express
│   ├── package.json
│   ├── .env                # Variables locales (no se sube a git)
│   ├── db/
│   │   ├── index.js        # Pool pg
│   │   └── migrations/
│   │       └── 001_schema.sql
│   ├── lib/
│   │   └── storage.js      # Manejo de archivos en /uploads (Railway Volume)
│   ├── middleware/
│   │   └── auth.js         # JWT verify → req.user
│   └── routes/
│       ├── auth.js         # POST /auth/login
│       ├── tramites.js
│       ├── gastos.js
│       ├── anticipos.js
│       ├── documentos.js
│       ├── auditoria.js
│       └── users.js        # Admin-only: GET/POST/PATCH /users
└── uploads/                # Archivos locales (gitignored; en prod → Railway Volume)
```

## Archivos principales

- `index.html` — frontend completo (HTML + CSS + JS)
- `backend/index.js` — API Express (puerto 3000)

## Deploy local

### 1. Backend

```bash
cd backend
cp .env.example .env      # editar con tus credenciales locales
npm install
node index.js             # API en http://localhost:3000
```

Variables requeridas en `backend/.env`:
```
DATABASE_URL=postgresql://user:pass@host:port/db
JWT_SECRET=cualquier_string_secreto
UPLOADS_DIR=./uploads     # carpeta local para archivos
PORT=3000
```

Correr migración inicial (solo primera vez):
```bash
psql $DATABASE_URL -f db/migrations/001_schema.sql
```

Crear primer usuario admin (solo primera vez, desde psql):
```sql
INSERT INTO users (email, name, initials, role, password_hash)
VALUES ('tu@email.com', 'Tu Nombre', 'TN', 'admin',
  crypt('password123', gen_salt('bf')));
```

### 2. Frontend

Abrir `index.html` directo en el navegador **o** servir con:
```bash
npx serve . -p 8080
```

> El frontend apunta a `API_URL = 'https://sistema-importacion-intraservice-production-0b8a.up.railway.app'` por defecto. Para apuntar al backend local, cambiar temporalmente esa constante en `index.html` a `http://localhost:3000`.

---

## Deploy en producción (Railway)

### Infraestructura en Railway

| Servicio | Tipo | Notas |
|---|---|---|
| `sistema-importacion-intraservice` | Node.js (backend) | Raíz `/backend` |
| `postgres` | PostgreSQL | Creado con `railway add postgres` |
| Volume | Disco persistente | Montado en `/uploads` del servicio backend |

**Proyecto:** `sistema-importacion-intraservice`  
**Workspace ID:** `91ade6ab-aa1c-41df-9a20-390673296b58`  
**API URL producción:** `https://sistema-importacion-intraservice-production-0b8a.up.railway.app`  
**GitHub repo:** `https://github.com/egudino484/intraservice-aduanero.git`

### Deploy del backend

```bash
# Desde la raíz del proyecto
railway login                                  # cuenta: edisong1395@gmail.com
railway link --service sistema-importacion-intraservice
cd backend
railway up --detach                            # sube y despliega
```

Railway usa `backend/package.json` → `npm start` → `node index.js`.

### Variables de entorno en Railway

Están configuradas en el panel de Railway (no en `.env` del repo). Las clave son:

```
DATABASE_URL    # se inyecta automáticamente al agregar el servicio postgres
JWT_SECRET      = intraservice_secret_2026
UPLOADS_DIR     = /uploads
PORT            = (Railway lo inyecta automáticamente)
```

Para verlas/editarlas: Railway dashboard → servicio → Variables.

### Actualizar producción tras cambios

```bash
git add <archivos>
git commit -m "descripción"
git push origin main          # Railway puede hacer auto-deploy desde GitHub
# o manual:
railway up --detach
```

### Ver logs en producción

```bash
railway logs
```

---

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

**Frontend**
- HTML5 / CSS3 / Vanilla JS — sin build, sin bundler
- Fuentes: `DM Sans` (UI) y `DM Mono` (valores numéricos y códigos)
- CSS custom properties en `:root` para todo el sistema de diseño
- Navegación por `nav(id)` + pantallas con `display:none/block`
- Notificaciones toast con `showNotif(msg)`
- Autenticación: JWT guardado en `localStorage` como `sa_token` (expiry 8h)
- `apiFetch(path, opts)` — wrapper sobre `fetch` que inyecta el token y maneja 401
- Debounced auto-save (800ms) para ediciones inline en tablas de gastos/anticipos
- Export PDF via `window.print()` con estilos `@media print` (`exportReportePDF()`)

**Backend**
- Node.js + Express
- PostgreSQL (Railway) vía `pg` pool — `backend/db/index.js`
- JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`) para auth
- Multer para subida de archivos (≤5MB), almacenados en Railway Volume `/uploads`
- Archivos servidos estáticamente en `/files/:key`
- Roles: `admin`, `operador`, `visor`

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
