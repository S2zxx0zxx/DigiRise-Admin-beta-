/* =====================================================================
   DIGIRISE OS 2.0 — ADMIN NEXT-GEN  (additive)
   F7 Referral: "Referred by" field on registration + auto ₹500 bonus
   F10 Presence: green online dots in partners table
   ===================================================================== */
/* global database, showToast, escapeHTML */

(function () {
  'use strict';
  if (!document.getElementById('dash-dashboard')) return; // admin page only

  // =================================================================
  // F7 — REFERRAL FIELD ON REGISTRATION FORM
  // =================================================================
  function initReferralField() {
    var codeInput = document.getElementById('newPartnerCode');
    if (!codeInput) return;
    var formGroup = codeInput.closest('.form-group') || codeInput.parentNode;

    var refGroup = document.createElement('div');
    refGroup.className = 'form-group';
    refGroup.innerHTML =
      '<label for="newPartnerReferredBy">Referred By <span class="muted-text text-xs">(optional)</span></label>' +
      '<input type="text" id="newPartnerReferredBy" class="glass-input uppercase" ' +
      'placeholder="Referrer partner code e.g. DR_RAHUL">';
    formGroup.parentNode.insertBefore(refGroup, formGroup.nextSibling);

    // Hook into registration: after admin.js's own click handler saves the
    // partner, patch the referredBy field onto the new record.
    var registerBtn = document.getElementById('registerPartnerBtn');
    if (!registerBtn) return;
    registerBtn.addEventListener('click', function () {
      var code = (document.getElementById('newPartnerCode').value || '')
        .trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
      var refBy = (document.getElementById('newPartnerReferredBy').value || '')
        .trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
      if (!code || !refBy || code === refBy) return;
      // Give admin.js's set() a moment, then patch referredBy
      setTimeout(function () {
        database.ref('partners/' + code).once('value').then(function (snap) {
          if (!snap.exists()) return; // registration failed/validation blocked
          database.ref('partners/' + code + '/referredBy').set(refBy);
          document.getElementById('newPartnerReferredBy').value = '';
        });
      }, 800);
    });
  }

  // =================================================================
  // F7 — REFERRAL BONUS AUTOMATION
  //   When a referred partner's FIRST deal reaches "Payment Received",
  //   credit ₹500 referralBonus to the referrer (once, idempotent).
  // =================================================================
  function initReferralBonusEngine() {
    var partnersCache = {};
    database.ref('partners').on('value', function (snap) {
      partnersCache = snap.val() || {};
    });

    database.ref('deals').on('value', function (snap) {
      var root = snap.val() || {};
      Object.keys(root).forEach(function (code) {
        var partner = partnersCache[code];
        if (!partner || !partner.referredBy) return;
        if (partner.referralBonusPaid) return; // already credited — idempotent
        var referrer = partnersCache[partner.referredBy];
        if (!referrer) return;

        var deals = root[code] || {};
        var hasPaidDeal = Object.keys(deals).some(function (id) {
          return deals[id] && deals[id].stage === 'Payment Received';
        });
        if (!hasPaidDeal) return;

        // Credit ₹500 to referrer + mark referred partner as bonus-paid
        var refCode = partner.referredBy;
        database.ref('partners/' + code + '/referralBonusPaid').set(true).then(function () {
          return database.ref('partners/' + refCode + '/referralBonus')
            .transaction(function (cur) { return (Number(cur) || 0) + 500; });
        }).then(function () {
          database.ref('activity').push({
            icon: '🔗',
            text: 'Referral bonus ₹500 credited to ' + refCode + ' (referred ' + code + ')',
            time: Date.now()
          });
          database.ref('notifications/' + refCode).push({
            text: '🎉 Referral bonus! ₹500 credited — ' + code + ' closed their first deal.',
            time: Date.now(), read: false
          });
          if (typeof showToast === 'function') {
            showToast('Referral bonus auto-credited: ₹500 → ' + refCode, 'success');
          }
        }).catch(function () {});
      });
    });
  }

  // =================================================================
  // F10 — ONLINE PRESENCE DOTS  (partners table)
  // =================================================================
  var presenceMap = {};
  function initPresenceDots() {
    database.ref('presence').on('value', function (snap) {
      presenceMap = snap.val() || {};
      paintDots();
    });

    // Re-paint whenever admin.js re-renders the table (observe tbody)
    var tbody = document.getElementById('partnersTableBody');
    if (tbody) {
      new MutationObserver(function () { paintDots(); })
        .observe(tbody, { childList: true });
    }
  }

  function paintDots() {
    var tbody = document.getElementById('partnersTableBody');
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(function (tr) {
      var codeCell = tr.querySelector('td');
      if (!codeCell) return;
      // Partner code appears in row text; find a DR_ token
      var m = tr.textContent.match(/DR_[A-Z0-9_]+/);
      if (!m) return;
      var code = m[0];
      var online = presenceMap[code] && presenceMap[code].online === true;
      var dot = tr.querySelector('.presence-dot');
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'presence-dot';
        codeCell.insertBefore(dot, codeCell.firstChild);
      }
      dot.classList.toggle('is-online', online);
      dot.title = online ? 'Online now' : 'Offline';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var booted = false;
    function once() {
      if (booted) return; booted = true;
      try { initReferralField(); } catch (e) { console.warn('[ANG] ref field:', e); }
      try { initReferralBonusEngine(); } catch (e) { console.warn('[ANG] ref engine:', e); }
      try { initPresenceDots(); } catch (e) { console.warn('[ANG] presence:', e); }
    }
    try {
      if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged(function (u) { if (u) once(); });
        setTimeout(once, 3000);
      } else { once(); }
    } catch (e) { once(); }
  });
})();
