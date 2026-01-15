import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    delay
} from '@whiskeysockets/baileys';

import Pino from 'pino';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sock;

// ===== KONFIGURASI KEAMANAN =====
const CONFIG = {
    minReplyDelay: 2000,
    maxReplyDelay: 5000,
    typingDuration: 3000,
    maxMessagesPerMinute: 10,
    userCooldown: 5000
};

// Tracking untuk rate limiting
const messageTracker = {
    lastMessageTime: {},
    messagesInLastMinute: []
};

// ===== KONFIGURASI AUTO REPLY =====

const welcomeMessage = `[Chat Otomatis] 
Halo kak 👋
Info bertanya tentang apa?

Try Out :
1️⃣ TO TPA TBI Tubel/Paket TO TPA TBI Tubel
2️⃣ TO UPKP Kemenkeu
3️⃣ TO Tubel BPKP
4️⃣ TO Ujian SAK

Kelas :
5️⃣ Kelas UPKP Kemenkeu
6️⃣ Kelas Tugas Belajar PKN STAN (Alumni PKN STAN)
7️⃣ Kelas Tubel BPKP
8️⃣ Kelas Ujian SAK 

Ditunggu maksimal 10menit ya kak 😁 
Apabila lebih dari 1 jam tidak dijawab mohon re-chat

Chat Operational Hours : 10.00-22.00 WIB`;

