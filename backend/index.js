require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const { UPLOADS_DIR } = require('./lib/storage')

const app = express()
app.use(cors())
app.use(express.json())
app.use('/files', express.static(UPLOADS_DIR))

app.use('/auth',                          require('./routes/auth'))
app.use('/tramites',                      require('./routes/tramites'))
app.use('/tramites/:tramiteId/gastos',    require('./routes/gastos'))
app.use('/tramites/:tramiteId/anticipos', require('./routes/anticipos'))
app.use('/tramites/:tramiteId/documentos',require('./routes/documentos'))
app.use('/auditoria',                     require('./routes/auditoria'))

app.get('/health', (_, res) => res.json({ ok: true }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`API corriendo en puerto ${PORT}`))
