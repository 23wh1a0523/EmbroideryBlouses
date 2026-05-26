(async () => {
  try {
    const fs = require('fs');
    const items = [
      { name: 'Upload 1', price: '0', description: 'first', imageFilename: 'img1.jpg' },
      { name: 'Upload 2', price: '0', description: 'second', imageFilename: 'img2.jpg' }
    ];
    const fd = new FormData();
    fd.append('items', JSON.stringify(items));
    // Node's global FormData requires Blob/Buffer/Text for append; read files into buffers and wrap in Blob
    const b1 = fs.readFileSync('test-images/img1.jpg');
    const b2 = fs.readFileSync('test-images/img2.jpg');
    const blob1 = new Blob([b1]);
    const blob2 = new Blob([b2]);
    fd.append('images', blob1, 'img1.jpg');
    fd.append('images', blob2, 'img2.jpg');

    const res = await fetch('http://localhost:3000/api/designs/bulk-upload', { method: 'POST', body: fd });
    const txt = await res.text();
    console.log('status', res.status);
    console.log(txt);
  } catch (err) {
    console.error('Request failed', err);
    process.exit(1);
  }
})();
