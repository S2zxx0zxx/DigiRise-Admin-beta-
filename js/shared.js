(function initTheme() {
  try {
    const saved = localStorage.getItem('digirise-theme');
    const theme = saved === 'light' || saved === 'dark' 
      ? saved : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

// Shared utilities, constants, and Firebase initialization

// Initialize Firebase (will run after firebase-config.js and Firebase CDN scripts are loaded)
let app, database;

try {
  if (typeof firebase === 'undefined') {
    console.error("Firebase SDK is not loaded. Please make sure CDN scripts are loaded.");
  } else {
    app = firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    console.log("Firebase initialized successfully.");

    // Compat SDK behavior: `.on('value', cb)` with NO error handler will
    // silently UNREGISTER the listener when the first read returns
    // permission_denied.  On the preview URL, anon auth sometimes flaps
    // on cold-start, so ALL early listeners get permanently removed
    // — leaving the dashboard stuck at 0.  Patch `.on()` here to always
    // pass a benign error handler so Firebase keeps the listener attached
    // and retries automatically once auth stabilises.
    try {
      const Ref = firebase.database.Reference;
      if (Ref && Ref.prototype && Ref.prototype.on && !Ref.prototype.__drPatchedOn) {
        const originalOn = Ref.prototype.on;
        Ref.prototype.on = function (eventType, cb, cancelCb, ctx) {
          if (typeof cancelCb !== 'function') {
            const path = (this.toString && this.toString()) || '';
            cancelCb = function (err) {
              // Log at warning level; do NOT rethrow so Firebase keeps
              // the listener attached and retries after auth stabilises.
              console.warn('[DR] on(' + eventType + ') @ ' + path + ' error:', err && err.code);
            };
          }
          return originalOn.call(this, eventType, cb, cancelCb, ctx);
        };
        Ref.prototype.__drPatchedOn = true;
      }
    } catch (patchErr) {
      console.warn('[DR] could not patch Reference.on:', patchErr && patchErr.message);
    }

    // Sign in anonymously so all subsequent database requests carry
    // a valid Firebase auth token (required by the updated security rules).
    // Wrapped in a small retry loop so a single network flake at cold-start
    // doesn't leave the whole session with auth=null (which cascades into
    // permission_denied on every read).
    function anonSignInWithRetry(attempt) {
      attempt = attempt || 0;
      firebase.auth().signInAnonymously()
        .then(() => {
          console.log("Firebase: Signed in anonymously — auth token is now active.");

          // Phase 0: Test connection / read-write wiring
          const connectedRef = database.ref(".info/connected");
          connectedRef.on("value", (snap) => {
            if (snap.val() === true) {
              console.log("Firebase Realtime DB: Connected.");
              // Perform a test write to verify permissions/wiring
              const testRef = database.ref("test_wiring");
              testRef.set({
                lastChecked: new Date().toISOString(),
                status: "success"
              }).then(() => {
                console.log("Test write successful.");
              }).catch(err => {
                console.warn("Test write failed (expected if rules deny write):", err);
              });
            } else {
              console.log("Firebase Realtime DB: Disconnected.");
            }
          });

          // Seed demo data only after auth is confirmed
          setTimeout(seedDemoData, 1500);
        })
        .catch(err => {
          console.warn("Firebase anonymous sign-in failed (attempt " + attempt + "):", err && err.code);
          if (attempt < 6) {
            setTimeout(() => anonSignInWithRetry(attempt + 1), 800 + attempt * 600);
          } else {
            console.error("Firebase anonymous sign-in gave up after retries:", err);
          }
        });
    }
    anonSignInWithRetry(0);
  }
} catch (e) {
  console.error("Error initializing Firebase:", e);
}


// --- Shared Constants ---
const PACKAGES = {
  ELITE: { name: 'Elite', price: 75000, commissionPct: 15, color: '#C8890A' },
  PRO: { name: 'Pro', price: 35000, commissionPct: 15, color: '#C8890A' },
  GROWTH: { name: 'Growth', price: 25000, commissionPct: 10, color: '#3B82F6' },
  STARTER: { name: 'Starter', price: 8000, commissionPct: 10, color: '#3B82F6' }
};

const TIERS = {
  JOINING: { name: 'Joining', minDeals: 0, bonus: 0 },
  BRONZE: { name: 'Bronze', minDeals: 3, bonus: 500 },
  SILVER: { name: 'Silver', minDeals: 7, bonus: 1500 },
  GOLD: { name: 'Gold', minDeals: 15, bonus: 5000 }
};

// --- Shared Helper Functions ---

// Format currency in Indian Rupees format (e.g. ₹75,000)
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

// HTML Escape to prevent XSS attacks
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Simple Toast System
function showToast(message, type = 'info') {
  let toastEl = document.getElementById('toast');
  if (!toastEl) {
    // If not exists, dynamically inject it
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }

  toastEl.className = `toast show ${type}`;
  toastEl.textContent = message;

  setTimeout(() => {
    toastEl.className = 'toast';
  }, 4000);
}

// SESSION 3 — PHASE F3: Toast with Undo
function showToastWithUndo(message, onUndo, durationMs) {
  const duration = durationMs || 5000;

  let wrap = document.getElementById('toast');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast';
    wrap.className = 'toast';
    document.body.appendChild(wrap);
  }

  const toastEl = document.createElement('div');
  toastEl.className = 'toast-item toast-undo';
  toastEl.innerHTML = [
    '<span class="toast-undo-msg"></span>',
    '<button class="toast-undo-btn" type="button">Undo</button>',
    '<div class="toast-undo-progress"></div>'
  ].join('');
  toastEl.querySelector('.toast-undo-msg').textContent = message;

  let undone = false;
  let dismissTimer = null;

  const undoBtn = toastEl.querySelector('.toast-undo-btn');
  undoBtn.addEventListener('click', () => {
    if (undone) return;
    undone = true;
    clearTimeout(dismissTimer);
    if (typeof onUndo === 'function') {
      try { onUndo(); } catch (e) { console.error('Undo action failed:', e); }
    }
    toastEl.classList.add('toast-exit');
    setTimeout(() => toastEl.remove(), 300);
  });

  const progressBar = toastEl.querySelector('.toast-undo-progress');
  progressBar.style.animationDuration = duration + 'ms';

  wrap.appendChild(toastEl);

  requestAnimationFrame(() => {
    toastEl.classList.add('toast-enter');
  });

  dismissTimer = setTimeout(() => {
    if (undone) return;
    toastEl.classList.add('toast-exit');
    setTimeout(() => toastEl.remove(), 300);
  }, duration);
}

// SESSION 3 — PHASE F4: Breathing Gradient Mesh Background
function injectMeshBackground() {
  if (document.querySelector('.mesh-breathing-bg')) return;
  const meshEl = document.createElement('div');
  meshEl.className = 'mesh-breathing-bg';
  meshEl.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(meshEl, document.body.firstChild);
}

document.addEventListener('DOMContentLoaded', injectMeshBackground);

// SESSION 3 — PHASE E4: Milestone Confetti Celebration
function celebrateMilestone() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const colors = ['#C8890A', '#E8A020', '#A855F7', '#22C55E', '#F5F5F7'];
  const particleCount = 80;
  const particles = [];

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 3,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 1.2) * 14,
      size: Math.random() * 6 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      gravity: 0.35,
      opacity: 1
    });
  }

  let frame = 0;
  const maxFrames = 90;

  function animate() {
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      if (frame > maxFrames * 0.6) {
        p.opacity = Math.max(0, p.opacity - 0.04);
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });

    if (frame < maxFrames) {
      requestAnimationFrame(animate);
    } else {
      canvas.remove();
    }
  }

  requestAnimationFrame(animate);
}

