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
    liveAgentTimeout: 30 * 60 * 1000, // 30 menit
    adminPauseDuration: 60 * 60 * 1000, // 1 jam pause jika admin chat duluan
};

// ===== STATE TYPES =====
const STATE = {
    MAIN_MENU: 'MAIN_MENU',
    UPKP_MENU: 'UPKP_MENU',
    TUBEL_MENU: 'TUBEL_MENU',
    SPMB_MENU: 'SPMB_MENU',
    S2_MENU: 'S2_MENU',
    OTHER_MENU: 'OTHER_MENU',
    TO_MENU: 'TO_GRATIS',
    TIMEOUT_MENU: 'TIMEOUT_MENU'
};

// ===== USER STATE MANAGEMENT =====
const userStates = new Map(); // { userId: { state: STATE.MAIN_MENU, lastActivity: timestamp } }
const liveAgentSessions = new Map(); // Live agent tracking
const adminPausedUsers = new Map(); // Track users paused by admin chat { userId: pauseUntil }
const conversationInitiators = new Map(); // Track who initiated the conversation { chatId: 'user' | 'admin' }

// ===== RATE LIMITING =====
const messageTracker = {
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

1. Persiapan TUBEL
2. Kelas UPKP Kemenkeu
3. SPMB reguler
4. Persiapan S2 / LPDP
5. UPKP kementerian lain / TOEFL / STIS
6. Garansi Uang Kembali
7. TO Gratis
8. Hubungi Live Agent / Admin

Ditunggu maksimal 10menit ya kak 😁 
Apabila lebih dari 1 jam tidak dijawab mohon re-chat

Chat Operational Hours : 10.00-22.00 WIB`,

    // ===== SUBMENU: TUBEL =====
    TUBEL: `✅ *Persiapan TUBEL*

Pilih informasi yang ingin kamu ketahui:

1. Deskripsi Program
2. Paket Include
3. Harga & Durasi
4. Cara Daftar
5. Hubungi Admin

Ketik *0* untuk kembali ke menu utama`,

    // ===== SUBMENU: UPKP =====
    UPKP: `✅ *Kelas UPKP Kemenkeu*

Pilih informasi yang ingin kamu ketahui:

1. Deskripsi Program
2. Jadwal & Pendaftaran
3. Paket Include
4. Harga & Durasi
5. Cara Daftar
6. Hubungi Admin

Ketik *0* untuk kembali ke menu utama`,

    // ===== SUBMENU: SPMB =====
    SPMB: `✅ *SPMB Reguler*

Pilih informasi yang ingin kamu ketahui:

1. Info Program
2. Paket Try Out
3. Hubungi Admin

Ketik *0* untuk kembali ke menu utama`,

    // ===== SUBMENU: S2/LPDP =====
    S2: `✅ *Persiapan S2 / LPDP*

Pilih informasi yang ingin kamu ketahui:

1. Status Program
2. Hubungi Admin

Ketik *0* untuk kembali ke menu utama`,

    // ===== SUBMENU: UPKP LAIN =====
    OTHER: `✅ *UPKP Lain / TOEFL / STIS*

Pilih informasi yang ingin kamu ketahui:

1. UPKP Kementerian Lain
2. TOEFL
3. STIS
4. Hubungi Admin

Ketik *0* untuk kembali ke menu utama`,


 // ===== SUBMENU: TO GRATIS =====
    TO_GRATIS: `✅ *TO_Gratis*

Pilih informasi yang ingin kamu ketahui:

1. Detail TO
2. Cara Daftar
3. Pelaksanaan
4. Hubungi Admin

Ketik *0* untuk kembali ke menu utama`,

};

// ===== CONTENT RESPONSES =====
const CONTENT = {
    // ----- TUBEL CONTENT -----
    TUBEL_1: {
        text: `📋 *Deskripsi Program TUBEL*

Untuk saat ini kelas Tugas Belajar (TUBEL) masih dalam tahap persiapan. 

InsyaAllah akan dimulai dengan sesi warm up seperti:
• Try Out gratis
• Trial class

Informasi lengkap akan diumumkan melalui grup dan media resmi kami (@aortatubelupkp).

Ketik *0* untuk kembali`
    },

    TUBEL_2: {
        text: `📦 *Paket Include TUBEL*

✅ Soal-soal TPA sesuai standar Tubel
✅ Soal-soal TBI sesuai standar Tubel
✅ Pembahasan lengkap
✅ Sistem penilaian otomatis

Ketik *0* untuk kembali`
    },

    TUBEL_3: {
        text: `💰 *Harga & Durasi TUBEL*

Harga: Soon! Akan rilis dalam waktu dekat
Durasi: [Sesuai paket]

Untuk info lebih lanjut, hubungi admin dengan ketik *5*

Ketik *0* untuk kembali`
    },

    TUBEL_4: {
        text: `📝 *Cara Daftar Kelas TUBEL*

1️⃣ Buat akun & login di website
   🌐 https://www.aorta-edu.com

2️⃣ Pilih menu Kelas ▶ TUBEL

3️⃣ Pilih paket kelas

4️⃣ Klik Beli Sekarang

5️⃣ Apply kupon (jika ada)

6️⃣ Lanjutkan pembayaran

📌 Akses kelas otomatis setelah pembayaran berhasil

Ketik *0* untuk kembali`
    },

    // ----- UPKP CONTENT -----
    UPKP_1: {
        text: `📋 *Deskripsi Program UPKP Kemenkeu*

Kelas persiapan khusus untuk UPKP Kemenkeu dengan materi yang disesuaikan dengan kisi-kisi terbaru.

Program meliputi:
• Tes Potensi
• TSKKWK (Tes Substansi Keuangan, Kepemerintahan, dan Wawasan Kebangsaan)
• Psikotes

Ketik *0* untuk kembali`
    },

    UPKP_2: {
        text: `📅 *Jadwal & Pendaftaran UPKP*

Kelas UPKP Kemenkeu direncanakan mulai dibuka pada bulan *Februari*.

Open registrasi akan diinformasikan secara resmi melalui:
• Grup resmi
• Instagram @aortatubelupkp

Ketik *0* untuk kembali`
    },

    UPKP_3: {
        text: `📦 *Paket Include UPKP*

✅ Soal-soal sesuai kisi-kisi UPKP Kemenkeu
✅ Materi CAT (Computer Assisted Test)
✅ Pembahasan detail
✅ Simulasi ujian sebenarnya
✅ Akses rekaman kelas

Ketik *0* untuk kembali`
    },

    UPKP_4: {
        text: `💰 *Harga & Durasi UPKP*

Harga: Soon! Akan rilis dalam waktu dekat
Durasi: [Sesuai paket yang dipilih]

Untuk info lebih lanjut, hubungi admin dengan ketik *6*

Ketik *0* untuk kembali`
    },

    UPKP_5: {
        text: `📝 *Cara Daftar Kelas UPKP*

1️⃣ Buat akun & login di website
   🌐 https://www.aorta-edu.com

2️⃣ Pilih menu Kelas ▶ UPKP

3️⃣ Pilih paket kelas

4️⃣ Klik Beli Sekarang

5️⃣ Apply kupon (jika ada)

6️⃣ Lanjutkan pembayaran

📌 Akses kelas otomatis setelah pembayaran berhasil

Ketik *0* untuk kembali`
    },

    // ----- SPMB CONTENT -----
    SPMB_1: {
        text: `📋 *Info Program SPMB Reguler*

Untuk SPMB reguler saat ini kami hanya menyediakan paket Try Out (TO).

Belum tersedia kelas intensif.

Ketik *0* untuk kembali atau *4* untuk hubungi admin`
    },

    SPMB_2: {
        text: `📝 *SPMB Reguler*

📋 *Deskripsi:*
Untuk SPMB reguler saat ini kami hanya menyediakan paket Try Out (TO). Belum tersedia kelas intensif.

Untuk info lebih lanjut, hubungi admin dengan ketik *4*

Ketik *0* untuk kembali atau *4* untuk hubungi admin`
    },

    // ----- S2/LPDP CONTENT -----
    S2_1: {
        text: `📋 *Status Program S2 / LPDP*

Saat ini kelas persiapan Beasiswa Dalam Negeri maupun Luar Negeri masih dalam tahap pengembangan.

InsyaAllah akan tersedia ke depannya, mohon ditunggu ya kak 🙏

Ketik *0* untuk kembali atau *4* untuk hubungi admin`
    },

    // ----- UPKP LAIN / TOEFL / STIS -----
    OTHER_1: {
        text: `📋 *UPKP Kementerian Lain*

Saat ini Aorta hanya melayani UPKP untuk Kemenkeu.

Untuk kementerian lain masih dalam tahap pengembangan.

Ketik *0* untuk kembali atau *4* untuk hubungi admin`
    },

    OTHER_2: {
        text: `📋 *Program TOEFL*

Program persiapan TOEFL masih dalam tahap pengembangan.

InsyaAllah akan tersedia segera.

Ketik *0* untuk kembali atau *4* untuk hubungi admin`
    },

    OTHER_3: {
        text: `📋 *Program STIS*

Untuk STIS tahun ini hanya tersedia paket Try Out (TO).

Belum ada kelas intensif.

Ketik *0* untuk kembali atau *4* untuk hubungi admin`
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

📲 Ada pertanyaan lain? Ketik *0* atau hubungi admin dengan ketik *7* 😊`
    },

     // ----- TO Gratis Content -----

    TO_GRATIS_1: {
        text: `📋 *Deskripsi Program TO GRATIS*

TO GRATIS TPA, TBI & UPKP 2026
Persiapkan diri Kamu sebaik mungkin untuk menghadapi ujian sesungguhnya dengan mengikuti Try Out (TO) dari Aorta. 
Jangan lewatkan kesempatan untuk mengukur kemampuan Kamu secara nasional!

🎯 Fasilitas:
✅ Ranking Nasional
✅ Pembahasan Soal
✅ Skor Instan

Informasi lengkap akan diumumkan melalui grup dan media resmi kami (@aortatubelupkp).

Ketik *0* untuk kembali`
    },

    TO_GRATIS_2: {
        text: `📝 *Cara Daftar TO Gratis*

    📝 Cara Mendaftar:
    1️⃣ Follow Instagram @aortatubelupkp
    2️⃣ Tag 3 teman kamu di kolom komentar
    3️⃣ Upload bukti follow & tag melalui link :
        🌐linktr.ee/aortatubelupkp


📌 info lebih lanjut akan di umumkan di Instagram @aortatubelupkp

Ketik *0* untuk kembali`
    },

    TO_GRATIS_3: {
    text: `📅 *Pelaksanaan TO Gratis*

    31 Januari – 2 Februari 2026

    Ketik *0* untuk kembali`
    },



    // ----- LIVE AGENT -----
    LIVE_AGENT: {
        text: `👨‍💼 *LIVE AGENT MODE*

Baik kak, saya akan menghubungkan Anda dengan admin kami.

✅ *Status:* Mode chat otomatis DINONAKTIFKAN
✅ *Aksi:* Admin akan segera membalas chat Anda

Silakan tunggu sebentar, admin kami akan segera merespons ya! 😊

Atau Anda bisa langsung mengetik pertanyaan/pesan Anda sekarang.

_Catatan: Untuk kembali ke menu otomatis, ketik "0"_`,
        activateLiveAgent: true
    },

    // ----- TIMEOUT NOTIFICATION -----
    TIMEOUT_NOTIFICATION: {
        text: `⏰ *Karena anda tidak membalas chat sebelumnya, kamu mulai saat ini akan berbicara dengan Agent Bot*

Silakan pilih opsi:

1️⃣ Ingin bertanya lebih lanjut dengan AortaBot
2️⃣ Chat dengan admin

Ketik *1* atau *2* untuk memilih`
    },
};

