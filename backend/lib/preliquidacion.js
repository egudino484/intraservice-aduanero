// Cálculo de la preliquidación, calcado de la plantilla que usa Intraservice
// (PRE LIQUIDACION DE IMPORTACION, T26-628). Las tarifas no están fijas en el
// código: cada trámite guarda las suyas y estos valores son el punto de partida.
//
// ⚠️ Mismo cálculo en calcPreliq() de app.js: si se toca uno, tocar el otro.
// seguroPct (% del FOB) y no "seguro": en las preliquidaciones viejas "seguro" guardaba el
// monto cargado a mano, y leerlo como % daría un seguro disparatado.
const TARIFAS_DEFECTO = { adValorem: 0, fodinfa: 0.5, iva: 15, seguroPct: 1 }

// Gastos aduaneros de la preliquidación, en el orden de la plantilla
const GASTOS_ADUANEROS = [
  ['vb', 'V/B Consolidadora'],
  ['thc', 'THC / Flete'],
  ['blDestino', 'BL Destino'],
  ['almacenaje', 'Almacenaje'],
  ['otros', 'Otros gastos'],
]
// Gastos que entran en la base del IVA. Por defecto V/B y BL destino, que es lo
// que reproduce la plantilla (IVA 12.104,11). No siempre es así (confirmado por
// Nicole), así que cada trámite puede elegir cuáles: preliquidacion.enBaseIva.
const EN_BASE_IVA = ['vb', 'blDestino']

const num = v => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}
const seguroCargado = v => v !== undefined && v !== null && String(v).trim() !== '' && Number.isFinite(parseFloat(v))

function calcular(preliq = {}) {
  const p = { ...TARIFAS_DEFECTO, ...(preliq || {}) }
  const fob = num(p.fob), flete = num(p.flete)
  const cfr = fob + flete
  // Seguro: 1% del FOB por defecto (pedido de Nicole, 12-oct). Si se cargó un
  // valor a mano (seguroMonto) manda ese; vacío vuelve al cálculo automático.
  const seguroManual = seguroCargado(p.seguroMonto)
  const seguro = seguroManual ? num(p.seguroMonto) : fob * num(p.seguroPct) / 100
  const cif = cfr + seguro

  const gastos = Object.fromEntries(GASTOS_ADUANEROS.map(([k]) => [k, num(p[k])]))
  const adValorem = cif * num(p.adValorem) / 100
  const fodinfa   = cif * num(p.fodinfa) / 100
  const enBaseIva = Array.isArray(p.enBaseIva) ? p.enBaseIva : EN_BASE_IVA
  const baseIva   = cif + adValorem + fodinfa + enBaseIva.reduce((s, k) => s + (gastos[k] || 0), 0)
  const iva       = baseIva * num(p.iva) / 100
  const totalImpuestos = adValorem + fodinfa + iva
  const totalGastos = Object.values(gastos).reduce((s, v) => s + v, 0)

  return {
    cantidad: p.cantidad || '', unidad: p.unidad || '',
    fob, flete, cfr, seguro, cif, seguroManual,
    tarifas: { adValorem: num(p.adValorem), fodinfa: num(p.fodinfa), iva: num(p.iva), seguroPct: num(p.seguroPct) },
    impuestos: { adValorem, fodinfa, iva }, enBaseIva, baseIva,
    totalImpuestos,
    gastos, totalGastos,
    anticipo: num(p.anticipo), garantia: num(p.garantia),
  }
}

// Texto de la fila del seguro en PDF y Excel
const etiquetaSeguro = r => r.seguroManual ? 'Seguro (valor cargado)' : `Seguro (${r.tarifas.seguroPct}% del FOB)`

module.exports = { calcular, etiquetaSeguro, TARIFAS_DEFECTO, GASTOS_ADUANEROS }
