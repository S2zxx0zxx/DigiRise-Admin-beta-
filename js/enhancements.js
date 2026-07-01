/* =====================================================================
   DIGIRISE — PHASE 2..7 ENHANCEMENTS  (additive JS)
   No existing selectors touched.  Every value comes from real Firebase
   reads or client-computed derivations of those reads.
   ===================================================================== */
/* global database, formatCurrency, showToast, firebase */

(function () {
  'use strict';

  // Global feature flag: is prefers-reduced-motion active?
  const REDUCE = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─────────────────────────────────────────────────────────────
  // AUTH RETRY  (network-flake tolerant)
  //   shared.js signs in anonymously once.  On the preview URL the
  //   first attempt sometimes fails with auth/network-request-failed
  //   with no retry — freezing all reads with permission_denied.
  //   This helper retries silently up to N times.
  // ─────────────────────────────────────────────────────────────
  function ensureAnonAuth(attempt) {
    attempt = attempt || 0;
    if (typeof firebase === 'undefined' || !firebase.auth) return;
    if (firebase.auth().currentUser) return;
    firebase.auth().signInAnonymously().catch((err) => {
      console.warn('[DR] anon retry ' + attempt + ' failed:', err && err.code);
      if (attempt < 5) {
        setTimeout(() => ensureAnonAuth(attempt + 1), 900 + attempt * 700);
      }
    });
  }
  window.addEventListener('load', () => setTimeout(() => ensureAnonAuth(0), 500));

  // ─────────────────────────────────────────────────────────────
  // COUNT-UP: animate any element with data-countup
  //   data-countup, data-currency (optional)
  //   Called on-demand by data streams
  // ─────────────────────────────────────────────────────────────
  function animateCount(el, from, to, durationMs, currency) {
    if (!el) return;
    if (REDUCE || durationMs <= 0) {
      el.textContent = currency ? formatIndianCurrency(to) : formatIndianNum(to);
      return;
    }
    let start = null;
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    function step(ts) {
      if (!start) start = ts;
      const p = Math.min((ts - start) / durationMs, 1);
      const val = Math.floor(from + (to - from) * easeOut(p));
      el.textContent = currency ? formatIndianCurrency(val) : formatIndianNum(val);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = currency ? formatIndianCurrency(to) : formatIndianNum(to);
    }
    requestAnimationFrame(step);
  }
  function formatIndianNum(n) {
    try { return new Intl.NumberFormat('en-IN').format(n); }
    catch (e) { return String(n); }
  }
  function formatIndianCurrency(n) {
    if (typeof formatCurrency === 'function') return formatCurrency(n);
    try { return '₹' + new Intl.NumberFormat('en-IN').format(n); }
    catch (e) { return '₹' + n; }
  }

  // Expose helpers
  window.DR_ENH = window.DR_ENH || {};
  window.DR_ENH.animateCount = animateCount;
  window.DR_ENH.formatIndianCurrency = formatIndianCurrency;

  // ─────────────────────────────────────────────────────────────
  // PHASE 2 — HOMEPAGE  Live Firebase stats
  //   Fills #liveStatPartners / #liveStatDeals / #liveStatCommission
  //   / #liveStatPaid and hero #heroLivePartnersLabel from real data.
  // ─────────────────────────────────────────────────────────────
  function initHomepageLiveStats() {
    if (!document.getElementById('liveStatPartners')) return;
    if (typeof database === 'undefined') {
      console.warn('[DR] Live stats: database undefined');
      return;
    }

    let partnersCount = 0;
    let dealsCount = 0;
    let commissionTotal = 0;
    let paidTotal = 0;
    let attached = false;

    function push(elId, val, currency, delay) {
      const el = document.getElementById(elId);
      if (!el) return;
      setTimeout(() => animateCount(el, 0, val, 900, !!currency), delay || 0);
    }

    function attach() {
      if (attached) return;
      attached = true;
      console.log('[DR] Live stats: attaching listeners…');

      database.ref('partners').on('value', (snap) => {
        const v = snap.val() || {};
        partnersCount = Object.keys(v).length;
        push('liveStatPartners', partnersCount);
        const heroLabel = document.getElementById('heroLivePartnersLabel');
        if (heroLabel) animateCount(heroLabel, 0, partnersCount, 1100, false);
      }, (err) => {
        console.warn('[DR] partners listener error:', err.message);
        attached = false; // allow re-attach on next auth event
      });

      database.ref('deals').on('value', (snap) => {
        const v = snap.val() || {};
        dealsCount = 0;
        commissionTotal = 0;
        Object.keys(v).forEach((code) => {
          const dealsByCode = v[code] || {};
          Object.keys(dealsByCode).forEach((id) => {
            const d = dealsByCode[id] || {};
            dealsCount += 1;
            commissionTotal += Number(d.commission) || 0;
          });
        });
        push('liveStatDeals', dealsCount);
        push('liveStatCommission', commissionTotal, true, 120);
      }, (err) => {
        console.warn('[DR] deals listener error:', err.message);
        attached = false;
      });

      database.ref('payouts').on('value', (snap) => {
        const v = snap.val() || {};
        paidTotal = 0;
        Object.keys(v).forEach((code) => {
          const payoutsByCode = v[code] || {};
          Object.keys(payoutsByCode).forEach((id) => {
            const p = payoutsByCode[id] || {};
            if (p.status === 'paid') paidTotal += Number(p.amount) || 0;
          });
        });
        push('liveStatPaid', paidTotal, true, 220);
      }, (err) => {
        console.warn('[DR] payouts listener error:', err.message);
        attached = false;
      });
    }

    // Wait for anon auth to be present before attaching data listeners.
    if (typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().onAuthStateChanged((user) => {
        if (user) attach();
      });
      // Safety poll in case auth silently succeeded earlier
      setTimeout(() => {
        if (!attached && firebase.auth().currentUser) attach();
      }, 1500);
    } else {
      attach();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PHASE 2 — 3D pointer tilt for step + showcase cards
  // ─────────────────────────────────────────────────────────────
  function initCardTilt() {
    if (REDUCE) return;
    const cards = document.querySelectorAll('.step-card, .showcase-card');
    cards.forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const dx = (e.clientX - rect.left - cx) / cx;
        const dy = (e.clientY - rect.top - cy) / cy;
        card.style.setProperty('--tilt-x', String(-dy * 6));
        card.style.setProperty('--tilt-y', String(dx * 6));
      });
      card.addEventListener('mouseleave', () => {
        card.style.setProperty('--tilt-x', '0');
        card.style.setProperty('--tilt-y', '0');
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // PHASE 6 — CUSTOM PWA INSTALL PROMPT
  //   Uses window.deferredInstallPrompt captured by existing
  //   beforeinstallprompt handler in shared.js.  Suppresses default
  //   #installAppBtn in favor of the custom modal.
  // ─────────────────────────────────────────────────────────────
  function initPwaModal() {
    const modal = document.getElementById('pwaInstallModal');
    if (!modal) return;

    const laterBtn  = document.getElementById('pwaInstallLater');
    const acceptBtn = document.getElementById('pwaInstallAccept');
    const DISMISS_KEY = 'digirise-pwa-dismissed-at';

    function isDismissedRecently() {
      try {
        const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
        if (!ts) return false;
        // 3 days snooze after dismissal
        return (Date.now() - ts) < 3 * 24 * 60 * 60 * 1000;
      } catch (e) { return false; }
    }
    function isStandalone() {
      return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
    }

    function openModal() {
      if (isStandalone() || isDismissedRecently()) return;
      modal.classList.add('is-open');
    }
    function closeModal(persistDismiss) {
      modal.classList.remove('is-open');
      if (persistDismiss) {
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); }
        catch (e) { /* ignore */ }
      }
    }

    // Hide the small #installAppBtn header button so we don't have two prompts
    const smallBtn = document.getElementById('installAppBtn');
    if (smallBtn) smallBtn.style.display = 'none';

    if (laterBtn)  laterBtn.addEventListener('click', () => closeModal(true));
    if (acceptBtn) acceptBtn.addEventListener('click', () => {
      const dp = window.deferredInstallPrompt;
      if (dp && typeof dp.prompt === 'function') {
        dp.prompt();
        dp.userChoice.then((choice) => {
          if (choice.outcome === 'accepted') {
            try {
              if (typeof showToast === 'function') showToast('Installing… find DigiRise OS on your home screen.', 'success');
            } catch (e) { /* ignore */ }
          }
          window.deferredInstallPrompt = null;
          closeModal(true);
        });
      } else {
        // No native prompt available — direct users manually
        try {
          if (typeof showToast === 'function') {
            showToast('Open your browser menu → "Add to Home Screen" to install.', 'info');
          }
        } catch (e) { /* ignore */ }
        closeModal(true);
      }
    });

    // Auto-show 3s after page load if we already captured a prompt.
    // If not yet captured, listen for it too.
    setTimeout(() => {
      if (window.deferredInstallPrompt) openModal();
    }, 3000);
    window.addEventListener('beforeinstallprompt', () => {
      // shared.js already prevents default + captures — we just re-check
      setTimeout(openModal, 800);
    });

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(true);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal(true);
    });
  }

  // Kick everything off on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    initHomepageLiveStats();
    initCardTilt();
    initPwaModal();

    // Enhance FAQ button "+" -> "−" toggle is already handled by
    // globalThis.toggleFaq in index.js.  We only add the smooth-height
    // CSS-driven animation via .faq-item.active (already done in CSS).

    // Featured pricing card tilt on hover — reuse tilt initialization
    // is skipped for comm-cards on purpose (they get the glow instead).
  });
})();
