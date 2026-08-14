// ── CONFIG ────────────────────────────────────────────────────────
const API_URL = '';

// ── STATE ─────────────────────────────────────────────────────────
let currentUser = null;
let currentTramiteId = null;
let creatingMode = false;
let gastoData = [];
let anticipoData = [];
let etiquetasData = [];
let documentoData = [];
let currentScreen = 'dashboard';

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
  gastoData = []; anticipoData = []; documentoData = []; etiquetasData = []; currentTramiteId = null;
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
    document.getElementById('nav-feedback').style.display = 'flex';
  }
}

async function initApp() {
  applyUserToUI();
  updateNavierasDatalist();
  updateAlmacenerasDatalist();
  updateClientesDatalist();
  updateMercaderiaDatalist();
  updateProveedoresDatalist();
  renderEtiquetaColorPicker();
  loadProveedores();
  loadClientes();
  loadEtiquetas();
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
      <td>${etiquetasHtml(t.etiquetas)}</td>
      <td style="color:var(--text-3);font-size:12px">${fmtDate(t.created_at)}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:20px;font-size:12px">Sin trámites</td></tr>';
}

// ── BITÁCORA ──────────────────────────────────────────────────────
let bitacoraData = [];
async function loadBitacora() {
  const data = await apiFetch('/tramites');
  if (!data) return;
  bitacoraData = data;
  // Agregar clientes del sistema al datalist. Las etiquetas ya no se siembran
  // desde acá: el registro vive en el servidor (GET /etiquetas).
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
  customProps.length = 0;
  (data.custom_props || []).forEach(p => customProps.push(p));
  etiquetasData = data.etiquetas || [];
  preliqData = data.preliquidacion || {};
  applyTramiteForm(data);
  renderPreliquidacion(true);
  renderAll();
  renderDocumentos();
  renderEtiquetas();
  renderHistorial(data.historial || []);
  pageTitles.tramite = 'Trámite ' + data.numero + ' · ' + data.cliente;
  topbarBadges.tramite = '<span class="badge badge-' + badgeEstado(data.estado) + '">' + data.estado + '</span>';
  const estadoSel = document.getElementById('estado-select');
  if (estadoSel) estadoSel.value = data.estado;
  const navTramite = document.getElementById('nav-tramite');
  if (navTramite) navTramite.style.display = '';
  nav('tramite', navTramite);
  setTab(document.getElementById('tab-docs'), 't-docs');
}

function badgeEstado(e) {
  return { Concluido:'green','En proceso':'amber','Pendiente documentación':'red',Cancelado:'gray' }[e] || 'gray';
}

function exitCreatingMode() {
  creatingMode = false;
  const numEl = document.querySelector('[data-field="numero"]');
  if (numEl) numEl.setAttribute('readonly', '');
  ['tab-docs', 'tab-documentos', 'tab-estado', 'tab-liquidacion'].forEach(id => {
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
  ['tab-docs', 'tab-documentos', 'tab-estado', 'tab-liquidacion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const datosTab = document.getElementById('tab-datos');
  if (datosTab) setTab(datosTab, 't-datos');
  const saveBtn = document.querySelector('#t-datos .section-actions .btn-primary');
  if (saveBtn) saveBtn.textContent = 'Crear trámite';
  pageTitles.tramite = 'Nuevo trámite';
  topbarBadges.tramite = '';
  const fechaEl = document.querySelector('[data-field="fechaApertura"]');
  if (fechaEl) fechaEl.value = todayISO();
  onOperacionChange();
  actualizarSugerenciasOperacion();
  const navTramite = document.getElementById('nav-tramite');
  if (navTramite) navTramite.style.display = '';
  nav('tramite', navTramite);
  suggestNextNumero();
}

// Fecha de hoy en zona local (toISOString daría el día siguiente por la tarde en UTC-5)
function todayISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Sugiere el siguiente consecutivo del año. Solo sugerencia: el campo queda editable
// y no se pisa si el usuario ya escribió algo mientras cargaba.
async function suggestNextNumero() {
  const numEl = document.querySelector('[data-field="numero"]');
  if (!numEl) return;
  numEl.placeholder = 'Cargando sugerencia...';
  const res = await apiFetch('/tramites/next-numero');
  numEl.placeholder = '';
  if (!res || res.error || !res.numero) return;
  if (creatingMode && !numEl.value) numEl.value = res.numero;
}

// data-field del form → columna del backend. Un solo mapeo para enviar y para
// repoblar: antes estas dos listas estaban sueltas y 10 campos se perdían.
const CAMPOS_EXTRA = {
  mercaderia: 'mercaderia', almacenera: 'almacenera', mrn: 'mrn',
  liqSenae: 'liq_senae', subPartida: 'sub_partida', entrega: 'n_entrega',
  transporte: 'transporte', proveedor: 'proveedor',
  contenedores: 'contenedores', cda: 'cda',
  operacionOtro: 'operacion_otro', regimen: 'regimen', regimenOtro: 'regimen_otro',
  fechaLlegada: 'fecha_llegada',
};

// Regímenes según la operación. OTRO_REGIMEN habilita el campo libre.
const OTRO_REGIMEN = 'Otro (especificar)';
const REGIMENES = {
  'Importación': ['Régimen 21 – Importación Temporal', 'Régimen 10 – Importación para el Consumo', OTRO_REGIMEN],
  'Exportación': ['Régimen 49 – Exportación Temporal', 'Exportación Definitiva', OTRO_REGIMEN],
  'Otro': [OTRO_REGIMEN],
};

// Sugerencias para los campos "especificar", tomadas de lo ya cargado en otros
// trámites: así un valor escrito una vez queda disponible para el resto.
function actualizarSugerenciasOperacion() {
  const llenar = (idLista, valores) => {
    const dl = document.getElementById(idLista);
    if (dl) dl.innerHTML = [...new Set(valores.filter(Boolean))].sort()
      .map(v => `<option value="${escHtml(v)}">`).join('');
  };
  llenar('operacion-otro-list', bitacoraData.map(t => t.operacion_otro));
  llenar('regimen-otro-list', bitacoraData.map(t => t.regimen_otro));
}

function onOperacionChange() {
  const op = document.querySelector('[data-field="operacion"]')?.value || 'Importación';
  const sel = document.querySelector('[data-field="regimen"]');
  const previo = sel?.value;
  if (sel) {
    const opciones = REGIMENES[op] || [OTRO_REGIMEN];
    sel.innerHTML = ['', ...opciones].map(r => `<option value="${escHtml(r)}">${r || '— Sin régimen —'}</option>`).join('');
    // Si el régimen que había sigue siendo válido para esta operación, se respeta
    if (previo && opciones.includes(previo)) sel.value = previo;
  }
  const campoOtro = document.getElementById('campo-operacion-otro');
  if (campoOtro) campoOtro.style.display = op === 'Otro' ? '' : 'none';
  onRegimenChange();
  renderPreliquidacion();
}

function onRegimenChange() {
  const esOtro = document.querySelector('[data-field="regimen"]')?.value === OTRO_REGIMEN;
  const campo = document.getElementById('campo-regimen-otro');
  if (campo) campo.style.display = esOtro ? '' : 'none';
}

function camposExtra(form) {
  const o = {};
  for (const [campo, col] of Object.entries(CAMPOS_EXTRA)) o[col] = form[campo] || null;
  return o;
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
        custom_props: customProps, etiquetas: etiquetasData,
        ...camposExtra(form),
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
      custom_props: customProps, etiquetas: etiquetasData,
      ...camposExtra(form),
    })
  });
  if (!res || res.error) { showNotif(res?.error || 'Error al guardar'); return; }
  showNotif('Trámite guardado'); loadBitacora(); loadDashboard();
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
    const claveBtn = `<button class="btn btn-sm btn-ghost" onclick="showChangePassForm('${u.id}','${escHtml(u.name)}')">Cambiar clave</button>`;
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
      <td style="display:flex;gap:6px;flex-wrap:wrap">${claveBtn}${accionBtn}</td>
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

