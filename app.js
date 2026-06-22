// ── CONFIG ────────────────────────────────────────────────────────
const API_URL = '';

// ── STATE ─────────────────────────────────────────────────────────
let currentUser = null;
let currentTramiteId = null;
let creatingMode = false;
let gastoData = [];
let anticipoData = [];
let documentoData = [];

// ── AUTH ──────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('sa_token'); }

async function apiFetch(path, opts = {}) {
  const isForm = opts.body instanceof FormData;
  const headers = { Authorization: 'Bearer ' + getToken() };
  if (!isForm) headers['Content-Type'] = 'application/json';
  try {
    const res = await fetch(API_URL + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    if (res.status === 401) { logout(); return null; }
    return await res.json();
  } catch(e) { showNotif('Error de conexión'); return null; }
}

async function doLogin() {
  const email = document.getElementById('login-email').value;
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'Ingresando...';
  try {
    const res = await fetch(API_URL + '/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Credenciales incorrectas');
    localStorage.setItem('sa_token', data.token);
    currentUser = data.user;
    document.getElementById('login-overlay').style.display = 'none';
    initApp();
  } catch(e) { errEl.textContent = e.message; }
  btn.disabled = false; btn.textContent = 'Ingresar';
}

function logout() {
  localStorage.removeItem('sa_token');
  currentUser = null;
  gastoData = []; anticipoData = []; documentoData = []; currentTramiteId = null;
  const navTramite = document.getElementById('nav-tramite');
  if (navTramite) navTramite.style.display = 'none';
  document.getElementById('login-overlay').style.display = 'flex';
}

function applyUserToUI() {
  if (!currentUser) return;
  document.getElementById('user-name').textContent = currentUser.name;
  document.getElementById('user-avatar').textContent = currentUser.initials;
  document.getElementById('user-role').textContent = { admin:'Administrador', operador:'Operador', visor:'Visor' }[currentUser.role] || currentUser.role;
  if (currentUser.role === 'admin') {
    document.getElementById('nav-usuarios').style.display = 'flex';
  }
}

async function initApp() {
  applyUserToUI();
  updateNavierasDatalist();
  updateAlmacenerasDatalist();
  updateClientesDatalist();
  updateMercaderiaDatalist();
  nav('dashboard', document.getElementById('nav-dashboard'));
  loadDashboard();
  loadBitacora();
}

// ── DASHBOARD ─────────────────────────────────────────────────────
async function loadDashboard() {
  const tramites = await apiFetch('/tramites');
  if (!tramites) return;
  const byE = e => tramites.filter(t => t.estado === e).length;
  const metricsRow = document.querySelector('#screen-dashboard .metrics-row');
  if (metricsRow) metricsRow.innerHTML = `
    <div class="metric"><div class="metric-label">Trámites</div><div class="metric-value">${tramites.length}</div><div class="metric-sub">registrados</div></div>
    <div class="metric"><div class="metric-label">En proceso</div><div class="metric-value" style="color:var(--amber)">${byE('En proceso')}</div><div class="metric-sub">requieren acción</div></div>
    <div class="metric"><div class="metric-label">Concluidos</div><div class="metric-value" style="color:var(--green)">${byE('Concluido')}</div><div class="metric-sub">finalizados</div></div>
    <div class="metric"><div class="metric-label">Pendiente doc.</div><div class="metric-value">${byE('Pendiente documentación')}</div><div class="metric-sub">revisar</div></div>
  `;
  const tbody = document.querySelector('#screen-dashboard .panel tbody');
  if (!tbody) return;
  const bc = { Concluido:'green','En proceso':'amber','Pendiente documentación':'red',Cancelado:'gray' };
  tbody.innerHTML = tramites.slice(0,7).map(t => `
    <tr>
      <td><span class="row-link" onclick="openTramite('${t.id}')">${t.numero}</span></td>
      <td>${t.cliente}</td><td>${t.tipo}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${t.bl||'—'}</td>
      <td><span class="badge badge-${bc[t.estado]||'gray'}">${t.estado}</span></td>
      <td style="color:var(--text-3);font-size:12px">${fmtDate(t.created_at)}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:20px;font-size:12px">Sin trámites</td></tr>';
}

// ── BITÁCORA ──────────────────────────────────────────────────────
let bitacoraData = [];
async function loadBitacora() {
  const data = await apiFetch('/tramites');
  if (!data) return;
  bitacoraData = data;
  // Agregar clientes del sistema al datalist
  data.forEach(t => { if (t.cliente) saveCliente(t.cliente); });
  updateClientesDatalist();
  renderBitacora();
}

function renderBitacora() {
  const search = (document.getElementById('b-search')?.value || '').toLowerCase();
  const tipo = document.getElementById('b-tipo')?.value || '';
  const estado = document.getElementById('b-estado')?.value || '';
  const bc = { Concluido:'green','En proceso':'amber','Pendiente documentación':'red',Cancelado:'gray' };
  const filtered = bitacoraData.filter(t =>
    (!search || t.numero.toLowerCase().includes(search) || t.cliente.toLowerCase().includes(search) || (t.bl||'').toLowerCase().includes(search) || (t.da||'').toLowerCase().includes(search)) &&
    (!tipo || t.tipo === tipo) &&
    (!estado || t.estado === estado)
  );
  const tbody = document.getElementById('bitacora-body');
  if (!tbody) return;
  tbody.innerHTML = filtered.length
    ? filtered.map(t => `<tr>
        <td><span class="row-link" onclick="openTramite('${t.id}')">${t.numero}</span></td>
        <td>${t.cliente}</td>
        <td>${t.tipo==='Importación'?'IMP':'EXP'}</td>
        <td style="font-family:'DM Mono',monospace;font-size:11px">${t.bl||'—'}</td>
        <td style="font-family:'DM Mono',monospace;font-size:11px">${t.da||'—'}</td>
        <td>${t.naviera||'—'}</td>
        <td><span class="badge badge-${bc[t.estado]||'gray'}">${t.estado}</span></td>
      </tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:20px;font-size:12px">Sin resultados</td></tr>';
}

// ── TRAMITE ───────────────────────────────────────────────────────
async function openTramite(id) {
  exitCreatingMode();
  showNotif('Cargando trámite...');
  currentTramiteId = id;
  const data = await apiFetch('/tramites/' + id);
  if (!data) return;
  gastoData = data.gastos || [];
  anticipoData = data.anticipos || [];
  documentoData = data.documentos || [];
  applyTramiteForm(data);
  renderAll();
  renderDocumentos();
  renderHistorial(data.historial || []);
  pageTitles.tramite = 'Trámite ' + data.numero + ' · ' + data.cliente;
  topbarBadges.tramite = '<span class="badge badge-' + badgeEstado(data.estado) + '">' + data.estado + '</span>';
  const estadoSel = document.getElementById('estado-select');
  if (estadoSel) estadoSel.value = data.estado;
  const navTramite = document.getElementById('nav-tramite');
  if (navTramite) navTramite.style.display = '';
  nav('tramite', navTramite);
  setTab(document.querySelectorAll('#screen-tramite .tab')[1], 't-docs');
}

function badgeEstado(e) {
  return { Concluido:'green','En proceso':'amber','Pendiente documentación':'red',Cancelado:'gray' }[e] || 'gray';
}

function exitCreatingMode() {
  creatingMode = false;
  const numEl = document.querySelector('[data-field="numero"]');
  if (numEl) numEl.setAttribute('readonly', '');
  ['tab-docs', 'tab-estado', 'tab-liquidacion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
  const saveBtn = document.querySelector('#t-datos .section-actions .btn-primary');
  if (saveBtn) saveBtn.textContent = 'Guardar cambios';
}

function newTramiteUI() {
  creatingMode = true;
  currentTramiteId = null;
  gastoData = []; anticipoData = [];
  document.querySelectorAll('#t-datos [data-field]').forEach(el => {
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });
  const numEl = document.querySelector('[data-field="numero"]');
  if (numEl) numEl.removeAttribute('readonly');
  ['tab-docs', 'tab-estado', 'tab-liquidacion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const datosTab = document.getElementById('tab-datos');
  if (datosTab) setTab(datosTab, 't-datos');
  const saveBtn = document.querySelector('#t-datos .section-actions .btn-primary');
  if (saveBtn) saveBtn.textContent = 'Crear trámite';
  pageTitles.tramite = 'Nuevo trámite';
  topbarBadges.tramite = '';
  const navTramite = document.getElementById('nav-tramite');
  if (navTramite) navTramite.style.display = '';
  nav('tramite', navTramite);
}

async function saveTramiteForm() {
  const form = readTramiteForm();
  const navieraVal = document.querySelector('[data-field="naviera"]')?.value || '';
  const almaceneraVal = document.querySelector('[data-field="almacenera"]')?.value || '';
  const clienteVal = document.querySelector('[data-field="cliente"]')?.value || '';
  if (navieraVal) saveNaviera(navieraVal);
  if (almaceneraVal) saveAlmacenera(almaceneraVal);
  if (clienteVal) saveCliente(clienteVal);
  if (creatingMode) {
    if (!form.numero || !form.cliente) { showNotif('N° trámite y cliente son requeridos'); return; }
    const res = await apiFetch('/tramites', {
      method: 'POST',
      body: JSON.stringify({
        numero: form.numero, tipo: form.operacion || 'Importación',
        cliente: form.cliente, fecha_arribo: form.fechaApertura || null,
        bl: form.bl, naviera: form.naviera, da: form.dai,
        factura_comercial: form.factCom, factura_intraservice: form.factIntra,
        observaciones: form.obs,
      })
    });
    if (!res || res.error) { showNotif(res?.error || 'Error al crear'); return; }
    showNotif('Trámite creado');
    loadBitacora(); loadDashboard();
    openTramite(res.id);
    return;
  }
  if (!currentTramiteId) { showNotif('No hay trámite abierto'); return; }
  const res = await apiFetch('/tramites/' + currentTramiteId, {
    method: 'PUT',
    body: JSON.stringify({
      numero: form.numero, tipo: form.operacion, cliente: form.cliente,
      fecha_arribo: form.fechaApertura || null, bl: form.bl, naviera: form.naviera,
      da: form.dai, factura_comercial: form.factCom,
      factura_intraservice: form.factIntra, observaciones: form.obs,
    })
  });
  if (res) { showNotif('Trámite guardado'); loadBitacora(); loadDashboard(); }
}

async function registrarCambioEstado() {
  if (!currentTramiteId) return;
  const estado = document.getElementById('estado-select').value;
  const motivo = document.getElementById('estado-motivo').value;
  const res = await apiFetch('/tramites/' + currentTramiteId + '/estado', {
    method: 'PATCH',
    body: JSON.stringify({ estado, motivo })
  });
  if (!res) return;
  showNotif('Estado actualizado');
  document.getElementById('estado-motivo').value = '';
  topbarBadges.tramite = '<span class="badge badge-' + badgeEstado(estado) + '">' + estado + '</span>';
  document.getElementById('topbar-badge').innerHTML = topbarBadges.tramite;
  const data = await apiFetch('/tramites/' + currentTramiteId);
  if (data) renderHistorial(data.historial || []);
  loadBitacora(); loadDashboard();
}

function renderHistorial(historial) {
  const el = document.getElementById('tramite-historial');
  if (!el) return;
  if (!historial.length) { el.innerHTML = '<p style="font-size:12px;color:var(--text-3);text-align:center;padding:14px">Sin historial</p>'; return; }
  const dotColor = { Concluido:'green','Pendiente documentación':'red','En proceso':'amber' };
  el.innerHTML = historial.map(h => `
    <div class="audit-item">
      <div class="audit-line"><div class="audit-dot ${dotColor[h.estado_nuevo]||''}"></div></div>
      <div>
        <div class="audit-text">Estado → <strong>${h.estado_nuevo}</strong>${h.motivo?' · '+h.motivo:''}</div>
        <div class="audit-meta">${h.user_name||'—'} · ${fmtDate(h.created_at)}</div>
      </div>
    </div>`).join('');
}

// ── USUARIOS ──────────────────────────────────────────────────────
async function loadUsuarios() {
  const data = await apiFetch('/users');
  if (!data) return;
  const tbody = document.getElementById('usuarios-body');
  if (!tbody) return;
  if (!Array.isArray(data) || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:20px;font-size:12px">Sin usuarios</td></tr>';
    return;
  }
  const meId = currentUser ? currentUser.id : null;
  const rows = data.map(u => {
    const activeBadge = u.active ? 'badge-green' : 'badge-gray';
    const activeLabel = u.active ? 'Activo' : 'Inactivo';
    const accionBtn = (u.id === meId)
      ? '<span style="font-size:11px;color:var(--text-3)">Tú</span>'
      : `<button class="btn btn-sm ${u.active ? 'btn-danger' : 'btn-ghost'}" onclick="toggleUserActive('${u.id}',${!u.active})">${u.active ? 'Desactivar' : 'Activar'}</button>`;
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="avatar" style="width:26px;height:26px;font-size:10px;flex-shrink:0">${u.initials || '?'}</div>
          <span style="font-weight:500">${u.name}</span>
        </div>
      </td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text-2)">${u.email}</td>
      <td>
        <select style="font-size:12px;padding:3px 6px;border:1px solid var(--border-strong);border-radius:4px;background:var(--surface)" onchange="updateUser('${u.id}',{role:this.value})">
          <option value="operador"${u.role==='operador'?' selected':''}>Operador</option>
          <option value="visor"${u.role==='visor'?' selected':''}>Visor</option>
          <option value="admin"${u.role==='admin'?' selected':''}>Administrador</option>
        </select>
      </td>
      <td><span class="badge ${activeBadge}">${activeLabel}</span></td>
      <td style="font-size:11px;color:var(--text-3)">${fmtDate(u.created_at)}</td>
      <td>${accionBtn}</td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
}

async function updateUser(id, changes) {
  const res = await apiFetch('/users/' + id, { method: 'PATCH', body: JSON.stringify(changes) });
  if (res && !res.error) showNotif('Usuario actualizado');
  else showNotif(res?.error || 'Error al actualizar');
}

async function toggleUserActive(id, active) {
  await updateUser(id, { active });
  loadUsuarios();
}

function showNewUserForm() {
  document.getElementById('new-user-form').style.display = 'block';
  document.getElementById('nu-name').focus();
}

function hideNewUserForm() {
  document.getElementById('new-user-form').style.display = 'none';
  ['nu-name','nu-email','nu-initials','nu-pass'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('nu-error').textContent = '';
}

async function createUser() {
  const name = document.getElementById('nu-name').value.trim();
  const email = document.getElementById('nu-email').value.trim();
  const initials = document.getElementById('nu-initials').value.trim().toUpperCase();
  const role = document.getElementById('nu-role').value;
  const password = document.getElementById('nu-pass').value;
  const errEl = document.getElementById('nu-error');
  errEl.textContent = '';
  if (!name || !email || !initials || !password) { errEl.textContent = 'Todos los campos son requeridos'; return; }
  if (password.length < 6) { errEl.textContent = 'Contraseña mínimo 6 caracteres'; return; }
  const res = await apiFetch('/users', { method: 'POST', body: JSON.stringify({ name, email, initials, role, password }) });
  if (res && !res.error) {
    showNotif('Usuario creado');
    hideNewUserForm();
    loadUsuarios();
  } else {
    errEl.textContent = res?.error || 'Error al crear usuario';
  }
}

// ── AUDITORÍA ─────────────────────────────────────────────────────
async function loadAuditoria() {
  const data = await apiFetch('/auditoria');
  if (!data) return;
  const labels = { tramite_creado:'Trámite creado', estado_cambiado:'Estado cambiado', gasto_agregado:'Gasto agregado', documento_cargado:'Documento cargado', liquidacion_enviada:'Liquidación enviada' };
  const dotC = { estado_cambiado:'green', gasto_agregado:'', documento_cargado:'', tramite_creado:'blue' };
  const panel = document.querySelector('#screen-auditoria .panel');
  if (!panel) return;
  const title = panel.querySelector('.panel-title');
  panel.innerHTML = '';
  if (title) panel.appendChild(title);
  if (!data.length) { panel.innerHTML += '<p style="font-size:12px;color:var(--text-3);text-align:center;padding:20px">Sin actividad registrada</p>'; return; }
  panel.innerHTML += data.map(a => `
    <div class="audit-item">
      <div class="audit-line"><div class="audit-dot ${dotC[a.accion]||''}"></div></div>
      <div>
        <div class="audit-text">${a.tramite_numero?`<strong style="font-family:'DM Mono',monospace;font-size:12px">${a.tramite_numero}</strong> · `:''}${labels[a.accion]||a.accion}</div>
        <div class="audit-meta">${a.user_name||'—'} · ${fmtDate(a.created_at)}</div>
      </div>
    </div>`).join('');
}

// ── HELPERS ───────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-EC', { day:'2-digit', month:'short', year:'numeric' });
}

const docIcon = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="1" width="9" height="9" rx="1" stroke="#1E4FBF" stroke-width="1"/><line x1="2.5" y1="4" x2="8.5" y2="4" stroke="#1E4FBF" stroke-width=".7"/><line x1="2.5" y1="5.8" x2="8.5" y2="5.8" stroke="#1E4FBF" stroke-width=".7"/></svg>`;

function totalGastos() { return gastoData.reduce((s,g) => s + parseFloat(g.monto||0), 0); }
function totalAnticipos() { return anticipoData.reduce((s,a) => s + parseFloat(a.monto||0), 0); }

const gastoSaveTimers = {};
function saveGastoField(id, field, value) {
  const g = gastoData.find(g => g.id === id);
  if (g) g[field] = field === 'monto' ? parseFloat(value)||0 : value;
  renderAll();
  clearTimeout(gastoSaveTimers[id]);
  gastoSaveTimers[id] = setTimeout(() => {
    const gasto = gastoData.find(g => g.id === id);
    if (gasto && currentTramiteId) apiFetch('/tramites/'+currentTramiteId+'/gastos/'+id, { method:'PUT', body: JSON.stringify(gasto) });
  }, 800);
}

const anticipoSaveTimers = {};
function saveAnticipoField(id, field, value) {
  const a = anticipoData.find(a => a.id === id);
  if (a) a[field] = field === 'monto' ? parseFloat(value)||0 : value;
  renderAll();
  clearTimeout(anticipoSaveTimers[id]);
  anticipoSaveTimers[id] = setTimeout(() => {
    const ant = anticipoData.find(a => a.id === id);
    if (ant && currentTramiteId) apiFetch('/tramites/'+currentTramiteId+'/anticipos/'+id, { method:'PUT', body: JSON.stringify(ant) });
  }, 800);
}

function renderGastos() {
  const tbody = document.getElementById('gastos-body');
  tbody.innerHTML = '';
  let conDoc = 0;
  const cats = ['Agente','Puerto','Transporte','Intraservice','Varios'];
  gastoData.forEach(g => {
    if (g.comprobante_url) conDoc++;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escHtml(g.concepto||'')}" onchange="saveGastoField('${g.id}','concepto',this.value)"></td>
      <td><input type="text" value="${escHtml(g.proveedor||'')}" onchange="saveGastoField('${g.id}','proveedor',this.value)"></td>
      <td><input type="text" value="${escHtml(g.n_factura||'')}" style="font-family:'DM Mono',monospace;font-size:11px" onchange="saveGastoField('${g.id}','n_factura',this.value)"></td>
      <td><input type="number" value="${parseFloat(g.monto||0).toFixed(2)}" style="width:90px;font-family:'DM Mono',monospace" onchange="saveGastoField('${g.id}','monto',this.value)"></td>
      <td><select onchange="saveGastoField('${g.id}','categoria',this.value)">${cats.map(c=>`<option${g.categoria===c?' selected':''}>${c}</option>`).join('')}</select></td>
      <td>${g.comprobante_url ? `<a class="doc-chip" href="${g.comprobante_url}" target="_blank">${docIcon}${g.comprobante_url.split('/').pop()}</a>` : `<button class="btn btn-sm" onclick="attachGastoDoc('${g.id}')">+ Adjuntar</button>`}</td>
      <td><button class="btn btn-sm btn-danger" onclick="removeGasto('${g.id}')">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
  const total = totalGastos();
  document.getElementById('total-footer').textContent = '$' + total.toFixed(2);
  document.getElementById('resumen-total').textContent = '$' + total.toFixed(2);
  document.getElementById('resumen-docs').textContent = conDoc + ' / ' + gastoData.length;
  const falt = gastoData.length - conDoc;
  document.getElementById('resumen-faltantes').textContent = falt;
  document.getElementById('resumen-faltantes').style.color = falt > 0 ? 'var(--amber)' : 'var(--green)';
}

function renderAnticipos() {
  const tbody = document.getElementById('anticipos-body');
  tbody.innerHTML = '';
  const formas = ['Transferencia','Depósito','Cheque','Efectivo','Otro'];
  anticipoData.forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="date" value="${a.fecha?.split('T')[0]||''}" style="font-size:11px" onchange="saveAnticipoField('${a.id}','fecha',this.value)"></td>
      <td><input type="text" value="${escHtml(a.descripcion||'')}" onchange="saveAnticipoField('${a.id}','descripcion',this.value)"></td>
      <td><input type="text" value="${escHtml(a.n_comprobante||'')}" style="font-family:'DM Mono',monospace;font-size:11px" onchange="saveAnticipoField('${a.id}','n_comprobante',this.value)"></td>
      <td><input type="number" value="${parseFloat(a.monto||0).toFixed(2)}" style="width:90px;font-family:'DM Mono',monospace;color:var(--green)" onchange="saveAnticipoField('${a.id}','monto',this.value)"></td>
      <td><select onchange="saveAnticipoField('${a.id}','forma_pago',this.value)" style="font-size:11px">${formas.map(f=>`<option${a.forma_pago===f?' selected':''}>${f}</option>`).join('')}</select></td>
      <td>${a.documento_url ? `<a class="doc-chip" href="${a.documento_url}" target="_blank">${docIcon}${a.documento_url.split('/').pop()}</a>` : `<button class="btn btn-sm" onclick="attachAnticipoDoc('${a.id}')">+ Adjuntar</button>`}</td>
      <td><button class="btn btn-sm btn-danger" onclick="removeAnticipo('${a.id}')">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
  const total = totalAnticipos();
  document.getElementById('anticipo-footer').textContent = '$' + total.toFixed(2);
  document.getElementById('resumen-anticipos').textContent = '$' + total.toFixed(2);
}

function renderLiqAnticipos() {
  const tbody = document.getElementById('liq-anticipos-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  anticipoData.forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size:11px;color:var(--text-2)">${(a.fecha||'').split('T')[0]}</td>
      <td style="font-size:12px">${a.descripcion||''}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text-2)">${a.forma_pago||'—'}</td>
      <td style="font-family:'DM Mono',monospace;color:var(--green)">$${parseFloat(a.monto||0).toFixed(2)}</td>
      <td>${a.documento_url ? `<a class="doc-chip" style="font-size:10px" href="${a.documento_url}" target="_blank">${docIcon}doc</a>` : `<span style="font-size:11px;color:var(--amber)">Sin doc.</span>`}</td>
    `;
    tbody.appendChild(tr);
  });
  const ta = totalAnticipos();
  const tg = totalGastos();
  const saldo = tg - ta;
  const liqTotal = document.getElementById('liq-total-anticipos');
  const liqSub = document.getElementById('liq-anticipo-sub');
  const liqSaldo = document.getElementById('liq-saldo');
  const liqLabel = document.getElementById('liq-label');
  if (liqTotal) liqTotal.textContent = '$' + ta.toFixed(2);
  if (liqSub) liqSub.textContent = '– $' + ta.toFixed(2);
  if (liqSaldo && liqLabel) {
    if (saldo > 0) {
      liqSaldo.textContent = '$' + saldo.toFixed(2);
      liqSaldo.style.color = 'var(--red)';
      liqLabel.textContent = 'Saldo a cobrar al cliente';
    } else if (saldo < 0) {
      liqSaldo.textContent = '$' + Math.abs(saldo).toFixed(2);
      liqSaldo.style.color = 'var(--green)';
      liqLabel.textContent = 'Saldo a favor del cliente';
    } else {
      liqSaldo.textContent = '$0.00';
      liqSaldo.style.color = 'var(--text-2)';
      liqLabel.textContent = 'Saldo en cero';
    }
  }
}

function renderTabLiquidacion() {
  const tg = totalGastos();
  const ta = totalAnticipos();
  const saldo = tg - ta;

  const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  const setColor = (id, c) => { const e = document.getElementById(id); if (e) e.style.color = c; };

  set('tl-total-gastos', '$' + tg.toFixed(2));
  set('tl-total-anticipos', '$' + ta.toFixed(2));
  set('tl-saldo-card', (saldo >= 0 ? '$' : '-$') + Math.abs(saldo).toFixed(2));
  setColor('tl-saldo-card', saldo > 0 ? 'var(--red)' : saldo < 0 ? 'var(--green)' : 'var(--text)');
  set('tl-estado-badge', saldo === 0 ? 'Liquidado' : 'Pendiente');

  const gb = document.getElementById('tl-gastos-body');
  if (gb) {
    gb.innerHTML = gastoData.map(g => `
      <tr>
        <td>${g.concepto||''}</td>
        <td style="font-size:12px;color:var(--text-2)">${g.proveedor||''}</td>
        <td style="font-family:'DM Mono',monospace;font-size:11px">${g.n_factura||''}</td>
        <td style="text-align:right;font-family:'DM Mono',monospace">$${parseFloat(g.monto||0).toFixed(2)}</td>
        <td style="text-align:right;font-family:'DM Mono',monospace;color:var(--text-3)">$0.00</td>
        <td style="text-align:right;font-family:'DM Mono',monospace;color:var(--text-3)">$0.00</td>
        <td style="text-align:right;font-family:'DM Mono',monospace;font-weight:500">$${g.monto.toFixed(2)}</td>
      </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:12px;font-size:12px">Sin gastos registrados</td></tr>';
    set('tl-subtotal-f', '$' + tg.toFixed(2));
    set('tl-iva-f', '$0.00');
    set('tl-ret-f', '$0.00');
    set('tl-total-f', '$' + tg.toFixed(2));
  }

  const ab = document.getElementById('tl-anticipos-body');
  if (ab) {
    ab.innerHTML = anticipoData.map(a => `
      <tr>
        <td style="font-size:11px;color:var(--text-3)">${(a.fecha||'').split('T')[0]}</td>
        <td style="font-size:12px">${a.descripcion||''}</td>
        <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text-2)">${a.forma_pago||'—'}</td>
        <td style="font-family:'DM Mono',monospace;color:var(--green)">$${parseFloat(a.monto||0).toFixed(2)}</td>
      </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-3);padding:10px;font-size:11px">Sin anticipos</td></tr>';
    set('tl-ta-footer', '$' + ta.toFixed(2));
  }

  set('tl-tg-label', '$' + tg.toFixed(2));
  set('tl-ta-label', '– $' + ta.toFixed(2));
  set('tl-saldo-label', saldo > 0 ? 'Saldo a cobrar al cliente' : saldo < 0 ? 'Saldo a favor del cliente' : 'Liquidado');
  set('tl-saldo-value', (saldo >= 0 ? '$' : '-$') + Math.abs(saldo).toFixed(2));
  setColor('tl-saldo-value', saldo > 0 ? 'var(--red)' : saldo < 0 ? 'var(--green)' : 'var(--text-2)');
}

function renderAll() {
  renderGastos();
  renderAnticipos();
  renderLiqAnticipos();
  renderCustomProps();
  renderTabLiquidacion();
  renderDocumentos();
}

async function addGasto() {
  if (!currentTramiteId) { showNotif('Abre un trámite primero'); return; }
  const data = await apiFetch('/tramites/'+currentTramiteId+'/gastos', {
    method:'POST', body: JSON.stringify({ concepto:'Nuevo concepto', monto:0, categoria:'Varios' })
  });
  if (!data || data.error) return;
  gastoData.push(data);
  renderAll();
}

async function removeGasto(id) {
  if (!currentTramiteId) return;
  await apiFetch('/tramites/'+currentTramiteId+'/gastos/'+id, { method:'DELETE' });
  gastoData = gastoData.filter(g => g.id !== id);
  renderAll();
  showNotif('Gasto eliminado');
}

async function attachGastoDoc(id) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.pdf,.jpg,.jpeg,.png';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5*1024*1024) { showNotif('Máximo 5MB'); return; }
    const g = gastoData.find(g => g.id === id);
    const fd = new FormData();
    fd.append('concepto', g?.concepto||'');
    fd.append('monto', g?.monto||0);
    fd.append('categoria', g?.categoria||'Varios');
    if (g?.proveedor) fd.append('proveedor', g.proveedor);
    if (g?.n_factura) fd.append('n_factura', g.n_factura);
    fd.append('comprobante', file);
    const res = await fetch(API_URL+'/tramites/'+currentTramiteId+'/gastos/'+id, {
      method:'PUT', headers:{Authorization:'Bearer '+getToken()}, body:fd
    });
    if (res.status === 401) { logout(); return; }
    const updated = await res.json();
    const idx = gastoData.findIndex(g => g.id === id);
    if (idx >= 0) gastoData[idx] = updated;
    renderAll();
    showNotif('Comprobante adjuntado');
  };
  input.click();
}

