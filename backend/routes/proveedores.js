const router = require('express').Router()
const db = require('../db')
const auth = require('../middleware/auth')

// GET /proveedores — proveedores ya usados en gastos, para el desplegable
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT TRIM(proveedor) AS proveedor
       FROM gastos
       WHERE proveedor IS NOT NULL AND TRIM(proveedor) <> ''
       ORDER BY 1`
    )
    res.json(rows.map(r => r.proveedor))
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

module.exports = router
