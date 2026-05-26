(async () => {
  try {
    const items = [{ name: 'CLI Test', price: '9.99', description: 'added by test script', imageFilename: '' }];
    const fd = new FormData();
    fd.append('items', JSON.stringify(items));
    const res = await fetch('http://localhost:3000/api/designs/bulk-upload', { method: 'POST', body: fd });
    const txt = await res.text();
    console.log('status', res.status);
    console.log(txt);
  } catch (err) {
    console.error('Request failed', err);
    process.exit(1);
  }
})();