async function addAnticipo() {
  if (!currentTramiteId) { showNotif('Abre un trámite primero'); return; }
  const today = new Date().toISOString().split('T')[0];
  const data = await apiFetch('/tramites/'+currentTramiteId+'/anticipos', {
    method:'POST', body: JSON.stringify({ fecha:today, descripcion:'Nuevo anticipo', monto:0, forma_pago:'Transferencia' })
  });
  if (!data || data.error) return;
  anticipoData.push(data);
  renderAll();
  showNotif('Anticipo agregado');
}

async function removeAnticipo(id) {
  if (!currentTramiteId) return;
  await apiFetch('/tramites/'+currentTramiteId+'/anticipos/'+id, { method:'DELETE' });
  anticipoData = anticipoData.filter(a => a.id !== id);
  renderAll();
  showNotif('Anticipo eliminado');
}

async function attachAnticipoDoc(id) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.pdf,.jpg,.jpeg,.png';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5*1024*1024) { showNotif('Máximo 5MB'); return; }
    const a = anticipoData.find(a => a.id === id);
    const fd = new FormData();
    fd.append('fecha', a?.fecha||new Date().toISOString().split('T')[0]);
    fd.append('descripcion', a?.descripcion||'');
    fd.append('monto', a?.monto||0);
    fd.append('forma_pago', a?.forma_pago||'Transferencia');
    if (a?.n_comprobante) fd.append('n_comprobante', a.n_comprobante);
    fd.append('documento', file);
    const res = await fetch(API_URL+'/tramites/'+currentTramiteId+'/anticipos/'+id, {
      method:'PUT', headers:{Authorization:'Bearer '+getToken()}, body:fd
    });
    if (res.status === 401) { logout(); return; }
    const updated = await res.json();
    const idx = anticipoData.findIndex(a => a.id === id);
    if (idx >= 0) anticipoData[idx] = updated;
    renderAll();
    showNotif('Documento adjuntado');
  };
  input.click();
}

