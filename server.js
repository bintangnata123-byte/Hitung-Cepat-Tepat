const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const JSON_DB_PATH = path.join(DATA_DIR, 'hasil_kuis.json');
const USERS_DB_PATH = path.join(DATA_DIR, 'akun_siswa.json');
const CSV_DB_PATH = path.join(DATA_DIR, 'hasil_kuis.csv');
const INDEX_HTML_PATH = path.join(__dirname, 'index.html');

// Penyimpanan progres live battle di memori
const liveBattleRacers = new Map();

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password) + '_math_reflex_salt').digest('hex');
}

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(JSON_DB_PATH)) {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify([], null, 2), 'utf8');
  }
  if (!fs.existsSync(USERS_DB_PATH)) {
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify([], null, 2), 'utf8');
  }
  if (!fs.existsSync(CSV_DB_PATH)) {
    const header = '\uFEFFTimestamp,Mode,Room,Username,Nama Siswa,Paket,Skor,Total Waktu (Detik),Sisa Nyawa,Status,Timestamp Per Soal,Log Kesalahan\n';
    fs.writeFileSync(CSV_DB_PATH, header, 'utf8');
  }
}

function readUsers() {
  ensureStorage();
  try {
    return JSON.parse(fs.readFileSync(USERS_DB_PATH, 'utf8'));
  } catch (err) {
    console.error('Gagal membaca Users DB:', err);
    return [];
  }
}

function writeUsers(users) {
  ensureStorage();
  fs.writeFileSync(USERS_DB_PATH, JSON.stringify(users, null, 2), 'utf8');
}

