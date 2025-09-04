// server.js
import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const app = express();


// __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ensure uploads dir exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// init DB
const db = new Database(path.join(__dirname, "data.db"));
db.exec(`
CREATE TABLE IF NOT EXISTS recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL,
  url TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
`);

app.use(cors());
app.use(express.json());

// serve uploads
app.use("/uploads", express.static(uploadsDir));

// Multer file storage (NOT memory, prevents 0KB issue)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "_" + file.originalname;
    cb(null, unique);
  },
});
const upload = multer({ storage });

// Upload API
app.post("/api/recordings", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const title = req.body.title || req.file.originalname;
  const filename = req.file.filename;
  const size = req.file.size;
  const url = `/uploads/${filename}`;
  const createdAt = new Date().toISOString();

  const result = db
    .prepare(
      "INSERT INTO recordings (title, filename, size, url, createdAt) VALUES (?, ?, ?, ?, ?)"
    )
    .run(title, filename, size, url, createdAt);

  res.json({ id: result.lastInsertRowid, title, filename, size, url, createdAt });
});

// List recordings
app.get("/api/recordings", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM recordings ORDER BY id DESC")
    .all();

  const withUrls = rows.map(r => ({
    ...r,
    url: `${req.protocol}://${req.get("host")}${r.url}`,
  }));

  res.json(withUrls);
});

// Delete recording
app.delete("/api/recordings/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM recordings WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });

  // delete file from disk
  const filepath = path.join(uploadsDir, row.filename);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

  // delete from DB
  db.prepare("DELETE FROM recordings WHERE id = ?").run(req.params.id);

  res.json({ ok: true });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});

