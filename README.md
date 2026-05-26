# Embroidery E-commerce (Simple)

Minimal Node + Express app to list blouse designs and add new designs via an admin page.

Run locally:

```bash
npm install
npm start
# open http://localhost:3000
```

Uploads are saved to `uploads/`. Add designs from the `admin.html` page.

Uploads are saved to `uploads/`. Add designs from the `admin.html` page.

Quick Add (recommended):

- Open the Admin page at `/admin.html`.
- Use the "Quick Add" section: select one or more image files, edit `name`, `price` and `description` for each image, then click "Add All".

Notes:

- This simplified admin UI focuses on the Quick Add flow for images. If you need CSV import/exports later, I can re-add them behind an "Advanced" toggle.

Quick Add (recommended for images):

- On the Admin page use the "Quick Add" section to select one or more image files. For each selected image you can set the `name`, `price`, and `description` inline before submitting.
- Quick Add uploads the image files and creates designs in one step — no CSV required. Use this when you have many image files to add quickly.