// Konfigurasi auto reply dengan opsi gambar dan file
const autoReplies = {
    // Sambutan awal
    'halo': { text: welcomeMessage },
    'hai': { text: welcomeMessage },
    'hallo': { text: welcomeMessage },
    'hello': { text: welcomeMessage },
    'info': { text: welcomeMessage },
    'p': { text: welcomeMessage },
    'pagi': { text: welcomeMessage },
    'siang': { text: welcomeMessage },
    'sore': { text: welcomeMessage },
    'malam': { text: welcomeMessage },
    
    // Try Out - Opsi 1
    '1': { 
        text: `✅ *TO TPA TBI Tubel/Paket TO TPA TBI Tubel*

📋 *Deskripsi:*
Try Out untuk persiapan ujian TPA (Tes Potensi Akademik) dan TBI (Test Bahasa Inggris) khusus Tugas Belajar.

📦 *Paket Include:*
- Soal-soal TPA sesuai standar Tubel
- Soal-soal TBI sesuai standar Tubel
- Pembahasan lengkap
- Sistem penilaaan otomatis

💰 *Harga:* [Hubungi admin untuk info harga]
⏰ *Durasi:* [Sesuai paket]

📲 Silakan ketik "DAFTAR 1" untuk mendaftar
atau tunggu admin untuk info lebih lanjut ya kak! 😊`,
        image: 'gambar_upkp.png'
    },

    // Try Out - Opsi 2 (dengan file PDF)
    '2': { 
        text: `✅ *TO UPKP Kemenkeu*

📋 *Deskripsi:*
Try Out untuk persiapan Ujian Penyesuaian Kenaikan Pangkat (UPKP) Kementerian Keuangan.

📦 *Paket Include:*
- Soal-soal sesuai kisi-kisi UPKP Kemenkeu
- Materi CAT (Computer Assisted Test)
- Pembahasan detail
- Simulasi ujian sebenarnya

💰 *Harga:* [Hubungi admin untuk info harga]
⏰ *Durasi:* [Sesuai paket]

📄 Berikut kami lampirkan daftar akreditasi kampus untuk referensi kak!

📲 Silakan ketik "DAFTAR 2" untuk mendaftar
atau tunggu admin untuk info lebih lanjut ya kak! 😊`,
        file: 'Kitab_Sakti.pdf',
        fileName: 'Kitab_Sakti.pdf'
    },

    // Try Out - Opsi 3
    '3': { 
        text: `✅ *TO Tubel BPKP*

📋 *Deskripsi:*
Try Out untuk persiapan seleksi Tugas Belajar BPKP (Badan Pengawasan Keuangan dan Pembangunan).

📦 *Paket Include:*
- Soal TPA & TBI
- Soal Kedinasan & Kepengawasan
- Pembahasan lengkap
- Tips & trik lulus seleksi

💰 *Harga:* [Hubungi admin untuk info harga]
⏰ *Durasi:* [Sesuai paket]

📲 Silakan ketik "DAFTAR 3" untuk mendaftar
atau tunggu admin untuk info lebih lanjut ya kak! 😊`
    },

    // Try Out - Opsi 4
    '4': { 
        text: `✅ *TO Ujian SAK*

📋 *Deskripsi:*
Try Out untuk persiapan Ujian Sertifikasi Ahli Keuangan (SAK).

📦 *Paket Include:*
- Soal-soal sesuai standar SAK
- Materi Akuntansi & Keuangan
- Pembahasan detail oleh praktisi
- Update regulasi terbaru

💰 *Harga:* [Hubungi admin untuk info harga]
⏰ *Durasi:* [Sesuai paket]

📲 Silakan ketik "DAFTAR 4" untuk mendaftar
atau tunggu admin untuk info lebih lanjut ya kak! 😊`
    },

    // Kelas - Opsi 5
    '5': { 
        text: `✅ *Kelas UPKP Kemenkeu*

📋 *Deskripsi:*
Kelas persiapan lengkap untuk Ujian Penyesuaian Kenaikan Pangkat Kementerian Keuangan.

📚 *Materi Kelas:*
- Materi TKD (Tes Kompetensi Dasar)
- Materi TKB (Tes Kompetensi Bidang)
- Latihan soal berkala
- Bimbingan intensif
- Try Out berkala

👨‍🏫 *Pengajar:* Instruktur berpengalaman
⏰ *Jadwal:* Fleksibel (online/offline)
💰 *Harga:* [Hubungi admin untuk info harga]

📲 Silakan ketik "DAFTAR 5" untuk mendaftar
atau tunggu admin untuk info lebih lanjut ya kak! 😊`
    },

    // Kelas - Opsi 6
    '6': { 
        text: `✅ *Kelas Tugas Belajar PKN STAN (Alumni PKN STAN)*

📋 *Deskripsi:*
Kelas khusus alumni PKN STAN yang ingin melanjutkan Tugas Belajar S2/S3.

📚 *Materi Kelas:*
- Persiapan TPA & TBI
- Tips seleksi administrasi
- Strategi interview
- Konsultasi pemilihan kampus
- Sharing session alumni yang sudah Tubel

👨‍🏫 *Pengajar:* Alumni PKN STAN yang sudah lulus Tubel
⏰ *Jadwal:* Fleksibel
💰 *Harga:* [Hubungi admin untuk info harga]

📲 Silakan ketik "DAFTAR 6" untuk mendaftar
atau tunggu admin untuk info lebih lanjut ya kak! 😊`
    },

    // Kelas - Opsi 7
    '7': { 
        text: `✅ *Kelas Tubel BPKP*

📋 *Deskripsi:*
Kelas persiapan lengkap untuk seleksi Tugas Belajar BPKP.

📚 *Materi Kelas:*
- Materi TPA & TBI intensif
- Materi Kedinasan & Kepengawasan
- Teknik menjawab soal
- Simulasi ujian
- Konsultasi strategi belajar

👨‍🏫 *Pengajar:* Praktisi & alumni Tubel BPKP
⏰ *Jadwal:* Batch system
💰 *Harga:* [Hubungi admin untuk info harga]

📲 Silakan ketik "DAFTAR 7" untuk mendaftar
atau tunggu admin untuk info lebih lanjut ya kak! 😊`
    },

    // Kelas - Opsi 8
    '8': { 
        text: `✅ *Kelas Ujian SAK*

📋 *Deskripsi:*
Kelas persiapan untuk mendapatkan Sertifikasi Ahli Keuangan.

📚 *Materi Kelas:*
- Standar Akuntansi Keuangan (SAK)
- PSAK terbaru
- Studi kasus nyata
- Tips ujian sertifikasi
- Mock exam berkala

👨‍🏫 *Pengajar:* Akuntan profesional tersertifikasi
⏰ *Jadwal:* Weekend class available
💰 *Harga:* [Hubungi admin untuk info harga]

📲 Silakan ketik "DAFTAR 8" untuk mendaftar
atau tunggu admin untuk info lebih lanjut ya kak! 😊`
    },

    // Pendaftaran - Opsi 1
    'daftar 1': { 
        text: `🎯 *CARA CHECKOUT TO TPA TBI Tubel*

📝 *Langkah-langkah:*
1️⃣ Buat akun dan login di website www.aorta-edu.com
2️⃣ Klik Kelas ▶ Try Out ▶ TO TPA TBI Tubel
3️⃣ Klik Beli Sekarang
4️⃣ Ubah Lifetime -> 1 (One) Month (atau pilih durasi lain sesuai kebutuhan)
5️⃣ Apply Kuponmu, jika memiliki Kupon Diskon
6️⃣ Lanjutkan pembayaran

🎉 *Mau diskon?*
Informasikan ke admin untuk mendapatkan kode kupon diskon spesial!

💡 *Butuh bantuan?* Admin siap membantu proses checkout ya kak! 😊`
    },

    // Pendaftaran - Opsi 2
    'daftar 2': { 
        text: `🎯 *CARA CHECKOUT TO UPKP Kemenkeu*

📝 *Langkah-langkah:*
1️⃣ Buat akun dan login di website www.aorta-edu.com
2️⃣ Klik Kelas ▶ UPKP Kemenkeu ▶ TO UPKP Kemenkeu
3️⃣ Klik Beli Sekarang
4️⃣ Ubah Lifetime -> 1 (One) Month (atau pilih durasi lain sesuai kebutuhan)
5️⃣ Apply Kuponmu, jika memiliki Kupon Diskon
6️⃣ Lanjutkan pembayaran

🎉 *Mau diskon?*
Informasikan ke admin untuk mendapatkan kode kupon diskon spesial!

💡 *Butuh bantuan?* Admin siap membantu proses checkout ya kak! 😊`
    },

    // Pendaftaran - Opsi 3
    'daftar 3': { 
        text: `🎯 *CARA CHECKOUT TO Tubel BPKP*

📝 *Langkah-langkah:*
1️⃣ Buat akun dan login di website www.aorta-edu.com
2️⃣ Klik Kelas ▶ Try Out ▶ TO Tubel BPKP
3️⃣ Klik Beli Sekarang
4️⃣ Ubah Lifetime -> 1 (One) Month (atau pilih durasi lain sesuai kebutuhan)
5️⃣ Apply Kuponmu, jika memiliki Kupon Diskon
6️⃣ Lanjutkan pembayaran

🎉 *Mau diskon?*
Informasikan ke admin untuk mendapatkan kode kupon diskon spesial!

💡 *Butuh bantuan?* Admin siap membantu proses checkout ya kak! 😊`
    },

    // Pendaftaran - Opsi 4
    'daftar 4': { 
        text: `🎯 *CARA CHECKOUT TO Ujian SAK*

📝 *Langkah-langkah:*
1️⃣ Buat akun dan login di website www.aorta-edu.com
2️⃣ Klik Kelas ▶ Try Out ▶ TO Ujian SAK
3️⃣ Klik Beli Sekarang
4️⃣ Ubah Lifetime -> 1 (One) Month (atau pilih durasi lain sesuai kebutuhan)
5️⃣ Apply Kuponmu, jika memiliki Kupon Diskon
6️⃣ Lanjutkan pembayaran

🎉 *Mau diskon?*
Informasikan ke admin untuk mendapatkan kode kupon diskon spesial!

💡 *Butuh bantuan?* Admin siap membantu proses checkout ya kak! 😊`
    },

    // Pendaftaran - Opsi 5
    'daftar 5': { 
        text: `🎯 *CARA CHECKOUT Kelas UPKP Kemenkeu*

📝 *Langkah-langkah:*
1️⃣ Buat akun dan login di website www.aorta-edu.com
2️⃣ Klik Kelas ▶ UPKP Kemenkeu ▶ Kelas UPKP Kemenkeu
3️⃣ Klik Beli Sekarang
4️⃣ Ubah Lifetime -> 1 (One) Month (atau pilih durasi lain sesuai kebutuhan)
5️⃣ Apply Kuponmu, jika memiliki Kupon Diskon
6️⃣ Lanjutkan pembayaran

🎉 *Mau diskon?*
Informasikan ke admin untuk mendapatkan kode kupon diskon spesial!

💰 *Garansi Uang Kembali UPKP tersedia!*
Ketik "GARANSI" untuk info lengkap

💡 *Butuh bantuan?* Admin siap membantu proses checkout ya kak! 😊`
    },

    // Pendaftaran - Opsi 6
    'daftar 6': { 
        text: `🎯 *CARA CHECKOUT Kelas Tugas Belajar PKN STAN*

📝 *Langkah-langkah:*
1️⃣ Buat akun dan login di website www.aorta-edu.com
2️⃣ Klik Kelas ▶ Tugas Belajar ▶ Kelas Tubel PKN STAN
3️⃣ Klik Beli Sekarang
4️⃣ Ubah Lifetime -> 1 (One) Month (atau pilih durasi lain sesuai kebutuhan)
5️⃣ Apply Kuponmu, jika memiliki Kupon Diskon
6️⃣ Lanjutkan pembayaran

🎉 *Mau diskon?*
Informasikan ke admin untuk mendapatkan kode kupon diskon spesial!

💡 *Butuh bantuan?* Admin siap membantu proses checkout ya kak! 😊`
    },

    // Pendaftaran - Opsi 7
    'daftar 7': { 
        text: `🎯 *CARA CHECKOUT Kelas Tubel BPKP*

📝 *Langkah-langkah:*
1️⃣ Buat akun dan login di website www.aorta-edu.com
2️⃣ Klik Kelas ▶ Tugas Belajar ▶ Kelas Tubel BPKP
3️⃣ Klik Beli Sekarang
4️⃣ Ubah Lifetime -> 1 (One) Month (atau pilih durasi lain sesuai kebutuhan)
5️⃣ Apply Kuponmu, jika memiliki Kupon Diskon
6️⃣ Lanjutkan pembayaran

🎉 *Mau diskon?*
Informasikan ke admin untuk mendapatkan kode kupon diskon spesial!

💡 *Butuh bantuan?* Admin siap membantu proses checkout ya kak! 😊`
    },

    // Pendaftaran - Opsi 8
    'daftar 8': { 
        text: `🎯 *CARA CHECKOUT Kelas Ujian SAK*

📝 *Langkah-langkah:*
1️⃣ Buat akun dan login di website www.aorta-edu.com
2️⃣ Klik Kelas ▶ Sertifikasi ▶ Kelas Ujian SAK
3️⃣ Klik Beli Sekarang
4️⃣ Ubah Lifetime -> 1 (One) Month (atau pilih durasi lain sesuai kebutuhan)
5️⃣ Apply Kuponmu, jika memiliki Kupon Diskon
6️⃣ Lanjutkan pembayaran

🎉 *Mau diskon?*
Informasikan ke admin untuk mendapatkan kode kupon diskon spesial!

💡 *Butuh bantuan?* Admin siap membantu proses checkout ya kak! 😊`
    },

    // Garansi
    'garansi': {
        text: `💰 *GARANSI UANG KEMBALI UPKP*

Ketentuan:
✅ Uang kembali 30% apabila tidak lulus di semua bagian tes (Tes Potensi, TSKKWK, Psikotes)
✅ Uang kembali 15% apabila tidak lulus TSKKWK dan Psikotes
✅ Uang kembali 10% apabila tidak lulus TSKKWK saja atau Psikotes saja

Syarat:
☑️ Wajib hadir di semua pertemuan dari awal sampai akhir kelas.
    Terdapat link presensi yang akan di-share di tengah/setelah kelas dengan melampirkan bukti kehadiran dan catatan pembelajaran
☑️ Wajib telah mengerjakan semua Try Out sebelum pelaksanaan ujian

⚠️ *DISCLAIMER:*
🔘 AORTA tidak memberi jaminan kepastian lulus UPKP dan tidak bekerja sama dengan pihak manapun untuk memastikan kelulusan siswa
🔘 Kelulusan UPKP ditentukan oleh hasil usaha peserta sendiri dan faktor pendukung lainnya
🔘 Mekanisme garansi adalah bentuk komitmen AORTA kepada peserta atas kualitas pembelajaran, sekaligus mengajak peserta untuk mengikuti pembelajaran dengan sungguh-sungguh

📲 Ada pertanyaan lain? Admin siap membantu! 😊`
    },

    'garansi uang kembali': {
        text: `💰 *GARANSI UANG KEMBALI UPKP*

Ketentuan:
✅ Uang kembali 30% apabila tidak lulus di semua bagian tes (Tes Potensi, TSKKWK, Psikotes)
✅ Uang kembali 15% apabila tidak lulus TSKKWK dan Psikotes
✅ Uang kembali 10% apabila tidak lulus TSKKWK saja atau Psikotes saja

Syarat:
☑️ Wajib hadir di semua pertemuan dari awal sampai akhir kelas.
    Terdapat link presensi yang akan di-share di tengah/setelah kelas dengan melampirkan bukti kehadiran dan catatan pembelajaran
☑️ Wajib telah mengerjakan semua Try Out sebelum pelaksanaan ujian

⚠️ *DISCLAIMER:*
🔘 AORTA tidak memberi jaminan kepastian lulus UPKP dan tidak bekerja sama dengan pihak manapun untuk memastikan kelulusan siswa
🔘 Kelulusan UPKP ditentukan oleh hasil usaha peserta sendiri dan faktor pendukung lainnya
🔘 Mekanisme garansi adalah bentuk komitmen AORTA kepada peserta atas kualitas pembelajaran, sekaligus mengajak peserta untuk mengikuti pembelajaran dengan sungguh-sungguh

📲 Ada pertanyaan lain? Admin siap membantu! 😊`
    },

    'klaim garansi': {
        text: `💰 *GARANSI UANG KEMBALI UPKP*

Ketentuan:
✅ Uang kembali 30% apabila tidak lulus di semua bagian tes (Tes Potensi, TSKKWK, Psikotes)
✅ Uang kembali 15% apabila tidak lulus TSKKWK dan Psikotes
✅ Uang kembali 10% apabila tidak lulus TSKKWK saja atau Psikotes saja

Syarat:
☑️ Wajib hadir di semua pertemuan dari awal sampai akhir kelas.
    Terdapat link presensi yang akan di-share di tengah/setelah kelas dengan melampirkan bukti kehadiran dan catatan pembelajaran
☑️ Wajib telah mengerjakan semua Try Out sebelum pelaksanaan ujian

⚠️ *DISCLAIMER:*
🔘 AORTA tidak memberi jaminan kepastian lulus UPKP dan tidak bekerja sama dengan pihak manapun untuk memastikan kelulusan siswa
🔘 Kelulusan UPKP ditentukan oleh hasil usaha peserta sendiri dan faktor pendukung lainnya
🔘 Mekanisme garansi adalah bentuk komitmen AORTA kepada peserta atas kualitas pembelajaran, sekaligus mengajak peserta untuk mengikuti pembelajaran dengan sungguh-sungguh

📲 Ada pertanyaan lain? Admin siap membantu! 😊`
    },

    // Diskon & Promo
    'diskon': {
        text: `🎉 *INFO DISKON & PROMO*

Untuk informasi diskon terbaru dan kode promo, silakan informasikan ke admin ya kak! 

Admin akan berikan informasi:
💸 Diskon khusus yang sedang berlaku
🎫 Kode kupon promo
📦 Paket bundling hemat
🎁 Promo spesial lainnya

Ditunggu ya kak, admin siap bantu! 😊`
    },

    'promo': {
        text: `🎉 *INFO DISKON & PROMO*

Untuk informasi diskon terbaru dan kode promo, silakan informasikan ke admin ya kak! 

Admin akan berikan informasi:
💸 Diskon khusus yang sedang berlaku
🎫 Kode kupon promo
📦 Paket bundling hemat
🎁 Promo spesial lainnya

Ditunggu ya kak, admin siap bantu! 😊`
    },

    'kupon': {
        text: `🎉 *INFO DISKON & PROMO*

Untuk informasi diskon terbaru dan kode promo, silakan informasikan ke admin ya kak! 

Admin akan berikan informasi:
💸 Diskon khusus yang sedang berlaku
🎫 Kode kupon promo
📦 Paket bundling hemat
🎁 Promo spesial lainnya

Ditunggu ya kak, admin siap bantu! 😊`
    },

    // Kata-kata umum
    'harga': { text: 'Untuk info harga detail, admin akan segera membalas ya kak! Atau bisa ketik nomor pilihan (1-8) untuk info paket spesifik 😊' },
    'daftar': { text: 'Silakan ketik "DAFTAR [nomor]" ya kak, contoh: "DAFTAR 1" untuk mendaftar TO TPA TBI Tubel 😊' },
    'cara daftar': { text: 'Cara daftar:\n1. Pilih program (ketik angka 1-8)\n2. Ketik "DAFTAR [nomor]" \n3. Admin akan follow up untuk proses selanjutnya 😊' },
    'terima kasih': { text: 'Sama-sama kak! Semoga membantu 😊🙏' },
    'thanks': { text: 'You\'re welcome kak! 😊' },
    'ok': { text: 'Siap kak! Ada yang bisa dibantu lagi? 😊' },
    'oke': { text: 'Siap kak! Ada yang bisa dibantu lagi? 😊' },
};

