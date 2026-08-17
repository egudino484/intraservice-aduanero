const router = require('express').Router()
const db = require('../db')
const auth = require('../middleware/auth')

function noVisor(req, res, next) {
  if (req.user.role === 'visor') return res.status(403).json({ error: 'Sin permiso para modificar' })
  next()
}

// GET /plantillas
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, nombre, cuerpo FROM plantillas ORDER BY lower(nombre)')
    res.json(rows)
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// POST /plantillas
router.post('/', auth, noVisor, async (req, res) => {
  const nombre = (req.body?.nombre || '').trim()
  const cuerpo = req.body?.cuerpo || ''
  if (!nombre) return res.status(400).json({ error: 'nombre requerido' })
  if (!cuerpo.trim()) return res.status(400).json({ error: 'La plantilla está vacía' })
  try {
    const { rows } = await db.query(
      'INSERT INTO plantillas (nombre, cuerpo, created_by) VALUES ($1,$2,$3) RETURNING id, nombre, cuerpo',
      [nombre, cuerpo, req.user.id]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una plantilla con ese nombre' })
    res.status(500).json({ error: 'Error interno' })
  }
})

// PATCH /plantillas/:id
router.patch('/:id', auth, noVisor, async (req, res) => {
  const campos = []
  const vals = []
  let i = 1
  if (req.body?.nombre !== undefined) { campos.push(`nombre=$${i++}`); vals.push(String(req.body.nombre).trim()) }
  if (req.body?.cuerpo !== undefined) { campos.push(`cuerpo=$${i++}`); vals.push(req.body.cuerpo) }
  if (!campos.length) return res.status(400).json({ error: 'Nada que actualizar' })
  vals.push(req.params.id)
  try {
    const { rows } = await db.query(
      `UPDATE plantillas SET ${campos.join(', ')} WHERE id=$${i} RETURNING id, nombre, cuerpo`, vals
    )
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' })
    res.json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una plantilla con ese nombre' })
    res.status(500).json({ error: 'Error interno' })
  }
})

// DELETE /plantillas/:id
router.delete('/:id', auth, noVisor, async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM plantillas WHERE id=$1 RETURNING id', [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' })
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

module.exports = router