// ===== DEFAULT FALLBACK =====
const FALLBACK = {
    text: `Maaf kak, saya tidak mengerti perintah tersebut 😅

Silakan pilih menu di bawah ini:

1. Persiapan TUBEL
2. Kelas UPKP Kemenkeu
3. SPMB reguler
4. Persiapan S2 / LPDP
5. UPKP kementerian lain / TOEFL / STIS
6. Garansi Uang Kembali
7. TO Gratis
8. Hubungi Live Agent / Admin

Atau ketik *0* untuk melihat opsi lengkap 😊`
};

// ===================================================
// ===== ADMIN PAUSE MANAGEMENT =====
// ===================================================

function isUserPausedByAdmin(userId) {
    if (!adminPausedUsers.has(userId)) return false;
    
    const pauseData = adminPausedUsers.get(userId);
    const now = Date.now();
    
    if (now >= pauseData.pauseUntil) {
        // Pause expired, remove it
        adminPausedUsers.delete(userId);
        console.log(`⏰ Admin pause expired for user: ${userId}`);
        return false;
    }
    
    return true;
}

function pauseUserByAdmin(userId) {
    const pauseUntil = Date.now() + CONFIG.adminPauseDuration;
    adminPausedUsers.set(userId, {
        pauseUntil: pauseUntil,
        notificationSent: false
    });
    
    const pauseMinutes = CONFIG.adminPauseDuration / (60 * 1000);
    console.log(`⏸️  Bot PAUSED for user ${userId} for ${pauseMinutes} minutes (admin initiated)`);
}