// Helper for SHA-256 fallback
const rightRotate = (value, amount) => (value >>> amount) | (value << (32 - amount));

// Pre-computed SHA-256 round constants (fractional parts of cube roots of the first 64 primes)
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

// Pre-computed SHA-256 initial hash values (fractional parts of square roots of the first 8 primes)
const SHA256_H = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
];

/* eslint-disable no-bitwise */
// Pure JavaScript SHA-256 fallback for file:// and non-secure environments
function sha256Fallback(str) {
  const h = [...SHA256_H];
  let asciiBytes = [];
  const asciiLength = str.length;

  for (let i = 0; i < asciiLength; i++) {
    asciiBytes[i] = (str.codePointAt(i) || 0) & 0xff;
  }

  asciiBytes.push(0x80);
  while ((asciiBytes.length * 8) % 512 !== 448) {
    asciiBytes.push(0);
  }

  let originalLengthBits = asciiLength * 8;
  const originalLengthBytes = [];
  for (let i = 7; i >= 0; i--) {
    originalLengthBytes[i] = originalLengthBits & 0xff;
    originalLengthBits = originalLengthBits >>> 8;
  }
  asciiBytes = asciiBytes.concat(originalLengthBytes);

  for (let i = 0; i < asciiBytes.length; i += 64) {
    const w = [];
    for (let j = 0; j < 16; j++) {
      w[j] = (asciiBytes[i + j * 4] << 24) | (asciiBytes[i + j * 4 + 1] << 16) | (asciiBytes[i + j * 4 + 2] << 8) | (asciiBytes[i + j * 4 + 3]);
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }

    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], temp = h[7];
    for (let j = 0; j < 64; j++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (temp + S1 + ch + SHA256_K[j] + w[j]) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      temp = g; g = f; f = e;
      e = (d + temp1) | 0;
      d = c; c = b; b = a;
      a = (temp1 + temp2) | 0;
    }

    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + temp) | 0;
  }

  let result = '';
  for (let i = 0; i < 8; i++) {
    let hexVal = (h[i] >>> 0).toString(16);
    while (hexVal.length < 8) {
      hexVal = '0' + hexVal;
    }
    result += hexVal;
  }
  return result;
}

