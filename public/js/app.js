// Health Saathi 360 - Frontend Application Controller & Routing Engine

let currentUser = null;
let currentPage = 'dashboard';
let preselectedPatientId = null;
let preselectedFacility = null;

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  setupGlobalListeners();
  
  // Check existing session
  const storedUser = api.getUser();
  const token = api.getToken();

  if (token && storedUser) {
    currentUser = storedUser;
    updateUserProfileUI();
    navigate('dashboard');
  } else {
    // Show role-based demo login
    showLoginModal();
  }

  // Set initial language UI
  updateLanguageButtons();
});

// Setup event listeners for header, mobile toggle, language
function setupGlobalListeners() {
  // Mobile sidebar toggle
  const mobileToggle = document.getElementById('btn-mobile-sidebar-toggle');
  const sidebar = document.getElementById('app-sidebar');
  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  // Sidebar navigation links
  document.querySelectorAll('#sidebar-nav-links .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      if (sidebar) sidebar.classList.remove('open');
      navigate(page);
    });
  });

  // Mobile bottom navigation links
  document.querySelectorAll('.mobile-bottom-nav .mobile-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigate(btn.dataset.page);
    });
  });

  // Language switcher
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      setLanguage(lang);
      updateLanguageButtons();
      translateStaticUI();
      navigate(currentPage); // Re-render current page in chosen language
    });
  });

  // Manual sync button
  const syncBtn = document.getElementById('btn-manual-sync');
  if (syncBtn) {
    syncBtn.addEventListener('click', () => {
      syncOfflineQueueNow(showToast);
    });
  }

  // Sign out button
  const signOutBtn = document.getElementById('btn-sign-out');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', () => {
      api.clearAuth();
      currentUser = null;
      showToast('Signed out successfully.', 'info');
      showLoginModal();
    });
  }

  // Global modal close handlers
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const modalOverlay = document.getElementById('global-modal');

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeModal);
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  // Listen to language change custom event
  window.addEventListener('languageChanged', () => {
    translateStaticUI();
  });

  // Listen to sync completed custom event
  window.addEventListener('syncCompleted', () => {
    if (currentPage === 'dashboard' || currentPage === 'patients' || currentPage === 'referrals' || currentPage === 'followups') {
      navigate(currentPage);
    }
  });

  // Listen to auth expiration
  window.addEventListener('authExpired', () => {
    showLoginModal();
  });
}

// Router
function navigate(page, params = {}) {
  currentPage = page;

  // Update sidebar active state
  document.querySelectorAll('#sidebar-nav-links .nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  // Update mobile bottom nav active state
  document.querySelectorAll('.mobile-bottom-nav .mobile-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  // Update topbar headline
  const headlineEl = document.getElementById('topbar-page-title');
  if (headlineEl) {
    const titleKey = `nav_${page.replace('-', '_')}`;
    headlineEl.textContent = t(titleKey) || page;
  }

  const content = document.getElementById('app-content');
  if (!content) return;

  switch (page) {
    case 'dashboard':
      renderDashboard(content);
      break;
    case 'patients':
      renderPatients(content);
      break;
    case 'register-patient':
      renderPatientRegistration(content, params.editPatientId);
      break;
    case 'screening':
      renderSafetyScreening(content, params.patientId);
      break;
    case 'hospitals':
      renderHospitalMap(content);
      break;
    case 'matching':
      renderFacilityMatching(content);
      break;
    case 'referrals':
      renderReferrals(content, params);
      break;
    case 'followups':
      renderFollowups(content);
      break;
    case 'search':
      renderSearch(content);
      break;
    case 'admin':
      renderAdmin(content);
      break;
    default:
      renderDashboard(content);
  }
}

// Translate static UI labels
function translateStaticUI() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });

  const headlineEl = document.getElementById('topbar-page-title');
  if (headlineEl) {
    headlineEl.textContent = t(`nav_${currentPage.replace('-', '_')}`) || currentPage;
  }

  updateUserProfileUI();
}

function updateLanguageButtons() {
  const current = getCurrentLanguage();
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === current);
  });
}

function updateUserProfileUI() {
  if (!currentUser) return;
  const nameEl = document.getElementById('sidebar-user-name');
  const roleEl = document.getElementById('sidebar-user-role');
  const avatarEl = document.getElementById('sidebar-user-avatar');

  if (nameEl) nameEl.textContent = currentUser.name;
  if (roleEl) {
    const roleKey = currentUser.role === 'asha_worker' ? 'role_asha' : (currentUser.role === 'phc_staff' ? 'role_phc' : 'role_admin');
    roleEl.textContent = t(roleKey);
  }
  if (avatarEl) {
    avatarEl.textContent = currentUser.name.split(' ').map(n => n[0]).slice(0, 2).join('');
  }
}

// =============================================================================
// LOGIN & DEMO SWITCHER
// =============================================================================
async function showLoginModal(defaultTab = 'login') {
  const body = `
    <div style="text-align: center; margin-bottom: 16px;">
      <div class="brand-icon" style="margin: 0 auto 10px; width: 44px; height: 44px; font-size: 1.4rem;">HS</div>
      <h3>${t('app_title')}</h3>
      <p style="color: var(--text-muted); font-size: 0.82rem;">${t('app_subtitle')}</p>
    </div>

    <!-- Tab switcher between Sign In and Register -->
    <div style="display: flex; border-bottom: 2px solid var(--border-subtle); margin-bottom: 16px;">
      <button type="button" class="btn btn-sm ${defaultTab === 'login' ? 'btn-primary' : 'btn-outline'}" id="tab-btn-signin" style="flex: 1; border-radius: 6px 6px 0 0;" onclick="switchAuthTab('login')">
        Sign In / Demo
      </button>
      <button type="button" class="btn btn-sm ${defaultTab === 'register' ? 'btn-primary' : 'btn-outline'}" id="tab-btn-register" style="flex: 1; border-radius: 6px 6px 0 0;" onclick="switchAuthTab('register')">
        ➕ Register New Worker
      </button>
    </div>

    <!-- SIGN IN PANEL -->
    <div id="auth-panel-login" style="display: ${defaultTab === 'login' ? 'block' : 'none'};">
      <div style="background: var(--primary-light); padding: 12px; border-radius: var(--radius-md); margin-bottom: 16px;">
        <p style="font-size: 0.78rem; font-weight: 700; color: var(--primary); margin-bottom: 6px;">1-Click Demonstration Accounts:</p>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <button class="btn btn-outline" style="justify-content: flex-start; text-align: left; background: #fff; padding: 6px 10px;" onclick="fillAndLogin('asha_meena', 'Demo@1234')">
            <div>
              <strong>Meenakshi Sundaram</strong> <span class="badge badge-gov">ASHA</span>
              <div style="font-size: 0.7rem; color: var(--text-muted);">Alanganallur Sub-Centre &bull; asha_meena</div>
            </div>
          </button>
          <button class="btn btn-outline" style="justify-content: flex-start; text-align: left; background: #fff; padding: 6px 10px;" onclick="fillAndLogin('phc_ravi', 'Demo@1234')">
            <div>
              <strong>Dr. Ravichandran</strong> <span class="badge badge-gov">PHC MO</span>
              <div style="font-size: 0.7rem; color: var(--text-muted);">Samayanallur PHC &bull; phc_ravi</div>
            </div>
          </button>
          <button class="btn btn-outline" style="justify-content: flex-start; text-align: left; background: #fff; padding: 6px 10px;" onclick="fillAndLogin('admin', 'Admin@5678')">
            <div>
              <strong>Senthil Kumar</strong> <span class="badge badge-private">Admin</span>
              <div style="font-size: 0.7rem; color: var(--text-muted);">Madurai Health Office &bull; admin</div>
            </div>
          </button>
        </div>
      </div>

      <form id="custom-login-form" onsubmit="handleManualLogin(event)">
        <div class="form-group" style="margin-bottom: 10px;">
          <label class="form-label">Username</label>
          <input type="text" id="login-username" class="form-control" required placeholder="e.g. asha_meena" value="asha_meena">
        </div>
        <div class="form-group" style="margin-bottom: 14px;">
          <label class="form-label">Password</label>
          <input type="password" id="login-password" class="form-control" required placeholder="Enter password" value="Demo@1234">
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;" id="btn-login-submit">Sign In</button>
      </form>
    </div>

    <!-- REGISTER NEW WORKER PANEL -->
    <div id="auth-panel-register" style="display: ${defaultTab === 'register' ? 'block' : 'none'};">
      <form id="custom-register-form" onsubmit="handleRegisterNewStaff(event)">
        <div class="form-group" style="margin-bottom: 10px;">
          <label class="form-label">Full Name *</label>
          <input type="text" id="reg-name" class="form-control" required placeholder="e.g. Priya Soundararajan">
        </div>

        <div class="form-group" style="margin-bottom: 10px;">
          <label class="form-label">Desired Username *</label>
          <input type="text" id="reg-username" class="form-control" required placeholder="e.g. priya_asha" pattern="[a-zA-Z0-9_-]{3,20}" title="3-20 letters, numbers, hyphens or underscores">
        </div>

        <div class="form-group" style="margin-bottom: 10px;">
          <label class="form-label">Healthcare Role *</label>
          <select id="reg-role" class="form-control" required>
            <option value="asha_worker" selected>ASHA Worker / Frontline Health Worker</option>
            <option value="phc_staff">PHC Staff Nurse / Medical Officer</option>
            <option value="admin">District Health Administrator</option>
          </select>
        </div>

        <div class="form-group" style="margin-bottom: 10px;">
          <label class="form-label">Assigned Facility / Sub-Centre</label>
          <input type="text" id="reg-facility" class="form-control" placeholder="e.g. Palamedu Sub-Centre / Melur PHC">
        </div>

        <div class="form-group" style="margin-bottom: 14px;">
          <label class="form-label">Password * (Minimum 6 characters)</label>
          <input type="password" id="reg-password" class="form-control" required minlength="6" placeholder="Choose a secure password">
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%;" id="btn-register-submit">
          <span>✅</span> Register & Sign In
        </button>
      </form>
    </div>
  `;

  openModal('Healthcare Staff Portal', body, '');
}

