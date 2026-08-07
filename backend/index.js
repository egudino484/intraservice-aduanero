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
