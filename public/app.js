let designsCache = [];

async function loadDesigns() {
  try {
    const res = await fetch('/api/designs');
    const data = await res.json();
    designsCache = Array.isArray(data) ? data : [];
    renderDesigns();
  } catch (err) {
    console.error(err);
    const container = document.getElementById('designs');
    if (container) container.innerHTML = '<p>Failed to load designs.</p>';
  }
}

function renderDesigns() {
  const container = document.getElementById('designs');
  if (!container) return;
  container.innerHTML = '';
  if (!designsCache || designsCache.length === 0) {
    container.innerHTML = '<p>No designs yet. Add designs from the admin page.</p>';
    return;
  }

  const sortSelect = document.getElementById('sort-select');
  const sort = sortSelect ? sortSelect.value : 'default';

  let list = designsCache.slice();
  if (sort === 'price-asc') {
    list.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  } else if (sort === 'price-desc') {
    list.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
  } else {
    list = list.slice().reverse();
  }

  list.forEach(d => {
    const card = document.createElement('div');
    card.className = 'card';
    const img = document.createElement('img');
    img.src = d.imageUrl || 'https://via.placeholder.com/400x300?text=No+Image';
    img.alt = d.name || 'Design';
    const name = document.createElement('h2');
    name.textContent = d.name || 'Untitled';
    const price = document.createElement('p');
    price.className = 'price';
    const pnum = Number(d.price);
    const priceText = Number.isFinite(pnum)
      ? pnum.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })
      : '₹0.00';
    price.textContent = priceText;
    card.appendChild(img);
    card.appendChild(name);
    card.appendChild(price);

    // WhatsApp order button for this design
    const phone = '919948088878';
    const orderBtn = document.createElement('a');
    orderBtn.className = 'order-btn';
    const idText = d.id ? ` (ID: ${d.id})` : '';
    const message = `Hi, I would like to order this design: "${d.name}"${idText} - Price: ${priceText}. Please confirm availability.`;
    orderBtn.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    orderBtn.target = '_blank';
    orderBtn.rel = 'noopener noreferrer';
    orderBtn.textContent = 'Order via WhatsApp';
    card.appendChild(orderBtn);

    if (d.description) {
      const desc = document.createElement('p');
      desc.textContent = d.description;
      card.appendChild(desc);
    }
    container.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadDesigns();
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) sortSelect.addEventListener('change', renderDesigns);
});
// Admin window handling: open admin in separate window/tab and close on logout
let adminWin = null;

// Admin login UI: show/hide Add Design link based on /api/admin-status
async function checkAdminStatus() {
  try {
    const res = await fetch('/api/admin-status', { credentials: 'include' });
    if (!res.ok) throw new Error('status failed');
    const j = await res.json();
    const adminLink = document.getElementById('admin-link');
    const adminBtn = document.getElementById('admin-btn');
    if (adminLink) adminLink.style.display = j.admin ? 'inline-block' : 'none';
    if (adminBtn) adminBtn.textContent = j.admin ? 'Logout' : 'Admin';
    if (adminBtn) {
      adminBtn.onclick = (e) => {
        // If currently logged in -> logout and close admin window if opened here
        if (adminBtn.textContent === 'Logout') {
          fetch('/api/admin-logout', { method: 'POST', credentials: 'include' }).catch(() => {});
          if (adminLink) adminLink.style.display = 'none';
          if (adminWin && !adminWin.closed) {
            try { adminWin.close(); } catch (_) {}
            adminWin = null;
          }
          adminBtn.textContent = 'Admin';
          return;
        }

        // Show modal login
        const modal = document.getElementById('admin-modal');
        if (!modal) {
          alert('Admin login not available.');
          return;
        }
        modal.setAttribute('aria-hidden', 'false');
        try { const pwInput = document.getElementById('admin-password'); if (pwInput) pwInput.focus(); } catch (_) {}
      };
    }
  } catch (err) {
    console.error('Failed to check admin status', err);
  }
}

// run admin status check on load
document.addEventListener('DOMContentLoaded', checkAdminStatus);

// Modal login handlers (bind once)
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('admin-modal');
  const form = document.getElementById('admin-login-form');
  const closeBtn = document.getElementById('admin-modal-close');

  function hideModal() {
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    const msg = document.getElementById('admin-login-msg'); if (msg) msg.textContent = '';
    const pw = document.getElementById('admin-password'); if (pw) pw.value = '';
  }

  if (closeBtn) closeBtn.addEventListener('click', (e) => { e.preventDefault(); hideModal(); });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwInput = document.getElementById('admin-password');
      const msgEl = document.getElementById('admin-login-msg');
      const adminLink = document.getElementById('admin-link');
      const adminBtn = document.getElementById('admin-btn');
      if (!pwInput) return;
      const pw = pwInput.value || '';
      if (!pw) { if (msgEl) msgEl.textContent = 'Please enter password'; return; }

      // Open a waiting admin window (avoids popup blocking and navigation issues)
      const waitUrl = window.location.origin + '/admin-wait.html';
      // open without 'noopener' so we can postMessage to the child window
      const waitWin = window.open(waitUrl, '_blank');
      if (!waitWin) { if (msgEl) msgEl.textContent = 'Popup blocked. Allow popups for this site.'; return; }

      try {
        const r = await fetch('/api/admin-login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
        if (r.ok) {
          if (adminLink) adminLink.style.display = 'inline-block';
          if (adminBtn) adminBtn.textContent = 'Logout';
          adminWin = waitWin;
          try {
            // signal the admin-wait window to navigate immediately
            adminWin.postMessage({ type: 'admin-login' }, window.location.origin);
          } catch (e) {
            console.warn('postMessage to admin window failed', e);
          }
          try { adminWin.focus(); } catch (e) { console.warn('could not focus admin window', e); }
          hideModal();
          alert('Logged in as admin. Admin window opened.');
        } else {
          try { waitWin.close(); } catch (_) {}
          const j = await r.json().catch(() => ({}));
          if (msgEl) msgEl.textContent = j.error || 'Invalid password';
        }
      } catch (err) {
        console.error(err);
        try { waitWin.close(); } catch (_) {}
        if (msgEl) msgEl.textContent = 'Login failed';
      }
    });
  }
});