// ── MERCADERÍA IMPORTADA — registro reutilizable ──────────────────
const mercaderiaRegistry = [
  'PAPEL MONDI PROVANTAGE SMARTKRAFT BROWN',
  'TELA TEJIDO PLANO 100% POLIÉSTER',
  'CALZADO DEPORTIVO SUELA DE CAUCHO',
  'MATERIA PRIMA PLÁSTICO PET RECICLADO',
  'MAQUINARIA PARA PROCESAMIENTO DE ALIMENTOS',
  'REPUESTOS AUTOMOTRICES ORIGINALES',
  'PRODUCTOS COSMÉTICOS Y PERFUMERÍA',
  'MATERIALES DE CONSTRUCCIÓN — PERFILES METÁLICOS',
];

function updateMercaderiaDatalist() {
  const dl = document.getElementById('mercaderia-list');
  if (dl) dl.innerHTML = mercaderiaRegistry.map(m => `<option value="${escHtml(m)}">`).join('');
}

function saveMercaderia(val) {
  val = val.trim().toUpperCase();
  if (val && !mercaderiaRegistry.includes(val)) {
    mercaderiaRegistry.push(val);
    updateMercaderiaDatalist();
    showNotif('Mercadería guardada en el registro');
  }
}
// ─────────────────────────────────────────────────────────────────

