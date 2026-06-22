const router = require('express').Router()
const bcrypt = require('bcryptjs')
const db = require('../db')
const auth = require('../middleware/auth')

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' })
  next()
}

// GET /users
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, email, name, initials, role, active, created_at FROM users ORDER BY created_at',
    )
    res.json(rows)
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// POST /users (crear usuario)
router.post('/', auth, adminOnly, async (req, res) => {
  const { email, name, initials, role, password } = req.body
  if (!email || !name || !initials || !password) return res.status(400).json({ error: 'Campos requeridos faltantes' })
  try {
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await db.query(
      'INSERT INTO users (email, name, initials, role, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, name, initials, role, active, created_at',
      [email, name, initials, role || 'operador', hash]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email ya registrado' })
    res.status(500).json({ error: 'Error interno' })
  }
})

// PATCH /users/:id
router.patch('/:id', auth, adminOnly, async (req, res) => {
  const { role, active, password } = req.body
  try {
    const fields = []
    const vals = []
    let i = 1
    if (role !== undefined) { fields.push(`role=$${i++}`); vals.push(role) }
    if (active !== undefined) { fields.push(`active=$${i++}`); vals.push(active) }
    if (password !== undefined) {
      if (password.length < 6) return res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' })
      const hash = await bcrypt.hash(password, 10)
      fields.push(`password_hash=$${i++}`); vals.push(hash)
    }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' })
    vals.push(req.params.id)
    const { rows } = await db.query(
      `UPDATE users SET ${fields.join(',')} WHERE id=$${i} RETURNING id, email, name, initials, role, active`,
      vals
    )
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' })
    res.json(rows[0])
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

module.exports = router
