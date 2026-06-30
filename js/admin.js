/* admin.js - Admin Portal Logic */

document.addEventListener('DOMContentLoaded', () => {
  const session = checkSession('admin');
  if (!session) return; // redirect handled in checkSession

  document.getElementById('headerUsername').textContent = session.username;

  // 1. LISTENER MANAGEMENT
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

  // Logout
  const logoutBtn = document.getElementById('logoutBtn')
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

  // TimeAgo Helper
  function timeAgo(timestamp) {
    if (!timestamp) return 'Just now';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${Math.max(0, seconds)}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // Auto-refresh TimeAgo displays in Activity Feed
  setInterval(() => {
    document.querySelectorAll('.time-ago').forEach(el => {
      const ts = Number.parseInt(el.dataset.ts || '0', 10);
      if (ts) el.textContent = timeAgo(ts);
    });
  }, 60000);

  // Tier Helpers
  function getTierFromDeals(n) {
    if (n >= TIERS.GOLD.minDeals) return { name: TIERS.GOLD.name, emoji: '🥇', color: TIERS.GOLD.color || '#C8890A' };
    if (n >= TIERS.SILVER.minDeals) return { name: TIERS.SILVER.name, emoji: '🥈', color: TIERS.SILVER.color || '#C0C0C0' };
    if (n >= TIERS.BRONZE.minDeals) return { name: TIERS.BRONZE.name, emoji: '🥉', color: TIERS.BRONZE.color || '#CD7F32' };
    return { name: TIERS.JOINING.name, emoji: '⭐', color: TIERS.JOINING.color || '#3B82F6' };
  }

  function tierChip(n) {
    const t = getTierFromDeals(n);
    return `<span class="badge-tier" style="background:${t.color}20; color:${t.color}; border: 1px solid ${t.color}50;">${t.emoji} ${t.name}</span>`;
  }


  // DOM Elements
  const tabBtns = document.querySelectorAll('.tab-btn');
  const sections = document.querySelectorAll('.tab-section');

  // Tab Switcher
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      sections.forEach(s => { s.classList.add('hidden'); s.classList.remove('active'); });
      btn.classList.add('active');
      const targetSec = document.getElementById(btn.dataset.target);
      if (targetSec) {
        targetSec.classList.remove('hidden');
        targetSec.classList.add('active');
      }

      if (btn.dataset.target === 'dash-settings') {
        loadSettingsData();
      }
    });
  });

  // Global State caching for Dashboard
  let allPartnersData = {};
  let allDealsArray = [];
  let allPayoutsData = {};
  
  // 2. GLOBAL PAYOUT BADGE
  function updatePendingBadge(count) {
    const badge = document.getElementById('pendingPayoutBadge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline-flex';
      badge.classList.add('has-items');
    } else {
      badge.textContent = '0';
      badge.style.display = 'none';
      badge.classList.remove('has-items');
    }
  }
  globalThis._updatePendingBadge = updatePendingBadge;

  registerListener(database.ref('payouts'), (snap) => {
    let pendingCount = 0;
    allPayoutsData = snap.val() || {};
    snap.forEach(partnerSnap => {
      partnerSnap.forEach(payoutSnap => {
        if (payoutSnap.val().status === 'pending') pendingCount++;
      });
    });
    updatePendingBadge(pendingCount);
    
    updateDashboardStats();
    renderPayoutsTab();
  });

  const payoutBellBtn = document.getElementById('payoutBellBtn');
  if (payoutBellBtn) payoutBellBtn.addEventListener('click', () => {
    document.querySelector('.tab-btn[data-target="dash-payouts"]').click();
  });

  // 3. DASHBOARD TAB
  registerListener(database.ref('partners'), (snap) => {
    allPartnersData = snap.val() || {};
    const totalPartners = Object.keys(allPartnersData).length;
    animateValue(document.getElementById('statTotalPartners'), 0, totalPartners, 1000, false);
    // Populate partner filter dropdown
    const partnerFilter = document.getElementById('filterPartner');
    if(partnerFilter) {
      const cv = partnerFilter.value;
      partnerFilter.innerHTML = '<option value="">All Partners</option>' +
        Object.keys(allPartnersData).map(c =>
          `<option value="${c}" ${c===cv?'selected':''}>${escapeHTML(allPartnersData[c].name||c)} (${c})</option>`
        ).join('');
    }
    renderPartnersTab();
    renderDealsTab();
    renderPayoutsTab();
    updateDashboardStats();
    renderLeaderboard();
  });

  registerListener(database.ref('deals'), (snap) => {
    allDealsArray = [];
    let totalRevenue = 0;
    let thisMonthRevenue = 0;
    let lastMonthRevenue = 0;
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    snap.forEach(partnerSnap => {
      const code = partnerSnap.key;
      partnerSnap.forEach(dealSnap => {
        const deal = dealSnap.val();
        deal.id = dealSnap.key;
        deal.partnerCode = code;
        allDealsArray.push(deal);
        totalRevenue += (deal.commission || 0);
        
        const dealDate = new Date(deal.addedAt || 0);
        if (dealDate.getFullYear() === currentYear && dealDate.getMonth() === currentMonth) {
          thisMonthRevenue += (deal.commission || 0);
        } else if (
          (currentMonth === 0 && dealDate.getFullYear() === currentYear - 1 && dealDate.getMonth() === 11) ||
          (currentMonth > 0 && dealDate.getFullYear() === currentYear && dealDate.getMonth() === currentMonth - 1)
        ) {
          lastMonthRevenue += (deal.commission || 0);
        }
      });
    });
    
    animateValue(document.getElementById('statTotalDeals'), 0, allDealsArray.length, 1000, false);
    animateValue(document.getElementById('statTotalRevenue'), 0, totalRevenue, 1000, true);
    
    // Update monthly + total revenue display
    const monthlyEl = document.getElementById('statMonthlyRevenue');
    if(monthlyEl) monthlyEl.textContent = formatCurrency(thisMonthRevenue);
    
    let changeText = '';
    let changeColor = '#666';
    if (lastMonthRevenue > 0) {
      const pct = ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;
      changeText = ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}% MoM)`;
      changeColor = pct >= 0 ? '#22C55E' : '#EF4444';
    } else if (thisMonthRevenue > 0) {
      changeText = ' (+100% MoM)';
      changeColor = '#22C55E';
    }
    const changeEl = document.getElementById('statRevenueChange');
    if(changeEl) changeEl.innerHTML = `<span style="color:${changeColor};font-size:11px;">${changeText}</span>`;
    
    updateDashboardStats();
    renderDealsTab();
    renderPartnersTab();
    renderPayoutsTab();
    renderLeaderboard();
  });

  function updateDashboardStats() {
    let totalPending = 0;
    Object.keys(allPayoutsData).forEach(code => {
      Object.keys(allPayoutsData[code]).forEach(pid => {
        if (allPayoutsData[code][pid].status === 'pending') {
          totalPending += allPayoutsData[code][pid].amount || 0;
        }
      });
    });
    animateValue(document.getElementById('statTotalPending'), 0, totalPending, 1000, true);
    renderLeaderboard();
  }

  function renderLeaderboard() {
    const list = document.getElementById('leaderboardList');
    if (Object.keys(allPartnersData).length === 0) {
       list.innerHTML = `<div class="empty-state"><div class="empty-icon text-4xl mb-2 opacity-50">🏆</div><p class="muted-text">No partners yet</p></div>`;
       return;
    }
    
    const partnerStats = Object.keys(allPartnersData).map(code => {
      const partner = allPartnersData[code];
      const pDeals = allDealsArray.filter(d => d.partnerCode === code);
      const earned = pDeals.reduce((sum, d) => sum + (d.commission || 0), 0);
      return { ...partner, dealsCount: pDeals.length, earned };
    });
    
    partnerStats.sort((a, b) => b.dealsCount - a.dealsCount);
    const top5 = partnerStats.slice(0, 5);
    
    list.innerHTML = top5.map((p, index) => {
      let rankEmoji = '🔹';
      if (index === 0) rankEmoji = '🥇';
      if (index === 1) rankEmoji = '🥈';
      if (index === 2) rankEmoji = '🥉';
      return `
        <div class="leaderboard-item">
          <div class="flex-row gap-2 items-center">
            <span style="font-size: 1.25rem;">${rankEmoji}</span>
            <div>
              <div class="font-bold">${escapeHTML(p.name)}</div>
              <div class="text-xs muted-text">${escapeHTML(p.code)}</div>
            </div>
          </div>
          <div class="flex-row gap-4 items-center">
            ${tierChip(p.dealsCount)}
            <div class="text-right">
              <div class="font-bold text-gold">${p.dealsCount} Deals</div>
              <div class="text-xs text-green">${formatCurrency(p.earned)}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // LIVE ACTIVITY FEED
  registerListener(database.ref('activity').orderByChild('time').limitToLast(20), (snap) => {
    const items = [];
    snap.forEach(s => items.unshift(s.val()));
    const list = document.getElementById('activityFeedList');
    if (items.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon text-4xl mb-2 opacity-50">📡</div><p class="muted-text">Waiting for activity...</p></div>`;
      return;
    }
    list.innerHTML = items.map(a => `
      <div class="activity-item activitySlide">
        <div class="text-xl">${a.icon}</div>
        <div class="flex-1">
          <div class="text-sm">${escapeHTML(a.text)}</div>
          <div class="text-xs muted-text mt-1 time-ago" data-ts="${a.time}">${timeAgo(a.time)}</div>
        </div>
      </div>
    `).join('');
  });

  // 4. PARTNERS TAB
  const registerBtn = document.getElementById('registerPartnerBtn');
  registerBtn.addEventListener('click', () => {
    const name = document.getElementById('newPartnerName').value.trim();
    let code = document.getElementById('newPartnerCode').value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    
    if (!name || !code) {
      showToast('Name and Code are required!', 'error');
      return;
    }
    if (allPartnersData[code]) {
      showToast('Partner Code already exists!', 'error');
      return;
    }
    
    const joined = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
    database.ref('partners/' + code).set({ name, code, joined }).then(() => {
      database.ref('activity').push({ icon:'👤', text:`New partner registered: ${name} (${code})`, time: Date.now() });
      showToast(`Partner ${code} registered successfully!`, 'success');
      document.getElementById('newPartnerName').value = '';
      document.getElementById('newPartnerCode').value = '';
    }).catch(err => showToast(err.message, 'error'));
  });

  function renderPartnersTab() {
    const filterTxt = document.getElementById('partnerFilter').value.toLowerCase();
    const tbody = document.getElementById('partnersTableBody');
    const partnerSelect = document.getElementById('filterPartner');
    let opts = '<option value="All">All Partners</option>';
    
    const codes = Object.keys(allPartnersData);
    let html = '';
    
    codes.forEach(code => {
      const p = allPartnersData[code];
      opts += `<option value="${escapeHTML(code)}">${escapeHTML(p.name)} (${escapeHTML(code)})</option>`;
      
      if (filterTxt && !p.name.toLowerCase().includes(filterTxt) && !code.toLowerCase().includes(filterTxt)) return;
      
      const pDeals = allDealsArray.filter(d => d.partnerCode === code);
      let earned = 0;
      pDeals.forEach(d => earned += (d.commission || 0));
      
      let pendingAmount = 0;
      if (allPayoutsData[code]) {
        Object.keys(allPayoutsData[code]).forEach(pid => {
          if (allPayoutsData[code][pid].status === 'pending') {
            pendingAmount += (allPayoutsData[code][pid].amount || 0);
          }
        });
      }
      
      // Format joined date properly
      let joinedStr = p.joined || '—';
      if(typeof p.joined === 'number') {
        joinedStr = new Date(p.joined).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
      }
      
      html += `
        <tr class="cursor-pointer hover:bg-glass" onclick="openPartnerDrawer('${code}')">
          <td>
            <div class="font-bold">${escapeHTML(p.name)}</div>
            <div class="text-xs muted-text">${escapeHTML(code)} · Joined ${escapeHTML(joinedStr)}</div>
          </td>
          <td>${tierChip(pDeals.length)}</td>
          <td class="font-bold text-gold">${pDeals.length}</td>
          <td class="text-green font-bold">${formatCurrency(earned)}</td>
          <td class="text-amber font-bold">${pendingAmount > 0 ? formatCurrency(pendingAmount) : '-'}</td>
          <td>
            <button class="btn-sm btn-red" onclick="event.stopPropagation(); removePartner('${code}', '${escapeHTML(p.name)}')">Remove</button>
          </td>
        </tr>
      `;
    });
    
    tbody.innerHTML = html;
    
    // Remember selected partner for Deals tab if possible
    const currentVal = partnerSelect.value;
    partnerSelect.innerHTML = opts;
    if (codes.includes(currentVal)) {
      partnerSelect.value = currentVal;
    }
  }

  const _pf = document.getElementById('partnerFilter'); if(_pf) _pf.addEventListener('input', renderPartnersTab);

  globalThis.removePartner = function(code, name) {
    if (!confirm(`Remove ${name} and all their data? Cannot undo.`)) return;
    
    const updates = {};
    updates[`partners/${code}`] = null;
    updates[`deals/${code}`] = null;
    updates[`payouts/${code}`] = null;
    updates[`notifications/${code}`] = null;
    updates[`adminNotes/${code}`] = null;
    
    database.ref().update(updates).then(() => {
      database.ref('activity').push({ icon:'🗑️', text:`Partner removed: ${name} (${code})`, time: Date.now() });
      showToast('Partner deleted.', 'success');
    }).catch(err => showToast(err.message, 'error'));
  };

  // PARTNER DRAWER
  const drawer = document.getElementById('partnerDrawer');
  const overlay = document.getElementById('drawerOverlay');
  let currentDrawerCode = null;

  globalThis.openPartnerDrawer = function(code) {
    currentDrawerCode = code;
    const p = allPartnersData[code];
    if (!p) return;
    
    document.getElementById('drawerPartnerName').textContent = p.name;
    document.getElementById('drawerPartnerCode').textContent = p.code;
    document.getElementById('drawerJoined').textContent = `Joined ${p.joined || '-'}`;
    
    const pDeals = allDealsArray.filter(d => d.partnerCode === code);
    const earned = pDeals.reduce((sum, d) => sum + (d.commission || 0), 0);
    // Performance score — same formula as partner.js
    const nowD = new Date();
    const dealsThisMonth = pDeals.filter(d => {
      const dd = new Date(d.addedAt || 0);
      return dd.getMonth() === nowD.getMonth() && dd.getFullYear() === nowD.getFullYear();
    });
    const avgVal = pDeals.length ? pDeals.reduce((s,d) => s+(d.price||0), 0) / pDeals.length : 0;
    const s1 = Math.min(40, dealsThisMonth.length * 8);
    const s2 = Math.min(30, (avgVal / 75000) * 30);
    const s3 = Math.min(20, (pDeals.length / 15) * 20);
    const hasPayment = pDeals.some(d => d.stage === 'Payment Received');
    const hasClosed = pDeals.some(d => d.stage === 'Closed');
    const s4 = hasPayment ? 10 : hasClosed ? 5 : 0;
    const score = Math.floor(s1 + s2 + s3 + s4);
    
    document.getElementById('drawerDealsCount').textContent = pDeals.length;
    document.getElementById('drawerEarned').textContent = formatCurrency(earned);
    document.getElementById('drawerTier').innerHTML = tierChip(pDeals.length);
    document.getElementById('drawerScore').textContent = score;
    
    // Notes
    document.getElementById('adminNotesArea').value = 'Loading...';
    database.ref(`adminNotes/${code}`).once('value').then(snap => {
      if (currentDrawerCode === code) {
        document.getElementById('adminNotesArea').value = snap.val() || '';
      }
    });

    // Deals list (last 10)
    const sortedDeals = pDeals.sort((a,b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0,10);
    const dealsList = document.getElementById('drawerDealsList');
    if (sortedDeals.length === 0) {
      dealsList.innerHTML = '<div class="text-sm muted-text">No deals logged.</div>';
    } else {
      dealsList.innerHTML = sortedDeals.map(d => `
        <div class="glass-card-inner mb-2 text-sm" style="background:#0f0f0f;border-radius:8px;padding:10px;margin-bottom:8px;border:1px solid #1f1f1f;">
          <div class="flex-between">
            <span class="font-bold">${escapeHTML(d.clientName||'—')}</span>
            <span class="text-green font-bold">+${formatCurrency(d.commission)}</span>
          </div>
          <div class="flex-between mt-1 text-xs muted-text">
            <span>${escapeHTML(d.package||'—')} · <span style="color:${d.stage==='Payment Received'?'#22C55E':d.stage==='Closed'?'#3B82F6':'#F59E0B'}">${escapeHTML(d.stage||'—')}</span></span>
            <span>${d.date||'—'}</span>
          </div>
          ${(d.clientPhone||d.cityArea) ? `<div class="mt-1 text-xs" style="color:#555;">
            ${d.clientPhone?`📞 ${escapeHTML(d.clientPhone)}`:''}
            ${d.cityArea?` · 📍 ${escapeHTML(d.cityArea)}`:''}
          </div>` : ''}
          ${d.notes ? `<div class="mt-1 text-xs" style="color:#444;font-style:italic;">📝 ${escapeHTML(d.notes.substring(0,60))}${d.notes.length>60?'...':''}</div>` : ''}
        </div>
      `).join('');
    }

    // Load partner payout history (last 5)
    database.ref('payouts/' + code).once('value')
      .then(paySnap => {
        const payouts = []
        paySnap.forEach(s => payouts.push({ id: s.key, ...s.val() }))
        payouts.sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0))
        
        const payEl = document.getElementById('drawer-payout-history')
        if (!payEl) return
        
        if (!payouts.length) {
          payEl.innerHTML = '<p class="drawer-empty">Koi payout request nahi.</p>'
          return
        }
        
        payEl.innerHTML = payouts.slice(0, 5).map(p => `
          <div class="drawer-payout-item">
            <div>
              <div class="drawer-pay-amount">
                ${formatCurrency(p.amount)}
              </div>
              <div class="drawer-pay-meta">
                ${escapeHTML(p.upi || '—')} · ${escapeHTML(p.date || '—')}
                ${p.utr ? '<br>UTR: ' + escapeHTML(p.utr) : ''}
              </div>
            </div>
            <span class="pstatus ps-${p.status}">
              ${p.status === 'paid' ? '✓ PAID' : 
                p.status === 'rejected' ? '✗ REJECTED' : '⏳ PENDING'}
            </span>
          </div>
        `).join('')
      })
      .catch(err => console.warn('Drawer payout load error:', err))

    overlay.classList.remove('hidden');
    drawer.classList.add('open');
  };

  function closeDrawer() {
    const drawer = document.getElementById('partnerDrawer')
    const overlay = document.getElementById('drawerOverlay')
    if (drawer) drawer.classList.remove('open')
    if (overlay) overlay.classList.add('hidden')
    currentDrawerCode = null
  }
  
  const drawerClose = document.getElementById('closeDrawerBtn')
  if (drawerClose) {
    drawerClose.addEventListener('click', closeDrawer)
  }
  if (overlay) {
    overlay.addEventListener('click', closeDrawer)
  }

  const saveNotesBtn = document.getElementById('saveNotesBtn');
  if (saveNotesBtn) saveNotesBtn.addEventListener('click', () => {
    if (!currentDrawerCode) return;
    const notes = document.getElementById('adminNotesArea').value;
    database.ref(`adminNotes/${currentDrawerCode}`).set(notes).then(() => {
      showToast('Notes saved successfully', 'success');
    }).catch(err => showToast(err.message, 'error'));
  });

  // 5. DEALS TAB
  function renderDealsTab() {
    const fPartner = document.getElementById('filterPartner').value;
    const fPackage = document.getElementById('filterPackage').value;
    const fStage = document.getElementById('filterStage').value;
    const _sortEl = document.getElementById('deals-sort') || document.getElementById('sortDeals');
    const fSort = _sortEl ? _sortEl.value : 'newest';
    
    let filtered = [...allDealsArray];
    
    if (fPartner && fPartner !== 'All' && fPartner !== '') filtered = filtered.filter(d => d.partnerCode === fPartner);
    if (fPackage && fPackage !== 'All' && fPackage !== '') filtered = filtered.filter(d => d.package === fPackage);
    if (fStage && fStage !== 'All' && fStage !== '') filtered = filtered.filter(d => d.stage === fStage);
    
    // Sort based on fSort
    if (fSort === 'newest') filtered.sort((a,b) => (b.addedAt||0) - (a.addedAt||0));
    else if (fSort === 'oldest') filtered.sort((a,b) => (a.addedAt||0) - (b.addedAt||0));
    else if (fSort === 'highest') filtered.sort((a,b) => (b.commission||0) - (a.commission||0));
    else if (fSort === 'lowest') filtered.sort((a,b) => (a.commission||0) - (b.commission||0));
    
    const tbody = document.getElementById('dealsTableBody');
    let totalComm = 0;
    
    tbody.innerHTML = filtered.map(d => {
      totalComm += (d.commission || 0);
      const p = allPartnersData[d.partnerCode];
      const pName = p ? p.name : d.partnerCode;
      
      let stageColor = 'muted-text';
      if (d.stage === 'Closed' || d.stage === 'Payment Received') stageColor = 'text-green';
      else if (d.stage === 'Negotiating') stageColor = 'text-gold';
      else if (d.stage === 'Pitched') stageColor = 'text-purple';

      return `
        <tr class="hover:bg-glass">
          <td>
            <div class="font-bold">${escapeHTML(pName)}</div>
            <div class="text-xs muted-text">${escapeHTML(d.partnerCode)}</div>
          </td>
          <td>
            <div class="font-bold">${escapeHTML(d.clientName || '-')}</div>
            ${d.industry ? `<div class="text-xs muted-text">${escapeHTML(d.industry)}</div>` : ''}
          </td>
          <td class="text-xs">
            ${d.clientPhone ? `<a href="tel:${escapeHTML(d.clientPhone)}" style="color:#3B82F6;text-decoration:none;">📞 ${escapeHTML(d.clientPhone)}</a>` : '<span class="muted-text">—</span>'}
          </td>
          <td><span class="badge-tier" style="background:rgba(168,85,247,0.1);color:#A855F7;border:1px solid rgba(168,85,247,0.2);">${escapeHTML(d.package||'—')}</span></td>
          <td class="font-bold text-xs ${stageColor}">${escapeHTML(d.stage||'—')}</td>
          <td class="text-xs muted-text">${escapeHTML(d.cityArea||'—')}</td>
          <td class="text-sm muted-text">${d.date||'—'}</td>
          <td class="text-green font-bold">${formatCurrency(d.commission)}</td>
        </tr>
      `;
    }).join('');
    
    const resultsCountEl = document.getElementById('deals-results-count')
    if (resultsCountEl) {
      resultsCountEl.textContent = 
        'Showing ' + filtered.length + 
        ' of ' + allDealsArray.length + ' deals'
    }

    const footerEl = document.getElementById('deals-total-footer')
    if (footerEl) {
      footerEl.textContent = 
        'Total Commission: ' + formatCurrency(totalComm)
    }
  }

  // Safe element listeners with null checks
  const _fp = document.getElementById('filterPartner');
  const _fpkg = document.getElementById('filterPackage');
  const _fs = document.getElementById('filterStage');
  const _sd = document.getElementById('sortDeals') || document.getElementById('deals-sort');
  if(_fp) _fp.addEventListener('change', renderDealsTab);
  if(_fpkg) _fpkg.addEventListener('change', renderDealsTab);
  if(_fs) _fs.addEventListener('change', renderDealsTab);
  if(_sd) _sd.addEventListener('change', renderDealsTab);

  const _csv = document.getElementById('exportCsvBtn'); if(_csv) _csv.addEventListener('click', () => {
    const fPartner = document.getElementById('filterPartner').value;
    const fPackage = document.getElementById('filterPackage').value;
    const fStage = document.getElementById('filterStage').value;
    let filtered = [...allDealsArray];
    if (fPartner && fPartner !== 'All' && fPartner !== '') filtered = filtered.filter(d => d.partnerCode === fPartner);
    if (fPackage && fPackage !== 'All' && fPackage !== '') filtered = filtered.filter(d => d.package === fPackage);
    if (fStage && fStage !== 'All' && fStage !== '') filtered = filtered.filter(d => d.stage === fStage);
    
    function escapeCSV(val) {
      if (!val) return ''
      const str = String(val)
      if (str.includes(',') || str.includes('"') || 
          str.includes('\n')) {
        return '"' + str.replaceAll('"', '""') + '"'
      }
      return str
    }

    let csvStr = 'Partner,Client,Industry,Package,Price,Commission%,Commission,Stage,Date\n';
    filtered.forEach(d => {
      const pName = allPartnersData[d.partnerCode] ? allPartnersData[d.partnerCode].name : d.partnerCode;
      csvStr += [
        escapeCSV(pName),
        escapeCSV(d.clientName),
        escapeCSV(d.industry),
        escapeCSV(d.package),
        d.price || 0,
        (d.pct || 0) + '%',
        d.commission || 0,
        escapeCSV(d.stage),
        escapeCSV(d.date)
      ].join(',') + '\n';
    });
    
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'digirise-deals-' + new Date().toISOString().split('T')[0] + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // 6. PAYOUTS TAB
  function renderPayoutsTab() {
    const pendingList = document.getElementById('pendingPayoutsList');
    const historyBody = document.getElementById('historyPayoutsTableBody');
    
    let pendingArr = [];
    let historyArr = [];
    
    Object.keys(allPayoutsData).forEach(code => {
      Object.keys(allPayoutsData[code]).forEach(pid => {
        const p = allPayoutsData[code][pid];
        p.id = pid;
        p.partnerCode = code;
        p.partnerName = allPartnersData[code] ? allPartnersData[code].name : code;
        if (p.status === 'pending') pendingArr.push(p);
        else historyArr.push(p);
      });
    });
    
    pendingArr.sort((a,b) => (a.requestedAt || 0) - (b.requestedAt || 0));
    historyArr.sort((a,b) => (b.paidAt || b.rejectedAt || 0) - (a.paidAt || a.rejectedAt || 0));
    
    if (pendingArr.length === 0) {
      pendingList.innerHTML = `<div class="empty-state"><div class="empty-icon text-4xl mb-2 opacity-50">✅</div><p class="muted-text">Queue is clear! All partners paid.</p></div>`;
    } else {
      pendingList.innerHTML = pendingArr.map(p => `
        <div class="payout-card pulseAmber">
          <div class="flex-between">
            <div class="font-bold">${escapeHTML(p.partnerName)}</div>
            <div class="text-xs muted-text">${p.date}</div>
          </div>
          <div class="text-xs muted-text mb-2">${escapeHTML(p.partnerCode)}</div>
          
          <div class="text-sm muted-text">UPI ID:</div>
          <div class="font-bold text-sm mb-2">${escapeHTML(p.upi)}</div>
          
          <div class="text-3xl font-bold text-gold mb-4">${formatCurrency(p.amount)}</div>
          
          <div class="flex-row gap-2">
            <button class="outline-red-btn flex-1 text-sm py-2" onclick="rejectPayout('${escapeHTML(p.partnerCode)}', '${p.id}', ${p.amount}, '${escapeHTML(p.partnerName)}')">Reject</button>
            <button class="purple-btn flex-1 text-sm py-2" onclick="openUTRModal('${escapeHTML(p.partnerCode)}', '${p.id}', ${p.amount}, '${escapeHTML(p.partnerName)}')">Mark Paid</button>
          </div>
        </div>
      `).join('');
    }
    
    if (historyArr.length === 0) {
      historyBody.innerHTML = '<tr><td colspan="6" class="text-center text-sm muted-text py-4">No history yet.</td></tr>';
    } else {
      historyBody.innerHTML = historyArr.map(p => {
        const isPaid = p.status === 'paid';
        return `
          <tr style="border-left: 3px solid ${isPaid ? '#22C55E' : '#EF4444'}; opacity: 0.85;">
            <td>
              <div class="font-bold">${escapeHTML(p.partnerName)}</div>
              <div class="text-xs muted-text">${escapeHTML(p.partnerCode)}</div>
            </td>
            <td class="font-bold ${isPaid ? 'text-green' : 'text-red'}">${formatCurrency(p.amount)}</td>
            <td class="text-xs">${escapeHTML(p.upi)}</td>
            <td class="font-bold text-xs ${isPaid ? 'text-green' : 'text-red'} uppercase">${p.status}</td>
            <td class="text-xs muted-text">${p.date}</td>
            <td class="text-xs font-bold">${isPaid && p.utr ? escapeHTML(p.utr) : '-'}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // UTR Modal Logic
  const utrModal = document.getElementById('utrModal');
  let currentPayout = null;

  globalThis.openUTRModal = function(code, id, amount, name) {
    currentPayout = { code, id, amount, name };
    document.getElementById('utrModalSubtitle').textContent = `${name} - ${formatCurrency(amount)}`;
    document.getElementById('utrInput').value = '';
    document.getElementById('methodInput').value = 'UPI';
    utrModal.classList.remove('hidden');
  };

  globalThis.rejectPayout = function(partnerCode, payoutId, amount, partnerName) {
    const confirmed = confirm(
      'Reject payout of ' + formatCurrency(amount) + 
      ' for ' + partnerName + '? This cannot be undone.'
    )
    if (!confirmed) return

    database.ref('payouts/' + partnerCode + '/' + payoutId)
      .update({
        status: 'rejected',
        rejectedAt: Date.now()
      })
      .then(() => {
        // Notify partner
        database.ref('notifications/' + partnerCode).push({
          icon: '❌',
          text: 'Payout of ' + formatCurrency(amount) + 
                ' was rejected. Contact Satyam for details.',
          time: Date.now(),
          read: false
        })
        // Log activity
        database.ref('activity').push({
          icon: '❌',
          text: 'Payout rejected for ' + 
                escapeHTML(partnerName) + ' — ' + 
                formatCurrency(amount),
          time: Date.now()
        })
        showToast('Payout rejected and partner notified.', 'error')
      })
      .catch(err => {
        console.error('Reject payout error:', err)
        showToast('Error rejecting payout. Try again.', 'error')
      })
  };

  function closeModal() {
    utrModal.classList.add('hidden');
    currentPayout = null;
  }

  const cancelUtrBtn = document.getElementById('cancelUtrBtn');
  if (cancelUtrBtn) cancelUtrBtn.addEventListener('click', closeModal);
  utrModal.addEventListener('click', (e) => {
    if (e.target === utrModal) closeModal();
  });

  const confirmUtrBtn = document.getElementById('confirmUtrBtn');
  if (confirmUtrBtn) confirmUtrBtn.addEventListener('click', () => {
    if (!currentPayout) return;
    const utr = document.getElementById('utrInput').value.trim();
    const method = document.getElementById('methodInput').value.trim() || 'UPI';
    if (!utr) {
      showToast('UTR Number is required!', 'error');
      return;
    }
    const { code, id, amount, name } = currentPayout;
    
    database.ref(`payouts/${code}/${id}`).update({ status: 'paid', utr, method, paidAt: Date.now() }).then(() => {
      database.ref(`notifications/${code}`).push({ icon: '✅', text: `Payout of ${formatCurrency(amount)} approved! UTR: ${utr}`, time: Date.now(), read: false });
      database.ref('activity').push({ icon: '✅', text: `Payout paid to ${name} — ${formatCurrency(amount)} UTR: ${utr}`, time: Date.now() });
      showToast('Payout marked as paid!', 'success');
      closeModal();
    }).catch(err => showToast(err.message, 'error'));
  });

  // 7. ANNOUNCEMENTS TAB
  const annBody = document.getElementById('annBody');
  const annCount = document.getElementById('annBodyCount');
  annBody.addEventListener('input', () => {
    const len = annBody.value.length;
    annCount.textContent = `${len} / 500`;
  });

  const annUrgent = document.getElementById('annUrgent');
  if (annUrgent) annUrgent.addEventListener('change', (e) => {
    const card = document.getElementById('annFormCard');
    if (e.target.checked) card.style.borderColor = 'var(--admin-red)';
    else card.style.borderColor = 'var(--admin-purple)';
  });

  const postAnnBtn = document.getElementById('postAnnBtn');
  if (postAnnBtn) postAnnBtn.addEventListener('click', () => {
    const title = document.getElementById('annTitle').value.trim();
    const body = document.getElementById('annBody').value.trim();
    const urgent = document.getElementById('annUrgent').checked;
    
    if (!title || !body) {
      showToast('Title and Message are required.', 'error');
      return;
    }
    
    const date = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
    
    database.ref('announcements').push({ title, body, urgent, date, postedAt: Date.now() }).then(() => {
      database.ref('activity').push({ icon: '📣', text: `Announcement posted: ${title}`, time: Date.now() });
      showToast('Announcement posted.', 'success');
      document.getElementById('annTitle').value = '';
      document.getElementById('annBody').value = '';
      document.getElementById('annUrgent').checked = false;
      document.getElementById('annFormCard').style.borderColor = 'var(--admin-purple)';
      annCount.textContent = '0 / 500';
    }).catch(err => showToast(err.message, 'error'));
  });

  registerListener(database.ref('announcements'), (snap) => {
    const items = [];
    snap.forEach(s => {
      items.push({ id: s.key, ...s.val() });
    });
    items.sort((a,b) => (b.postedAt || 0) - (a.postedAt || 0));
    
    // Add hardcoded announcements at the bottom
    items.push({ id: 'hc1', title: 'Welcome to DigiRise India Partner Program! 🎉', body: 'Aap officially DigiRise India Growth Partner ban gaye hain. Apna dashboard explore karo — deals log karo, commission track karo, aur payout kab bhi request karo. Koi bhi confusion ho toh Satyam ko WhatsApp karo.', date: '27 Jun 2025', urgent: false, isHardcoded: true });
    items.push({ id: 'hc2', title: 'Commission Structure — Yaad Rakhein', body: 'Starter & Growth packages pe 10%, Pro & Elite pe 15% flat commission milega. Deal confirm hone ke baad hi commission count hogi. Client ki full payment = aapka full commission.', date: '27 Jun 2025', urgent: false, isHardcoded: true });

    const list = document.getElementById('adminAnnouncementsList');
    list.innerHTML = items.map(a => {
      const dateStr = a.postedAt ? new Date(a.postedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : (a.date||'');
      return `<div class="ann-item ${a.urgent?'urgent':'normal'}" style="background:#141414;border:1px solid ${a.urgent?'rgba(239,68,68,0.25)':'#222'};border-radius:12px;padding:16px;margin-bottom:10px;position:relative;overflow:hidden;">
        <div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:${a.urgent?'#EF4444':'#C8890A'};border-radius:3px 0 0 3px;"></div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;background:${a.urgent?'rgba(239,68,68,0.12)':'rgba(200,137,10,0.12)'};color:${a.urgent?'#EF4444':'#C8890A'};border:1px solid ${a.urgent?'rgba(239,68,68,0.2)':'rgba(200,137,10,0.2)'};">${a.urgent?'🔴 URGENT':'📢 UPDATE'}</span>
          ${!a.isHardcoded ? `<button style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#EF4444;font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer;" onclick="deleteAnn('${a.id}')">Delete</button>` : '<span style="font-size:11px;color:#444;">Built-in</span>'}
        </div>
        <div style="font-weight:700;font-size:15px;margin-bottom:6px;">${escapeHTML(a.title||'')}</div>
        <div style="font-size:13px;color:#aaa;line-height:1.6;white-space:pre-wrap;">${escapeHTML(a.body||'')}</div>
        <div style="font-size:11px;color:#444;margin-top:8px;">${dateStr}</div>
      </div>`;
    }).join('');
  });

  globalThis.deleteAnn = function(id) {
    if (!confirm('Delete this announcement?')) return;
    database.ref(`announcements/${id}`).remove().then(() => showToast('Announcement deleted.', 'info'));
  };

  // 8. SETTINGS TAB — Load WA number immediately + on tab open
  function loadSettingsData() {
    database.ref('settings/whatsappNumber').once('value').then(snap => {
      const waInput = document.getElementById('waNumber');
      if (waInput && snap.val()) waInput.value = snap.val();
    }).catch(e => console.warn('WA load:', e));
  }
  loadSettingsData();

  const saveWaBtn = document.getElementById('saveWaBtn');
  if (saveWaBtn) saveWaBtn.addEventListener('click', () => {
    const num = document.getElementById('waNumber').value.trim();
    if (!num) return showToast('Please enter a number.', 'error');
    database.ref('settings/whatsappNumber').set(num).then(() => showToast('WhatsApp number updated.', 'success')).catch(err => showToast(err.message, 'error'));
  });

  const savePwdBtn = document.getElementById('savePwdBtn');
  if (savePwdBtn) savePwdBtn.addEventListener('click', () => {
    const newPwd = document.getElementById('newAdminPwd')?.value.trim()
    const confPwd = document.getElementById('confirmAdminPwd')?.value.trim()

    if (!newPwd) {
      showToast('New password cannot be empty.', 'error')
      return
    }
    if (newPwd !== confPwd) {
      showToast('Passwords do not match!', 'error')
      return
    }
    if (newPwd.length < 8) {
      showToast('Password must be at least 8 characters.', 'error')
      return
    }
    
    hashSHA256(newPwd).then(hash => {
      // NOTE: index.js doAdminLogin() must also check this path `settings/adminPasswordHash`
      database.ref('settings/adminPasswordHash').set(hash).then(() => {
        showToast('Admin password changed successfully!', 'success');
        document.getElementById('newAdminPwd').value = '';
        document.getElementById('confirmAdminPwd').value = '';
      });
    }).catch(err => showToast(err.message, 'error'));
  });

  const newAdminPwd = document.getElementById('newAdminPwd');
  if (newAdminPwd) newAdminPwd.addEventListener('input', (e) => {
    const val = e.target.value;
    const strengthEl = document.getElementById('pwdStrength');
    if (val.length === 0) { strengthEl.textContent = ''; return; }
    if (val.length < 6) { strengthEl.textContent = 'Weak'; strengthEl.className = 'text-xs mt-1 text-red'; }
    else if (val.length < 10) { strengthEl.textContent = 'Good'; strengthEl.className = 'text-xs mt-1 text-gold'; }
    else { strengthEl.textContent = 'Strong'; strengthEl.className = 'text-xs mt-1 text-green'; }
  });

  const clearActivityBtn = document.getElementById('clearActivityBtn');
  if (clearActivityBtn) clearActivityBtn.addEventListener('click', () => {
    if (!confirm('Clear all activity? Cannot undo.')) return;
    database.ref('activity').remove().then(() => showToast('Activity feed cleared.', 'success')).catch(err => showToast(err.message, 'error'));
  });

  const exportBackupBtn = document.getElementById('exportBackupBtn');
  if (exportBackupBtn) exportBackupBtn.addEventListener('click', () => {
    const paths = [
      'partners', 'deals', 'payouts', 
      'announcements', 'activity', 
      'notifications', 'adminNotes', 
      'settings'
    ]

    const backupData = {}
    const promises = paths.map(path => 
      database.ref(path).once('value')
        .then(snap => { backupData[path] = snap.val() })
    )

    Promise.all(promises).then(() => {
      const blob = new Blob(
        [JSON.stringify(backupData, null, 2)], 
        { type: 'application/json' }
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'digirise-backup-' + 
        new Date().toISOString().split('T')[0] + '.json'
      a.click()
      URL.revokeObjectURL(url)
      showToast('Backup downloaded!', 'success')
    }).catch(err => showToast('Backup failed: ' + err.message, 'error'))
  });

  // Simple number formatter for animation loop
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

});