// ── NAVIERAS ─────────────────────────────────────────────────────
const navieraRegistry = JSON.parse(localStorage.getItem('sa_navieras') || 'null') || [
  'CMA CGM','MSC','HAPAG LLOYD','MAERSK','ONE','TIBA','TOLEPU','HARTROD','GACIL','MSL ECUADOR'
];
function updateNavierasDatalist() {
  const dl = document.getElementById('navieras-list');
  if (dl) dl.innerHTML = navieraRegistry.map(n => `<option value="${escHtml(n)}">`).join('');
}
function saveNaviera(val) {
  val = (val || '').trim().toUpperCase();
  if (val && !navieraRegistry.includes(val)) {
    navieraRegistry.push(val);
    localStorage.setItem('sa_navieras', JSON.stringify(navieraRegistry));
    updateNavierasDatalist();
  }
}

// ── ALMACENERAS ───────────────────────────────────────────────────
const almaceneraRegistry = JSON.parse(localStorage.getItem('sa_almaceneras') || 'null') || [
  'INARPI','POSORJA','NAPORTEC','PUERTO BOLÍVAR','EMSA','CONTECON'
];
function updateAlmacenerasDatalist() {
  const dl = document.getElementById('almaceneras-list');
  if (dl) dl.innerHTML = almaceneraRegistry.map(a => `<option value="${escHtml(a)}">`).join('');
}
function saveAlmacenera(val) {
  val = (val || '').trim().toUpperCase();
  if (val && !almaceneraRegistry.includes(val)) {
    almaceneraRegistry.push(val);
    localStorage.setItem('sa_almaceneras', JSON.stringify(almaceneraRegistry));
    updateAlmacenerasDatalist();
  }
}

