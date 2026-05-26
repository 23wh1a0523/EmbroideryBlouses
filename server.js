const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const { parse } = require('csv-parse/sync');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'designs.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// simple admin password (set ADMIN_PASSWORD env var in production)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const pairs = header.split(';').map(s => s.trim()).filter(Boolean);
  const obj = {};
  for (const pair of pairs) {
    const [k, v] = pair.split('=');
    if (k) obj[k] = v;
  }
  return obj;
}

function isAdminReq(req) {
  const cookies = parseCookies(req);
  return cookies.isAdmin === '1';
}

function requireAdmin(req, res, next) {
  if (isAdminReq(req)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.floor(Math.random()*1e9) + ext);
  }
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/test-images', express.static(path.join(__dirname, 'test-images')));
app.use(express.static(path.join(__dirname, 'public')));

async function ensureData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch (e) {
    await fs.writeFile(DATA_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

app.get('/api/designs', async (req, res) => {
  try {
    const txt = await fs.readFile(DATA_FILE, 'utf8');
    const designs = JSON.parse(txt || '[]');
    res.json(designs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read designs' });
  }
});

// Admin login endpoint (sets httpOnly cookie on success)
app.post('/api/admin-login', express.json(), (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    // set a simple httpOnly cookie to mark admin session for 1 day
    res.cookie('isAdmin', '1', { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Invalid password' });
});

app.post('/api/admin-logout', (req, res) => {
  res.clearCookie('isAdmin');
  res.json({ ok: true });
});

app.get('/api/admin-status', (req, res) => {
  res.json({ admin: isAdminReq(req) });
});

app.post('/api/designs', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, price, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const priceValue = (price !== undefined && price !== null && price !== '') ? parseFloat(price) : 0;

    const txt = await fs.readFile(DATA_FILE, 'utf8');
    const designs = JSON.parse(txt || '[]');
    const id = Date.now().toString();
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : (req.body.imageUrl || '');
    const newDesign = {
      id,
      name,
      price: isNaN(priceValue) ? 0 : priceValue,
      description: description || '',
      imageUrl,
      createdAt: new Date().toISOString()
    };
    designs.push(newDesign);
    await fs.writeFile(DATA_FILE, JSON.stringify(designs, null, 2), 'utf8');
    res.status(201).json(newDesign);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save design' });
  }
});

// Bulk import designs via CSV (supports imageUrl or imageFilename with uploaded files)
app.post('/api/designs/bulk', requireAdmin, upload.fields([{ name: 'csv', maxCount: 1 }, { name: 'images' }]), async (req, res) => {
  try {
    const csvFile = req.files && req.files['csv'] && req.files['csv'][0];
    if (!csvFile) return res.status(400).json({ error: 'CSV file is required (field name "csv")' });
    const csvText = await fs.readFile(csvFile.path, 'utf8');
    const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });

    // Map uploaded images by original filename -> stored filename
    const uploadedImages = {};
    if (req.files && req.files['images']) {
      for (const f of req.files['images']) {
        uploadedImages[f.originalname] = f.filename;
      }
    }

    const txt = await fs.readFile(DATA_FILE, 'utf8');
    const designs = JSON.parse(txt || '[]');

    const added = [];
    const errors = [];
    for (const row of records) {
      const name = row.name && String(row.name).trim();
      const priceRaw = row.price;
      const price = priceRaw !== undefined && priceRaw !== null && priceRaw !== '' ? parseFloat(priceRaw) : 0;
      if (!name) {
        errors.push({ row, error: 'name is required' });
        continue;
      }
      const id = Date.now().toString() + '-' + Math.floor(Math.random() * 1e9);
      let imageUrl = (row.imageUrl || '').trim();
      if ((!imageUrl || imageUrl === '') && row.imageFilename && uploadedImages[row.imageFilename]) {
        imageUrl = `/uploads/${uploadedImages[row.imageFilename]}`;
      }
      const newDesign = {
        id,
        name,
        price: isNaN(price) ? 0 : parseFloat(price),
        description: row.description || '',
        imageUrl: imageUrl || '',
        createdAt: new Date().toISOString()
      };
      designs.push(newDesign);
      added.push(newDesign);
    }

    await fs.writeFile(DATA_FILE, JSON.stringify(designs, null, 2), 'utf8');
    res.json({ addedCount: added.length, errors, added });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bulk import failed' });
  }
});

// Quick bulk upload that accepts JSON `items` and image files (simple multi-image workflow)
app.post('/api/designs/bulk-upload', requireAdmin, upload.array('images'), async (req, res) => {
  try {
    const itemsJson = req.body.items;
    if (!itemsJson) return res.status(400).json({ error: 'items JSON is required (field name "items")' });
    let records = [];
    try { records = JSON.parse(itemsJson); } catch (e) { return res.status(400).json({ error: 'Invalid JSON in items' }); }

    const txt = await fs.readFile(DATA_FILE, 'utf8');
    const designs = JSON.parse(txt || '[]');

    // Map uploaded images by original filename -> stored filename
    const uploadedImages = {};
    if (req.files) {
      for (const f of req.files) {
        uploadedImages[f.originalname] = f.filename;
      }
    }

    const added = [];
    const errors = [];
    for (const row of records) {
      const name = row.name && String(row.name).trim();
      const priceRaw = row.price;
      const price = priceRaw !== undefined && priceRaw !== null && priceRaw !== '' ? parseFloat(priceRaw) : 0;
      if (!name) {
        errors.push({ row, error: 'name is required' });
        continue;
      }
      const id = Date.now().toString() + '-' + Math.floor(Math.random() * 1e9);
      let imageUrl = (row.imageUrl || '').trim();
      if ((!imageUrl || imageUrl === '') && row.imageFilename && uploadedImages[row.imageFilename]) {
        imageUrl = `/uploads/${uploadedImages[row.imageFilename]}`;
      }
      const newDesign = {
        id,
        name,
        price: isNaN(price) ? 0 : parseFloat(price),
        description: row.description || '',
        imageUrl,
        createdAt: new Date().toISOString()
      };
      designs.push(newDesign);
      added.push(newDesign);
    }

    await fs.writeFile(DATA_FILE, JSON.stringify(designs, null, 2), 'utf8');
    res.json({ addedCount: added.length, added, errors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bulk upload failed' });
  }
});

// Export current designs as CSV
app.get('/api/designs/export', async (req, res) => {
  try {
    const txt = await fs.readFile(DATA_FILE, 'utf8');
    const designs = JSON.parse(txt || '[]');
    const header = ['id', 'name', 'price', 'description', 'imageUrl', 'createdAt'];
    const rows = designs.map(d => header.map(h => {
      const v = d[h] === undefined || d[h] === null ? '' : String(d[h]);
      if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return '"' + v.replace(/"/g, '""') + '"';
      }
      return v;
    }).join(','));
    const csv = header.join(',') + '\n' + rows.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="designs.csv"');
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export csv' });
  }
});

// Bulk update prices via CSV (columns: id,price) or (name,price)
app.post('/api/designs/update-prices', requireAdmin, upload.single('csv'), async (req, res) => {
  try {
    const csvFile = req.file;
    if (!csvFile) return res.status(400).json({ error: 'CSV file is required (field name "csv")' });
    const csvText = await fs.readFile(csvFile.path, 'utf8');
    const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });

    const txt = await fs.readFile(DATA_FILE, 'utf8');
    const designs = JSON.parse(txt || '[]');

    const updated = [];
    const errors = [];
    for (const row of records) {
      const priceRaw = row.price;
      const price = priceRaw !== undefined && priceRaw !== null && priceRaw !== '' ? parseFloat(priceRaw) : NaN;
      if (isNaN(price)) {
        errors.push({ row, error: 'price is required and must be numeric' });
        continue;
      }
      let found = false;
      if (row.id) {
        const d = designs.find(x => String(x.id) === String(row.id));
        if (d) { d.price = price; updated.push({ id: d.id, name: d.name, price }); found = true; }
      }
      if (!found && row.name) {
        const d = designs.find(x => x.name === row.name);
        if (d) { d.price = price; updated.push({ id: d.id, name: d.name, price }); found = true; }
      }
      if (!found) {
        errors.push({ row, error: 'no matching design by id or name' });
      }
    }

    await fs.writeFile(DATA_FILE, JSON.stringify(designs, null, 2), 'utf8');
    res.json({ updatedCount: updated.length, updated, errors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Price update failed' });
  }
});

// Update a single design (name, price, description, imageUrl)
app.put('/api/designs/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, description, imageUrl } = req.body;
    const txt = await fs.readFile(DATA_FILE, 'utf8');
    const designs = JSON.parse(txt || '[]');
    const idx = designs.findIndex(d => String(d.id) === String(id));
    if (idx === -1) return res.status(404).json({ error: 'Design not found' });
    if (name !== undefined) designs[idx].name = String(name);
    if (price !== undefined && price !== null && price !== '') {
      const p = parseFloat(price);
      if (isNaN(p)) return res.status(400).json({ error: 'price must be numeric' });
      designs[idx].price = p;
    }
    if (description !== undefined) designs[idx].description = String(description);
    if (imageUrl !== undefined) designs[idx].imageUrl = String(imageUrl);
    await fs.writeFile(DATA_FILE, JSON.stringify(designs, null, 2), 'utf8');
    res.json({ updated: designs[idx] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update design' });
  }
});

// Delete a design (and its uploaded file if stored locally)
app.delete('/api/designs/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const txt = await fs.readFile(DATA_FILE, 'utf8');
    const designs = JSON.parse(txt || '[]');
    const idx = designs.findIndex(d => String(d.id) === String(id));
    if (idx === -1) return res.status(404).json({ error: 'Design not found' });
    const [removed] = designs.splice(idx, 1);
    if (removed.imageUrl && removed.imageUrl.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, removed.imageUrl.replace(/^\//, ''));
      try { await fs.unlink(filePath); } catch (e) { console.warn('Failed to delete file', filePath, e.message); }
    }
    await fs.writeFile(DATA_FILE, JSON.stringify(designs, null, 2), 'utf8');
    res.json({ deleted: removed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete design' });
  }
});

// Upload site background image and generate a small CSS file to apply it
app.post('/api/background', requireAdmin, upload.single('background'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'background file is required (field "background")' });
    const ext = path.extname(req.file.originalname) || '.jpg';
    const destName = 'site-background' + ext.toLowerCase();
    const destPath = path.join(UPLOAD_DIR, destName);
    // Move uploaded file to a fixed background name (overwrite if exists)
    try {
      await fs.rename(req.file.path, destPath);
    } catch (e) {
      // fallback: copy and remove
      await fs.copyFile(req.file.path, destPath);
      try { await fs.unlink(req.file.path); } catch (_) {}
    }

    // Write a small CSS file in public/ that points to the uploaded image
    const css = `body { background-image: url("/uploads/${destName}"); background-size: cover; background-position: center; background-attachment: fixed; }\n`;
    const cssPath = path.join(__dirname, 'public', 'bg.css');
    await fs.writeFile(cssPath, css, 'utf8');

    res.json({ imageUrl: `/uploads/${destName}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save background' });
  }
});

// Try to start the server, if the port is in use attempt the next port up to a limit
ensureData().then(() => {
  const MAX_TRIES = 10;
  let portToTry = Number(process.env.PORT) || Number(PORT) || 3000;
  let tries = 0;

  const tryListen = () => {
    const server = app.listen(portToTry, () => {
      console.log(`Server running at http://localhost:${portToTry}`);
    });

    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        tries += 1;
        if (tries >= MAX_TRIES) {
          console.error(`Port ${portToTry} is already in use. Stop the process using it or set the PORT environment variable to a different port and restart.`);
          process.exit(1);
        }
        console.warn(`Port ${portToTry} in use, trying port ${portToTry + 1}...`);
        portToTry += 1;
        setTimeout(tryListen, 200);
      } else {
        console.error('Server error:', err);
        process.exit(1);
      }
    });
  };

  tryListen();
}).catch(err => {
  console.error('Failed to prepare data folders', err);
  process.exit(1);
});
