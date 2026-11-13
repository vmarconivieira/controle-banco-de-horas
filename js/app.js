// Main Application Logic
const $ = id => document.getElementById(id);

let currentUser = null;
let userProfile = null;
let userSettings = {
  workday: "08:45",
  tol: 10,
  refs: ["07:15", "11:40", "13:15", "17:35"],
  theme: "light"
};
let appState = {
  entries: [],
  pointEntries: [],
  planning: [],
  parsedImportEntries: []
};

function calculateDaySaldo(worked, doubleHours = false, status = '') {
  const isOffDay = /compensado|dsr|feriado|folga/i.test(status);
  if (worked === 0 || isOffDay) return 0;
  const standard = (typeof userSettings !== 'undefined' && userSettings.workday) ? (parseTime(userSettings.workday) || 525) : 525;
  if (doubleHours) return worked * 2;
  const diff = worked - standard;
  const tol = (typeof userSettings !== 'undefined' && typeof userSettings.tol === 'number') ? userSettings.tol : 10;
  if (Math.abs(diff) <= tol) return 0;
  return diff;
}

// PWA SERVICE WORKER REGISTRATION
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(() => {
      console.log("PWA Service Worker ativo.");
    }).catch(err => {
      console.warn("Falha ao registrar Service Worker:", err);
    });
  });
}

// AUTH HANDLERS
function switchAuthTab(tab) {
  $('tabLogin').style.borderBottomColor = tab === 'login' ? 'var(--g)' : 'transparent';
  $('tabLogin').style.color = tab === 'login' ? 'var(--g)' : 'var(--mut)';
  $('tabRegister').style.borderBottomColor = tab === 'register' ? 'var(--g)' : 'transparent';
  $('tabRegister').style.color = tab === 'register' ? 'var(--g)' : 'var(--mut)';
  $('loginForm').style.display = tab === 'login' ? 'flex' : 'none';
  $('registerForm').style.display = tab === 'register' ? 'flex' : 'none';
  $('authError').style.display = 'none';
}

