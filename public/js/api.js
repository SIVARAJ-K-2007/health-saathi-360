// Health Saathi 360 - Frontend API Client & Offline Request Interceptor

const api = {
  getToken() {
    return localStorage.getItem('health_saathi_token');
  },

  setAuth(token, user) {
    localStorage.setItem('health_saathi_token', token);
    localStorage.setItem('health_saathi_user', JSON.stringify(user));
  },

  getUser() {
    const userStr = localStorage.getItem('health_saathi_user');
    try {
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  },

  clearAuth() {
    localStorage.removeItem('health_saathi_token');
    localStorage.removeItem('health_saathi_user');
  },

  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `/api${endpoint}`;
    const token = this.getToken();

    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(url, config);
      
      if (response.status === 401) {
        // If unauthorized, clear auth and redirect to login
        this.clearAuth();
        window.dispatchEvent(new CustomEvent('authExpired'));
        throw new Error('Session expired. Please log in again.');
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }
      return data;
    } catch (err) {
      // If we are offline or network failed, handle mutating operations gracefully
      if (!navigator.onLine || err.name === 'TypeError' || err.message.includes('fetch')) {
        console.warn(`[API] Network failure on ${config.method || 'GET'} ${endpoint}. Routing to offline handling...`);
        return this.handleOfflineFallback(endpoint, config, err);
      }
      throw err;
    }
  },

  async handleOfflineFallback(endpoint, config, originalErr) {
    const method = (config.method || 'GET').toUpperCase();

    // GET requests fallback to IndexedDB cache
    if (method === 'GET') {
      if (endpoint.startsWith('/facilities')) {
        const cached = await getOfflineCachedFacilities();
        return {
          facilities: cached,
          count: cached.length,
          is_offline_cache: true
        };
      }
      throw new Error('Offline: Data cannot be retrieved from network. Connect to the internet or view local cache.');
    }

    // Mutating requests: Queue into IndexedDB
    const payload = config.body ? JSON.parse(config.body) : {};

    if (endpoint === '/patients' && method === 'POST') {
      const tempId = `PAT-OFFLINE-${Date.now().toString().slice(-4)}`;
      payload.id = tempId;
      await queueOfflineOperation({
        type: 'create_patient',
        entity_id: tempId,
        payload
      });
      return {
        message: 'Patient record saved offline. Will synchronize automatically when connected.',
        patient: { ...payload, id: tempId, offline_pending: true },
        offline_queued: true
      };
    }

    if (endpoint === '/referrals' && method === 'POST') {
      const tempId = `REF-OFFLINE-${Date.now().toString().slice(-4)}`;
      payload.id = tempId;
      await queueOfflineOperation({
        type: 'create_referral',
        entity_id: tempId,
        payload
      });
      return {
        message: 'Referral saved offline. Will synchronize automatically when connected.',
        referral: { ...payload, id: tempId, status: 'pending', offline_pending: true },
        offline_queued: true
      };
    }

    if (endpoint.includes('/referrals/') && endpoint.endsWith('/status')) {
      const parts = endpoint.split('/');
      const referralId = parts[2];
      await queueOfflineOperation({
        type: 'update_referral_status',
        entity_id: referralId,
        payload: { referral_id: referralId, ...payload }
      });
      return {
        message: 'Referral status change queued locally.',
        offline_queued: true
      };
    }

    if (endpoint.startsWith('/followups/') && method === 'PATCH') {
      const parts = endpoint.split('/');
      const followupId = parts[2];
      await queueOfflineOperation({
        type: 'update_followup',
        entity_id: followupId,
        payload: { followup_id: followupId, ...payload }
      });
      return {
        message: 'Follow-up outcome queued locally.',
        offline_queued: true
      };
    }

    throw originalErr;
  },

  // Auth methods
  async login(username, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    this.setAuth(data.token, data.user);
    return data;
  },

  async register(userData) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
    this.setAuth(data.token, data.user);
    return data;
  },

  async getDemoAccounts() {
    return this.request('/auth/demo-accounts');
  },

  async getProfile() {
    return this.request('/auth/me');
  },

  // Patients methods
  async getPatients(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/patients${query ? '?' + query : ''}`);
  },

  async getPatient(id) {
    return this.request(`/patients/${id}`);
  },

  async createPatient(patientData) {
    return this.request('/patients', {
      method: 'POST',
      body: JSON.stringify(patientData)
    });
  },

  async updatePatient(id, patientData) {
    return this.request(`/patients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patientData)
    });
  },

  // Referrals methods
  async getReferrals(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/referrals${query ? '?' + query : ''}`);
  },

  async getReferral(id) {
    return this.request(`/referrals/${id}`);
  },

  async createReferral(referralData) {
    return this.request('/referrals', {
      method: 'POST',
      body: JSON.stringify(referralData)
    });
  },

  async updateReferralStatus(id, status, notes = '') {
    return this.request(`/referrals/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, status_notes: notes })
    });
  },

  // Followups methods
  async getFollowups(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/followups${query ? '?' + query : ''}`);
  },

  async createFollowup(data) {
    return this.request('/followups', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateFollowup(id, data) {
    return this.request(`/followups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  },

  // Facilities & Maps
  async getFacilities(params = {}) {
    const query = new URLSearchParams(params).toString();
    const result = await this.request(`/facilities${query ? '?' + query : ''}`);
    if (result && result.facilities) {
      cacheFacilities(result.facilities);
    }
    return result;
  },

  async matchFacilities(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/facilities/match${query ? '?' + query : ''}`);
  },

  async fetchOverpassFacilities(lat, lng, radius, query) {
    const result = await this.request('/facilities/fetch-overpass', {
      method: 'POST',
      body: JSON.stringify({ lat, lng, radius, query })
    });
    if (result && result.facilities) {
      cacheFacilities(result.facilities);
    }
    return result;
  },

  async getRoute(startLat, startLng, endLat, endLng) {
    return this.request(`/facilities/route?start_lat=${startLat}&start_lng=${startLng}&end_lat=${endLat}&end_lng=${endLng}`);
  },

  // Stats
  async getDashboardStats() {
    return this.request('/stats/dashboard');
  },

  async getAdminStats() {
    return this.request('/stats/admin');
  }
};