// Pesan default jika tidak ada keyword yang match
const defaultReply = {
    text: `Terima kasih pesannya kak! 😊

Saat ini admin sedang tidak tersedia. Pesan akan dibalas maksimal 10 menit ya!

Apabila lebih dari 1 jam tidak dijawab, mohon re-chat ya kak 🙏

Atau ketik "INFO" untuk melihat daftar program kami.

Chat Operational Hours : 10.00-22.00 WIB`
};

// Daftar nomor yang TIDAK akan dibalas otomatis
const excludedNumbers = [
    // '628123456789@s.whatsapp.net',
];

// ===== FUNGSI HELPER =====

function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function simulateTyping(sock, jid) {
    try {
        await sock.presenceSubscribe(jid);
        await sock.sendPresenceUpdate('composing', jid);
        await delay(CONFIG.typingDuration);
        await sock.sendPresenceUpdate('paused', jid);
    } catch (error) {
        console.log('⚠️  Typing simulation error (non-critical)');
    }
}

function isRateLimited() {
    const now = Date.now();
    messageTracker.messagesInLastMinute = messageTracker.messagesInLastMinute.filter(
        time => now - time < 60000
    );
    if (messageTracker.messagesInLastMinute.length >= CONFIG.maxMessagesPerMinute) {
        return true;
    }
    return false;
}

