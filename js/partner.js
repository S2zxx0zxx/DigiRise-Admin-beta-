// js/partner.js

// Helper for computing tier
function computeTier(dealsCount) {
  if (dealsCount >= TIERS.GOLD.minDeals) return TIERS.GOLD;
  if (dealsCount >= TIERS.SILVER.minDeals) return TIERS.SILVER;
  if (dealsCount >= TIERS.BRONZE.minDeals) return TIERS.BRONZE;
  return TIERS.JOINING;
}

// Calculate Extra Commission
function getExtraCommissionPct(tier) {
  if (tier === TIERS.GOLD) return 2;
  if (tier === TIERS.SILVER) return 1;
  return 0;
}

function getTierEmoji(tierName) {
  if (tierName === 'Gold') return '🥇';
  if (tierName === 'Silver') return '🥈';
  if (tierName === 'Bronze') return '🥉';
  return '⭐';
}

document.addEventListener('DOMContentLoaded', () => {
  // 1. INIT
  const session = checkSession('partner');
  if (!session) return; // redirect handled in checkSession
  
  const code = session.partnerCode;
  const username = session.username;
  
  if (!code) {
    console.error('Partner code missing from session!');
    alert('Session error: Partner code missing. Please login again.');
    handleLogout();
    return;
  }
  
  document.getElementById('headerPartnerName').textContent = username;
  
  const listenerRefs = []

  function registerListener(ref, callback) {
    ref.on('value', callback)
    listenerRefs.push({ ref, callback })
  }

  function detachAllListeners() {
    listenerRefs.forEach(({ ref, callback }) => {
      ref.off('value', callback)
    })
    listenerRefs.length = 0
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      detachAllListeners()
      handleLogout()
    })
  }

  // Offline banner
  registerListener(
    database.ref('.info/connected'),
    (snap) => {
      const banner = document.getElementById('offline-banner')
      if (!banner) return
      if (snap.val() === true) {
        banner.style.display = 'none'
      } else {
        banner.style.display = 'block'
      }
    }
  )
  
  // Tab Switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  const sections = document.querySelectorAll('.tab-section');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      sections.forEach(s => s.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.remove('hidden');
    });
  });

  // State
  let currentTierObj = TIERS.JOINING;
  let totalDealsCount = 0;
  let totalEarnedAmt = 0;
  let totalPaidAmt = 0;
  let dealsData = {};
  let payoutsData = {};
  
  // Animate Count Up
  function animateValue(obj, start, end, duration, isCurrency = false) {
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const current = Math.floor(progress * (end - start) + start);
      obj.innerHTML = isCurrency ? formatCurrency(current) : current;
      if (progress < 1) {
        globalThis.requestAnimationFrame(step);
      } else {
        obj.innerHTML = isCurrency ? formatCurrency(end) : end;
      }
    };
    globalThis.requestAnimationFrame(step);
  }

  // 2. OVERVIEW TAB
  
  registerListener(database.ref('deals/' + code), (snapshot) => {
    const data = snapshot.val() || {};
    const dealsList = Object.keys(data).map(k => ({id: k, ...data[k]}));
    
    totalDealsCount = dealsList.length;
    totalEarnedAmt = dealsList.reduce((sum, d) => sum + (d.commission || 0), 0);
    
    const newTier = computeTier(totalDealsCount);
    if (newTier.name !== currentTierObj.name && totalDealsCount > 0) {
      // Tier upgraded! 
      if (newTier.minDeals > currentTierObj.minDeals) {
         showToast(`🎉 Congratulations! You upgraded to ${newTier.name} Tier! Bonus: ₹${newTier.bonus}`, 'success');
      }
    }
    currentTierObj = newTier;
    
    document.getElementById('headerTierBadge').textContent = getTierEmoji(currentTierObj.name) + ' ' + currentTierObj.name;
    document.getElementById('currentTierName').textContent = currentTierObj.name + ' Tier';
    
    let nextTier = TIERS.BRONZE;
    if (currentTierObj === TIERS.BRONZE) nextTier = TIERS.SILVER;
    else if (currentTierObj === TIERS.SILVER) nextTier = TIERS.GOLD;
    else if (currentTierObj === TIERS.GOLD) nextTier = null;
    
    if (nextTier) {
      const dealsToNext = nextTier.minDeals - totalDealsCount;
      document.getElementById('tierProgressText').textContent = `${dealsToNext} deals to next tier`;
      const progress = totalDealsCount / nextTier.minDeals;
      const offset = 251 - (251 * Math.min(progress, 1));
      document.getElementById('tierRingProgress').style.strokeDashoffset = offset;
    } else {
      document.getElementById('tierProgressText').textContent = `Max Tier Reached!`;
      document.getElementById('tierRingProgress').style.strokeDashoffset = 0;
    }
    
    let perksStr = 'No bonus active';
    if (currentTierObj !== TIERS.JOINING) {
      perksStr = `₹${currentTierObj.bonus} Unlock Bonus`;
      if (currentTierObj === TIERS.SILVER) perksStr += ' • +1% Extra Commission';
      if (currentTierObj === TIERS.GOLD) perksStr += ' • +2% Extra Commission';
    }
    document.getElementById('tierPerks').textContent = perksStr;
    
    animateValue(document.getElementById('statTotalDeals'), 0, totalDealsCount, 1000);
    animateValue(document.getElementById('statTotalEarned'), 0, totalEarnedAmt, 1000, true);
    document.getElementById('tierRingText').textContent = totalDealsCount;
    
    updatePendingPayout();
    renderPipeline(dealsList);
    renderHistory(dealsList);
    renderEarningsChart(dealsList);
    computePerformanceScore(dealsList);
    renderFollowUpAlert(dealsList);
  });
  
  registerListener(database.ref('payouts/' + code), (snapshot) => {
    const data = snapshot.val() || {};
    payoutsData = data;
    const payoutsList = Object.keys(data).map(k => ({id: k, ...data[k]}));
    
    snapshot.forEach(payoutSnap => {
      const p = payoutSnap.val();
      const id = payoutSnap.key;
      
      // Show toast when admin marks paid (realtime update)
      if (p.status === 'paid' && !p.notifShown) {
        showToast(
          '✅ Payout of ' + formatCurrency(p.amount) + 
          ' approved! UTR: ' + escapeHTML(p.utr || '—'),
          'success'
        )
        // Mark notifShown so toast doesn't repeat
        database.ref('payouts/' + code + '/' + id)
          .update({ notifShown: true })
          .catch(err => console.warn('notifShown update:', err))
      }
    });

    totalPaidAmt = payoutsList.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0);
    updatePendingPayout();
    renderPayouts(payoutsList);
  });
  
  function updatePendingPayout() {
    const pending = totalEarnedAmt - totalPaidAmt;
    animateValue(document.getElementById('statPendingPayout'), 0, pending, 1000, true);
    document.getElementById('payoutTotalEarned').textContent = formatCurrency(totalEarnedAmt);
    document.getElementById('payoutPending').textContent = formatCurrency(pending);
    document.getElementById('payoutReceived').textContent = formatCurrency(totalPaidAmt);
    
    const reqBtn = document.getElementById('requestPayoutBtn');
    const hasPendingReq = Object.values(payoutsData).some(p => p.status === 'pending');
    if (pending > 0 && !hasPendingReq) {
      reqBtn.disabled = false;
    } else {
      reqBtn.disabled = true;
    }
  }
  
  function computePerformanceScore(dealsList) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const dealsThisMonth = dealsList.filter(d => {
      const dDate = new Date(d.addedAt);
      return dDate.getMonth() === currentMonth && dDate.getFullYear() === currentYear;
    });
    
    let avgDealValue = dealsList.length ? dealsList.reduce((sum, d) => sum + d.price, 0) / dealsList.length : 0;
    
    let s1 = Math.min(dealsThisMonth.length * 8, 40);
    let s2 = Math.min((avgDealValue / 75000) * 30, 30);
    let s3 = Math.min((totalDealsCount / 15) * 20, 20);
    
    let s4 = 0;
    const hasPayment = dealsList.some(d => d.stage === 'Payment Received');
    const hasClosed = dealsList.some(d => d.stage === 'Closed');
    if (hasPayment) s4 = 10;
    else if (hasClosed) s4 = 5;
    
    const score = Math.floor(s1 + s2 + s3 + s4);
    
    // Animate TextNode explicitly to preserve max score span
    const statObj = document.getElementById('statPerfScore');
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / 1000, 1);
      const current = Math.floor(progress * score);
      statObj.innerHTML = `${current}<span class="score-max">/100</span>`;
      if (progress < 1) {
        globalThis.requestAnimationFrame(step);
      } else {
        statObj.innerHTML = `${score}<span class="score-max">/100</span>`;
      }
    };
    globalThis.requestAnimationFrame(step);
    
    document.getElementById('perfScoreFill').style.width = `${score}%`;
  }
  
  function renderEarningsChart(dealsList) {
    const chart = document.getElementById('earningsChart');
    chart.innerHTML = '';
    
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        monthStr: d.toLocaleString('default', { month: 'short' }),
        month: d.getMonth(),
        year: d.getFullYear(),
        total: 0
      });
    }
    
    dealsList.forEach(d => {
      const dDate = new Date(d.addedAt);
      const m = months.find(x => x.month === dDate.getMonth() && x.year === dDate.getFullYear());
      if (m) m.total += d.commission;
    });
    
    const maxVal = Math.max(...months.map(m => m.total), 1000); // min 1000 for scale
    
    months.forEach(m => {
      const pct = (m.total / maxVal) * 100;
      const isCurrentMonth = (i === months.length - 1);
      chart.innerHTML += `
        <div class="bar-wrapper">
          <div class="bar-value" style="font-size:10px;color:${m.total>0?'#C8890A':'#333'};">${m.total>0?formatCurrency(m.total):''}</div>
          <div class="bar chart-bar ${isCurrentMonth?'active':''}" style="height:0%" data-height="${pct}%"></div>
          <div class="bar-label">${escapeHTML(m.monthStr)}</div>
        </div>
      `;
    });
    // Animate bar heights
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.querySelectorAll('.chart-bar').forEach(bar => {
          bar.style.transition = 'height 0.8s cubic-bezier(0.4,0,0.2,1)';
          bar.style.height = bar.dataset.height || '0%';
        });
      }, 100);
    });
  }

  // Announcements — realtime with proper field names
  let seenAnnIds = new Set();
  registerListener(database.ref('announcements'), snap => {
    const list = document.getElementById('announcementsList');
    const badge = document.getElementById('annUnreadBadge');
    const data = snap.val();

    if (!data) {
      list.innerHTML = `<div class="empty-state"><p>No announcements yet</p></div>`;
      if(badge) badge.classList.add('hidden');
      return;
    }

    const anns = Object.keys(data).map(k => ({id:k,...data[k]}))
      .sort((a,b) => (b.postedAt||0) - (a.postedAt||0));

    // Count new ones
    const newCount = anns.filter(a => !seenAnnIds.has(a.id)).length;
    if(badge) {
      if(newCount > 0) { badge.textContent = newCount; badge.classList.remove('hidden'); }
      else badge.classList.add('hidden');
    }

    list.innerHTML = anns.map(a => {
      const isNew = !seenAnnIds.has(a.id);
      const isUrgent = a.urgent;
      const dateStr = a.postedAt ? new Date(a.postedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : (a.date||'');
      return `
        <div class="ann-item ${isUrgent?'urgent':'normal'}">
          ${isNew ? '<span class="ann-new-badge">NEW</span>' : ''}
          <div class="ann-header">
            <span class="ann-badge-tag ${isUrgent?'ann-badge-urgent':'ann-badge-update'}">
              ${isUrgent?'🔴 URGENT':'📢 UPDATE'}
            </span>
          </div>
          <div class="ann-title">${escapeHTML(a.title||'')}</div>
          <div class="ann-body">${escapeHTML(a.body||a.text||'')}</div>
          <div class="ann-date">${dateStr}</div>
        </div>
      `;
    }).join('');

    // Mark all as seen after render
    anns.forEach(a => seenAnnIds.add(a.id));
  });

  // 8. NOTIFICATION BELL
  registerListener(database.ref('notifications/' + code), snap => {
    const data = snap.val();
    const badge = document.getElementById('notificationBadge');
    const list = document.getElementById('notificationList');
    
    if (!data) {
      badge.classList.add('hidden');
      list.innerHTML = `<div class="empty-state"><p>No notifications</p></div>`;
      return;
    }
    
    const notifs = Object.keys(data).map(k => ({id: k, ...data[k]})).sort((a,b) => b.time - a.time);
    const unread = notifs.filter(n => !n.read).length;
    
    if (unread > 0) {
      badge.textContent = unread;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
    
    list.innerHTML = notifs.map(n => `
      <div class="notif-item ${n.read ? 'read' : ''}">
        <p>${escapeHTML(n.text)}</p>
        <div class="text-btn mt-2" style="font-size:0.75rem">${new Date(n.time).toLocaleString()}</div>
      </div>
    `).join('');
  });
  
  const notifPanel = document.getElementById('notificationPanel');
  document.getElementById('notificationBtn').addEventListener('click', () => {
    notifPanel.classList.add('open');
    // Mark all as read
    database.ref('notifications/' + code).once('value', snap => {
      const d = snap.val();
      if(d) {
        Object.keys(d).forEach(id => {
          if(!d[id].read) database.ref('notifications/' + code + '/' + id).update({read: true});
        });
      }
    });
  });
  document.getElementById('closeNotifBtn').addEventListener('click', () => {
    notifPanel.classList.remove('open');
  });
  document.getElementById('clearNotifBtn').addEventListener('click', () => {
    database.ref('notifications/' + code).remove();
  });


  // 3. LOG DEAL TAB
  let selectedPkg = null;
  let selectedStage = 'Lead Found';
  
  const pkgGrid = document.getElementById('pkgSelectGrid');
  Object.values(PACKAGES).forEach(p => {
    const earn = (p.price * p.commissionPct / 100);
    const pctClass = p.commissionPct >= 15 ? 'pct-15' : 'pct-10';
    pkgGrid.innerHTML += `
      <div class="pkg-card" data-pkg="${p.name}" onclick="selectPkgCard(this, '${p.name}')">
        <div class="pkg-card-name">${p.name}</div>
        <div class="pkg-card-price">${formatCurrency(p.price)}</div>
        <div class="pkg-card-earn">You earn ${formatCurrency(earn)}</div>
        <span class="pct-badge ${pctClass}">${p.commissionPct}% Commission</span>
      </div>
    `;
  });
  
  globalThis.selectPkgCard = function(card, pkgName) {
    document.querySelectorAll('#pkgSelectGrid .pkg-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    selectedPkg = PACKAGES[pkgName.toUpperCase()];
    updateLivePreview();
    validateDealForm();
    const pb = document.getElementById('dealPreviewBox');
    if(pb) pb.style.display = 'block';
  };
  
  const pkgBtns = document.querySelectorAll('#pkgSelectGrid .pkg-card');
  
  const stageBtns = document.querySelectorAll('#stageSelectGrid .stage-btn, #stageSelectGrid .stage-pill');
  stageBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      stageBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedStage = btn.dataset.stage;
      updateLivePreview();
    });
  });
  
  const clientInput = document.getElementById('dealClientName');
  clientInput.addEventListener('input', validateDealForm);
  
  // Notes char counter
  const dealNotesEl = document.getElementById('dealNotes');
  const dealNotesCount = document.getElementById('dealNotesCount');
  if(dealNotesEl && dealNotesCount) {
    dealNotesEl.addEventListener('input', () => {
      dealNotesCount.textContent = dealNotesEl.value.length;
    });
  }
  
  function updateLivePreview() {
    if (!selectedPkg) return;
    
    const extraPct = getExtraCommissionPct(currentTierObj);
    const totalPct = selectedPkg.commissionPct + extraPct;
    const commission = (selectedPkg.price * totalPct) / 100;
    
    document.getElementById('previewPkg').textContent = selectedPkg.name;
    document.getElementById('previewRate').textContent = `${totalPct}%` + (extraPct > 0 ? ` (includes +${extraPct}% tier bonus)` : '');
    document.getElementById('previewEarning').textContent = formatCurrency(commission);
  }
  
  function validateDealForm() {
    const submitBtn = document.getElementById('submitDealBtn');
    if (selectedPkg && clientInput.value.trim().length > 0) {
      submitBtn.disabled = false;
    } else {
      submitBtn.disabled = true;
    }
  }
  
  document.getElementById('submitDealBtn').addEventListener('click', () => {
    const clientName = clientInput.value.trim();
    const industry = document.getElementById('dealIndustry').value.trim();
    const followupDate = document.getElementById('dealFollowup').value;
    const notes = document.getElementById('dealNotes').value.trim();
    const clientPhone = (document.getElementById('dealClientPhone') && document.getElementById('dealClientPhone').value.trim()) || '';
    const cityArea = (document.getElementById('dealCityArea') && document.getElementById('dealCityArea').value.trim()) || '';
    
    const extraPct = getExtraCommissionPct(currentTierObj);
    const totalPct = selectedPkg.commissionPct + extraPct;
    const commission = (selectedPkg.price * totalPct) / 100;
    
    const now = Date.now();
    const dealRef = database.ref('deals/' + code).push();
    dealRef.set({
      clientName,
      industry,
      package: selectedPkg.name,
      price: selectedPkg.price,
      pct: totalPct,
      commission,
      stage: selectedStage,
      notes,
      followupDate,
      clientPhone,
      cityArea,
      addedAt: now,
      partnerCode: code,
      date: new Date().toLocaleDateString('en-IN')
    }).then(() => {
      database.ref('activity').push({
        icon: '🤝',
        text: `${username} logged a ${selectedPkg.name} deal — ₹${commission}`,
        time: now
      });
      showToast('Deal logged successfully!', 'success');
      
      // Reset form
      clientInput.value = '';
      document.getElementById('dealIndustry').value = '';
      document.getElementById('dealFollowup').value = '';
      document.getElementById('dealNotes').value = '';
      document.querySelectorAll('#pkgSelectGrid .pkg-card').forEach(b => b.classList.remove('active'));
      stageBtns.forEach(b => b.classList.remove('active'));
      stageBtns[0].classList.add('active');
      selectedPkg = null;
      selectedStage = 'Lead Found';
      document.getElementById('previewPkg').textContent = '-';
      document.getElementById('previewRate').textContent = '-';
      document.getElementById('previewEarning').textContent = '₹0';
      if(document.getElementById('dealClientPhone')) document.getElementById('dealClientPhone').value = '';
      if(document.getElementById('dealCityArea')) document.getElementById('dealCityArea').value = '';
      if(document.getElementById('dealPreviewBox')) document.getElementById('dealPreviewBox').style.display = 'none';
      if(document.getElementById('dealNotesCount')) document.getElementById('dealNotesCount').textContent = '0';
      validateDealForm();
      
      // Switch to pipeline tab
      document.querySelector('.tab-btn[data-target="pipeline"]').click();
    });
  });


  // 4. PIPELINE TAB
  let currentPipelineFilter = 'all';
  let _cachedDeals = [];

  globalThis.filterPipeline = function(filter, btn) {
    currentPipelineFilter = filter;
    document.querySelectorAll('#pipelineStageFilter .mini-stage-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    renderPipeline(_cachedDeals);
  };

  function renderPipeline(dealsList) {
    _cachedDeals = dealsList;
    const pipelineList = document.getElementById('pipelineList');
    const STAGES = ['Lead Found','Pitched','Negotiating','Closed','Payment Received'];
    const stageClass = {'Lead Found':'stage-lead','Pitched':'stage-pitched','Negotiating':'stage-negotiating','Closed':'stage-closed','Payment Received':'stage-payment'};

    let activeDeals = dealsList.filter(d => d.stage !== 'Payment Received');
    if(currentPipelineFilter !== 'all') {
      activeDeals = activeDeals.filter(d => d.stage === currentPipelineFilter);
    }
    activeDeals.sort((a,b) => (b.addedAt||0) - (a.addedAt||0));

    if (activeDeals.length === 0) {
      pipelineList.innerHTML = `<div class="empty-state glass-card" style="padding:40px;text-align:center;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="1.5" style="margin-bottom:12px;"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg><p class="muted-text">${currentPipelineFilter==='all'?'No active deals. Log your first deal!':'No deals in this stage.'}</p></div>`;
      return;
    }

    pipelineList.innerHTML = activeDeals.map(d => {
      const currIdx = STAGES.indexOf(d.stage);
      const stageProgress = STAGES.slice(0,4).map((_,i) => {
        let cls = '';
        if(i < currIdx) cls = 'done';
        else if(i === currIdx) cls = 'current';
        return `<div class="prog-step ${cls}"></div>`;
      }).join('');

      let followupHtml = '';
      if(d.followupDate) {
        const fDate = new Date(d.followupDate);
        const today = new Date(); today.setHours(0,0,0,0);
        const isOverdue = fDate < today;
        const fStr = fDate.toLocaleDateString('en-IN',{day:'2-digit',month:'short'});
        followupHtml = `<span class="followup-badge ${isOverdue?'followup-overdue':''}">${isOverdue?'⚠️ Overdue: ':'📅 Follow-up: '}${fStr}</span>`;
      }

      const phoneBadge = d.clientPhone ? `<span style="font-size:11px;color:#3B82F6;margin-left:6px;">📞 <a href="tel:${escapeHTML(d.clientPhone)}" style="color:inherit;text-decoration:none;">${escapeHTML(d.clientPhone)}</a></span>` : '';
      const waLink = d.clientPhone ? `<a href="https://wa.me/91${d.clientPhone.replace(/\D/g,'')}" target="_blank" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);color:#22C55E;font-size:11px;font-weight:600;text-decoration:none;margin-top:4px;">💬 WhatsApp</a>` : '';

      const stageBtns = STAGES.map(s => `<button class="mini-stage-btn ${d.stage===s?'active':''}" onclick="updateDealStage('${d.id}','${s}','${escapeHTML(d.clientName||'').replaceAll("'","\\'")}',${d.commission})">${s==='Payment Received'?'💰 ':''} ${s}</button>`).join('');

      return `<div class="pipeline-card ${stageClass[d.stage]||''}">
        <div class="pipeline-card-header">
          <div>
            <div class="pipeline-client">${escapeHTML(d.clientName||'—')}</div>
            <div class="pipeline-meta">${escapeHTML(d.industry||'')}${d.cityArea?` · ${escapeHTML(d.cityArea)}`:''} · ${d.date||''}${phoneBadge}</div>
            ${followupHtml}${waLink}
          </div>
          <div class="pipeline-commission">
            <div class="pipeline-commission-val">+${formatCurrency(d.commission)}</div>
            <div class="pipeline-commission-pkg">${escapeHTML(d.package||'')} · ${d.pct||0}%</div>
          </div>
        </div>
        <div class="pipeline-progress">${stageProgress}</div>
        <div class="prog-labels"><span>Lead</span><span>Pitched</span><span>Negotiating</span><span>Closed</span></div>
        ${d.notes ? `<div class="pipeline-notes">📝 ${escapeHTML(d.notes)}</div>` : ''}
        <div class="pipeline-stage-btns">${stageBtns}</div>
      </div>`;
    }).join('');
  }

    // Make update global for inline onclick
  globalThis.updateDealStage = function(dealId, newStage, clientName, commission) {
    database.ref('deals/' + code + '/' + dealId).update({ stage: newStage }).then(() => {
      if (newStage === 'Payment Received') {
        database.ref('activity').push({
          icon: '💰',
          text: `${username} closed ${clientName} & received payment! (+₹${commission})`,
          time: Date.now()
        });
        showToast('Deal moved to Payment Received!', 'success');
      }
    });
  };

  // 5. HISTORY TAB
  let _historyAllDeals = [];

  function renderHistory(dealsList) {
    _historyAllDeals = dealsList;
    applyHistoryFilters();
  }

  function applyHistoryFilters() {
    const searchEl = document.getElementById('historySearch');
    const filterEl = document.getElementById('historyFilter');
    const searchTxt = searchEl ? searchEl.value.toLowerCase() : '';
    const filterStage = filterEl ? filterEl.value : 'all';

    let filtered = [..._historyAllDeals].sort((a,b) => (b.addedAt||0) - (a.addedAt||0));
    if(searchTxt) filtered = filtered.filter(d => (d.clientName||'').toLowerCase().includes(searchTxt) || (d.industry||'').toLowerCase().includes(searchTxt));
    if(filterStage !== 'all') filtered = filtered.filter(d => d.stage === filterStage);

    const list = document.getElementById('historyList');
    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty-state" style="padding:40px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="1.5" style="margin-bottom:10px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p class="muted-text">No deals found</p></div>`;
      return;
    }

    const STAGES = ['Lead Found','Pitched','Negotiating','Closed','Payment Received'];
    const stageColors = {'Lead Found':'#3B82F6','Pitched':'#A855F7','Negotiating':'#F59E0B','Closed':'#22C55E','Payment Received':'#C8890A'};

    list.innerHTML = filtered.map(d => {
      const currIdx = STAGES.indexOf(d.stage);
      const dots = STAGES.map((_,i) => `<div class="dot ${i<currIdx?'filled':i===currIdx?'current':''}" title="${STAGES[i]}"></div>`).join('');
      const stageColor = stageColors[d.stage] || '#666';
      return `<div class="deal-card" style="margin-bottom:10px;position:relative;">
        <div class="deal-header">
          <div style="flex:1;">
            <div class="deal-client">${escapeHTML(d.clientName||'—')}</div>
            <div class="text-btn mt-2">${escapeHTML(d.industry||'—')}${d.cityArea?` · 📍 ${escapeHTML(d.cityArea)}`:''} · ${d.date||''}</div>
            ${d.clientPhone ? `<div style="font-size:11px;color:#3B82F6;margin-top:3px;">📞 <a href="tel:${escapeHTML(d.clientPhone)}" style="color:inherit;text-decoration:none;">${escapeHTML(d.clientPhone)}</a></div>` : ''}
            ${d.followupDate ? `<div style="font-size:11px;color:#F59E0B;margin-top:3px;">📅 Follow-up: ${d.followupDate}</div>` : ''}
            ${d.notes ? `<div style="font-size:12px;color:#555;margin-top:4px;font-style:italic;">📝 ${escapeHTML(d.notes.substring(0,80))}${d.notes.length>80?'...':''}</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <span class="deal-chip" style="color:${stageColor};background:${stageColor}15;border:1px solid ${stageColor}30;">${d.package||'—'}</span>
            <div class="text-green mt-2 font-bold">+${formatCurrency(d.commission)}</div>
            <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;">
              <button onclick="openEditDeal('${d.id}')" style="padding:4px 10px;border-radius:6px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);color:#3B82F6;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Edit</button>
              <button onclick="deleteDeal('${d.id}','${escapeHTML(d.clientName||'').replaceAll("'","\'")}')" style="padding:4px 10px;border-radius:6px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#EF4444;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Del</button>
            </div>
          </div>
        </div>
        <div class="deal-stage-dots">${dots}</div>
        <div class="text-center text-btn mt-2" style="color:${stageColor};font-size:12px;font-weight:600;">${d.stage}</div>
      </div>`;
    }).join('');
  }

  // Wire history search + filter
  const histSearchEl = document.getElementById('historySearch');
  const histFilterEl = document.getElementById('historyFilter');
  if(histSearchEl) histSearchEl.addEventListener('input', applyHistoryFilters);
  if(histFilterEl) histFilterEl.addEventListener('change', applyHistoryFilters);

  // 6. PAYOUTS TAB
  function renderPayouts(payoutsList) {
    const list = document.getElementById('payoutHistoryList');
    const sorted = [...payoutsList].sort((a,b) => b.requestedAt - a.requestedAt);
    
    if (sorted.length === 0) {
      list.innerHTML = `<div class="empty-state"><span class="empty-icon">💸</span><p>No payout requests yet</p></div>`;
      return;
    }
    
    list.innerHTML = sorted.map(p => {
      let badgeColor = 'text-amber';
      let statusText = 'PENDING';
      let extra = '';
      if (p.status === 'paid') {
        badgeColor = 'text-green';
        statusText = 'PAID';
        extra = `<div class="mt-2 text-btn">UTR: ${escapeHTML(p.utr || 'N/A')}</div>`;
      } else if (p.status === 'rejected') {
        badgeColor = 'text-red';
        statusText = 'REJECTED';
        extra = `<div class="mt-2 text-btn">Reason: ${escapeHTML(p.reason || 'N/A')}</div>`;
      }
      
      return `
        <div class="deal-card">
          <div class="flex-between">
            <span class="font-bold">${formatCurrency(p.amount)}</span>
            <span class="${badgeColor} font-bold text-sm">${statusText}</span>
          </div>
          <div class="text-btn mt-2">Requested: ${p.date} | UPI: ${escapeHTML(p.upi)}</div>
          ${extra}
        </div>
      `;
    }).join('');
  }
  
  const upiInput = document.getElementById('payoutUpi');
  const reqPayoutBtn = document.getElementById('requestPayoutBtn');
  
  reqPayoutBtn.addEventListener('click', () => {
    const upi = upiInput.value.trim();
    if (!upi) {
      showToast('Please enter your UPI ID', 'error');
      return;
    }
    const pendingAmount = totalEarnedAmt - totalPaidAmt;
    if (pendingAmount <= 0) return;
    
    const now = Date.now();
    database.ref('payouts/' + code).push({
      amount: pendingAmount,
      upi: upi,
      status: 'pending',
      requestedAt: now,
      date: new Date().toLocaleDateString('en-IN')
    }).then(() => {
      showToast('Payout requested successfully!', 'success');
      
      const msg = `Hi Satyam bhai! Payout Request\nPartner: ${username}\nCode: ${code}\nAmount: ${formatCurrency(pendingAmount)}\nUPI: ${upi}\nDate: ${new Date().toLocaleDateString('en-IN')}`;
      const msgArea = document.getElementById('payoutMsg');
      msgArea.value = msg;
      
      reqPayoutBtn.disabled = true;
      upiInput.value = '';
    });
  });
  
  document.getElementById('copyMsgBtn').addEventListener('click', () => {
    const text = document.getElementById('payoutMsg').value;
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Message copied to clipboard! 📋', 'success');
      }).catch(() => {
        const el = document.getElementById('payoutMsg');
        el.select(); document.execCommand('copy');
        showToast('Message copied! 📋', 'success');
      });
    }
  });
  
  globalThis.copyPayoutMsg = function() {
    const text = document.getElementById('payoutMsg').value;
    if(text) {
      navigator.clipboard.writeText(text).then(() => showToast('Copied! 📋','success')).catch(()=>{});
    }
  };


  // FOLLOW-UP ALERT SYSTEM
  function renderFollowUpAlert(dealsList) {
    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today.getTime() + 86400000);

    const todayDeals = dealsList.filter(d => d.followupDate === todayStr && d.stage !== 'Payment Received');
    const overdueDeals = dealsList.filter(d => {
      if(!d.followupDate || d.stage === 'Payment Received') return false;
      return new Date(d.followupDate) < today;
    });

    // Remove existing alert
    const existingAlert = document.getElementById('followup-alert');
    if(existingAlert) existingAlert.remove();

    if(todayDeals.length === 0 && overdueDeals.length === 0) return;

    const statsGrid = document.querySelector('.stats-grid');
    if(!statsGrid) return;

    const alertDiv = document.createElement('div');
    alertDiv.id = 'followup-alert';
    alertDiv.style.cssText = 'background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(239,68,68,0.05));border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:14px 18px;margin-bottom:16px;position:relative;overflow:hidden;';
    alertDiv.innerHTML = `
      <div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:${overdueDeals.length?'#EF4444':'#F59E0B'};"></div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:20px;">${overdueDeals.length?'⚠️':'📅'}</span>
        <div>
          <div style="font-weight:700;font-size:14px;color:${overdueDeals.length?'#EF4444':'#F59E0B'};">
            ${overdueDeals.length ? `${overdueDeals.length} Overdue Follow-up${overdueDeals.length>1?'s':''}!` : ''}
            ${todayDeals.length ? `${todayDeals.length} Follow-up${todayDeals.length>1?'s':''} Today` : ''}
          </div>
          <div style="font-size:12px;color:#888;margin-top:3px;">
            ${[...overdueDeals, ...todayDeals].map(d => escapeHTML(d.clientName)).join(', ')}
          </div>
        </div>
        <button onclick="document.querySelector('.tab-btn[data-target=\'pipeline\']').click()" 
          style="margin-left:auto;padding:7px 14px;border-radius:8px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);color:#F59E0B;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">
          View Pipeline →
        </button>
      </div>
    `;
    statsGrid.parentNode.insertBefore(alertDiv, statsGrid);
  }

  // 7. CALCULATOR TAB
  let calcSelectedPkg = null;
  const calcGrid = document.getElementById('calcPkgGrid');
  
  Object.values(PACKAGES).forEach(p => {
    const earn = Math.round(p.price * p.commissionPct / 100);
    const pctClass = p.commissionPct >= 15 ? 'pct-15' : 'pct-10';
    calcGrid.innerHTML += `
      <div class="pkg-card" data-calc-pkg="${p.name}" onclick="selectCalcPkg(this,'${p.name}')">
        <div class="pkg-card-name">${p.name}</div>
        <div class="pkg-card-price">${formatCurrency(p.price)}</div>
        <div class="pkg-card-earn">Earn ${formatCurrency(earn)}</div>
        <span class="pct-badge ${pctClass}">${p.commissionPct}%</span>
      </div>
    `;
  });
  
  globalThis.selectCalcPkg = function(card, pkgName) {
    document.querySelectorAll('#calcPkgGrid .pkg-card').forEach(b => b.classList.remove('active'));
    card.classList.add('active');
    calcSelectedPkg = PACKAGES[pkgName.toUpperCase()];
    updateCalculator();
  };
  
  const calcQtyInput = document.getElementById('calcQty');
  document.getElementById('calcMinus').addEventListener('click', () => {
    let val = Number.parseInt(calcQtyInput.value);
    if (val > 1) { calcQtyInput.value = val - 1; updateCalculator(); }
  });
  document.getElementById('calcPlus').addEventListener('click', () => {
    let val = Number.parseInt(calcQtyInput.value);
    if (val < 30) { calcQtyInput.value = val + 1; updateCalculator(); }
  });
  
  function updateCalculator() {
    if (!calcSelectedPkg) return;
    
    const qty = Number.parseInt(calcQtyInput.value);
    const baseRate = calcSelectedPkg.commissionPct;
    const perDealBase = (calcSelectedPkg.price * baseRate) / 100;
    const totalQtyBase = perDealBase * qty;
    
    let tierBonus = 0;
    let extraCommPct = 0;
    
    // Simulate tier based on qty + current deals
    const simDeals = totalDealsCount + qty;
    const simTier = computeTier(simDeals);
    
    if (simDeals >= TIERS.GOLD.minDeals && currentTierObj.minDeals < TIERS.GOLD.minDeals) tierBonus += TIERS.GOLD.bonus;
    if (simDeals >= TIERS.SILVER.minDeals && currentTierObj.minDeals < TIERS.SILVER.minDeals) tierBonus += TIERS.SILVER.bonus;
    if (simDeals >= TIERS.BRONZE.minDeals && currentTierObj.minDeals < TIERS.BRONZE.minDeals) tierBonus += TIERS.BRONZE.bonus;
    
    extraCommPct = getExtraCommissionPct(simTier);
    const extraCommAmt = ((calcSelectedPkg.price * extraCommPct) / 100) * qty;
    
    const grandTotal = totalQtyBase + tierBonus + extraCommAmt;
    
    document.getElementById('calcPkgPrice').textContent = formatCurrency(calcSelectedPkg.price);
    document.getElementById('calcBaseRate').textContent = `${baseRate}%`;
    document.getElementById('calcPerDeal').textContent = formatCurrency(perDealBase);
    document.getElementById('calcTotalQty').textContent = formatCurrency(totalQtyBase);
    document.getElementById('calcTierBonus').textContent = `+${formatCurrency(tierBonus)}`;
    document.getElementById('calcExtraComm').textContent = `+${formatCurrency(extraCommAmt)} (${extraCommPct}%)`;
    document.getElementById('calcGrandTotal').innerHTML = `<strong>${formatCurrency(grandTotal)}</strong>`;
  }
  
  // ── DEAL EDIT MODAL ──────────────────────────────────
  let editingDealId = null;

  globalThis.openEditDeal = function(dealId) {
    // Find deal from cached list
    const deal = _historyAllDeals.find(d => d.id === dealId);
    if(!deal) return;
    editingDealId = dealId;

    // Populate modal fields
    document.getElementById('editClientName').value = deal.clientName || '';
    document.getElementById('editIndustry').value = deal.industry || '';
    document.getElementById('editClientPhone').value = deal.clientPhone || '';
    document.getElementById('editCityArea').value = deal.cityArea || '';
    document.getElementById('editFollowup').value = deal.followupDate || '';
    document.getElementById('editNotes').value = deal.notes || '';
    document.getElementById('editStageDisplay').textContent = deal.stage || 'Lead Found';

    document.getElementById('editDealModal').style.display = 'flex';
  };

  globalThis.closeEditModal = function() {
    document.getElementById('editDealModal').style.display = 'none';
    editingDealId = null;
  };

  globalThis.saveEditDeal = function() {
    if(!editingDealId) return;
    const updates = {
      clientName:  document.getElementById('editClientName').value.trim(),
      industry:    document.getElementById('editIndustry').value.trim(),
      clientPhone: document.getElementById('editClientPhone').value.trim(),
      cityArea:    document.getElementById('editCityArea').value.trim(),
      followupDate:document.getElementById('editFollowup').value,
      notes:       document.getElementById('editNotes').value.trim()
    };
    if(!updates.clientName) { showToast('Client name required!','error'); return; }
    database.ref('deals/' + code + '/' + editingDealId).update(updates)
      .then(() => {
        showToast('Deal updated! ✅','success');
        closeEditModal();
      })
      .catch(err => showToast('Update failed: ' + err.message,'error'));
  };

  globalThis.deleteDeal = function(dealId, clientName) {
    if(!confirm('Delete deal with ' + clientName + '? This cannot be undone.')) return;
    database.ref('deals/' + code + '/' + dealId).remove()
      .then(() => {
        database.ref('activity').push({
          icon: '🗑️',
          text: username + ' deleted deal: ' + clientName,
          time: Date.now()
        });
        showToast('Deal deleted.','info');
      })
      .catch(err => showToast('Delete failed: ' + err.message,'error'));
  };

  // Close modal on overlay click
  const editModal = document.getElementById('editDealModal');
  if(editModal) {
    editModal.addEventListener('click', e => {
      if(e.target === editModal) closeEditModal();
    });
  }

  // ── PAYOUT MSG AUTO-GENERATE ─────────────────────────
  // [P9] Auto-generate WA msg when payouts tab opens
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if(btn.dataset.target === 'payouts') {
      btn.addEventListener('click', () => {
        setTimeout(() => {
          const pending = totalEarnedAmt - totalPaidAmt;
          if(pending > 0) {
            const upiVal = document.getElementById('payoutUpi').value.trim();
            const msg = 'Hi Satyam bhai!\n\n💸 *Payout Request*\nPartner: ' + username + '\nCode: ' + code + '\nAmount: ' + formatCurrency(pending) + '\nUPI: ' + (upiVal || '[Enter your UPI ID]') + '\nDate: ' + new Date().toLocaleDateString('en-IN') + '\n\nKindly process kar dena. 🙏';
            const msgEl = document.getElementById('payoutMsg');
            if(msgEl && !msgEl.value) msgEl.value = msg;
          }
        }, 200);
      });
    }
  });

  // Also update msg when UPI is typed
  const payoutUpiEl = document.getElementById('payoutUpi');
  if(payoutUpiEl) {
    payoutUpiEl.addEventListener('input', () => {
      const pending = totalEarnedAmt - totalPaidAmt;
      const upiVal = payoutUpiEl.value.trim();
      if(!upiVal) return;
      const msg = 'Hi Satyam bhai!\n\n💸 *Payout Request*\nPartner: ' + username + '\nCode: ' + code + '\nAmount: ' + formatCurrency(pending) + '\nUPI: ' + upiVal + '\nDate: ' + new Date().toLocaleDateString('en-IN') + '\n\nKindly process kar dena. 🙏';
      const msgEl = document.getElementById('payoutMsg');
      if(msgEl) msgEl.value = msg;
    });
  }


});
