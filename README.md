

# GhostFlow AI

### Preserving Human Cognitive Patterns via Workflow Telemetry

GhostFlow AI adalah platform *AI workflow intelligence* yang dirancang untuk menangkap, mempelajari, dan mewariskan pola kerja serta cara berpikir (*reasoning pattern*) seorang *expert* kepada developer berikutnya. Fokus utama sistem ini adalah menjaga agar *tacit knowledge* (pengetahuan tidak tertulis) di dalam tim tetap hidup dan dapat diwariskan, bahkan ketika *senior engineer*, *expert*, atau anggota inti sudah tidak lagi berada di dalam tim. 🧠

Di banyak perusahaan modern, *operational knowledge* yang sangat bernilai sering kali hanya tersimpan di dalam kepala manusia, bukan di dalam sistem. Saat seorang *expert* meninggalkan perusahaan, pola pemecahan masalah (*troubleshooting pattern*) dan alur pengambilan keputusan (*decision-making*) ikut hilang. GhostFlow AI hadir untuk mendokumentasikan jejak kognitif tersebut ke dalam sistem AI yang dapat diakses secara dinamis oleh tim.

---

## How It Works: Zero-Video & Privacy-First Telemetry

Berbeda dengan sistem pemantauan tradisional, GhostFlow AI **tidak menggunakan rekaman layar atau video**. Perekaman video tidak hanya membebani memori CPU (*membuat komputer lambat*), tetapi juga melanggar privasi dan keamanan data sensitif perusahaan. 

GhostFlow AI bekerja menggunakan **Event-based Telemetry Reconstruction** yang sangat ringan dan hanya aktif ketika Senior memilih untuk menyalakan tombol **"Record Ghost Session"**.

```text
[ Senior: Record Ghost Session ]
               │
               ├──> 📝 VS Code: File diffs & tab switches
               ├──> 🐚 Terminal: Command executions & output loops
               ├──> 🔍 Chrome (Anonymized): StackOverflow topics, API docs
               └──> 🎨 Figma: Design inspections (hex code, padding spacing)
               │
               ▼
[ AI Engine: Processing JSON Telemetry ] ──> [ Compiled into Journey Map ]
```

Sistem mengabstraksikan dan merekam aktivitas kerja dalam bentuk data JSON terstruktur:
*   **Workspace Window Layout:** Mendeteksi pembagian layar kerja (*split-screen layout*, misalnya VS Code di sisi kiri 60% dan dokumentasi browser di sisi kanan 40%).
*   **Granular Focus Mapping:** Mencatat aktivitas pencarian spesifikasi di Figma, waktu membaca dokumentasi teknis (tanpa merekam URL mentah pribadi), pengubahan baris kode (*diff*), hingga pengulangan perintah kompilasi di terminal.

---

## The Junior Developer Experience: Stress-Free Onboarding

Bagi developer junior yang baru bergabung, masuk ke dalam basis kode baru sering kali memicu kecemasan adaptasi (*onboarding anxiety*). Mereka sungkan menanyakan hal-hal dasar berulang kali kepada Senior yang sibuk. GhostFlow AI bertindak sebagai pendamping kognitif yang menjembatani hambatan ini secara halus.

```text
               +-------------------------------------------+
               |     Junior: 5x Terminal Connection Error   |
               +-------------------------------------------+
                                     │
                                     ▼ (System Detects Struggle)
               +-------------------------------------------+
               |      Red Pulse Dot on Sidebar glows       |
               +-------------------------------------------+
                                     │
                                     ▼ (Junior Clicks Icon)
               +-------------------------------------------+
               |             Mini Support Drawer           |
               |                                           |
               |  [ 🛠️ Open Journey Map ]                   |
               |  - Discovery -> Dev -> Test -> Ship       |
               |                                           |
               |  [ 💬 Chat Kak Budi (Expert Persona) ]    |
               |  - Grounded in real session memory        |
               +-------------------------------------------+
```

### 1. System Calibration & Welcome Screen
Saat pertama kali dipasang, asisten desktop akan memandu junior melakukan kalibrasi sistem (integrasi VS Code dan shell terminal). Setelah itu, asisten menyapa secara personal:
> *"Halo! Saya GhostFlow Assistant. Saya adalah intisari proses berpikir dan pustaka kognitif dari Budi Santoso (Lead Backend Engineer) di tim ini. Saya di sini untuk menemani Anda beradaptasi."*