function isUserOnCooldown(userId) {
    const now = Date.now();
    const lastTime = messageTracker.lastMessageTime[userId];
    if (lastTime && (now - lastTime) < CONFIG.userCooldown) {
        return true;
    }
    return false;
}

function updateTracking(userId) {
    const now = Date.now();
    messageTracker.lastMessageTime[userId] = now;
    messageTracker.messagesInLastMinute.push(now);
}

// Fungsi untuk mengirim pesan dengan gambar, file, atau teks
async function sendReply(sock, jid, reply) {
    try {
        // Random delay sebelum mulai "mengetik"
        const initialDelay = getRandomDelay(CONFIG.minReplyDelay, CONFIG.maxReplyDelay);
        console.log(`⏳ Menunggu ${initialDelay}ms sebelum membalas...`);
        await delay(initialDelay);
        
        // Simulasi typing
        console.log('✍️  Typing...');
        await simulateTyping(sock, jid);

        // Jika ada file (PDF, DOCX, dll) yang harus dikirim
        if (reply.file) {
            const filePath = path.join(__dirname, reply.file);
            
            if (fs.existsSync(filePath)) {
                // Kirim teks dulu
                await sock.sendMessage(jid, { text: reply.text });
                
                // Kemudian kirim file sebagai dokumen
                const fileBuffer = fs.readFileSync(filePath);
                await sock.sendMessage(jid, {
                    document: fileBuffer,
                    fileName: reply.fileName || reply.file,
                    mimetype: 'application/pdf'
                });
                console.log(`📄 File terkirim: ${reply.file}`);
            } else {
                console.log(`⚠️ File tidak ditemukan: ${filePath}`);
                await sock.sendMessage(jid, { 
                    text: reply.text + '\n\n⚠️ (Maaf kak, file sementara tidak tersedia)' 
                });
            }
        }
        // Jika ada gambar yang harus dikirim
        else if (reply.image) {
            const imagePath = path.join(__dirname, reply.image);
            
            if (fs.existsSync(imagePath)) {
                const imageBuffer = fs.readFileSync(imagePath);
                await sock.sendMessage(jid, {
                    image: imageBuffer,
                    caption: reply.text
                });
                console.log(`📸 Gambar terkirim: ${reply.image}`);
            } else {
                console.log(`⚠️ Gambar tidak ditemukan: ${imagePath}`);
                await sock.sendMessage(jid, { text: reply.text });
            }
        } 
        // Kirim hanya teks
        else {
            await sock.sendMessage(jid, { text: reply.text });
        }

        return true;
    } catch (error) {
        console.error('❌ Error mengirim reply:', error);
        return false;
    }
}

