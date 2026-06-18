const router = require('express').Router({ mergeParams: true })
const multer = require('multer')
const { v4: uuid } = require('uuid')
const db = require('../db')
const auth = require('../middleware/auth')
const { uploadFile, deleteFile } = require('../lib/storage')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// GET /tramites/:tramiteId/documentos
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT d.*, u.name AS uploaded_by_name FROM documentos d JOIN users u ON u.id = d.uploaded_by
       WHERE d.tramite_id = $1 ORDER BY d.created_at`,
      [req.params.tramiteId]
    )
    res.json(rows)
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// POST /tramites/:tramiteId/documentos
router.post('/', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' })
  const { nombre, tipo } = req.body
  if (!nombre) return res.status(400).json({ error: 'nombre requerido' })

  const file_key = `documentos/${req.params.tramiteId}/${uuid()}-${req.file.originalname}`
  const file_url = await uploadFile(req.file.buffer, file_key, req.file.mimetype)

  try {
    const { rows } = await db.query(
      `INSERT INTO documentos (tramite_id, nombre, tipo, file_url, file_key, size_bytes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.tramiteId, nombre, tipo || 'Otro', file_url, file_key, req.file.size, req.user.id]
    )
    await db.query(
      `INSERT INTO auditoria (tramite_id, user_id, accion, detalle) VALUES ($1,$2,'documento_cargado',$3)`,
      [req.params.tramiteId, req.user.id, JSON.stringify({ nombre, tipo })]
    )
    res.status(201).json(rows[0])
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// DELETE /tramites/:tramiteId/documentos/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM documentos WHERE id=$1 AND tramite_id=$2 RETURNING *', [req.params.id, req.params.tramiteId])
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' })
    await deleteFile(rows[0].file_key)
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

module.exports = router
