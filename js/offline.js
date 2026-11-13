// Offline First Manager & Local Storage Snapshot
const OfflineRepository = {
  getSnapshotKey: uid => `timebank_snapshot_${uid}`,
  getQueueKey: uid => `timebank_sync_queue_${uid}`,

  saveSnapshot(uid, state, settings = null) {
    try {
      localStorage.setItem(this.getSnapshotKey(uid), JSON.stringify({
        entries: state.entries,
        pointEntries: state.pointEntries,
        planning: state.planning,
        settings: settings || state.settings || null,
        timestamp: new Date().toISOString()
      }));
    } catch(e) { console.warn("Falha ao gravar cache local", e); }
  },

  loadSnapshot(uid) {
    try {
      const raw = localStorage.getItem(this.getSnapshotKey(uid));
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  },

  getQueue(uid) {
    try {
      const raw = localStorage.getItem(this.getQueueKey(uid));
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  },

  addToQueue(uid, op) {
    const q = this.getQueue(uid);
    q.push({ ...op, id: 'op_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5), time: Date.now() });
    localStorage.setItem(this.getQueueKey(uid), JSON.stringify(q));
    updateNetworkPill();
  },

  clearQueue(uid) {
    localStorage.removeItem(this.getQueueKey(uid));
    updateNetworkPill();
  }
};

function updateNetworkPill() {
  const pill = document.getElementById('syncStatusPill');
  const text = document.getElementById('syncStatusText');
  if (!pill || !text) return;

  if (!navigator.onLine) {
    pill.className = 'status-pill offline';
    text.textContent = 'Modo Offline (dados locais)';
    return;
  }

  if (currentUser) {
    const q = OfflineRepository.getQueue(currentUser.id);
    if (q.length > 0) {
      pill.className = 'status-pill syncing';
      text.textContent = `${q.length} pendente(s) de sincronizar`;
      return;
    }
  }

  pill.className = 'status-pill online';
  text.textContent = 'Sincronizado';
}

window.addEventListener('online', () => {
  if (typeof showToast === 'function') showToast("Conexão restabelecida! Sincronizando com a nuvem...", "info");
  if (typeof manualForceSync === 'function') manualForceSync();
});

window.addEventListener('offline', () => {
  updateNetworkPill();
  if (typeof showToast === 'function') showToast("Sem conexão. Utilizando base local offline.", "warning");
});