/* eslint-enable no-bitwise */

// --- PHASE 6A: DEMO DATA SEEDER ---
async function seedDemoData() {
  try {
    if (typeof database === 'undefined') return;

    const seededSnap = await database.ref('seeded').once('value');
    const seededVal = seededSnap.val();
    // Version 2 = new seed with correct fields
    if (seededVal === 'v2') {
      console.log('Already seeded v2 — skipping.');
      return;
    }
    console.log('Seeding/Re-seeding with v2 data...');
    // Test write access first
    try {
      await database.ref('test_wiring').set({ ping: Date.now() });
      console.log('Write access confirmed ✅');
    } catch(e) {
      console.error('❌ No write access! Check Firebase rules:', e.message);
      return;
    }

    console.log('Seeding demo data...');
    const now = Date.now();
    const day = 86400000;

    // 1. Partners — write individually (rules require per-code write access)
    const partnersList = {
      'DR_DEMO':  { name: 'Demo Partner',  code: 'DR_DEMO',  joined: '28 Jun 2025' },
      'DR_RAHUL': { name: 'Rahul Sharma',  code: 'DR_RAHUL', joined: '15 Jun 2025' },
      'DR_PRIYA': { name: 'Priya Singh',   code: 'DR_PRIYA', joined: '20 Jun 2025' }
    };
    for (const [code, data] of Object.entries(partnersList)) {
      await database.ref('partners/' + code).set(data);
    }

    // 2. Deals — DR_DEMO (3 deals = Bronze tier)
    await database.ref('deals/DR_DEMO').set({
      'deal1': {
        clientName: 'Sharma Electronics', industry: 'Retail',
        clientPhone: '9876543210', cityArea: 'Kolkata',
        package: 'Pro', price: 35000, pct: 15, commission: 5250,
        stage: 'Payment Received', notes: 'Very happy client, referral possible',
        followupDate: '', addedAt: now - 5*day, date: '23 Jun 2025', partnerCode: 'DR_DEMO'
      },
      'deal2': {
        clientName: 'Gupta Sweets', industry: 'Food & Beverage',
        clientPhone: '9123456780', cityArea: 'Howrah',
        package: 'Growth', price: 25000, pct: 10, commission: 2500,
        stage: 'Closed', notes: 'Payment expected this week',
        followupDate: new Date(now + 2*day).toISOString().split('T')[0],
        addedAt: now - 2*day, date: '26 Jun 2025', partnerCode: 'DR_DEMO'
      },
      'deal3': {
        clientName: 'TechSphere Solutions', industry: 'IT Services',
        clientPhone: '9988776655', cityArea: 'Salt Lake',
        package: 'Elite', price: 75000, pct: 15, commission: 11250,
        stage: 'Negotiating', notes: 'Big client, price negotiation going on',
        followupDate: new Date(now + day).toISOString().split('T')[0],
        addedAt: now, date: '28 Jun 2025', partnerCode: 'DR_DEMO'
      }
    });

    // 3. Deals — DR_RAHUL (7 deals = Silver tier)
    const rahulPkgs = [
      { pkg:'Elite',   price:75000, pct:15, comm:11250 },
      { pkg:'Pro',     price:35000, pct:15, comm:5250  },
      { pkg:'Pro',     price:35000, pct:15, comm:5250  },
      { pkg:'Growth',  price:25000, pct:10, comm:2500  },
      { pkg:'Growth',  price:25000, pct:10, comm:2500  },
      { pkg:'Starter', price:8000,  pct:10, comm:800   },
      { pkg:'Starter', price:8000,  pct:10, comm:800   }
    ];
    const rahulDeals = {};
    rahulPkgs.forEach((p, i) => {
      rahulDeals['deal' + (i+1)] = {
        clientName: 'Client ' + (i+1) + ' (Rahul)',
        industry: ['Retail','Restaurant','Pharmacy','Textile','Electronics','Travel','Education'][i] || 'General',
        clientPhone: '98' + String(10000000 + i),
        cityArea: ['Delhi','Noida','Gurugram','Jaipur','Lucknow','Agra','Kanpur'][i] || 'Delhi',
        package: p.pkg, price: p.price, pct: p.pct, commission: p.comm,
        stage: i < 5 ? 'Payment Received' : 'Closed',
        notes: '', followupDate: '',
        addedAt: now - (7-i)*3*day,
        date: '2025-06-' + String(10 + i*3).padStart(2,'0'),
        partnerCode: 'DR_RAHUL'
      };
    });
    await database.ref('deals/DR_RAHUL').set(rahulDeals);

    // 4. Deals — DR_PRIYA (1 deal = Joining)
    await database.ref('deals/DR_PRIYA').set({
      'deal1': {
        clientName: 'Patel Garments', industry: 'Apparel',
        clientPhone: '9000011112', cityArea: 'Mumbai',
        package: 'Starter', price: 8000, pct: 10, commission: 800,
        stage: 'Pitched', notes: 'Interested, callback requested',
        followupDate: new Date(now + 3*day).toISOString().split('T')[0],
        addedAt: now - day, date: '27 Jun 2025', partnerCode: 'DR_PRIYA'
      }
    });

    // 5. Payouts — DR_DEMO (1 paid)
    await database.ref('payouts/DR_DEMO').set({
      'pay1': {
        amount: 5250, upi: 'demo@upi', status: 'paid',
        utr: '424242424242', method: 'UPI',
        requestedAt: now - 4*day, paidAt: now - 3*day,
        date: '25 Jun 2025', notifShown: true
      }
    });

    // 6. Payouts — DR_RAHUL (1 pending)
    await database.ref('payouts/DR_RAHUL').set({
      'pay1': {
        amount: 28350, upi: 'rahul.sharma@upi', status: 'pending',
        requestedAt: now - day, date: '27 Jun 2025'
      }
    });

    // 7. Announcements
    await database.ref('announcements').set({
      'ann1': {
        title: 'Welcome to DigiRise India Partner Program! 🎉',
        body: 'Aap officially DigiRise India Growth Partner ban gaye hain. Deals log karo, commission track karo, payout kab bhi request karo. Koi bhi confusion — Satyam ko WhatsApp karo.',
        urgent: false, date: '28 Jun 2025', postedAt: now - 2*day
      },
      'ann2': {
        title: '🔴 Elite Package — Highest Commission!',
        body: 'Elite package (₹75,000) pe 15% commission milega — ek deal mein ₹11,250! Premium leads ko Elite recommend karo. Is mahine top seller ko special bonus bhi milega!',
        urgent: true, date: '28 Jun 2025', postedAt: now - day
      }
    });

    // 8. Activity feed
    const acts = [
      { icon:'🎉', text:'DigiRise India Partner OS launched!', time: now - 3*day },
      { icon:'👤', text:'New partner registered: Rahul Sharma (DR_RAHUL)', time: now - 2*day },
      { icon:'👤', text:'New partner registered: Priya Singh (DR_PRIYA)', time: now - 2*day },
      { icon:'🤝', text:'Rahul Sharma logged Elite deal — ₹11,250', time: now - day },
      { icon:'💸', text:'Rahul Sharma requested payout — ₹28,350', time: now - 12*3600000 }
    ];
    for (const act of acts) {
      await database.ref('activity').push(act);
    }

    // 9. Settings default
    await database.ref('settings/whatsappNumber').set('919999999999');

    // 10. Mark seeded
    await database.ref('seeded').set('v2');
    console.log('✅ Demo data seeded successfully!');

  } catch (err) {
    console.error('Seeding error:', err);
  }
}