// ── CLIENTES ──────────────────────────────────────────────────────
const clienteRegistry = JSON.parse(localStorage.getItem('sa_clientes') || 'null') || [
  'MEGASTOCKEC','AHCORP','NOVA','ECUALIMFOOD','PRODUCOMERCIO'
];
function updateClientesDatalist() {
  const dl = document.getElementById('clientes-list');
  if (dl) dl.innerHTML = clienteRegistry.map(c => `<option value="${escHtml(c)}">`).join('');
}
function saveCliente(val) {
  val = (val || '').trim().toUpperCase();
  if (val && !clienteRegistry.includes(val)) {
    clienteRegistry.push(val);
    localStorage.setItem('sa_clientes', JSON.stringify(clienteRegistry));
    updateClientesDatalist();
  }
}

const customProps = [];
const customPropTemplates = ['Régimen aduanero','Canal de aforo','Certificado de origen','Tipo de carga','Peso neto (kg)','Número de bultos','Incoterm','Régimen de tributación','Agencia de aduanas','Tipo de embalaje'];

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

function updatePropTemplatesDatalist() {
  const dl = document.getElementById('prop-templates');
  if (dl) dl.innerHTML = customPropTemplates.map(t => `<option value="${escHtml(t)}">`).join('');
}

function saveCustomPropTemplate(name) {
  name = name.trim();
  if (name && !customPropTemplates.includes(name)) {
    customPropTemplates.push(name);
    updatePropTemplatesDatalist();
  }
}

