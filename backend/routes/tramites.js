const router = require('express').Router()
const db = require('../db')
const auth = require('../middleware/auth')

// GET /tramites
router.get('/', auth, async (req, res) => {
  const { search, tipo, estado, mes } = req.query
  let where = ['1=1']
  let params = []
  let i = 1

  if (search) { where.push(`(numero ILIKE $${i} OR cliente ILIKE $${i})`); params.push(`%${search}%`); i++ }
  if (tipo)   { where.push(`tipo = $${i}`); params.push(tipo); i++ }
  if (estado) { where.push(`estado = $${i}`); params.push(estado); i++ }
  if (mes)    { where.push(`to_char(created_at, 'YYYY-MM') = $${i}`); params.push(mes); i++ }

  try {
    const { rows } = await db.query(
      `SELECT t.*, u.name AS created_by_name,
        (SELECT COALESCE(SUM(monto),0) FROM gastos WHERE tramite_id = t.id) AS total_gastos,
        (SELECT COALESCE(SUM(monto),0) FROM anticipos WHERE tramite_id = t.id) AS total_anticipos
       FROM tramites t
       JOIN users u ON u.id = t.created_by
       WHERE ${where.join(' AND ')}
       ORDER BY t.created_at DESC`,
      params
    )
    res.json(rows)
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// GET /tramites/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT t.*, u.name AS created_by_name FROM tramites t JOIN users u ON u.id = t.created_by WHERE t.id = $1`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' })

    const [gastos, anticipos, documentos, estados] = await Promise.all([
      db.query('SELECT * FROM gastos WHERE tramite_id = $1 ORDER BY created_at', [req.params.id]),
      db.query('SELECT * FROM anticipos WHERE tramite_id = $1 ORDER BY fecha', [req.params.id]),
      db.query('SELECT * FROM documentos WHERE tramite_id = $1 ORDER BY created_at', [req.params.id]),
      db.query('SELECT te.*, u.name AS user_name FROM tramite_estados te JOIN users u ON u.id = te.created_by WHERE te.tramite_id = $1 ORDER BY te.created_at DESC', [req.params.id])
    ])

    res.json({ ...rows[0], gastos: gastos.rows, anticipos: anticipos.rows, documentos: documentos.rows, historial: estados.rows })
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// POST /tramites
router.post('/', auth, async (req, res) => {
  const { numero, tipo, cliente, fecha_arribo, bl, naviera, da, factura_comercial, factura_intraservice, factura_agente, observaciones } = req.body
  if (!numero || !tipo || !cliente) return res.status(400).json({ error: 'numero, tipo y cliente son requeridos' })

  try {
    const { rows } = await db.query(
      `INSERT INTO tramites (numero, tipo, cliente, fecha_arribo, bl, naviera, da, factura_comercial, factura_intraservice, factura_agente, observaciones, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [numero, tipo, cliente, fecha_arribo || null, bl, naviera, da, factura_comercial, factura_intraservice, factura_agente, observaciones, req.user.id]
    )
    await db.query(
      `INSERT INTO auditoria (tramite_id, user_id, accion, detalle) VALUES ($1,$2,'tramite_creado',$3)`,
      [rows[0].id, req.user.id, JSON.stringify({ numero, cliente })]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Número de trámite ya existe' })
    res.status(500).json({ error: 'Error interno' })
  }
})

// PUT /tramites/:id
router.put('/:id', auth, async (req, res) => {
  const { numero, tipo, cliente, fecha_arribo, bl, naviera, da, factura_comercial, factura_intraservice, factura_agente, observaciones } = req.body
  try {
    const { rows } = await db.query(
      `UPDATE tramites SET numero=$1, tipo=$2, cliente=$3, fecha_arribo=$4, bl=$5, naviera=$6, da=$7,
       factura_comercial=$8, factura_intraservice=$9, factura_agente=$10, observaciones=$11
       WHERE id=$12 RETURNING *`,
      [numero, tipo, cliente, fecha_arribo || null, bl, naviera, da, factura_comercial, factura_intraservice, factura_agente, observaciones, req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' })
    res.json(rows[0])
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// PATCH /tramites/:id/estado
router.patch('/:id/estado', auth, async (req, res) => {
  const { estado, motivo } = req.body
  if (!estado) return res.status(400).json({ error: 'estado requerido' })

  try {
    const current = await db.query('SELECT estado FROM tramites WHERE id = $1', [req.params.id])
    if (!current.rows[0]) return res.status(404).json({ error: 'No encontrado' })

    const { rows } = await db.query('UPDATE tramites SET estado=$1 WHERE id=$2 RETURNING *', [estado, req.params.id])

    await db.query(
      `INSERT INTO tramite_estados (tramite_id, estado_anterior, estado_nuevo, motivo, created_by) VALUES ($1,$2,$3,$4,$5)`,
      [req.params.id, current.rows[0].estado, estado, motivo || null, req.user.id]
    )
    await db.query(
      `INSERT INTO auditoria (tramite_id, user_id, accion, detalle) VALUES ($1,$2,'estado_cambiado',$3)`,
      [req.params.id, req.user.id, JSON.stringify({ de: current.rows[0].estado, a: estado, motivo })]
    )
    res.json(rows[0])
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

module.exports = router
