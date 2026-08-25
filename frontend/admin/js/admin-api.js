/* ============================================================
   admin-api.js — shared fetch helper for the whole admin CMS.
   Set window.MU_API_BASE below to your deployed backend URL.
   ============================================================ */
window.MU_API_BASE = window.MU_API_BASE || 'https://maison-utsav-backend.onrender.com';
async function api(path, options = {}) {
  const res = await fetch(`${window.MU_API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body,
  });

  if (res.status === 401) {
    if (!location.pathname.endsWith('/admin/') && !location.pathname.endsWith('index.html')) {
      window.location.href = 'index.html';
    }
    throw new Error('Not authenticated');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function apiUpload(path, formData, method = 'POST') {
  const res = await fetch(`${window.MU_API_BASE}${path}`, {
    method,
    credentials: 'include',
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return data;
}

// Call at the top of every protected admin page.
async function requireAdminSession() {
  try {
    const { admin } = await api('/api/auth/me');
    const who = document.getElementById('adminWhoAmI');
    if (who) who.textContent = admin.name || admin.email;
    return admin;
  } catch (e) {
    window.location.href = 'index.html';
    return null;
  }
}

function toast(msg, isError = false) {
  let t = document.getElementById('muToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'muToast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = isError ? 'mu-toast mu-toast-error show' : 'mu-toast show';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}
