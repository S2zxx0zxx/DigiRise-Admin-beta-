// Public and Login views logic

document.addEventListener('DOMContentLoaded', () => {
  // Initial hash check
  handleHashChange();
  
  // Listen for hash changes
  globalThis.addEventListener('hashchange', handleHashChange);

  // Setup tab switcher for Partner vs Admin logins
  const tabPartner = document.getElementById('tab-btn-partner');
  const tabAdmin = document.getElementById('tab-btn-admin');
  const partnerForm = document.getElementById('partner-login-form');
  const adminForm = document.getElementById('admin-login-form');
  
  const themeWrapper = document.getElementById('login-theme-wrapper');
  const cardContainer = document.getElementById('login-card-container');
  const subtitleP = document.getElementById('login-subtitle-p');
  const titleH2 = document.getElementById('login-title-h2');

  if (tabPartner && partnerForm) {
    tabPartner.addEventListener('click', () => {
      tabPartner.classList.add('active');
      if(tabAdmin) tabAdmin.classList.remove('active');
      partnerForm.classList.add('login-form-active');
      if(adminForm) adminForm.classList.remove('login-form-active');
      
      // Remove purple admin theme
      if (themeWrapper) themeWrapper.classList.remove('admin-active-theme');
      if (cardContainer) cardContainer.classList.remove('admin-active-theme');
      if (tabAdmin) tabAdmin.classList.remove('admin-active-theme');
      if (subtitleP) {
        subtitleP.textContent = "Growth Partner Login";
      }
      if (titleH2) {
        titleH2.textContent = "DigiRise India";
      }
      clearErrors();
    });
  }

  if (tabAdmin && adminForm) {
    tabAdmin.addEventListener('click', () => {
      tabAdmin.classList.add('active');
      if(tabPartner) tabPartner.classList.remove('active');
      adminForm.classList.add('login-form-active');
      if(partnerForm) partnerForm.classList.remove('login-form-active');
      
      // Add purple admin theme classes
      if (themeWrapper) themeWrapper.classList.add('admin-active-theme');
      if (cardContainer) cardContainer.classList.add('admin-active-theme');
      tabAdmin.classList.add('admin-active-theme');
      if (subtitleP) {
        subtitleP.textContent = "Satyam — DigiRise India HQ";
      }
      if (titleH2) {
        titleH2.textContent = "Admin Access";
      }
      clearErrors();
    });
  }

  // Make sure partner tab is active by default on load
  if (tabPartner) tabPartner.click();
});

// Clear login error messages
function clearErrors() {
  const partnerErr = document.getElementById('partner-login-err');
  const adminErr = document.getElementById('admin-login-err');
  if (partnerErr) {
    partnerErr.textContent = '';
    partnerErr.classList.remove('visible');
  }
  if (adminErr) {
    adminErr.textContent = '';
    adminErr.classList.remove('visible');
  }
}

// Simple Router based on URL Hash
function handleHashChange() {
  const hash = globalThis.location.hash || '#public';
  const publicView = document.getElementById('view-public');
  const loginView = document.getElementById('view-login');

  if (!publicView || !loginView) return;

  if (hash === '#login') {
    publicView.classList.remove('active');
    loginView.classList.add('active');
  } else {
    // Default to #public
    loginView.classList.remove('active');
    publicView.classList.add('active');
  }
}

