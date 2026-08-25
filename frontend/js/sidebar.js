/* =====================================================================
   UTSAV SHOWROOM — SIDEBAR.JS
   =====================================================================
   Builds the mobile-first sidebar drawer (hamburger button, backdrop,
   Favorites / Profile / My Orders / booking shortcuts / Owner Login) on
   every page, and drives the Owner Login floating window's dual-OTP
   flow. Also tracks which of the two identities — a regular customer
   (localStorage-based) or the site owner (real server session via
   GET /api/auth/me) — is currently active, and shows/hides the
   matching UI so only one login option appears at a time.
   Depends on: js/api-config.js (window.MU_API_BASE), css/enhance.css.
   ===================================================================== */
(function () {
  const API = () => window.MU_API_BASE;
  const isSubpage = document.body.dataset.root === 'sub'; // pages/*.html set this

  const rel = (p) => (isSubpage ? '../' + p : p);

  // Declared up front, before anything else in this file — both
  // checkUserSession() and checkOwnerSession() can synchronously hit an
  // early-return path (if window.MU_API_BASE isn't set yet) that calls
  // refreshAccountUI() immediately, before script execution reaches
  // wherever these used to be declared further down. That caused a
  // real "Cannot access before initialization" crash in production
  // whenever sidebar.js ran before api-config.js finished setting
  // MU_API_BASE (a real risk given script tag order).
  let userState = null;   // null = unknown/checking, true/false once resolved
  let userData = null;    // { name, email, ... } once resolved true
  let ownerState = null;  // null = unknown/checking, true/false once resolved

  /* ---------- inject Home link + hamburger button into every nav ---------- */
  document.querySelectorAll('.nav-row').forEach((row) => {
    const links = row.querySelector('.nav-links');
    if (links && !links.querySelector('.nav-home')) {
      const home = document.createElement('a');
      home.href = rel('index.html');
      home.className = 'nav-home';
      home.textContent = 'Home';
      links.prepend(home);
    }
    const right = row.querySelector('.nav-right');
    if (right && !right.querySelector('.hamburger')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hamburger';
      btn.setAttribute('aria-label', 'Open menu');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = '<span></span><span></span><span></span>';
      right.appendChild(btn);
    }
    if (right && !right.querySelector('.nav-user-login')) {
      const userBtn = document.createElement('button');
      userBtn.type = 'button';
      userBtn.className = 'nav-user-login';
      userBtn.textContent = 'Login';
      right.insertBefore(userBtn, right.querySelector('.hamburger'));
    }
  });

  /* ---------- Back button (every page except the homepage) ---------- */
  const isHome = /(^|\/)index\.html$/.test(location.pathname) || location.pathname.endsWith('/') || location.pathname === '';
  if (!isHome) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'page-back-btn';
    back.innerHTML = '<span aria-hidden="true">←</span> Back';
    back.addEventListener('click', () => {
      if (window.history.length > 1) window.history.back();
      else window.location.href = rel('index.html');
    });
    document.body.appendChild(back);
  }

  /* ---------- build sidebar + backdrop markup once ---------- */
  const backdrop = document.createElement('div');
  backdrop.className = 'sidebar-backdrop';
  const drawer = document.createElement('div');
  drawer.className = 'sidebar-drawer';
  drawer.innerHTML = `
    <div class="sidebar-head">
      <span class="wordmark">Utsav <em>Showroom</em></span>
      <button type="button" class="sidebar-close" aria-label="Close menu">✕</button>
    </div>
    <div class="sidebar-body">
      <div data-account-customer>
        <div class="sidebar-section">Account</div>
        <button type="button" class="sidebar-link" data-action="favorites"><span class="ico">♡</span> Favorites <span class="sidebar-badge" data-fav-count>0</span></button>
        <button type="button" class="sidebar-link" data-action="profile"><span class="ico">☺</span> <span data-login-label>Login / Profile</span></button>
        <button type="button" class="sidebar-link" data-action="orders"><span class="ico">▤</span> My Orders</button>
        <button type="button" class="sidebar-link" data-action="book-parlour"><span class="ico">✂</span> Book Parlour Appointment</button>
        <button type="button" class="sidebar-link" data-action="book-rental"><span class="ico">👗</span> Book Rental Appointment</button>
        <button type="button" class="sidebar-link" data-action="book-class"><span class="ico">🎓</span> Book Class</button>
        <button type="button" class="sidebar-link" data-action="user-logout" style="display:none;" data-user-logout><span class="ico">⎋</span> Logout</button>
      </div>
      <div data-account-owner style="display:none;">
        <div class="sidebar-section">Owner — Manage Website</div>
        <a class="sidebar-link" href="${rel('admin/dashboard.html')}"><span class="ico">▦</span> Dashboard</a>
        <a class="sidebar-link" href="${rel('admin/posts.html')}"><span class="ico">▤</span> Manage Products</a>
        <a class="sidebar-link" href="${rel('admin/categories.html')}"><span class="ico">▦</span> Manage Categories</a>
        <a class="sidebar-link" href="${rel('admin/inventory.html')}"><span class="ico">☰</span> Inventory Management</a>
        <a class="sidebar-link" href="${rel('admin/admins.html')}"><span class="ico">☺</span> Manage Owners</a>
        <button type="button" class="sidebar-link" data-action="owner-logout"><span class="ico">⎋</span> Logout (Owner)</button>
      </div>
    </div>
    <div class="sidebar-foot" data-owner-login-foot>
      <button type="button" class="btn btn-line sidebar-admin-btn" data-action="owner-login">Owner Login</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);

  function openDrawer() {
    drawer.classList.add('open');
    backdrop.classList.add('open');
    document.body.classList.add('sidebar-locked');
    document.querySelectorAll('.hamburger').forEach((b) => b.setAttribute('aria-expanded', 'true'));
    refreshFavCount();
    refreshAccountUI();
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.classList.remove('sidebar-locked');
    document.querySelectorAll('.hamburger').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('.hamburger')) openDrawer();
    if (e.target === backdrop || e.target.closest('.sidebar-close')) closeDrawer();
    if (e.target.closest('.nav-user-login')) { window.location.href = rel('profile.html'); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  function refreshFavCount() {
    let likes = [];
    try { likes = JSON.parse(localStorage.getItem('utsav-likes') || '[]'); } catch (e) {}
    const el = drawer.querySelector('[data-fav-count]');
    if (el) el.textContent = likes.length;
  }
  document.addEventListener('utsav-likes-updated', refreshFavCount);

  /* =====================================================================
     USER SESSION STATE — real server session (GET /api/user-auth/me,
     httpOnly cookie, Postgres-backed), checked once per page load, same
     pattern as the owner session check below. This replaces trusting
     localStorage as "logged in" — localStorage now only holds a
     convenience prefill (name/phone) for the booking forms, never proof
     of identity.
     ===================================================================== */
  async function checkUserSession() {
    if (!API()) { userState = false; refreshAccountUI(); return; }
    try {
      const res = await fetch(API() + '/api/user-auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        userState = true;
        userData = data.user;
      } else {
        userState = false;
        userData = null;
      }
    } catch (e) {
      userState = false;
      userData = null;
    }
    refreshAccountUI();
  }
  checkUserSession();
  document.addEventListener('utsav-user-updated', checkUserSession);
  window.MU_checkUserSession = checkUserSession;

  /* =====================================================================
     OWNER SESSION STATE — checked once per page load via the real
     server session (GET /api/auth/me, httpOnly cookie — JS can't read
     the cookie directly, so we ask the backend). Only one of "user
     logged in" / "owner logged in" is ever shown as active at a time.
     ===================================================================== */
  async function checkOwnerSession() {
    if (!API()) { ownerState = false; refreshAccountUI(); return; }
    try {
      const res = await fetch(API() + '/api/auth/me', { credentials: 'include' });
      ownerState = res.ok;
    } catch (e) {
      ownerState = false;
    }
    refreshAccountUI();
  }

  function refreshAccountUI() {
    const isOwner = ownerState === true;
    const isUser = !isOwner && userState === true;

    // navbar "Login" button — hidden entirely for the owner (per spec:
    // "when owner logged in, user login button hides") and vice versa
    document.querySelectorAll('.nav-user-login').forEach((btn) => {
      btn.style.display = isOwner ? 'none' : '';
      btn.textContent = isUser ? userData.name.split(' ')[0] : 'Login';
    });

    // sidebar "Login/Profile" label
    const sidebarLabel = drawer.querySelector('[data-login-label]');
    if (sidebarLabel) sidebarLabel.textContent = isUser ? userData.name.split(' ')[0] + ' — Profile' : 'Login / Profile';

    // sidebar Logout (customer) button — only when a regular user is logged in
    const userLogoutBtn = drawer.querySelector('[data-user-logout]');
    if (userLogoutBtn) userLogoutBtn.style.display = isUser ? '' : 'none';

    // Owner Login footer button — hidden once a regular user is logged in
    const ownerLoginFoot = drawer.querySelector('[data-owner-login-foot]');
    if (ownerLoginFoot) ownerLoginFoot.style.display = isUser ? 'none' : (isOwner ? 'none' : '');

    // whole Account panel: customer view vs. owner view
    const customerPanel = drawer.querySelector('[data-account-customer]');
    const ownerPanel = drawer.querySelector('[data-account-owner]');
    if (customerPanel) customerPanel.style.display = isOwner ? 'none' : '';
    if (ownerPanel) ownerPanel.style.display = isOwner ? '' : 'none';
  }

  document.addEventListener('utsav-customer-updated', refreshAccountUI);
  checkOwnerSession();

  /* ---------- sidebar action buttons ---------- */
  drawer.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    const type = action.dataset.action;
    if (type === 'favorites') { closeDrawer(); window.location.href = isSubpage ? '../favorites.html' : 'favorites.html'; }
    if (type === 'orders') { closeDrawer(); window.MU_openMyOrders && window.MU_openMyOrders(); }
    if (type === 'profile') { window.location.href = rel('profile.html'); }
    if (type === 'owner-login') { closeDrawer(); openAdminLogin(); }
    if (type === 'book-parlour') { closeDrawer(); window.MU_openSlotBooking && window.MU_openSlotBooking('Beauty Parlour'); }
    if (type === 'book-rental') { closeDrawer(); window.MU_openSlotBooking && window.MU_openSlotBooking('Wedding Rental'); }
    if (type === 'book-class') { closeDrawer(); window.MU_openSlotBooking && window.MU_openSlotBooking('Beauty Classes'); }
    if (type === 'user-logout') {
      try { await fetch(API() + '/api/user-auth/logout', { method: 'POST', credentials: 'include' }); } catch (err) {}
      userState = false;
      userData = null;
      refreshAccountUI();
      closeDrawer();
      window.location.href = rel('index.html');
    }
    if (type === 'owner-logout') {
      try { await fetch(API() + '/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch (err) {}
      ownerState = false;
      refreshAccountUI();
      closeDrawer();
      window.location.href = rel('index.html');
    }
  });

  /* expose for profile.html to re-check after it changes login state */
  window.MU_checkOwnerSession = checkOwnerSession;
  window.MU_refreshAccountUI = refreshAccountUI;

  /* =====================================================================
     OWNER LOGIN — two modes:
       1. "Log In" — returning owner: email + phone + password (no OTP).
       2. "First-Time Setup" — dual OTP (email + phone) to prove identity,
          then create a password. Only available while an owner slot is
          free (server enforces this; the client just surfaces whatever
          error comes back, e.g. "no slots available" or "already set
          up, log in instead").
     ===================================================================== */
  const adminOverlay = document.createElement('div');
  adminOverlay.className = 'floating-overlay';
  adminOverlay.id = 'adminLoginOverlay';
  adminOverlay.innerHTML = `
    <div class="floating-panel">
      <button type="button" class="floating-close" aria-label="Close">✕</button>

      <div data-admin-step="mode">
        <p class="floating-title">Owner Login</p>
        <div class="auth-tabs" style="display:flex; gap:8px; margin-bottom:22px; border-bottom:1px solid var(--line);">
          <button type="button" class="auth-tab active" data-owner-mode="password" style="padding:10px 4px; margin-bottom:-1px; border-bottom:2px solid var(--pink-dark); font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:0.05em; text-transform:uppercase; color:var(--text); background:none; border-top:none; border-left:none; border-right:none; cursor:pointer;">Log In</button>
          <button type="button" class="auth-tab" data-owner-mode="setup" style="padding:10px 4px; margin-bottom:-1px; border-bottom:2px solid transparent; font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:0.05em; text-transform:uppercase; color:var(--text-soft); background:none; border-top:none; border-left:none; border-right:none; cursor:pointer;">First-Time Setup</button>
        </div>

        <div data-owner-panel="password">
          <p class="floating-sub">Email, contact number, and password.</p>
          <div class="form-error" data-pw-error></div>
          <div class="f-row"><label>Email <span class="req">*</span></label><input type="email" data-pw-email placeholder="you@gmail.com"></div>
          <div class="f-row"><label>Contact Number <span class="req">*</span></label><input type="tel" data-pw-phone placeholder="10-digit mobile number"></div>
          <div class="f-row"><label>Password <span class="req">*</span></label><input type="password" data-pw-password placeholder="••••••••"></div>
          <button type="button" class="btn btn-solid btn-block" data-pw-login>Log In →</button>
        </div>

        <div data-owner-panel="setup" style="display:none;">
          <p class="floating-sub">First time only — verify your contact number and email, then create a password. Only available while an owner slot is free.</p>
          <div class="form-error" data-admin-error></div>
          <div class="f-row"><label>Contact Number <span class="req">*</span></label><input type="tel" data-admin-phone placeholder="10-digit mobile number"></div>
          <div class="f-row"><label>Gmail / Email <span class="req">*</span></label><input type="email" data-admin-email placeholder="you@gmail.com"></div>
          <button type="button" class="btn btn-solid btn-block" data-admin-send>Send Codes →</button>
        </div>
      </div>

      <div data-admin-step="verify" style="display:none;">
        <p class="floating-title">Enter Both Codes</p>
        <p class="floating-sub">One code was sent by SMS, one by email. Both are required.</p>
        <div class="form-error" data-admin-verify-error></div>
        <div class="f-row"><label>SMS Code <span class="req">*</span></label><input type="text" inputmode="numeric" maxlength="6" data-admin-phone-code placeholder="6-digit code"></div>
        <div class="f-row"><label>Email Code <span class="req">*</span></label><input type="text" inputmode="numeric" maxlength="6" data-admin-email-code placeholder="6-digit code"></div>
        <button type="button" class="btn btn-solid btn-block" data-admin-verify>Verify &amp; Continue →</button>
      </div>
      <div data-admin-step="setup-password" style="display:none;">
        <p class="floating-title">Create Your Password</p>
        <p class="floating-sub">Verified — set a password now. You'll use your email, contact number, and this password to log in from now on.</p>
        <div class="form-error" data-setup-pw-error></div>
        <div class="f-row"><label>Password <span class="req">*</span></label><input type="password" data-setup-password placeholder="At least 8 characters"></div>
        <button type="button" class="btn btn-solid btn-block" data-setup-pw-submit>Create Password &amp; Continue →</button>
      </div>
      <div data-admin-step="loading" style="display:none;">
        <div class="state-row"><div class="spinner"></div><p>Working…</p></div>
      </div>
      <div data-admin-step="success" style="display:none;">
        <div class="state-row"><div class="state-icon success">✓</div><p>Verified — opening Inventory Management…</p></div>
      </div>
    </div>
  `;
  document.body.appendChild(adminOverlay);

  function showAdminStep(step) {
    adminOverlay.querySelectorAll('[data-admin-step]').forEach((s) => { s.style.display = s.dataset.adminStep === step ? '' : 'none'; });
  }
  function openAdminLogin() {
    showAdminStep('mode');
    adminOverlay.classList.add('open');
  }
  function closeAdminLogin() { adminOverlay.classList.remove('open'); }
  adminOverlay.querySelector('.floating-close').addEventListener('click', closeAdminLogin);
  adminOverlay.addEventListener('click', (e) => { if (e.target === adminOverlay) closeAdminLogin(); });

  adminOverlay.querySelectorAll('[data-owner-mode]').forEach((tab) => {
    tab.addEventListener('click', () => {
      adminOverlay.querySelectorAll('[data-owner-mode]').forEach((t) => {
        const active = t === tab;
        t.style.color = active ? 'var(--text)' : 'var(--text-soft)';
        t.style.borderBottomColor = active ? 'var(--pink-dark)' : 'transparent';
      });
      adminOverlay.querySelector('[data-owner-panel="password"]').style.display = tab.dataset.ownerMode === 'password' ? '' : 'none';
      adminOverlay.querySelector('[data-owner-panel="setup"]').style.display = tab.dataset.ownerMode === 'setup' ? '' : 'none';
    });
  });

  // ---- Password login (returning owner) ----
  adminOverlay.querySelector('[data-pw-login]').addEventListener('click', async () => {
    const email = adminOverlay.querySelector('[data-pw-email]').value.trim();
    const phone = adminOverlay.querySelector('[data-pw-phone]').value.trim();
    const password = adminOverlay.querySelector('[data-pw-password]').value;
    const errEl = adminOverlay.querySelector('[data-pw-error]');
    errEl.classList.remove('show');
    if (!email || !phone || !password) { errEl.textContent = 'Email, contact number, and password are all required.'; errEl.classList.add('show'); return; }
    if (!API()) { errEl.textContent = 'Owner login backend is not configured yet.'; errEl.classList.add('show'); return; }

    showAdminStep('loading');
    try {
      const res = await fetch(API() + '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ email, phone, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed.');
      showAdminStep('success');
      ownerState = true;
      refreshAccountUI();
      setTimeout(() => { window.location.href = (isSubpage ? '../' : '') + 'admin/dashboard.html'; }, 900);
    } catch (err) {
      showAdminStep('mode');
      errEl.textContent = err.message;
      errEl.classList.add('show');
    }
  });

  // ---- First-time setup: send OTP ----
  let currentChallengeId = null;

  adminOverlay.querySelector('[data-admin-send]').addEventListener('click', async () => {
    const phone = adminOverlay.querySelector('[data-admin-phone]').value.trim();
    const email = adminOverlay.querySelector('[data-admin-email]').value.trim();
    const errEl = adminOverlay.querySelector('[data-admin-error]');
    errEl.classList.remove('show');
    if (!phone || !email) { errEl.textContent = 'Both contact number and email are required.'; errEl.classList.add('show'); return; }
    if (!API()) { errEl.textContent = 'Owner login backend is not configured yet.'; errEl.classList.add('show'); return; }

    showAdminStep('loading');
    try {
      const res = await fetch(API() + '/api/auth/admin-otp/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ phone, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send codes.');
      currentChallengeId = data.challengeId;
      showAdminStep('verify');
    } catch (err) {
      showAdminStep('mode');
      errEl.textContent = err.message;
      errEl.classList.add('show');
    }
  });

  // ---- First-time setup: verify OTP -> either needs password setup, or (rare) already-set-up error ----
  let currentSetupToken = null;

  adminOverlay.querySelector('[data-admin-verify]').addEventListener('click', async () => {
    const phoneCode = adminOverlay.querySelector('[data-admin-phone-code]').value.trim();
    const emailCode = adminOverlay.querySelector('[data-admin-email-code]').value.trim();
    const errEl = adminOverlay.querySelector('[data-admin-verify-error]');
    errEl.classList.remove('show');
    if (!phoneCode || !emailCode) { errEl.textContent = 'Both codes are required.'; errEl.classList.add('show'); return; }

    showAdminStep('loading');
    try {
      const res = await fetch(API() + '/api/auth/admin-otp/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ challengeId: currentChallengeId, phoneCode, emailCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed.');
      currentSetupToken = data.setupToken;
      showAdminStep('setup-password');
    } catch (err) {
      showAdminStep('verify');
      errEl.textContent = err.message;
      errEl.classList.add('show');
    }
  });

  // ---- First-time setup: create password -> real session ----
  adminOverlay.querySelector('[data-setup-pw-submit]').addEventListener('click', async () => {
    const password = adminOverlay.querySelector('[data-setup-password]').value;
    const errEl = adminOverlay.querySelector('[data-setup-pw-error]');
    errEl.classList.remove('show');
    if (!password || password.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.classList.add('show'); return; }

    showAdminStep('loading');
    try {
      const res = await fetch(API() + '/api/auth/owner-setup-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ setupToken: currentSetupToken, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create password.');
      showAdminStep('success');
      ownerState = true;
      refreshAccountUI();
      setTimeout(() => { window.location.href = (isSubpage ? '../' : '') + 'admin/dashboard.html'; }, 900);
    } catch (err) {
      showAdminStep('setup-password');
      errEl.textContent = err.message;
      errEl.classList.add('show');
    }
  });
})();

