// Cálculo de la preliquidación. Las tarifas no están fijas en el código: cada
// trámite guarda las suyas y estos valores son solo el punto de partida.
const TARIFAS_DEFECTO = { adValorem: 0, fodinfa: 0.5, iva: 15, seguridad: 0 }

const num = v => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

function calcular(preliq = {}) {
  const p = { ...TARIFAS_DEFECTO, ...(preliq || {}) }
  const fob = num(p.fob), flete = num(p.flete), seguro = num(p.seguro)
  const cfr = fob + flete
  const cif = cfr + seguro

  // El orden importa: cada impuesto se apoya en los anteriores
  const adValorem = cif * num(p.adValorem) / 100
  const fodinfa   = cif * num(p.fodinfa) / 100
  const iva       = (cif + adValorem + fodinfa) * num(p.iva) / 100
  const seguridad = (adValorem + fodinfa + iva) * num(p.seguridad) / 100
  const totalImpuestos = adValorem + fodinfa + iva + seguridad

  return {
    fob, flete, seguro, cfr, cif,
    tarifas: { adValorem: num(p.adValorem), fodinfa: num(p.fodinfa), iva: num(p.iva), seguridad: num(p.seguridad) },
    impuestos: { adValorem, fodinfa, iva, seguridad },
    totalImpuestos,
  }
}

module.exports = { calcular, TARIFAS_DEFECTO }
