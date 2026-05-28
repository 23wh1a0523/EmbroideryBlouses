function showNotAuthorized() {
  document.body.innerHTML = '<main style="padding:2rem;max-width:900px;margin:2rem auto;">\n    <h2>Not authorized</h2>\n    <p>You are not logged in as admin. Please return to the <a href="index.html">home page</a> and sign in as admin.</p>\n  </main>';
}

// Ensure only admin can use admin page
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/admin-status', { credentials: 'include' });
    if (!res.ok) return showNotAuthorized();
    const j = await res.json();
    if (!j.admin) return showNotAuthorized();
  } catch (err) {
    console.error('admin check failed', err);
    showNotAuthorized();
  }
});

const designForm = document.getElementById('design-form');
if (designForm) {
  designForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const msg = document.getElementById('msg');
    if (msg) msg.textContent = 'Uploading...';
    try {
      const res = await fetch('/api/designs', { method: 'POST', credentials: 'include', body: fd });
      const json = await res.json();
      if (res.ok) {
        if (msg) msg.textContent = 'Design added.';
        form.reset();
      } else {
        if (msg) msg.textContent = json.error || 'Failed to add design.';
      }
    } catch (err) {
      console.error(err);
      if (msg) msg.textContent = 'Network error.';
    }
  });
}

// Quick Add: select multiple images, edit metadata per image, submit all
let quickFiles = [];
const quickInput = document.getElementById('quick-images');
const quickList = document.getElementById('quick-list');
const quickForm = document.getElementById('quick-form');

// Helper to escape text for HTML attributes
function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Convert a PDF File into an array of image Files (one per page)
async function convertPdfToImages(file, scale = 1.5, quality = 0.9) {
  if (typeof pdfjsLib === 'undefined') throw new Error('pdfjsLib not available');
  // ensure workerSrc points to the same CDN bundle
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js';
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const images = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    const renderTask = page.render({ canvasContext: ctx, viewport });
    await renderTask.promise;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    const imgFileName = `${file.name.replace(/\.pdf$/i, '')}-page-${p}.jpg`;
    const newFile = new File([blob], imgFileName, { type: 'image/jpeg' });
    images.push(newFile);
  }
  return images;
}

