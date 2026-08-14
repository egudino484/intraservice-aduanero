const router = require('express').Router()
const db = require('../db')
const auth = require('../middleware/auth')

function noVisor(req, res, next) {
  if (req.user.role === 'visor') return res.status(403).json({ error: 'Sin permiso para modificar' })
  next()
}

// GET /etiquetas — registro compartido: mismo nombre y mismo color para todos
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, text, color FROM etiquetas ORDER BY lower(text)')
    res.json(rows)
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// POST /etiquetas — alta o actualización de color
router.post('/', auth, noVisor, async (req, res) => {
  const text = (req.body?.text || '').trim()
  const color = req.body?.color || '#1E4FBF'
  if (!text) return res.status(400).json({ error: 'text requerido' })
  if (text.length > 40) return res.status(400).json({ error: 'Máximo 40 caracteres' })
  try {
    const { rows } = await db.query(
      `INSERT INTO etiquetas (text, color) VALUES ($1,$2)
       ON CONFLICT (lower(text)) DO UPDATE SET color = EXCLUDED.color
       RETURNING id, text, color`,
      [text, color]
    )
    res.status(201).json(rows[0])
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// DELETE /etiquetas/:id — la saca del registro; los trámites que ya la tengan
// puesta no se tocan
router.delete('/:id', auth, noVisor, async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM etiquetas WHERE id=$1 RETURNING id', [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' })
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

module.exports = router
