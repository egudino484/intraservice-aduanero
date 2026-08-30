const router = require('express').Router()
const db = require('../db')
const auth = require('../middleware/auth')

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' })
  next()
}

// POST /feedback (cualquier usuario autenticado)
router.post('/', auth, async (req, res) => {
  const { pantalla, mensaje, tramite_id } = req.body
  if (!pantalla || !mensaje) return res.status(400).json({ error: 'Campos requeridos faltantes' })
  try {
    const { rows } = await db.query(
      'INSERT INTO feedback (pantalla, mensaje, user_id, tramite_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [pantalla, mensaje, req.user.id, tramite_id || null]
    )
    res.status(201).json(rows[0])
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// GET /feedback (solo admin)
router.get('/', auth, adminOnly, async (req, res) => {
  const { pantalla, desde, hasta } = req.query
  let where = ['1=1']
  let params = []
  let i = 1

  if (pantalla) { where.push(`f.pantalla = $${i}`); params.push(pantalla); i++ }
  if (desde)    { where.push(`f.created_at >= $${i}`); params.push(desde); i++ }
  if (hasta)    { where.push(`f.created_at <= $${i}`); params.push(hasta); i++ }

  try {
    const { rows } = await db.query(
      `SELECT f.*, u.name AS user_name, t.numero AS tramite_numero
       FROM feedback f
       LEFT JOIN users u ON u.id = f.user_id
       LEFT JOIN tramites t ON t.id = f.tramite_id
       WHERE ${where.join(' AND ')}
       ORDER BY f.created_at DESC
       LIMIT 500`,
      params
    )
    res.json(rows)
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// PATCH /feedback/:id — responder: qué se hizo con el pedido y cómo
router.patch('/:id', auth, async (req, res) => {
  if (req.user.role === 'visor') return res.status(403).json({ error: 'Sin permiso' })
  const { estado, respuesta } = req.body || {}
  const validos = ['pendiente', 'resuelto', 'descartado']
  if (estado && !validos.includes(estado)) return res.status(400).json({ error: 'Estado inválido' })
  try {
    const { rows } = await db.query(
      `UPDATE feedback
       SET estado = COALESCE($1, estado),
           respuesta = COALESCE($2, respuesta),
           resuelto_at = CASE WHEN $1 IN ('resuelto','descartado') THEN now() ELSE NULL END
       WHERE id = $3 RETURNING *`,
      [estado || null, respuesta ?? null, req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' })
    res.json(rows[0])
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

module.exports = router