function renderCustomProps() {
  const list = document.getElementById('custom-props-list');
  const empty = document.getElementById('custom-props-empty');
  if (!list) return;
  list.innerHTML = '';
  empty.style.display = customProps.length ? 'none' : 'block';
  customProps.forEach((p, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:flex-end;margin-bottom:10px';
    row.innerHTML = `
      <div class="field">
        <label>Propiedad</label>
        <input list="prop-templates" type="text" value="${escHtml(p.name)}" placeholder="Ej: Canal de aforo" onchange="customProps[${i}].name=this.value;saveCustomPropTemplate(this.value)">
      </div>
      <div class="field">
        <label>Valor</label>
        <input type="text" value="${escHtml(p.value)}" placeholder="Ingresa valor..." onchange="customProps[${i}].value=this.value">
      </div>
      <button class="btn btn-sm btn-danger" style="margin-bottom:1px" onclick="removeCustomProp(${i})">✕</button>
    `;
    list.appendChild(row);
  });
  updatePropTemplatesDatalist();
}

function addCustomProp() {
  customProps.push({name:'', value:''});
  renderCustomProps();
}

function removeCustomProp(i) {
  customProps.splice(i, 1);
  renderCustomProps();
  showNotif('Propiedad eliminada');
}

// ── REPORTE FINANCIERO ────────────────────────────────────────────
const reportTramites = [
  {num:'T26-001',cliente:'MEGASTOCKEC',op:'IMP',mes:'2026-01',gastos:3790.20,anticipos:4100.00},
  {num:'T26-003',cliente:'MEGASTOCKEC',op:'IMP',mes:'2026-01',gastos:1850.00,anticipos:2000.00},
  {num:'T26-027',cliente:'ECUALIMFOOD',op:'EXP',mes:'2026-01',gastos:760.00,anticipos:800.00},
  {num:'T26-038',cliente:'AHCORP',op:'IMP',mes:'2026-01',gastos:1420.30,anticipos:1200.00},
  {num:'T26-039',cliente:'MEGASTOCKEC',op:'IMP',mes:'2026-01',gastos:980.50,anticipos:1000.00},
  {num:'T26-040',cliente:'MEGASTOCKEC',op:'IMP',mes:'2026-01',gastos:1850.00,anticipos:2000.00},
  {num:'T26-006',cliente:'MEGASTOCKEC',op:'IMP',mes:'2026-02',gastos:2500.50,anticipos:2000.00},
  {num:'T26-010',cliente:'AHCORP',op:'IMP',mes:'2026-02',gastos:680.00,anticipos:800.00},
  {num:'T26-037',cliente:'AHCORP',op:'IMP',mes:'2026-02',gastos:950.50,anticipos:900.00},
  {num:'T26-050',cliente:'PRODUCOMERCIO',op:'IMP',mes:'2026-02',gastos:1420.00,anticipos:1500.00},
  {num:'T26-023',cliente:'NOVA',op:'EXP',mes:'2026-03',gastos:1100.00,anticipos:1000.00},
  {num:'T26-061',cliente:'NOVA',op:'EXP',mes:'2026-03',gastos:890.00,anticipos:1000.00},
  {num:'T26-072',cliente:'AHCORP',op:'IMP',mes:'2026-03',gastos:3200.20,anticipos:3000.00},
  {num:'T26-085',cliente:'ECUALIMFOOD',op:'EXP',mes:'2026-03',gastos:450.00,anticipos:500.00},
  {num:'T26-091',cliente:'PRODUCOMERCIO',op:'IMP',mes:'2026-04',gastos:741.16,anticipos:800.00},
  {num:'T26-281',cliente:'MEGASTOCKEC',op:'IMP',mes:'2026-04',gastos:2088.34,anticipos:2000.00},
  {num:'T26-102',cliente:'MEGASTOCKEC',op:'IMP',mes:'2026-05',gastos:620.00,anticipos:700.00},
  {num:'T26-103',cliente:'AHCORP',op:'IMP',mes:'2026-05',gastos:580.00,anticipos:500.00},
];
const reportCats = [
  {cat:'Almacenaje',total:4200.50},
  {cat:'V/B Consolidadora',total:3360.00},
  {cat:'Agente aduanas',total:2880.00},
  {cat:'Transporte',total:1540.00},
  {cat:'Reembolso',total:920.50},
  {cat:'Otros',total:401.80},
];
const mesLabels = {'01':'Ene','02':'Feb','03':'Mar','04':'Abr','05':'May','06':'Jun','07':'Jul','08':'Ago','09':'Sep','10':'Oct','11':'Nov','12':'Dic'};

function getRFiltros() {
  return {
    year: parseInt(document.getElementById('r-year')?.value||'2026'),
    desde: parseInt(document.getElementById('r-desde')?.value||'1'),
    hasta: parseInt(document.getElementById('r-hasta')?.value||'12'),
    cliente: document.getElementById('r-cliente')?.value||'',
    op: document.getElementById('r-op')?.value||'',
  };
}

function renderReportes() {
  const f = getRFiltros();
  const filtered = reportTramites.filter(t => {
    const [y,mo] = t.mes.split('-').map(Number);
    return y===f.year && mo>=f.desde && mo<=f.hasta &&
      (!f.cliente||t.cliente===f.cliente) && (!f.op||t.op===f.op);
  });
  const tg = filtered.reduce((s,t)=>s+t.gastos,0);
  const ta = filtered.reduce((s,t)=>s+t.anticipos,0);
  const saldo = tg - ta;
  document.getElementById('r-total-gastos').textContent = '$'+tg.toFixed(2);
  document.getElementById('r-total-anticipos').textContent = '$'+ta.toFixed(2);
  const snEl = document.getElementById('r-saldo-neto');
  snEl.textContent = (saldo>=0?'$':'-$')+Math.abs(saldo).toFixed(2);
  snEl.style.color = saldo>0?'var(--red)':saldo<0?'var(--green)':'var(--text)';
  document.getElementById('r-saldo-sub').textContent = saldo>0?'por cobrar al cliente':saldo<0?'a favor del cliente':'en equilibrio';
  document.getElementById('r-num-tramites').textContent = filtered.length;
  // Build monthly aggregation
  const meses = [];
  for (let mo=f.desde; mo<=f.hasta; mo++) {
    const mm = String(mo).padStart(2,'0');
    const tramMes = reportTramites.filter(t => {
      const [y,m2]=t.mes.split('-').map(Number);
      return y===f.year && m2===mo && (!f.cliente||t.cliente===f.cliente) && (!f.op||t.op===f.op);
    });
    meses.push({label:mesLabels[mm]+' '+String(f.year).slice(2), gastos:tramMes.reduce((s,t)=>s+t.gastos,0), anticipos:tramMes.reduce((s,t)=>s+t.anticipos,0)});
  }
  renderReporteChart(meses);
  renderReporteCats();
  renderReporteTramites(filtered);
}