async function handleLogin(e) {
  e.preventDefault();
  const username = $('loginUsername').value.trim();
  const password = $('loginPassword').value;
  const btn = $('btnLoginSubmit');
  const errBox = $('authError');

  btn.disabled = true;
  btn.textContent = "Verificando...";
  errBox.style.display = 'none';

  try {
    const data = await client.signIn(username, password);
    showToast("Conectado com sucesso!", "success");
    await initAuthenticatedSession(data.user);
  } catch(err) {
    errBox.textContent = err.message || "Usuário ou senha incorretos.";
    errBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = "Acessar Sistema";
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const fullName = $('regFullName').value.trim();
  const username = $('regUsername').value.trim().toLowerCase();
  const password = $('regPassword').value;
  const confirm = $('regPasswordConfirm').value;
  const btn = $('btnRegSubmit');
  const errBox = $('authError');

  if (password !== confirm) {
    errBox.textContent = "As senhas informadas não coincidem.";
    errBox.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = "Criando usuário...";
  errBox.style.display = 'none';

  try {
    const res = await client.signUp(username, password, fullName, 'user');
    showToast("Conta criada com sucesso!", "success");
    const loginData = await client.signIn(username, password);
    await initAuthenticatedSession(loginData.user);
  } catch(err) {
    errBox.textContent = err.message || "Erro ao criar usuário.";
    errBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = "Criar Meu Usuário";
  }
}

async function handleLogout() {
  if (!confirm("Deseja realmente sair da sua conta?")) return;
  await client.signOut();
  currentUser = null;
  userProfile = null;
  $('authBackdrop').classList.add('open');
  $('userDropdown').classList.remove('open');
  showToast("Sessão encerrada.", "info");
}

async function initAuthenticatedSession(user) {
  currentUser = user;
  $('authBackdrop').classList.remove('open');

  try {
    const profiles = await client.select('timebank_profiles', 'id=eq.' + user.id);
    userProfile = profiles && profiles[0] ? profiles[0] : {
      username: user.user_metadata?.username || user.email.split('@')[0],
      full_name: user.user_metadata?.full_name || 'Usuário',
      role: user.user_metadata?.role || 'user'
    };
  } catch(e) {
    userProfile = {
      username: user.user_metadata?.username || 'usuario',
      full_name: user.user_metadata?.full_name || 'Usuário',
      role: user.user_metadata?.role || 'user'
    };
  }

  const initials = (userProfile.full_name || 'U').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  $('sideAvatar').textContent = initials;
  $('sideUserName').textContent = userProfile.full_name;
  $('sideUserRole').textContent = userProfile.role === 'admin' ? 'Administrador' : 'Colaborador';
  $('topbarUsername').textContent = '@' + userProfile.username;

  if (userProfile.role === 'admin') {
    $('adminNavGroup').style.display = 'block';
  } else {
    $('adminNavGroup').style.display = 'none';
  }

  const today = new Date().toISOString().split('T')[0];
  if ($('entryDate')) $('entryDate').value = today;

  await loadUserData();
  updateNetworkPill();
}

// DATA LOADING & OFFLINE RESILIENCE
async function loadUserData() {
  if (!currentUser) return;

  const snapshot = OfflineRepository.loadSnapshot(currentUser.id);
  if (snapshot) {
    appState.entries = snapshot.entries || [];
    appState.pointEntries = snapshot.pointEntries || [];
    appState.planning = snapshot.planning || [];
    renderAllViews();
  }

  if (navigator.onLine) {
    try {
      const [entries, pointEntries, planning, settings] = await Promise.all([
        client.select('timebank_entries', 'user_id=eq.' + currentUser.id + '&order=date.desc'),
        client.select('timebank_point_entries', 'user_id=eq.' + currentUser.id + '&order=date.asc'),
        client.select('timebank_planning', 'user_id=eq.' + currentUser.id + '&order=date.asc'),
        client.select('timebank_settings', 'user_id=eq.' + currentUser.id)
      ]);

      if (settings && settings[0]) {
        userSettings = { ...userSettings, ...settings[0] };
      }

      appState.entries = entries || [];
      appState.pointEntries = pointEntries || [];
      appState.planning = planning || [];

      OfflineRepository.saveSnapshot(currentUser.id, appState);
      renderAllViews();
      updateNetworkPill();
    } catch(err) {
      console.warn("Nuvem inacessível temporariamente, operando em cache local:", err);
    }
  }
}

// RENDER ALL VIEWS
function renderAllViews() {
  renderDashboard();
  renderPointTable();
  renderPlanningTable();
  if (userProfile && userProfile.role === 'admin') {
    loadAdminUsers();
  }
}

function renderDashboard() {
  const tbody = $('entriesTableBody');
  if (!tbody) return;

  if (appState.entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:28px; color:var(--mut);">Nenhum lançamento registrado ainda. Adicione acima ou importe o cartão ponto.</td></tr>';
    updateKPIs(0, 0, 0);
    return;
  }

  let totalSaldoMinutes = 0;
  let mesSaldoMinutes = 0;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const activeMonth = appState.entries.length > 0 ? appState.entries[0].date.slice(0, 7) : currentMonth;
  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const [y, m] = activeMonth.split('-');
  if ($('kpiNomeMes')) $('kpiNomeMes').textContent = `${monthNames[parseInt(m, 10) - 1]} / ${y}`;

  tbody.innerHTML = appState.entries.map(e => {
    const worked = calculateDailyWorked(e.in1, e.out1, e.in2, e.out2);
    const saldo = calculateDaySaldo(worked, e.double_hours, e.status);
    totalSaldoMinutes += saldo;
    if (e.date.startsWith(activeMonth)) mesSaldoMinutes += saldo;

    const saldoBadge = saldo > 0 
      ? `<span class="badge positive">${formatMinutes(saldo)}</span>`
      : (saldo < 0 ? `<span class="badge negative">${formatMinutes(saldo)}</span>` : `<span class="badge neutral">${formatMinutes(0)}</span>`);
    const weekday = getWeekdayName(e.date);

    return `
      <tr>
        <td><b>${formatDateBR(e.date)}</b></td>
        <td style="color:var(--mut); font-size:12px;">${weekday}</td>
        <td>${e.in1 || '--:--'}</td>
        <td>${e.out1 || '--:--'}</td>
        <td>${e.in2 || '--:--'}</td>
        <td>${e.out2 || '--:--'}</td>
        <td>${formatMinutes(worked, false)}</td>
        <td>${saldoBadge}</td>
        <td>
          <button class="btn secondary icon-only" onclick="deleteEntry('${e.date}')" title="Excluir lançamento">
            <svg class="svg-icon sm" style="stroke:var(--red);"><use href="#icon-trash"/></svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  updateKPIs(totalSaldoMinutes, mesSaldoMinutes, appState.entries.length);
}

function updateKPIs(totalSaldo, mesSaldo, count) {
  const kpiTotal = $('kpiSaldoTotal');
  const kpiMes = $('kpiSaldoMes');
  const kpiCount = $('kpiCountLancamentos');
  const kpiCred = $('kpiCreditosPonto');

  if (kpiTotal) {
    kpiTotal.textContent = formatMinutes(totalSaldo);
    kpiTotal.style.color = totalSaldo >= 0 ? 'var(--g)' : 'var(--red)';
  }
  if (kpiMes) {
    kpiMes.textContent = formatMinutes(mesSaldo);
    kpiMes.style.color = mesSaldo >= 0 ? 'var(--g)' : 'var(--red)';
  }
  if (kpiCount) kpiCount.textContent = count;
  if (kpiCred) kpiCred.textContent = appState.pointEntries.length;
}

function renderPointTable() {
  const tbody = $('pointTableBody');
  if (!tbody) return;

  if (appState.pointEntries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:28px; color:var(--mut);">Nenhum arquivo de cartão ponto importado ainda. Clique em "Importar Arquivo".</td></tr>';
    return;
  }

  tbody.innerHTML = appState.pointEntries.map(p => {
    const batidas = [p.in1, p.out1, p.in2, p.out2].filter(Boolean).join(' • ') || 'Sem batidas';
    const worked = calculateDailyWorked(p.in1, p.out1, p.in2, p.out2);
    const saldo = calculateDaySaldo(worked, false, p.status);
    const saldoBadge = saldo > 0 
      ? `<span class="badge positive">${formatMinutes(saldo)}</span>`
      : (saldo < 0 ? `<span class="badge negative">${formatMinutes(saldo)}</span>` : `<span class="badge neutral">${formatMinutes(0)}</span>`);

    let statusBadgeClass = 'neutral';
    if (/cr[eé]dito/i.test(p.status)) statusBadgeClass = 'positive';
    else if (/d[eé]bito/i.test(p.status)) statusBadgeClass = 'negative';

    return `
      <tr>
        <td><b>${formatDateBR(p.date)}</b></td>
        <td style="color:var(--mut); font-size:12px;">${getWeekdayName(p.date)}</td>
        <td><span style="font-family:monospace; font-size:12.5px;">${batidas}</span></td>
        <td>${formatMinutes(worked, false)}</td>
        <td>${saldoBadge}</td>
        <td><span class="badge ${statusBadgeClass}">${p.status || 'Importado'}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            ${p.in1 ? `
              <button class="btn secondary" style="padding:4px 8px; font-size:11.5px;" onclick="convertPointToEntry('${p.date}')">
                Lançar no Banco
              </button>
            ` : ''}
            <button class="btn secondary icon-only" onclick="deletePointEntry('${p.date}')" title="Excluir do espelho">
              <svg class="svg-icon sm" style="stroke:var(--red);"><use href="#icon-trash"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function convertPointToEntry(date) {
  if (!currentUser) return;
  const p = appState.pointEntries.find(it => it.date === date);
  if (!p) {
    showToast("Registro de ponto não encontrado.", "error");
    return;
  }

  const newRecord = {
    user_id: currentUser.id,
    date: p.date,
    in1: p.in1 || null,
    out1: p.out1 || null,
    in2: p.in2 || null,
    out2: p.out2 || null,
    double_hours: false,
    status: p.status || 'Registrado',
    source: 'point_card'
  };

  const existingIdx = appState.entries.findIndex(e => e.date === date);
  if (existingIdx >= 0) appState.entries[existingIdx] = newRecord;
  else appState.entries.unshift(newRecord);
  appState.entries.sort((a, b) => b.date.localeCompare(a.date));

  OfflineRepository.saveSnapshot(currentUser.id, appState);
  renderAllViews();
  showToast(`Dia ${formatDateBR(date)} lançado no Banco de Horas!`, "success");

  if (navigator.onLine) {
    try {
      await client.upsert('timebank_entries', newRecord);
    } catch(err) {
      OfflineRepository.addToQueue(currentUser.id, { action: 'upsert', table: 'timebank_entries', data: newRecord });
    }
  } else {
    OfflineRepository.addToQueue(currentUser.id, { action: 'upsert', table: 'timebank_entries', data: newRecord });
  }
}

async function deletePointEntry(date) {
  if (!confirm(`Deseja remover o ponto do dia ${formatDateBR(date)} do espelho?`)) return;
  if (!currentUser) return;

  appState.pointEntries = appState.pointEntries.filter(it => it.date !== date);
  OfflineRepository.saveSnapshot(currentUser.id, appState);
  renderPointTable();
  if ($('kpiCreditosPonto')) $('kpiCreditosPonto').textContent = appState.pointEntries.length;
  showToast("Registro removido do espelho de ponto.", "info");

  const filter = `user_id=eq.${currentUser.id}&date=eq.${date}`;
  if (navigator.onLine) {
    try {
      await client.delete('timebank_point_entries', filter);
    } catch(err) {
      OfflineRepository.addToQueue(currentUser.id, { action: 'delete', table: 'timebank_point_entries', filter });
    }
  } else {
    OfflineRepository.addToQueue(currentUser.id, { action: 'delete', table: 'timebank_point_entries', filter });
  }
}

async function handleClearPoint() {
  if (appState.pointEntries.length === 0) return alert("Não há registros de ponto importados para limpar.");
  if (!confirm("Deseja apagar todos os registros do espelho de ponto importado?")) return;
  if (!currentUser) return;

  appState.pointEntries = [];
  OfflineRepository.saveSnapshot(currentUser.id, appState);
  renderPointTable();
  if ($('kpiCreditosPonto')) $('kpiCreditosPonto').textContent = 0;
  showToast("Espelho de ponto limpo.", "info");

  if (navigator.onLine) {
    try {
      await client.delete('timebank_point_entries', 'user_id=eq.' + currentUser.id);
    } catch(e) {}
  }
}

function renderPlanningTable() {
  const tbody = $('planTableBody');
  if (!tbody) return;

  if (appState.planning.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--mut);">Nenhuma meta ou folga planejada.</td></tr>';
    return;
  }

  tbody.innerHTML = appState.planning.map((pl, idx) => `
    <tr>
      <td><b>${formatDateBR(pl.date)}</b></td>
      <td><span class="badge neutral">${pl.type || 'Meta'}</span></td>
      <td>${pl.hours} horas</td>
      <td>
        <button class="btn secondary icon-only" onclick="deletePlan('${pl.id || idx}')" title="Excluir">
          <svg class="svg-icon sm" style="stroke:var(--red);"><use href="#icon-trash"/></svg>
        </button>
      </td>
    </tr>
  `).join('');
}

// CRUD FOR ENTRIES
async function handleSaveEntry(e) {
  e.preventDefault();
  if (!currentUser) return;

  const date = $('entryDate').value;
  const in1 = $('entryIn1').value || null;
  const out1 = $('entryOut1').value || null;
  const in2 = $('entryIn2').value || null;
  const out2 = $('entryOut2').value || null;
  const double_hours = $('entryDouble').value === 'true';

  const newRecord = {
    user_id: currentUser.id,
    date,
    in1,
    out1,
    in2,
    out2,
    double_hours,
    status: 'Registrado',
    source: 'manual'
  };

  const existingIdx = appState.entries.findIndex(it => it.date === date);
  if (existingIdx >= 0) appState.entries[existingIdx] = newRecord;
  else appState.entries.unshift(newRecord);
  appState.entries.sort((a, b) => b.date.localeCompare(a.date));

  OfflineRepository.saveSnapshot(currentUser.id, appState);
  renderDashboard();
  showToast("Lançamento gravado!", "success");

  if (navigator.onLine) {
    try {
      await client.upsert('timebank_entries', newRecord);
    } catch(err) {
      OfflineRepository.addToQueue(currentUser.id, { action: 'upsert', table: 'timebank_entries', data: newRecord });
    }
  } else {
    OfflineRepository.addToQueue(currentUser.id, { action: 'upsert', table: 'timebank_entries', data: newRecord });
  }
}

async function deleteEntry(date) {
  if (!confirm(`Deseja excluir o lançamento do dia ${formatDateBR(date)}?`)) return;
  if (!currentUser) return;

  appState.entries = appState.entries.filter(it => it.date !== date);
  OfflineRepository.saveSnapshot(currentUser.id, appState);
  renderDashboard();
  showToast("Lançamento removido.", "info");

  const filter = `user_id=eq.${currentUser.id}&date=eq.${date}`;
  if (navigator.onLine) {
    try {
      await client.delete('timebank_entries', filter);
    } catch(err) {
      OfflineRepository.addToQueue(currentUser.id, { action: 'delete', table: 'timebank_entries', filter });
    }
  } else {
    OfflineRepository.addToQueue(currentUser.id, { action: 'delete', table: 'timebank_entries', filter });
  }
}

async function handleClearAll() {
  if (!confirm("ATENÇÃO: Deseja apagar TODOS os seus lançamentos da base? Esta ação é irreversível.")) return;
  if (!currentUser) return;

  appState.entries = [];
  appState.pointEntries = [];
  appState.planning = [];
  OfflineRepository.saveSnapshot(currentUser.id, appState);
  renderAllViews();
  showToast("Todos os registros locais foram limpos.", "info");

  if (navigator.onLine) {
    try {
      await client.delete('timebank_entries', 'user_id=eq.' + currentUser.id);
      await client.delete('timebank_point_entries', 'user_id=eq.' + currentUser.id);
      await client.delete('timebank_planning', 'user_id=eq.' + currentUser.id);
    } catch(e) {}
  }
}

// SMART CSV / TSV TIME CARD PARSER ("Outubro.csv")
function openImportModal() {
  $('importModal').classList.add('open');
  $('importPreviewArea').style.display = 'none';
  $('btnConfirmImport').disabled = true;
  appState.parsedImportEntries = [];
}
function closeImportModal() { $('importModal').classList.remove('open'); }

function handleDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('dragover'); }
function handleDragLeave(e) { e.currentTarget.classList.remove('dragover'); }
function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
}
function handleFileSelect(e) {
  if (e.target.files && e.target.files[0]) readFile(e.target.files[0]);
}
function readFile(file) {
  const r = new FileReader();
  r.onload = ev => {
    $('importRawText').value = ev.target.result;
    parseRawInput();
  };
  r.readAsText(file);
}

function parseRawInput() {
  const text = $('importRawText').value;
  const results = parseTimecardContent(text);

  if (results.length === 0) {
    alert("Nenhum dia de ponto com horários válidos foi detectado no arquivo. Verifique o formato.");
    return;
  }

  appState.parsedImportEntries = results;
  renderImportPreview();
}

function renderImportPreview() {
  const list = appState.parsedImportEntries;
  $('importCountBadge').textContent = `${list.length} dias identificados`;
  $('importPreviewArea').style.display = 'block';
  $('btnConfirmImport').disabled = false;

  const tbody = $('importPreviewBody');
  tbody.innerHTML = list.slice(0, 31).map(it => {
    const worked = calculateDailyWorked(it.in1, it.out1, it.in2, it.out2);
    const saldo = worked - (8 * 60);
    return `
      <tr>
        <td><b>${formatDateBR(it.date)}</b></td>
        <td>${it.in1 || '--:--'}</td>
        <td>${it.out1 || '--:--'}</td>
        <td>${it.in2 || '--:--'}</td>
        <td>${it.out2 || '--:--'}</td>
        <td>${formatMinutes(worked, false)}</td>
        <td><span class="badge ${saldo >= 0 ? 'positive' : 'negative'}">${formatMinutes(saldo)}</span></td>
      </tr>
    `;
  }).join('');
}

async function executeImport() {
  if (!currentUser || appState.parsedImportEntries.length === 0) return;
  const btn = $('btnConfirmImport');
  btn.disabled = true;
  btn.textContent = "Sincronizando...";

  const entriesToSave = appState.parsedImportEntries.map(it => ({
    user_id: currentUser.id,
    date: it.date,
    in1: it.in1,
    out1: it.out1,
    in2: it.in2,
    out2: it.out2,
    double_hours: it.double_hours,
    status: 'Importado de Cartão Ponto',
    source: 'csv_import'
  }));

  const pointEntriesToSave = appState.parsedImportEntries.map(it => ({
    user_id: currentUser.id,
    date: it.date,
    in1: it.in1,
    out1: it.out1,
    in2: it.in2,
    out2: it.out2,
    status: 'Importado',
    source: 'ponto'
  }));

  for (const item of entriesToSave) {
    const idx = appState.entries.findIndex(e => e.date === item.date);
    if (idx >= 0) appState.entries[idx] = item;
    else appState.entries.push(item);
  }
  appState.entries.sort((a, b) => b.date.localeCompare(a.date));

  for (const pItem of pointEntriesToSave) {
    const pIdx = appState.pointEntries.findIndex(e => e.date === pItem.date);
    if (pIdx >= 0) appState.pointEntries[pIdx] = pItem;
    else appState.pointEntries.push(pItem);
  }
  appState.pointEntries.sort((a, b) => b.date.localeCompare(a.date));

  OfflineRepository.saveSnapshot(currentUser.id, appState);
  renderAllViews();

  closeImportModal();
  showToast(`${entriesToSave.length} dias importados com sucesso!`, "success");

  if (navigator.onLine) {
    for (const item of entriesToSave) {
      try {
        await client.upsert('timebank_entries', item);
      } catch(e) {
        OfflineRepository.addToQueue(currentUser.id, { action: 'upsert', table: 'timebank_entries', data: item });
      }
    }
    for (const pItem of pointEntriesToSave) {
      try {
        await client.upsert('timebank_point_entries', pItem);
      } catch(e) {
        OfflineRepository.addToQueue(currentUser.id, { action: 'upsert', table: 'timebank_point_entries', data: pItem });
      }
    }
  } else {
    for (const item of entriesToSave) {
      OfflineRepository.addToQueue(currentUser.id, { action: 'upsert', table: 'timebank_entries', data: item });
    }
    for (const pItem of pointEntriesToSave) {
      OfflineRepository.addToQueue(currentUser.id, { action: 'upsert', table: 'timebank_point_entries', data: pItem });
    }
  }
  btn.disabled = false;
  btn.textContent = "Confirmar e Sincronizar";
}

// EXPORT CSV
function exportCSV() {
  if (appState.entries.length === 0) return alert("Não há lançamentos para exportar.");
  const header = "Data;Dia;Entrada 1;Saida 1;Entrada 2;Saida 2;Horas Trabalhadas;Saldo Minutos;Saldo Formatado;Status\n";
  const rows = appState.entries.map(e => {
    const worked = calculateDailyWorked(e.in1, e.out1, e.in2, e.out2);
    const saldo = calculateDaySaldo(worked, e.double_hours, e.status);
    return `${formatDateBR(e.date)};${getWeekdayName(e.date)};${e.in1 || ''};${e.out1 || ''};${e.in2 || ''};${e.out2 || ''};${formatMinutes(worked, false)};${saldo};${formatMinutes(saldo)};${e.status || ''}`;
  }).join('\n');

  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `banco_de_horas_${userProfile ? userProfile.username : 'export'}.csv`;
  a.click();
  showToast("Arquivo CSV baixado!", "success");
}

// USER SELF-SERVICE PASSWORD CHANGE
function openChangePasswordModal() {
  $('changePasswordModal').classList.add('open');
  $('userDropdown').classList.remove('open');
  $('selfNewPassword').value = '';
  $('selfConfirmPassword').value = '';
}
function closeChangePasswordModal() { $('changePasswordModal').classList.remove('open'); }

async function handleSelfPasswordChange(e) {
  e.preventDefault();
  const p1 = $('selfNewPassword').value;
  const p2 = $('selfConfirmPassword').value;
  if (p1 !== p2) return alert("As senhas informadas não conferem.");
  if (p1.length < 6) return alert("A senha deve ter no mínimo 6 caracteres.");

  try {
    await client.updatePassword(p1);
    closeChangePasswordModal();
    showToast("Sua senha foi alterada com sucesso!", "success");
  } catch(err) {
    alert("Erro ao alterar senha: " + err.message);
  }
}

// ADMIN CONTROLS (DEDICATED ADMIN TAB)
let adminUsersList = [];
async function loadAdminUsers() {
  if (!currentUser || (userProfile && userProfile.role !== 'admin')) return;
  try {
    const users = await client.rpc('admin_list_users', {});
    adminUsersList = users || [];
    renderAdminUsersTable(adminUsersList);

    $('admKpiUsers').textContent = adminUsersList.length;
    $('admKpiAdmins').textContent = adminUsersList.filter(u => u.role === 'admin').length;
    const totalGlobalEntries = adminUsersList.reduce((acc, u) => acc + (parseInt(u.entries_count) || 0), 0);
    $('admKpiEntries').textContent = totalGlobalEntries;
  } catch(err) {
    console.warn("Falha ao carregar lista de usuários admin:", err);
  }
}

function renderAdminUsersTable(users) {
  const tbody = $('admUsersTableBody');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--mut);">Nenhum usuário encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td><b>@${u.username}</b></td>
      <td>${u.full_name || 'Sem nome'}</td>
      <td><span class="badge ${u.role === 'admin' ? 'admin' : 'user'}">${u.role === 'admin' ? 'Administrador' : 'Colaborador'}</span></td>
      <td style="color:var(--mut); font-size:12px;">${formatDateBR(u.created_at.split('T')[0])}</td>
      <td><b>${u.entries_count || 0}</b> lançamentos</td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn secondary icon-only" onclick="openAdminResetModal('${u.user_id}', '${u.username}')" title="Redefinir senha">
            <svg class="svg-icon sm"><use href="#icon-key"/></svg>
          </button>
          ${u.username !== 'admin' && u.username !== (userProfile ? userProfile.username : '') ? `
            <button class="btn danger icon-only" onclick="handleAdminDeleteUser('${u.user_id}', '${u.username}')" title="Excluir usuário">
              <svg class="svg-icon sm"><use href="#icon-trash"/></svg>
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

function filterAdminUsers() {
  const q = $('admUserSearch').value.toLowerCase().trim();
  const filtered = adminUsersList.filter(u => u.username.toLowerCase().includes(q) || (u.full_name && u.full_name.toLowerCase().includes(q)));
  renderAdminUsersTable(filtered);
}

async function handleAdminCreateUser(e) {
  e.preventDefault();
  const fullName = $('admNewFullName').value.trim();
  const username = $('admNewUsername').value.trim().toLowerCase();
  const password = $('admNewPassword').value;
  const role = $('admNewRole').value;

  try {
    await client.signUp(username, password, fullName, role);
    showToast(`Usuário @${username} criado com sucesso!`, "success");
    $('admNewFullName').value = '';
    $('admNewUsername').value = '';
    $('admNewPassword').value = '';
    await loadAdminUsers();
  } catch(err) {
    alert("Erro ao criar usuário: " + err.message);
  }
}

function openAdminResetModal(userId, username) {
  $('admResetModal').classList.add('open');
  $('admResetUserId').value = userId;
  $('admResetUserName').value = '@' + username;
  $('admResetNewPass').value = '';
}
function closeAdminResetModal() { $('admResetModal').classList.remove('open'); }

async function handleConfirmAdminReset(e) {
  e.preventDefault();
  const userId = $('admResetUserId').value;
  const newPass = $('admResetNewPass').value;
  if (newPass.length < 6) return alert("A senha deve ter no mínimo 6 caracteres.");

  try {
    await client.rpc('admin_reset_password', { target_user_id: userId, new_password: newPass });
    closeAdminResetModal();
    showToast("Senha redefinida com sucesso!", "success");
  } catch(err) {
    alert("Erro ao redefinir senha: " + err.message);
  }
}

async function handleAdminDeleteUser(userId, username) {
  if (!confirm(`Tem certeza absoluta de que deseja excluir o usuário @${username} e todos os seus lançamentos?`)) return;
  try {
    await client.rpc('admin_delete_user', { target_user_id: userId });
    showToast(`Usuário @${username} excluído com sucesso.`, "info");
    await loadAdminUsers();
  } catch(err) {
    alert("Erro ao excluir usuário: " + err.message);
  }
}

// MANUAL FORCE SYNC
async function manualForceSync() {
  if (!currentUser) return;
  if (!navigator.onLine) return alert("Dispositivo sem conexão com a internet.");

  const q = OfflineRepository.getQueue(currentUser.id);
  if (q.length === 0) {
    await loadUserData();
    showToast("Tudo atualizado e sincronizado com a nuvem!", "success");
    return;
  }

  showToast(`Sincronizando ${q.length} operações pendentes...`, "info");
  for (const op of q) {
    try {
      if (op.action === 'upsert') await client.upsert(op.table, op.data);
      else if (op.action === 'delete') await client.delete(op.table, op.filter);
    } catch(e) { console.warn("Falha ao sincronizar item da fila", op, e); }
  }
  OfflineRepository.clearQueue(currentUser.id);
  await loadUserData();
  showToast("Sincronização concluída com sucesso!", "success");
}

// NAVIGATION & UI TOGGLES
function showView(viewId, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
  $(viewId).classList.add('active');
  if (btn) btn.classList.add('active');

  const titles = {
    'v-dashboard': 'Dashboard & Horas',
    'v-point': 'Cartão Ponto Oficial',
    'v-sim': 'Simulação de Banco de Horas',
    'v-plan': 'Planejamento e Metas',
    'v-admin': 'Painel Administrativo'
  };
  $('pageTitle').textContent = titles[viewId] || 'Banco de Horas';

  if (window.innerWidth <= 900) {
    document.body.classList.remove('side-open');
  }
}

function toggleSide() {
  if (window.innerWidth <= 900) {
    document.body.classList.toggle('side-open');
  } else {
    document.body.classList.toggle('side-collapsed');
  }
}

function toggleUserDropdown(e) {
  e.stopPropagation();
  $('userDropdown').classList.toggle('open');
}
window.addEventListener('click', () => { $('userDropdown').classList.remove('open'); });

function toggleDarkMode() {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('timebank_theme', isDark ? 'dark' : 'light');
  $('themeIcon').innerHTML = `<use href="#icon-${isDark ? 'sun' : 'moon'}"/>`;
}

function showToast(msg, type = 'info') {
  const c = $('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(10px)';
    t.style.transition = 'all .25s ease';
    setTimeout(() => t.remove(), 250);
  }, 4000);
}

// SIMULATION & PLANNING
function calculateSimulation() {
  const extraMin = parseInt($('simDailyMinutes').value, 10) || 0;
  const days = parseInt($('simDaysAvailable').value, 10) || 0;
  const totalExtra = extraMin * days;
  const formatted = formatMinutes(totalExtra);
  $('simResult').textContent = `Você acumulará aproximadamente ${formatted} adicionais em ${days} dias úteis (${formatMinutes(extraMin, false)} por dia).`;
}

async function handleSavePlan(e) {
  e.preventDefault();
  if (!currentUser) return;
  const date = $('planDate').value;
  const type = $('planType').value;
  const hours = parseFloat($('planHours').value) || 0;

  const item = { user_id: currentUser.id, date, type, hours };
  appState.planning.push(item);
  renderPlanningTable();
  OfflineRepository.saveSnapshot(currentUser.id, appState);
  showToast("Meta planejada adicionada!", "success");

  if (navigator.onLine) {
    try {
      const res = await client.upsert('timebank_planning', item);
      if (res && res[0] && res[0].id) item.id = res[0].id;
      OfflineRepository.saveSnapshot(currentUser.id, appState);
    } catch(err) {
      OfflineRepository.addToQueue(currentUser.id, { action: 'upsert', table: 'timebank_planning', data: item });
    }
  } else {
    OfflineRepository.addToQueue(currentUser.id, { action: 'upsert', table: 'timebank_planning', data: item });
  }
}

async function deletePlan(identifier) {
  if (!confirm("Deseja realmente remover esta meta?")) return;
  if (!currentUser) return;

  const idx = appState.planning.findIndex((it, index) => (it.id && String(it.id) === String(identifier)) || String(index) === String(identifier) || it.date === identifier);
  let removed = null;
  if (idx >= 0) {
    removed = appState.planning.splice(idx, 1)[0];
  }
  OfflineRepository.saveSnapshot(currentUser.id, appState);
  renderPlanningTable();
  showToast("Meta removida.", "info");

  if (removed) {
    const filter = removed.id ? `id=eq.${removed.id}` : `user_id=eq.${currentUser.id}&date=eq.${removed.date}`;
    if (navigator.onLine) {
      try {
        await client.delete('timebank_planning', filter);
      } catch(err) {
        OfflineRepository.addToQueue(currentUser.id, { action: 'delete', table: 'timebank_planning', filter });
      }
    } else {
      OfflineRepository.addToQueue(currentUser.id, { action: 'delete', table: 'timebank_planning', filter });
    }
  }
}

// INITIALIZATION
window.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('timebank_theme') === 'dark') {
    document.body.classList.add('dark');
    $('themeIcon').innerHTML = '<use href="#icon-sun"/>';
  }

  if (client.session && client.session.user) {
    initAuthenticatedSession(client.session.user);
  } else {
    $('authBackdrop').classList.add('open');
  }

  if (window.innerWidth <= 900) {
    $('mobileMenuBtn').style.display = 'inline-flex';
  }
});