function switchAuthTab(tab) {
  const loginPanel = document.getElementById('auth-panel-login');
  const registerPanel = document.getElementById('auth-panel-register');
  const loginBtn = document.getElementById('tab-btn-signin');
  const registerBtn = document.getElementById('tab-btn-register');

  if (tab === 'login') {
    if (loginPanel) loginPanel.style.display = 'block';
    if (registerPanel) registerPanel.style.display = 'none';
    if (loginBtn) { loginBtn.className = 'btn btn-sm btn-primary'; }
    if (registerBtn) { registerBtn.className = 'btn btn-sm btn-outline'; }
  } else {
    if (loginPanel) loginPanel.style.display = 'none';
    if (registerPanel) registerPanel.style.display = 'block';
    if (loginBtn) { loginBtn.className = 'btn btn-sm btn-outline'; }
    if (registerBtn) { registerBtn.className = 'btn btn-sm btn-primary'; }
  }
}

async function handleRegisterNewStaff(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-register-submit');
  if (btn) btn.classList.add('loading');

  const payload = {
    name: document.getElementById('reg-name').value.trim(),
    username: document.getElementById('reg-username').value.trim(),
    role: document.getElementById('reg-role').value,
    facility: document.getElementById('reg-facility').value.trim(),
    password: document.getElementById('reg-password').value
  };

  try {
    const data = await api.register(payload);
    currentUser = data.user;
    updateUserProfileUI();
    closeModal();
    showToast(`Welcome ${currentUser.name}! Your account is active.`, 'success');
    navigate('dashboard');
  } catch (err) {
    alert(err.message || 'Registration failed. Please try again.');
  } finally {
    if (btn) btn.classList.remove('loading');
  }
}

async function fillAndLogin(username, password) {
  document.getElementById('login-username').value = username;
  document.getElementById('login-password').value = password;
  await performLogin(username, password);
}

async function handleManualLogin(e) {
  e.preventDefault();
  const u = document.getElementById('login-username').value;
  const p = document.getElementById('login-password').value;
  await performLogin(u, p);
}

async function performLogin(username, password) {
  const btn = document.getElementById('btn-login-submit');
  if (btn) btn.classList.add('loading');

  try {
    const data = await api.login(username, password);
    currentUser = data.user;
    updateUserProfileUI();
    closeModal();
    showToast(`${t('welcome_back')}, ${currentUser.name}!`, 'success');
    navigate('dashboard');
  } catch (err) {
    alert(err.message || 'Login failed. Please check credentials.');
  } finally {
    if (btn) btn.classList.remove('loading');
  }
}

