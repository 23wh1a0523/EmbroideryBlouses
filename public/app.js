// API base can be set by a static host via `window.API_BASE`. Leave empty for same-origin.
const API_BASE = (window.API_BASE || '').replace(/\/+$/g, '');
function apiFetch(path, opts) { return fetch((API_BASE ? API_BASE : '') + path, opts); }

let designsCache = [];

const pager = { page: 1, limit: 24, loading: false, finished: false, sort: 'default' };

function mapSortToParam(val) {
  if (val === 'price-asc') return 'price:asc';
  if (val === 'price-desc') return 'price:desc';
  return 'createdAt:desc';
}

function renderCard(d) {
  const container = document.getElementById('designs');
  if (!container) return;
  const card = document.createElement('div');
  card.className = 'card';
  const img = document.createElement('img');
  img.src = d.imageUrl || 'https://via.placeholder.com/400x300?text=No+Image';
  img.alt = d.name || 'Design';
  img.loading = 'lazy';
  img.decoding = 'async';
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

  const phone = '919948088878';
  const orderBtn = document.createElement('a');
  orderBtn.className = 'order-btn';
  const idText = d.id ? ` (ID: ${d.id})` : '';

  // Share page URL (use API_BASE if configured, otherwise current origin)
  const shareBase = (typeof API_BASE !== 'undefined' && API_BASE) ? API_BASE : window.location.origin;
  const shareUrl = (shareBase.replace(/\/+$/g, '')) + '/d/' + encodeURIComponent(d.id);

  const messageParts = [];
  messageParts.push(`Hi, I would like to order this design: "${d.name}"${idText}`);
  messageParts.push(`Price: ${priceText}`);
  messageParts.push('Please confirm availability.');
  // Put the share URL on its own line so WhatsApp generates a rich preview
  messageParts.push(shareUrl);

  const message = messageParts.join('\n');
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
}

async function loadPage(reset = false) {
  if (reset) {
    const container = document.getElementById('designs');
    if (container) container.innerHTML = '';
    pager.page = 1;
    pager.finished = false;
  }
  if (pager.loading || pager.finished) return;
  pager.loading = true;
  try {
    const sortParam = mapSortToParam(pager.sort);
    const urlPath = `/api/designs?page=${pager.page}&limit=${pager.limit}&sort=${encodeURIComponent(sortParam)}`;
    const res = await apiFetch(urlPath);
    const data = await res.json();

    // fallback: server returned full array (legacy)
    if (Array.isArray(data)) {
      designsCache = data;
      const container = document.getElementById('designs');
      if (!container) return;
      container.innerHTML = '';
      let list = designsCache.slice();
      if (pager.sort === 'price-asc') list.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
      else if (pager.sort === 'price-desc') list.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
      else list = list.slice().reverse();
      list.forEach(renderCard);
      pager.finished = true;
      pager.loading = false;
      return;
    }

    if (data && Array.isArray(data.items)) {
      if (data.items.length === 0 && pager.page === 1) {
        const container = document.getElementById('designs');
        if (container) container.innerHTML = '<p>No designs yet. Add designs from the admin page.</p>';
        pager.finished = true;
      } else {
        data.items.forEach(renderCard);
        pager.page += 1;
        if (data.totalPages && pager.page > data.totalPages) pager.finished = true;
      }
    } else {
      console.error('Unexpected response from /api/designs', data);
    }
  } catch (err) {
    console.error(err);
    if (pager.page === 1) {
      const container = document.getElementById('designs');
      if (container) container.innerHTML = '<p>Failed to load designs.</p>';
    }
  } finally {
    pager.loading = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadPage();
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) sortSelect.addEventListener('change', () => {
    pager.sort = sortSelect.value;
    loadPage(true);
  });

  const sentinel = document.getElementById('list-end-sentinel');
  if (sentinel) {
    new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadPage();
    }, { rootMargin: '600px' }).observe(sentinel);
  }
});
// Admin window handling: open admin in separate window/tab and close on logout
let adminWin = null;

// Admin login UI: show/hide Add Design link based on /api/admin-status
async function checkAdminStatus() {
  try {
    const res = await apiFetch('/api/admin-status', { credentials: 'include' });
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
          apiFetch('/api/admin-logout', { method: 'POST', credentials: 'include' }).catch(() => {});
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
        const r = await apiFetch('/api/admin-login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
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
