const router = require('express').Router()
const ExcelJS = require('exceljs')
const auth = require('../middleware/auth')

// POST /export/xlsx — arma un .xlsx con lo que ya está en pantalla.
// Recibe las filas del cliente a propósito: así se exporta exactamente lo que
// el usuario está viendo, con sus filtros aplicados, sin repetir acá la lógica
// de cada listado.
router.post('/xlsx', auth, async (req, res) => {
  const { nombre, columnas, filas } = req.body || {}
  if (!Array.isArray(columnas) || !columnas.length) return res.status(400).json({ error: 'Sin columnas' })
  if (!Array.isArray(filas)) return res.status(400).json({ error: 'Sin filas' })
  if (filas.length > 10000) return res.status(400).json({ error: 'Demasiadas filas (máximo 10.000)' })

  try {
    const hoja = (nombre || 'Datos').slice(0, 28).replace(/[\\/*?:[\]]/g, ' ')
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(hoja)

    ws.columns = columnas.map(c => ({
      header: c.label || c.key,
      key: c.key,
      width: Math.min(Math.max((c.label || c.key).length + 4, 12), 40),
    }))
    ws.getRow(1).font = { bold: true }

    for (const fila of filas) {
      const r = ws.addRow(columnas.map(c => fila[c.key] ?? ''))
      r.eachCell(celda => { if (typeof celda.value === 'number') celda.numFmt = '#,##0.00' })
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } }
    ws.views = [{ state: 'frozen', ySplit: 1 }]

    res.attachment(`${(nombre || 'export').replace(/[^\w.-]+/g, '_')}.xlsx`)
    await wb.xlsx.write(res)
    res.end()
  } catch (err) {
    console.error('Error armando xlsx:', err.message)
    if (!res.headersSent) res.status(500).json({ error: 'Error interno' })
  }
})

module.exports = router