function renderQuickList() {
  if (!quickList) return;
  quickList.innerHTML = '';
  quickFiles.forEach((file, idx) => {
    const div = document.createElement('div');
    div.className = 'quick-item';
    div.dataset.idx = idx;
    const nameDefault = file.name.replace(/\.[^/.]+$/, '');
    div.innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:8px;">
        <img src="${URL.createObjectURL(file)}" alt="${file.name}" style="max-width:120px;max-height:120px;border:1px solid #ddd;padding:4px;border-radius:4px;" />
        <div style="flex:1">
          <label>Name<br><input type="text" class="q-name" value="${nameDefault}"></label>
          <label>Price (₹)<br><input type="number" class="q-price" step="0.01"></label>
          <label>Description<br><textarea class="q-desc" rows="2"></textarea></label>
          <div><button type="button" class="q-remove">Remove</button></div>
        </div>
      </div>
    `;
    quickList.appendChild(div);
    div.querySelector('.q-remove').addEventListener('click', () => {
      quickFiles.splice(idx, 1);
      renderQuickList();
    });
  });
}

if (quickInput) {
  quickInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    quickFiles = [];
    for (const f of files) {
      try {
        if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
          // convert PDF pages to individual image Files
          const imgs = await convertPdfToImages(f);
          quickFiles.push(...imgs);
        } else {
          quickFiles.push(f);
        }
      } catch (err) {
        console.error('Failed to process file', f.name, err);
        // if conversion fails, skip the PDF but continue with others
      }
    }
    console.log('Quick Add: selected', quickFiles.length, 'files (images and converted PDF pages)');
    renderQuickList();
  });
}

if (quickForm) {
  quickForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const msg = document.getElementById('bulk-msg') || document.getElementById('msg');
    const submitBtn = quickForm.querySelector('button[type="submit"]');
    if (!quickFiles || quickFiles.length === 0) { if (msg) msg.textContent = 'No images selected.'; return; }
    console.log('Quick Add: Add All button clicked');
    const items = [];
    const itemDivs = quickList.querySelectorAll('.quick-item');
    itemDivs.forEach((div, i) => {
      const name = (div.querySelector('.q-name') && div.querySelector('.q-name').value) || '';
      let price = (div.querySelector('.q-price') && div.querySelector('.q-price').value);
      if (price === undefined || price === null || price === '') price = '0';
      const description = (div.querySelector('.q-desc') && div.querySelector('.q-desc').value) || '';
      items.push({ name, price, description, imageFilename: quickFiles[i].name });
    });

    console.log('Quick Add: submitting items', items.map(it => it.imageFilename));

    const fd = new FormData();
    fd.append('items', JSON.stringify(items));
    for (const f of quickFiles) fd.append('images', f, f.name);
    if (submitBtn) submitBtn.disabled = true;
    if (msg) msg.textContent = 'Uploading...';
    try {
      const res = await fetch('/api/designs/bulk-upload', { method: 'POST', credentials: 'include', body: fd });
      const json = await res.json();
      if (res.ok) {
        if (msg) msg.textContent = `Added ${json.addedCount} designs.`;
        if (json.errors && json.errors.length) {
          const errLines = json.errors.slice(0,5).map(er => (er.error + (er.row ? (": " + JSON.stringify(er.row)) : ''))).join('\n');
          if (msg) msg.textContent += ' Some rows failed. See console for details.';
          console.error('Bulk upload errors:', json.errors);
        }
        quickForm.reset();
        quickFiles = [];
        renderQuickList();
        if (typeof loadManageList === 'function') loadManageList();
      } else {
        if (msg) msg.textContent = json.error || 'Bulk upload failed.';
        console.error(json);
      }
    } catch (err) {
      console.error(err);
      if (msg) msg.textContent = 'Network or server error.';
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // Ensure the Add All button triggers the submit handler reliably
  const addAllBtn = quickForm.querySelector('button[type="submit"]');
  if (addAllBtn) {
    addAllBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Quick Add: Add All button click handler invoked');
      if (!quickFiles || quickFiles.length === 0) {
        const msg = document.getElementById('bulk-msg') || document.getElementById('msg');
        if (msg) msg.textContent = 'No images selected.';
        return;
      }
      if (typeof quickForm.requestSubmit === 'function') {
        quickForm.requestSubmit();
      } else {
        quickForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    });
  }
}

// --- Manage designs (edit price, delete) ---
async function loadManageList() {
  const container = document.getElementById('manage-list');
  const msg = document.getElementById('msg');
  if (!container) return;
  try {
    const res = await fetch('/api/designs', { credentials: 'include' });
    if (!res.ok) { container.innerHTML = '<p>Failed to load designs.</p>'; return; }
    const designs = await res.json();
    container.innerHTML = '';
    designs.slice().reverse().forEach(d => {
      const el = document.createElement('div');
      el.className = 'manage-item';
      const priceVal = (d.price !== undefined && d.price !== null) ? Number(d.price).toFixed(2) : '0.00';
      el.innerHTML = `
        <div style="display:flex;gap:12px;align-items:center;padding:8px;border-bottom:1px solid #eee;">
          <img src="${d.imageUrl || 'https://via.placeholder.com/120x90?text=No+Image'}" style="width:120px;height:auto;border:1px solid #ddd;padding:4px;border-radius:4px;" />
          <div style="flex:1;">
            <div style="font-weight:600;margin-bottom:6px;">
              <label style="font-weight:600">Name:<br><input type="text" class="m-name" value="${escapeHtml(d.name)}" style="width:260px;padding:4px;border:1px solid #ccc;border-radius:4px;"></label>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <label>Price: ₹<input type="number" class="m-price" value="${priceVal}" step="0.01" style="width:110px;"></label>
              <button class="m-save">Save</button>
              <button class="m-delete">Delete</button>
            </div>
          </div>
        </div>
      `;
      container.appendChild(el);

      el.querySelector('.m-save').addEventListener('click', async () => {
        const priceInput = el.querySelector('.m-price');
        const nameInput = el.querySelector('.m-name');
        const priceNew = priceInput.value;
        const nameNew = nameInput && nameInput.value ? nameInput.value.trim() : '';
        if (!nameNew) { if (msg) msg.textContent = 'Name cannot be empty.'; return; }
        try {
          const r = await fetch(`/api/designs/${d.id}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ price: priceNew, name: nameNew })
          });
          const j = await r.json();
          if (r.ok) {
            if (msg) msg.textContent = 'Saved.';
            loadManageList();
          } else {
            if (msg) msg.textContent = j.error || 'Update failed';
          }
        } catch (err) {
          console.error(err);
          if (msg) msg.textContent = 'Network error updating design.';
        }
      });

      el.querySelector('.m-delete').addEventListener('click', async () => {
        if (!confirm('Delete this design?')) return;
        try {
          const r = await fetch(`/api/designs/${d.id}`, { method: 'DELETE', credentials: 'include' });
          const j = await r.json();
          if (r.ok) {
            if (msg) msg.textContent = 'Design deleted.';
            loadManageList();
          } else {
            if (msg) msg.textContent = j.error || 'Delete failed';
          }
        } catch (err) {
          console.error(err);
          if (msg) msg.textContent = 'Network error deleting design.';
        }
      });
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p>Error loading designs.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refresh-manage');
  if (refreshBtn) refreshBtn.addEventListener('click', loadManageList);
  loadManageList();
});