// SHA-256 Cryptographic utility with native/pure-JS fallback
async function hashSHA256(str) {
  // If we have native Crypto support and are in a secure context
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    try {
      const utf8 = new TextEncoder().encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn("Native crypto error, using fallback hash:", e);
    }
  }

  return sha256Fallback(str);
}

// --- Session & Authentication checks ---

// Check if user is logged in and has appropriate role.
// Returns session object on success, or null after redirecting on failure.
function checkSession(expectedRole) {
  const sessionUser = sessionStorage.getItem('sessionUser');
  const sessionRole = sessionStorage.getItem('sessionRole');

  if (!sessionUser || !sessionRole || sessionRole !== expectedRole) {
    console.warn(`Unauthorized access attempt. Expected role: ${expectedRole}. Found: ${sessionRole}. Redirecting to login...`);
    // Redirect to index.html#login
    globalThis.location.href = 'index.html#login';
    return null;
  }
  return {
    username: sessionUser,
    role: sessionRole,
    partnerCode: sessionStorage.getItem('partnerCode') || ''
  };
}

// Perform Logout
function handleLogout() {
  sessionStorage.removeItem('sessionUser');
  sessionStorage.removeItem('sessionRole');
  sessionStorage.removeItem('partnerCode');
  showToast("Logged out successfully!", "success");
  setTimeout(() => {
    globalThis.location.href = 'index.html#login';
  }, 500);
}

