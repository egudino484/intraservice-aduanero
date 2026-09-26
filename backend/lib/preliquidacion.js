// Cálculo de la preliquidación, calcado de la plantilla que usa Intraservice
// (PRE LIQUIDACION DE IMPORTACION, T26-628). Las tarifas no están fijas en el
// código: cada trámite guarda las suyas y estos valores son el punto de partida.
//
// ⚠️ Mismo cálculo en calcPreliq() de app.js: si se toca uno, tocar el otro.
// seguroPct y no "seguro": en las preliquidaciones viejas "seguro" guardaba el
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
// Gastos que entran en la base del IVA. Deducido de la plantilla: su IVA
// (12.104,11) solo cuadra sumando V/B y BL destino a CIF + impuestos.
const EN_BASE_IVA = ['vb', 'blDestino']

const num = v => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

function calcular(preliq = {}) {
  const p = { ...TARIFAS_DEFECTO, ...(preliq || {}) }
  const fob = num(p.fob), flete = num(p.flete)
  const cfr = fob + flete
  // El seguro siempre es un % del CFR (indicación de Intraservice)
  const seguro = cfr * num(p.seguroPct) / 100
  const cif = cfr + seguro

  const gastos = Object.fromEntries(GASTOS_ADUANEROS.map(([k]) => [k, num(p[k])]))
  const adValorem = cif * num(p.adValorem) / 100
  const fodinfa   = cif * num(p.fodinfa) / 100
  const baseIva   = cif + adValorem + fodinfa + EN_BASE_IVA.reduce((s, k) => s + gastos[k], 0)
  const iva       = baseIva * num(p.iva) / 100
  const totalImpuestos = adValorem + fodinfa + iva
  const totalGastos = Object.values(gastos).reduce((s, v) => s + v, 0)

  return {
    cantidad: p.cantidad || '', unidad: p.unidad || '',
    fob, flete, cfr, seguro, cif,
    tarifas: { adValorem: num(p.adValorem), fodinfa: num(p.fodinfa), iva: num(p.iva), seguroPct: num(p.seguroPct) },
    impuestos: { adValorem, fodinfa, iva },
    totalImpuestos,
    gastos, totalGastos,
    anticipo: num(p.anticipo), garantia: num(p.garantia),
  }
}

module.exports = { calcular, TARIFAS_DEFECTO, GASTOS_ADUANEROS }
