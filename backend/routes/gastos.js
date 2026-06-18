const router = require('express').Router({ mergeParams: true })
const multer = require('multer')
const { v4: uuid } = require('uuid')
const db = require('../db')
const auth = require('../middleware/auth')
const { uploadFile, deleteFile } = require('../lib/storage')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// GET /tramites/:tramiteId/gastos
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM gastos WHERE tramite_id = $1 ORDER BY created_at', [req.params.tramiteId])
    res.json(rows)
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// POST /tramites/:tramiteId/gastos
router.post('/', auth, upload.single('comprobante'), async (req, res) => {
  const { concepto, proveedor, n_factura, monto, categoria } = req.body
  if (!concepto || !monto || !categoria) return res.status(400).json({ error: 'concepto, monto y categoria requeridos' })

  let comprobante_url = null, comprobante_key = null
  if (req.file) {
    comprobante_key = `gastos/${req.params.tramiteId}/${uuid()}-${req.file.originalname}`
    comprobante_url = await uploadFile(req.file.buffer, comprobante_key, req.file.mimetype)
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO gastos (tramite_id, concepto, proveedor, n_factura, monto, categoria, comprobante_url, comprobante_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.tramiteId, concepto, proveedor, n_factura, monto, categoria, comprobante_url, comprobante_key]
    )
    await db.query(
      `INSERT INTO auditoria (tramite_id, user_id, accion, detalle) VALUES ($1,$2,'gasto_agregado',$3)`,
      [req.params.tramiteId, req.user.id, JSON.stringify({ concepto, monto, categoria })]
    )
    res.status(201).json(rows[0])
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// PUT /tramites/:tramiteId/gastos/:id
router.put('/:id', auth, upload.single('comprobante'), async (req, res) => {
  const { concepto, proveedor, n_factura, monto, categoria } = req.body
  try {
    const existing = await db.query('SELECT * FROM gastos WHERE id = $1 AND tramite_id = $2', [req.params.id, req.params.tramiteId])
    if (!existing.rows[0]) return res.status(404).json({ error: 'No encontrado' })

    let { comprobante_url, comprobante_key } = existing.rows[0]
    if (req.file) {
      if (comprobante_key) await deleteFile(comprobante_key)
      comprobante_key = `gastos/${req.params.tramiteId}/${uuid()}-${req.file.originalname}`
      comprobante_url = await uploadFile(req.file.buffer, comprobante_key, req.file.mimetype)
    }

    const { rows } = await db.query(
      `UPDATE gastos SET concepto=$1, proveedor=$2, n_factura=$3, monto=$4, categoria=$5, comprobante_url=$6, comprobante_key=$7
       WHERE id=$8 RETURNING *`,
      [concepto, proveedor, n_factura, monto, categoria, comprobante_url, comprobante_key, req.params.id]
    )
    res.json(rows[0])
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// DELETE /tramites/:tramiteId/gastos/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM gastos WHERE id=$1 AND tramite_id=$2 RETURNING *', [req.params.id, req.params.tramiteId])
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' })
    if (rows[0].comprobante_key) await deleteFile(rows[0].comprobante_key)
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

module.exports = router
