require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const { UPLOADS_DIR } = require('./lib/storage')
const db = require('./db')

// Run pending migrations at startup (idempotent)
db.query(`
  ALTER TABLE tramites DROP CONSTRAINT IF EXISTS tramites_tipo_check;
  ALTER TABLE tramites ADD CONSTRAINT tramites_tipo_check
    CHECK (tipo IN ('Importación', 'Exportación', 'Otro'));
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS custom_props JSONB DEFAULT '[]';
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS etiquetas   JSONB DEFAULT '[]';
  CREATE TABLE IF NOT EXISTS feedback (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pantalla    TEXT NOT NULL,
    mensaje     TEXT NOT NULL,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
  CREATE TABLE IF NOT EXISTS plantillas (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre     TEXT NOT NULL UNIQUE,
    cuerpo     TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  -- Plantilla de arranque, calcada de la que usan hoy para facturación
  INSERT INTO plantillas (nombre, cuerpo)
  VALUES ('Facturación', E'IMPORTADOR: {{cliente}}\\nRUC: {{ruc}}\\nREFRENDO: {{refrendo}}\\nLIQUIDACION: {{liquidacion}}\\nVALOR A FACTURAR: {{valor}}\\nNOTIFICACION: {{notificacion}}\\nCORREO ELECTRONICO: {{correo}}\\nREFERENCIA: {{referencia}}')
  ON CONFLICT (nombre) DO NOTHING;
  CREATE TABLE IF NOT EXISTS configuracion (
    clave      TEXT PRIMARY KEY,
    valor      JSONB NOT NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS etiquetas (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    text       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#1E4FBF',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_etiquetas_text ON etiquetas (lower(text));
  -- Siembra con las etiquetas que ya tienen puestas los trámites
  INSERT INTO etiquetas (text, color)
  SELECT DISTINCT ON (lower(e->>'text')) e->>'text', COALESCE(NULLIF(e->>'color',''), '#1E4FBF')
  FROM tramites t, jsonb_array_elements(COALESCE(t.etiquetas, '[]'::jsonb)) e
  WHERE COALESCE(e->>'text', '') <> ''
  ON CONFLICT (lower(text)) DO NOTHING;
  CREATE TABLE IF NOT EXISTS clientes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ruc              TEXT UNIQUE,
    nombre           TEXT NOT NULL UNIQUE,
    descripcion      TEXT,
    telefono         TEXT,
    emails           JSONB NOT NULL DEFAULT '[]',
    ecuapass_cifrado TEXT,
    created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  -- Siembra con los clientes que ya aparecen en los trámites
  INSERT INTO clientes (nombre)
  SELECT DISTINCT TRIM(cliente) FROM tramites
  WHERE cliente IS NOT NULL AND TRIM(cliente) <> ''
  ON CONFLICT (nombre) DO NOTHING;
  -- Campos del form de trámite que se leían en pantalla pero no se guardaban
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS mercaderia   TEXT;
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS almacenera   TEXT;
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS mrn          TEXT;
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS liq_senae    TEXT;
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS sub_partida  TEXT;
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS n_entrega    TEXT;
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS transporte   TEXT;
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS proveedor    TEXT;
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS contenedores TEXT;
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS cda          TEXT;
  -- Preliquidación: valores de la mercadería y tarifas, editables por trámite
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS preliquidacion JSONB DEFAULT '{}';
  -- Fecha de llegada de la mercadería, distinta de la apertura del trámite
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS fecha_llegada DATE;
  -- Operación "Otro" y régimen aduanero
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS operacion_otro TEXT;
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS regimen        TEXT;
  ALTER TABLE tramites ADD COLUMN IF NOT EXISTS regimen_otro   TEXT;
  CREATE TABLE IF NOT EXISTS gasto_archivos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gasto_id    UUID NOT NULL REFERENCES gastos(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    key         TEXT,
    nombre      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_gasto_archivos_gasto ON gasto_archivos(gasto_id);
  -- Migra los comprobantes 1:1 ya existentes a la tabla nueva (idempotente)
  INSERT INTO gasto_archivos (gasto_id, url, key, nombre)
  SELECT g.id, g.comprobante_url, g.comprobante_key,
         regexp_replace(regexp_replace(COALESCE(g.comprobante_key, g.comprobante_url), '^.*/', ''),
                        '^[0-9a-fA-F-]{36}-', '')
  FROM gastos g
  WHERE g.comprobante_url IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM gasto_archivos a WHERE a.gasto_id = g.id AND a.url = g.comprobante_url);
`).then(() => console.log('Migrations OK')).catch(e => console.error('Migration error:', e.message))

const app = express()
app.use(cors())
app.use(express.json())
app.use('/files', express.static(UPLOADS_DIR))

app.use('/auth',                          require('./routes/auth'))
app.use('/tramites',                      require('./routes/tramites'))
app.use('/tramites/:tramiteId/gastos',    require('./routes/gastos'))
app.use('/tramites/:tramiteId/anticipos', require('./routes/anticipos'))
app.use('/tramites/:tramiteId/documentos',require('./routes/documentos'))
app.use('/proveedores',                   require('./routes/proveedores'))
app.use('/clientes',                      require('./routes/clientes'))
app.use('/etiquetas',                     require('./routes/etiquetas'))
app.use('/configuracion',                 require('./routes/configuracion'))
app.use('/plantillas',                    require('./routes/plantillas'))
app.use('/auditoria',                     require('./routes/auditoria'))
app.use('/users',                         require('./routes/users'))
app.use('/feedback',                      require('./routes/feedback'))

app.get('/health', (_, res) => res.json({ ok: true }))

// Serve frontend for all non-API routes
app.use(express.static(path.join(__dirname, '..')))
app.get('*', (req, res) => {
  // Un archivo inexistente debe dar 404, no el HTML de la app: si cae acá es
  // porque express.static no lo encontró en el volumen.
  if (req.path.startsWith('/files/')) return res.status(404).json({ error: 'Archivo no encontrado' })
  res.sendFile(path.join(__dirname, '../index.html'))
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`API corriendo en puerto ${PORT}`))