### 2. Hulu-ke-Hilir Interactive Journey Map
Junior dapat membuka dashboard utama untuk menjelajahi seluruh siklus pengerjaan tugas oleh Senior dari awal hingga selesai secara bertahap:
*   **FASE 1: Discovery & Spec:** Menampilkan momen saat Senior memeriksa desain di Figma dan membaca dokumentasi API sebelum mulai mengoding.
*   **FASE 2: Development & Build:** Menampilkan proses pembuatan struktur dasar kode dan tata letak layar kerja terbagi (*split-screen*).
*   **FASE 3: Test, Diagnostics & Debug:** Menampilkan masa krusial kegagalan terminal, siklus revisi kode, hingga akhirnya sistem sukses dijalankan (*the turning point*).
*   **FASE 4: Ship & Maintenance:** Menampilkan proses komit Git lokal dan penyelarasan kontainer Docker untuk memastikan stabilitas sistem.

### 3. Ergonomic Red-Pulse Notification
Sistem tidak akan memunculkan jendela *pop-up* besar yang mengganggu fokus kerja saat terjadi galat (*error*). Ketika junior mengalami kebuntuan (misal: *5x terminal error*), sistem hanya menampilkan **bintik merah kecil berdenyut halus (*subtle red pulse*)** di atas ikon bilah samping. Ketika diklik, laci obrolan kecil (*mini sidebar chat*) akan bergeser keluar menawarkan solusi spesifik yang pernah diambil oleh Senior pada kasus serupa.

### 4. Expert-Grounded Chat Mentor
Asisten dilengkapi dengan chatbot yang berperilaku persis seperti profil Senior bersangkutan. Chatbot ini tidak memberikan jawaban teoretis acak dari internet, melainkan **terikat 100% pada riwayat ingatan sesi kerja (*session memory*)** yang pernah terekam di dalam basis data lokal. Junior dapat bertanya langsung dan mendapatkan jawaban logis yang kontekstual.

---

## Core Features

*   **Zero-Video Telemetry Capture:** Merekam aktivitas kerja secara sangat ringan berbasis peristiwa (*event*) untuk performa komputer yang stabil dan proteksi privasi.
*   **Workspace Layout & Focus Tracking:** Memetakan bagaimana developer membagi layar kerja (*split-screen*) dan berinteraksi antar peralatan kerja (Figma, VS Code, Browser).
*   **Journey Map Pipeline:** Visualisasi runut perjalanan pengerjaan tugas dari hulu ke hilir (Discovery $\rightarrow$ Dev $\rightarrow$ Test $\rightarrow$ Ship).
*   **Expert-Grounded Chatbot:** Obrolan asisten interaktif yang memiliki memori spesifik terhadap insiden lokal dan kepribadian senior terkait.
*   **Passive Red-Pulse Alert:** Sistem notifikasi bebas gangguan yang memberikan ruang bagi junior untuk belajar secara mandiri.
*   **Actionable Command Copier:** Memungkinkan junior menyalin perintah terminal yang terbukti berhasil dijalankan oleh senior secara langsung.
*   **Environment Alignment Diagnostics:** Memindai dan menyelaraskan konfigurasi sistem lokal junior agar sesuai dengan spesifikasi lingkungan kerja senior saat sesi dicatat.

---

## Technology Direction

*   **React / Next.js:** Antarmuka visual dashboard utama dengan performa tinggi dan transisi halus (*Framer Motion*).
*   **Tauri Desktop Framework:** Pembungkus aplikasi desktop yang sangat ringan dan hemat memori untuk beroperasi di latar belakang sistem operasi.
*   **Gemini API:** Pemrosesan bahasa alami untuk penyesuaian persona asisten dan analisis kesamaan semantik masalah.
*   **Telemetry Logging Engine:** Parser terstruktur untuk mengubah aktivitas sistem menjadi berkas JSON ringkas yang mudah diolah.
*   **Git & Shell Integration Hooks:** Sistem integrasi terminal lokal untuk menangkap komit dan log keluaran terminal secara presisi.

---

## Vision

GhostFlow AI bertujuan membangun masa depan di mana cara berpikir, logika pemecahan masalah, dan alur kerja seorang *expert* tidak lagi hilang bersama kepergian individu tersebut. Kami percaya bahwa aset terbesar sebuah tim rekayasa perangkat lunak bukan hanya baris kode yang dihasilkan, melainkan **kecerdasan kognitif di balik pembuatan kode tersebut**. GhostFlow AI mengabadikan kecerdasan tersebut sebagai inteligensi operasional yang terus hidup dan berkembang di dalam tim.
