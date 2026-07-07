const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const XLSX = require("xlsx");
const path = require("path");

const app = express();
// Render.com'un dinamik port ayarını desteklemesi için güncellendi
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const db = new sqlite3.Database("deneme.db");

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS kullanicilar (id INTEGER PRIMARY KEY AUTOINCREMENT, kurumKodu TEXT UNIQUE, okulAdi TEXT, sifre TEXT, rol TEXT DEFAULT 'okul')`);
    db.run(`CREATE TABLE IF NOT EXISTS okullar (id INTEGER PRIMARY KEY AUTOINCREMENT, kurumKodu TEXT UNIQUE, okulAdi TEXT, ogretmen TEXT, telefon TEXT, sinif5 INTEGER, sinif6 INTEGER, sinif7 INTEGER, sinif8 INTEGER)`);
    db.run(`CREATE TABLE IF NOT EXISTS ayarlar (id INTEGER PRIMARY KEY, sinavAdi TEXT, tarih TEXT, durum TEXT)`);
    db.run(`INSERT OR IGNORE INTO ayarlar (id, sinavAdi, tarih, durum) VALUES (1, '1. Genel Deneme Sınavı', '', 'ACIK')`);

    const adminOlustur = db.prepare("INSERT OR IGNORE INTO kullanicilar (kurumKodu, okulAdi, sifre, rol) VALUES (?, ?, ?, ?)");
    adminOlustur.run("admin", "İlçe Milli Eğitim", "761772", "admin");
    adminOlustur.finalize();
});

// HTML yönlendirmeleri bulut için optimize edildi
app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "index.html")); });
app.get("/admin.html", (req, res) => { res.sendFile(path.join(__dirname, "admin.html")); });

app.get("/getir-ayarlar", (req, res) => {
    db.get("SELECT * FROM ayarlar WHERE id = 1", [], (err, row) => {
        res.json(row || { sinavAdi: "Deneme Sınavı", tarih: "", durum: "ACIK" });
    });
});

app.post("/guncelle-ayarlar", (req, res) => {
    const { sinavAdi, tarih, durum } = req.body;
    db.run("UPDATE ayarlar SET sinavAdi = ?, tarih = ?, durum = ? WHERE id = 1", [sinavAdi, tarih, durum], function(err) {
        if (err) return res.status(500).json({ hata: "Ayarlar güncellenemedi." });
        res.json({ mesaj: "Sınav ayarları başarıyla güncellendi ve kilitlendi!" });
    });
});

app.post("/login", (req, res) => {
    const { kurumKodu, sifre } = req.body;
    if (kurumKodu === "admin" && sifre === "761772") {
        return res.json({ basarili: true, okulAdi: "İlçe Milli Eğitim", kurumKodu: "admin", rol: "admin" });
    }
    if (kurumKodu && sifre && kurumKodu === sifre && !isNaN(kurumKodu)) {
        db.get("SELECT durum FROM ayarlar WHERE id = 1", [], (err, ayar) => {
            if(ayar && ayar.durum === "KAPALI") {
                return res.status(403).json({ basarili: false, hata: "Veri giriş dönemi kapatılmıştır!" });
            }
            db.get("SELECT okulAdi FROM okullar WHERE kurumKodu = ?", [kurumKodu], (err, row) => {
                let otomatikOkulAdi = row ? row.okulAdi : "Kurum No: " + kurumKodu;
                res.json({ basarili: true, okulAdi: otomatikOkulAdi, kurumKodu: kurumKodu, rol: "okul" });
            });
        });
    } else { res.status(401).json({ basarili: false, hata: "Hatalı giriş!" }); }
});

app.post("/kaydet", (req, res) => {
    db.get("SELECT durum FROM ayarlar WHERE id = 1", [], (err, ayar) => {
        if(ayar && ayar.durum === "KAPALI") return res.status(403).json({ hata: "Sistem kapatılmıştır." });
        const { kurumKodu, okulAdi, ogretmen, telefon, sinif5, sinif6, sinif7, sinif8 } = req.body;
        db.get("SELECT id FROM okullar WHERE kurumKodu = ?", [kurumKodu], (err, row) => {
            if (row) {
                const sqlUpdate = `UPDATE okullar SET okulAdi=?, ogretmen=?, telefon=?, sinif5=?, sinif6=?, sinif7=?, sinif8=? WHERE kurumKodu=?`;
                db.run(sqlUpdate, [okulAdi, ogretmen, telefon, sinif5, sinif6, sinif7, sinif8, kurumKodu], () => res.json({ mesaj: "Sayılar başarıyla güncellendi!" }));
            } else {
                const sqlInsert = `INSERT INTO okullar (kurumKodu, okulAdi, ogretmen, telefon, sinif5, sinif6, sinif7, sinif8) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
                db.run(sqlInsert, [kurumKodu, okulAdi, ogretmen, telefon, sinif5, sinif6, sinif7, sinif8], () => res.json({ mesaj: "Sayılar başarıyla sisteme işlendi!" }));
            }
        });
    });
});

app.get("/tum-veriler", (req, res) => { db.all("SELECT * FROM okullar", [], (err, rows) => res.json(rows)); });
app.get("/excel-indir", (req, res) => {
    db.all("SELECT kurumKodu AS [Kurum Kodu], okulAdi AS [Okul Adı], ogretmen AS [Sorumlu Öğretmen], telefon AS [Telefon], sinif5 AS [5. Sınıf], sinif6 AS [6. Sınıf], sinif7 AS [7. Sınıf], sinif8 AS [8. Sınıf] FROM okullar", [], (err, rows) => {
        if (err) return res.status(500).send("Hata");
        const formatliVeri = rows.map(r => ({ ...r, "Okul Toplamı": r["5. Sınıf"] + r["6. Sınıf"] + r["7. Sınıf"] + r["8. Sınıf"] }));
        const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(formatliVeri);
        XLSX.utils.book_append_sheet(wb, ws, "Sayılar");
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Disposition", "attachment; filename=Viransehir_Deneme_Sayilari.xlsx"); res.send(buf);
    });
});

// Sunucuyu başlatma komutu bulut esnekliğine uyarlandı
app.listen(PORT, () => { console.log(`Sistem aktif port: ${PORT}`); });