// Set login state loading spinner and input lockouts
function setFormLoading(role, isLoading) {
  const isPartner = role === 'partner';
  const btn = document.getElementById(isPartner ? 'btn-login-partner' : 'btn-login-admin');
  const inputs = isPartner 
    ? [document.getElementById('partner-name'), document.getElementById('partner-code')]
    : [document.getElementById('admin-password')];
    
  if (btn) {
    if (isLoading) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Logging in...`;
    } else {
      btn.disabled = false;
      btn.innerHTML = isPartner ? 'Login to Dashboard →' : 'Enter Admin Panel →';
    }
  }
  
  inputs.forEach(input => {
    if (input) input.disabled = isLoading;
  });
}

// Phase 7.11 & 7.12: Scroll Reveal & Tier Card 3D Tilt
document.addEventListener('DOMContentLoaded', () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.pub-section, .tier-pub-card, .payout-item, .cult-box').forEach(el => {
    el.classList.add('scroll-reveal');
    observer.observe(el);
  });

  document.querySelectorAll('.tier-pub-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const tiltX = (y - centerY) / 10;
      const tiltY = (centerX - x) / 10;
      card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-5px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0)';
    });
  });
});

// Real Partner Login flow querying Firebase Realtime Database
function doPartnerLogin() {
  const nameInput = document.getElementById('partner-name');
  const codeInput = document.getElementById('partner-code');
  const errEl = document.getElementById('partner-login-err');
  
  if (!nameInput || !codeInput || !errEl) return;
  
  const name = nameInput.value.trim();
  const code = codeInput.value.trim().toUpperCase();
  
  clearErrors();
  
  if (!name) {
    errEl.textContent = "❌ Client name zaroor daalo!"; // Match Hindustani prototype tone
    errEl.classList.add('visible');
    return;
  }
  
  if (!code) {
    errEl.textContent = "❌ Partner code enter karo!";
    errEl.classList.add('visible');
    return;
  }

  // Set visual loading state
  setFormLoading('partner', true);
  
  if (typeof database === 'undefined') {
    errEl.textContent = "❌ Firebase Connection not wired properly.";
    errEl.classList.add('visible');
    setFormLoading('partner', false);
    return;
  }

  // Read partner metadata from the DB
  database.ref(`partners/${code}`).once('value')
    .then((snapshot) => {
      const partner = snapshot.val();
      
      if (!partner) {
        throw new Error("❌ Invalid Partner Code. Confirm code with Satyam.");
      }

      // Case-insensitive name validation
      if (partner.name.toLowerCase() !== name.toLowerCase()) {
        throw new Error("❌ Name and Code do not match.");
      }

      // Login success: populate sessionStorage
      sessionStorage.setItem('sessionUser', partner.name);
      sessionStorage.setItem('sessionRole', 'partner');
      sessionStorage.setItem('partnerCode', partner.code);

      showToast("Congratulations ! Login successful. 🎉", "success");
      setTimeout(() => {
        globalThis.location.href = 'partner.html';
      }, 1000);
    })
    .catch((err) => {
      errEl.textContent = err.message || "❌ Login failed. Try again.";
      errEl.classList.add('visible');
      setFormLoading('partner', false);
    });
}

// Real Admin Login flow comparing input hash to SHA-256 string
function doAdminLogin() {
  const passInput = document.getElementById('admin-password');
  const errEl = document.getElementById('admin-login-err');
  
  if (!passInput || !errEl) return;
  
  const password = passInput.value.trim();
  
  clearErrors();
  
  if (!password) {
    errEl.textContent = "❌ Admin password empty!";
    errEl.classList.add('visible');
    return;
  }

  setFormLoading('admin', true);

  hashSHA256(password)
    .then(async (computedHash) => {
      
      // Step 1: Check Firebase for custom admin password hash
      let targetHash = null
      try {
        const dbHashSnap = await database.ref(
          'settings/adminPasswordHash'
        ).once('value')
        targetHash = dbHashSnap.val()
      } catch (e) {
        console.warn('Could not fetch DB hash, using default:', e)
      }

      // Step 2: Fall back to hardcoded hash if DB has none
      // Hardcoded = SHA-256 of "DR_SATYAM_2024"
      if (!targetHash) {
        targetHash = 'ebd6eb154b0a646f2a3939094863a005ca4395cfa76dc215027f217eca415b54'
      }

      // Step 3: Compare
      if (computedHash === targetHash) {
        sessionStorage.setItem('sessionUser', 'Satyam Kumar')
        sessionStorage.setItem('sessionRole', 'admin')
        showToast('Admin dashboard access authorized! 🛡️', 'success')
        setTimeout(() => {
          globalThis.location.href = 'admin.html'
        }, 1000)
      } else {
        throw new Error('❌ Wrong admin code. Try again.')
      }
    })
    .catch((err) => {
      const errEl = document.getElementById('admin-login-err')
      if (errEl) {
        errEl.textContent = err.message || '❌ Verification error.'
        errEl.classList.add('visible')
      }
      setFormLoading('admin', false)
    })
}

// Open WhatsApp application with standard prefilled query text
function openWhatsAppApply() {
  const fallbackNumber = "919999999999";
  const defaultMsg = encodeURIComponent("Hi Satyam bhai, DigiRise India Growth Partner Program mein interested hun!");
  
  // Try to load custom number from database if settings table exists
  if (typeof database === 'undefined') {
    window.open(`https://wa.me/${fallbackNumber}?text=${defaultMsg}`, '_blank');
  } else {
    database.ref('settings/whatsappNumber').once('value')
      .then((snap) => {
        const num = snap.val() || fallbackNumber;
        window.open(`https://wa.me/${num}?text=${defaultMsg}`, '_blank');
      })
      .catch(() => {
        window.open(`https://wa.me/${fallbackNumber}?text=${defaultMsg}`, '_blank');
      });
  }
}

// FAQ Toggle Logic
globalThis.toggleFaq = function(btn) {
  const item = btn.closest('.faq-item');
  if (item) {
    item.classList.toggle('active');
    const icon = btn.querySelector('.faq-icon');
    if (icon) {
      icon.textContent = item.classList.contains('active') ? '−' : '+';
    }
  }
};
