//tes
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
    userCooldown: 5000,
};

// ===== TRACKING LIVE AGENT =====
const liveAgentSessions = new Map(); // Menyimpan user yang sedang dalam mode live agent

// Tracking untuk rate limiting
const messageTracker = {
    lastMessageTime: {},
    messagesInLastMinute: []
};

// ===== KONFIGURASI AUTO REPLY =====

const welcomeMessage = `[Chat Otomatis] 
Halo kak 👋
Info bertanya tentang apa?

1️⃣ Persiapan TUBEL
2️⃣ Kelas UPKP Kemenkeu
3️⃣ SPMB reguler
4️⃣ Persiapan S2 / LPDP
5️⃣ UPKP kementerian lain / TOEFL / STIS
6️⃣ Garansi Uang Kembali
7️⃣ Hubungi Live Agent / Admin

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
    'nanya': { text: welcomeMessage },
    'ada': { text: welcomeMessage },
    'apakah': { text: welcomeMessage },
    'gimana': { text: welcomeMessage },
    'tes': { text: welcomeMessage },
    'berapa': { text: welcomeMessage },
    'dimana': { text: welcomeMessage },
    'daftar': { text: welcomeMessage },
    'bisa': { text: welcomeMessage },
    'kelas': { text: welcomeMessage },
    'rencana': { text: welcomeMessage },
    'kapan': { text: welcomeMessage },
    
    // Opsi Live Agent - Opsi 7
    '7': {
        text: `👨‍💼 *LIVE AGENT MODE*

Baik kak, saya akan menghubungkan Anda dengan admin kami.

✅ *Status:* Mode chat otomatis DINONAKTIFKAN
✅ *Aksi:* Admin akan segera membalas chat Anda

Silakan tunggu sebentar, admin kami akan segera merespons ya! 😊

Atau Anda bisa langsung mengetik pertanyaan/pesan Anda sekarang.

_Catatan: Untuk kembali ke menu otomatis, ketik "MENU"_`,
        activateLiveAgent: true
    },

    'live agent': {
        text: `👨‍💼 *LIVE AGENT MODE*

Baik kak, saya akan menghubungkan Anda dengan admin kami.

✅ *Status:* Mode chat otomatis DINONAKTIFKAN
✅ *Aksi:* Admin akan segera membalas chat Anda

Silakan tunggu sebentar, admin kami akan segera merespons ya! 😊

Atau Anda bisa langsung mengetik pertanyaan/pesan Anda sekarang.

_Catatan: Untuk kembali ke menu otomatis, ketik "MENU"_`,
        activateLiveAgent: true
    },

    'hubungi admin': {
        text: `👨‍💼 *LIVE AGENT MODE*

Baik kak, saya akan menghubungkan Anda dengan admin kami.

✅ *Status:* Mode chat otomatis DINONAKTIFKAN
✅ *Aksi:* Admin akan segera membalas chat Anda

Silakan tunggu sebentar, admin kami akan segera merespons ya! 😊

Atau Anda bisa langsung mengetik pertanyaan/pesan Anda sekarang.

_Catatan: Untuk kembali ke menu otomatis, ketik "MENU"_`,
        activateLiveAgent: true
    },

    'agent': {
        text: `👨‍💼 *LIVE AGENT MODE*

Baik kak, saya akan menghubungkan Anda dengan admin kami.

✅ *Status:* Mode chat otomatis DINONAKTIFKAN
✅ *Aksi:* Admin akan segera membalas chat Anda

Silakan tunggu sebentar, admin kami akan segera merespons ya! 😊

Atau Anda bisa langsung mengetik pertanyaan/pesan Anda sekarang.

_Catatan: Untuk kembali ke menu otomatis, ketik "MENU"_`,
        activateLiveAgent: true
    },

    'bicara dengan admin': {
        text: `👨‍💼 *LIVE AGENT MODE*

Baik kak, saya akan menghubungkan Anda dengan admin kami.

✅ *Status:* Mode chat otomatis DINONAKTIFKAN
✅ *Aksi:* Admin akan segera membalas chat Anda

Silakan tunggu sebentar, admin kami akan segera merespons ya! 😊

Atau Anda bisa langsung mengetik pertanyaan/pesan Anda sekarang.

_Catatan: Untuk kembali ke menu otomatis, ketik "MENU"_`,
        activateLiveAgent: true
    },

    'admin': {
        text: `👨‍💼 *LIVE AGENT MODE*

Baik kak, saya akan menghubungkan Anda dengan admin kami.

✅ *Status:* Mode chat otomatis DINONAKTIFKAN
✅ *Aksi:* Admin akan segera membalas chat Anda

Silakan tunggu sebentar, admin kami akan segera merespons ya! 😊

Atau Anda bisa langsung mengetik pertanyaan/pesan Anda sekarang.

_Catatan: Untuk kembali ke menu otomatis, ketik "MENU"_`,
        activateLiveAgent: true
    },

    // Kembali ke menu
    'menu': {
        text: welcomeMessage,
        deactivateLiveAgent: true
    },

    'kembali': {
        text: welcomeMessage,
        deactivateLiveAgent: true
    },

    'back': {
        text: welcomeMessage,
        deactivateLiveAgent: true
    },
    
    // Try Out - Opsi 1
    '1': { 
        text: `✅ *Persiapan Tubel*

📋 *Deskripsi:*

Untuk saat ini kelas Tugas Belajar (TUBEL) masih dalam tahap persiapan. InsyaAllah akan dimulai dengan sesi warm up seperti Try Out gratis dan trial class. Informasi lengkap akan diumumkan melalui grup dan media resmi kami(@aortatubelupkp).

