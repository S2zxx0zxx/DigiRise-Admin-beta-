/* =====================================================================
   DIGIRISE — PARTNER DASHBOARD PHASE 3..7 ENHANCEMENTS
   Purely additive — reuses the same Firebase auth + database global
   already initialised in shared.js / firebase-config.js.
   ===================================================================== */
/* global database, formatCurrency, showToast, handleLogout, celebrateMilestone, escapeHTML, firebase */
/* eslint-disable no-empty */

(function () {
  'use strict';

  const REDUCE = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Cache
  let currentPartner = null;   // partners/{code} snapshot
  let currentDeals   = [];     // materialised list
  let currentPayouts = [];     // materialised list
  let currentCode    = null;
  let currentUsername = null;
  let allPartnersMonthly = []; // for leaderboard rank

  // Wait for shared.js checkSession pattern
  document.addEventListener('DOMContentLoaded', () => {
    const sessionUser = sessionStorage.getItem('sessionUser');
    const sessionRole = sessionStorage.getItem('sessionRole');
    const partnerCode = sessionStorage.getItem('partnerCode');
    if (sessionRole !== 'partner' || !partnerCode) return;
    currentCode = partnerCode;
    currentUsername = sessionUser || 'Partner';

    // Wait for anon auth to complete before wiring listeners so we
    // don't hit a transient permission_denied on cold-start.
    if (typeof firebase !== 'undefined' && firebase.auth) {
      let bootstrapped = false;
      firebase.auth().onAuthStateChanged((user) => {
        if (user && !bootstrapped) {
          bootstrapped = true;
          bootstrapPartnerEnhancements();
        }
      });
      // Safety fallback if auth already succeeded before we listened
      setTimeout(() => {
        if (!bootstrapped && firebase.auth().currentUser) {
          bootstrapped = true;
          bootstrapPartnerEnhancements();
        }
      }, 1800);
    } else {
      setTimeout(bootstrapPartnerEnhancements, 1200);
    }
  });

  function bootstrapPartnerEnhancements() {
    if (typeof database === 'undefined') return;

    // Force a socket reconnect so partner.js's listeners that failed
    // during the cold-start auth flap get re-established with valid
    // creds.  This is safe — Firebase queues writes and re-attaches
    // listeners transparently after goOnline().
    try {
      database.goOffline();
      setTimeout(() => { try { database.goOnline(); } catch (e) {} }, 30);
    } catch (e) { /* ignore */ }

    // Attach data listeners
    database.ref('partners/' + currentCode).on('value', (snap) => {
      currentPartner = snap.val() || null;
      applyProfileUI();
    });

    database.ref('deals/' + currentCode).on('value', (snap) => {
      const v = snap.val() || {};
      currentDeals = Object.keys(v).map(k => Object.assign({ id: k }, v[k]));
      recomputeAll();
    });

    database.ref('payouts/' + currentCode).on('value', (snap) => {
      const v = snap.val() || {};
      currentPayouts = Object.keys(v).map(k => Object.assign({ id: k }, v[k]));
      renderPayoutTimeline();
      mirrorPrimaryStats();
    });

    // Also mirror announcements (defensive shim if partner.js listeners didn't fire)
    database.ref('announcements').on('value', (snap) => {
      const list = document.getElementById('announcementsList');
      if (!list) return;
      const data = snap.val();
      if (!data) return;
      // Only mirror if partner.js hasn't already rendered content
      const hasReal = !!list.querySelector('.ann-item');
      if (hasReal) return;
      const anns = Object.keys(data).map(k => Object.assign({ id: k }, data[k]))
        .sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0));
      list.innerHTML = anns.map((a) => {
        const isUrgent = !!a.urgent;
        const dateStr = a.postedAt
          ? new Date(a.postedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          : (a.date || '');
        return '<div class="ann-item ' + (isUrgent ? 'urgent' : 'normal') + '">' +
                 '<div class="ann-header">' +
                   '<span class="ann-badge-tag ' + (isUrgent ? 'ann-badge-urgent' : 'ann-badge-update') + '">' +
                     (isUrgent ? '🔴 URGENT' : '📢 UPDATE') +
                   '</span>' +
                 '</div>' +
                 '<div class="ann-title">' + escapeHTML(a.title || '') + '</div>' +
                 '<div class="ann-body">' + escapeHTML(a.body || a.text || '') + '</div>' +
                 '<div class="ann-date">' + dateStr + '</div>' +
               '</div>';
      }).join('');
    });

    // For leaderboard rank we need to look at all partners' deals for this month.
    // Read root `deals` — same permission surface already used by admin.
    database.ref('deals').on('value', (snap) => {
      const root = snap.val() || {};
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const per = {};
      Object.keys(root).forEach((code) => {
        const dealsByCode = root[code] || {};
        Object.keys(dealsByCode).forEach((id) => {
          const d = dealsByCode[id] || {};
          const dd = new Date(d.addedAt || 0);
          if (dd.getFullYear() === y && dd.getMonth() === m) {
            per[code] = (per[code] || 0) + 1;
          }
        });
      });
      allPartnersMonthly = Object.entries(per)
        .map(([c, n]) => ({ code: c, deals: n }))
        .sort((a, b) => b.deals - a.deals);
      renderLeaderboard();
    });

    // Bind UI actions
    bindProfileActions();
    bindTrophyActions();
    bindShareActions();
    bindReminderAction();
    initHeaderProfileNav();
  }

  // ────────────────────────────────────────────────────────────────
  // Profile UI
  // ────────────────────────────────────────────────────────────────
  function initialsFor(name) {
    const parts = String(name || '').trim().split(/\s+/).slice(0, 2);
    if (!parts.length || !parts[0]) return 'DR';
    return parts.map(p => p[0].toUpperCase()).join('').slice(0, 2);
  }

  function applyProfileUI() {
    const nameEl   = document.getElementById('profileHeroName');
    const codeEl   = document.getElementById('profileHeroCode');
    const tierEl   = document.getElementById('profileHeroTier');
    const avatarEl = document.getElementById('profileAvatar');
    const codeRO   = document.getElementById('profileCodeReadonly');
    const nInp     = document.getElementById('profileNameInput');
    const pInp     = document.getElementById('profilePhoneInput');
    const uInp     = document.getElementById('profileUpiInput');
    if (!nameEl) return;

    const nm = currentPartner && currentPartner.name ? currentPartner.name : currentUsername;
    nameEl.textContent = nm;
    if (codeEl) codeEl.textContent = currentCode;
    if (codeRO) codeRO.textContent = currentCode;
    if (avatarEl) avatarEl.textContent = initialsFor(nm);
    if (nInp && document.activeElement !== nInp) nInp.value = nm || '';
    if (pInp && document.activeElement !== pInp) pInp.value = (currentPartner && currentPartner.phone) || '';
    if (uInp && document.activeElement !== uInp) uInp.value = (currentPartner && currentPartner.defaultUpi) || '';

    // Tier badge in profile — derived from deals count
    const deals = currentDeals.length;
    const tier = deals >= 15 ? 'Gold'
              : deals >= 7  ? 'Silver'
              : deals >= 3  ? 'Bronze'
              : 'Joining';
    if (tierEl) tierEl.textContent = tierGlyph(tier) + ' ' + tier;
  }

  function tierGlyph(tierName) {
    return tierName === 'Gold' ? '🥇'
         : tierName === 'Silver' ? '🥈'
         : tierName === 'Bronze' ? '🥉' : '⭐';
  }

  function bindProfileActions() {
    const saveBtn = document.getElementById('profileSaveBtn');
    const resetBtn = document.getElementById('profileResetBtn');
    const logoutBtn = document.getElementById('profileLogoutBtn');
    const themeToggle = document.getElementById('profileThemeToggle');
    const annToggle = document.getElementById('profileAnnToggle');

    if (saveBtn) saveBtn.addEventListener('click', () => {
      if (!currentCode) return;
      const updates = {
        name: (document.getElementById('profileNameInput').value || '').trim() || currentUsername,
        phone: (document.getElementById('profilePhoneInput').value || '').trim(),
        defaultUpi: (document.getElementById('profileUpiInput').value || '').trim(),
      };
      if (!updates.name) return;
      database.ref('partners/' + currentCode).update(updates)
        .then(() => {
          try { if (typeof showToast === 'function') showToast('Profile saved ✅', 'success'); } catch (e) {}
        })
        .catch((err) => {
          try { if (typeof showToast === 'function') showToast('Save failed: ' + err.message, 'error'); } catch (e) {}
        });
    });

    if (resetBtn) resetBtn.addEventListener('click', applyProfileUI);

    if (logoutBtn) logoutBtn.addEventListener('click', () => {
      if (typeof handleLogout === 'function') handleLogout();
    });

    // Theme toggle — mirror value from html[data-theme]
    if (themeToggle) {
      const syncTheme = () => {
        const cur = document.documentElement.getAttribute('data-theme');
        if (cur === 'light') themeToggle.classList.remove('is-on');
        else                 themeToggle.classList.add('is-on');
      };
      syncTheme();
      themeToggle.addEventListener('click', () => {
        const headerBtn = document.getElementById('themeToggleBtn');
        if (headerBtn) headerBtn.click();
        setTimeout(syncTheme, 50);
      });
      // Observe attribute changes so if user toggles from header, this stays in sync
      const mo = new MutationObserver(syncTheme);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }

    // Announcements toggle — write to partners/{code}/prefs.announcements
    if (annToggle) {
      const applyAnnState = () => {
        const on = !currentPartner || !currentPartner.prefs
          || currentPartner.prefs.announcements !== false;
        annToggle.classList.toggle('is-on', on);
      };
      applyAnnState();
      annToggle.addEventListener('click', () => {
        const newVal = !annToggle.classList.contains('is-on');
        annToggle.classList.toggle('is-on', newVal);
        if (!currentCode) return;
        database.ref('partners/' + currentCode + '/prefs/announcements').set(newVal);
      });
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Recompute derived UI on any deal change
  // ────────────────────────────────────────────────────────────────
  function recomputeAll() {
    applyProfileUI();
    computeMotivation();
    updateTrophyStates();
    computeEarningsForecast();
    computeSmartReminder();
    renderLeaderboard();
    // Defensive shim: if partner.js's listeners didn't fire due to a
    // cold-start auth flap, mirror the essentials into the DOM so the
    // Overview tab still reflects real numbers.
    mirrorPrimaryStats();
  }

  function mirrorPrimaryStats() {
    if (!currentDeals) return;
    const totalDeals = currentDeals.length;
    const totalEarned = currentDeals.reduce((s, d) => s + (Number(d.commission) || 0), 0);
    const totalPaid = currentPayouts.filter(p => p.status === 'paid')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const pending = Math.max(0, totalEarned - totalPaid);

    setIf('statTotalDeals', String(totalDeals));
    setIf('statTotalEarned', formatCurrency(totalEarned));
    setIf('statPendingPayout', formatCurrency(pending));
    setIf('payoutTotalEarned', formatCurrency(totalEarned));
    setIf('payoutPending', formatCurrency(pending));
    setIf('payoutReceived', formatCurrency(totalPaid));

    // Tier badge + tier ring
    const tier = totalDeals >= 15 ? { name: 'Gold', min: 15, next: null, bonus: 5000 }
              : totalDeals >= 7  ? { name: 'Silver', min: 7, next: 15, bonus: 1500 }
              : totalDeals >= 3  ? { name: 'Bronze', min: 3, next: 7, bonus: 500 }
              : { name: 'Joining', min: 0, next: 3, bonus: 0 };
    const tierBadge = document.getElementById('headerTierBadge');
    if (tierBadge) tierBadge.textContent = tierGlyph(tier.name) + ' ' + tier.name;
    const tierName = document.getElementById('currentTierName');
    if (tierName) tierName.textContent = tier.name + ' Tier';
    const ringText = document.getElementById('tierRingText');
    if (ringText) ringText.textContent = totalDeals;
    const tierRing = document.getElementById('tierRingProgress');
    if (tierRing && tier.next) {
      const progress = Math.min(totalDeals / tier.next, 1);
      tierRing.style.strokeDashoffset = String(251 - 251 * progress);
    }
    const tierProgText = document.getElementById('tierProgressText');
    if (tierProgText) {
      if (tier.next) tierProgText.textContent = (tier.next - totalDeals) + ' deals to next tier';
      else tierProgText.textContent = 'Max Tier Reached!';
    }
    const tierPerks = document.getElementById('tierPerks');
    if (tierPerks && tier.name !== 'Joining') {
      let str = '₹' + tier.bonus + ' Unlock Bonus';
      if (tier.name === 'Silver') str += ' • +1% Extra Commission';
      if (tier.name === 'Gold') str += ' • +2% Extra Commission';
      tierPerks.textContent = str;
    }

    // Body class for tier-based theming
    const validTiers = ['joining', 'bronze', 'silver', 'gold'];
    validTiers.forEach(t => document.body.classList.remove('tier-' + t));
    document.body.classList.add('tier-' + tier.name.toLowerCase());

    // Mirror pipeline + history if partner.js hasn't rendered them
    mirrorPipeline();
    mirrorHistory();
  }

  function mirrorPipeline() {
    const list = document.getElementById('pipelineList');
    if (!list) return;
    // Only render if partner.js hasn't already populated real cards
    if (list.querySelector('.pipeline-card')) return;
    const active = currentDeals
      .filter(d => d.stage !== 'Payment Received')
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    if (!active.length) return; // Leave the existing "no active deals" empty state
    const stageClass = {
      'Lead Found': 'stage-lead',
      'Pitched': 'stage-pitched',
      'Negotiating': 'stage-negotiating',
      'Closed': 'stage-closed'
    };
    list.innerHTML = active.map(d => {
      const cls = stageClass[d.stage] || '';
      const followup = d.followupDate
        ? '<span class="followup-badge">📅 Follow-up: ' +
          new Date(d.followupDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) +
          '</span>'
        : '';
      const phone = d.clientPhone
        ? '<span style="font-size:11px;color:#3B82F6;margin-left:6px;">📞 ' + escapeHTML(d.clientPhone) + '</span>'
        : '';
      return '<div class="pipeline-card ' + cls + '" data-deal-id="' + d.id + '">' +
               '<div class="pipeline-card-header">' +
                 '<div>' +
                   '<div class="pipeline-client">' + escapeHTML(d.clientName || '—') + '</div>' +
                   '<div class="pipeline-meta">' + escapeHTML(d.industry || '') +
                     (d.cityArea ? ' · ' + escapeHTML(d.cityArea) : '') +
                     ' · ' + (d.date || '') + phone + '</div>' +
                   followup +
                 '</div>' +
                 '<div class="pipeline-commission">' +
                   '<div class="pipeline-commission-val">+' + formatCurrency(d.commission || 0) + '</div>' +
                   '<div class="pipeline-commission-pkg">' + escapeHTML(d.package || '') + ' · ' + (d.pct || 0) + '%</div>' +
                 '</div>' +
               '</div>' +
               (d.notes ? '<div class="pipeline-notes">📝 ' + escapeHTML(d.notes) + '</div>' : '') +
             '</div>';
    }).join('');
  }

  function mirrorHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    if (list.querySelector('.deal-card, .history-card, .history-item')) return;
    if (!currentDeals.length) return;
    const sorted = currentDeals.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    list.innerHTML = sorted.map(d => {
      const stageColor = ({
        'Lead Found': '#3B82F6',
        'Pitched': '#A855F7',
        'Negotiating': '#F59E0B',
        'Closed': '#22C55E',
        'Payment Received': '#C8890A'
      })[d.stage] || 'var(--text-secondary)';
      return '<div class="deal-card" style="padding:14px 16px;border-radius:12px;background:var(--bg-surface-1);border:1px solid var(--border-subtle);margin-bottom:10px;">' +
               '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">' +
                 '<div style="min-width:0;">' +
                   '<div style="font-weight:700;color:var(--text-primary);">' + escapeHTML(d.clientName || '—') + '</div>' +
                   '<div style="font-size:12px;color:var(--text-tertiary);margin-top:3px;">' +
                     escapeHTML(d.industry || '') + ' · ' + escapeHTML(d.package || '') + ' · ' + (d.date || '') +
                   '</div>' +
                 '</div>' +
                 '<div style="text-align:right;flex-shrink:0;">' +
                   '<div style="font-weight:700;color:var(--gold);font-family:var(--font-display);font-variant-numeric:tabular-nums;">+' +
                     formatCurrency(d.commission || 0) + '</div>' +
                   '<div style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:0.08em;background:' + stageColor + '22;color:' + stageColor + ';">' +
                     escapeHTML(d.stage || '—').toUpperCase() +
                   '</div>' +
                 '</div>' +
               '</div>' +
             '</div>';
    }).join('');
  }

  function setIf(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = (el.textContent || '').trim();
    if (cur === value) return;
    el.classList.remove('skeleton');
    el.style.minWidth = '';
    el.style.minHeight = '';
    el.textContent = value;
  }

  // ────────────────────────────────────────────────────────────────
  // Motivation engine — projected next tier, personal best, streak
  // ────────────────────────────────────────────────────────────────
  function computeMotivation() {
    const dealsByDate = currentDeals
      .filter(d => d.addedAt)
      .slice()
      .sort((a, b) => a.addedAt - b.addedAt);

    // ---- Projected next tier date
    const projEl    = document.getElementById('motivProjected');
    const projSubEl = document.getElementById('motivProjectedSub');
    const nextTierName = nextTierForCount(dealsByDate.length);
    if (!nextTierName) {
      if (projEl) projEl.textContent = 'Gold reached';
      if (projSubEl) projSubEl.textContent = 'You are at the top tier';
    } else {
      const remaining = tierThreshold(nextTierName) - dealsByDate.length;
      const pace = averageDaysBetweenDeals(dealsByDate);
      if (!pace || !remaining) {
        if (projEl) projEl.textContent = '—';
        if (projSubEl) projSubEl.textContent = 'Log a few more deals to project';
      } else {
        const days = Math.max(1, Math.round(pace * remaining));
        if (projEl) projEl.textContent = 'Silver'.replace('Silver', nextTierName) + ' in ~' + days + 'd';
        if (projSubEl) projSubEl.textContent = 'At your current pace of one deal every ' + Math.round(pace) + 'd';
      }
    }

    // ---- Personal best month
    const bestEl    = document.getElementById('motivBestMonth');
    const bestSubEl = document.getElementById('motivBestMonthSub');
    const monthly = {};
    dealsByDate.forEach((d) => {
      const dd = new Date(d.addedAt);
      const key = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0');
      monthly[key] = (monthly[key] || 0) + (Number(d.commission) || 0);
    });
    const now = new Date();
    const thisKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    let bestKey = null, bestVal = 0;
    Object.entries(monthly).forEach(([k, v]) => {
      if (v > bestVal) { bestVal = v; bestKey = k; }
    });
    const thisVal = monthly[thisKey] || 0;
    if (bestEl) bestEl.textContent = formatCurrency ? formatCurrency(thisVal) : ('₹' + thisVal);
    if (bestSubEl) {
      if (!bestKey) {
        bestSubEl.textContent = 'Log a deal to open the record';
      } else if (bestKey === thisKey) {
        bestSubEl.textContent = 'This month is your best so far — keep going';
      } else {
        const [by, bm] = bestKey.split('-').map(Number);
        const label = new Date(by, bm - 1, 1).toLocaleString('default', { month: 'short', year: '2-digit' });
        bestSubEl.textContent = 'Best: ' + (formatCurrency ? formatCurrency(bestVal) : '₹' + bestVal) + ' in ' + label;
      }
    }

    // ---- Streak — consecutive ISO weeks with at least 1 deal
    const streakEl    = document.getElementById('motivStreak');
    const streakSubEl = document.getElementById('motivStreakSub');
    const weeks = new Set();
    dealsByDate.forEach((d) => weeks.add(isoWeekKey(new Date(d.addedAt))));
    let streak = 0;
    const cursor = new Date();
    // Walk back current week -> older weeks while set contains that key
    // Break the moment a week has no deals.
    // Consider "current week" only if it has a deal, else start at last week.
    let weekCursor = new Date(cursor);
    // Align to Monday of this week
    while (true) {
      const k = isoWeekKey(weekCursor);
      if (weeks.has(k)) {
        streak += 1;
        weekCursor.setDate(weekCursor.getDate() - 7);
      } else {
        break;
      }
    }
    if (streakEl) streakEl.textContent = streak + (streak === 1 ? ' wk' : ' wks');
    if (streakSubEl) {
      streakSubEl.textContent = streak > 0
        ? 'Consecutive weeks with a closed/logged deal'
        : 'Log a deal this week to start a new streak';
    }
  }

  function tierThreshold(tierName) {
    if (tierName === 'Bronze') return 3;
    if (tierName === 'Silver') return 7;
    if (tierName === 'Gold')   return 15;
    return 0;
  }
  function nextTierForCount(n) {
    if (n < 3)  return 'Bronze';
    if (n < 7)  return 'Silver';
    if (n < 15) return 'Gold';
    return null;
  }
  function averageDaysBetweenDeals(sortedDeals) {
    if (sortedDeals.length < 2) return 0;
    const diffs = [];
    for (let i = 1; i < sortedDeals.length; i++) {
      const d = (sortedDeals[i].addedAt - sortedDeals[i - 1].addedAt) / (1000 * 60 * 60 * 24);
      if (d > 0) diffs.push(d);
    }
    if (!diffs.length) return 0;
    return diffs.reduce((a, b) => a + b, 0) / diffs.length;
  }
  function isoWeekKey(dt) {
    // Get ISO week key (yyyy-Www)
    const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  }

  // ────────────────────────────────────────────────────────────────
  // Trophy states — locked / next / unlocked + details on tap
  //   Milestone flag storage — Firebase (partners/{code}/milestones/{key})
  //   as agreed in Phase 5B recommendation.
  // ────────────────────────────────────────────────────────────────
  function updateTrophyStates() {
    const dealsN = currentDeals.length;
    const tiers = [
      { key: 'bronze', threshold: 3,  bonus: 500 },
      { key: 'silver', threshold: 7,  bonus: 1500 },
      { key: 'gold',   threshold: 15, bonus: 5000 },
    ];
    const nextTierKey = (nextTierForCount(dealsN) || '').toLowerCase();
    tiers.forEach((t) => {
      const tile = document.querySelector('.trophy-tile[data-tier="' + t.key + '"]');
      if (!tile) return;
      const hint = tile.querySelector('[data-role="hint"]');
      tile.classList.remove('is-locked', 'is-next', 'is-unlocked', 'shine-sweep');
      if (dealsN >= t.threshold) {
        tile.classList.add('is-unlocked', 'shine-sweep');
        if (hint) hint.textContent = 'Unlocked · +' + formatCurrency(t.bonus) + ' bonus';
      } else {
        if (t.key === nextTierKey) {
          tile.classList.add('is-next');
          if (hint) hint.textContent = (t.threshold - dealsN) + ' deal(s) to unlock';
        } else {
          tile.classList.add('is-locked');
          if (hint) hint.textContent = t.threshold + ' deals to unlock';
        }
      }
    });

    // Milestone celebrations (first deal, 5th, 10th, ₹10k earned, ₹50k earned)
    const totalEarned = currentDeals.reduce((s, d) => s + (Number(d.commission) || 0), 0);
    const milestones = [
      { key: 'first_deal',       cond: dealsN >= 1,  msg: '🎉 Your first deal is on the board' },
      { key: 'five_deals',       cond: dealsN >= 5,  msg: '🏅 5 deals logged — Bronze unlocked' },
      { key: 'ten_thousand',     cond: totalEarned >= 10000, msg: '💰 ₹10,000 total commission earned' },
      { key: 'fifty_thousand',   cond: totalEarned >= 50000, msg: '🚀 ₹50,000 crossed — you are on a run' },
      { key: 'silver_tier',      cond: dealsN >= 7,  msg: '🥈 Silver tier unlocked — +1% extra commission' },
      { key: 'gold_tier',        cond: dealsN >= 15, msg: '🥇 Gold tier unlocked — you are elite' },
    ];
    milestones.forEach((m) => {
      if (!m.cond) return;
      const seen = currentPartner && currentPartner.milestones && currentPartner.milestones[m.key];
      if (seen) return;
      // Fire toast + write flag
      celebrateMilestoneToast(m.msg);
      database.ref('partners/' + currentCode + '/milestones/' + m.key).set(true).catch(() => {});
    });
  }

  function celebrateMilestoneToast(msg) {
    let el = document.getElementById('milestoneToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'milestoneToast';
      el.className = 'milestone-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    // Force reflow so re-triggering restarts the transition
    requestAnimationFrame(() => {
      el.classList.add('is-visible');
      // Confetti reuse from shared.js
      try { if (typeof celebrateMilestone === 'function') celebrateMilestone(); } catch (e) {}
      setTimeout(() => el.classList.remove('is-visible'), 3600);
    });
  }

  function bindTrophyActions() {
    document.querySelectorAll('.trophy-tile').forEach((tile) => {
      tile.addEventListener('click', () => {
        const tier = tile.getAttribute('data-tier');
        renderTrophyDetails(tier);
      });
    });
  }
  function renderTrophyDetails(tierKey) {
    const wrap = document.getElementById('trophyDetails');
    if (!wrap) return;
    const tiers = {
      bronze: { name: 'Bronze Partner', threshold: 3,  bonus: 500,
        perks: ['Bronze Partner Digital Badge', '₹500 Cash Bonus on 3rd deal', 'Public recognition in Partner Group', 'Warm lead support begins'] },
      silver: { name: 'Silver Partner', threshold: 7,  bonus: 1500,
        perks: ['Silver Badge + Certificate', '₹1,500 Cash Bonus on 7th deal', 'Priority Leads — pehle aapko', '+1% extra commission on every deal'] },
      gold:   { name: 'Gold Partner',   threshold: 15, bonus: 5000,
        perks: ['Gold Badge + Framed Certificate', '₹5,000 Cash Bonus on 15th deal', 'Website featured partner', 'Hot leads dedicated pipeline', '+2% extra commission on every deal'] },
    };
    const t = tiers[tierKey];
    if (!t) return;

    const sorted = currentDeals.slice().sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
    const unlockDeal = sorted[t.threshold - 1];
    const unlocked = currentDeals.length >= t.threshold;

    const unlockLine = unlocked && unlockDeal
      ? 'Unlocked on ' + new Date(unlockDeal.addedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : (t.threshold - currentDeals.length) + ' deal(s) to unlock';

    wrap.classList.add('is-open');
    wrap.innerHTML =
      '<h4 class="trophy-details-heading">' + t.name + '</h4>' +
      '<div class="trophy-details-body">' +
        '<div style="margin-bottom:8px;">' + unlockLine + ' · <strong>+' + formatCurrency(t.bonus) + '</strong> cash bonus</div>' +
        '<ul style="margin:0;padding-left:18px;">' + t.perks.map(p => '<li>' + p + '</li>').join('') + '</ul>' +
      '</div>';
  }

  // ────────────────────────────────────────────────────────────────
  // Leaderboard rank (privacy-respecting: own rank + total only)
  // ────────────────────────────────────────────────────────────────
  function renderLeaderboard() {
    const el = document.getElementById('motivRank');
    const sub = document.getElementById('motivRankSub');
    if (!el) return;
    if (!allPartnersMonthly.length) {
      el.textContent = '—';
      if (sub) sub.textContent = 'no deals logged this month yet';
      return;
    }
    const idx = allPartnersMonthly.findIndex(p => p.code === currentCode);
    if (idx < 0) {
      el.textContent = '#' + (allPartnersMonthly.length + 1);
      if (sub) sub.textContent = 'log a deal this month to enter the ranking';
      return;
    }
    const rank = idx + 1;
    const total = allPartnersMonthly.length;
    const topDeals = allPartnersMonthly[0].deals;
    el.textContent = '#' + rank + ' of ' + total;
    if (sub) {
      if (rank === 1) sub.textContent = 'You are leading this month · ' + topDeals + ' deal(s)';
      else sub.textContent = 'Top partner has ' + topDeals + ' this month · you have ' + allPartnersMonthly[idx].deals;
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Earnings forecast (linear projection this month)
  // ────────────────────────────────────────────────────────────────
  function computeEarningsForecast() {
    const val = document.getElementById('forecastValue');
    const desc = document.getElementById('forecastDesc');
    const card = document.getElementById('forecastCard');
    if (!val || !card) return;

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const dayOfMonth = now.getDate();

    let commissionMTD = 0;
    currentDeals.forEach((d) => {
      const dd = new Date(d.addedAt || 0);
      if (dd.getFullYear() === y && dd.getMonth() === m) {
        commissionMTD += Number(d.commission) || 0;
      }
    });

    if (dayOfMonth < 3 || commissionMTD <= 0) {
      // Not enough data — hide the card
      card.style.display = 'none';
      return;
    }
    const perDay = commissionMTD / dayOfMonth;
    const projected = Math.round(perDay * daysInMonth);
    card.style.display = 'block';
    val.textContent = formatCurrency(projected);
    if (desc) desc.textContent =
      'You have ' + formatCurrency(commissionMTD) + ' so far in ' +
      now.toLocaleString('default', { month: 'long' }) +
      '. Continuing at your current pace projects to ' + formatCurrency(projected) + ' by month-end.';
  }

  // ────────────────────────────────────────────────────────────────
  // Smart reminder (deals stuck in Lead/Pitched > 5 days)
  // ────────────────────────────────────────────────────────────────
  function computeSmartReminder() {
    const card = document.getElementById('reminderCard');
    const val  = document.getElementById('reminderValue');
    const desc = document.getElementById('reminderDesc');
    if (!card) return;
    const now = Date.now();
    const fiveDays = 5 * 24 * 60 * 60 * 1000;
    const stuck = currentDeals.filter((d) => {
      const stage = (d.stage || '').toLowerCase();
      const isEarly = stage === 'lead found' || stage === 'pitched' || stage === 'negotiating';
      const t = d.addedAt || 0;
      return isEarly && (now - t) > fiveDays;
    });
    if (!stuck.length) {
      card.style.display = 'none';
      return;
    }
    card.style.display = 'block';
    val.textContent = stuck.length + ' deal' + (stuck.length === 1 ? '' : 's');
    if (desc) desc.textContent = stuck.length + ' deal' + (stuck.length === 1 ? ' has' : 's have') +
      "n't moved in 5+ days — might be worth a follow-up.";
  }

  function bindReminderAction() {
    const btn = document.getElementById('reminderAction');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const pipeTab = document.querySelector('.tab-btn[data-target="pipeline"]');
      if (pipeTab) pipeTab.click();
    });
  }

  // ────────────────────────────────────────────────────────────────
  // Payout timeline
  // ────────────────────────────────────────────────────────────────
  function renderPayoutTimeline() {
    const wrap = document.getElementById('payoutTimeline');
    if (!wrap) return;
    if (!currentPayouts.length) {
      wrap.innerHTML =
        '<div class="empty-state" style="text-align:center;padding:24px 0;">' +
        '<p class="muted-text">No payouts yet — request one from the Request Payout card.</p>' +
        '</div>';
      return;
    }
    const sorted = currentPayouts.slice().sort((a, b) =>
      (b.requestedAt || 0) - (a.requestedAt || 0));
    wrap.innerHTML = sorted.map((p) => {
      const status = (p.status || 'pending').toLowerCase();
      const statusClass = 'is-' + status;
      const dateStr = new Date(p.requestedAt || 0).toLocaleDateString('en-IN',
        { day: '2-digit', month: 'short', year: 'numeric' });
      const paidStr = p.paidAt ? new Date(p.paidAt).toLocaleDateString('en-IN',
        { day: '2-digit', month: 'short', year: 'numeric' }) : null;
      const upi = escapeHTML(p.upi || '—');
      const utr = p.utr ? '<div class="timeline-meta">UTR ' + escapeHTML(p.utr) + '</div>' : '';
      const paidLine = paidStr ? '<div class="timeline-meta">Paid on ' + paidStr + '</div>' : '';
      return '<div class="timeline-item ' + statusClass + '">' +
             '<div class="timeline-item-header">' +
               '<span class="timeline-amount">' + formatCurrency(p.amount || 0) + '</span>' +
               '<span class="timeline-status ' + statusClass + '">' + status.toUpperCase() + '</span>' +
             '</div>' +
             '<div class="timeline-meta">Requested ' + dateStr + ' · UPI ' + upi + '</div>' +
             paidLine + utr +
             '</div>';
    }).join('');
  }

  // ────────────────────────────────────────────────────────────────
  // Quick-share earnings card (canvas)
  // ────────────────────────────────────────────────────────────────
  function bindShareActions() {
    const openBtn = document.getElementById('quickShareBtn');
    const closeBtn = document.getElementById('shareCloseBtn');
    const dlBtn   = document.getElementById('shareDownloadBtn');
    const modal   = document.getElementById('sharePreviewModal');
    if (!openBtn || !modal) return;

    openBtn.addEventListener('click', () => {
      renderShareCanvas();
      modal.classList.add('is-open');
    });
    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('is-open'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('is-open');
    });
    if (dlBtn) dlBtn.addEventListener('click', () => {
      const canvas = document.getElementById('shareCanvas');
      if (!canvas) return;
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'digirise-earnings-' + currentCode + '.png';
      a.click();
    });
  }

  function renderShareCanvas() {
    const canvas = document.getElementById('shareCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    // Background — dark gradient
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0f0d08');
    bg.addColorStop(1, '#080607');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Ambient gold glow
    const glow = ctx.createRadialGradient(W * 0.85, H * 0.12, 20, W * 0.85, H * 0.12, W * 0.7);
    glow.addColorStop(0, 'rgba(232,160,32,0.35)');
    glow.addColorStop(1, 'rgba(232,160,32,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Brand chip
    ctx.font = '600 32px Inter, sans-serif';
    ctx.fillStyle = '#C8890A';
    ctx.fillText('DigiRise OS', 80, 130);
    ctx.fillStyle = '#5C606A';
    ctx.font = '500 24px Inter, sans-serif';
    ctx.fillText('Growth Partner Program', 80, 170);

    // Partner name
    ctx.fillStyle = '#F5F5F7';
    ctx.font = '700 72px Bricolage Grotesque, Inter, sans-serif';
    const name = (currentPartner && currentPartner.name) || currentUsername || 'Partner';
    ctx.fillText(name, 80, 340);

    // Tier + code
    const dealsN = currentDeals.length;
    const tier = dealsN >= 15 ? 'Gold' : dealsN >= 7 ? 'Silver' : dealsN >= 3 ? 'Bronze' : 'Joining';
    ctx.fillStyle = '#9CA0A8';
    ctx.font = '500 28px Inter, sans-serif';
    ctx.fillText(tier + ' Partner · ' + currentCode, 80, 384);

    // Big earnings number for this month
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let mtdCommission = 0;
    currentDeals.forEach((d) => {
      const dd = new Date(d.addedAt || 0);
      if (dd.getFullYear() === y && dd.getMonth() === m) {
        mtdCommission += Number(d.commission) || 0;
      }
    });
    const totalCommission = currentDeals.reduce((s, d) => s + (Number(d.commission) || 0), 0);

    ctx.fillStyle = '#5C606A';
    ctx.font = '600 24px Inter, sans-serif';
    ctx.fillText('EARNED THIS MONTH', 80, 500);
    ctx.fillStyle = '#F5C842';
    ctx.font = '800 140px Bricolage Grotesque, Inter, sans-serif';
    ctx.fillText(formatCurrency(mtdCommission), 80, 650);

    // Sub row — deals + total
    ctx.fillStyle = '#9CA0A8';
    ctx.font = '500 30px Inter, sans-serif';
    ctx.fillText(dealsN + ' deals logged · ' + formatCurrency(totalCommission) + ' lifetime', 80, 720);

    // Footer bar
    ctx.fillStyle = 'rgba(200,137,10,0.14)';
    ctx.fillRect(60, H - 200, W - 120, 110);
    ctx.strokeStyle = 'rgba(200,137,10,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(60, H - 200, W - 120, 110);
    ctx.fillStyle = '#C8890A';
    ctx.font = '700 30px Inter, sans-serif';
    ctx.fillText('Join DigiRise India Growth Partner Program', 100, H - 140);
    ctx.fillStyle = '#9CA0A8';
    ctx.font = '500 24px Inter, sans-serif';
    ctx.fillText('digirise.in — earn 10–15% per deal · instant payouts', 100, H - 108);
  }

  // ────────────────────────────────────────────────────────────────
  // Header tap-name-to-open-profile
  // ────────────────────────────────────────────────────────────────
  function initHeaderProfileNav() {
    const info = document.querySelector('.partner-info');
    if (!info) return;
    info.style.cursor = 'pointer';
    info.setAttribute('title', 'Open profile');
    info.setAttribute('data-testid', 'header-profile-link');
    info.addEventListener('click', () => {
      const t = document.querySelector('.tab-btn[data-target="profile"]');
      if (t) t.click();
    });
  }
})();