function renderReporteChart(meses) {
  const el = document.getElementById('r-chart');
  if (!el) return;
  if (!meses.some(m=>m.gastos||m.anticipos)) {
    el.innerHTML='<p style="text-align:center;color:var(--text-3);padding:40px 0;font-size:12px">Sin datos para el período</p>'; return;
  }
  const max = Math.max(...meses.map(m=>Math.max(m.gastos,m.anticipos)),1);
  const H = 120;
  el.innerHTML = `
    <div style="display:flex;align-items:flex-end;gap:10px;height:${H}px;margin-bottom:6px;border-left:1px solid var(--border);border-bottom:1px solid var(--border);padding:0 6px 0 4px">
      ${meses.map(m=>{
        const gH=Math.max(Math.round((m.gastos/max)*H),m.gastos>0?2:0);
        const aH=Math.max(Math.round((m.anticipos/max)*H),m.anticipos>0?2:0);
        return `<div style="flex:1;display:flex;gap:3px;align-items:flex-end;height:${H}px">
          <div title="Gastos: $${m.gastos.toFixed(2)}" style="flex:1;height:${gH}px;background:var(--blue);border-radius:3px 3px 0 0;opacity:0.8;cursor:default;min-height:${m.gastos>0?2:0}px"></div>
          <div title="Anticipos: $${m.anticipos.toFixed(2)}" style="flex:1;height:${aH}px;background:var(--green);border-radius:3px 3px 0 0;opacity:0.8;cursor:default;min-height:${m.anticipos>0?2:0}px"></div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:10px;padding:0 10px;margin-bottom:10px">
      ${meses.map(m=>`<div style="flex:1;text-align:center">
        <div style="font-size:9px;color:var(--text-3);font-family:'DM Mono',monospace">${m.label}</div>
        <div style="font-size:9px;color:var(--blue);font-family:'DM Mono',monospace">${m.gastos>=1000?'$'+(m.gastos/1000).toFixed(1)+'k':m.gastos>0?'$'+m.gastos.toFixed(0):'—'}</div>
        <div style="font-size:9px;color:var(--green);font-family:'DM Mono',monospace">${m.anticipos>=1000?'$'+(m.anticipos/1000).toFixed(1)+'k':m.anticipos>0?'$'+m.anticipos.toFixed(0):'—'}</div>
      </div>`).join('')}
    </div>
    <div style="display:flex;gap:16px;padding-top:8px;border-top:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-2)"><div style="width:10px;height:10px;background:var(--blue);border-radius:2px;opacity:0.8"></div>Gastos</div>
      <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-2)"><div style="width:10px;height:10px;background:var(--green);border-radius:2px;opacity:0.8"></div>Anticipos</div>
    </div>`;
}

function renderReporteCats() {
  const el = document.getElementById('r-cats');
  if (!el) return;
  const total = reportCats.reduce((s,c)=>s+c.total,0);
  const colors = ['var(--blue)','var(--purple)','var(--green)','var(--amber)','var(--red)','var(--text-3)'];
  el.innerHTML = reportCats.map((c,i)=>{
    const pct = Math.round((c.total/total)*100);
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:12px">${c.cat}</span>
        <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text-2)">$${c.total.toFixed(0)} <span style="color:var(--text-3)">${pct}%</span></span>
      </div>
      <div style="height:4px;background:var(--surface2);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${colors[i]};border-radius:3px;opacity:0.75"></div>
      </div>
    </div>`;
  }).join('');
}

