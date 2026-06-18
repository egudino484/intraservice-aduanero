const router = require('express').Router()
const db = require('../db')
const auth = require('../middleware/auth')

// GET /auditoria
router.get('/', auth, async (req, res) => {
  const { tramite_id, accion, desde, hasta } = req.query
  let where = ['1=1']
  let params = []
  let i = 1

  if (tramite_id) { where.push(`a.tramite_id = $${i}`); params.push(tramite_id); i++ }
  if (accion)     { where.push(`a.accion = $${i}`); params.push(accion); i++ }
  if (desde)      { where.push(`a.created_at >= $${i}`); params.push(desde); i++ }
  if (hasta)      { where.push(`a.created_at <= $${i}`); params.push(hasta); i++ }

  try {
    const { rows } = await db.query(
      `SELECT a.*, u.name AS user_name, t.numero AS tramite_numero
       FROM auditoria a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN tramites t ON t.id = a.tramite_id
       WHERE ${where.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT 500`,
      params
    )
    res.json(rows)
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

module.exports = router