function unpauseUser(userId) {
    if (adminPausedUsers.has(userId)) {
        adminPausedUsers.delete(userId);
        conversationInitiators.delete(userId); // Reset initiator tracking
        console.log(`▶️  Bot RESUMED for user: ${userId}`);
    }
}

// Auto-check expired pauses every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [userId, pauseData] of adminPausedUsers.entries()) {
        if (now >= pauseData.pauseUntil) {
            adminPausedUsers.delete(userId);
            conversationInitiators.delete(userId); // Reset initiator tracking
            console.log(`⏰ Admin pause auto-expired for user: ${userId}`);
        }
    }
}, 5 * 60 * 1000);

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
    if (input === '0' || input === 'menu' || input === 'kembali' || input === 'back') {
        resetUserState(userId);
        return { text: MENUS.MAIN, deactivateLiveAgent: true };
    }

    // Garansi (bisa diakses dari mana saja)
    if (input === '6' || input.includes('garansi')) {
        return CONTENT.GARANSI;
    }

    // Live Agent (bisa diakses dari mana saja)
    if (input === '8' || input === 'live agent' || input === 'agent' || 
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

        case STATE.TO_MENU:
            return handletoGratisMenu(userId, input)
        
        default:
            resetUserState(userId);
            return FALLBACK;
    }
}

