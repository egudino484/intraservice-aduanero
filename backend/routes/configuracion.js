const router = require('express').Router()
const db = require('../db')
const auth = require('../middleware/auth')
const { TARIFAS_DEFECTO } = require('../lib/preliquidacion')

function noVisor(req, res, next) {
  if (req.user.role === 'visor') return res.status(403).json({ error: 'Sin permiso para modificar' })
  next()
}

const CLAVES_TARIFAS = ['adValorem', 'fodinfa', 'iva', 'seguridad']

// GET /configuracion — valores generales del sistema
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT clave, valor FROM configuracion')
    const cfg = Object.fromEntries(rows.map(r => [r.clave, r.valor]))
    // Si nunca se configuraron, se devuelven los valores base
    res.json({ tarifas: { ...TARIFAS_DEFECTO, ...(cfg.tarifas || {}) } })
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// PUT /configuracion/tarifas — tarifas por defecto de la preliquidación
router.put('/tarifas', auth, noVisor, async (req, res) => {
  const tarifas = {}
  for (const k of CLAVES_TARIFAS) {
    const n = parseFloat(req.body?.[k])
    if (!Number.isFinite(n) || n < 0 || n > 100) return res.status(400).json({ error: `Tarifa inválida: ${k}` })
    tarifas[k] = n
  }
  try {
    await db.query(
      `INSERT INTO configuracion (clave, valor, updated_by) VALUES ('tarifas',$1,$2)
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [JSON.stringify(tarifas), req.user.id]
    )
    res.json({ tarifas })
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

module.exports = router