let changePassUserId = null;

function showChangePassForm(id, name) {
  changePassUserId = id;
  document.getElementById('cp-user-name').textContent = name;
  document.getElementById('cp-pass').value = '';
  document.getElementById('cp-pass2').value = '';
  document.getElementById('cp-error').textContent = '';
  document.getElementById('change-pass-form').style.display = 'block';
  document.getElementById('new-user-form').style.display = 'none';
  document.getElementById('cp-pass').focus();
}

function hideChangePassForm() {
  changePassUserId = null;
  document.getElementById('change-pass-form').style.display = 'none';
}

async function saveChangePass() {
  const pass = document.getElementById('cp-pass').value;
  const pass2 = document.getElementById('cp-pass2').value;
  const errEl = document.getElementById('cp-error');
  errEl.textContent = '';
  if (!pass) { errEl.textContent = 'Ingresa la nueva contraseña'; return; }
  if (pass.length < 6) { errEl.textContent = 'Mínimo 6 caracteres'; return; }
  if (pass !== pass2) { errEl.textContent = 'Las contraseñas no coinciden'; return; }
  const res = await apiFetch('/users/' + changePassUserId, { method: 'PATCH', body: JSON.stringify({ password: pass }) });
  if (res && !res.error) {
    showNotif('Contraseña actualizada');
    hideChangePassForm();
  } else {
    errEl.textContent = res?.error || 'Error al actualizar';
  }
}

