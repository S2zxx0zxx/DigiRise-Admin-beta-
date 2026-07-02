/* =====================================================================
   DIGIRISE OS 2.0 — NEXT-GEN FEATURES  (Phase 1 + 2)
   F2 Follow-up Reminders · F9 Live Activity Feed · F4 Goals System
   F8 Smart Insights · F7 Referral UI · Calculator Slider · Bottom Nav
   ---------------------------------------------------------------------
   100% additive. Reuses the `database` global from firebase-config.js
   and helpers (formatCurrency, escapeHTML, showToast) from shared.js.
   Every number rendered here comes LIVE from Firebase. Zero hardcode.
   ===================================================================== */
/* global database, formatCurrency, escapeHTML, showToast, celebrateMilestone */

(function () {
  'use strict';

  var REDUCE = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ───────────────────────────────────────────────────────────────
  // PAGE DETECTION
  // ───────────────────────────────────────────────────────────────
  var IS_PARTNER = !!document.querySelector('#overview.tab-section');
  var IS_INDEX   = !!document.getElementById('view-public');

  var code = null, username = null;
  if (IS_PARTNER) {
    code = sessionStorage.getItem('partnerCode');
    username = sessionStorage.getItem('sessionUser') || 'Partner';
    if (!code) return; // not logged in — partner features skip
  }

  // Small util: mask a partner code for public display  DR_RAHUL → DR_R***L
  function maskCode(c) {
    if (!c || c.length < 5) return c || 'DR_***';
    var body = c.replace(/^DR_/, '');
    if (body.length <= 2) return 'DR_' + body[0] + '*';
    return 'DR_' + body[0] + '***' + body[body.length - 1];
  }

  function timeAgo(ts) {
    if (!ts) return '';
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    var m = Math.floor(s / 60);
    if (m < 60) return m + ' min ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' hr ago';
    var d = Math.floor(h / 24);
    return d + 'd ago';
  }

  // =================================================================
  // F2 — SMART FOLLOW-UP REMINDER BANNER  (partner Overview)
  // =================================================================
  function initFollowupReminders() {
    if (!IS_PARTNER) return;
    var overview = document.getElementById('overview');
    if (!overview) return;

    // Create banner container once, insert at very top of Overview
    var banner = document.createElement('div');
    banner.id = 'followupBanner';
    banner.className = 'followup-banner';
    banner.style.display = 'none';
    overview.insertBefore(banner, overview.firstChild);

    database.ref('deals/' + code).on('value', function (snap) {
      var data = snap.val() || {};
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var overdue = 0, dueToday = 0;

      Object.keys(data).forEach(function (id) {
        var d = data[id];
        if (!d || !d.followupDate) return;
        // skip completed deals
        if (d.stage === 'Payment Received') return;
        var fd = new Date(d.followupDate); fd.setHours(0, 0, 0, 0);
        if (fd < today) overdue++;
        else if (fd.getTime() === today.getTime()) dueToday++;
      });

      if (overdue === 0 && dueToday === 0) {
        banner.style.display = 'none';
        return;
      }

      var parts = [];
      if (overdue > 0) parts.push('<span class="fu-overdue">' + overdue + ' overdue</span>');
      if (dueToday > 0) parts.push('<span class="fu-today">' + dueToday + ' due today</span>');

      banner.innerHTML =
        '<div class="fu-left">' +
          '<span class="fu-icon">⏰</span>' +
          '<span class="fu-text">Follow-ups need attention: ' + parts.join(' · ') + '</span>' +
        '</div>' +
        '<button class="fu-cta" type="button">View Pipeline →</button>';
      banner.style.display = 'flex';

      banner.querySelector('.fu-cta').onclick = function () {
        var btn = document.querySelector('.tab-btn[data-target="pipeline"]');
        if (btn) btn.click();
      };
    });
  }

  // =================================================================
  // F9 — LIVE ACTIVITY FEED
  //   • Partner Overview: mini feed widget (last 6)
  //   • Homepage: marquee ticker
  //   Firebase `activity` node already written to by partner.js!
  // =================================================================
  function activityLine(a) {
    var icon = a.icon || '⚡';
    var text = String(a.text || '');
    // Mask any full partner codes appearing in the text
    text = text.replace(/DR_[A-Z0-9_]{2,}/g, function (m) { return maskCode(m); });
    return { icon: icon, text: escapeHTML(text), time: a.time || 0 };
  }

  function initActivityFeedPartner() {
    if (!IS_PARTNER) return;
    var overview = document.getElementById('overview');
    if (!overview) return;

    var card = document.createElement('div');
    card.className = 'glass-card activity-feed-card mt-4';
    card.innerHTML =
      '<div class="af-header">' +
        '<span class="af-live-dot"></span>' +
        '<h3 class="m-0">Live Activity</h3>' +
        '<span class="af-sub">across all partners</span>' +
      '</div>' +
      '<div id="activityFeedList" class="af-list"><div class="af-empty">Listening for live activity…</div></div>';
    overview.appendChild(card);

    database.ref('activity').limitToLast(6).on('value', function (snap) {
      var data = snap.val() || {};
      var items = Object.keys(data).map(function (k) { return activityLine(data[k]); })
        .sort(function (a, b) { return b.time - a.time; });
      var list = document.getElementById('activityFeedList');
      if (!list) return;
      if (!items.length) {
        list.innerHTML = '<div class="af-empty">No activity yet — be the first to close a deal! 🔥</div>';
        return;
      }
      list.innerHTML = items.map(function (it) {
        return '<div class="af-item">' +
          '<span class="af-icon">' + it.icon + '</span>' +
          '<span class="af-text">' + it.text + '</span>' +
          '<span class="af-time">' + timeAgo(it.time) + '</span>' +
        '</div>';
      }).join('');
    });
  }

  function initActivityTickerHome() {
    if (!IS_INDEX) return;
    var hero = document.querySelector('.pub-hero');
    if (!hero) return;

    var wrap = document.createElement('div');
    wrap.className = 'ticker-wrap';
    wrap.innerHTML = '<div class="ticker-track" id="tickerTrack"></div>';
    hero.parentNode.insertBefore(wrap, hero.nextSibling);

    database.ref('activity').limitToLast(10).on('value', function (snap) {
      var data = snap.val() || {};
      var items = Object.keys(data).map(function (k) { return activityLine(data[k]); })
        .sort(function (a, b) { return b.time - a.time; });
      var track = document.getElementById('tickerTrack');
      if (!track) return;
      if (!items.length) { wrap.style.display = 'none'; return; }
      wrap.style.display = '';
      var html = items.map(function (it) {
        return '<span class="ticker-item">' + it.icon + ' ' + it.text + '</span>';
      }).join('<span class="ticker-sep">•</span>');
      // duplicate for seamless loop
      track.innerHTML = html + '<span class="ticker-sep">•</span>' + html;
    });
  }

  // Homepage: live "total commission paid" counter from payouts
  function initHomeLiveTotals() {
    if (!IS_INDEX) return;
    var strip = document.querySelector('[data-testid="real-stats-section"]');
    // find the hero live badge area to add total-paid line
    var badge = document.querySelector('.hero-live-badge');
    if (!badge) return;

    database.ref('payouts').once('value').then(function (snap) {
      var root = snap.val() || {};
      var total = 0;
      Object.keys(root).forEach(function (c) {
        var per = root[c] || {};
        Object.keys(per).forEach(function (id) {
          var p = per[id];
          if (p && p.status === 'paid') total += Number(p.amount || 0);
        });
      });
      if (total <= 0) return;
      var line = document.createElement('div');
      line.className = 'hero-paid-line';
      line.innerHTML = '💸 <strong>' + formatCurrency(total) + '</strong> commission paid out so far';
      badge.parentNode.insertBefore(line, badge.nextSibling);
    }).catch(function () {});
  }

  // =================================================================
  // F4 — GOALS SYSTEM  (partner Overview widget + persistence)
  // =================================================================
  function initGoals() {
    if (!IS_PARTNER) return;
    var overview = document.getElementById('overview');
    if (!overview) return;

    var card = document.createElement('div');
    card.className = 'glass-card goal-card mt-4';
    card.innerHTML =
      '<div class="goal-head">' +
        '<div>' +
          '<span class="eyebrow">🎯 Monthly Goal</span>' +
          '<h3 class="m-0" id="goalTitle">Set your target</h3>' +
        '</div>' +
        '<button class="goal-edit-btn" id="goalEditBtn" type="button" title="Edit goal">✎</button>' +
      '</div>' +
      '<div class="goal-body">' +
        '<div class="goal-ring-wrap">' +
          '<svg viewBox="0 0 80 80" class="goal-ring">' +
            '<circle class="goal-ring-bg" cx="40" cy="40" r="34"/>' +
            '<circle class="goal-ring-fill" id="goalRingFill" cx="40" cy="40" r="34"/>' +
          '</svg>' +
          '<div class="goal-ring-center" id="goalRingPct">—</div>' +
        '</div>' +
        '<div class="goal-info">' +
          '<div class="goal-progress-text" id="goalProgressText">No goal set for this month</div>' +
          '<div class="goal-sub" id="goalSub">Tap ✎ to set a monthly deals target</div>' +
        '</div>' +
      '</div>';
    overview.appendChild(card);

    var CIRC = 2 * Math.PI * 34;
    var ring = card.querySelector('#goalRingFill');
    ring.style.strokeDasharray = CIRC;
    ring.style.strokeDashoffset = CIRC;

    var currentGoal = 0;
    var dealsThisMonth = 0;
    var celebrated = false;

    function monthKey() {
      var n = new Date();
      return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0');
    }

    function render() {
      var pctEl = card.querySelector('#goalRingPct');
      var txt = card.querySelector('#goalProgressText');
      var sub = card.querySelector('#goalSub');
      var title = card.querySelector('#goalTitle');

      if (!currentGoal || currentGoal < 1) {
        pctEl.textContent = '—';
        title.textContent = 'Set your target';
        txt.textContent = 'No goal set for this month';
        sub.textContent = 'Tap ✎ to set a monthly deals target';
        ring.style.strokeDashoffset = CIRC;
        return;
      }
      var pct = Math.min(100, Math.round((dealsThisMonth / currentGoal) * 100));
      pctEl.textContent = pct + '%';
      title.textContent = dealsThisMonth + ' / ' + currentGoal + ' deals';
      var remaining = Math.max(0, currentGoal - dealsThisMonth);
      txt.textContent = remaining === 0
        ? '🎉 Goal achieved! Legendary month.'
        : remaining + ' more deal' + (remaining > 1 ? 's' : '') + ' to hit your goal';
      sub.textContent = 'Goal for ' + new Date().toLocaleDateString('en-IN', { month: 'long' });
      ring.style.strokeDashoffset = CIRC - (CIRC * pct / 100);

      if (pct >= 100 && !celebrated) {
        celebrated = true;
        if (typeof celebrateMilestone === 'function' && !REDUCE) celebrateMilestone();
        if (typeof showToast === 'function') showToast('🎯 Monthly goal achieved! Beast mode.', 'success');
      }
    }

    // Load saved goal
    database.ref('partners/' + code + '/goals/' + monthKey()).on('value', function (snap) {
      currentGoal = Number(snap.val() || 0);
      render();
    });

    // Live deals-this-month count
    database.ref('deals/' + code).on('value', function (snap) {
      var data = snap.val() || {};
      var n = new Date(); var y = n.getFullYear(); var m = n.getMonth();
      dealsThisMonth = Object.keys(data).filter(function (id) {
        var d = new Date(data[id].addedAt || 0);
        return d.getFullYear() === y && d.getMonth() === m;
      }).length;
      render();
    });

    // Edit goal flow
    card.querySelector('#goalEditBtn').onclick = function () {
      var v = prompt('Is month kitne deals ka target? (1–50)', currentGoal || 5);
      if (v === null) return;
      var num = parseInt(v, 10);
      if (isNaN(num) || num < 1 || num > 50) {
        if (typeof showToast === 'function') showToast('1 se 50 ke beech number daalo', 'error');
        return;
      }
      celebrated = false;
      database.ref('partners/' + code + '/goals/' + monthKey()).set(num)
        .then(function () {
          if (typeof showToast === 'function') showToast('Goal set: ' + num + ' deals this month 🎯', 'success');
        });
    };
  }

  // =================================================================
  // F8 — SMART INSIGHTS ENGINE  (pure client-side pattern analysis)
  // =================================================================
  function initInsights() {
    if (!IS_PARTNER) return;
    var overview = document.getElementById('overview');
    if (!overview) return;

    var card = document.createElement('div');
    card.className = 'glass-card insight-card mt-4';
    card.innerHTML =
      '<div class="insight-head"><span class="insight-bulb">💡</span>' +
      '<span class="eyebrow">Insight of the Day</span></div>' +
      '<div class="insight-text" id="insightText">Analyzing your deal patterns…</div>';
    overview.appendChild(card);

    database.ref('deals/' + code).on('value', function (snap) {
      var data = snap.val() || {};
      var deals = Object.keys(data).map(function (k) { return data[k]; });
      var el = document.getElementById('insightText');
      if (!el) return;

      var insights = [];

      if (!deals.length) {
        el.textContent = 'Pehla deal log karo — pattern analysis wahi se shuru hoga. Har big earner ne kahin se shuru kiya tha 🚀';
        return;
      }

      // Industry concentration
      var byInd = {};
      deals.forEach(function (d) {
        var ind = (d.industry || '').trim();
        if (ind) byInd[ind] = (byInd[ind] || 0) + 1;
      });
      var topInd = Object.keys(byInd).sort(function (a, b) { return byInd[b] - byInd[a]; })[0];
      if (topInd && byInd[topInd] / deals.length >= 0.5 && deals.length >= 2) {
        insights.push('Tumhare ' + Math.round(byInd[topInd] / deals.length * 100) + '% deals <strong>' +
          escapeHTML(topInd) + '</strong> industry se hain — is niche mein tumhara network strong hai, aur leads yahi se nikalo.');
      }

      // Best closing day-of-week
      var closed = deals.filter(function (d) { return d.stage === 'Closed' || d.stage === 'Payment Received'; });
      if (closed.length >= 2) {
        var byDay = {};
        var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        closed.forEach(function (d) {
          var day = new Date(d.addedAt || 0).getDay();
          byDay[day] = (byDay[day] || 0) + 1;
        });
        var topDay = Object.keys(byDay).sort(function (a, b) { return byDay[b] - byDay[a]; })[0];
        if (byDay[topDay] >= 2) {
          insights.push('<strong>' + dayNames[topDay] + '</strong> ko tumhare sabse zyada deals close hue hain — us din client calls schedule karo.');
        }
      }

      // Best converting package
      var byPkg = {};
      closed.forEach(function (d) {
        if (d.package) byPkg[d.package] = (byPkg[d.package] || 0) + 1;
      });
      var topPkg = Object.keys(byPkg).sort(function (a, b) { return byPkg[b] - byPkg[a]; })[0];
      if (topPkg && byPkg[topPkg] >= 2) {
        insights.push('<strong>' + escapeHTML(topPkg) + '</strong> package pe tumhara conversion sabse strong hai — premium leads ko confidently yahi pitch karo.');
      }

      // Inactivity nudge
      var lastDealAt = Math.max.apply(null, deals.map(function (d) { return d.addedAt || 0; }));
      var daysSince = Math.floor((Date.now() - lastDealAt) / 86400000);
      if (daysSince >= 10) {
        insights.push(daysSince + ' din se koi naya deal log nahi hua — ek chhota follow-up call aaj hi try karo, momentum wapas aayega 💪');
      }

      // Pipeline stuck nudge
      var stuck = deals.filter(function (d) {
        return d.stage !== 'Payment Received' && d.stage !== 'Closed' &&
          (Date.now() - (d.addedAt || 0)) > 7 * 86400000;
      });
      if (stuck.length >= 2) {
        insights.push(stuck.length + ' deals pipeline mein 7+ din se same stage pe hain — ek nudge message unhe aage badha sakta hai.');
      }

      if (!insights.length) {
        insights.push('Consistent effort dikh raha hai — ' + deals.length + ' deal' + (deals.length > 1 ? 's' : '') +
          ' logged. Aaj ek naya lead add karke pipeline garam rakho 🔥');
      }

      // Rotate insight daily (stable per day)
      var dayIdx = Math.floor(Date.now() / 86400000) % insights.length;
      el.innerHTML = insights[dayIdx];
    });
  }

  // =================================================================
  // F7 — REFERRAL UI  (Profile tab section)
  // =================================================================
  function initReferralUI() {
    if (!IS_PARTNER) return;
    var profile = document.getElementById('profile');
    if (!profile) return;
    var container = profile.querySelector('.profile-section') || profile;

    var grp = document.createElement('div');
    grp.className = 'settings-group referral-group';
    grp.innerHTML =
      '<div class="settings-group-title">🔗 Refer & Earn</div>' +
      '<div class="referral-box">' +
        '<div class="referral-info">' +
          '<div class="referral-label">Your Referral Code</div>' +
          '<div class="referral-code" id="refCodeDisplay">' + escapeHTML(code) + '</div>' +
          '<div class="referral-hint">Naye partner ko yeh code do — uski pehli deal close hote hi tumhe <strong>₹500 bonus</strong> milega!</div>' +
        '</div>' +
        '<div class="referral-actions">' +
          '<button class="outline-gold-btn" id="refCopyBtn" type="button">Copy Code</button>' +
          '<button class="gold-btn" id="refShareBtn" type="button">Share on WhatsApp</button>' +
        '</div>' +
      '</div>' +
      '<div class="referral-stats" id="refStats"></div>';
    container.appendChild(grp);

    grp.querySelector('#refCopyBtn').onclick = function () {
      navigator.clipboard.writeText(code).then(function () {
        if (typeof showToast === 'function') showToast('Referral code copied!', 'success');
      });
    };
    grp.querySelector('#refShareBtn').onclick = function () {
      var msg = 'DigiRise India Growth Partner Program join karo! 💰\n\n' +
        '10-15% commission har deal pe, instant payout, full flexibility.\n\n' +
        'Mera referral code: ' + code + '\n\n' +
        'Apply karo: https://digi-rise-admin-beta.vercel.app';
      window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
    };

    // Live referral earnings display
    database.ref('partners/' + code + '/referralBonus').on('value', function (snap) {
      var total = Number(snap.val() || 0);
      var el = document.getElementById('refStats');
      if (!el) return;
      el.innerHTML = total > 0
        ? '<div class="ref-earned">💰 Referral earnings so far: <strong>' + formatCurrency(total) + '</strong></div>'
        : '';
    });
  }

  // =================================================================
  // CALCULATOR 2.0 — slider + projection + reverse calc + share
  // =================================================================
  function initCalculatorUpgrade() {
    if (!IS_PARTNER) return;
    var qtyInput = document.getElementById('calcQty');
    var controls = document.querySelector('.calc-controls');
    if (!qtyInput || !controls) return;

    // Insert slider above the +/- controls (keep existing controls working)
    var sliderWrap = document.createElement('div');
    sliderWrap.className = 'calc-slider-wrap';
    sliderWrap.innerHTML =
      '<input type="range" id="calcSlider" min="1" max="30" value="1" class="calc-slider" aria-label="Deals slider">' +
      '<div class="calc-slider-marks"><span>1</span><span>10</span><span>20</span><span>30</span></div>';
    controls.appendChild(sliderWrap);

    var slider = sliderWrap.querySelector('#calcSlider');

    function syncFromSlider() {
      qtyInput.value = slider.value;
      // partner.js exposes its recalc after first run (window._drUpdateCalculator)
      if (typeof window._drUpdateCalculator === 'function') {
        window._drUpdateCalculator();
      }
      updateProjection();
    }
    slider.addEventListener('input', syncFromSlider);

    // Keep slider in sync when +/- used
    ['calcPlus', 'calcMinus'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', function () {
        setTimeout(function () { slider.value = qtyInput.value; updateProjection(); }, 20);
      });
    });

    // Projection line: "at your current pace, N deals ≈ X weeks"
    var proj = document.createElement('div');
    proj.className = 'calc-projection';
    proj.id = 'calcProjection';
    var resultBox = document.querySelector('.calc-result-box');
    if (resultBox) resultBox.appendChild(proj);

    var recentPace = 0; // deals per week from live data
    database.ref('deals/' + code).on('value', function (snap) {
      var data = snap.val() || {};
      var cutoff = Date.now() - 28 * 86400000;
      var recent = Object.keys(data).filter(function (id) {
        return (data[id].addedAt || 0) >= cutoff;
      }).length;
      recentPace = recent / 4; // per week
      updateProjection();
    });

    function updateProjection() {
      var el = document.getElementById('calcProjection');
      if (!el) return;
      var target = parseInt(qtyInput.value, 10) || 1;
      if (recentPace <= 0) {
        el.innerHTML = '📈 Pehla deal log karo — phir yahan projection dikhega ki yeh target kitne weeks mein possible hai.';
        return;
      }
      var weeks = Math.ceil(target / recentPace);
      el.innerHTML = '📈 Tumhari current pace (' + recentPace.toFixed(1) + ' deals/week) pe <strong>' +
        target + ' deals ≈ ' + weeks + ' week' + (weeks > 1 ? 's' : '') + '</strong> mein possible hai.';
    }

    // WhatsApp share of projection
    var share = document.createElement('button');
    share.className = 'outline-gold-btn w-full mt-3';
    share.type = 'button';
    share.textContent = '📤 Share Earnings Projection';
    if (resultBox) resultBox.appendChild(share);
    share.onclick = function () {
      var total = (document.getElementById('calcGrandTotal') || {}).textContent || '₹0';
      var qty = qtyInput.value;
      var msg = 'DigiRise Partner Program 💰\n\n' + qty + ' deals = ' + total.trim() +
        ' earning potential!\n\nJoin karo: https://digi-rise-admin-beta.vercel.app';
      window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
    };
  }

  // =================================================================
  // MOBILE BOTTOM NAVIGATION + GOLD FAB  (partner only, <560px)
  // =================================================================
  function initBottomNav() {
    if (!IS_PARTNER) return;

    var nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.setAttribute('aria-label', 'Primary');
    nav.innerHTML =
      '<button class="bn-item active" data-bn="overview" type="button">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>' +
        '<span>Home</span></button>' +
      '<button class="bn-item" data-bn="pipeline" type="button">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>' +
        '<span>Deals</span></button>' +
      '<button class="bn-fab" data-bn="logDeal" type="button" aria-label="Log a new deal">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      '</button>' +
      '<button class="bn-item" data-bn="trophies" type="button">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>' +
        '<span>Trophies</span></button>' +
      '<button class="bn-item" data-bn="profile" type="button">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
        '<span>Profile</span></button>';
    document.body.appendChild(nav);

    function go(target, btn) {
      var tabBtn = document.querySelector('.tab-btn[data-target="' + target + '"]');
      if (tabBtn) tabBtn.click();
      nav.querySelectorAll('.bn-item').forEach(function (b) { b.classList.remove('active'); });
      if (btn && btn.classList.contains('bn-item')) btn.classList.add('active');
      window.scrollTo({ top: 0, behavior: REDUCE ? 'auto' : 'smooth' });
    }

    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-bn]');
      if (!btn) return;
      go(btn.getAttribute('data-bn'), btn);
    });

    // Sync bottom nav highlight when top tabs are used
    document.querySelectorAll('.tab-btn[data-target]').forEach(function (tb) {
      tb.addEventListener('click', function () {
        var t = tb.getAttribute('data-target');
        nav.querySelectorAll('.bn-item').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-bn') === t);
        });
      });
    });
  }

  // =================================================================
  // F10 — PRESENCE WRITER  (partner side)
  //   Writes presence/{code} = { online: true, lastSeen } and uses
  //   onDisconnect() so Firebase auto-marks offline when tab closes.
  // =================================================================
  function initPresenceWriter() {
    if (!IS_PARTNER) return;
    try {
      var ref = database.ref('presence/' + code);
      var connRef = database.ref('.info/connected');
      connRef.on('value', function (snap) {
        if (snap.val() === true) {
          ref.onDisconnect().set({ online: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
          ref.set({ online: true, lastSeen: firebase.database.ServerValue.TIMESTAMP });
        }
      });
    } catch (e) { console.warn('[NG] presence writer:', e); }
  }

  // =================================================================
  // F3 — MONTHLY REPORT CARD  (Trophies tab, WhatsApp shareable)
  // =================================================================
  function initReportCard() {
    if (!IS_PARTNER) return;
    var trophies = document.getElementById('trophies');
    if (!trophies) return;

    var card = document.createElement('div');
    card.className = 'glass-card report-card mt-4';
    card.innerHTML =
      '<div class="rc-head">' +
        '<span class="eyebrow">📊 Monthly Report Card</span>' +
        '<h3 class="m-0" id="rcMonth"></h3>' +
      '</div>' +
      '<div class="rc-grid">' +
        '<div class="rc-stat"><div class="rc-label">Deals Closed</div><div class="rc-val" id="rcDeals">—</div><div class="rc-delta" id="rcDealsDelta"></div></div>' +
        '<div class="rc-stat"><div class="rc-label">Commission Earned</div><div class="rc-val text-green" id="rcEarned">—</div><div class="rc-delta" id="rcEarnedDelta"></div></div>' +
        '<div class="rc-stat"><div class="rc-label">Best Deal</div><div class="rc-val text-gold" id="rcBest">—</div><div class="rc-delta" id="rcBestSub"></div></div>' +
      '</div>' +
      '<button class="gold-btn w-full mt-3" id="rcShareBtn" type="button">📤 Share Report on WhatsApp</button>';
    trophies.appendChild(card);

    var rcData = { deals: 0, earned: 0, best: 0, prevDeals: 0, prevEarned: 0 };

    database.ref('deals/' + code).on('value', function (snap) {
      var data = snap.val() || {};
      var now = new Date();
      var y = now.getFullYear(), m = now.getMonth();
      var py = m === 0 ? y - 1 : y, pm = m === 0 ? 11 : m - 1;

      rcData = { deals: 0, earned: 0, best: 0, prevDeals: 0, prevEarned: 0 };
      Object.keys(data).forEach(function (id) {
        var d = data[id];
        var dd = new Date(d.addedAt || 0);
        var comm = Number(d.commission || 0);
        var isPaid = d.stage === 'Payment Received';
        if (dd.getFullYear() === y && dd.getMonth() === m) {
          rcData.deals++;
          if (isPaid) rcData.earned += comm;
          if (comm > rcData.best) rcData.best = comm;
        } else if (dd.getFullYear() === py && dd.getMonth() === pm) {
          rcData.prevDeals++;
          if (isPaid) rcData.prevEarned += comm;
        }
      });
      renderRC();
    });

    function delta(cur, prev, isMoney) {
      if (prev === 0) return cur > 0 ? '<span class="rc-up">new!</span>' : '';
      var diff = cur - prev;
      if (diff === 0) return '<span class="rc-flat">same as last month</span>';
      var sign = diff > 0 ? '▲' : '▼';
      var cls = diff > 0 ? 'rc-up' : 'rc-down';
      var val = isMoney ? formatCurrency(Math.abs(diff)) : Math.abs(diff);
      return '<span class="' + cls + '">' + sign + ' ' + val + ' vs last month</span>';
    }

    function renderRC() {
      var monthName = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      card.querySelector('#rcMonth').textContent = monthName;
      card.querySelector('#rcDeals').textContent = rcData.deals;
      card.querySelector('#rcEarned').textContent = formatCurrency(rcData.earned);
      card.querySelector('#rcBest').textContent = rcData.best > 0 ? formatCurrency(rcData.best) : '—';
      card.querySelector('#rcDealsDelta').innerHTML = delta(rcData.deals, rcData.prevDeals, false);
      card.querySelector('#rcEarnedDelta').innerHTML = delta(rcData.earned, rcData.prevEarned, true);
      card.querySelector('#rcBestSub').textContent = rcData.best > 0 ? 'single deal commission' : '';
    }

    card.querySelector('#rcShareBtn').onclick = function () {
      var monthName = new Date().toLocaleDateString('en-IN', { month: 'long' });
      var msg = '🏆 Mera ' + monthName + ' DigiRise Report Card:\n\n' +
        '✅ ' + rcData.deals + ' deals closed\n' +
        '💰 ' + formatCurrency(rcData.earned) + ' commission earned\n' +
        (rcData.best > 0 ? '🔥 Best deal: ' + formatCurrency(rcData.best) + '\n' : '') +
        '\nTum bhi join karo DigiRise Growth Partner Program:\nhttps://digi-rise-admin-beta.vercel.app';
      window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
    };
  }

  // =================================================================
  // BOOT — waits for Firebase auth to be ready (anon auth flaps on
  // cold start; attaching listeners before token = permission_denied)
  // =================================================================
  function bootAll() {
    try { initFollowupReminders(); } catch (e) { console.warn('[NG] followup:', e); }
    try { initActivityFeedPartner(); } catch (e) { console.warn('[NG] feed:', e); }
    try { initActivityTickerHome(); } catch (e) { console.warn('[NG] ticker:', e); }
    try { initHomeLiveTotals(); } catch (e) { console.warn('[NG] totals:', e); }
    try { initGoals(); } catch (e) { console.warn('[NG] goals:', e); }
    try { initInsights(); } catch (e) { console.warn('[NG] insights:', e); }
    try { initReferralUI(); } catch (e) { console.warn('[NG] referral:', e); }
    try { initCalculatorUpgrade(); } catch (e) { console.warn('[NG] calc:', e); }
    try { initBottomNav(); } catch (e) { console.warn('[NG] bottomnav:', e); }
    try { initPresenceWriter(); } catch (e) { console.warn('[NG] presence:', e); }
    try { initReportCard(); } catch (e) { console.warn('[NG] report:', e); }
  }

  document.addEventListener('DOMContentLoaded', function () {
    // UI-only features boot immediately; Firebase-dependent listeners are
    // attached after auth confirms (or 3s fallback if auth event never fires).
    var booted = false;
    function once() { if (booted) return; booted = true; bootAll(); }
    try {
      if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged(function (user) {
          if (user) once();
        });
        setTimeout(once, 3000); // fallback — listeners self-retry via SDK anyway
      } else {
        once();
      }
    } catch (e) { once(); }
  });
})();