function setupThemeToggle() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;

  const moonIcon = btn.querySelector('.icon-moon');
  const sunIcon = btn.querySelector('.icon-sun');

  function updateIcons() {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'light') {
      if (moonIcon) moonIcon.style.display = 'block';
      if (sunIcon) sunIcon.style.display = 'none';
    } else {
      if (moonIcon) moonIcon.style.display = 'none';
      if (sunIcon) sunIcon.style.display = 'block';
    }
  }

  updateIcons();

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('digirise-theme', next);
    } catch (e) {
      console.warn('Could not persist theme preference:', e);
    }
    updateIcons();
  });
}

document.addEventListener('DOMContentLoaded', setupThemeToggle);

// =====================================================
// SESSION 4 — PHASE G1: COMMAND PALETTE (Ctrl+K)
// =====================================================
function initCommandPalette(config) {
  const overlay = document.getElementById('cmdPaletteOverlay');
  const input = document.getElementById('cmdPaletteInput');
  const resultsEl = document.getElementById('cmdPaletteResults');
  if (!overlay || !input || !resultsEl) return;

  const actions = config && config.actions ? config.actions : [];
  let filteredActions = actions;
  let selectedIndex = 0;

  function renderResults() {
    if (filteredActions.length === 0) {
      resultsEl.innerHTML = '<div class="cmd-empty">No matching actions</div>';
      return;
    }
    resultsEl.innerHTML = filteredActions.map((a, i) => `
      <div class="cmd-result-item ${i === selectedIndex ? 'cmd-selected' : ''}"
        data-index="${i}">
        <span class="cmd-result-icon">${a.icon || '→'}</span>
        <span class="cmd-result-label">${a.label}</span>
        <span class="cmd-result-hint">${a.hint || ''}</span>
      </div>
    `).join('');
  }

  function openPalette() {
    overlay.classList.add('cmd-open');
    input.value = '';
    filteredActions = actions;
    selectedIndex = 0;
    renderResults();
    setTimeout(() => input.focus(), 50);
  }

  function closePalette() {
    overlay.classList.remove('cmd-open');
  }

  function executeAction(action) {
    closePalette();
    if (action && typeof action.run === 'function') {
      try { action.run(); } catch (e) {
        console.error('Command palette action failed:', e);
      }
    }
  }

  input.addEventListener('input', () => {
    const query = input.value.toLowerCase().trim();
    filteredActions = query
      ? actions.filter(a => a.label.toLowerCase().includes(query))
      : actions;
    selectedIndex = 0;
    renderResults();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filteredActions.length - 1);
      renderResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      renderResults();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredActions[selectedIndex]) {
        executeAction(filteredActions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      closePalette();
    }
  });

  resultsEl.addEventListener('click', (e) => {
    const item = e.target.closest('.cmd-result-item');
    if (!item) return;
    const idx = parseInt(item.dataset.index, 10);
    executeAction(filteredActions[idx]);
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePalette();
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const isEditable = tag === 'input' || tag === 'textarea'
      || e.target.isContentEditable;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (overlay.classList.contains('cmd-open')) {
        closePalette();
      } else {
        if (!isEditable) openPalette();
      }
      return;
    }

    if (e.key === 'Escape' && overlay.classList.contains('cmd-open')) {
      closePalette();
    }
  });

  return { open: openPalette, close: closePalette };
}

