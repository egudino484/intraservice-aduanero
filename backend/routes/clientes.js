const router = require('express').Router()
const db = require('../db')
const auth = require('../middleware/auth')
const { cifrar, descifrar } = require('../lib/cripto')

function noVisor(req, res, next) {
  if (req.user.role === 'visor') return res.status(403).json({ error: 'Sin permiso para modificar' })
  next()
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' })
  next()
}

// La clave de ECUAPASS nunca sale en los listados: solo se informa si existe.
const COLUMNAS = `id, ruc, nombre, descripcion, telefono, emails, created_at,
  (ecuapass_cifrado IS NOT NULL) AS tiene_ecuapass`

const normEmails = v => {
  const lista = Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/)
  return lista.map(e => e.trim().toLowerCase()).filter(Boolean)
}

// GET /clientes
router.get('/', auth, async (req, res) => {
  const { search } = req.query
  try {
    const { rows } = await db.query(
      `SELECT ${COLUMNAS} FROM clientes
       ${search ? 'WHERE nombre ILIKE $1 OR ruc ILIKE $1' : ''}
       ORDER BY nombre`,
      search ? [`%${search}%`] : []
    )
    res.json(rows)
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// POST /clientes
router.post('/', auth, noVisor, async (req, res) => {
  const { ruc, nombre, descripcion, telefono, emails, ecuapass } = req.body
  if (!nombre) return res.status(400).json({ error: 'nombre requerido' })
  try {
    const { rows } = await db.query(
      `INSERT INTO clientes (ruc, nombre, descripcion, telefono, emails, ecuapass_cifrado, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLUMNAS}`,
      [ruc || null, nombre.trim(), descripcion || null, telefono || null,
       JSON.stringify(normEmails(emails)), ecuapass ? cifrar(ecuapass) : null, req.user.id]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un cliente con ese RUC o nombre' })
    res.status(500).json({ error: 'Error interno' })
  }
})

// PATCH /clientes/:id
router.patch('/:id', auth, noVisor, async (req, res) => {
  const { ruc, nombre, descripcion, telefono, emails, ecuapass } = req.body
  const campos = []
  const vals = []
  let i = 1
  if (ruc !== undefined)         { campos.push(`ruc=$${i++}`); vals.push(ruc || null) }
  if (nombre !== undefined)      { campos.push(`nombre=$${i++}`); vals.push(String(nombre).trim()) }
  if (descripcion !== undefined) { campos.push(`descripcion=$${i++}`); vals.push(descripcion || null) }
  if (telefono !== undefined)    { campos.push(`telefono=$${i++}`); vals.push(telefono || null) }
  if (emails !== undefined)      { campos.push(`emails=$${i++}`); vals.push(JSON.stringify(normEmails(emails))) }
  // ecuapass: '' borra la clave guardada; ausente la deja como está
  if (ecuapass !== undefined)    { campos.push(`ecuapass_cifrado=$${i++}`); vals.push(ecuapass ? cifrar(ecuapass) : null) }
  if (!campos.length) return res.status(400).json({ error: 'Nada que actualizar' })

  vals.push(req.params.id)
  try {
    const { rows } = await db.query(
      `UPDATE clientes SET ${campos.join(', ')} WHERE id=$${i} RETURNING ${COLUMNAS}`, vals
    )
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' })
    res.json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un cliente con ese RUC o nombre' })
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /clientes/:id/ecuapass — solo admin, y queda registrado quién la vio
router.get('/:id/ecuapass', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT nombre, ecuapass_cifrado FROM clientes WHERE id=$1', [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' })
    if (!rows[0].ecuapass_cifrado) return res.json({ ecuapass: null })

    await db.query(
      `INSERT INTO auditoria (user_id, accion, detalle) VALUES ($1,'ecuapass_consultada',$2)`,
      [req.user.id, JSON.stringify({ cliente_id: req.params.id, cliente: rows[0].nombre })]
    )
    res.json({ ecuapass: descifrar(rows[0].ecuapass_cifrado) })
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// DELETE /clientes/:id — solo admin, y solo si no hay trámites con ese nombre
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const cliente = await db.query('SELECT nombre FROM clientes WHERE id=$1', [req.params.id])
    if (!cliente.rows[0]) return res.status(404).json({ error: 'No encontrado' })

    const uso = await db.query('SELECT count(*)::int AS n FROM tramites WHERE cliente = $1', [cliente.rows[0].nombre])
    if (uso.rows[0].n > 0) return res.status(409).json({ error: `Tiene ${uso.rows[0].n} trámite(s) asociados` })

    await db.query('DELETE FROM clientes WHERE id=$1', [req.params.id])
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

module.exports = router
