const router = require('express').Router()
const db = require('../db')
const auth = require('../middleware/auth')

// GET /reportes?year=2026&desde=1&hasta=12&cliente=&tipo=
// El período de un trámite es el mes en que se abrió (created_at), igual que
// el filtro por mes de la bitácora.
router.get('/', auth, async (req, res) => {
  const year  = parseInt(req.query.year) || new Date().getFullYear()
  const clamp = (v, def) => Math.min(Math.max(parseInt(v) || def, 1), 12)
  const desde = clamp(req.query.desde, 1)
  const hasta = Math.max(clamp(req.query.hasta, 12), desde)
  const { cliente, tipo } = req.query

  const where = [
    `EXTRACT(YEAR FROM t.created_at) = $1`,
    `EXTRACT(MONTH FROM t.created_at) BETWEEN $2 AND $3`,
  ]
  const params = [year, desde, hasta]
  let i = 4
  if (cliente) { where.push(`t.cliente = $${i}`); params.push(cliente); i++ }
  if (tipo)    { where.push(`t.tipo = $${i}`);    params.push(tipo);    i++ }
  const filtro = where.join(' AND ')

  try {
    const [tramites, categorias, years] = await Promise.all([
      db.query(
        `SELECT t.id, t.numero, t.cliente, t.tipo, t.estado,
                to_char(t.created_at, 'YYYY-MM') AS mes,
                COALESCE(g.total, 0)::float8 AS gastos,
                COALESCE(a.total, 0)::float8 AS anticipos
         FROM tramites t
         LEFT JOIN (SELECT tramite_id, SUM(monto) AS total FROM gastos    GROUP BY tramite_id) g ON g.tramite_id = t.id
         LEFT JOIN (SELECT tramite_id, SUM(monto) AS total FROM anticipos GROUP BY tramite_id) a ON a.tramite_id = t.id
         WHERE ${filtro}
         ORDER BY t.created_at DESC`,
        params
      ),
      db.query(
        `SELECT g.categoria AS cat, SUM(g.monto)::float8 AS total
         FROM gastos g
         JOIN tramites t ON t.id = g.tramite_id
         WHERE ${filtro}
         GROUP BY g.categoria
         HAVING SUM(g.monto) <> 0
         ORDER BY total DESC`,
        params
      ),
      db.query(
        `SELECT DISTINCT EXTRACT(YEAR FROM created_at)::int AS year
         FROM tramites ORDER BY year DESC`
      ),
    ])
    res.json({
      tramites: tramites.rows,
      categorias: categorias.rows,
      years: years.rows.map(r => r.year),
    })
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

module.exports = router