// =====================================================
// SESSION 4 — PHASE G2: SEQUENTIAL KEY SHORTCUTS
// =====================================================
function initSequentialShortcuts(shortcutMap) {
  let lastKey = null;
  let lastKeyTime = 0;
  const sequenceWindowMs = 800;

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const isEditable = tag === 'input' || tag === 'textarea'
      || e.target.isContentEditable;
    if (isEditable) return;

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const overlay = document.getElementById('cmdPaletteOverlay');
    if (overlay && overlay.classList.contains('cmd-open')) return;

    const key = e.key.toLowerCase();
    const now = Date.now();

    if (lastKey && (now - lastKeyTime) < sequenceWindowMs) {
      const combo = lastKey + key;
      if (shortcutMap[combo]) {
        e.preventDefault();
        shortcutMap[combo]();
        lastKey = null;
        return;
      }
    }

    lastKey = key;
    lastKeyTime = now;
  });
}

// =====================================================
// SESSION 4 — PHASE G2: SHORTCUT HELP HINT ("?")
// =====================================================
function initShortcutHelpHint() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const isEditable = tag === 'input' || tag === 'textarea'
      || e.target.isContentEditable;
    if (isEditable) return;
    if (e.key !== '?') return;

    const existing = document.getElementById('shortcutHelpToast');
    if (existing) { existing.remove(); return; }

    const hint = document.createElement('div');
    hint.id = 'shortcutHelpToast';
    hint.className = 'shortcut-help-hint';
    hint.innerHTML = `
      <div class="shortcut-help-title">Keyboard Shortcuts</div>
      <div class="shortcut-help-row"><kbd>Ctrl</kbd>+<kbd>K</kbd> Command palette</div>
      <div class="shortcut-help-row"><kbd>G</kbd> then <kbd>O/L/P/H</kbd> Quick navigate</div>
      <div class="shortcut-help-row"><kbd>?</kbd> Toggle this help</div>
    `;
    document.body.appendChild(hint);
    setTimeout(() => hint.remove(), 6000);
  });
}

document.addEventListener('DOMContentLoaded', initShortcutHelpHint);

// =====================================================
// SESSION 5 — PHASE I1: OFFLINE QUEUE MANAGEMENT
// =====================================================
var DIGIRISE_QUEUE_KEY = 'digirise-offline-queue';