📦 *Paket Include:*
- Soal-soal TPA sesuai standar Tubel
- Soal-soal TBI sesuai standar Tubel
- Pembahasan lengkap
- Sistem penilaaan otomatis

💰 *Harga:* [Hubungi admin untuk info harga]
⏰ *Durasi:* [Sesuai paket]`
    },

    // Try Out - Opsi 2
    '2': { 
        text: `✅ *Kelas UPKP Kemenkeu*

📋 *Deskripsi:*
Kelas persiapan UPKP Kemenkeu direncanakan mulai dibuka pada bulan Februari. Open registrasi akan diinformasikan secara resmi melalui grup dan media resmi kami(@aortatubelupkp).

📦 *Paket Include:*
- Soal-soal sesuai kisi-kisi UPKP Kemenkeu
- Materi CAT (Computer Assisted Test)
- Pembahasan detail
- Simulasi ujian sebenarnya

💰 *Harga:* [Hubungi admin untuk info harga]
⏰ *Durasi:* [Sesuai paket]`
    },

    // Try Out - Opsi 3
    '3': { 
        text: `✅ *SPMB Reguler*

📋 *Deskripsi:*
Untuk SPMB reguler saat ini kami hanya menyediakan paket Try Out (TO). Belum tersedia kelas intensif.`
    },

    // Try Out - Opsi 4
    '4': { 
        text: `✅ *Persiapan S2 / LPDP*

Saat ini kelas persiapan Beasiswa Dalam Negeri maupun Luar Negeri masih dalam tahap pengembangan. InsyaAllah akan tersedia ke depannya, mohon ditunggu ya kak.`
    },

    // Kelas - Opsi 5
    '5': { 
        text: `✅ *UPKP kementerian lain / TOEFL / STIS*

📋 *Deskripsi:*
Saat ini Aorta hanya melayani UPKP untuk Kemenkeu.
Untuk TOEFL dan kementerian lain masih dalam tahap pengembangan.
Untuk STIS tahun ini hanya tersedia paket Try Out (TO).`
    },

    // Garansi - Opsi 6
    '6': { 
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

    // Kata-kata umum
    'harga': { text: 'Untuk info harga detail, admin akan segera membalas ya kak! Atau bisa ketik nomor pilihan (1-7) untuk info paket spesifik 😊' },
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
Ketik "7" atau "LIVE AGENT" untuk berbicara langsung dengan admin.

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

// ===== FUNGSI LIVE AGENT =====

function isInLiveAgentMode(userId) {
    return liveAgentSessions.has(userId);
}

function activateLiveAgent(userId) {
    liveAgentSessions.set(userId, {
        activatedAt: Date.now(),
        lastActivity: Date.now()
    });
    console.log(`👨‍💼 Live Agent Mode ACTIVATED for user: ${userId}`);
}

function deactivateLiveAgent(userId) {
    liveAgentSessions.delete(userId);
    console.log(`🤖 Live Agent Mode DEACTIVATED for user: ${userId}`);
}

// Fungsi untuk auto-deactivate live agent setelah timeout (opsional)
function checkLiveAgentTimeout() {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30 menit
    
    for (const [userId, session] of liveAgentSessions.entries()) {
        if (now - session.lastActivity > timeout) {
            deactivateLiveAgent(userId);
            console.log(`⏰ Live Agent session expired for user: ${userId}`);
        }
    }
}

// Jalankan check timeout setiap 5 menit
setInterval(checkLiveAgentTimeout, 5 * 60 * 1000);

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
            console.log('👨‍💼 FITUR: Live Agent Mode tersedia!');
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

        // ===== CEK LIVE AGENT MODE =====
        
        if (isInLiveAgentMode(userId)) {
            console.log(`👨‍💼 User ${userId} sedang dalam Live Agent Mode`);
            
            // Update last activity
            const session = liveAgentSessions.get(userId);
            session.lastActivity = Date.now();
            
            // Cek apakah user ingin kembali ke menu
            if (messageText === 'menu' || messageText === 'kembali' || messageText === 'back') {
                const reply = autoReplies[messageText];
                await sendReply(sock, from, reply);
                deactivateLiveAgent(userId);
                updateTracking(userId);
            } else {
                // TIDAK kirim auto-reply, biarkan admin yang membalas
                console.log(`⏸️  Auto-reply DINONAKTIFKAN - menunggu admin untuk membalas`);
            }
            
            return; // Keluar dari fungsi, tidak lanjut ke auto-reply
        }

        // ===== RATE LIMITING (hanya untuk auto-reply) =====
        
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

        // ===== CEK APAKAH PERLU AKTIVASI LIVE AGENT =====
        
        if (reply.activateLiveAgent) {
            activateLiveAgent(userId);
        }

        if (reply.deactivateLiveAgent) {
            deactivateLiveAgent(userId);
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
console.log('🚀 Starting Aorta Bot with Live Agent Feature...');
console.log('🛡️  Fitur keamanan aktif:');
console.log(`   - Delay balasan: ${CONFIG.minReplyDelay}-${CONFIG.maxReplyDelay}ms`);
console.log(`   - Typing simulation: ${CONFIG.typingDuration}ms`);
console.log(`   - Max pesan/menit: ${CONFIG.maxMessagesPerMinute}`);
console.log(`   - Cooldown per user: ${CONFIG.userCooldown}ms`);
console.log('👨‍💼 FITUR: Live Agent Mode');
console.log('   - Ketik "7" atau "LIVE AGENT" untuk aktivasi');
console.log('   - Ketik "MENU" untuk kembali ke auto-reply\n');

startBot().catch(err => {
    console.error('❌ Error starting bot:', err);

});

