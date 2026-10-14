// Health Saathi 360 - Offline Storage & Sync Engine (IndexedDB & Service Worker)

const DB_NAME = 'HealthSaathiDB';
const DB_VERSION = 1;
let dbInstance = null;

// Open or initialize IndexedDB
function getDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Store for unsaved draft forms
      if (!db.objectStoreNames.contains('patient_drafts')) {
        db.createObjectStore('patient_drafts', { keyPath: 'form_id' });
      }

      // Store for pending mutating operations while offline
      if (!db.objectStoreNames.contains('offline_queue')) {
        const queueStore = db.createObjectStore('offline_queue', { keyPath: 'id' });
        queueStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // Store for cached healthcare facilities for offline map viewing
      if (!db.objectStoreNames.contains('facilities_cache')) {
        const facStore = db.createObjectStore('facilities_cache', { keyPath: 'id' });
        facStore.createIndex('operator_type', 'operator_type', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Save form draft in IndexedDB
async function saveFormDraft(formId, data) {
  try {
    const db = await getDB();
    const tx = db.transaction('patient_drafts', 'readwrite');
    const store = tx.objectStore('patient_drafts');
    store.put({
      form_id: formId,
      data,
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Failed to save form draft to IndexedDB:', err);
  }
}

// Retrieve form draft from IndexedDB
async function getFormDraft(formId) {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('patient_drafts', 'readonly');
      const store = tx.objectStore('patient_drafts');
      const req = store.get(formId);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

// Clear form draft after submission
async function clearFormDraft(formId) {
  try {
    const db = await getDB();
    const tx = db.transaction('patient_drafts', 'readwrite');
    tx.objectStore('patient_drafts').delete(formId);
  } catch (err) {
    console.warn('Failed to clear form draft:', err);
  }
}

// Queue an offline operation (e.g., patient create, referral create, status update)
async function queueOfflineOperation(operation) {
  try {
    const db = await getDB();
    const op = {
      id: operation.id || `QUEUE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: operation.type,
      entity_id: operation.entity_id,
      payload: operation.payload,
      client_timestamp: new Date().toISOString(),
      created_at: Date.now()
    };

    const tx = db.transaction('offline_queue', 'readwrite');
    tx.objectStore('offline_queue').put(op);
    updateQueueBadge();
    return op;
  } catch (err) {
    console.error('Failed to queue offline operation:', err);
    throw err;
  }
}

// Get all pending offline operations
async function getOfflineQueue() {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('offline_queue', 'readonly');
      const store = tx.objectStore('offline_queue');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

// Clear an item from the offline queue after successful sync
async function removeQueueItem(id) {
  try {
    const db = await getDB();
    const tx = db.transaction('offline_queue', 'readwrite');
    tx.objectStore('offline_queue').delete(id);
    updateQueueBadge();
  } catch (err) {
    console.warn('Failed to remove queue item:', err);
  }
}

// Save facilities in offline cache
async function cacheFacilities(facilities) {
  try {
    if (!Array.isArray(facilities) || facilities.length === 0) return;
    const db = await getDB();
    const tx = db.transaction('facilities_cache', 'readwrite');
    const store = tx.objectStore('facilities_cache');
    for (const fac of facilities) {
      store.put({
        ...fac,
        cached_at: new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn('Failed to cache facilities:', err);
  }
}

// Retrieve cached facilities when offline
async function getOfflineCachedFacilities() {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('facilities_cache', 'readonly');
      const store = tx.objectStore('facilities_cache');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

// Update the sync badge in the navigation / header
async function updateQueueBadge() {
  const queue = await getOfflineQueue();
  const badge = document.getElementById('offline-queue-badge');
  const banner = document.getElementById('offline-status-banner');

  if (badge) {
    if (queue.length > 0) {
      badge.textContent = `${queue.length} ${t('pending_sync')}`;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  const isOnline = navigator.onLine;
  const statusPill = document.getElementById('network-status-indicator');
  if (statusPill) {
    if (isOnline) {
      statusPill.className = 'status-indicator online';
      statusPill.innerHTML = `<span class="dot"></span> ${t('online_status')}`;
    } else {
      statusPill.className = 'status-indicator offline';
      statusPill.innerHTML = `<span class="dot"></span> ${t('offline_status')}`;
    }
  }

  if (banner) {
    if (!isOnline || queue.length > 0) {
      banner.style.display = 'flex';
      const textEl = banner.querySelector('.banner-text');
      if (textEl) {
        if (!isOnline) {
          textEl.textContent = `${t('offline_status')} - ${queue.length} ${t('pending_sync')}`;
        } else {
          textEl.textContent = `${queue.length} ${t('pending_sync')}. Ready to synchronize.`;
        }
      }
    } else {
      banner.style.display = 'none';
    }
  }
}

// Synchronize all pending offline items to the server
let isSyncing = false;
async function syncOfflineQueueNow(showToastFn) {
  if (isSyncing) return;
  if (!navigator.onLine) {
    if (showToastFn) showToastFn(t('offline_status'), 'warning');
    return;
  }

  const queue = await getOfflineQueue();
  if (queue.length === 0) {
    if (showToastFn) showToastFn(t('all_synced'), 'success');
    return;
  }

  isSyncing = true;
  const syncBtn = document.getElementById('btn-manual-sync');
  if (syncBtn) {
    syncBtn.classList.add('loading');
    syncBtn.disabled = true;
  }

  try {
    const token = localStorage.getItem('health_saathi_token');
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ operations: queue })
    });

    if (!response.ok) {
      throw new Error(`Sync server responded with ${response.status}`);
    }

    const data = await response.json();
    const results = data.results || [];

    // Remove successfully processed items from IndexedDB
    for (const res of results) {
      if (res.status === 'created' || res.status === 'synced' || res.status === 'updated') {
        await removeQueueItem(res.opId);
      }
    }

    if (showToastFn) {
      showToastFn(`Successfully synchronized ${results.length} changes!`, 'success');
    }

    // Refresh active view if it's patients, referrals, or dashboard
    window.dispatchEvent(new CustomEvent('syncCompleted'));
  } catch (err) {
    console.error('Failed to sync offline queue:', err);
    if (showToastFn) {
      showToastFn('Sync failed. Changes remain saved safely in local storage.', 'error');
    }
  } finally {
    isSyncing = false;
    if (syncBtn) {
      syncBtn.classList.remove('loading');
      syncBtn.disabled = false;
    }
    updateQueueBadge();
  }
}

// Register Service Worker
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then((reg) => {
          console.log('[SW] Service Worker registered successfully with scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[SW] Service Worker registration failed:', err);
        });
    });
  }
}

// Network connectivity listeners
window.addEventListener('online', () => {
  updateQueueBadge();
  console.log('[Network] Connected to internet. Triggering auto-sync...');
  syncOfflineQueueNow();
});

window.addEventListener('offline', () => {
  updateQueueBadge();
  console.log('[Network] Switched to Offline mode. Local IndexedDB is active.');
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  getDB().then(() => {
    updateQueueBadge();
    registerServiceWorker();
  });
});
