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

// ===== ES MODULE SETUP =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sock;

// ===== KONFIGURASI =====
const CONFIG = {
    minReplyDelay: 2000,
    maxReplyDelay: 5000,
    typingDuration: 3000,
    maxMessagesPerMinute: 10,
    userCooldown: 5000,
    liveAgentTimeout: 30 * 60 * 1000, // 30 menit
};

// ===== STATE TYPES =====
const STATE = {
    MAIN_MENU: 'MAIN_MENU',
    UPKP_MENU: 'UPKP_MENU',
    TUBEL_MENU: 'TUBEL_MENU',
    SPMB_MENU: 'SPMB_MENU',
    S2_MENU: 'S2_MENU',
    OTHER_MENU: 'OTHER_MENU',
};

// ===== USER STATE MANAGEMENT =====
const userStates = new Map(); // { userId: { state: STATE.MAIN_MENU, lastActivity: timestamp } }
const liveAgentSessions = new Map(); // Live agent tracking

// ===== RATE LIMITING =====
const messageTracker = {
    lastMessageTime: {},
    messagesInLastMinute: []
};

// ===== NOMOR YANG DIKECUALIKAN =====
const excludedNumbers = [
    // '628123456789@s.whatsapp.net',
];

// ===================================================
// ===== MENU CONTENT DEFINITIONS =====
// ===================================================

const MENUS = {
    // ===== MAIN MENU =====
    MAIN: `[Chat Otomatis] 
Halo kak 👋
Info bertanya tentang apa?

[TB] Persiapan TUBEL
[UP] Kelas UPKP Kemenkeu
[SM] SPMB reguler
[S2] Persiapan S2 / LPDP
[OT] UPKP kementerian lain / TOEFL / STIS
[GR] Garansi Uang Kembali
[LA] Hubungi Live Agent / Admin

Ditunggu maksimal 10menit ya kak 😁 
Apabila lebih dari 1 jam tidak dijawab mohon re-chat

Chat Operational Hours : 10.00-22.00 WIB`,

    // ===== SUBMENU: TUBEL =====
    TUBEL: `✅ *Persiapan TUBEL*

Pilih informasi yang ingin kamu ketahui:

[TB1] Deskripsi Program
[TB2] Paket Include
[TB3] Harga & Durasi
[TB4] Cara Daftar

Ketik *MENU* untuk kembali ke menu utama`,

    // ===== SUBMENU: UPKP =====
    UPKP: `✅ *Kelas UPKP Kemenkeu*

Pilih informasi yang ingin kamu ketahui:

[UP1] Deskripsi Program
[UP2] Jadwal & Pendaftaran
[UP3] Paket Include
[UP4] Harga & Durasi
[UP5] Cara Daftar

Ketik *MENU* untuk kembali ke menu utama`,

    // ===== SUBMENU: SPMB =====
    SPMB: `✅ *SPMB Reguler*

Pilih informasi yang ingin kamu ketahui:

[SM1] Info Program
[SM2] Paket Try Out

Ketik *MENU* untuk kembali ke menu utama`,

    // ===== SUBMENU: S2/LPDP =====
    S2: `✅ *Persiapan S2 / LPDP*

Pilih informasi yang ingin kamu ketahui:

[S21] Status Program

Ketik *MENU* untuk kembali ke menu utama`,

    // ===== SUBMENU: UPKP LAIN =====
    OTHER: `✅ *UPKP Lain / TOEFL / STIS*

Pilih informasi yang ingin kamu ketahui:

[OT1] UPKP Kementerian Lain
[OT2] TOEFL
[OT3] STIS

Ketik *MENU* untuk kembali ke menu utama`,
};

