/* =====================================================================
   UTSAV SHOWROOM — BOOKING.JS
   =====================================================================
   Replaces the old "Rent Now opens WhatsApp" behaviour. Provides:
     - Rental booking window (product, size, dates, time, days, purpose)
     - Payment window (UPI / Card / Netbanking / COD) with loading /
       success / error / cancellation states — never fakes a paid status
     - Order creation against the backend (POST /api/orders), with a
       local fallback queue if the API is unreachable
     - My Orders panel (looked up by phone number)
     - Favorites panel (reads the existing localStorage like-list)
   app.js still owns the click delegation for .card-cta / .btn-visit;
   this file exposes window.MU_openBooking(dataset) for it to call.
   ===================================================================== */
(function () {
  const API = () => window.MU_API_BASE;

  function isoDate(d) { return d.toISOString().slice(0, 10); }
  function todayStr() { return isoDate(new Date()); }

  // Category pages reference images as "../assets/..." while homepage/
  // collections tiles use "assets/...". Both point at the same product,
  // so normalize before it ever reaches the backend — otherwise the same
  // item gets two different DB rows and availability conflicts between
  // pages silently fail to be detected.
  function normalizeImagePath(p) { return String(p || '').replace(/^(\.\.\/)+/, ''); }

  /* ---------------------------------------------------------------------
     BOOKING WINDOW
  --------------------------------------------------------------------- */
  const bookingOverlay = document.createElement('div');
  bookingOverlay.className = 'floating-overlay';
  bookingOverlay.id = 'bookingOverlay';
  bookingOverlay.innerHTML = `
    <div class="floating-panel">
      <button type="button" class="floating-close" aria-label="Close">✕</button>
      <p class="floating-title">Rent Now</p>
      <p class="floating-sub">Fill in your booking details — everything except purpose is required.</p>
      <div class="booking-product">
        <img data-bk-img src="" alt="">
        <div><div class="bp-name" data-bk-name></div><div class="bp-price" data-bk-price></div></div>
      </div>
      <div class="form-error" data-bk-error></div>
      <div class="field-grid">
        <div class="f-row"><label>Size <span class="req">*</span></label>
          <select data-bk-size>
            <option value="">Select</option>
            <option>XS</option><option>S</option><option>M</option><option>L</option><option>XL</option><option>XXL</option><option>Free Size</option>
          </select>
        </div>
        <div class="f-row"><label>Time <span class="req">*</span></label><input type="time" data-bk-time></div>
      </div>
      <div class="field-grid">
        <div class="f-row"><label>Booking Date <span class="req">*</span></label><input type="date" data-bk-start></div>
        <div class="f-row"><label>Return Date <span class="req">*</span></label><input type="date" data-bk-end></div>
      </div>
      <div class="f-row"><label>Number of Days <span class="req">*</span></label><input type="number" min="1" data-bk-days readonly></div>
      <div class="f-row"><label>Purpose (optional)</label><input type="text" placeholder="e.g. Sangeet, Reception" data-bk-purpose></div>
      <div class="f-row"><label>Full Name <span class="req">*</span></label><input type="text" data-bk-cname></div>
      <div class="f-row"><label>Contact Number <span class="req">*</span></label><input type="tel" data-bk-cphone></div>
      <div class="f-row" data-bk-avail-note style="display:none; font-size:12px; color:#A56412;"></div>
      <button type="button" class="btn btn-solid btn-block" data-bk-proceed>Proceed →</button>
    </div>
  `;
  document.body.appendChild(bookingOverlay);

  let bookingCtx = null; // dataset of the current product

  function openBooking(d) {
    bookingCtx = { ...d, image: normalizeImagePath(d.image) };
    const displaySrc = (document.body.dataset.root === 'sub' ? '../' : '') + bookingCtx.image;
    bookingOverlay.querySelector('[data-bk-img]').src = displaySrc;
    bookingOverlay.querySelector('[data-bk-name]').textContent = d.name;
    bookingOverlay.querySelector('[data-bk-price]').textContent = '₹' + Number(d.price).toLocaleString('en-IN') + (d.type === 'rent' ? ' / day' : ' / session');
    bookingOverlay.querySelector('[data-bk-error]').classList.remove('show');
    bookingOverlay.querySelector('[data-bk-start]').min = todayStr();
    bookingOverlay.querySelector('[data-bk-end]').min = todayStr();
    ['size', 'time', 'start', 'end', 'purpose'].forEach((f) => { const el = bookingOverlay.querySelector(`[data-bk-${f}]`); if (el) el.value = ''; });
    bookingOverlay.querySelector('[data-bk-days]').value = '';
    const saved = currentCustomer();
    bookingOverlay.querySelector('[data-bk-cname]').value = saved ? saved.name : '';
    bookingOverlay.querySelector('[data-bk-cphone]').value = saved ? saved.phone : '';
    bookingOverlay.classList.add('open');
  }
  function closeBooking() { bookingOverlay.classList.remove('open'); }
  bookingOverlay.querySelector('.floating-close').addEventListener('click', closeBooking);
  bookingOverlay.addEventListener('click', (e) => { if (e.target === bookingOverlay) closeBooking(); });

  function recomputeDays() {
    const s = bookingOverlay.querySelector('[data-bk-start]').value;
    const e = bookingOverlay.querySelector('[data-bk-end]').value;
    const daysEl = bookingOverlay.querySelector('[data-bk-days]');
    if (s && e) {
      const diff = Math.round((new Date(e) - new Date(s)) / 86400000);
      daysEl.value = diff > 0 ? diff : '';
    } else {
      daysEl.value = '';
    }
  }
  bookingOverlay.querySelector('[data-bk-start]').addEventListener('change', function () {
    bookingOverlay.querySelector('[data-bk-end]').min = this.value;
    recomputeDays();
  });
  bookingOverlay.querySelector('[data-bk-end]').addEventListener('change', recomputeDays);

  bookingOverlay.querySelector('[data-bk-proceed]').addEventListener('click', async () => {
    const errEl = bookingOverlay.querySelector('[data-bk-error]');
    const availNote = bookingOverlay.querySelector('[data-bk-avail-note]');
    errEl.classList.remove('show');
    availNote.style.display = 'none';

    const val = (f) => bookingOverlay.querySelector(`[data-bk-${f}]`).value.trim();
    const fields = {
      size: val('size'), time: val('time'), startDate: val('start'), endDate: val('end'),
      days: val('days'), purpose: val('purpose'), customerName: val('cname'), customerPhone: val('cphone'),
    };
    const missing = [];
    if (!fields.size) missing.push('size');
    if (!fields.time) missing.push('time');
    if (!fields.startDate) missing.push('booking date');
    if (!fields.endDate) missing.push('return date');
    if (!fields.days) missing.push('number of days');
    if (!fields.customerName) missing.push('name');
    if (!fields.customerPhone) missing.push('contact number');
    if (missing.length) { errEl.textContent = 'Please fill in: ' + missing.join(', ') + '.'; errEl.classList.add('show'); return; }
    if (new Date(fields.endDate) <= new Date(fields.startDate)) { errEl.textContent = 'Return date must be after the booking date.'; errEl.classList.add('show'); return; }

    // availability check
    if (API()) {
      try {
        const res = await fetch(API() + '/api/availability/check', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagePath: bookingCtx.image, category: bookingCtx.category, productName: bookingCtx.name, startDate: fields.startDate, endDate: fields.endDate }),
        });
        const data = await res.json();
        if (res.ok && data.available === false) {
          errEl.textContent = 'This item is already booked for part of that date range. Please choose different dates.';
          errEl.classList.add('show');
          return;
        }
      } catch (e) {
        availNote.textContent = 'Could not verify live availability right now — you can still proceed and we\'ll confirm by phone.';
        availNote.style.display = 'block';
      }
    }

    saveCustomer({ name: fields.customerName, phone: fields.customerPhone });
    closeBooking();
    openPayment({ ...bookingCtx, ...fields });
  });

  /* ---------------------------------------------------------------------
     PAYMENT WINDOW
  --------------------------------------------------------------------- */
  const payOverlay = document.createElement('div');
  payOverlay.className = 'floating-overlay';
  payOverlay.id = 'paymentOverlay';
  payOverlay.innerHTML = `
    <div class="floating-panel">
      <button type="button" class="floating-close" aria-label="Close">✕</button>
      <div data-pay-step="methods">
        <p class="floating-title">Payment</p>
        <p class="floating-sub">Choose how you'd like to pay.</p>
        <div class="pay-methods">
          <label class="pay-method"><input type="radio" name="paym" value="UPI" checked> UPI</label>
          <label class="pay-method"><input type="radio" name="paym" value="CARD"> Credit / Debit Card</label>
          <label class="pay-method"><input type="radio" name="paym" value="NETBANKING"> Net Banking</label>
          <label class="pay-method"><input type="radio" name="paym" value="COD"> Cash on Delivery</label>
        </div>
        <div class="pay-summary"><span data-pay-summary-label></span><strong data-pay-summary-amount></strong></div>
        <div class="form-error" data-pay-error></div>
        <button type="button" class="btn btn-solid btn-block" data-pay-confirm>Confirm &amp; Pay →</button>
      </div>
      <div data-pay-step="loading" style="display:none;">
        <div class="state-row"><div class="spinner"></div><p>Processing your order…</p></div>
      </div>
      <div data-pay-step="success" style="display:none;">
        <div class="state-row"><div class="state-icon success">✓</div><p class="floating-title" style="margin:0;">Order Confirmed</p><p data-pay-success-msg style="color:var(--text-soft); font-size:13px;"></p>
          <button type="button" class="btn btn-line btn-block" data-pay-view-orders>View My Orders</button>
        </div>
      </div>
      <div data-pay-step="error" style="display:none;">
        <div class="state-row"><div class="state-icon error">✕</div><p class="floating-title" style="margin:0;">Something went wrong</p><p data-pay-error-msg style="color:var(--text-soft); font-size:13px;"></p>
          <button type="button" class="btn btn-solid btn-block" data-pay-retry>Try Again</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(payOverlay);

  let payCtx = null;

  function openPayment(ctx) {
    payCtx = ctx;
    showPayStep('methods');
    const amount = Number(ctx.price) * Number(ctx.days);
    payOverlay.querySelector('[data-pay-summary-label]').textContent = `₹${Number(ctx.price).toLocaleString('en-IN')} × ${ctx.days} day(s)`;
    payOverlay.querySelector('[data-pay-summary-amount]').textContent = '₹' + amount.toLocaleString('en-IN');
    payOverlay.querySelectorAll('.pay-method').forEach((m) => m.classList.toggle('selected', m.querySelector('input').checked));
    payOverlay.querySelector('[data-pay-error]').classList.remove('show');
    payOverlay.classList.add('open');
  }
  function closePayment() { payOverlay.classList.remove('open'); }
  function showPayStep(step) {
    payOverlay.querySelectorAll('[data-pay-step]').forEach((s) => { s.style.display = s.dataset.payStep === step ? '' : 'none'; });
  }
  payOverlay.querySelector('.floating-close').addEventListener('click', closePayment);
  payOverlay.addEventListener('click', (e) => {
    if (e.target === payOverlay) closePayment(); // cancellation state — order was never created, nothing to undo
    const m = e.target.closest('.pay-method');
    if (m) payOverlay.querySelectorAll('.pay-method').forEach((x) => x.classList.toggle('selected', x === m));
  });

  async function submitOrder() {
    const method = payOverlay.querySelector('input[name="paym"]:checked').value;
    showPayStep('loading');

    const payload = {
      imagePath: payCtx.image, category: payCtx.category, productName: payCtx.name, pricePerDay: payCtx.price,
      size: payCtx.size, startDate: payCtx.startDate, endDate: payCtx.endDate, days: payCtx.days,
      purpose: payCtx.purpose || null, customerName: payCtx.customerName, customerPhone: payCtx.customerPhone,
      paymentMethod: method,
    };

    if (!API()) {
      showPayStep('error');
      payOverlay.querySelector('[data-pay-error-msg]').textContent = 'Booking backend is not configured yet — please contact us directly to confirm this order.';
      return;
    }

    try {
      const res = await fetch(API() + '/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create order.');
      const order = data.order;

      if (method === 'COD') {
        const confirmRes = await fetch(API() + `/api/orders/${order.id}/confirm-cod`, { method: 'POST' });
        const confirmData = await confirmRes.json();
        if (!confirmRes.ok) throw new Error(confirmData.error || 'Could not confirm order.');
        showPayStep('success');
        payOverlay.querySelector('[data-pay-success-msg]').textContent = 'Cash on Delivery — pay when the item is delivered. Find it anytime in My Orders.';
      } else {
        // No live payment gateway is connected yet — the order is created
        // but stays "Pending Payment" until a real gateway confirms it.
        // We do not fake a paid status here.
        showPayStep('success');
        payOverlay.querySelector('[data-pay-success-msg]').textContent = 'Order placed — this payment method needs our team to confirm it by phone, since online payment isn\'t connected yet. We\'ll call you shortly.';
      }
    } catch (err) {
      showPayStep('error');
      payOverlay.querySelector('[data-pay-error-msg]').textContent = err.message;
    }
  }

  payOverlay.querySelector('[data-pay-confirm]').addEventListener('click', submitOrder);
  payOverlay.querySelector('[data-pay-retry]').addEventListener('click', submitOrder);
  payOverlay.querySelector('[data-pay-view-orders]').addEventListener('click', () => { closePayment(); openMyOrders(); });

  /* ---------------------------------------------------------------------
     CUSTOMER IDENTITY (localStorage) — used to prefill forms + find orders
  --------------------------------------------------------------------- */
  function currentCustomer() { try { return JSON.parse(localStorage.getItem('utsav-customer') || 'null'); } catch (e) { return null; } }
  function saveCustomer(c) { localStorage.setItem('utsav-customer', JSON.stringify(c)); document.dispatchEvent(new CustomEvent('utsav-customer-updated')); }

  /* ---------------------------------------------------------------------
     MY ORDERS panel
  --------------------------------------------------------------------- */
  const ordersOverlay = document.createElement('div');
  ordersOverlay.className = 'floating-overlay';
  ordersOverlay.innerHTML = `
    <div class="floating-panel">
      <button type="button" class="floating-close" aria-label="Close">✕</button>
      <p class="floating-title">My Orders</p>
      <div data-orders-lookup>
        <p class="floating-sub">Enter the phone number you booked with.</p>
        <div class="f-row"><input type="tel" placeholder="Your contact number" data-orders-phone></div>
        <button type="button" class="btn btn-solid btn-block" data-orders-fetch>Find My Orders →</button>
      </div>
      <div class="orders-list" data-orders-list></div>
    </div>
  `;
  document.body.appendChild(ordersOverlay);

  function statusLabel(s) { return String(s).replace('_', ' ').toLowerCase(); }

  async function fetchOrders(phone) {
    const listEl = ordersOverlay.querySelector('[data-orders-list]');
    listEl.innerHTML = '<div class="state-row"><div class="spinner"></div></div>';
    if (!API()) { listEl.innerHTML = '<p style="font-size:13px;color:var(--text-soft);">Orders backend is not configured yet.</p>'; return; }
    try {
      const res = await fetch(API() + '/api/orders?phone=' + encodeURIComponent(phone));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load orders.');
      if (!data.orders.length) { listEl.innerHTML = '<p style="font-size:13px;color:var(--text-soft);">No orders found for this number yet.</p>'; return; }
      listEl.innerHTML = data.orders.map((o) => `
        <div class="order-card">
          ${o.productImage ? `<img src="${(document.body.dataset.root === 'sub' ? '../' : '') + o.productImage}" alt="">` : ''}
          <div>
            <div class="oc-name">${o.productName}</div>
            <div class="oc-meta">${new Date(o.startDate).toLocaleDateString()} → ${new Date(o.endDate).toLocaleDateString()} · ${o.days} day(s) · Size ${o.size || '—'}</div>
            <div class="oc-meta">₹${Number(o.totalAmount).toLocaleString('en-IN')} · ${o.paymentMethod}</div>
            <span class="order-status ${o.status.toLowerCase()}">${statusLabel(o.status)}</span>
          </div>
        </div>`).join('');
    } catch (err) {
      listEl.innerHTML = `<p style="font-size:13px;color:var(--pink-dark);">${err.message}</p>`;
    }
  }

  function openMyOrders() {
    ordersOverlay.classList.add('open');
    const saved = currentCustomer();
    if (saved) {
      ordersOverlay.querySelector('[data-orders-phone]').value = saved.phone;
      fetchOrders(saved.phone);
    }
  }
  ordersOverlay.querySelector('.floating-close').addEventListener('click', () => ordersOverlay.classList.remove('open'));
  ordersOverlay.addEventListener('click', (e) => { if (e.target === ordersOverlay) ordersOverlay.classList.remove('open'); });
  ordersOverlay.querySelector('[data-orders-fetch]').addEventListener('click', () => {
    const phone = ordersOverlay.querySelector('[data-orders-phone]').value.trim();
    if (phone) fetchOrders(phone);
  });

  /* ---------------------------------------------------------------------
     FAVORITES — now a real page (favorites.html), not a floating panel.
     See js/sidebar.js for the "Favorites" sidebar link, which navigates
     there directly.
  --------------------------------------------------------------------- */

  /* ---------------------------------------------------------------------
     LOGIN / PROFILE — lightweight name+phone identity, no password
     (an "Account" for a rental storefront just needs a way to find
     "my orders" again later; full auth can be layered in later).
  --------------------------------------------------------------------- */
  const loginOverlay = document.createElement('div');
  loginOverlay.className = 'floating-overlay';
  loginOverlay.innerHTML = `
    <div class="floating-panel">
      <button type="button" class="floating-close" aria-label="Close">✕</button>
      <p class="floating-title">Your Profile</p>
      <p class="floating-sub">Save your name and number once, so future bookings and My Orders are quick.</p>
      <div class="f-row"><label>Full Name</label><input type="text" data-login-name></div>
      <div class="f-row"><label>Contact Number</label><input type="tel" data-login-phone></div>
      <button type="button" class="btn btn-solid btn-block" data-login-save>Save</button>
    </div>
  `;
  document.body.appendChild(loginOverlay);
  function openLogin() {
    const c = currentCustomer();
    loginOverlay.querySelector('[data-login-name]').value = c ? c.name : '';
    loginOverlay.querySelector('[data-login-phone]').value = c ? c.phone : '';
    loginOverlay.classList.add('open');
  }
  loginOverlay.querySelector('.floating-close').addEventListener('click', () => loginOverlay.classList.remove('open'));
  loginOverlay.addEventListener('click', (e) => { if (e.target === loginOverlay) loginOverlay.classList.remove('open'); });
  loginOverlay.querySelector('[data-login-save]').addEventListener('click', () => {
    const name = loginOverlay.querySelector('[data-login-name]').value.trim();
    const phone = loginOverlay.querySelector('[data-login-phone]').value.trim();
    if (name && phone) saveCustomer({ name, phone });
    loginOverlay.classList.remove('open');
  });

  /* ---------------------------------------------------------------------
     BOOK A SLOT — Contact page's stylish sub-panel (Wedding Rental /
     Beauty Parlour / Beauty Classes). Short form, no bottom-of-page
     scroll — opens as a floating window from any of the three cards.
  --------------------------------------------------------------------- */
  const slotOverlay = document.createElement('div');
  slotOverlay.className = 'floating-overlay';
  slotOverlay.innerHTML = `
    <div class="floating-panel">
      <button type="button" class="floating-close" aria-label="Close">✕</button>
      <div data-slot-step="form">
        <p class="floating-title" data-slot-title>Book a Slot</p>
        <p class="floating-sub" data-slot-sub></p>
        <div class="form-error" data-slot-error></div>
        <div class="f-row"><label>Full Name <span class="req">*</span></label><input type="text" data-slot-name></div>
        <div class="f-row"><label>Contact Number <span class="req">*</span></label><input type="tel" data-slot-phone></div>
        <div class="f-row"><label>Service</label><input type="text" data-slot-service placeholder="e.g. Bridal Wear fitting, Hair trial…"></div>
        <div class="field-grid">
          <div class="f-row"><label>Preferred Date</label><input type="date" data-slot-date></div>
          <div class="f-row"><label>Preferred Time</label><input type="time" data-slot-time></div>
        </div>
        <div class="f-row"><label>Short Note</label><textarea rows="2" data-slot-note placeholder="Anything we should know?"></textarea></div>
        <button type="button" class="btn btn-solid btn-block" data-slot-submit>Request Slot →</button>
      </div>
      <div data-slot-step="loading" style="display:none;"><div class="state-row"><div class="spinner"></div></div></div>
      <div data-slot-step="success" style="display:none;">
        <div class="state-row"><div class="state-icon success">✓</div><p class="floating-title" style="margin:0;">Request Sent</p><p style="color:var(--text-soft); font-size:13px;">We'll call you shortly to confirm your slot.</p></div>
      </div>
    </div>
  `;
  document.body.appendChild(slotOverlay);

  let slotSection = null;
  function openSlot(section) {
    slotSection = section;
    slotOverlay.querySelector('[data-slot-title]').textContent = section + ' — Book a Slot';
    slotOverlay.querySelector('[data-slot-sub]').textContent = 'Short form — we\'ll confirm your slot by phone.';
    showSlotStep('form');
    slotOverlay.querySelector('[data-slot-error]').classList.remove('show');
    const saved = currentCustomer();
    slotOverlay.querySelector('[data-slot-name]').value = saved ? saved.name : '';
    slotOverlay.querySelector('[data-slot-phone]').value = saved ? saved.phone : '';
    ['service', 'date', 'time', 'note'].forEach((f) => { slotOverlay.querySelector(`[data-slot-${f}]`).value = ''; });
    slotOverlay.classList.add('open');
  }
  function showSlotStep(step) { slotOverlay.querySelectorAll('[data-slot-step]').forEach((s) => { s.style.display = s.dataset.slotStep === step ? '' : 'none'; }); }
  slotOverlay.querySelector('.floating-close').addEventListener('click', () => slotOverlay.classList.remove('open'));
  slotOverlay.addEventListener('click', (e) => { if (e.target === slotOverlay) slotOverlay.classList.remove('open'); });

  slotOverlay.querySelector('[data-slot-submit]').addEventListener('click', async () => {
    const errEl = slotOverlay.querySelector('[data-slot-error]');
    errEl.classList.remove('show');
    const name = slotOverlay.querySelector('[data-slot-name]').value.trim();
    const phone = slotOverlay.querySelector('[data-slot-phone]').value.trim();
    if (!name || !phone) { errEl.textContent = 'Name and contact number are required.'; errEl.classList.add('show'); return; }
    if (!API()) { errEl.textContent = 'Booking backend is not configured yet.'; errEl.classList.add('show'); return; }

    showSlotStep('loading');
    try {
      const res = await fetch(API() + '/api/slot-bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: slotSection, name, phone,
          service: slotOverlay.querySelector('[data-slot-service]').value.trim() || null,
          preferredDate: slotOverlay.querySelector('[data-slot-date]').value || null,
          preferredTime: slotOverlay.querySelector('[data-slot-time]').value || null,
          note: slotOverlay.querySelector('[data-slot-note]').value.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send your request.');
      saveCustomer({ name, phone });
      showSlotStep('success');
    } catch (err) {
      showSlotStep('form');
      errEl.textContent = err.message;
      errEl.classList.add('show');
    }
  });

  // wire up the contact page's three premium cards + footer "Book a Slot" links
  document.addEventListener('click', (e) => {
    const card = e.target.closest('[data-book]');
    if (card) { e.preventDefault(); openSlot(card.dataset.book); }
  });

  /* ---------- exports ---------- */
  window.MU_openBooking = openBooking;
  window.MU_openMyOrders = openMyOrders;
  window.MU_openLogin = openLogin;
  window.MU_openSlotBooking = openSlot;
})();