// Bulk import handler
const bulkForm = document.getElementById('bulk-form');
if (bulkForm) {
  bulkForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const f = e.target;
    const fd = new FormData();
    const csvFile = f.querySelector('input[name="csv"]').files[0];
    const msg = document.getElementById('bulk-msg');
    if (!csvFile) { msg.textContent = 'Please select a CSV file.'; return; }
    fd.append('csv', csvFile);
    const images = f.querySelector('input[name="images"]').files;
    for (let i = 0; i < images.length; i++) fd.append('images', images[i]);
    msg.textContent = 'Importing...';
    try {
      const res = await fetch('/api/designs/bulk', { method: 'POST', credentials: 'include', body: fd });
      const json = await res.json();
      if (res.ok) {
        msg.textContent = `Imported ${json.addedCount} designs.`;
        f.reset();
      } else {
        msg.textContent = json.error || 'Bulk import failed.';
        console.error(json);
      }
    } catch (err) {
      console.error(err);
      msg.textContent = 'Network or server error.';
    }
  });
}

// Bulk price update handler
const priceForm = document.getElementById('price-form');
          console.log('Quick Add: submit handler fired');
if (priceForm) {
  priceForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const f = e.target;
    const fd = new FormData();
    const csvFile = f.querySelector('input[name="csv"]').files[0];
    const msg = document.getElementById('bulk-msg');
    if (!csvFile) { msg.textContent = 'Please select a CSV file.'; return; }
    fd.append('csv', csvFile);
    msg.textContent = 'Updating prices...';
    try {
      const res = await fetch('/api/designs/update-prices', { method: 'POST', credentials: 'include', body: fd });
      const json = await res.json();
      if (res.ok) {
        msg.textContent = `Updated ${json.updatedCount} prices.`;
        f.reset();
      } else {
        msg.textContent = json.error || 'Price update failed.';
        console.error(json);
      }
    } catch (err) {
      console.error(err);
      msg.textContent = 'Network or server error.';
    }
  });
}

// Export CSV
const exportBtn = document.getElementById('export-csv');
if (exportBtn) {
  exportBtn.addEventListener('click', async function () {
    const msg = document.getElementById('bulk-msg');
    msg.textContent = 'Preparing export...';
    try {
      const res = await fetch('/api/designs/export', { credentials: 'include' });
      if (!res.ok) { msg.textContent = 'Failed to export.'; return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'designs.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      msg.textContent = 'Export started.';
    } catch (err) {
      console.error(err);
      msg.textContent = 'Network error during export.';
    }
  });
}

// Background upload handler
const bgForm = document.getElementById('bg-form');
if (bgForm) {
  bgForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const f = e.target;
    const fd = new FormData();
    const file = f.querySelector('input[name="background"]').files[0];
    const msg = document.getElementById('bg-msg');
    if (!file) { if (msg) msg.textContent = 'Please choose an image.'; return; }
    fd.append('background', file);
    if (msg) msg.textContent = 'Uploading background...';
    try {
      const res = await fetch('/api/background', { method: 'POST', credentials: 'include', body: fd });
      const json = await res.json();
      if (res.ok) {
        if (msg) msg.textContent = 'Background uploaded.';
        // force reload of bg.css
        const link = document.querySelector('link[href="bg.css"]');
        if (link) {
          link.href = 'bg.css?ts=' + Date.now();
        }
      } else {
        if (msg) msg.textContent = json.error || 'Upload failed.';
      }
    } catch (err) {
      console.error(err);
      if (msg) msg.textContent = 'Network error.';
    }
  });
}