// ===== CONTENT RESPONSES =====
const CONTENT = {
    // ----- TUBEL CONTENT -----
    TB1: {
        text: `📋 *Deskripsi Program TUBEL*

Untuk saat ini kelas Tugas Belajar (TUBEL) masih dalam tahap persiapan. 

InsyaAllah akan dimulai dengan sesi warm up seperti:
• Try Out gratis
• Trial class

Informasi lengkap akan diumumkan melalui grup dan media resmi kami (@aortatubelupkp).

Ketik *MENU* untuk kembali`
    },

    TB2: {
        text: `📦 *Paket Include TUBEL*

✅ Soal-soal TPA sesuai standar Tubel
✅ Soal-soal TBI sesuai standar Tubel
✅ Pembahasan lengkap
✅ Sistem penilaian otomatis

Ketik *MENU* untuk kembali`
    },

    TB3: {
        text: `💰 *Harga & Durasi TUBEL*

Harga: Soon! Akan rilis dalam waktu dekat
Durasi: [Sesuai paket]

Untuk info lebih lanjut, hubungi admin dengan ketik *LA*

Ketik *MENU* untuk kembali`
    },

    TB4: {
        text: `📝 *Cara Daftar Kelas TUBEL*

1️⃣ Buat akun & login di website
   🌐 https://www.aorta-edu.com

2️⃣ Pilih menu Kelas ▶ TUBEL

3️⃣ Pilih paket kelas

4️⃣ Klik Beli Sekarang

5️⃣ Apply kupon (jika ada)

6️⃣ Lanjutkan pembayaran

📌 Akses kelas otomatis setelah pembayaran berhasil

Ketik *MENU* untuk kembali`
    },

    // ----- UPKP CONTENT -----
    UP1: {
        text: `📋 *Deskripsi Program UPKP Kemenkeu*

Kelas persiapan khusus untuk UPKP Kemenkeu dengan materi yang disesuaikan dengan kisi-kisi terbaru.

Program meliputi:
• Tes Potensi
• TSKKWK (Tes Substansi Keuangan, Kepemerintahan, dan Wawasan Kebangsaan)
• Psikotes

Ketik *MENU* untuk kembali`
    },

    UP2: {
        text: `📅 *Jadwal & Pendaftaran UPKP*

Kelas UPKP Kemenkeu direncanakan mulai dibuka pada bulan *Februari*.

Open registrasi akan diinformasikan secara resmi melalui:
• Grup resmi
• Instagram @aortatubelupkp

Ketik *MENU* untuk kembali`
    },

    UP3: {
        text: `📦 *Paket Include UPKP*

✅ Soal-soal sesuai kisi-kisi UPKP Kemenkeu
✅ Materi CAT (Computer Assisted Test)
✅ Pembahasan detail
✅ Simulasi ujian sebenarnya
✅ Akses rekaman kelas

Ketik *MENU* untuk kembali`
    },

    UP4: {
        text: `💰 *Harga & Durasi UPKP*

Harga: Soon! Akan rilis dalam waktu dekat
Durasi: [Sesuai paket yang dipilih]

Untuk info lebih lanjut, hubungi admin dengan ketik *LA*

Ketik *MENU* untuk kembali`
    },

    UP5: {
        text: `📝 *Cara Daftar Kelas UPKP*

1️⃣ Buat akun & login di website
   🌐 https://www.aorta-edu.com

2️⃣ Pilih menu Kelas ▶ UPKP

3️⃣ Pilih paket kelas

4️⃣ Klik Beli Sekarang

5️⃣ Apply kupon (jika ada)

6️⃣ Lanjutkan pembayaran

📌 Akses kelas otomatis setelah pembayaran berhasil

Ketik *MENU* untuk kembali`
    },

    // ----- SPMB CONTENT -----
    SM1: {
        text: `📋 *Info Program SPMB Reguler*

Untuk SPMB reguler saat ini kami hanya menyediakan paket Try Out (TO).

Belum tersedia kelas intensif.

Ketik *MENU* untuk kembali`
    },

    SM2: {
        text: `📝 *SPMB Reguler*

📋 *Deskripsi:*
Untuk SPMB reguler saat ini kami hanya menyediakan paket Try Out (TO). Belum tersedia kelas intensif.

Untuk info lebih lanjut, hubungi admin dengan ketik *LA*

Ketik *MENU* untuk kembali`
    },

    // ----- S2/LPDP CONTENT -----
    S21: {
        text: `📋 *Status Program S2 / LPDP*

Saat ini kelas persiapan Beasiswa Dalam Negeri maupun Luar Negeri masih dalam tahap pengembangan.

InsyaAllah akan tersedia ke depannya, mohon ditunggu ya kak 🙏

Ketik *MENU* untuk kembali`
    },

    // ----- UPKP LAIN / TOEFL / STIS -----
    OT1: {
        text: `📋 *UPKP Kementerian Lain*

Saat ini Aorta hanya melayani UPKP untuk Kemenkeu.

Untuk kementerian lain masih dalam tahap pengembangan.

Ketik *MENU* untuk kembali`
    },

    OT2: {
        text: `📋 *Program TOEFL*

Program persiapan TOEFL masih dalam tahap pengembangan.

InsyaAllah akan tersedia segera.

Ketik *MENU* untuk kembali`
    },

    OT3: {
        text: `📋 *Program STIS*

Untuk STIS tahun ini hanya tersedia paket Try Out (TO).

Belum ada kelas intensif.

Ketik *MENU* untuk kembali`
    },

    // ----- GARANSI -----
    GARANSI: {
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

📲 Ada pertanyaan lain? Ketik *MENU* atau hubungi admin dengan ketik *7* 😊`
    },

    // ----- LIVE AGENT -----
    LIVE_AGENT: {
        text: `👨‍💼 *LIVE AGENT MODE*

Baik kak, saya akan menghubungkan Anda dengan admin kami.

✅ *Status:* Mode chat otomatis DINONAKTIFKAN
✅ *Aksi:* Admin akan segera membalas chat Anda

Silakan tunggu sebentar, admin kami akan segera merespons ya! 😊

Atau Anda bisa langsung mengetik pertanyaan/pesan Anda sekarang.

_Catatan: Untuk kembali ke menu otomatis, ketik "MENU"_`,
        activateLiveAgent: true
    },
};

// ===== DEFAULT FALLBACK =====
const FALLBACK = {
    text: `Maaf kak, saya tidak mengerti perintah tersebut 😅

Silakan pilih menu di bawah ini:

[TB] Persiapan TUBEL
[UP] Kelas UPKP Kemenkeu
[SM] SPMB reguler
[S2] Persiapan S2 / LPDP
[OT] UPKP kementerian lain / TOEFL / STIS
[GR] Garansi Uang Kembali
[LA] Hubungi Live Agent / Admin

Atau ketik *MENU* untuk melihat opsi lengkap 😊`
};

// ===================================================
// ===== STATE MANAGEMENT FUNCTIONS =====
// ===================================================

function getUserState(userId) {
    if (!userStates.has(userId)) {
        userStates.set(userId, {
            state: STATE.MAIN_MENU,
            lastActivity: Date.now()
        });
    }
    return userStates.get(userId);
}

function setUserState(userId, newState) {
    userStates.set(userId, {
        state: newState,
        lastActivity: Date.now()
    });
    console.log(`🔄 State changed for ${userId}: ${newState}`);
}

function resetUserState(userId) {
    setUserState(userId, STATE.MAIN_MENU);
}

// ===================================================
// ===== MESSAGE ROUTING LOGIC =====
// ===================================================

function routeMessage(userId, messageText) {
    const userState = getUserState(userId);
    const input = messageText.toLowerCase().trim();

    // ===== GLOBAL COMMANDS (work from any state) =====
    
    // Reset ke main menu
    if (input === 'menu' || input === 'kembali' || input === 'back') {
        resetUserState(userId);
        return { text: MENUS.MAIN, deactivateLiveAgent: true };
    }

    // Garansi (bisa diakses dari mana saja)
    if (input === 'gr' || input.includes('garansi')) {
        return CONTENT.GARANSI;
    }

    // Live Agent (bisa diakses dari mana saja)
    if (input === 'la' || input === 'live agent' || input === 'agent' || 
        input === 'admin' || input.includes('hubungi admin') || 
        input.includes('bicara dengan admin')) {
        return CONTENT.LIVE_AGENT;
    }

    // ===== GREETING KEYWORDS → Always redirect to MAIN MENU =====
    const greetings = ['halo', 'hai', 'hallo', 'hello', 'info', 'p', 'pagi', 
                       'siang', 'sore', 'malam', 'nanya', 'ada', 'apakah', 
                       'gimana', 'tes', 'berapa', 'dimana', 'daftar', 
                       'kelas', 'rencana', 'kapan'];
    
    if (greetings.includes(input)) {
        resetUserState(userId);
        return { text: MENUS.MAIN };
    }

    // ===== STATE-BASED ROUTING =====

    switch (userState.state) {
        case STATE.MAIN_MENU:
            return handleMainMenu(userId, input);
        
        case STATE.TUBEL_MENU:
            return handleTubelMenu(userId, input);
        
        case STATE.UPKP_MENU:
            return handleUpkpMenu(userId, input);
        
        case STATE.SPMB_MENU:
            return handleSpmbMenu(userId, input);
        
        case STATE.S2_MENU:
            return handleS2Menu(userId, input);
        
        case STATE.OTHER_MENU:
            return handleOtherMenu(userId, input);
        
        default:
            resetUserState(userId);
            return FALLBACK;
    }
}

// ===== MAIN MENU HANDLER =====
function handleMainMenu(userId, input) {
    switch (input) {
        case 'tb':
            setUserState(userId, STATE.TUBEL_MENU);
            return { text: MENUS.TUBEL };
        
        case 'up':
            setUserState(userId, STATE.UPKP_MENU);
            return { text: MENUS.UPKP };
        
        case 'sm':
            setUserState(userId, STATE.SPMB_MENU);
            return { text: MENUS.SPMB };
        
        case 's2':
            setUserState(userId, STATE.S2_MENU);
            return { text: MENUS.S2 };
        
        case 'ot':
            setUserState(userId, STATE.OTHER_MENU);
            return { text: MENUS.OTHER };
        
        case 'gr':
            // Garansi bisa langsung tampil tanpa ganti state
            return CONTENT.GARANSI;
        
        case 'la':
            // Live Agent
            return CONTENT.LIVE_AGENT;
        
        default:
            // Fallback: tidak mengerti, tampilkan ulang menu
            return FALLBACK;
    }
}

// ===== TUBEL SUBMENU HANDLER =====
function handleTubelMenu(userId, input) {
    switch (input) {
        case 'tb1':
            return CONTENT.TB1;
        case 'tb2':
            return CONTENT.TB2;
        case 'tb3':
            return CONTENT.TB3;
        case 'tb4':
            return CONTENT.TB4
        default:
            // Tidak valid, tampilkan ulang submenu TUBEL
            return { text: MENUS.TUBEL };
    }
}

// ===== UPKP SUBMENU HANDLER =====
function handleUpkpMenu(userId, input) {
    switch (input) {
        case 'up1':
            return CONTENT.UP1;
        case 'up2':
            return CONTENT.UP2;
        case 'up3':
            return CONTENT.UP3;
        case 'up4':
            return CONTENT.UP4;
        case 'up5':
            return CONTENT.UP5;
        default:
            // Tidak valid, tampilkan ulang submenu UPKP
            return { text: MENUS.UPKP };
    }
}

// ===== SPMB SUBMENU HANDLER =====
function handleSpmbMenu(userId, input) {
    switch (input) {
        case 'sm1':
            return CONTENT.SM1;
        case 'sm2':
            return CONTENT.SM2;
        default:
            return { text: MENUS.SPMB };
    }
}

// ===== S2/LPDP SUBMENU HANDLER =====
function handleS2Menu(userId, input) {
    switch (input) {
        case 's21':
            return CONTENT.S21;
        default:
            return { text: MENUS.S2 };
    }
}

// ===== OTHER (UPKP LAIN) SUBMENU HANDLER =====
function handleOtherMenu(userId, input) {
    switch (input) {
        case 'ot1':
            return CONTENT.OT1;
        case 'ot2':
            return CONTENT.OT2;
        case 'ot3':
            return CONTENT.OT3;
        default:
            return { text: MENUS.OTHER };
    }
}

// ===================================================
// ===== LIVE AGENT MANAGEMENT =====
// ===================================================

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

function checkLiveAgentTimeout() {
    const now = Date.now();
    
    for (const [userId, session] of liveAgentSessions.entries()) {
        if (now - session.lastActivity > CONFIG.liveAgentTimeout) {
            deactivateLiveAgent(userId);
            console.log(`⏰ Live Agent session expired for user: ${userId}`);
        }
    }
}

// Auto-check timeout setiap 5 menit
setInterval(checkLiveAgentTimeout, 5 * 60 * 1000);

// ===================================================
// ===== HELPER FUNCTIONS =====
// ===================================================

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
    return messageTracker.messagesInLastMinute.length >= CONFIG.maxMessagesPerMinute;
}

function isUserOnCooldown(userId) {
    const now = Date.now();
    const lastTime = messageTracker.lastMessageTime[userId];
    return lastTime && (now - lastTime) < CONFIG.userCooldown;
}

function updateTracking(userId) {
    const now = Date.now();
    messageTracker.lastMessageTime[userId] = now;
    messageTracker.messagesInLastMinute.push(now);
}

// ===== SEND REPLY WITH MEDIA SUPPORT =====
async function sendReply(sock, jid, reply) {
    try {
        const initialDelay = getRandomDelay(CONFIG.minReplyDelay, CONFIG.maxReplyDelay);
        console.log(`⏳ Menunggu ${initialDelay}ms sebelum membalas...`);
        await delay(initialDelay);
        
        console.log('✍️  Typing...');
        await simulateTyping(sock, jid);

        // Tambahkan cooldown reminder ke teks
        const cooldownSeconds = Math.ceil(CONFIG.userCooldown / 1000);
        const replyText = reply.text + `\n\n_⏳ Mohon tunggu ${cooldownSeconds} detik sebelum chat berikutnya_`;

        // Support untuk file
        if (reply.file) {
            const filePath = path.join(__dirname, reply.file);
            
            if (fs.existsSync(filePath)) {
                await sock.sendMessage(jid, { text: replyText });
                
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
                    text: replyText + '\n\n⚠️ (Maaf kak, file sementara tidak tersedia)' 
                });
            }
        }
        // Support untuk gambar
        else if (reply.image) {
            const imagePath = path.join(__dirname, reply.image);
            
            if (fs.existsSync(imagePath)) {
                const imageBuffer = fs.readFileSync(imagePath);
                await sock.sendMessage(jid, {
                    image: imageBuffer,
                    caption: replyText
                });
                console.log(`📸 Gambar terkirim: ${reply.image}`);
            } else {
                console.log(`⚠️ Gambar tidak ditemukan: ${imagePath}`);
                await sock.sendMessage(jid, { text: replyText });
            }
        } 
        // Kirim text saja
        else {
            await sock.sendMessage(jid, { text: replyText });
        }

        return true;
    } catch (error) {
        console.error('❌ Error mengirim reply:', error);
        return false;
    }
}

// ===================================================
// ===== BOT INITIALIZATION =====
// ===================================================

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        logger: Pino({ level: 'silent' }),
        auth: state,
        browser: ['Aorta Bot v2', 'Chrome', '2.0.0'],
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
            console.log('\n✅ Bot WhatsApp v2.0 sudah aktif!\n');
            console.log('🎯 Fitur Baru:');
            console.log('   ✓ Context/State Management');
            console.log('   ✓ Kode Menu Unik (UP, TB, SM, dll)');
            console.log('   ✓ Smart Fallback');
            console.log('   ✓ Live Agent Mode');
            console.log('   ✓ Anti-Keyword Collision\n');
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

    // ===== MESSAGE LISTENER =====
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;
        if (msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const userId = from.split('@')[0];

        // Skip excluded numbers
        if (excludedNumbers.includes(from)) return;

        // Skip group messages
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
            
            const session = liveAgentSessions.get(userId);
            session.lastActivity = Date.now();
            
            // Cek apakah user mau kembali ke menu
            if (messageText === 'menu' || messageText === 'kembali' || messageText === 'back') {
                const reply = routeMessage(userId, messageText);
                await sendReply(sock, from, reply);
                
                if (reply.deactivateLiveAgent) {
                    deactivateLiveAgent(userId);
                }
                
                updateTracking(userId);
            } else {
                console.log(`⏸️  Auto-reply DINONAKTIFKAN - menunggu admin`);
            }
            
            return;
        }

        // ===== RATE LIMITING =====
        if (isRateLimited()) {
            console.log('⚠️  Rate limit tercapai! Menunggu...');
            await delay(10000);
        }

        if (isUserOnCooldown(userId)) {
            console.log(`⏸️  User ${userId} on cooldown`);
            
            // Kirim notifikasi cooldown ke user
            const cooldownSeconds = Math.ceil(CONFIG.userCooldown / 1000);
            await sock.sendMessage(from, { 
                text: `⏳ Mohon tunggu ${cooldownSeconds} detik sebelum mengirim pesan berikutnya ya kak 😊` 
            });
            
            return;
        }

        // ===== ROUTE MESSAGE =====
        const reply = routeMessage(userId, messageText);

        // ===== HANDLE LIVE AGENT ACTIVATION/DEACTIVATION =====
        if (reply.activateLiveAgent) {
            activateLiveAgent(userId);
        }

        if (reply.deactivateLiveAgent) {
            deactivateLiveAgent(userId);
        }

        // ===== SEND REPLY =====
        const success = await sendReply(sock, from, reply);

        if (success) {
            console.log(`✅ Dibalas: "${reply.text.substring(0, 50)}..."\n`);
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
console.log('🚀 Starting Aorta Bot v2.0...');
console.log('🎯 Fitur:');
console.log('   ✓ Context/State Management (Map-based)');
console.log('   ✓ Unique Menu Codes (UP, TB, SM, S2, OT)');
console.log('   ✓ Smart Fallback System');
console.log('   ✓ Live Agent Mode');
console.log('   ✓ Zero Keyword Collision');
console.log('   ✓ Clean & Scalable Architecture\n');

startBot().catch(err => {
    console.error('❌ Error starting bot:', err);
});