// ===== MAIN MENU HANDLER =====
function handleMainMenu(userId, input) {
    switch (input) {
        case '1':
            setUserState(userId, STATE.TUBEL_MENU);
            return { text: MENUS.TUBEL };
        
        case '2':
            setUserState(userId, STATE.UPKP_MENU);
            return { text: MENUS.UPKP };
        
        case '3':
            setUserState(userId, STATE.SPMB_MENU);
            return { text: MENUS.SPMB };
        
        case '4':
            setUserState(userId, STATE.S2_MENU);
            return { text: MENUS.S2 };
        
        case '5':
            setUserState(userId, STATE.OTHER_MENU);
            return { text: MENUS.OTHER };
        
        case '6':
            return CONTENT.GARANSI;

        case '7':
            setUserState(userId, STATE.TO_MENU);
            return {text: MENUS.TO_GRATIS};
        
        case '8':
            return CONTENT.LIVE_AGENT;
        
        default:
            return FALLBACK;
    }
}

// ===== TUBEL SUBMENU HANDLER =====
function handleTubelMenu(userId, input) {
    switch (input) {
        case '1':
            return CONTENT.TUBEL_1;
        case '2':
            return CONTENT.TUBEL_2;
        case '3':
            return CONTENT.TUBEL_3;
        case '4':
            return CONTENT.TUBEL_4;
        case '5':
            return CONTENT.LIVE_AGENT;
        default:
            return { text: MENUS.TUBEL };
    }
}

