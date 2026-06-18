const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../db')

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' })

  try {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1 AND active = true', [email])
    const user = rows[0]
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Credenciales incorrectas' })
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, initials: user.initials, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    )
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, initials: user.initials, role: user.role } })
  } catch (err) {
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /auth/register (solo admin)
router.post('/register', async (req, res) => {
  const { email, name, initials, role, password } = req.body
  if (!email || !name || !initials || !password) return res.status(400).json({ error: 'Campos requeridos faltantes' })

  try {
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await db.query(
      'INSERT INTO users (email, name, initials, role, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, name, initials, role',
      [email, name, initials, role || 'operador', hash]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email ya registrado' })
    res.status(500).json({ error: 'Error interno' })
  }
})

module.exports = router