// =============================================================================
// PAGE A: DASHBOARD
// =============================================================================
async function renderDashboard(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading real-time public health metrics...</p>
    </div>
  `;

  try {
    const stats = await api.getDashboardStats();
    const { summary, statusDistribution, urgencyDistribution, recentPatients, recentReferrals } = stats;

    const totalReferrals = (statusDistribution || []).reduce((acc, s) => acc + s.count, 0) || 1;

    container.innerHTML = `
      <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: gap;">
        <div>
          <h2 class="section-title">${t('nav_dashboard')}</h2>
          <p class="section-subtitle">${t('welcome_back')}, <strong>${escapeHTML(currentUser?.name || '')}</strong> &bull; ${escapeHTML(currentUser?.facility || 'Primary Health Centre')}</p>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); background: var(--surface); padding: 6px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
          📅 <strong>${new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</strong>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="quick-actions-bar">
        <button class="btn btn-primary" onclick="navigate('register-patient')">
          <span>➕</span> ${t('action_register')}
        </button>
        <button class="btn btn-outline" onclick="navigate('hospitals')">
          <span>🏥</span> ${t('action_find_hospitals')}
        </button>
        <button class="btn btn-outline" onclick="navigate('referrals', { openCreateModal: true })">
          <span>📋</span> ${t('action_create_referral')}
        </button>
        <button class="btn btn-outline" onclick="navigate('screening')">
          <span>🛡️</span> ${t('action_run_screening')}
        </button>
      </div>

      <!-- Key Metrics Cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">👥</div>
          <div class="stat-content">
            <h3>${summary.totalPatients}</h3>
            <p>${t('stat_total_patients')}</p>
          </div>
        </div>

        <div class="stat-card amber">
          <div class="stat-icon">⏳</div>
          <div class="stat-content">
            <h3>${summary.pendingReferrals}</h3>
            <p>${t('stat_pending_referrals')}</p>
          </div>
        </div>

        <div class="stat-card green">
          <div class="stat-icon">✅</div>
          <div class="stat-content">
            <h3>${summary.completedReferrals}</h3>
            <p>${t('stat_completed_referrals')}</p>
          </div>
        </div>

        <div class="stat-card red">
          <div class="stat-icon">🚨</div>
          <div class="stat-content">
            <h3>${summary.followupsDue}</h3>
            <p>${t('stat_followups_due')}</p>
          </div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;" class="dashboard-two-col">
        <!-- Referral Status CSS Chart -->
        <div class="card">
          <div class="card-title">
            <span>${t('referral_distribution')}</span>
            <span class="badge badge-gov">${totalReferrals} Total</span>
          </div>
          <div class="chart-bar-container">
            ${(statusDistribution || []).map(s => {
              const pct = Math.round((s.count / totalReferrals) * 100);
              let color = 'var(--status-pending)';
              if (s.status === 'completed') color = 'var(--status-completed)';
              if (s.status === 'not_attended') color = 'var(--status-missed)';
              if (s.status === 'cancelled') color = 'var(--status-cancelled)';
              return `
                <div class="chart-bar-row">
                  <div class="chart-bar-label">${t(`status_${s.status}`) || s.status}</div>
                  <div class="chart-bar-track">
                    <div class="chart-bar-fill" style="width: ${pct}%; background: ${color};"></div>
                  </div>
                  <div class="chart-bar-value">${s.count} (${pct}%)</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Referral Urgency Breakdown -->
        <div class="card">
          <div class="card-title">
            <span>Referrals by Urgency Level</span>
          </div>
          <div class="chart-bar-container">
            ${(urgencyDistribution || []).map(u => {
              const pct = Math.round((u.count / totalReferrals) * 100);
              const color = u.urgency === 'emergency' ? 'var(--emergency)' : (u.urgency === 'urgent' ? 'var(--status-pending)' : 'var(--gov-badge)');
              return `
                <div class="chart-bar-row">
                  <div class="chart-bar-label">${t(`urgency_${u.urgency}`) || u.urgency}</div>
                  <div class="chart-bar-track">
                    <div class="chart-bar-fill" style="width: ${pct}%; background: ${color};"></div>
                  </div>
                  <div class="chart-bar-value">${u.count} (${pct}%)</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Recent Activity Tables -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;" class="dashboard-two-col">
        <!-- Recent Patients -->
        <div class="card">
          <div class="card-title">
            <span>${t('recent_patients')}</span>
            <button class="btn btn-xs btn-outline" onclick="navigate('patients')">View All</button>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Village</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${(recentPatients || []).map(p => `
                  <tr>
                    <td><strong>${escapeHTML(p.id)}</strong></td>
                    <td>${escapeHTML(p.name)}</td>
                    <td>${escapeHTML(p.village)}</td>
                    <td>
                      <button class="btn btn-xs btn-outline" onclick="openPatientModal('${p.id}')">View</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Recent Referrals -->
        <div class="card">
          <div class="card-title">
            <span>${t('recent_referrals')}</span>
            <button class="btn btn-xs btn-outline" onclick="navigate('referrals')">View All</button>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Ref ID</th>
                  <th>Patient</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${(recentReferrals || []).map(r => `
                  <tr>
                    <td><strong>${escapeHTML(r.id)}</strong></td>
                    <td>${escapeHTML(r.patient_name)}</td>
                    <td><span class="badge badge-${r.status}">${t(`status_${r.status}`) || r.status}</span></td>
                    <td>
                      <button class="btn btn-xs btn-outline" onclick="viewReferralSlip('${r.id}')">Slip</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `
      <div class="card">
        <p style="color: var(--status-missed);">Failed to load dashboard data. Working offline.</p>
        <button class="btn btn-primary" onclick="renderDashboard(document.getElementById('app-content'))">Retry</button>
      </div>
    `;
  }
}

// =============================================================================
// PAGE B: PATIENT REGISTRATION FORM
// =============================================================================
async function renderPatientRegistration(container, editId = null) {
  // Load saved draft from IndexedDB if not editing
  const draft = editId ? null : await getFormDraft('patient_reg_form');

  container.innerHTML = `
    <div style="max-width: 800px; margin: 0 auto;">
      <div class="card">
        <div class="card-title">
          <span>${t('patient_registration_title')}</span>
          ${draft ? '<span class="badge badge-gov" id="draft-notice">Draft restored from offline storage</span>' : ''}
        </div>

        <form id="patient-registration-form" onsubmit="handlePatientFormSubmit(event, '${editId || ''}')">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">${t('patient_name')} *</label>
              <input type="text" id="p-name" class="form-control" required placeholder="${t('patient_name_placeholder')}" value="${escapeHTML(draft?.name || '')}" oninput="autoSavePatientDraft()">
            </div>

            <div class="form-group">
              <label class="form-label">${t('gender_label')} *</label>
              <select id="p-gender" class="form-control" required onchange="autoSavePatientDraft()">
                <option value="">Select Gender</option>
                <option value="Female" ${draft?.gender === 'Female' ? 'selected' : ''}>${t('gender_female')}</option>
                <option value="Male" ${draft?.gender === 'Male' ? 'selected' : ''}>${t('gender_male')}</option>
                <option value="Other" ${draft?.gender === 'Other' ? 'selected' : ''}>${t('gender_other')}</option>
                <option value="Prefer not to say" ${draft?.gender === 'Prefer not to say' ? 'selected' : ''}>${t('gender_prefer_not')}</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">${t('age_label')}</label>
              <input type="number" id="p-age" class="form-control" min="0" max="120" placeholder="e.g. 28" value="${draft?.age || ''}" oninput="autoSavePatientDraft()">
            </div>

            <div class="form-group">
              <label class="form-label">${t('dob_label')}</label>
              <input type="date" id="p-dob" class="form-control" value="${draft?.dob || ''}" oninput="autoSavePatientDraft()">
            </div>

            <div class="form-group">
              <label class="form-label">${t('village_label')} *</label>
              <input type="text" id="p-village" class="form-control" required placeholder="${t('village_placeholder')}" value="${escapeHTML(draft?.village || '')}" oninput="autoSavePatientDraft()">
            </div>

            <div class="form-group">
              <label class="form-label">${t('contact_label')}</label>
              <input type="tel" id="p-contact" class="form-control" pattern="[0-9]{10}" placeholder="${t('contact_placeholder')}" value="${escapeHTML(draft?.contact || '')}" oninput="autoSavePatientDraft()">
            </div>

            <div class="form-group">
              <label class="form-label">${t('pref_language_label')}</label>
              <select id="p-lang" class="form-control" onchange="autoSavePatientDraft()">
                <option value="ta" ${draft?.preferred_language === 'ta' ? 'selected' : ''}>தமிழ் (Tamil)</option>
                <option value="en" ${draft?.preferred_language === 'en' ? 'selected' : ''}>English</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">${t('duration_label')}</label>
              <input type="text" id="p-duration" class="form-control" placeholder="${t('duration_placeholder')}" value="${escapeHTML(draft?.duration || '')}" oninput="autoSavePatientDraft()">
            </div>

            <div class="form-group full-width">
              <label class="form-label">${t('symptoms_label')} *</label>
              <textarea id="p-symptoms" class="form-control" required placeholder="${t('symptoms_placeholder')}" oninput="autoSavePatientDraft()">${escapeHTML(draft?.symptoms || '')}</textarea>
            </div>

            <div class="form-group full-width">
              <label class="form-label">${t('history_label')}</label>
              <input type="text" id="p-history" class="form-control" placeholder="${t('history_placeholder')}" value="${escapeHTML(draft?.medical_history || '')}" oninput="autoSavePatientDraft()">
            </div>

            <div class="form-group full-width">
              <label class="form-label">${t('vitals_label')}</label>
              <input type="text" id="p-vitals" class="form-control" placeholder="${t('vitals_placeholder')}" value="${escapeHTML(draft?.vitals || '')}" oninput="autoSavePatientDraft()">
            </div>
          </div>

          <div style="margin-top: 24px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 16px;">
            <button type="button" class="btn btn-outline" onclick="clearPatientDraft()">
              ${t('btn_clear_form')}
            </button>
            <button type="submit" class="btn btn-primary" id="btn-save-patient">
              <span>💾</span> ${t('btn_save_patient')}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function autoSavePatientDraft() {
  const data = {
    name: document.getElementById('p-name')?.value || '',
    gender: document.getElementById('p-gender')?.value || '',
    age: document.getElementById('p-age')?.value || '',
    dob: document.getElementById('p-dob')?.value || '',
    village: document.getElementById('p-village')?.value || '',
    contact: document.getElementById('p-contact')?.value || '',
    preferred_language: document.getElementById('p-lang')?.value || 'ta',
    duration: document.getElementById('p-duration')?.value || '',
    symptoms: document.getElementById('p-symptoms')?.value || '',
    medical_history: document.getElementById('p-history')?.value || '',
    vitals: document.getElementById('p-vitals')?.value || ''
  };

  saveFormDraft('patient_reg_form', data);
}

async function clearPatientDraft() {
  await clearFormDraft('patient_reg_form');
  renderPatientRegistration(document.getElementById('app-content'));
  showToast('Draft cleared.', 'info');
}

async function handlePatientFormSubmit(e, editId) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-patient');
  if (btn) btn.classList.add('loading');

  const payload = {
    name: document.getElementById('p-name').value.trim(),
    gender: document.getElementById('p-gender').value,
    age: document.getElementById('p-age').value ? parseInt(document.getElementById('p-age').value, 10) : null,
    dob: document.getElementById('p-dob').value || null,
    village: document.getElementById('p-village').value.trim(),
    contact: document.getElementById('p-contact').value.trim() || null,
    preferred_language: document.getElementById('p-lang').value || 'ta',
    symptoms: document.getElementById('p-symptoms').value.trim(),
    duration: document.getElementById('p-duration').value.trim() || null,
    medical_history: document.getElementById('p-history').value.trim() || null,
    vitals: document.getElementById('p-vitals').value.trim() || null,
    assigned_worker: currentUser?.id || 'USR-001'
  };

  try {
    let result;
    if (editId) {
      result = await api.updatePatient(editId, payload);
    } else {
      result = await api.createPatient(payload);
      await clearFormDraft('patient_reg_form');
    }

    showToast(result.message || 'Patient registered successfully!', 'success');
    navigate('patients');
  } catch (err) {
    alert(err.message || 'Error saving patient record.');
  } finally {
    if (btn) btn.classList.remove('loading');
  }
}

// =============================================================================
// PAGE B2: PATIENTS LIST
// =============================================================================
async function renderPatients(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading registered patients...</p>
    </div>
  `;

  try {
    const data = await api.getPatients({ limit: 50 });
    const patients = data.patients || [];

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 class="section-title">${t('nav_patients')}</h2>
          <p class="section-subtitle">Directory of registered individuals in local primary healthcare registry</p>
        </div>
        <button class="btn btn-primary" onclick="navigate('register-patient')">
          <span>➕</span> ${t('action_register')}
        </button>
      </div>

      <div class="card">
        <div style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">
          <input type="text" id="patient-search-input" class="form-control" style="max-width: 300px;" placeholder="Filter by name or ID..." oninput="filterPatientsTable()">
          <span style="font-size: 0.85rem; color: var(--text-muted); align-self: center;">
            Total: <strong>${patients.length}</strong> patients
          </span>
        </div>

        <div class="table-responsive">
          <table class="data-table" id="patients-table">
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Name</th>
                <th>Age / Gender</th>
                <th>Village</th>
                <th>Primary Symptoms</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${patients.map(p => `
                <tr data-name="${escapeHTML(p.name.toLowerCase())}" data-id="${p.id.toLowerCase()}" data-village="${escapeHTML(p.village.toLowerCase())}">
                  <td><strong>${escapeHTML(p.id)}</strong></td>
                  <td>${escapeHTML(p.name)}</td>
                  <td>${p.age ? p.age + 'y' : '-'} / ${escapeHTML(p.gender)}</td>
                  <td>${escapeHTML(p.village)}</td>
                  <td style="max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(p.symptoms)}">
                    ${escapeHTML(p.symptoms)}
                  </td>
                  <td>
                    <div style="display: flex; gap: 6px;">
                      <button class="btn btn-xs btn-outline" onclick="openPatientModal('${p.id}')">
                        View Details
                      </button>
                      <button class="btn btn-xs btn-primary" onclick="startReferralForPatient('${p.id}', '${escapeHTML(p.name)}')">
                        + Refer
                      </button>
                      <button class="btn btn-xs btn-outline" onclick="navigate('screening', { patientId: '${p.id}' })">
                        🛡️ Screen
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `
      <div class="card">
        <p style="color: var(--status-missed);">${err.message}</p>
        <button class="btn btn-primary" onclick="renderPatients(document.getElementById('app-content'))">Retry</button>
      </div>
    `;
  }
}

function filterPatientsTable() {
  const q = document.getElementById('patient-search-input')?.value.toLowerCase() || '';
  const rows = document.querySelectorAll('#patients-table tbody tr');
  rows.forEach(row => {
    const name = row.dataset.name || '';
    const id = row.dataset.id || '';
    const village = row.dataset.village || '';
    if (name.includes(q) || id.includes(q) || village.includes(q)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

async function openPatientModal(id) {
  try {
    const res = await api.getPatient(id);
    const { patient, referrals, followups } = res;

    const body = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 10px;">
        <div>
          <h3 style="font-size: 1.2rem;">${escapeHTML(patient.name)}</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem;"><strong>ID:</strong> ${patient.id} &bull; <strong>Gender:</strong> ${patient.gender} &bull; <strong>Age:</strong> ${patient.age || 'N/A'}</p>
        </div>
        <span class="badge badge-gov">${escapeHTML(patient.village)}</span>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; font-size: 0.85rem;">
        <div><strong>Contact:</strong> ${escapeHTML(patient.contact || 'None')}</div>
        <div><strong>Language:</strong> ${patient.preferred_language === 'ta' ? 'Tamil' : 'English'}</div>
        <div><strong>Vitals:</strong> ${escapeHTML(patient.vitals || 'Not recorded')}</div>
        <div><strong>Duration:</strong> ${escapeHTML(patient.duration || 'Not specified')}</div>
      </div>

      <div style="margin-bottom: 16px; font-size: 0.85rem;">
        <strong>Reported Symptoms:</strong>
        <p style="background: var(--background); padding: 8px 12px; border-radius: var(--radius-sm); margin-top: 4px;">
          ${escapeHTML(patient.symptoms)}
        </p>
      </div>

      <div style="margin-bottom: 16px; font-size: 0.85rem;">
        <strong>Medical History:</strong>
        <p style="background: var(--background); padding: 8px 12px; border-radius: var(--radius-sm); margin-top: 4px;">
          ${escapeHTML(patient.medical_history || 'None reported')}
        </p>
      </div>

      <h4 style="font-size: 0.95rem; margin: 16px 0 8px;">Referral History (${referrals.length})</h4>
      <div class="table-responsive">
        <table class="data-table" style="font-size: 0.8rem;">
          <thead>
            <tr><th>Ref ID</th><th>Facility</th><th>Urgency</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${referrals.map(r => `
              <tr>
                <td>${r.id}</td>
                <td>${escapeHTML(r.facility_name)}</td>
                <td><span class="badge badge-${r.urgency}">${r.urgency}</span></td>
                <td><span class="badge badge-${r.status}">${r.status}</span></td>
              </tr>
            `).join('')}
            ${referrals.length === 0 ? '<tr><td colspan="4">No referrals for this patient yet.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    `;

    const footer = `
      <button class="btn btn-outline" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="closeModal(); startReferralForPatient('${patient.id}', '${escapeHTML(patient.name)}')">Create Referral</button>
    `;

    openModal(`Patient Record - ${patient.id}`, body, footer);
  } catch (err) {
    alert('Failed to load patient details.');
  }
}

// =============================================================================
// PAGE C: SAFETY SCREENING & URGENCY SUPPORT
// =============================================================================
async function renderSafetyScreening(container, patientId = null) {
  let patients = [];
  try {
    const res = await api.getPatients({ limit: 100 });
    patients = res.patients || [];
  } catch {}

  container.innerHTML = `
    <div style="max-width: 820px; margin: 0 auto;">
      <h2 class="section-title">${t('screening_title')}</h2>
      <p class="section-subtitle">Frontline emergency triage checklist based on standard public health escalation guidelines</p>

      <!-- Protocol Disclaimer Banner -->
      <div class="cache-alert warning" style="margin-bottom: 20px;">
        <strong>⚠️ ${t('screening_disclaimer_title')}:</strong> ${t('screening_disclaimer_text')}
      </div>

      <!-- Emergency Escalation Output Container -->
      <div id="screening-output-alert" style="display: none;"></div>

      <div class="card">
        <form id="safety-screening-form" onsubmit="evaluateScreening(event)">
          <div class="form-group" style="margin-bottom: 20px;">
            <label class="form-label">${t('select_patient_screen')}</label>
            <select id="screen-patient-id" class="form-control">
              <option value="">-- General Assessment / Walk-in --</option>
              ${patients.map(p => `
                <option value="${p.id}" ${patientId === p.id ? 'selected' : ''}>
                  ${escapeHTML(p.name)} (${p.id} - ${escapeHTML(p.village)})
                </option>
              `).join('')}
            </select>
          </div>

          <h4 style="margin-bottom: 14px; font-size: 0.95rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 6px;">
            Red Flag Symptoms & Danger Signs Evaluation:
          </h4>

          <div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px;">
            <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer;">
              <input type="checkbox" id="q-chest-pain" style="margin-top: 4px; width: 18px; height: 18px;" onchange="liveCheckEmergencyAlert()">
              <span style="font-size: 0.88rem; line-height: 1.4;">${t('screen_q1')}</span>
            </label>

            <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer;">
              <input type="checkbox" id="q-neuro" style="margin-top: 4px; width: 18px; height: 18px;" onchange="liveCheckEmergencyAlert()">
              <span style="font-size: 0.88rem; line-height: 1.4;">${t('screen_q2')}</span>
            </label>

            <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer;">
              <input type="checkbox" id="q-maternal" style="margin-top: 4px; width: 18px; height: 18px;" onchange="liveCheckEmergencyAlert()">
              <span style="font-size: 0.88rem; line-height: 1.4;">${t('screen_q3')}</span>
            </label>

            <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer;">
              <input type="checkbox" id="q-child" style="margin-top: 4px; width: 18px; height: 18px;" onchange="liveCheckEmergencyAlert()">
              <span style="font-size: 0.88rem; line-height: 1.4;">${t('screen_q4')}</span>
            </label>

            <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer;">
              <input type="checkbox" id="q-trauma" style="margin-top: 4px; width: 18px; height: 18px;" onchange="liveCheckEmergencyAlert()">
              <span style="font-size: 0.88rem; line-height: 1.4;">${t('screen_q5')}</span>
            </label>

            <hr style="border: 0; border-top: 1px solid var(--border-subtle); margin: 6px 0;">

            <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer;">
              <input type="checkbox" id="q-persistent-fever" style="margin-top: 4px; width: 18px; height: 18px;">
              <span style="font-size: 0.88rem; line-height: 1.4;">Persistent fever > 3 days, continuous diarrhea with moderate thirst, or painful urination?</span>
            </label>
          </div>

          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button type="submit" class="btn btn-primary" id="btn-eval-screen">
              <span>🩺</span> ${t('btn_evaluate_screening')}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function liveCheckEmergencyAlert() {
  const isEmergency = 
    document.getElementById('q-chest-pain')?.checked ||
    document.getElementById('q-neuro')?.checked ||
    document.getElementById('q-maternal')?.checked ||
    document.getElementById('q-child')?.checked ||
    document.getElementById('q-trauma')?.checked;

  const outputEl = document.getElementById('screening-output-alert');
  if (!outputEl) return;

  if (isEmergency) {
    outputEl.style.display = 'block';
    outputEl.innerHTML = `
      <div class="emergency-alert-banner">
        <h3>🚨 ${t('emergency_detected_title')}</h3>
        <p style="font-weight: 700; margin: 6px 0;">${t('emergency_detected_alert')}</p>
        <p style="font-size: 0.88rem; line-height: 1.4;">${t('emergency_instructions')}</p>
        <div style="margin-top: 12px; display: flex; gap: 10px;">
          <a href="tel:108" class="btn btn-sm btn-danger" style="text-decoration: none;">
            📞 Call 108 Emergency Ambulance
          </a>
          <button class="btn btn-sm btn-outline" style="background: #fff;" onclick="navigate('hospitals')">
            🏥 Find Nearest Emergency Hospital
          </button>
        </div>
      </div>
    `;
  } else {
    outputEl.style.display = 'none';
  }
}

function evaluateScreening(e) {
  e.preventDefault();
  const qEmergency = 
    document.getElementById('q-chest-pain').checked ||
    document.getElementById('q-neuro').checked ||
    document.getElementById('q-maternal').checked ||
    document.getElementById('q-child').checked ||
    document.getElementById('q-trauma').checked;

  const qUrgent = document.getElementById('q-persistent-fever').checked;
  const pId = document.getElementById('screen-patient-id').value;
  const outputEl = document.getElementById('screening-output-alert');

  outputEl.style.display = 'block';

  if (qEmergency) {
    liveCheckEmergencyAlert();
  } else if (qUrgent) {
    outputEl.innerHTML = `
      <div class="cache-alert warning" style="padding: 16px; border-radius: var(--radius-md);">
        <h3 style="font-size: 1.1rem; color: #92400E; margin-bottom: 6px;">⚠️ ${t('urgent_detected_title')}</h3>
        <p style="font-size: 0.88rem; line-height: 1.4;">${t('urgent_detected_alert')}</p>
        <div style="margin-top: 10px;">
          <button class="btn btn-sm btn-primary" onclick="navigate('referrals', { prefillUrgency: 'urgent', patientId: '${pId}' })">
            Create Urgent Referral
          </button>
        </div>
      </div>
    `;
  } else {
    outputEl.innerHTML = `
      <div class="cache-alert info" style="padding: 16px; border-radius: var(--radius-md);">
        <h3 style="font-size: 1.1rem; color: var(--primary); margin-bottom: 6px;">ℹ️ ${t('routine_detected_title')}</h3>
        <p style="font-size: 0.88rem; line-height: 1.4;">${t('routine_detected_alert')}</p>
        <div style="margin-top: 10px;">
          <button class="btn btn-sm btn-primary" onclick="navigate('referrals', { prefillUrgency: 'routine', patientId: '${pId}' })">
            Create Routine Referral
          </button>
        </div>
      </div>
    `;
  }
}

// =============================================================================
// PAGE D: HOSPITAL MAP (Leaflet + OpenStreetMap)
// =============================================================================
function renderHospitalMap(container) {
  container.innerHTML = `
    <div>
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
        <div>
          <h2 class="section-title">${t('map_title')}</h2>
          <p class="section-subtitle">Real OpenStreetMap geospatial facility data with offline caching</p>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-sm btn-outline" id="btn-gps-locate" onclick="requestUserGeolocation()">
            <span>📍</span> ${t('btn_use_location')}
          </button>
          <button class="btn btn-sm btn-primary" onclick="navigate('matching')">
            <span>🎯</span> Match by Service
          </button>
        </div>
      </div>

      <!-- Cache status badge -->
      <div id="map-cache-status-notice" style="display: none;"></div>

      <div class="map-view-wrapper">
        <!-- Map Pane -->
        <div class="map-pane">
          <div class="map-controls-bar">
            <!-- Locality preset dropdown -->
            <select id="locality-preset-select" class="form-control" style="width: 170px;" onchange="handleLocalitySelect(this.value)">
              <option value="Madurai" selected>Madurai City</option>
              <option value="Alanganallur">Alanganallur</option>
              <option value="Samayanallur">Samayanallur</option>
              <option value="Vadipatti">Vadipatti</option>
              <option value="Melur">Melur</option>
              <option value="Usilampatti">Usilampatti</option>
              <option value="Tirumangalam">Tirumangalam</option>
              <option value="Sholavandan">Sholavandan</option>
            </select>

            <!-- Facility Type Filter -->
            <select id="filter-map-type" class="form-control" style="width: 150px;" onchange="handleMapFilterChange()">
              <option value="all">${t('filter_all_types')}</option>
              <option value="hospital">${t('filter_hospitals')}</option>
              <option value="clinic">${t('filter_clinics')}</option>
              <option value="doctors">${t('filter_doctors')}</option>
            </select>

            <!-- Operator Tier Filter -->
            <select id="filter-map-operator" class="form-control" style="width: 160px;" onchange="handleMapFilterChange()">
              <option value="all">${t('filter_all_operators')}</option>
              <option value="government">${t('filter_government')}</option>
              <option value="private">${t('filter_private')}</option>
            </select>

            <!-- Search input -->
            <input type="text" id="filter-map-search" class="form-control" style="flex: 1; min-width: 160px;" placeholder="Search facility name..." oninput="handleMapFilterChange()">
          </div>

          <div style="position: relative; flex: 1; display: flex; flex-direction: column;">
            <div id="leaflet-map"></div>
            <!-- Floating Live Route Panel -->
            <div id="map-route-panel" class="map-route-panel" style="display: none;"></div>
          </div>
        </div>

        <!-- Facilities List Pane -->
        <div class="facilities-sidebar-pane">
          <div class="facilities-list-header">
            <h4 style="font-size: 0.95rem; font-weight: 700;">Healthcare Facilities</h4>
            <span class="badge badge-gov" id="facilities-count-label">Loading...</span>
          </div>
          <div class="facility-cards-scroll" id="facility-cards-container">
            <div class="loading-state">
              <div class="spinner"></div>
              <p>Locating healthcare facilities...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Initialize Leaflet Map after DOM insertion
  setTimeout(() => {
    initHospitalMap('leaflet-map');
  }, 100);
}

function handleLocalitySelect(locality) {
  if (LOCALITY_PRESETS[locality]) {
    const coords = LOCALITY_PRESETS[locality];
    loadFacilitiesForLocation(coords[0], coords[1], locality);
  }
}

function handleMapFilterChange() {
  activeFilters.type = document.getElementById('filter-map-type')?.value || 'all';
  activeFilters.operator = document.getElementById('filter-map-operator')?.value || 'all';
  activeFilters.search = document.getElementById('filter-map-search')?.value.trim() || '';
  renderFilteredFacilities();
}

function selectFacilityForReferral(facId, facName) {
  preselectedFacility = { id: facId, name: facName };
  showToast(`Selected: ${facName}`, 'info');
  navigate('referrals', { openCreateModal: true, facilityId: facId, facilityName: facName });
}

// =============================================================================
// PAGE E: FACILITY MATCHING
// =============================================================================
async function renderFacilityMatching(container) {
  container.innerHTML = `
    <div style="max-width: 860px; margin: 0 auto;">
      <h2 class="section-title">${t('matching_title')}</h2>
      <p class="section-subtitle">Multi-criteria clinical matching based on service requirement, distance, and free care tier</p>

      <div class="card">
        <form onsubmit="handleMatchingSearch(event)">
          <div class="form-grid">
            <div class="form-group full-width">
              <label class="form-label">${t('select_service_label')} *</label>
              <select id="match-service" class="form-control" required>
                <option value="general">${t('service_general')}</option>
                <option value="maternal">${t('service_maternal')}</option>
                <option value="lab">${t('service_lab')}</option>
                <option value="specialist">${t('service_specialist')}</option>
                <option value="emergency">${t('service_emergency')}</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Reference Locality</label>
              <select id="match-locality" class="form-control">
                <option value="Madurai" selected>Madurai City (Center)</option>
                <option value="Alanganallur">Alanganallur Block</option>
                <option value="Samayanallur">Samayanallur Block</option>
                <option value="Vadipatti">Vadipatti Block</option>
                <option value="Melur">Melur Block</option>
                <option value="Usilampatti">Usilampatti Block</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Maximum Travel Distance (km)</label>
              <input type="number" id="match-distance" class="form-control" value="20" min="2" max="60">
            </div>
          </div>

          <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
            <button type="submit" class="btn btn-primary" id="btn-submit-match">
              <span>🎯</span> ${t('btn_find_matches')}
            </button>
          </div>
        </form>
      </div>

      <div id="matching-results-container"></div>
    </div>
  `;

  // Run initial match for general care
  executeFacilityMatch('general', 'Madurai', 25);
}

function handleMatchingSearch(e) {
  e.preventDefault();
  const service = document.getElementById('match-service').value;
  const locality = document.getElementById('match-locality').value;
  const dist = document.getElementById('match-distance').value || 25;
  executeFacilityMatch(service, locality, dist);
}

async function executeFacilityMatch(service, locality, maxDist) {
  const container = document.getElementById('matching-results-container');
  if (!container) return;

  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Ranking healthcare facilities for ${service}...</p>
    </div>
  `;

  const coords = LOCALITY_PRESETS[locality] || LOCALITY_PRESETS['Madurai'];

  try {
    const data = await api.matchFacilities({
      service,
      lat: coords[0],
      lng: coords[1],
      max_distance: maxDist
    });

    const matches = data.matched_facilities || [];

    if (matches.length === 0) {
      container.innerHTML = `
        <div class="card empty-state">
          <p>No facilities found within ${maxDist} km matching criteria. Try increasing the distance.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="margin: 16px 0 10px; display: flex; justify-content: space-between; align-items: center;">
        <h4 style="font-size: 1rem; font-weight: 700;">Top Matched Facilities (${matches.length})</h4>
        <span style="font-size: 0.8rem; color: var(--text-muted);">${data.explanation}</span>
      </div>

      <div style="display: flex; flex-direction: column; gap: 14px;">
        ${matches.map((fac, idx) => {
          const isGov = fac.operator_type === 'government';
          return `
            <div class="card" style="border-left: 4px solid ${idx === 0 ? 'var(--primary)' : 'var(--border)'};">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                <div>
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span class="badge ${isGov ? 'badge-gov' : 'badge-private'}">${isGov ? 'Government (Free Care)' : 'Private'}</span>
                    ${fac.emergency_services === 1 ? '<span class="badge badge-emergency">Casualty / Emergency</span>' : ''}
                    <span class="distance-pill">📍 ${fac.distance_km} km away</span>
                  </div>
                  <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">${escapeHTML(fac.name)}</h3>
                  <p style="font-size: 0.82rem; color: var(--text-muted);">${escapeHTML(fac.address || 'Madurai District')}</p>
                </div>

                <div style="text-align: right;">
                  <div style="font-size: 0.75rem; color: var(--text-muted);">${t('match_score')}</div>
                  <div style="font-size: 1.4rem; font-weight: 800; color: var(--primary);">${fac.score} / 100</div>
                </div>
              </div>

              <div style="margin-top: 12px; background: var(--background); padding: 10px 14px; border-radius: var(--radius-sm);">
                <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">${t('match_reasons_title')}</div>
                <ul style="font-size: 0.82rem; color: var(--text-muted); padding-left: 18px;">
                  ${(fac.match_reasons || []).map(r => `<li>${escapeHTML(r)}</li>`).join('')}
                </ul>
              </div>

              <div style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 10px;">
                <button class="btn btn-sm btn-outline" onclick="panToFacilityAndOpenMap(${fac.lat}, ${fac.lng})">
                  View on Map
                </button>
                <button class="btn btn-sm btn-primary" onclick="selectFacilityForReferral('${escapeHTML(fac.id)}', '${escapeHTML(fac.name)}')">
                  ${t('btn_select_for_referral')}
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="cache-alert info" style="margin-top: 16px;">
        <small>⚠️ <strong>Disclaimer:</strong> ${data.disclaimer}</small>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="card"><p style="color: var(--status-missed);">${err.message}</p></div>`;
  }
}

function panToFacilityAndOpenMap(lat, lng) {
  navigate('hospitals');
  setTimeout(() => {
    panToFacility(lat, lng);
  }, 300);
}

// =============================================================================
// PAGE F: REFERRAL MANAGEMENT & QR CODE GENERATION
// =============================================================================
async function renderReferrals(container, params = {}) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading referrals registry...</p>
    </div>
  `;

  try {
    const data = await api.getReferrals({ limit: 50 });
    const referrals = data.referrals || [];

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
        <div>
          <h2 class="section-title">${t('referral_title')}</h2>
          <p class="section-subtitle">Track outbound patient referrals, facility status, and verified attendance</p>
        </div>
        <button class="btn btn-primary" onclick="openCreateReferralModal()">
          <span>➕</span> ${t('create_referral_title')}
        </button>
      </div>

      <div class="card">
        <div style="display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;">
          <select id="filter-ref-status" class="form-control" style="width: 160px;" onchange="filterReferralsList()">
            <option value="all">All Statuses</option>
            <option value="pending">${t('status_pending')}</option>
            <option value="completed">${t('status_completed')}</option>
            <option value="not_attended">${t('status_not_attended')}</option>
            <option value="cancelled">${t('status_cancelled')}</option>
          </select>

          <select id="filter-ref-urgency" class="form-control" style="width: 150px;" onchange="filterReferralsList()">
            <option value="all">All Urgencies</option>
            <option value="routine">${t('urgency_routine')}</option>
            <option value="urgent">${t('urgency_urgent')}</option>
            <option value="emergency">${t('urgency_emergency')}</option>
          </select>

          <input type="text" id="ref-search-input" class="form-control" style="flex: 1; min-width: 180px;" placeholder="Search referral ID, patient, or hospital..." oninput="filterReferralsList()">
        </div>

        <div class="table-responsive">
          <table class="data-table" id="referrals-table">
            <thead>
              <tr>
                <th>Referral ID</th>
                <th>Patient</th>
                <th>Referred Facility</th>
                <th>Date</th>
                <th>Urgency</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${referrals.map(r => `
                <tr data-status="${r.status}" data-urgency="${r.urgency}" data-text="${escapeHTML((r.id + ' ' + r.patient_name + ' ' + r.facility_name).toLowerCase())}">
                  <td><strong>${escapeHTML(r.id)}</strong></td>
                  <td>${escapeHTML(r.patient_name)}</td>
                  <td>${escapeHTML(r.facility_name)}</td>
                  <td>${r.referral_date}</td>
                  <td>
                    <span class="badge badge-${r.urgency}">${t(`urgency_${r.urgency}`) || r.urgency}</span>
                  </td>
                  <td>
                    <span class="badge badge-${r.status}">${t(`status_${r.status}`) || r.status}</span>
                  </td>
                  <td>
                    <div style="display: flex; gap: 6px;">
                      <button class="btn btn-xs btn-outline" onclick="viewReferralSlip('${r.id}')">
                        📄 QR Slip
                      </button>
                      <button class="btn btn-xs btn-primary" onclick="openUpdateStatusModal('${r.id}', '${r.status}')">
                        ✏️ Status
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
              ${referrals.length === 0 ? '<tr><td colspan="7">No referrals recorded.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;

    if (params.openCreateModal) {
      openCreateReferralModal(params.patientId, params.facilityId, params.facilityName, params.prefillUrgency);
    }
  } catch (err) {
    container.innerHTML = `<div class="card"><p style="color: var(--status-missed);">${err.message}</p></div>`;
  }
}

function filterReferralsList() {
  const status = document.getElementById('filter-ref-status')?.value || 'all';
  const urgency = document.getElementById('filter-ref-urgency')?.value || 'all';
  const q = document.getElementById('ref-search-input')?.value.toLowerCase() || '';

  const rows = document.querySelectorAll('#referrals-table tbody tr');
  rows.forEach(row => {
    const rowStatus = row.dataset.status;
    const rowUrgency = row.dataset.urgency;
    const rowText = row.dataset.text || '';

    const matchStatus = status === 'all' || rowStatus === status;
    const matchUrgency = urgency === 'all' || rowUrgency === urgency;
    const matchSearch = !q || rowText.includes(q);

    if (matchStatus && matchUrgency && matchSearch) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

function startReferralForPatient(patientId, patientName) {
  preselectedPatientId = patientId;
  navigate('referrals', { openCreateModal: true, patientId, patientName });
}

async function openCreateReferralModal(patientId = null, facId = null, facName = null, prefillUrgency = 'routine') {
  let patients = [];
  let facilities = [];

  try {
    const pData = await api.getPatients({ limit: 100 });
    patients = pData.patients || [];
    const fData = await api.getFacilities();
    facilities = fData.facilities || [];
  } catch {}

  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const body = `
    <form id="create-referral-form" onsubmit="handleCreateReferralSubmit(event)">
      <div class="form-group" style="margin-bottom: 12px;">
        <label class="form-label">${t('select_patient')} *</label>
        <select id="ref-patient-id" class="form-control" required>
          <option value="">-- Choose Patient --</option>
          ${patients.map(p => `
            <option value="${p.id}" ${patientId === p.id || preselectedPatientId === p.id ? 'selected' : ''}>
              ${escapeHTML(p.name)} (${p.id} - ${escapeHTML(p.village)})
            </option>
          `).join('')}
        </select>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label class="form-label">${t('select_facility')} *</label>
        <select id="ref-facility-id" class="form-control" required onchange="handleReferralFacilitySelect(this)">
          <option value="">-- Choose Healthcare Facility --</option>
          ${facilities.map(f => `
            <option value="${f.id}" data-name="${escapeHTML(f.name)}" ${facId === f.id ? 'selected' : ''}>
              ${escapeHTML(f.name)} (${f.operator_type === 'government' ? 'Govt' : 'Private'})
            </option>
          `).join('')}
        </select>
        <input type="hidden" id="ref-facility-name" value="${escapeHTML(facName || (facilities[0]?.name || ''))}">
      </div>

      <div class="form-grid" style="margin-bottom: 12px;">
        <div class="form-group">
          <label class="form-label">${t('referral_urgency')} *</label>
          <select id="ref-urgency" class="form-control" required>
            <option value="routine" ${prefillUrgency === 'routine' ? 'selected' : ''}>${t('urgency_routine')}</option>
            <option value="urgent" ${prefillUrgency === 'urgent' ? 'selected' : ''}>${t('urgency_urgent')}</option>
            <option value="emergency" ${prefillUrgency === 'emergency' ? 'selected' : ''}>${t('urgency_emergency')}</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">${t('follow_up_date_label')}</label>
          <input type="date" id="ref-followup-date" class="form-control" min="${today}" value="${nextWeek}">
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label class="form-label">${t('referral_reason')} *</label>
        <input type="text" id="ref-reason" class="form-control" required placeholder="e.g., Specialized obstetric evaluation / Sputum culture" value="">
      </div>

      <div class="form-group" style="margin-bottom: 16px;">
        <label class="form-label">${t('referral_instructions')}</label>
        <textarea id="ref-instructions" class="form-control" placeholder="Instructions for patient regarding transport, documents, fasting..."></textarea>
      </div>

      <button type="submit" class="btn btn-primary" style="width: 100%;" id="btn-create-ref-submit">
        <span>📄</span> ${t('btn_submit_referral')}
      </button>
    </form>
  `;

  openModal(t('create_referral_title'), body, '');
}

function handleReferralFacilitySelect(selectEl) {
  const selectedOption = selectEl.options[selectEl.selectedIndex];
  const name = selectedOption.getAttribute('data-name');
  const nameHidden = document.getElementById('ref-facility-name');
  if (nameHidden) nameHidden.value = name;
}

async function handleCreateReferralSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-create-ref-submit');
  if (btn) btn.classList.add('loading');

  const facSelect = document.getElementById('ref-facility-id');
  const facId = facSelect.value;
  const facName = facSelect.options[facSelect.selectedIndex].getAttribute('data-name') || document.getElementById('ref-facility-name').value;

  const payload = {
    patient_id: document.getElementById('ref-patient-id').value,
    facility_id: facId,
    facility_name: facName,
    referral_date: new Date().toISOString().split('T')[0],
    urgency: document.getElementById('ref-urgency').value,
    reason: document.getElementById('ref-reason').value.trim(),
    instructions: document.getElementById('ref-instructions').value.trim(),
    follow_up_date: document.getElementById('ref-followup-date').value || null
  };

  try {
    const res = await api.createReferral(payload);
    closeModal();
    showToast(res.message || 'Referral created successfully!', 'success');
    navigate('referrals');
    if (res.referral?.id) {
      setTimeout(() => viewReferralSlip(res.referral.id), 300);
    }
  } catch (err) {
    alert(err.message || 'Error creating referral.');
  } finally {
    if (btn) btn.classList.remove('loading');
  }
}

// VIEW REFERRAL DETAILS & QR SLIP
async function viewReferralSlip(id) {
  try {
    const res = await api.getReferral(id);
    const { referral, followups } = res;

    const qrContainerId = `qrcode-slip-${referral.id.replace(/[^a-zA-Z0-9]/g, '')}`;

    const body = `
      <div style="border: 2px dashed var(--border); padding: 16px; border-radius: var(--radius-md); background: #ffffff;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div>
            <h3 style="color: var(--primary); font-size: 1.15rem;">HEALTH SAATHI 360 REFERRAL SLIP</h3>
            <p style="font-size: 0.8rem; color: var(--text-muted);">Tamil Nadu Public Healthcare Network</p>
          </div>
          <span class="badge badge-${referral.urgency}">${referral.urgency.toUpperCase()}</span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 140px; gap: 16px; align-items: center; margin-bottom: 16px;">
          <div>
            <p style="font-size: 0.88rem; margin-bottom: 4px;"><strong>Referral Token:</strong> <code>${referral.id}</code></p>
            <p style="font-size: 0.88rem; margin-bottom: 4px;"><strong>Patient:</strong> ${escapeHTML(referral.patient_name)} (${referral.patient_id})</p>
            <p style="font-size: 0.88rem; margin-bottom: 4px;"><strong>Village:</strong> ${escapeHTML(referral.patient_village)}</p>
            <p style="font-size: 0.88rem; margin-bottom: 4px;"><strong>Target Facility:</strong> ${escapeHTML(referral.facility_name)}</p>
            <p style="font-size: 0.88rem; margin-bottom: 4px;"><strong>Date:</strong> ${referral.referral_date}</p>
            <p style="font-size: 0.88rem; margin-bottom: 4px;"><strong>Status:</strong> <span class="badge badge-${referral.status}">${referral.status}</span></p>
          </div>

          <!-- QR Code Canvas -->
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div id="${qrContainerId}" style="width: 128px; height: 128px; background: #fff; padding: 4px; border: 1px solid var(--border);"></div>
            <span style="font-size: 0.68rem; color: var(--text-muted); margin-top: 4px; text-align: center;">Verified ID Token</span>
          </div>
        </div>

        <div style="font-size: 0.85rem; background: var(--background); padding: 10px; border-radius: var(--radius-sm); margin-bottom: 12px;">
          <strong>Clinical Reason:</strong> ${escapeHTML(referral.reason)}
          ${referral.instructions ? `<div style="margin-top: 4px;"><strong>Instructions:</strong> ${escapeHTML(referral.instructions)}</div>` : ''}
          ${referral.status_notes ? `<div style="margin-top: 4px;"><strong>Status Notes:</strong> ${escapeHTML(referral.status_notes)}</div>` : ''}
        </div>

        <div class="cache-alert info" style="font-size: 0.75rem; margin-bottom: 0;">
          🔒 ${t('qr_code_notice')}
        </div>
      </div>
    `;

    const footer = `
      <button class="btn btn-outline" onclick="closeModal()">Close</button>
      <button class="btn btn-outline" onclick="window.print()">🖨️ Print Slip</button>
      <button class="btn btn-primary" onclick="closeModal(); openUpdateStatusModal('${referral.id}', '${referral.status}')">Update Status</button>
    `;

    openModal(`Referral Slip - ${referral.id}`, body, footer);

    // Render QR Code (Non-sensitive ID token only)
    setTimeout(() => {
      const qrEl = document.getElementById(qrContainerId);
      if (qrEl && typeof QRCode !== 'undefined') {
        qrEl.innerHTML = '';
        new QRCode(qrEl, {
          text: JSON.stringify({ refId: referral.id, pid: referral.patient_id }),
          width: 120,
          height: 120,
          colorDark: '#1C2E26',
          colorLight: '#FFFFFF',
          correctLevel: QRCode.CorrectLevel.M
        });
      }
    }, 150);
  } catch (err) {
    alert('Failed to load referral slip.');
  }
}

// UPDATE REFERRAL STATUS
function openUpdateStatusModal(id, currentStatus) {
  const body = `
    <form id="update-status-form" onsubmit="handleUpdateStatusSubmit(event, '${id}')">
      <div class="form-group" style="margin-bottom: 14px;">
        <label class="form-label">${t('col_status')} *</label>
        <select id="update-ref-status" class="form-control" required>
          <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>${t('status_pending')}</option>
          <option value="completed" ${currentStatus === 'completed' ? 'selected' : ''}>${t('status_completed')}</option>
          <option value="not_attended" ${currentStatus === 'not_attended' ? 'selected' : ''}>${t('status_not_attended')}</option>
          <option value="cancelled" ${currentStatus === 'cancelled' ? 'selected' : ''}>${t('status_cancelled')}</option>
        </select>
      </div>

      <div class="form-group" style="margin-bottom: 16px;">
        <label class="form-label">${t('status_notes_label')}</label>
        <textarea id="update-ref-notes" class="form-control" placeholder="e.g., Examined by Medical Officer at PHC; medications dispensed."></textarea>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary" id="btn-save-ref-status">${t('btn_update_status')}</button>
      </div>
    </form>
  `;

  openModal(`${t('update_status_title')} - ${id}`, body, '');
}

async function handleUpdateStatusSubmit(e, id) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-ref-status');
  if (btn) btn.classList.add('loading');

  const status = document.getElementById('update-ref-status').value;
  const notes = document.getElementById('update-ref-notes').value.trim();

  try {
    const res = await api.updateReferralStatus(id, status, notes);
    closeModal();
    showToast(res.message || 'Status updated!', 'success');
    navigate('referrals');
  } catch (err) {
    alert(err.message || 'Error updating status.');
  } finally {
    if (btn) btn.classList.remove('loading');
  }
}

// =============================================================================
// PAGE G: FOLLOW-UP MANAGEMENT & BARRIER TRACKING
// =============================================================================
async function renderFollowups(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading follow-up tasks...</p>
    </div>
  `;

  try {
    const res = await api.getFollowups({ filter: 'all' });
    const { followups, counts } = res;

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
        <div>
          <h2 class="section-title">${t('followups_title')}</h2>
          <p class="section-subtitle">Track patient attendance, identify social barriers, and record community assistance</p>
        </div>
      </div>

      <!-- Follow-up category tabs -->
      <div style="display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;">
        <button class="btn btn-sm btn-outline active" id="fu-tab-all" onclick="filterFollowupsTab('all')">
          All (${followups.length})
        </button>
        <button class="btn btn-sm btn-outline" id="fu-tab-upcoming" onclick="filterFollowupsTab('upcoming')">
          ${t('tab_upcoming')} (${counts.upcoming})
        </button>
        <button class="btn btn-sm btn-outline" id="fu-tab-overdue" onclick="filterFollowupsTab('overdue')">
          ${t('tab_overdue')} (${counts.overdue})
        </button>
        <button class="btn btn-sm btn-outline" id="fu-tab-missed" onclick="filterFollowupsTab('missed')">
          ${t('tab_missed')} (${counts.missed})
        </button>
        <button class="btn btn-sm btn-outline" id="fu-tab-completed" onclick="filterFollowupsTab('completed')">
          ${t('tab_completed')} (${counts.completed})
        </button>
      </div>

      <div class="card">
        <div class="table-responsive">
          <table class="data-table" id="followups-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Due Date</th>
                <th>Referred Facility</th>
                <th>Status</th>
                <th>Identified Barrier</th>
                <th>Assistance Provided</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${followups.map(fu => {
                const today = new Date().toISOString().split('T')[0];
                const isOverdue = fu.status === 'pending' && fu.due_date < today;
                return `
                  <tr data-status="${fu.status}" data-overdue="${isOverdue}">
                    <td><strong>${escapeHTML(fu.patient_name)}</strong><br><small style="color:var(--text-muted);">${escapeHTML(fu.patient_village)}</small></td>
                    <td>
                      ${fu.due_date}
                      ${isOverdue ? '<span class="badge badge-missed">Overdue</span>' : ''}
                    </td>
                    <td>${escapeHTML(fu.facility_name)}</td>
                    <td><span class="badge badge-${fu.status}">${t(`status_${fu.status}`) || fu.status}</span></td>
                    <td>${escapeHTML(fu.barriers || 'None')}</td>
                    <td>${escapeHTML(fu.assistance_provided || 'None')}</td>
                    <td>
                      <button class="btn btn-xs btn-primary" onclick="openFollowupActionModal('${fu.id}', '${fu.status}', '${escapeHTML(fu.patient_name)}')">
                        ${t('record_followup_outcome')}
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
              ${followups.length === 0 ? '<tr><td colspan="7">No follow-ups recorded.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="card"><p style="color: var(--status-missed);">${err.message}</p></div>`;
  }
}

function filterFollowupsTab(tab) {
  document.querySelectorAll('[id^="fu-tab-"]').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`fu-tab-${tab}`)?.classList.add('active');

  const rows = document.querySelectorAll('#followups-table tbody tr');
  rows.forEach(row => {
    const status = row.dataset.status;
    const isOverdue = row.dataset.overdue === 'true';

    if (tab === 'all') row.style.display = '';
    else if (tab === 'upcoming') row.style.display = (status === 'pending' && !isOverdue) ? '' : 'none';
    else if (tab === 'overdue') row.style.display = (status === 'pending' && isOverdue) ? '' : 'none';
    else if (tab === 'missed') row.style.display = status === 'missed' ? '' : 'none';
    else if (tab === 'completed') row.style.display = status === 'completed' ? '' : 'none';
  });
}

function openFollowupActionModal(fuId, currentStatus, patientName) {
  const body = `
    <form id="followup-outcome-form" onsubmit="handleFollowupOutcomeSubmit(event, '${fuId}')">
      <p style="font-size: 0.9rem; margin-bottom: 14px;">Recording visit check for <strong>${patientName}</strong></p>

      <div class="form-group" style="margin-bottom: 12px;">
        <label class="form-label">Follow-up Outcome Status *</label>
        <select id="fu-status" class="form-control" required>
          <option value="completed" ${currentStatus === 'completed' ? 'selected' : ''}>Completed (Patient Attended Clinic)</option>
          <option value="missed" ${currentStatus === 'missed' ? 'selected' : ''}>Missed Appointment</option>
          <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>Pending (Revisit Scheduled)</option>
        </select>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label class="form-label">${t('barrier_label')}</label>
        <select id="fu-barrier" class="form-control">
          <option value="">${t('barrier_none')}</option>
          <option value="Transport issue">${t('barrier_transport')}</option>
          <option value="Daily wage loss">${t('barrier_wage')}</option>
          <option value="Childcare/Family">${t('barrier_childcare')}</option>
          <option value="Fear or Stigma">${t('barrier_fear')}</option>
          <option value="Condition improved">${t('barrier_improved')}</option>
        </select>
      </div>

      <div class="form-group" style="margin-bottom: 14px;">
        <label class="form-label">${t('assistance_label')}</label>
        <input type="text" id="fu-assistance" class="form-control" placeholder="${t('assistance_placeholder')}">
      </div>

      <div class="form-group" style="margin-bottom: 16px;">
        <label class="form-label">Health Worker Notes</label>
        <textarea id="fu-notes" class="form-control" placeholder="Observations regarding patient condition and adherence..."></textarea>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary" id="btn-save-fu">${t('btn_save_followup')}</button>
      </div>
    </form>
  `;

  openModal(`${t('record_followup_outcome')}`, body, '');
}

async function handleFollowupOutcomeSubmit(e, id) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-fu');
  if (btn) btn.classList.add('loading');

  const payload = {
    status: document.getElementById('fu-status').value,
    barriers: document.getElementById('fu-barrier').value,
    assistance_provided: document.getElementById('fu-assistance').value.trim(),
    notes: document.getElementById('fu-notes').value.trim()
  };

  try {
    const res = await api.updateFollowup(id, payload);
    closeModal();
    showToast(res.message || 'Follow-up saved!', 'success');
    navigate('followups');
  } catch (err) {
    alert(err.message || 'Failed to update follow-up.');
  } finally {
    if (btn) btn.classList.remove('loading');
  }
}

// =============================================================================
// PAGE H: UNIFIED SEARCH
// =============================================================================
async function renderSearch(container) {
  container.innerHTML = `
    <div>
      <h2 class="section-title">${t('search_records_title')}</h2>
      <p class="section-subtitle">Real-time searchable register across patients and hospital referrals</p>

      <div class="card" style="margin-bottom: 20px;">
        <div style="display: flex; gap: 10px; align-items: center;">
          <input type="text" id="global-search-input" class="form-control" style="font-size: 1rem; padding: 12px 16px;" placeholder="${t('search_input_placeholder')}" oninput="executeGlobalSearch()">
        </div>
      </div>

      <div id="search-results-area">
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Loading database index...</p>
        </div>
      </div>
    </div>
  `;

  executeGlobalSearch();
}

async function executeGlobalSearch() {
  const q = document.getElementById('global-search-input')?.value.trim() || '';
  const area = document.getElementById('search-results-area');
  if (!area) return;

  try {
    const [pRes, rRes] = await Promise.all([
      api.getPatients({ search: q, limit: 30 }),
      api.getReferrals({ search: q, limit: 30 })
    ]);

    const patients = pRes.patients || [];
    const referrals = rRes.referrals || [];

    area.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;" class="dashboard-two-col">
        <!-- Matching Patients -->
        <div class="card">
          <div class="card-title">
            <span>Patients (${patients.length})</span>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr><th>ID</th><th>Name</th><th>Village</th><th>Action</th></tr>
              </thead>
              <tbody>
                ${patients.map(p => `
                  <tr>
                    <td><strong>${escapeHTML(p.id)}</strong></td>
                    <td>${escapeHTML(p.name)}</td>
                    <td>${escapeHTML(p.village)}</td>
                    <td>
                      <button class="btn btn-xs btn-outline" onclick="openPatientModal('${p.id}')">View</button>
                    </td>
                  </tr>
                `).join('')}
                ${patients.length === 0 ? '<tr><td colspan="4">No matching patients.</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Matching Referrals -->
        <div class="card">
          <div class="card-title">
            <span>Referrals (${referrals.length})</span>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr><th>Ref ID</th><th>Facility</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                ${referrals.map(r => `
                  <tr>
                    <td><strong>${escapeHTML(r.id)}</strong></td>
                    <td>${escapeHTML(r.facility_name)}</td>
                    <td><span class="badge badge-${r.status}">${t(`status_${r.status}`) || r.status}</span></td>
                    <td>
                      <button class="btn btn-xs btn-outline" onclick="viewReferralSlip('${r.id}')">Slip</button>
                    </td>
                  </tr>
                `).join('')}
                ${referrals.length === 0 ? '<tr><td colspan="4">No matching referrals.</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    area.innerHTML = `<div class="card"><p style="color: var(--status-missed);">${err.message}</p></div>`;
  }
}

// =============================================================================
// PAGE I: ADMINISTRATOR DASHBOARD
// =============================================================================
async function renderAdmin(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Computing district healthcare analytics...</p>
    </div>
  `;

  try {
    const data = await api.getAdminStats();
    const { metrics, facilityUsage, localityBarriers, urgencyBreakdown } = data;

    container.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h2 class="section-title">${t('admin_title')}</h2>
        <p class="section-subtitle">Aggregated public health metrics without exposing individual identifiable health information</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card green">
          <div class="stat-icon">📈</div>
          <div class="stat-content">
            <h3>${metrics.completionRate}</h3>
            <p>${t('metric_completion_rate')}</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">📋</div>
          <div class="stat-content">
            <h3>${metrics.totalReferrals}</h3>
            <p>${t('metric_total_referrals')}</p>
          </div>
        </div>

        <div class="stat-card amber">
          <div class="stat-icon">🏥</div>
          <div class="stat-content">
            <h3>${metrics.activeFacilitiesCount}</h3>
            <p>${t('metric_active_facilities')}</p>
          </div>
        </div>
      </div>

      <!-- Facility Utilization CSS Chart -->
      <div class="card" style="margin-bottom: 20px;">
        <div class="card-title">
          <span>${t('facility_utilization_chart')}</span>
        </div>
        <div class="chart-bar-container">
          ${facilityUsage.map(fac => {
            const pct = Math.round((fac.referral_count / (metrics.totalReferrals || 1)) * 100);
            return `
              <div class="chart-bar-row">
                <div class="chart-bar-label" style="width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(fac.facility_name)}">
                  ${escapeHTML(fac.facility_name)}
                </div>
                <div class="chart-bar-track">
                  <div class="chart-bar-fill" style="width: ${pct}%; background: var(--primary);"></div>
                </div>
                <div class="chart-bar-value" style="width: 80px;">${fac.completed_count}/${fac.referral_count} (${pct}%)</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Localities with Recurring Barriers Table -->
      <div class="card">
        <div class="card-title">
          <span>${t('locality_barriers_table')}</span>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>${t('col_locality')}</th>
                <th>${t('col_total_fu')}</th>
                <th>${t('col_missed_fu')}</th>
                <th>${t('col_barriers')}</th>
              </tr>
            </thead>
            <tbody>
              ${localityBarriers.map(loc => `
                <tr>
                  <td><strong>${escapeHTML(loc.village)}</strong></td>
                  <td>${loc.total_followups}</td>
                  <td>
                    ${loc.missed_count > 0 ? `<span class="badge badge-missed">${loc.missed_count} Missed</span>` : '<span class="badge badge-completed">0 Missed</span>'}
                  </td>
                  <td>${escapeHTML(loc.common_barriers || 'None recorded')}</td>
                </tr>
              `).join('')}
              ${localityBarriers.length === 0 ? '<tr><td colspan="4">No access barrier records reported.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `
      <div class="card">
        <p style="color: var(--status-missed);">${err.message}</p>
        <p style="font-size: 0.85rem; color: var(--text-muted);">Requires District Admin or PHC Staff login to view aggregate reports.</p>
      </div>
    `;
  }
}

// =============================================================================
// MODAL & TOAST UTILITIES
// =============================================================================
function openModal(title, bodyHtml, footerHtml = '') {
  const modal = document.getElementById('global-modal');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const footerEl = document.getElementById('modal-footer');

  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = bodyHtml;
  if (footerEl) {
    if (footerHtml) {
      footerEl.innerHTML = footerHtml;
      footerEl.style.display = 'flex';
    } else {
      footerEl.style.display = 'none';
    }
  }

  if (modal) modal.style.display = 'flex';
}

function closeModal() {
  const modal = document.getElementById('global-modal');
  if (modal) modal.style.display = 'none';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️')}</span>
    <span style="flex:1;">${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}