// ===== UPKP SUBMENU HANDLER =====
function handleUpkpMenu(userId, input) {
    switch (input) {
        case '1':
            return CONTENT.UPKP_1;
        case '2':
            return CONTENT.UPKP_2;
        case '3':
            return CONTENT.UPKP_3;
        case '4':
            return CONTENT.UPKP_4;
        case '5':
            return CONTENT.UPKP_5;
        case '6':
            return CONTENT.LIVE_AGENT;
        default:
            return { text: MENUS.UPKP };
    }
}

// ===== SPMB SUBMENU HANDLER =====
function handleSpmbMenu(userId, input) {
    switch (input) {
        case '1':
            return CONTENT.SPMB_1;
        case '2':
            return CONTENT.SPMB_2;
        case '3':
            return CONTENT.LIVE_AGENT;
        default:
            return { text: MENUS.SPMB };
    }
}

// ===== S2/LPDP SUBMENU HANDLER =====
function handleS2Menu(userId, input) {
    switch (input) {
        case '1':
            return CONTENT.S2_1;
        case '2':
            return CONTENT.LIVE_AGENT;
        default:
            return { text: MENUS.S2 };
    }
}

// ===== OTHER (UPKP LAIN) SUBMENU HANDLER =====
function handleOtherMenu(userId, input) {
    switch (input) {
        case '1':
            return CONTENT.OTHER_1;
        case '2':
            return CONTENT.OTHER_2;
        case '3':
            return CONTENT.OTHER_3;
        case '4':
            return CONTENT.LIVE_AGENT;
        default:
            return { text: MENUS.OTHER };
    }
}