function showNewUserForm() {
  document.getElementById('new-user-form').style.display = 'block';
  document.getElementById('change-pass-form').style.display = 'none';
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
  const labels = { tramite_creado:'Trámite creado', estado_cambiado:'Estado cambiado', gasto_agregado:'Gasto agregado', documento_cargado:'Documento cargado', liquidacion_enviada:'Liquidación enviada', ecuapass_consultada:'Clave ECUAPASS consultada' };
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

// Comprobantes de un gasto. Contempla los gastos viejos que aún traen el
// comprobante 1:1 en comprobante_url y todavía no pasaron por la migración.
function gastoArchivos(g) {
  if (Array.isArray(g.archivos) && g.archivos.length) return g.archivos;
  if (g.comprobante_url) return [{ id: null, url: g.comprobante_url, nombre: g.comprobante_url.split('/').pop() }];
  return [];
}

function recorta(nombre, max = 18) {
  const n = nombre || 'comprobante';
  return n.length > max ? n.slice(0, max - 1) + '…' : n;
}

// Chip de un comprobante: ver · descargar · quitar.
// Los comprobantes viejos sin fila propia (a.id null) no se pueden quitar acá.
function chipArchivo(gastoId, a) {
  const nombre = a.nombre || 'comprobante';
  const quitar = a.id
    ? `<span onclick="removeGastoArchivo('${gastoId}','${a.id}')" style="cursor:pointer;color:var(--red)" title="Quitar">✕</span>`
    : '';
  return `<span class="doc-chip" title="${escHtml(nombre)}">`
    + `<span onclick="openPreview('${a.url}','${escHtml(nombre)}')" style="cursor:pointer">${docIcon}${escHtml(recorta(nombre))}</span>`
    + `<a href="${a.url}" download style="color:var(--blue);text-decoration:none" title="Descargar">↓</a>`
    + quitar + `</span>`;
}

const gastoSaveTimers = {};
function saveGastoField(id, field, value) {
  // El backend guarda el proveedor en mayúsculas; se refleja igual en pantalla
  // para no mostrar un valor distinto al que quedó grabado.
  if (field === 'proveedor') value = (value || '').trim().toUpperCase();
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
    const archivos = gastoArchivos(g);
    if (archivos.length) conDoc++;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escHtml(g.concepto||'')}" onchange="saveGastoField('${g.id}','concepto',this.value)"></td>
      <td><input list="proveedores-list" type="text" value="${escHtml(g.proveedor||'')}" placeholder="Ingresa o selecciona proveedor..." onchange="saveProveedor(this.value);saveGastoField('${g.id}','proveedor',this.value)"></td>
      <td><input type="text" value="${escHtml(g.n_factura||'')}" style="font-family:'DM Mono',monospace;font-size:11px" onchange="saveGastoField('${g.id}','n_factura',this.value)"></td>
      <td><input type="number" value="${parseFloat(g.monto||0).toFixed(2)}" style="width:90px;font-family:'DM Mono',monospace" onchange="saveGastoField('${g.id}','monto',this.value)"></td>
      <td><select onchange="saveGastoField('${g.id}','categoria',this.value)">${cats.map(c=>`<option${g.categoria===c?' selected':''}>${c}</option>`).join('')}</select></td>
      <td style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">${
        archivos.map(a => chipArchivo(g.id, a)).join('')
      }<button class="btn btn-sm" onclick="attachGastoDoc('${g.id}')">+ Adjuntar</button></td>
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
      <td style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">${a.documento_url
        ? `<span class="doc-chip" onclick="openPreview('${a.documento_url}','${escHtml(a.documento_url.split('/').pop())}')" style="cursor:pointer" title="Ver archivo">${docIcon}documento</span><a href="${a.documento_url}" download class="btn btn-sm btn-ghost" style="padding:2px 6px;font-size:11px" title="Descargar">↓</a>`
        : `<button class="btn btn-sm" onclick="attachAnticipoDoc('${a.id}')">+ Adjuntar</button>`
      }</td>
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
        <td style="text-align:right;font-family:'DM Mono',monospace;font-weight:500">$${parseFloat(g.monto||0).toFixed(2)}</td>
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
  input.type = 'file'; input.accept = '.pdf,.jpg,.jpeg,.png'; input.multiple = true;
  input.onchange = async () => {
    const files = [...input.files];
    if (!files.length) return;
    const pesados = files.filter(f => f.size > 5*1024*1024);
    if (pesados.length) { showNotif('Máximo 5MB por archivo: ' + pesados.map(f=>f.name).join(', ')); return; }
    const fd = new FormData();
    files.forEach(f => fd.append('archivos', f));
    const res = await fetch(API_URL+'/tramites/'+currentTramiteId+'/gastos/'+id+'/archivos', {
      method:'POST', headers:{Authorization:'Bearer '+getToken()}, body:fd
    });
    if (res.status === 401) { logout(); return; }
    const archivos = await res.json();
    if (archivos.error) { showNotif(archivos.error); return; }
    const g = gastoData.find(g => g.id === id);
    if (g) g.archivos = archivos;
    renderAll();
    showNotif(files.length === 1 ? 'Comprobante adjuntado' : files.length + ' comprobantes adjuntados');
  };
  input.click();
}

async function removeGastoArchivo(gastoId, archivoId) {
  if (!currentTramiteId || !archivoId) return;
  const res = await apiFetch('/tramites/'+currentTramiteId+'/gastos/'+gastoId+'/archivos/'+archivoId, { method:'DELETE' });
  if (!res || res.error) { showNotif(res?.error || 'No se pudo quitar'); return; }
  const g = gastoData.find(g => g.id === gastoId);
  if (g) {
    g.archivos = (g.archivos || []).filter(a => a.id !== archivoId);
    if (!g.archivos.length) { g.comprobante_url = null; g.comprobante_key = null; }
  }
  renderAll();
  showNotif('Comprobante quitado');
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

// ── PROVEEDORES ───────────────────────────────────────────────────
// A diferencia de navieras/clientes, se siembra desde el servidor (proveedores ya
// usados en gastos) para que la lista sea la misma en todos los navegadores.
const proveedorRegistry = JSON.parse(localStorage.getItem('sa_proveedores') || '[]');
function updateProveedoresDatalist() {
  const html = proveedorRegistry.map(p => `<option value="${escHtml(p)}">`).join('');
  document.querySelectorAll('#proveedores-list, .proveedores-list').forEach(dl => dl.innerHTML = html);
}
function saveProveedor(val) {
  val = (val || '').trim().toUpperCase();
  if (val && !proveedorRegistry.includes(val)) {
    proveedorRegistry.push(val);
    proveedorRegistry.sort();
    localStorage.setItem('sa_proveedores', JSON.stringify(proveedorRegistry));
    updateProveedoresDatalist();
  }
}
async function loadProveedores() {
  const data = await apiFetch('/proveedores');
  if (!Array.isArray(data)) return;
  data.forEach(p => {
    const v = (p || '').trim().toUpperCase();
    if (v && !proveedorRegistry.includes(v)) proveedorRegistry.push(v);
  });
  proveedorRegistry.sort();
  localStorage.setItem('sa_proveedores', JSON.stringify(proveedorRegistry));
  updateProveedoresDatalist();
}

// ── PRELIQUIDACIÓN ────────────────────────────────────────────────
// Mismo cálculo que backend/lib/preliquidacion.js: cada impuesto se apoya en
// los anteriores. Si se toca uno, hay que tocar el otro.
const TARIFAS_DEFECTO = { adValorem: 0, fodinfa: 0.5, iva: 15, seguridad: 0 };
let preliqData = {};
let preliqTimer = null;

function calcPreliq(p) {
  const n = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
  const fob = n(p.fob), flete = n(p.flete), seguro = n(p.seguro);
  const cfr = fob + flete, cif = cfr + seguro;
  const adValorem = cif * n(p.adValorem) / 100;
  const fodinfa   = cif * n(p.fodinfa) / 100;
  const iva       = (cif + adValorem + fodinfa) * n(p.iva) / 100;
  const seguridad = (adValorem + fodinfa + iva) * n(p.seguridad) / 100;
  return { fob, flete, seguro, cfr, cif, adValorem, fodinfa, iva, seguridad,
           total: adValorem + fodinfa + iva + seguridad };
}

// forzarValores=true reescribe los inputs (al abrir un trámite); en los
// recálculos se dejan como están para no pisar lo que se está tipeando.
function renderPreliquidacion(forzarValores = false) {
  const panel = document.getElementById('panel-preliquidacion');
  if (!panel) return;
  // El feedback pedía preliquidaciones para importaciones
  const esImportacion = document.querySelector('[data-field="operacion"]')?.value === 'Importación';
  panel.style.display = esImportacion ? '' : 'none';
  if (!esImportacion) return;

  const p = { ...TARIFAS_DEFECTO, ...preliqData };
  if (forzarValores) {
    const val = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    val('pl-fob', p.fob); val('pl-flete', p.flete); val('pl-seguro', p.seguro);
    val('pl-t-advalorem', p.adValorem); val('pl-t-fodinfa', p.fodinfa);
    val('pl-t-iva', p.iva); val('pl-t-seguridad', p.seguridad);
  }

  const r = calcPreliq(p);
  const money = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = '$' + v.toFixed(2); };
  money('pl-cfr', r.cfr); money('pl-cif', r.cif);
  money('pl-v-advalorem', r.adValorem); money('pl-v-fodinfa', r.fodinfa);
  money('pl-v-iva', r.iva); money('pl-v-seguridad', r.seguridad); money('pl-total', r.total);
}

