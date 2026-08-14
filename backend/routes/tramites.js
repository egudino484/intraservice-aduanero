const router = require('express').Router()
const ExcelJS = require('exceljs')
const db = require('../db')
const auth = require('../middleware/auth')
const { calcular } = require('../lib/preliquidacion')

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

// GET /tramites/next-numero — sugerencia de consecutivo del año (debe ir antes de /:id)
router.get('/next-numero', auth, async (req, res) => {
  const yy = String(new Date().getFullYear()).slice(-2)
  const prefijo = `T${yy}-`
  try {
    const { rows } = await db.query(
      `SELECT COALESCE(MAX(SUBSTRING(numero FROM '^T\\d{2}-(\\d+)$')::int), 0) AS ultimo
       FROM tramites WHERE numero ~ $1`,
      [`^T${yy}-\\d+$`]
    )
    const secuencia = Number(rows[0].ultimo) + 1
    res.json({ numero: prefijo + String(secuencia).padStart(3, '0'), prefijo, secuencia })
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
      db.query(
        `SELECT g.*, COALESCE(
           json_agg(json_build_object('id', a.id, 'url', a.url, 'nombre', a.nombre)
                    ORDER BY a.created_at) FILTER (WHERE a.id IS NOT NULL), '[]') AS archivos
         FROM gastos g
         LEFT JOIN gasto_archivos a ON a.gasto_id = g.id
         WHERE g.tramite_id = $1
         GROUP BY g.id
         ORDER BY g.created_at`, [req.params.id]),
      db.query('SELECT * FROM anticipos WHERE tramite_id = $1 ORDER BY fecha', [req.params.id]),
      db.query('SELECT * FROM documentos WHERE tramite_id = $1 ORDER BY created_at', [req.params.id]),
      db.query('SELECT te.*, u.name AS user_name FROM tramite_estados te JOIN users u ON u.id = te.created_by WHERE te.tramite_id = $1 ORDER BY te.created_at DESC', [req.params.id])
    ])

    res.json({ ...rows[0], gastos: gastos.rows, anticipos: anticipos.rows, documentos: documentos.rows, historial: estados.rows })
  } catch { res.status(500).json({ error: 'Error interno' }) }
})

// Campos de texto sueltos del form; se guardan tal cual llegan
const EXTRA = ['mercaderia','almacenera','mrn','liq_senae','sub_partida','n_entrega','transporte','proveedor','contenedores','cda','operacion_otro','regimen','regimen_otro','fecha_llegada','preliquidacion']
// preliquidacion es JSONB: va aparte porque hay que serializarla
const extraValores = body => EXTRA.map(c =>
  c === 'preliquidacion' ? JSON.stringify(body.preliquidacion || {}) : (body[c] ?? null))

