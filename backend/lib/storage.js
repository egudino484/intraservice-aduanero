const fs = require('fs')
const path = require('path')

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../uploads')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

async function uploadFile(buffer, key, mimetype) {
  const dest = path.join(UPLOADS_DIR, key)
  ensureDir(path.dirname(dest))
  fs.writeFileSync(dest, buffer)
  return `/files/${key}`
}

async function deleteFile(key) {
  const dest = path.join(UPLOADS_DIR, key)
  if (fs.existsSync(dest)) fs.unlinkSync(dest)
}

module.exports = { uploadFile, deleteFile, UPLOADS_DIR }