function leerPreliqForm() {
  const v = id => document.getElementById(id)?.value;
  return {
    fob: v('pl-fob'), flete: v('pl-flete'), seguro: v('pl-seguro'),
    adValorem: v('pl-t-advalorem'), fodinfa: v('pl-t-fodinfa'),
    iva: v('pl-t-iva'), seguridad: v('pl-t-seguridad'),
  };
}

function onPreliqChange() {
  preliqData = leerPreliqForm();
  renderPreliquidacion();
  // Autosave, como en gastos y anticipos
  clearTimeout(preliqTimer);
  preliqTimer = setTimeout(() => { if (currentTramiteId) guardarPreliquidacion(); }, 800);
}

async function guardarPreliquidacion() {
  const form = readTramiteForm();
  await apiFetch('/tramites/' + currentTramiteId, {
    method: 'PUT',
    body: JSON.stringify({
      numero: form.numero, tipo: form.operacion, cliente: form.cliente,
      fecha_arribo: form.fechaApertura || null, bl: form.bl, naviera: form.naviera,
      da: form.dai, factura_comercial: form.factCom,
      factura_intraservice: form.factIntra, observaciones: form.obs,
      custom_props: customProps, etiquetas: etiquetasData,
      ...camposExtra(form), preliquidacion: preliqData,
    })
  });
}

async function exportPreliqExcel() {
  if (!currentTramiteId) return;
  showNotif('Generando Excel...');
  const res = await fetch(API_URL + '/tramites/' + currentTramiteId + '/preliquidacion.xlsx', {
    headers: { Authorization: 'Bearer ' + getToken() }
  });
  if (res.status === 401) { logout(); return; }
  if (!res.ok) { showNotif('No se pudo generar el Excel'); return; }
  const blob = await res.blob();
  const nombre = (res.headers.get('Content-Disposition') || '').match(/filename="?([^"]+)"?/)?.[1] || 'preliquidacion.xlsx';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showNotif('Excel descargado');
}