// ===== TO Gratis SUBMENU HANDLER =====
function handletoGratisMenu(userId, input) {
    switch (input) {
        case '1':
            return CONTENT.TO_GRATIS_1;
        case '2':
            return CONTENT.TO_GRATIS_2;
        case '3':
            return CONTENT.TO_GRATIS_3;
        case '4':
            return CONTENT.LIVE_AGENT;
        default:
            return { text: MENUS.TO_GRATIS };
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

function updateTracking() {
    const now = Date.now();
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

        // Support untuk file
        if (reply.file) {
            const filePath = path.join(__dirname, reply.file);
            
            if (fs.existsSync(filePath)) {
                await sock.sendMessage(jid, { text: reply.text });
                
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
        // Support untuk gambar
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
        // Kirim text saja
        else {
            await sock.sendMessage(jid, { text: reply.text });
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
            console.log('\n✅ Bot WhatsApp v2.1 sudah aktif!\n');
            console.log('🎯 Fitur:');
            console.log('   ✓ Context/State Management');
            console.log('   ✓ Menu Berbasis Angka');
            console.log('   ✓ Smart Fallback');
            console.log('   ✓ Live Agent Mode');
            console.log('   ✓ Admin First-Chat Auto Pause (1 jam)');
            console.log('   ✓ No User Cooldown\n');
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
        
        const from = msg.key.remoteJid;
        const userId = from.split('@')[0];
        const isFromMe = msg.key.fromMe;

        // Skip excluded numbers
        if (excludedNumbers.includes(from)) return;

        // Skip group messages
        if (from.endsWith('@g.us')) return;

        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text;

        if (!text) return;

        const messageText = text.toLowerCase().trim();

        console.log(`\n📨 [${new Date().toLocaleString('id-ID')}] Pesan dari ${isFromMe ? 'ADMIN' : userId}`);
        console.log(`💬 "${text}"`);

        // ===== TRACK CONVERSATION INITIATOR =====
        if (!conversationInitiators.has(from)) {
            // First message in this conversation
            if (isFromMe) {
                conversationInitiators.set(from, 'admin');
                console.log(`🎯 Conversation INITIATED by ADMIN`);
            } else {
                conversationInitiators.set(from, 'user');
                console.log(`🎯 Conversation INITIATED by USER`);
            }
        }

        // ===== DETEKSI: ADMIN CHAT DULUAN (INISIASI) =====
        if (isFromMe && conversationInitiators.get(from) === 'admin') {
            console.log(`👨‍💼 Pesan dari ADMIN terdeteksi (Admin initiated chat)`);
            
            // Pause bot untuk chat ini (admin sedang handle)
            pauseUserByAdmin(from);
            console.log(`⏸️  Bot auto-paused for chat ${userId} (admin initiated)`);
            
            return; // JANGAN kirim auto-reply apapun
        }
        
        // Jika admin reply tapi user yang chat duluan, jangan pause
        if (isFromMe && conversationInitiators.get(from) === 'user') {
            // Check if this is admin's MANUAL message (not bot's auto-reply)
            const isBotTemplate = text.includes('[Chat Otomatis]') || 
                                  text.includes('✅ *') ||
                                  text.includes('Ketik *0* untuk kembali') ||
                                  text.includes('Pilih informasi yang ingin kamu ketahui') ||
                                  text.includes('Maaf kak, saya tidak mengerti');
            
            if (!isBotTemplate) {
                // This is MANUAL message from admin - PAUSE immediately
                console.log(`🚨 ADMIN MANUAL INTERVENTION detected!`);
                console.log(`👨‍💼 Admin is manually responding - pausing bot`);
                
                conversationInitiators.set(from, 'admin'); // Override to admin
                pauseUserByAdmin(from);
                console.log(`⏸️  Bot auto-paused for chat ${userId} (admin manual intervention)`);
                
                return; // Don't auto-reply
            }
            
            // Bot's own template - just skip
            console.log(`🤖 Bot template detected - skipping`);
            return; // Skip admin's reply, don't process
        }

        // ===== CEK: USER DIPAUSE OLEH ADMIN =====
        if (isUserPausedByAdmin(from)) {
            const pauseUntil = adminPausedUsers.get(from);
            const remainingMinutes = Math.ceil((pauseUntil - Date.now()) / (60 * 1000));
            
            console.log(`⏸️  Bot PAUSED for user ${userId} (${remainingMinutes} minutes remaining)`);
            console.log(`⏸️  Menunggu admin membalas...`);
            
            // Check if user wants to unpause
            if (messageText === '0' || messageText === 'menu' || 
                messageText === 'kembali' || messageText === 'back') {
                unpauseUser(from);
                const reply = routeMessage(userId, messageText);
                await sendReply(sock, from, reply);
                updateTracking();
            }
            
            return; // Don't auto-reply when paused
        }

        // ===== CEK LIVE AGENT MODE =====
        if (isInLiveAgentMode(userId)) {
            console.log(`👨‍💼 User ${userId} sedang dalam Live Agent Mode`);
            
            const session = liveAgentSessions.get(userId);
            session.lastActivity = Date.now();
            
            // Cek apakah user mau kembali ke menu
            if (messageText === '0' || messageText === 'menu' || 
                messageText === 'kembali' || messageText === 'back') {
                const reply = routeMessage(userId, messageText);
                await sendReply(sock, from, reply);
                
                if (reply.deactivateLiveAgent) {
                    deactivateLiveAgent(userId);
                }
                
                updateTracking();
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
            updateTracking();
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
console.log('🚀 Starting Aorta Bot v2.1...');
console.log('🎯 Fitur:');
console.log('   ✓ Context/State Management');
console.log('   ✓ Menu Berbasis Angka (0-8)');
console.log('   ✓ Smart Fallback System');
console.log('   ✓ Live Agent Mode');
console.log('   ✓ Admin First-Chat Auto Pause (1 jam)');
console.log('   ✓ No User Cooldown');
console.log('   ✓ Clean & Scalable Architecture\n');

startBot().catch(err => {
    console.error('❌ Error starting bot:', err);
});