// ===== BOT UTAMA =====

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        logger: Pino({ level: 'silent' }),
        auth: state,
        browser: ['Aorta Bot', 'Chrome', '1.0.0'],
        version,
        markOnlineOnConnect: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.log('\n📱 Scan QR Code di bawah ini:\n');
            qrcode.generate(qr, { small: true });
            console.log('\nBuka WhatsApp > Linked Devices > Link a Device');
        }

        if (connection === 'open') {
            console.log('\n✅ Bot WhatsApp sudah aktif dan siap menjawab pesan!\n');
            console.log('📱 Bot akan berjalan di background');
            console.log('📸 Bot dapat mengirim gambar otomatis');
            console.log('📄 Bot dapat mengirim file PDF otomatis');
            console.log('🛡️  Fitur keamanan: Delay & typing simulation aktif\n');
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = reason !== DisconnectReason.loggedOut;
            
            console.log('❌ Terputus:', reason);
            
            if (shouldReconnect) {
                console.log('🔄 Mencoba reconnect dalam 5 detik...');
                setTimeout(() => startBot(), 5000);
            } else {
                console.log('⚠️ Logged out. Hapus folder auth_info dan restart bot.');
            }
        }
    });

    // ===== LISTENER PESAN =====

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;
        if (msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const userId = from.split('@')[0];

        // Skip jika dari nomor yang dikecualikan
        if (excludedNumbers.includes(from)) return;

        // Skip jika pesan dari grup
        if (from.endsWith('@g.us')) return;

        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text;

        if (!text) return;

        const messageText = text.toLowerCase().trim();

        console.log(`\n📨 [${new Date().toLocaleString('id-ID')}] Pesan dari ${userId}`);
        console.log(`💬 "${text}"`);

        // ===== RATE LIMITING =====
        
        if (isRateLimited()) {
            console.log('⚠️  Rate limit tercapai! Menunggu sebelum membalas...');
            await delay(10000);
        }

        if (isUserOnCooldown(userId)) {
            console.log(`⏸️  User ${userId} on cooldown, skip balasan`);
            return;
        }

        // ===== CARI REPLY YANG COCOK =====
        
        let reply = null;
        
        // Cek exact match dulu
        if (autoReplies[messageText]) {
            reply = autoReplies[messageText];
        } else {
            // Kalau tidak exact match, cek pakai includes
            for (const [keyword, replyData] of Object.entries(autoReplies)) {
                if (messageText.includes(keyword.toLowerCase())) {
                    reply = replyData;
                    break;
                }
            }
        }

        // Jika tidak ada keyword yang match, gunakan default reply
        if (!reply) {
            reply = defaultReply;
        }

        // Kirim balasan
        const success = await sendReply(sock, from, reply);

        if (success) {
            console.log(`✅ Dibalas dengan: "${reply.text.substring(0, 50)}..."\n`);
            updateTracking(userId);
        } else {
            console.log(`❌ Gagal kirim ke ${userId}\n`);
        }
    });
}

// ===== GRACEFUL SHUTDOWN =====
async function gracefulShutdown() {
    console.log('\n⏸️  Menghentikan bot dengan aman...');
    
    if (sock) {
        try {
            await sock.logout();
            console.log('✅ Bot berhasil logout');
        } catch (error) {
            console.log('⚠️  Logout error (normal jika sudah disconnect)');
        }
    }
    
    console.log('👋 Bot dihentikan. Sampai jumpa!');
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// ===== START BOT =====
console.log('🚀 Starting Aorta Bot...');
console.log('🛡️  Fitur keamanan aktif:');
console.log(`   - Delay balasan: ${CONFIG.minReplyDelay}-${CONFIG.maxReplyDelay}ms`);
console.log(`   - Typing simulation: ${CONFIG.typingDuration}ms`);
console.log(`   - Max pesan/menit: ${CONFIG.maxMessagesPerMinute}`);
console.log(`   - Cooldown per user: ${CONFIG.userCooldown}ms\n`);

startBot().catch(err => {
    console.error('❌ Error starting bot:', err);
});