function getOfflineQueue() {
  try {
    var raw = localStorage.getItem(DIGIRISE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to read offline queue:', e);
    return [];
  }
}

function saveOfflineQueue(queue) {
  try {
    localStorage.setItem(DIGIRISE_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Failed to save offline queue:', e);
  }
}

function addToOfflineQueue(item) {
  var queue = getOfflineQueue();
  var queuedItem = {
    id: 'queued_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    queuedAt: Date.now(),
    type: item.type,
    payload: item.payload
  };
  queue.push(queuedItem);
  saveOfflineQueue(queue);
  updateOfflineQueueBadge();
  return queuedItem.id;
}

function removeFromOfflineQueue(queueItemId) {
  var queue = getOfflineQueue().filter(function(q) { return q.id !== queueItemId; });
  saveOfflineQueue(queue);
  updateOfflineQueueBadge();
}

function updateOfflineQueueBadge() {
  var queue = getOfflineQueue();
  var badge = document.getElementById('offlineQueueBadge');
  if (!badge) return;
  if (queue.length > 0) {
    badge.textContent = queue.length;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

function isOnline() {
  return navigator.onLine;
}

function processOfflineQueue(processorFn) {
  if (!isOnline()) return;
  var queue = getOfflineQueue();
  if (queue.length === 0) return;

  console.log('[DigiRise] Processing offline queue:', queue.length, 'item(s)');

  queue.forEach(function(item) {
    try {
      processorFn(item, function onSuccess() {
        removeFromOfflineQueue(item.id);
        console.log('[DigiRise] Synced queued item:', item.id);
      }, function onError(err) {
        console.error('[DigiRise] Failed to sync queued item:', item.id, err);
      });
    } catch (e) {
      console.error('[DigiRise] Error processing queue item:', item.id, e);
    }
  });
}

document.addEventListener('DOMContentLoaded', updateOfflineQueueBadge);

// SESSION 5 — PHASE I1: CONNECTIVITY BANNER
// Note: #offline-banner already exists from prior sessions (a Session 1 visual element).
// #connectivityBanner is a NEW element added in Session 5 for queue-aware messaging.
// These are separate elements with separate purposes — no conflict.
function setupConnectivityBanner() {
  var banner = document.getElementById('connectivityBanner');
  if (!banner) return;

  function updateBannerState() {
    if (navigator.onLine) {
      var queue = getOfflineQueue();
      if (queue.length > 0) {
        banner.textContent = 'Back online — syncing ' + queue.length + ' queued item(s)...';
        banner.className = 'connectivity-banner connectivity-syncing';
        banner.style.display = 'block';
        setTimeout(function() {
          if (getOfflineQueue().length === 0) {
            banner.style.display = 'none';
          }
        }, 3000);
      } else {
        banner.style.display = 'none';
      }
    } else {
      banner.textContent = 'You are offline — changes will be saved and synced automatically';
      banner.className = 'connectivity-banner connectivity-offline';
      banner.style.display = 'block';
    }
  }

  window.addEventListener('online', updateBannerState);
  window.addEventListener('offline', updateBannerState);
  updateBannerState();
}

document.addEventListener('DOMContentLoaded', setupConnectivityBanner);

// =====================================================
// SESSION 5 — PHASE I2: CONFLICT DETECTION HELPER
// =====================================================
function createEditSession() {
  var loadedAt = Date.now();
  var loadedValue = null;

  return {
    markLoaded: function(value) {
      loadedAt = Date.now();
      loadedValue = value;
    },
    checkConflict: function(currentRemoteValue) {
      return currentRemoteValue !== null
        && loadedValue !== null
        && currentRemoteValue !== loadedValue
        && (Date.now() - loadedAt) > 2000;
    }
  };
}

// =====================================================
// SESSION 5 — PHASE I3: SERVICE WORKER & PWA
// =====================================================
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('service-worker.js')
      .then(function(reg) {
        console.log('[DigiRise] Service worker registered:', reg.scope);
      })
      .catch(function(err) {
        console.warn('[DigiRise] Service worker registration failed:', err);
      });
  });
}

registerServiceWorker();

var deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredInstallPrompt = e;
  var installBtn = document.getElementById('installAppBtn');
  if (installBtn) installBtn.style.display = 'inline-flex';
});

function setupInstallPrompt() {
  var installBtn = document.getElementById('installAppBtn');
  if (!installBtn) return;

  installBtn.addEventListener('click', function() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(function(choice) {
      if (choice.outcome === 'accepted') {
        showToast('App installed! Find it on your home screen.', 'success');
      }
      deferredInstallPrompt = null;
      installBtn.style.display = 'none';
    });
  });
}

document.addEventListener('DOMContentLoaded', setupInstallPrompt);
