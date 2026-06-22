const router = require('express').Router({ mergeParams: true })
const multer = require('multer')
const { v4: uuid } = require('uuid')
const db = require('../db')
const auth = require('../middleware/auth')
const { uploadFile, deleteFile } = require('../lib/storage')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// GET /tramites/:tramiteId/anticipos
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM anticipos WHERE tramite_id = $1 ORDER BY fecha', [req.params.tramiteId])
    res.json(rows)
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// POST /tramites/:tramiteId/anticipos
router.post('/', auth, upload.single('documento'), async (req, res) => {
  const { fecha, descripcion, n_comprobante, monto, forma_pago } = req.body
  if (!fecha || !descripcion || monto == null || monto === '' || !forma_pago) return res.status(400).json({ error: 'fecha, descripcion, monto y forma_pago requeridos' })

  let documento_url = null, documento_key = null
  if (req.file) {
    documento_key = `anticipos/${req.params.tramiteId}/${uuid()}-${req.file.originalname}`
    documento_url = await uploadFile(req.file.buffer, documento_key, req.file.mimetype)
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO anticipos (tramite_id, fecha, descripcion, n_comprobante, monto, forma_pago, documento_url, documento_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.tramiteId, fecha, descripcion, n_comprobante, monto, forma_pago, documento_url, documento_key]
    )
    res.status(201).json(rows[0])
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// PUT /tramites/:tramiteId/anticipos/:id
router.put('/:id', auth, upload.single('documento'), async (req, res) => {
  const { fecha, descripcion, n_comprobante, monto, forma_pago } = req.body
  try {
    const existing = await db.query('SELECT * FROM anticipos WHERE id=$1 AND tramite_id=$2', [req.params.id, req.params.tramiteId])
    if (!existing.rows[0]) return res.status(404).json({ error: 'No encontrado' })

    let { documento_url, documento_key } = existing.rows[0]
    if (req.file) {
      if (documento_key) await deleteFile(documento_key)
      documento_key = `anticipos/${req.params.tramiteId}/${uuid()}-${req.file.originalname}`
      documento_url = await uploadFile(req.file.buffer, documento_key, req.file.mimetype)
    }

    const { rows } = await db.query(
      `UPDATE anticipos SET fecha=$1, descripcion=$2, n_comprobante=$3, monto=$4, forma_pago=$5, documento_url=$6, documento_key=$7
       WHERE id=$8 RETURNING *`,
      [fecha, descripcion, n_comprobante, monto, forma_pago, documento_url, documento_key, req.params.id]
    )
    res.json(rows[0])
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// DELETE /tramites/:tramiteId/anticipos/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM anticipos WHERE id=$1 AND tramite_id=$2 RETURNING *', [req.params.id, req.params.tramiteId])
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' })
    if (rows[0].documento_key) await deleteFile(rows[0].documento_key)
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

module.exports = router