function readResults() {
  ensureStorage();
  try {
    const raw = fs.readFileSync(JSON_DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Gagal membaca JSON DB:', err);
    return [];
  }
}

function escapeCsvField(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rebuildCsvFile(results) {
  ensureStorage();
  const header = '\uFEFFTimestamp,Mode,Room,Username,Nama Siswa,Paket,Skor,Total Waktu (Detik),Sisa Nyawa,Status,Timestamp Per Soal,Log Kesalahan\n';
  const rows = results.map((item) => {
    const status = Number(item.sisa_nyawa) > 0 ? 'LULUS' : 'GAME OVER';
    const totalSec = item.total_waktu_ms ? (Number(item.total_waktu_ms) / 1000).toFixed(2) : '0.00';
    const perSoalStr = Array.isArray(item.detail_soal)
      ? item.detail_soal.map((d) => `S${d.no}:${(d.waktu_ms / 1000).toFixed(2)}s(${d.benar ? 'OK' : 'X'})@${d.jam_jawab || ''}`).join(' | ')
      : '';
    const errorsStr = Array.isArray(item.log_kesalahan)
      ? item.log_kesalahan.join(' | ')
      : String(item.log_kesalahan || '');
    return [
      escapeCsvField(item.timestamp),
      escapeCsvField(item.mode || 'latihan'),
      escapeCsvField(item.room_code || '-'),
      escapeCsvField(item.username || '-'),
      escapeCsvField(item.nama),
      escapeCsvField(item.paket),
      escapeCsvField(item.skor),
      escapeCsvField(totalSec),
      escapeCsvField(item.sisa_nyawa),
      escapeCsvField(status),
      escapeCsvField(perSoalStr),
      escapeCsvField(errorsStr)
    ].join(',');
  });
  fs.writeFileSync(CSV_DB_PATH, header + rows.join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

function appendResult(payload) {
  const results = readResults();
  const usernameClean = String(payload.username || payload.nama || 'siswa')
    .trim()
    .toLowerCase();

  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: payload.timestamp || new Date().toISOString(),
    mode: payload.mode === 'battle' ? 'battle' : 'latihan',
    room_code: String(payload.room_code || 'GLOBAL').trim().toUpperCase(),
    username: usernameClean,
    nama: String(payload.nama || usernameClean).trim(),
    paket: String(payload.paket || '-').trim(),
    skor: Number(payload.skor ?? 0),
    sisa_nyawa: Number(payload.sisa_nyawa ?? 0),
    total_waktu_ms: Number(payload.total_waktu_ms ?? 0),
    detail_soal: Array.isArray(payload.detail_soal) ? payload.detail_soal : [],
    log_kesalahan: Array.isArray(payload.log_kesalahan) ? payload.log_kesalahan : []
  };

  results.push(record);
  fs.writeFileSync(JSON_DB_PATH, JSON.stringify(results, null, 2), 'utf8');
  rebuildCsvFile(results);
  return record;
}

function clearResults() {
  ensureStorage();
  liveBattleRacers.clear();
  fs.writeFileSync(JSON_DB_PATH, JSON.stringify([], null, 2), 'utf8');
  rebuildCsvFile([]);
}

function seedDemoData() {
  const results = readResults();
  const users = readUsers();
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  const demoStudents = [
    { username: 'andi', nama: 'Andi Pratama' },
    { username: 'budi', nama: 'Budi Santoso' },
    { username: 'citra', nama: 'Citra Lestari' },
    { username: 'dinda', nama: 'Dinda Kirana' }
  ];

  // Pastikan akun demo terdaftar (password default: 123456)
  demoStudents.forEach((ds) => {
    if (!users.some((u) => u.username === ds.username)) {
      users.push({
        username: ds.username,
        nama: ds.nama,
        password_hash: hashPassword('123456'),
        created_at: new Date(now - 35 * DAY).toISOString()
      });
    }
  });
  writeUsers(users);

  const packages = [
    'PAKET_1', 'PAKET_2', 'PAKET_5', 'PAKET_10', 'PAKET_15', 'PAKET_20',
    'PAKET_21', 'PAKET_25', 'PAKET_30', 'PAKET_35', 'PAKET_40',
    'PAKET_41', 'PAKET_45', 'PAKET_50', 'PAKET_55', 'PAKET_60',
    'PAKET_61', 'PAKET_65', 'PAKET_70', 'PAKET_75', 'PAKET_80',
    'PAKET_81', 'PAKET_85', 'PAKET_90', 'PAKET_95', 'PAKET_100'
  ];

  for (let daysAgo = 32; daysAgo >= 0; daysAgo -= 2) {
    demoStudents.forEach((student, idx) => {
      const pkg = packages[(daysAgo + idx) % packages.length];
      const progressFactor = (32 - daysAgo) / 32;
      const baseScore = Math.min(10, Math.max(4, Math.round(5 + progressFactor * 4.5 + ((idx % 2) * 0.5))));
      const livesLeft = baseScore >= 8 ? (baseScore === 10 ? 3 : 2) : 1;

      const detailSoal = [];
      let totalMs = 0;
      const baseTimePerQ = Math.max(1400, Math.round(5200 - progressFactor * 2800 - idx * 180));
      const attemptTime = new Date(now - daysAgo * DAY - idx * 3600000);

      for (let i = 1; i <= 10; i++) {
        const isCorrect = i <= baseScore;
        const qMs = Math.max(950, baseTimePerQ + ((i * 317) % 1200) - 400);
        totalMs += qMs;
        const tJawab = new Date(attemptTime.getTime() + totalMs);
        detailSoal.push({
          no: i,
          q: `Soal #${i}`,
          benar: isCorrect,
          waktu_ms: qMs,
          timestamp_jawab: tJawab.toISOString(),
          jam_jawab: tJawab.toTimeString().split(' ')[0] + '.' + String(tJawab.getMilliseconds()).padStart(3, '0')
        });
      }

      results.push({
        id: 'demo_' + daysAgo + '_' + idx + '_' + Math.random().toString(36).slice(2, 5),
        timestamp: attemptTime.toISOString(),
        mode: daysAgo <= 4 ? 'battle' : 'latihan',
        room_code: 'KELAS-7A',
        username: student.username,
        nama: student.nama,
        paket: pkg,
        skor: baseScore,
        sisa_nyawa: livesLeft,
        total_waktu_ms: totalMs,
        detail_soal: detailSoal,
        log_kesalahan: baseScore < 10 ? [`Soal Latihan (${10 - baseScore} kesalahan)`] : []
      });
    });
  }

  fs.writeFileSync(JSON_DB_PATH, JSON.stringify(results, null, 2), 'utf8');
  rebuildCsvFile(results);
  return results.length;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req, callback) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString();
    if (body.length > 1e6) req.socket.destroy();
  });
  req.on('end', () => {
    try {
      callback(null, JSON.parse(body || '{}'));
    } catch (err) {
      callback(err, null);
    }
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // 1. Serve Frontend (Portal Siswa: / atau /siswa, Portal Guru: /guru)
  if (
    req.method === 'GET' &&
    (pathname === '/' || pathname === '/index.html' || pathname === '/siswa' || pathname === '/guru')
  ) {
    try {
      const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: 'File index.html tidak ditemukan.' });
    }
  }

  // 2. GET /api/health
  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'online',
      service: 'Micro-Quiz Math Reflex Local Server',
      total_records: readResults().length,
      total_users: readUsers().length
    });
  }

  // 3. POST /api/auth/register (Registrasi Akun Siswa Baru)
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    return parseBody(req, (err, body) => {
      if (err) return sendJson(res, 400, { status: 'error', message: 'Format request tidak valid.' });

      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '');
      const nama = String(body.nama || body.username || '').trim();

      if (!username || username.length < 3) {
        return sendJson(res, 400, { status: 'error', message: 'Username minimal 3 karakter.' });
      }
      if (!/^[a-z0-9_.-]+$/.test(username)) {
        return sendJson(res, 400, {
          status: 'error',
          message: 'Username hanya boleh huruf, angka, titik, atau garis bawah (tanpa spasi).'
        });
      }
      if (!password || password.length < 4) {
        return sendJson(res, 400, { status: 'error', message: 'Password minimal 4 karakter.' });
      }

      const users = readUsers();
      if (users.some((u) => u.username === username)) {
        return sendJson(res, 409, {
          status: 'error',
          message: `Username "${username}" sudah digunakan. Silakan pilih username lain atau masuk (Login).`
        });
      }

      const newUser = {
        username,
        nama: nama || username,
        password_hash: hashPassword(password),
        created_at: new Date().toISOString()
      };
      users.push(newUser);
      writeUsers(users);

      return sendJson(res, 201, {
        status: 'success',
        message: 'Registrasi berhasil!',
        user: { username: newUser.username, nama: newUser.nama }
      });
    });
  }

  // 4. POST /api/auth/login (Login Akun Siswa)
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    return parseBody(req, (err, body) => {
      if (err) return sendJson(res, 400, { status: 'error', message: 'Format request tidak valid.' });

      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (!username || !password) {
        return sendJson(res, 400, { status: 'error', message: 'Username dan password wajib diisi.' });
      }

      const users = readUsers();
      const found = users.find((u) => u.username === username);
      if (!found || found.password_hash !== hashPassword(password)) {
        return sendJson(res, 401, {
          status: 'error',
          message: 'Username atau password salah! Jika belum punya akun, silakan Daftar Akun Baru.'
        });
      }

      return sendJson(res, 200, {
        status: 'success',
        message: 'Login berhasil!',
        user: { username: found.username, nama: found.nama }
      });
    });
  }

  // 5. GET /api/results (Bisa difilter per username untuk privasi siswa, atau semua untuk guru)
  if (req.method === 'GET' && pathname === '/api/results') {
    const paketFilter = parsedUrl.searchParams.get('paket');
    const usernameFilter = parsedUrl.searchParams.get('username');
    let results = readResults();

    if (paketFilter && paketFilter !== 'ALL') {
      results = results.filter((r) => r.paket === paketFilter);
    }
    if (usernameFilter && usernameFilter !== 'ALL') {
      const targetUser = usernameFilter.trim().toLowerCase();
      results = results.filter(
        (r) =>
          (r.username && r.username.toLowerCase() === targetUser) ||
          (r.nama && r.nama.toLowerCase() === targetUser)
      );
    }
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return sendJson(res, 200, { status: 'success', data: results });
  }

  // 6. POST /api/results
  if (req.method === 'POST' && pathname === '/api/results') {
    return parseBody(req, (err, payload) => {
      if (err) return sendJson(res, 400, { status: 'error', message: err.message });
      if (!payload.nama || !payload.paket) {
        return sendJson(res, 400, { status: 'error', message: 'Field nama dan paket wajib diisi.' });
      }
      const saved = appendResult(payload);
      return sendJson(res, 201, { status: 'success', data: saved });
    });
  }

  // 7. POST /api/battle/progress
  if (req.method === 'POST' && pathname === '/api/battle/progress') {
    return parseBody(req, (err, data) => {
      if (err) return sendJson(res, 400, { status: 'error', message: err.message });
      const key = `${data.paket || 'PAKET_1'}::${(data.room_code || 'GLOBAL').toUpperCase()}::${data.username || data.nama}`;
      liveBattleRacers.set(key, {
        username: data.username || data.nama,
        nama: data.nama,
        paket: data.paket || 'PAKET_1',
        room_code: (data.room_code || 'GLOBAL').toUpperCase(),
        soal_selesai: Number(data.soal_selesai || 0),
        skor: Number(data.skor || 0),
        total_waktu_ms: Number(data.total_waktu_ms || 0),
        detail_soal: Array.isArray(data.detail_soal) ? data.detail_soal : [],
        status: data.status || 'racing',
        updated_at: Date.now()
      });
      return sendJson(res, 200, { status: 'success' });
    });
  }

  // 8. GET /api/battle/leaderboard
  if (req.method === 'GET' && pathname === '/api/battle/leaderboard') {
    const paket = parsedUrl.searchParams.get('paket') || 'PAKET_1';
    const room = (parsedUrl.searchParams.get('room') || 'ALL').toUpperCase();

    const now = Date.now();
    for (const [k, v] of liveBattleRacers.entries()) {
      if (now - v.updated_at > 15 * 60 * 1000) liveBattleRacers.delete(k);
    }

    const activeRacers = Array.from(liveBattleRacers.values()).filter(
      (r) => r.paket === paket && (room === 'ALL' || r.room_code === room)
    );

    const allResults = readResults().filter(
      (r) => r.paket === paket && (room === 'ALL' || (r.room_code || 'GLOBAL').toUpperCase() === room)
    );

    allResults.sort((a, b) => {
      if (b.skor !== a.skor) return b.skor - a.skor;
      const timeA = a.total_waktu_ms > 0 ? a.total_waktu_ms : 999999;
      const timeB = b.total_waktu_ms > 0 ? b.total_waktu_ms : 999999;
      return timeA - timeB;
    });

    return sendJson(res, 200, {
      status: 'success',
      active_racers: activeRacers,
      leaderboard: allResults
    });
  }

  // 9. POST /api/results/seed-demo
  if (req.method === 'POST' && pathname === '/api/results/seed-demo') {
    const total = seedDemoData();
    return sendJson(res, 200, { status: 'success', total_records: total });
  }

  // 10. GET /api/results/export.csv
  if (req.method === 'GET' && pathname === '/api/results/export.csv') {
    ensureStorage();
    const csvContent = fs.readFileSync(CSV_DB_PATH, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="rekap_nilai_math_reflex.csv"',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(csvContent);
  }

  // 11. DELETE /api/results
  if (req.method === 'DELETE' && pathname === '/api/results') {
    clearResults();
    return sendJson(res, 200, { status: 'success', message: 'Semua data berhasil direset.' });
  }

  return sendJson(res, 404, { status: 'error', message: 'Endpoint tidak ditemukan.' });
});

ensureStorage();

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('==========================================================');
    console.log(`✓ Server SUDAH AKTIF di http://localhost:${PORT}`);
    console.log('🌐 Silakan langsung gunakan browser yang sudah terbuka.');
    console.log('==========================================================');
    process.exit(0);
  } else {
    console.error('Server error:', err);
  }
});

server.listen(PORT, () => {
  console.log('==========================================================');
  console.log('🚀 MICRO-QUIZ MATH REFLEX SERVER AKTIF');
  console.log(`🌐 Portal Siswa  : http://localhost:${PORT}/siswa`);
  console.log(`👨‍🏫 Portal Guru   : http://localhost:${PORT}/guru`);
  console.log(`📂 Database Akun : ${USERS_DB_PATH}`);
  console.log(`📂 Database Nilai: ${JSON_DB_PATH}`);
  console.log(`📊 Rekap Excel   : ${CSV_DB_PATH}`);
  console.log('==========================================================');
});