// GET /tramites/:id/preliquidacion.xlsx — preliquidación + gastos + saldo
router.get('/:id/preliquidacion.xlsx', auth, async (req, res) => {
  try {
    const t = await db.query('SELECT * FROM tramites WHERE id=$1', [req.params.id])
    if (!t.rows[0]) return res.status(404).json({ error: 'No encontrado' })
    const tramite = t.rows[0]

    const [gastos, anticipos] = await Promise.all([
      db.query('SELECT concepto, proveedor, n_factura, monto, categoria FROM gastos WHERE tramite_id=$1 ORDER BY created_at', [req.params.id]),
      db.query('SELECT fecha, descripcion, n_comprobante, monto, forma_pago FROM anticipos WHERE tramite_id=$1 ORDER BY fecha', [req.params.id]),
    ])
    // Las tarifas configuradas hacen de base si el trámite no tiene las suyas
    const cfg = await db.query(`SELECT valor FROM configuracion WHERE clave='tarifas'`)
    const p = calcular({ ...(cfg.rows[0]?.valor || {}), ...(tramite.preliquidacion || {}) })
    const totalGastos = gastos.rows.reduce((s, g) => s + Number(g.monto || 0), 0)
    const totalAnticipos = anticipos.rows.reduce((s, a) => s + Number(a.monto || 0), 0)

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Preliquidación')
    ws.columns = [{ width: 34 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 14 }]

    const titulo = txt => {
      const f = ws.addRow([txt])
      f.font = { bold: true, size: 12 }
      ws.addRow([])
      return f
    }
    const cab = valores => {
      const f = ws.addRow(valores)
      f.font = { bold: true }
      return f
    }
    const dinero = fila => { fila.eachCell(c => { if (typeof c.value === 'number') c.numFmt = '#,##0.00' }) }

    titulo(`Preliquidación · ${tramite.numero} · ${tramite.cliente}`)
    ws.addRow(['Operación', tramite.tipo === 'Otro' ? (tramite.operacion_otro || 'Otro') : tramite.tipo])
    ws.addRow(['Régimen', tramite.regimen === 'Otro (especificar)' ? (tramite.regimen_otro || '') : (tramite.regimen || '')])
    ws.addRow(['Sub partida', tramite.sub_partida || ''])
    ws.addRow(['BL / AWB', tramite.bl || ''])
    ws.addRow(['DAI / DAE', tramite.da || ''])
    ws.addRow([])

    cab(['Valores de la mercadería', 'USD'])
    ;[['FOB', p.fob], ['Flete', p.flete], ['CFR', p.cfr], ['Seguro', p.seguro], ['CIF', p.cif]]
      .forEach(([k, v]) => dinero(ws.addRow([k, v])))
    ws.addRow([])

    cab(['Impuesto', 'Tarifa %', 'Valor USD'])
    ;[['Ad Valorem', p.tarifas.adValorem, p.impuestos.adValorem],
      ['Fodinfa', p.tarifas.fodinfa, p.impuestos.fodinfa],
      ['IVA', p.tarifas.iva, p.impuestos.iva],
      ['Seguridad', p.tarifas.seguridad, p.impuestos.seguridad]]
      .forEach(f => dinero(ws.addRow(f)))
    dinero(cab(['Total impuestos', '', p.totalImpuestos]))
    ws.addRow([])

    cab(['Gastos pagados', 'Proveedor', 'N° factura', 'Categoría', 'Monto USD'])
    gastos.rows.forEach(g => dinero(ws.addRow([g.concepto, g.proveedor || '', g.n_factura || '', g.categoria || '', Number(g.monto || 0)])))
    dinero(cab(['Total gastos', '', '', '', totalGastos]))
    ws.addRow([])

    cab(['Anticipos del cliente', 'Referencia', 'N° comprobante', 'Forma de pago', 'Monto USD'])
    anticipos.rows.forEach(a => dinero(ws.addRow([
      a.fecha ? new Date(a.fecha).toISOString().slice(0, 10) : '', a.descripcion || '',
      a.n_comprobante || '', a.forma_pago || '', Number(a.monto || 0)])))
    dinero(cab(['Total anticipos', '', '', '', totalAnticipos]))
    ws.addRow([])

    dinero(cab(['Saldo (gastos − anticipos)', '', '', '', totalGastos - totalAnticipos]))

    res.attachment(`${(tramite.numero || 'tramite').replace(/[^\w.-]+/g, '_')}-preliquidacion.xlsx`)
    await wb.xlsx.write(res)
    res.end()
  } catch (err) {
    console.error('Error armando xlsx:', err.message)
    if (!res.headersSent) res.status(500).json({ error: 'Error interno' })
  }
})

// POST /tramites
router.post('/', auth, async (req, res) => {
  const { numero, tipo, cliente, fecha_arribo, bl, naviera, da, factura_comercial, factura_intraservice, factura_agente, observaciones, custom_props, etiquetas } = req.body
  if (!numero || !tipo || !cliente) return res.status(400).json({ error: 'numero, tipo y cliente son requeridos' })

  try {
    const { rows } = await db.query(
      `INSERT INTO tramites (numero, tipo, cliente, fecha_arribo, bl, naviera, da, factura_comercial, factura_intraservice, factura_agente, observaciones, custom_props, etiquetas, created_by, ${EXTRA.join(', ')})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,${EXTRA.map((_, i) => '$' + (15 + i)).join(',')}) RETURNING *`,
      [numero, tipo, cliente, fecha_arribo || null, bl, naviera, da, factura_comercial, factura_intraservice, factura_agente, observaciones, JSON.stringify(custom_props||[]), JSON.stringify(etiquetas||[]), req.user.id, ...extraValores(req.body)]
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
  const { numero, tipo, cliente, fecha_arribo, bl, naviera, da, factura_comercial, factura_intraservice, factura_agente, observaciones, custom_props, etiquetas } = req.body
  try {
    const { rows } = await db.query(
      `UPDATE tramites SET numero=$1, tipo=$2, cliente=$3, fecha_arribo=$4, bl=$5, naviera=$6, da=$7,
       factura_comercial=$8, factura_intraservice=$9, factura_agente=$10, observaciones=$11,
       custom_props=$12, etiquetas=$13, ${EXTRA.map((c, i) => `${c}=$${15 + i}`).join(', ')}
       WHERE id=$14 RETURNING *`,
      [numero, tipo, cliente, fecha_arribo || null, bl, naviera, da, factura_comercial, factura_intraservice, factura_agente, observaciones, JSON.stringify(custom_props||[]), JSON.stringify(etiquetas||[]), req.params.id, ...extraValores(req.body)]
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