function renderReporteTramites(filtered) {
  const tbody = document.getElementById('r-tramites-body');
  if (!tbody) return;
  let cobrar=0, favor=0, tg=0, ta=0;
  if (!filtered.length) {
    tbody.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:20px;font-size:12px">Sin trámites para los filtros seleccionados</td></tr>';
    ['r-badge-cobrar','r-badge-favor','r-tfoot-g','r-tfoot-a','r-tfoot-s'].forEach(id=>{ const e=document.getElementById(id); if(e) e.textContent=id.includes('badge-cobrar')?'A cobrar: $0.00':id.includes('badge-favor')?'A favor: $0.00':'$0.00'; });
    return;
  }
  tbody.innerHTML = filtered.map(t=>{
    const saldo=t.gastos-t.anticipos;
    if(saldo>0) cobrar+=saldo; else favor+=Math.abs(saldo);
    tg+=t.gastos; ta+=t.anticipos;
    const [,mo]=t.mes.split('-');
    const saldoColor=saldo>0?'var(--red)':saldo<0?'var(--green)':'var(--text-2)';
    const badge=saldo>0?'<span class="badge badge-red">A cobrar</span>':saldo<0?'<span class="badge badge-green">A favor</span>':'<span class="badge badge-gray">Equilibrado</span>';
    return `<tr>
      <td><span class="row-link" onclick="nav('tramite',null)">${t.num}</span></td>
      <td style="font-size:12px">${t.cliente}</td>
      <td><span class="badge ${t.op==='IMP'?'badge-blue':'badge-purple'}" style="font-size:9px">${t.op}</span></td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text-3)">${mesLabels[mo]} ${t.mes.split('-')[0]}</td>
      <td style="text-align:right;font-family:'DM Mono',monospace;font-size:12px">$${t.gastos.toFixed(2)}</td>
      <td style="text-align:right;font-family:'DM Mono',monospace;font-size:12px;color:var(--green)">$${t.anticipos.toFixed(2)}</td>
      <td style="text-align:right;font-family:'DM Mono',monospace;font-size:13px;font-weight:500;color:${saldoColor}">${(saldo>=0?'$':'-$')+Math.abs(saldo).toFixed(2)}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
  const sn=tg-ta;
  document.getElementById('r-badge-cobrar').textContent='A cobrar: $'+cobrar.toFixed(2);
  document.getElementById('r-badge-favor').textContent='A favor: $'+favor.toFixed(2);
  document.getElementById('r-tfoot-g').textContent='$'+tg.toFixed(2);
  document.getElementById('r-tfoot-a').textContent='$'+ta.toFixed(2);
  const se=document.getElementById('r-tfoot-s');
  se.textContent=(sn>=0?'$':'-$')+Math.abs(sn).toFixed(2);
  se.style.color=sn>0?'var(--red)':sn<0?'var(--green)':'var(--text)';
}

const REPORT_CUR_YEAR = 2026;
const REPORT_CUR_MO   = 5;
let activePeriodPreset = 'ytd';

function setReportePeriodo(preset) {
  activePeriodPreset = preset;
  document.getElementById('r-year').value = REPORT_CUR_YEAR;
  const desde = { mes: REPORT_CUR_MO, '3m': Math.max(1, REPORT_CUR_MO-2), '6m': Math.max(1, REPORT_CUR_MO-5), ytd: 1 }[preset];
  document.getElementById('r-desde').value = desde;
  document.getElementById('r-hasta').value = REPORT_CUR_MO;
  updatePresetButtons();
  renderReportes();
}

function updatePresetButtons() {
  ['mes','3m','6m','ytd'].forEach(p => {
    const btn = document.getElementById('preset-'+p);
    if (btn) { btn.classList.toggle('active', activePeriodPreset === p); }
  });
}

function clearPreset() {
  activePeriodPreset = null;
  updatePresetButtons();
}

function exportReportePDF() {
  const f = getRFiltros();
  const lb = mesLabels;
  const d = lb[String(f.desde).padStart(2,'0')];
  const h = lb[String(f.hasta).padStart(2,'0')];
  const period = d === h ? `${d} ${f.year}` : `${d} — ${h} ${f.year}`;
  const extras = [f.cliente, f.op==='IMP'?'Importación':f.op==='EXP'?'Exportación':''].filter(Boolean).join(' · ');
  const el = document.getElementById('r-print-period');
  if (el) el.textContent = `Período: ${period}` + (extras ? ` · ${extras}` : '') + `   |   Generado: ${new Date().toLocaleDateString('es-EC')}`;
  window.print();
}

function resetReporteFilters() {
  document.getElementById('r-cliente').value='';
  document.getElementById('r-op').value='';
  setReportePeriodo('ytd');
}
// ── PERSISTENCIA LOCAL ────────────────────────────────────────────
function readTramiteForm() {
  const form = {};
  document.querySelectorAll('#t-datos [data-field]').forEach(el => {
    form[el.dataset.field] = el.value;
  });
  return form;
}

function applyTramiteForm(data) {
  if (!data) return;
  const set = (field, val) => {
    const el = document.querySelector('#t-datos [data-field="'+field+'"]');
    if (el && val !== undefined && val !== null) el.value = val;
  };
  set('numero', data.numero);
  set('operacion', data.tipo);
  set('cliente', data.cliente);
  set('fechaApertura', data.fecha_arribo ? data.fecha_arribo.split('T')[0] : '');
  set('bl', data.bl);
  set('naviera', data.naviera);
  set('dai', data.da);
  set('factCom', data.factura_comercial);
  set('factIntra', data.factura_intraservice);
  set('obs', data.observaciones);
}

function discardChanges() {
  if (creatingMode) {
    exitCreatingMode();
    const navTramite = document.getElementById('nav-tramite');
    if (navTramite && !currentTramiteId) navTramite.style.display = 'none';
    nav('bitacora', document.getElementById('nav-bitacora'));
    return;
  }
  if (currentTramiteId) openTramite(currentTramiteId);
  showNotif('Cambios descartados');
}
// ─────────────────────────────────────────────────────────────────

const pageTitles = {
  dashboard: 'Dashboard',
  bitacora: 'Bitácora de trámites',
  tramite: 'Trámite T26-281 · MEGASTOCKEC',
  reportes: 'Reporte financiero',
  auditoria: 'Historial de auditoría',
  usuarios: 'Gestión de usuarios'
};
const topbarBadges = {
  tramite: '<span class="badge badge-amber">En proceso</span>',
};

function nav(id, el) {
  if (id === 'tramite' && !currentTramiteId && !creatingMode) {
    showNotif('Selecciona un trámite desde la Bitácora');
    return nav('bitacora', document.getElementById('nav-bitacora'));
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  else { const f = document.getElementById('nav-' + id); if (f) f.classList.add('active'); }
  document.getElementById('page-title').textContent = pageTitles[id] || id;
  document.getElementById('topbar-badge').innerHTML = topbarBadges[id] || '';
  if (id === 'reportes') renderReportes();
  if (id === 'auditoria') loadAuditoria();
  if (id === 'dashboard') loadDashboard();
  if (id === 'bitacora') loadBitacora();
  if (id === 'usuarios') loadUsuarios();
}

function setTab(el, targetId) {
  document.querySelectorAll('#screen-tramite .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['t-datos', 't-docs', 't-estado', 't-liquidacion'].forEach(id => {
    document.getElementById(id).style.display = id === targetId ? 'block' : 'none';
  });
  if (targetId === 't-liquidacion') renderTabLiquidacion();
}

let notifTimer;
function showNotif(msg) {
  const el = document.getElementById('notif');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── DOCUMENTOS DEL EXPEDIENTE ─────────────────────────────────────
const docSvg = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="#1E4FBF" stroke-width="1.2"/><line x1="5" y1="5.5" x2="11" y2="5.5" stroke="#1E4FBF" stroke-width="1"/><line x1="5" y1="8" x2="11" y2="8" stroke="#1E4FBF" stroke-width="1"/><line x1="5" y1="10.5" x2="8" y2="10.5" stroke="#1E4FBF" stroke-width="1"/></svg>`;

function renderDocumentos() {
  const el = document.getElementById('documentos-list');
  if (!el) return;
  if (!documentoData.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--text-3);text-align:center;padding:16px 0">Sin documentos adjuntos</p>';
    return;
  }
  el.innerHTML = documentoData.map(d => `
    <div class="doc-item">
      <div class="doc-icon">${docSvg}</div>
      <div class="doc-name"><a href="${d.file_url}" target="_blank" style="color:var(--blue);text-decoration:none">${escHtml(d.nombre)}</a></div>
      <div class="doc-meta">${d.tipo||'Otro'} · ${d.size_bytes ? Math.round(d.size_bytes/1024)+' KB' : ''} · ${fmtDate(d.created_at)}</div>
      <button class="btn btn-sm btn-ghost" onclick="window.open('${d.file_url}','_blank')">Ver</button>
      <button class="btn btn-sm btn-danger" onclick="deleteDocumento('${d.id}')">✕</button>
    </div>`).join('');
}

function triggerDocUpload() {
  const input = document.getElementById('doc-file-input');
  if (input) input.click();
}

async function handleDocFiles(files) {
  if (!currentTramiteId) { showNotif('Abre un trámite primero'); return; }
  for (const file of files) {
    if (file.size > 5*1024*1024) { showNotif(file.name + ': máximo 5MB'); continue; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('nombre', file.name);
    fd.append('tipo', 'Otro');
    const res = await fetch(API_URL+'/tramites/'+currentTramiteId+'/documentos', {
      method:'POST', headers:{Authorization:'Bearer '+getToken()}, body:fd
    });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    if (data && !data.error) {
      documentoData.push(data);
      showNotif(file.name + ' subido');
    } else {
      showNotif(data?.error || 'Error al subir ' + file.name);
    }
  }
  renderDocumentos();
  document.getElementById('doc-file-input').value = '';
}

async function deleteDocumento(id) {
  if (!currentTramiteId) return;
  await apiFetch('/tramites/'+currentTramiteId+'/documentos/'+id, { method:'DELETE' });
  documentoData = documentoData.filter(d => d.id !== id);
  renderDocumentos();
  showNotif('Documento eliminado');
}

// ── BOOT ──────────────────────────────────────────────────────────
updatePresetButtons();

(function boot() {
  const token = getToken();
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp * 1000 < Date.now()) { logout(); return; }
      currentUser = { id: payload.id, email: payload.email, name: payload.name, initials: payload.initials, role: payload.role };
      document.getElementById('login-overlay').style.display = 'none';
      initApp();
    } catch(e) { logout(); }
  } else {
    document.getElementById('login-overlay').style.display = 'flex';
  }
})();
