const router = require('express').Router({ mergeParams: true })
const multer = require('multer')
const { v4: uuid } = require('uuid')
const db = require('../db')
const auth = require('../middleware/auth')
const { uploadFile, deleteFile } = require('../lib/storage')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// Los proveedores se guardan siempre en mayúsculas y sin espacios sobrantes:
// así el desplegable de /proveedores no repite "mega" y "MEGA" como dos entradas.
const normProveedor = v => {
  const s = (v == null ? '' : String(v)).trim().toUpperCase()
  return s === '' ? null : s
}

// Un gasto puede tener varios comprobantes; se devuelven siempre en `archivos`.
// Las columnas comprobante_url/key quedan por compatibilidad con datos viejos.
const SELECT_GASTOS = `
  SELECT g.*, COALESCE(
    json_agg(json_build_object('id', a.id, 'url', a.url, 'nombre', a.nombre)
             ORDER BY a.created_at) FILTER (WHERE a.id IS NOT NULL), '[]') AS archivos
  FROM gastos g
  LEFT JOIN gasto_archivos a ON a.gasto_id = g.id
  WHERE g.tramite_id = $1
  GROUP BY g.id
  ORDER BY g.created_at`

// GET /tramites/:tramiteId/gastos
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query(SELECT_GASTOS, [req.params.tramiteId])
    res.json(rows)
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// POST /tramites/:tramiteId/gastos/:id/archivos — adjunta uno o varios comprobantes
router.post('/:id/archivos', auth, upload.array('archivos', 10), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'Sin archivos' })
  try {
    const gasto = await db.query('SELECT id FROM gastos WHERE id = $1 AND tramite_id = $2', [req.params.id, req.params.tramiteId])
    if (!gasto.rows[0]) return res.status(404).json({ error: 'No encontrado' })

    for (const file of req.files) {
      const key = `gastos/${req.params.tramiteId}/${uuid()}-${file.originalname}`
      const url = await uploadFile(file.buffer, key, file.mimetype)
      await db.query(
        'INSERT INTO gasto_archivos (gasto_id, url, key, nombre) VALUES ($1,$2,$3,$4)',
        [req.params.id, url, key, file.originalname]
      )
    }
    await db.query(
      `INSERT INTO auditoria (tramite_id, user_id, accion, detalle) VALUES ($1,$2,'documento_cargado',$3)`,
      [req.params.tramiteId, req.user.id, JSON.stringify({ gasto_id: req.params.id, archivos: req.files.map(f => f.originalname) })]
    )
    const { rows } = await db.query(
      'SELECT id, url, nombre FROM gasto_archivos WHERE gasto_id = $1 ORDER BY created_at',
      [req.params.id]
    )
    res.status(201).json(rows)
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// DELETE /tramites/:tramiteId/gastos/:id/archivos/:archivoId
router.delete('/:id/archivos/:archivoId', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM gasto_archivos a USING gastos g
       WHERE a.id = $1 AND a.gasto_id = g.id AND g.id = $2 AND g.tramite_id = $3
       RETURNING a.key, a.url`,
      [req.params.archivoId, req.params.id, req.params.tramiteId]
    )
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' })
    if (rows[0].key) await deleteFile(rows[0].key)
    // Si era el comprobante viejo 1:1, limpiar también las columnas heredadas
    await db.query(
      'UPDATE gastos SET comprobante_url = NULL, comprobante_key = NULL WHERE id = $1 AND comprobante_url = $2',
      [req.params.id, rows[0].url]
    )
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// POST /tramites/:tramiteId/gastos
router.post('/', auth, upload.single('comprobante'), async (req, res) => {
  const { concepto, proveedor, n_factura, monto, categoria } = req.body
  if (!concepto || monto == null || monto === '' || !categoria) return res.status(400).json({ error: 'concepto, monto y categoria requeridos' })

  let comprobante_url = null, comprobante_key = null
  if (req.file) {
    comprobante_key = `gastos/${req.params.tramiteId}/${uuid()}-${req.file.originalname}`
    comprobante_url = await uploadFile(req.file.buffer, comprobante_key, req.file.mimetype)
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO gastos (tramite_id, concepto, proveedor, n_factura, monto, categoria, comprobante_url, comprobante_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.tramiteId, concepto, normProveedor(proveedor), n_factura, monto, categoria, comprobante_url, comprobante_key]
    )
    if (comprobante_url) {
      await db.query(
        'INSERT INTO gasto_archivos (gasto_id, url, key, nombre) VALUES ($1,$2,$3,$4)',
        [rows[0].id, comprobante_url, comprobante_key, req.file.originalname]
      )
    }
    await db.query(
      `INSERT INTO auditoria (tramite_id, user_id, accion, detalle) VALUES ($1,$2,'gasto_agregado',$3)`,
      [req.params.tramiteId, req.user.id, JSON.stringify({ concepto, monto, categoria })]
    )
    const arch = await db.query('SELECT id, url, nombre FROM gasto_archivos WHERE gasto_id = $1 ORDER BY created_at', [rows[0].id])
    res.status(201).json({ ...rows[0], archivos: arch.rows })
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// PUT /tramites/:tramiteId/gastos/:id — solo campos de texto.
// Los comprobantes se manejan por POST/DELETE de /archivos.
router.put('/:id', auth, async (req, res) => {
  const { concepto, proveedor, n_factura, monto, categoria } = req.body
  try {
    const { rows } = await db.query(
      `UPDATE gastos SET concepto=$1, proveedor=$2, n_factura=$3, monto=$4, categoria=$5
       WHERE id=$6 AND tramite_id=$7 RETURNING *`,
      [concepto, normProveedor(proveedor), n_factura, monto, categoria, req.params.id, req.params.tramiteId]
    )
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' })
    const arch = await db.query('SELECT id, url, nombre FROM gasto_archivos WHERE gasto_id = $1 ORDER BY created_at', [req.params.id])
    res.json({ ...rows[0], archivos: arch.rows })
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// DELETE /tramites/:tramiteId/gastos/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    // Las filas de gasto_archivos caen por ON DELETE CASCADE, pero los archivos
    // del volumen hay que borrarlos a mano.
    const archivos = await db.query('SELECT key FROM gasto_archivos WHERE gasto_id = $1', [req.params.id])
    const { rows } = await db.query('DELETE FROM gastos WHERE id=$1 AND tramite_id=$2 RETURNING *', [req.params.id, req.params.tramiteId])
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' })
    for (const a of archivos.rows) if (a.key) await deleteFile(a.key)
    if (rows[0].comprobante_key && !archivos.rows.some(a => a.key === rows[0].comprobante_key)) {
      await deleteFile(rows[0].comprobante_key)
    }
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

module.exports = router