function exportPreliqPDF() {
  const form = readTramiteForm();
  const r = calcPreliq({ ...TARIFAS_DEFECTO, ...preliqData });
  const t = { ...TARIFAS_DEFECTO, ...preliqData };
  const $ = n => '$' + Number(n || 0).toFixed(2);
  const totalG = totalGastos(), totalA = totalAnticipos();
  const filas = (arr, cols) => arr.map(x => `<tr>${cols(x)}</tr>`).join('') || '<tr><td colspan="5" class="vacio">Sin registros</td></tr>';

  const w = window.open('', '_blank');
  if (!w) { showNotif('El navegador bloqueó la ventana de impresión'); return; }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
  <title>Preliquidación ${form.numero || ''}</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;color:#141414;margin:32px;font-size:12px}
    h1{font-size:17px;margin:0 0 2px} .sub{color:#666;margin-bottom:18px;font-size:12px}
    h2{font-size:13px;margin:20px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}
    table{width:100%;border-collapse:collapse} td,th{padding:5px 6px;border-bottom:1px solid #eee;text-align:left}
    th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#666}
    .num{text-align:right;font-variant-numeric:tabular-nums} .tot{font-weight:600;border-top:1px solid #999}
    .vacio{color:#999;text-align:center} .meta td:first-child{color:#666;width:150px}
    @media print{body{margin:0}}
  </style></head><body>
  <h1>Preliquidación · ${form.numero || ''}</h1>
  <div class="sub">${form.cliente || ''} · ${form.operacion || ''}${form.regimen ? ' · ' + form.regimen : ''}</div>
  <table class="meta">
    <tr><td>Sub partida</td><td>${form.subPartida || '—'}</td></tr>
    <tr><td>BL / AWB</td><td>${form.bl || '—'}</td></tr>
    <tr><td>DAI / DAE</td><td>${form.dai || '—'}</td></tr>
  </table>
  <h2>Valores de la mercadería</h2>
  <table>
    <tr><td>FOB</td><td class="num">${$(r.fob)}</td></tr>
    <tr><td>Flete</td><td class="num">${$(r.flete)}</td></tr>
    <tr><td>CFR</td><td class="num">${$(r.cfr)}</td></tr>
    <tr><td>Seguro</td><td class="num">${$(r.seguro)}</td></tr>
    <tr class="tot"><td>CIF</td><td class="num">${$(r.cif)}</td></tr>
  </table>
  <h2>Impuestos</h2>
  <table>
    <tr><th>Impuesto</th><th>Tarifa</th><th class="num">Valor</th></tr>
    <tr><td>Ad Valorem</td><td>${t.adValorem}%</td><td class="num">${$(r.adValorem)}</td></tr>
    <tr><td>Fodinfa</td><td>${t.fodinfa}%</td><td class="num">${$(r.fodinfa)}</td></tr>
    <tr><td>IVA</td><td>${t.iva}%</td><td class="num">${$(r.iva)}</td></tr>
    <tr><td>Seguridad</td><td>${t.seguridad}%</td><td class="num">${$(r.seguridad)}</td></tr>
    <tr class="tot"><td colspan="2">Total impuestos</td><td class="num">${$(r.total)}</td></tr>
  </table>
  <h2>Gastos pagados</h2>
  <table>
    <tr><th>Concepto</th><th>Proveedor</th><th>N° factura</th><th>Categoría</th><th class="num">Monto</th></tr>
    ${filas(gastoData, g => `<td>${escHtml(g.concepto||'')}</td><td>${escHtml(g.proveedor||'')}</td><td>${escHtml(g.n_factura||'')}</td><td>${escHtml(g.categoria||'')}</td><td class="num">${$(g.monto)}</td>`)}
    <tr class="tot"><td colspan="4">Total gastos</td><td class="num">${$(totalG)}</td></tr>
  </table>
  <h2>Anticipos del cliente</h2>
  <table>
    <tr><th>Fecha</th><th>Referencia</th><th>N° comprobante</th><th>Forma de pago</th><th class="num">Monto</th></tr>
    ${filas(anticipoData, a => `<td>${(a.fecha||'').split('T')[0]}</td><td>${escHtml(a.descripcion||'')}</td><td>${escHtml(a.n_comprobante||'')}</td><td>${escHtml(a.forma_pago||'')}</td><td class="num">${$(a.monto)}</td>`)}
    <tr class="tot"><td colspan="4">Total anticipos</td><td class="num">${$(totalA)}</td></tr>
  </table>
  <h2>Saldo</h2>
  <table><tr class="tot"><td>Gastos − anticipos</td><td class="num">${$(totalG - totalA)}</td></tr></table>
  </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

// ── CLIENTES (registro en el servidor) ────────────────────────────
let clientesData = [];
let clienteEditando = null;

async function loadClientes() {
  const data = await apiFetch('/clientes');
  if (!Array.isArray(data)) return;
  clientesData = data;
  // El desplegable de Cliente del form de trámite se alimenta de acá
  data.forEach(c => saveCliente(c.nombre));
  updateClientesDatalist();
  renderClientes();
}

function renderClientes() {
  const tbody = document.getElementById('clientes-body');
  if (!tbody) return;
  const esAdmin = currentUser?.role === 'admin';
  tbody.innerHTML = clientesData.map(c => `
    <tr>
      <td style="font-weight:500">${escHtml(c.nombre)}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${escHtml(c.ruc || '—')}</td>
      <td style="font-size:12px">${escHtml(c.telefono || '—')}</td>
      <td style="font-size:12px;color:var(--text-2)">${(c.emails || []).map(escHtml).join('<br>') || '—'}</td>
      <td>${c.tiene_ecuapass
        ? (esAdmin
            ? `<button class="btn btn-sm btn-ghost" onclick="verEcuapass('${c.id}')">Ver clave</button>`
            : '<span class="badge badge-gray">Guardada</span>')
        : '<span style="color:var(--text-3);font-size:12px">—</span>'}</td>
      <td style="display:flex;gap:4px">
        <button class="btn btn-sm btn-ghost" onclick="showClienteForm('${c.id}')">Editar</button>
        ${esAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteCliente('${c.id}')">✕</button>` : ''}
      </td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:20px;font-size:12px">Sin clientes registrados</td></tr>';
}

function showClienteForm(id) {
  clienteEditando = id ? clientesData.find(c => c.id === id) : null;
  const c = clienteEditando;
  document.getElementById('cl-ruc').value = c?.ruc || '';
  document.getElementById('cl-nombre').value = c?.nombre || '';
  document.getElementById('cl-telefono').value = c?.telefono || '';
  document.getElementById('cl-emails').value = (c?.emails || []).join(', ');
  document.getElementById('cl-descripcion').value = c?.descripcion || '';
  // La clave nunca se precarga: vacío = dejarla como está
  const ecu = document.getElementById('cl-ecuapass');
  ecu.value = '';
  ecu.placeholder = c?.tiene_ecuapass ? 'Ya guardada — escribe para reemplazarla' : 'Se guarda cifrada';
  document.getElementById('cl-error').textContent = '';
  document.getElementById('cliente-form').style.display = 'block';
}

function hideClienteForm() {
  clienteEditando = null;
  document.getElementById('cliente-form').style.display = 'none';
}

async function guardarCliente() {
  const err = document.getElementById('cl-error');
  const nombre = document.getElementById('cl-nombre').value.trim();
  if (!nombre) { err.textContent = 'El nombre o razón social es requerido'; return; }
  const body = {
    ruc: document.getElementById('cl-ruc').value.trim(),
    nombre,
    telefono: document.getElementById('cl-telefono').value.trim(),
    emails: document.getElementById('cl-emails').value,
    descripcion: document.getElementById('cl-descripcion').value.trim(),
  };
  const ecuapass = document.getElementById('cl-ecuapass').value;
  if (ecuapass) body.ecuapass = ecuapass;

  const res = clienteEditando
    ? await apiFetch('/clientes/' + clienteEditando.id, { method: 'PATCH', body: JSON.stringify(body) })
    : await apiFetch('/clientes', { method: 'POST', body: JSON.stringify(body) });
  if (!res || res.error) { err.textContent = res?.error || 'Error al guardar'; return; }

  hideClienteForm();
  showNotif(clienteEditando ? 'Cliente actualizado' : 'Cliente creado');
  loadClientes();
}

// Atajo desde el form de trámite: lleva a Clientes con el form abierto y el
// nombre ya escrito. El trámite queda como estaba al volver.
function nuevoClienteDesdeTramite() {
  const escrito = document.getElementById('campo-cliente')?.value.trim() || '';
  nav('clientes', document.getElementById('nav-clientes'));
  showClienteForm();
  if (escrito) document.getElementById('cl-nombre').value = escrito;
}

async function verEcuapass(id) {
  const res = await apiFetch('/clientes/' + id + '/ecuapass');
  if (!res || res.error) { showNotif(res?.error || 'No se pudo obtener'); return; }
  const cliente = clientesData.find(c => c.id === id);
  // Queda registrado en auditoría quién la consultó
  alert('Clave de ECUAPASS de ' + (cliente?.nombre || '') + ':\n\n' + (res.ecuapass || '(sin clave guardada)'));
}

async function deleteCliente(id) {
  const c = clientesData.find(c => c.id === id);
  if (!confirm('¿Eliminar el cliente ' + (c?.nombre || '') + '?')) return;
  const res = await apiFetch('/clientes/' + id, { method: 'DELETE' });
  if (!res || res.error) { showNotif(res?.error || 'No se pudo eliminar'); return; }
  showNotif('Cliente eliminado');
  loadClientes();
}

// ── ETIQUETAS ─────────────────────────────────────────────────────
const ETIQUETA_COLORS = [
  {name:'Azul',   hex:'#1E4FBF'}, {name:'Verde',   hex:'#1A6B3C'},
  {name:'Ámbar',  hex:'#D97706'}, {name:'Rojo',    hex:'#DC2626'},
  {name:'Morado', hex:'#7C3AED'}, {name:'Teal',    hex:'#0F766E'},
  {name:'Rosa',   hex:'#DB2777'}, {name:'Gris',    hex:'#6B7280'},
];
let selectedEtiquetaColor = ETIQUETA_COLORS[0].hex;

// Registro compartido: vive en el servidor, así todos ven las mismas etiquetas
// con el mismo color. Antes era localStorage y cada navegador tenía el suyo.
let etiquetaRegistry = [];

async function loadEtiquetas() {
  const data = await apiFetch('/etiquetas');
  if (!Array.isArray(data)) return;
  etiquetaRegistry = data;
  localStorage.removeItem('sa_etiquetas');   // ya no se usa
  renderEtiquetas();
}

async function saveEtiquetaToRegistry(text, color) {
  if (!text) return;
  const existing = etiquetaRegistry.find(e => igual(e.text, text));
  if (existing) return;
  etiquetaRegistry.push({ id: null, text, color });   // optimista, para no esperar la red
  renderEtiquetas();
  const res = await apiFetch('/etiquetas', { method: 'POST', body: JSON.stringify({ text, color }) });
  if (!res || res.error) {
    etiquetaRegistry = etiquetaRegistry.filter(e => !igual(e.text, text));
    showNotif(res?.error || 'No se pudo registrar la etiqueta');
  } else {
    const i = etiquetaRegistry.findIndex(e => igual(e.text, text));
    if (i >= 0) etiquetaRegistry[i] = res;
  }
  renderEtiquetas();
}

const igual = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
const yaPuesta = texto => etiquetasData.some(e => igual(e.text, texto));

function onEtiquetaInputChange() {
  const texto = document.getElementById('etiqueta-input')?.value || '';
  const existente = etiquetaRegistry.find(e => igual(e.text, texto));
  // Si la etiqueta ya existe conserva su color; el selector solo aparece
  // cuando de verdad se está creando una nueva.
  if (existente) selectedEtiquetaColor = existente.color;
  renderEtiquetaColorPicker();
  renderSugerencias();
}

function onEtiquetaKey(ev) {
  if (ev.key === 'Enter') { ev.preventDefault(); addEtiqueta(); }
  if (ev.key === 'Escape') { ev.target.value = ''; onEtiquetaInputChange(); }
}

function renderEtiquetaColorPicker() {
  const el = document.getElementById('etiqueta-color-picker');
  if (!el) return;
  const texto = document.getElementById('etiqueta-input')?.value || '';
  const esNueva = texto.trim() && !etiquetaRegistry.some(e => igual(e.text, texto));
  el.style.display = esNueva ? 'flex' : 'none';
  if (!esNueva) return;
  el.innerHTML = ETIQUETA_COLORS.map(c => `
    <button type="button" onclick="selectedEtiquetaColor='${c.hex}';renderEtiquetaColorPicker()" title="${c.name}"
      aria-label="Color ${c.name}"
      style="width:18px;height:18px;padding:0;border:none;border-radius:50%;background:${c.hex};cursor:pointer;
             box-shadow:${selectedEtiquetaColor===c.hex?'0 0 0 2px #fff,0 0 0 4px '+c.hex:'none'};transition:box-shadow .15s"></button>
  `).join('');
}

// Chips del registro que todavía no están puestas: un clic las agrega.
function renderSugerencias() {
  const el = document.getElementById('etiquetas-sugeridas');
  if (!el) return;
  const filtro = (document.getElementById('etiqueta-input')?.value || '').trim().toLowerCase();
  const disponibles = etiquetaRegistry
    .filter(e => !yaPuesta(e.text))
    .filter(e => !filtro || e.text.toLowerCase().includes(filtro));

  if (!etiquetaRegistry.length) { el.innerHTML = ''; return; }
  if (!disponibles.length) {
    el.innerHTML = `<span style="font-size:12px;color:var(--text-3)">${
      filtro ? 'Ninguna etiqueta coincide — Enter la crea' : 'Todas las etiquetas ya están puestas'}</span>`;
    return;
  }
  el.innerHTML = '<span style="font-size:11px;color:var(--text-3);margin-right:2px">Usar existente:</span>'
    + disponibles.map(e => `
    <span style="display:inline-flex;align-items:center;border:1px solid ${e.color};border-radius:999px;overflow:hidden">
      <button type="button" onclick="addEtiqueta('${escHtml(e.text).replace(/'/g, "\\'")}')"
        style="border:none;background:transparent;color:${e.color};font-size:12px;padding:3px 4px 3px 10px;cursor:pointer;font-family:inherit"
        title="Agregar ${escHtml(e.text)}">${escHtml(e.text)}</button>
      <button type="button" onclick="olvidarEtiqueta('${escHtml(e.text).replace(/'/g, "\\'")}')"
        style="border:none;background:transparent;color:var(--text-3);font-size:12px;padding:3px 8px 3px 4px;cursor:pointer"
        title="Quitar de la lista de etiquetas">×</button>
    </span>`).join('');
}

function renderEtiquetas() {
  const el = document.getElementById('etiquetas-chips');
  if (!el) return;
  renderEtiquetaColorPicker();
  renderSugerencias();
  el.innerHTML = etiquetasData.map((e, i) => `
    <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;
                 background:${e.color};color:#fff;font-size:12px;font-weight:500">
      ${escHtml(e.text)}
      <button type="button" onclick="removeEtiqueta(${i})" title="Quitar del trámite" aria-label="Quitar ${escHtml(e.text)}"
        style="border:none;background:transparent;color:#fff;opacity:.85;cursor:pointer;font-size:14px;line-height:1;padding:0">×</button>
    </span>
  `).join('') || '<span style="font-size:12px;color:var(--text-3)">Sin etiquetas</span>';
}

// texto opcional: viene de las sugerencias; si no, se toma del input
function addEtiqueta(texto) {
  const input = document.getElementById('etiqueta-input');
  const text = (texto ?? input?.value ?? '').trim();
  if (!text) { input?.focus(); return; }
  if (yaPuesta(text)) { showNotif('Esa etiqueta ya está puesta'); if (input) input.value = ''; renderEtiquetas(); return; }

  const existente = etiquetaRegistry.find(e => igual(e.text, text));
  const color = existente ? existente.color : selectedEtiquetaColor;
  etiquetasData.push({ text: existente ? existente.text : text, color });
  saveEtiquetaToRegistry(text, color);
  if (input) input.value = '';
  renderEtiquetas();
  guardarEtiquetas();
}

function removeEtiqueta(i) {
  etiquetasData.splice(i, 1);
  renderEtiquetas();
  guardarEtiquetas();
}

// Saca la etiqueta del registro (la lista de sugerencias), sin tocar los
// trámites que ya la tengan puesta.
async function olvidarEtiqueta(texto) {
  const et = etiquetaRegistry.find(e => igual(e.text, texto));
  if (!et) return;
  etiquetaRegistry = etiquetaRegistry.filter(e => !igual(e.text, texto));
  renderEtiquetas();
  if (!et.id) return;
  const res = await apiFetch('/etiquetas/' + et.id, { method: 'DELETE' });
  if (!res || res.error) { showNotif(res?.error || 'No se pudo quitar'); loadEtiquetas(); }
}

// Las etiquetas se guardan solas, como los gastos y anticipos: antes había que
// acordarse de apretar "Guardar cambios" o se perdían.
let etiquetasTimer = null;
function guardarEtiquetas() {
  if (!currentTramiteId || creatingMode) return;
  clearTimeout(etiquetasTimer);
  etiquetasTimer = setTimeout(async () => {
    const form = readTramiteForm();
    const res = await apiFetch('/tramites/' + currentTramiteId, {
      method: 'PUT',
      body: JSON.stringify({
        numero: form.numero, tipo: form.operacion, cliente: form.cliente,
        fecha_arribo: form.fechaApertura || null, bl: form.bl, naviera: form.naviera,
        da: form.dai, factura_comercial: form.factCom,
        factura_intraservice: form.factIntra, observaciones: form.obs,
        custom_props: customProps, etiquetas: etiquetasData,
        ...camposExtra(form), preliquidacion: preliqData,
      })
    });
    if (res && !res.error) loadBitacora();
  }, 800);
}

function etiquetasHtml(etiquetas) {
  if (!etiquetas || !etiquetas.length) return '—';
  return etiquetas.map(e =>
    `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${e.color};color:#fff;font-size:11px;font-weight:500;margin:1px 2px">${escHtml(e.text)}</span>`
  ).join('');
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
  // Las opciones de régimen dependen de la operación: hay que armarlas antes
  // de asignar el valor guardado, o el select lo descarta.
  onOperacionChange();
  for (const [campo, col] of Object.entries(CAMPOS_EXTRA)) {
    const v = data[col] ?? '';
    // Las columnas DATE llegan como ISO completo; el input type=date solo toma YYYY-MM-DD
    set(campo, typeof v === 'string' && v.includes('T') ? v.split('T')[0] : v);
  }
  onRegimenChange();
  actualizarSugerenciasOperacion();
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
  usuarios: 'Gestión de usuarios',
  clientes: 'Clientes',
  feedback: 'Feedback de usuarios'
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
  currentScreen = id;
  if (id === 'reportes') renderReportes();
  if (id === 'auditoria') loadAuditoria();
  if (id === 'dashboard') loadDashboard();
  if (id === 'bitacora') loadBitacora();
  if (id === 'usuarios') loadUsuarios();
  if (id === 'clientes') loadClientes();
  if (id === 'feedback') loadFeedback();
}

function setTab(el, targetId) {
  document.querySelectorAll('#screen-tramite .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['t-datos', 't-docs', 't-documentos', 't-estado', 't-liquidacion'].forEach(id => {
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

// Ids de documentos tildados para la descarga en zip
let docsSeleccionados = new Set();

function toggleDocSel(id, checked) {
  if (checked) docsSeleccionados.add(id); else docsSeleccionados.delete(id);
  renderDocsToolbar();
}

function toggleDocSelTodos(checked) {
  docsSeleccionados = checked ? new Set(documentoData.map(d => d.id)) : new Set();
  renderDocumentos();
}

function renderDocsToolbar() {
  const el = document.getElementById('docs-toolbar');
  if (!el) return;
  const n = docsSeleccionados.size;
  const todos = documentoData.length > 0 && n === documentoData.length;
  el.innerHTML = `
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-2);cursor:pointer">
      <input type="checkbox" ${todos ? 'checked' : ''} onchange="toggleDocSelTodos(this.checked)"> Seleccionar todos
    </label>
    <span style="font-size:12px;color:var(--text-3)">${n ? n + ' seleccionado' + (n > 1 ? 's' : '') : ''}</span>
    <button class="btn btn-sm" ${n ? '' : 'disabled'} onclick="descargarDocsZip()">↓ Descargar seleccionados (.ZIP)</button>`;
}

function renderDocumentos() {
  const el = document.getElementById('documentos-list');
  if (!el) return;
  const cont = document.getElementById('docs-contador');
  if (cont) cont.textContent = documentoData.length
    ? documentoData.length + (documentoData.length === 1 ? ' archivo' : ' archivos')
    : '';
  // Descartar selecciones de documentos que ya no existen
  docsSeleccionados = new Set([...docsSeleccionados].filter(id => documentoData.some(d => d.id === id)));
  if (!documentoData.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--text-3);text-align:center;padding:16px 0">Sin documentos adjuntos</p>';
    renderDocsToolbar();
    return;
  }
  el.innerHTML = documentoData.map(d => `
    <div class="doc-item">
      <input type="checkbox" ${docsSeleccionados.has(d.id) ? 'checked' : ''} onchange="toggleDocSel('${d.id}',this.checked)" title="Seleccionar para descarga múltiple">
      <div class="doc-icon">${docSvg}</div>
      <div class="doc-name" style="cursor:pointer;color:var(--blue)" onclick="openPreview('${d.file_url}','${escHtml(d.nombre)}')">${escHtml(d.nombre)}</div>
      <div class="doc-meta">${d.tipo||'Otro'} · ${d.size_bytes ? Math.round(d.size_bytes/1024)+' KB' : ''} · ${fmtDate(d.created_at)}</div>
      <button class="btn btn-sm btn-ghost" onclick="openPreview('${d.file_url}','${escHtml(d.nombre)}')">Vista previa</button>
      <a href="${d.file_url}" download="${escHtml(d.nombre)}" class="btn btn-sm btn-ghost">↓ Descargar</a>
      <button class="btn btn-sm btn-danger" onclick="deleteDocumento('${d.id}')">✕</button>
    </div>`).join('');
  renderDocsToolbar();
}

async function descargarDocsZip() {
  if (!currentTramiteId || !docsSeleccionados.size) return;
  showNotif('Preparando .ZIP...');
  // No se puede usar un <a download> porque la ruta necesita el token
  const res = await fetch(API_URL + '/tramites/' + currentTramiteId + '/documentos/zip', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [...docsSeleccionados] })
  });
  if (res.status === 401) { logout(); return; }
  if (!res.ok) { showNotif('No se pudo generar el .ZIP'); return; }
  const blob = await res.blob();
  const nombre = (res.headers.get('Content-Disposition') || '').match(/filename="?([^"]+)"?/)?.[1] || 'documentos.zip';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showNotif(docsSeleccionados.size + ' documento(s) descargados');
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

// ── PREVIEW MODAL ─────────────────────────────────────────────────
function openPreview(url, name) {
  const modal = document.getElementById('preview-modal');
  const content = document.getElementById('preview-content');
  const displayName = name || url.split('/').pop();
  document.getElementById('preview-filename').textContent = displayName;
  const dl = document.getElementById('preview-download-btn');
  dl.href = url;
  dl.download = displayName;
  const ext = url.split('.').pop().split('?')[0].toLowerCase();
  const isImg = ['jpg','jpeg','png','gif','webp','bmp'].includes(ext);
  if (isImg) {
    content.innerHTML = `<img src="${url}" style="max-width:100%;max-height:80vh;object-fit:contain;border-radius:6px;box-shadow:0 4px 24px rgba(0,0,0,0.6)">`;
  } else if (ext === 'pdf') {
    content.innerHTML = `<iframe src="${url}" style="width:min(960px,90vw);height:80vh;border:none;border-radius:6px;background:#fff"></iframe>`;
  } else {
    content.innerHTML = `<div style="text-align:center;color:rgba(255,255,255,0.8);padding:40px"><p style="font-size:14px;margin-bottom:16px">Sin vista previa para este tipo de archivo</p><a href="${url}" target="_blank" class="btn btn-primary">Abrir en nueva pestaña</a></div>`;
  }
  modal.style.display = 'flex';
}

function closePreview() {
  document.getElementById('preview-modal').style.display = 'none';
  document.getElementById('preview-content').innerHTML = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closePreview(); });

// ── FEEDBACK ──────────────────────────────────────────────────────
function openFeedbackModal() {
  document.getElementById('feedback-pantalla-label').textContent = pageTitles[currentScreen] || currentScreen;
  document.getElementById('feedback-mensaje').value = '';
  document.getElementById('feedback-error').textContent = '';
  document.getElementById('feedback-modal').style.display = 'flex';
}

function closeFeedbackModal() {
  document.getElementById('feedback-modal').style.display = 'none';
}

async function submitFeedback() {
  const mensaje = document.getElementById('feedback-mensaje').value.trim();
  const errEl = document.getElementById('feedback-error');
  if (!mensaje) { errEl.textContent = 'Escribe un mensaje antes de enviar'; return; }
  const data = await apiFetch('/feedback', {
    method: 'POST',
    body: JSON.stringify({ pantalla: currentScreen, mensaje })
  });
  if (!data || data.error) { errEl.textContent = data?.error || 'Error al enviar feedback'; return; }
  closeFeedbackModal();
  showNotif('Feedback enviado, ¡gracias!');
}

async function loadFeedback() {
  const body = document.getElementById('feedback-body');
  if (!body) return;
  const pantalla = document.getElementById('fb-pantalla').value;
  const desde = document.getElementById('fb-desde').value;
  const hasta = document.getElementById('fb-hasta').value;
  const params = new URLSearchParams();
  if (pantalla) params.set('pantalla', pantalla);
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  const rows = await apiFetch('/feedback' + (params.toString() ? '?' + params.toString() : ''));
  if (!rows) return;
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-3);padding:20px;font-size:12px">Sin feedback registrado</td></tr>';
    return;
  }
  body.innerHTML = rows.map(f => `
    <tr>
      <td style="font-size:12px;color:var(--text-3)">${fmtDate(f.created_at)}</td>
      <td><span class="badge badge-blue">${escHtml(pageTitles[f.pantalla] || f.pantalla)}</span></td>
      <td style="font-size:12px">${escHtml(f.user_name || '—')}</td>
      <td style="font-size:13px">${escHtml(f.mensaje)}</td>
    </tr>`).join('');
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
