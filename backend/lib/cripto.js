const crypto = require('crypto')

// Cifrado simétrico para datos sensibles que hay que poder mostrar de vuelta
// (la clave de ECUAPASS), a diferencia de las contraseñas de usuario, que van
// hasheadas con bcrypt y nunca se recuperan.
//
// Decisión de Edison: se usa JWT_SECRET como llave, sin variable aparte.
// ECUAPASS_KEY sigue teniendo prioridad por si algún día se separa.
// ⚠️ Rotar JWT_SECRET dejaría las claves guardadas indescifrables: para
// cambiarlo hay que descifrar con el valor viejo y volver a cifrar con el nuevo.
const SECRETO = process.env.ECUAPASS_KEY || process.env.JWT_SECRET || ''
const SAL = 'intraservice-ecuapass-v1'
const llave = SECRETO ? crypto.scryptSync(SECRETO, SAL, 32) : null

function cifrar(texto) {
  if (!texto) return null
  if (!llave) throw new Error('Falta ECUAPASS_KEY / JWT_SECRET para cifrar')
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', llave, iv)
  const datos = Buffer.concat([c.update(String(texto), 'utf8'), c.final()])
  // iv:tag:datos — todo en base64 para guardarlo en una columna de texto
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), datos.toString('base64')].join(':')
}

function descifrar(guardado) {
  if (!guardado) return null
  if (!llave) throw new Error('Falta ECUAPASS_KEY / JWT_SECRET para descifrar')
  const [iv, tag, datos] = String(guardado).split(':')
  if (!iv || !tag || !datos) return null
  const d = crypto.createDecipheriv('aes-256-gcm', llave, Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(datos, 'base64')), d.final()]).toString('utf8')
}

module.exports = { cifrar, descifrar }
