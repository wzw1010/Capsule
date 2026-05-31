// ========== 注册 Service Worker ==========
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}

(() => {
    // ========== 常量与 DOM 引用 ==========
    const STORAGE_WATCHLIST = 'fund_watchlist_v2';
    const STORAGE_HOLDINGS  = 'fund_holdings';
    const CACHE_KEY         = 'fund_data_cache';
    const OFFICIAL_CACHE_KEY = 'official_data_cache';
    const MANUAL_ORDER_KEY  = 'manual_order';
    const INDUSTRY_TAGS_KEY = 'industry_tags';
    const REFRESH_TRADING   = 30000;
    const REFRESH_IDLE      = 300000;
    const FUND_API          = 'https://fundgz.1234567.com.cn/js/';
    const MAX_CON           = 3;

    const $ = (id) => document.getElementById(id);
    const watchlistPage     = $('watchlistPage');
    const holdingsPage      = $('holdingsPage');
    const fundList          = $('fundList');
    const emptyState        = $('emptyState');
    const btnRefresh        = $('btnRefresh');
    const btnAddWatchlist   = $('btnAddWatchlist');
    const btnSort           = $('btnSort');
    const btnSyncHoldings   = $('btnSyncHoldings');
    const btnEditWatchlist  = $('btnEditWatchlist');
    const overlay           = $('overlay');
    const bottomSheet       = $('bottomSheet');
    const inputCode         = $('inputCode');
    const btnConfirmAdd     = $('btnConfirmAdd');
    const toast             = $('toast');
    const headerTime        = $('headerTime');
    const holdingsUpdateTime = $('holdingsUpdateTime');
    const holdingsList      = $('holdingsList');
    const btnBulkEdit       = $('btnBulkEdit');
    const btnAddHolding     = $('btnAddHolding');
    const btnRefreshHoldings = $('btnRefreshHoldings');
    const holdingSheet      = $('holdingSheet');
    const holdingCode       = $('holdingCode');
    const holdingCost       = $('holdingCost');
    const holdingShares     = $('holdingShares');
    const confirmAddHoldingSheet = $('confirmAddHoldingSheet');
    const btnBackup         = $('btnBackup');
    const backupSheet       = $('backupSheet');
    const btnExportSheet    = $('btnExportSheet');
    const btnCopyConfig     = $('btnCopyConfig');
    const btnImportSheet    = $('btnImportSheet');
    const importFile        = $('importFile');
    const indexToggle       = $('indexToggle');
    const indexGridContainer = $('indexGridContainer');
    const indexGrid         = $('indexGrid');
    const holdingsHeaderTitle = $('holdingsHeaderTitle');
    const themeMeta         = $('themeColorMeta');

    // ========== 全局状态 ==========
    let watchlist = [], holdings = {}, fundDataCache = {}, officialDataCache = {};
    let refreshTimer = null, toastTimer = null;
    let sortMode = 'manual', isBulkEditing = false, indexExpanded = false, isEditMode = false;
    let manualOrder = [];
    let openedSwipe = null, swipeStartX = 0, swipeStartY = 0, swipeCurrentX = 0, isSwiping = false;
    let industryTags = {}; // 用户自定义标签

    // ========== 工具函数 ==========
    const escapeHTML = (str) => { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; };
    function showToast(msg, type = '') {
        clearTimeout(toastTimer);
        toast.textContent = msg;
        toast.className = 'toast ' + type + ' show';
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
    }
    function isTradingTime() {
        const now = new Date();
        if (now.getDay() === 0 || now.getDay() === 6) return false;
        const m = now.getHours() * 60 + now.getMinutes();
        return (m >= 570 && m <= 690) || (m >= 780 && m <= 900);
    }
    function isTradingDay() { return new Date().getDay() !== 0 && new Date().getDay() !== 6; }
    function formatMoney(val) { return (val >= 0 ? '+' : '') + val.toFixed(2); }
    function getTodayStr() {
        const now = new Date();
        return now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    }
    function updateThemeColor() {
        const isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        themeMeta.setAttribute('content', isLight ? '#FF9500' : '#000000');
    }
    updateThemeColor();
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', updateThemeColor);

    // ========== 行业标签配置 (可自定义) ==========
    function loadIndustryTags() {
        try { industryTags = JSON.parse(localStorage.getItem(INDUSTRY_TAGS_KEY)) || {}; } catch { industryTags = {}; }
    }
    function saveIndustryTags() { localStorage.setItem(INDUSTRY_TAGS_KEY, JSON.stringify(industryTags)); }
    function setIndustryTag(code, tag) { industryTags[code] = tag; saveIndustryTags(); }
    function getIndustryForCode(code, name) {
        if (industryTags[code]) return industryTags[code];
        // 自动匹配关键词（优先长关键词）
        const sorted = [...INDUSTRY_KEYWORDS].sort((a,b) => b.keys.join().length - a.keys.join().length);
        for (const item of sorted) {
            for (const key of item.keys) {
                if (name.includes(key)) return item.tag;
            }
        }
        return '';
    }

    const INDUSTRY_COLORS = {
        '白酒': { bg: 'rgba(255,180,100,0.2)', color: '#ffb464', border: 'rgba(255,180,100,0.4)' },
        '医药': { bg: 'rgba(100,200,255,0.2)', color: '#64c8ff', border: 'rgba(100,200,255,0.4)' },
        '新能源': { bg: 'rgba(100,255,150,0.2)', color: '#64ff96', border: 'rgba(100,255,150,0.4)' },
        '科技': { bg: 'rgba(180,130,255,0.2)', color: '#b482ff', border: 'rgba(180,130,255,0.4)' },
        '消费': { bg: 'rgba(255,150,150,0.2)', color: '#ff9696', border: 'rgba(255,150,150,0.4)' },
        '军工': { bg: 'rgba(150,180,220,0.2)', color: '#96b4dc', border: 'rgba(150,180,220,0.4)' },
        '金融': { bg: 'rgba(220,200,100,0.2)', color: '#dcc864', border: 'rgba(220,200,100,0.4)' },
        '地产': { bg: 'rgba(200,160,120,0.2)', color: '#c8a078', border: 'rgba(200,160,120,0.4)' },
        '传媒': { bg: 'rgba(255,180,200,0.2)', color: '#ffb4c8', border: 'rgba(255,180,200,0.4)' },
        '汽车': { bg: 'rgba(120,200,220,0.2)', color: '#78c8dc', border: 'rgba(120,200,220,0.4)' },
        '周期': { bg: 'rgba(200,180,140,0.2)', color: '#c8b48c', border: 'rgba(200,180,140,0.4)' },
        '计算机': { bg: 'rgba(140,160,255,0.2)', color: '#8ca0ff', border: 'rgba(140,160,255,0.4)' },
        '环保': { bg: 'rgba(100,220,150,0.2)', color: '#64dc96', border: 'rgba(100,220,150,0.4)' },
        '教育': { bg: 'rgba(255,200,120,0.2)', color: '#ffc878', border: 'rgba(255,200,120,0.4)' },
        '交通': { bg: 'rgba(150,200,200,0.2)', color: '#96c8c8', border: 'rgba(150,200,200,0.4)' },
        '能源': { bg: 'rgba(255,150,100,0.2)', color: '#ff9664', border: 'rgba(255,150,100,0.4)' },
        '指数': { bg: 'rgba(180,180,200,0.2)', color: '#b4b4c8', border: 'rgba(180,180,200,0.4)' },
        '债券': { bg: 'rgba(200,200,160,0.2)', color: '#c8c8a0', border: 'rgba(200,200,160,0.4)' },
        '混合': { bg: 'rgba(220,180,200,0.2)', color: '#dcb4c8', border: 'rgba(220,180,200,0.4)' },
        '量化': { bg: 'rgba(160,200,180,0.2)', color: '#a0c8b4', border: 'rgba(160,200,180,0.4)' },
        '红利': { bg: 'rgba(255,200,150,0.2)', color: '#ffc896', border: 'rgba(255,200,150,0.4)' },
        'QDII': { bg: 'rgba(150,180,255,0.2)', color: '#96b4ff', border: 'rgba(150,180,255,0.4)' }
    };
    const INDUSTRY_KEYWORDS = [
        { keys:['白酒','酒'], tag:'白酒' },{ keys:['医疗','医药','健康','生物'], tag:'医药' },
        { keys:['新能源','光伏','锂电','电池','碳中和'], tag:'新能源' },{ keys:['科技','芯片','半导体','电子','5G','通信','物联网'], tag:'科技' },
        { keys:['消费','食品','饮料','农业','粮食'], tag:'消费' },{ keys:['军工','国防','航天','军事'], tag:'军工' },
        { keys:['证券','券商','银行','金融','保险'], tag:'金融' },{ keys:['地产','房地产','基建','建材'], tag:'地产' },
        { keys:['传媒','影视','娱乐','文化'], tag:'传媒' },{ keys:['汽车','整车','新能源车','智能汽车'], tag:'汽车' },
        { keys:['有色','钢铁','煤炭','化工','材料','稀土','石油'], tag:'周期' },{ keys:['计算机','软件','人工智能','大数据','云'], tag:'计算机' },
        { keys:['环保','环境','低碳'], tag:'环保' },{ keys:['教育','培训'], tag:'教育' },{ keys:['旅游','酒店','航空','运输','物流'], tag:'交通' },
        { keys:['电力','公用事业','能源'], tag:'能源' },{ keys:['指数','300','500','创业板','科创','深证','上证','中证','沪深'], tag:'指数' },
        { keys:['债','债券','纯债','中短债'], tag:'债券' },{ keys:['混合','灵活'], tag:'混合' },{ keys:['量化','对冲'], tag:'量化' },{ keys:['红利','高股息'], tag:'红利' },
        { keys:['QDII','海外','纳斯达克','标普','道琼斯','全球','德国','日本','亚太','恒生'], tag:'QDII' }
    ];

    // ========== 数据持久化 ==========
    function loadOfficialCache() {
        try {
            const stored = localStorage.getItem(OFFICIAL_CACHE_KEY);
            if (stored) officialDataCache = JSON.parse(stored);
        } catch (e) { officialDataCache = {}; }
    }
    function saveOfficialCache() { localStorage.setItem(OFFICIAL_CACHE_KEY, JSON.stringify(officialDataCache)); }
    function loadManualOrder() { try { manualOrder = JSON.parse(localStorage.getItem(MANUAL_ORDER_KEY)) || []; } catch { manualOrder = []; } }
    function saveManualOrder() { localStorage.setItem(MANUAL_ORDER_KEY, JSON.stringify(manualOrder)); }
    function loadWatchlist() { try { watchlist = JSON.parse(localStorage.getItem(STORAGE_WATCHLIST)) || []; } catch { watchlist = []; } watchlist = [...new Set(watchlist.filter(c => /^\d{6}$/.test(c)))]; }
    function saveWatchlist() { localStorage.setItem(STORAGE_WATCHLIST, JSON.stringify(watchlist)); }
    function loadHoldings() { try { holdings = JSON.parse(localStorage.getItem(STORAGE_HOLDINGS)) || {}; } catch { holdings = {}; } }
    function saveHoldings() { localStorage.setItem(STORAGE_HOLDINGS, JSON.stringify(holdings)); }
    function loadCache() { try { const c = JSON.parse(localStorage.getItem(CACHE_KEY)); if (c) fundDataCache = c; } catch {} }
    function saveCache() { localStorage.setItem(CACHE_KEY, JSON.stringify(fundDataCache)); }

    // ========== API 请求 ==========
    function fetchSingle(code) {
        return new Promise((resolve, reject) => {
            const sid = 'jsonp-' + code;
            document.getElementById(sid)?.remove();
            const s = document.createElement('script');
            s.id = sid; s.src = FUND_API + code + '.js?rt=' + Date.now();
            let tid = setTimeout(() => { cleanup(); reject(new Error('超时')); }, 8000);
            if (!window._jsonpCB) window._jsonpCB = {};
            window._jsonpCB[code] = (data) => { cleanup(); resolve(data); };
            function cleanup() { clearTimeout(tid); if (s.parentNode) s.remove(); delete window._jsonpCB[code]; }
            s.onerror = () => { cleanup(); reject(new Error('网络错误')); };
            document.head.appendChild(s);
        });
    }
    window.jsonpgz = (d) => { if (d?.fundcode && window._jsonpCB?.[d.fundcode]) window._jsonpCB[d.fundcode](d); };

    async function fetchOfficialData(code) {
        const today = getTodayStr();
        if (officialDataCache[code] && officialDataCache[code].date === today && officialDataCache[code].officialNetValue != null) {
            return officialDataCache[code];
        }
        try {
            const targetUrl = `https://fund.eastmoney.com/f10/F10DataApi.aspx?type=lsjz&code=${code}&page=1&per=2`;
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
            const resp = await fetch(proxyUrl);
            if (!resp.ok) return null;
            const html = await resp.text();
            const matches = html.matchAll(/<td[^>]*>(\d{4}-\d{2}-\d{2})<\/td>\s*<td[^>]*>([0-9.]+)<\/td>\s*<td[^>]*>([0-9.]+)<\/td>/g);
            const records = [];
            for (const m of matches) records.push({ date: m[1], nav: parseFloat(m[2]) });
            if (records.length < 2) {
                if (records.length === 1) {
                    const data = { officialNetValue: records[0].nav, officialChange: null, date: today, updated: true };
                    officialDataCache[code] = data; saveOfficialCache(); return data;
                }
                return null;
            }
            const latest = records[0].nav;
            const prev = records[1].nav;
            const changePercent = prev > 0 ? ((latest - prev) / prev) * 100 : null;
            const data = { officialNetValue: latest, officialChange: changePercent != null ? changePercent : 0, date: today, updated: true };
            officialDataCache[code] = data; saveOfficialCache(); return data;
        } catch (e) { return null; }
    }

    async function fetchIndexData() {
        try {
            const INDEX_CODES = [
                { code: 'sh000001', name: '上证指数' },{ code: 'sz399001', name: '深证成指' },
                { code: 'sz399006', name: '创业板指' },{ code: 'sh000688', name: '科创50' },
                { code: 'sh000300', name: '沪深300' },{ code: 'sh000905', name: '中证500' },
                { code: 'sh000852', name: '中证1000' },{ code: 'sh000016', name: '上证50' }
            ];
            const codes = INDEX_CODES.map(i => `s_${i.code}`).join(',');
            const resp = await fetch(`https://qt.gtimg.cn/q=${codes}`);
            const text = await resp.text();
            const lines = text.split('\n').filter(line => line.includes('='));
            const map = {};
            lines.forEach(line => {
                const m = line.match(/v_s_(\w+)="(.+)"/);
                if (!m) return;
                const raw = m[2].split('~');
                if (raw.length < 5) return;
                map[m[1]] = { price: parseFloat(raw[3]), change: parseFloat(raw[4]), changePercent: parseFloat(raw[5]) };
            });
            let html = '';
            INDEX_CODES.forEach(item => {
                const d = map[item.code];
                if (!d || isNaN(d.price)) {
                    html += `<div class="index-metric-card"><div class="index-metric-name">${item.name}</div><div class="index-metric-price neutral">--</div><div class="index-metric-change neutral">--</div></div>`;
                    return;
                }
                const arrow = d.change > 0 ? '▲' : d.change < 0 ? '▼' : '';
                const changeClass = d.change > 0 ? 'profit-positive' : d.change < 0 ? 'profit-negative' : 'neutral';
                html += `<div class="index-metric-card"><div class="index-metric-name">${item.name}</div><div class="index-metric-price ${changeClass}">${d.price.toFixed(2)}</div><div class="index-metric-change ${changeClass}">${arrow} ${Math.abs(d.changePercent).toFixed(2)}%</div></div>`;
            });
            indexGrid.innerHTML = html;
        } catch (e) {
            indexGrid.innerHTML = '<div class="index-metric-card"><div class="index-metric-name">加载失败</div></div>';
        }
    }

    // ========== 净值判断 (修复版) ==========
    function shouldUseOfficialValue(code) {
        const co = officialDataCache[code];
        if (!co || co.officialNetValue == null || isNaN(co.officialNetValue)) return false;
        const today = getTodayStr();
        return co.date === today;
    }

    // ========== 自选渲染 ==========
    function renderWatchlist() {
        if (!watchlist.length) { fundList.innerHTML = ''; emptyState.style.display = 'block'; return; }
        emptyState.style.display = 'none';
        let displayOrder;
        if (isEditMode) displayOrder = getManualOrderArray();
        else {
            const manual = getManualOrderArray();
            if (sortMode === 'change-desc' || sortMode === 'change-asc') {
                displayOrder = [...manual].sort((a, b) => {
                    const za = parseFloat(fundDataCache[a]?.gszzl) || 0;
                    const zb = parseFloat(fundDataCache[b]?.gszzl) || 0;
                    return sortMode === 'change-desc' ? zb - za : za - zb;
                });
            } else displayOrder = manual;
        }

        fundList.innerHTML = displayOrder.map((code) => {
            const d = fundDataCache[code];
            const name = d?.name || '加载中...';
            const gszzl = d?.gszzl != null ? parseFloat(d.gszzl) : null;
            const cls = gszzl === null ? 'zero' : (gszzl > 0 ? 'up' : 'down');
            const tag = getIndustryForCode(code, name);
            let tagHtml = '';
            if (tag && INDUSTRY_COLORS[tag]) {
                const c = INDUSTRY_COLORS[tag];
                tagHtml = `<span class="industry-tag" style="background:${c.bg}; color:${c.color}; border-color:${c.border};" data-code="${code}">${tag}</span>`;
            }
            const editActionsHtml = isEditMode ? `
                <div class="edit-actions show">
                    <button class="edit-btn move-up-btn" data-code="${code}">▲</button>
                    <button class="edit-btn move-down-btn" data-code="${code}">▼</button>
                </div>` : '';
            return `<div class="swipe-wrapper" data-code="${code}">
                <div class="swipe-content ${cls}">
                    <div class="fund-card-left">${tagHtml}<span class="fund-name">${escapeHTML(name)}</span><span class="fund-code">${code}</span></div>
                    <span class="change-percent ${cls}">${gszzl !== null ? (gszzl>=0?'+':'')+gszzl.toFixed(2)+'%' : '--'}</span>
                    ${editActionsHtml}
                </div>
                <div class="swipe-delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg><span>删除</span></div>
            </div>`;
        }).join('');

        // 行业标签点击事件（自定义标签）
        fundList.querySelectorAll('.industry-tag').forEach(tag => {
            tag.addEventListener('click', (e) => {
                e.stopPropagation();
                const code = tag.dataset.code;
                const current = industryTags[code] || getIndustryForCode(code, fundDataCache[code]?.name || '');
                const newTag = prompt('修改行业标签（留空则自动识别）', current || '');
                if (newTag !== null) {
                    if (newTag.trim()) setIndustryTag(code, newTag.trim());
                    else { delete industryTags[code]; saveIndustryTags(); }
                    renderWatchlist();
                }
            });
        });

        if (isEditMode) {
            fundList.querySelectorAll('.move-up-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); moveItemUp(btn.dataset.code); }));
            fundList.querySelectorAll('.move-down-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); moveItemDown(btn.dataset.code); }));
        }
    }

    function getManualOrderArray() {
        if (manualOrder.length === watchlist.length && manualOrder.every(c => watchlist.includes(c))) return [...manualOrder];
        return [...watchlist];
    }
    function moveItemUp(code) {
        const arr = getManualOrderArray(); const idx = arr.indexOf(code);
        if (idx <= 0) return;
        [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]];
        manualOrder = arr; saveManualOrder(); renderWatchlist();
    }
    function moveItemDown(code) {
        const arr = getManualOrderArray(); const idx = arr.indexOf(code);
        if (idx < 0 || idx >= arr.length-1) return;
        [arr[idx], arr[idx+1]] = [arr[idx+1], arr[idx]];
        manualOrder = arr; saveManualOrder(); renderWatchlist();
    }

    function updateWatchlistCard(code) {
        const wrapper = document.querySelector(`.swipe-wrapper[data-code="${code}"]`);
        if (!wrapper) return;
        const d = fundDataCache[code]; if (!d) return;
        const gszzl = d.gszzl != null ? parseFloat(d.gszzl) : null;
        const cls = gszzl === null ? 'zero' : (gszzl > 0 ? 'up' : 'down');
        const content = wrapper.querySelector('.swipe-content');
        if (content) {
            content.className = 'swipe-content ' + cls;
            const chEl = content.querySelector('.change-percent');
            if (chEl) {
                chEl.textContent = gszzl !== null ? (gszzl>=0?'+':'')+gszzl.toFixed(2)+'%' : '--';
                chEl.className = 'change-percent ' + cls;
            }
        }
    }

    // ========== 持仓渲染 ==========
    function renderHoldingsSkeleton() {
        holdingsList.innerHTML = '<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>';
    }

    function renderHoldings() {
        const codes = Object.keys(holdings);
        if (codes.length === 0) {
            holdingsList.innerHTML = '<div class="empty-state">暂无持仓，点击 + 添加</div>';
            updateSummary({});
            return;
        }
        renderHoldingsSkeleton();
        setTimeout(() => refreshHoldingsData(codes), 50);
    }

    async function refreshHoldingsData(codes) {
        for (const code of codes) {
            try {
                const d = await fetchSingle(code);
                fundDataCache[code] = { ...fundDataCache[code], fundcode: code, name: d.name, gsz: d.gsz, gszzl: d.gszzl, dwjz: d.dwjz, gztime: d.gztime };
            } catch (e) {}
            fetchOfficialData(code).then(od => {
                if (od) { officialDataCache[code] = od; saveOfficialCache(); }
                updateHoldingCard(code);
                updateSummaryFromCurrentCards();
            }).catch(() => {});
        }
        const html = buildHoldingsHtml(codes);
        holdingsList.innerHTML = html;
        updateSummaryFromCurrentCards();
        for (const code of codes) {
            const od = await fetchOfficialData(code).catch(() => null);
            if (od) { officialDataCache[code] = od; saveOfficialCache(); }
            updateHoldingCard(code);
            updateSummaryFromCurrentCards();
        }
    }

    function buildHoldingsHtml(codes) {
        let totalAsset = 0, todayProfitSum = 0, totalProfitSum = 0;
        const htmlParts = codes.map(code => {
            const h = holdings[code];
            const d = fundDataCache[code] || {};
            const useOfficial = shouldUseOfficialValue(code);
            const co = officialDataCache[code] || {};
            const gsz = useOfficial ? co.officialNetValue : (parseFloat(d.gsz) || 0);
            const dwjz = parseFloat(d.dwjz) || 0;
            const gszzl = useOfficial ? co.officialChange : (parseFloat(d.gszzl) || 0);
            const cost = parseFloat(h.cost) || 0;
            const shares = parseFloat(h.shares) || 0;

            const currentVal = gsz * shares;
            const dayProfit = shares * dwjz * (gszzl / 100);
            const totalP = (gsz - cost) * shares;
            const dayYieldRate = gszzl;
            const totalYieldRate = cost ? ((gsz - cost) / cost * 100) : 0;

            totalAsset += currentVal;
            todayProfitSum += dayProfit;
            totalProfitSum += totalP;

            const cls = gszzl > 0 ? 'up' : gszzl < 0 ? 'down' : 'zero';
            const profitClass = (v) => v >= 0 ? 'profit-positive' : 'profit-negative';
            const dotClass = useOfficial ? 'updated' : 'pending';

            return `<div class="holding-card ${cls}" data-code="${code}">
                <div class="holding-header">
                    <div class="holding-header-left">
                        <span class="update-dot ${dotClass}"></span>
                        <span class="holding-name">${escapeHTML(h.name || d.name || code)}</span>
                        <span class="holding-code">${code}</span>
                    </div>
                    <span class="holding-amount">${currentVal.toFixed(2)}</span>
                </div>
                <div class="metrics-row">
                    <div class="metric-card"><span class="metric-label">今日涨幅</span><span class="metric-value ${profitClass(dayYieldRate)}">${dayYieldRate>=0?'+':''}${dayYieldRate.toFixed(2)}%</span></div>
                    <div class="metric-card"><span class="metric-label">日收益</span><span class="metric-value ${profitClass(dayProfit)}">${formatMoney(dayProfit)}</span></div>
                    <div class="metric-card"><span class="metric-label">持有收益</span><span class="metric-value ${profitClass(totalP)}">${formatMoney(totalP)}</span></div>
                    <div class="metric-card"><span class="metric-label">持有收益率</span><span class="metric-value ${profitClass(totalYieldRate)}">${totalYieldRate>=0?'+':''}${totalYieldRate.toFixed(2)}%</span></div>
                </div>
            </div>`;
        });
        window.__holdingsCache = { totalAsset, todayProfitSum, totalProfitSum };
        return htmlParts.join('');
    }

    function updateHoldingCard(code) {
        if (isBulkEditing) return;
        const card = document.querySelector(`#holdingsList .holding-card[data-code="${code}"]`);
        if (!card) return;
        const h = holdings[code];
        const d = fundDataCache[code] || {};
        const useOfficial = shouldUseOfficialValue(code);
        const co = officialDataCache[code] || {};
        const gsz = useOfficial ? co.officialNetValue : (parseFloat(d.gsz) || 0);
        const dwjz = parseFloat(d.dwjz) || 0;
        const gszzl = useOfficial ? co.officialChange : (parseFloat(d.gszzl) || 0);
        const cost = parseFloat(h.cost) || 0;
        const shares = parseFloat(h.shares) || 0;

        const currentVal = gsz * shares;
        const dayProfit = shares * dwjz * (gszzl / 100);
        const totalP = (gsz - cost) * shares;
        const dayYieldRate = gszzl;
        const totalYieldRate = cost ? ((gsz - cost) / cost * 100) : 0;
        const cls = gszzl > 0 ? 'up' : gszzl < 0 ? 'down' : 'zero';
        const profitClass = (v) => v >= 0 ? 'profit-positive' : 'profit-negative';
        const dotClass = useOfficial ? 'updated' : 'pending';

        card.className = 'holding-card ' + cls;
        const dot = card.querySelector('.update-dot');
        if (dot) dot.className = 'update-dot ' + dotClass;
        const amountEl = card.querySelector('.holding-amount');
        if (amountEl) amountEl.textContent = currentVal.toFixed(2);
        const metrics = card.querySelectorAll('.metric-value');
        if (metrics.length >= 4) {
            metrics[0].textContent = (dayYieldRate>=0?'+':'') + dayYieldRate.toFixed(2) + '%';
            metrics[0].className = 'metric-value ' + profitClass(dayYieldRate);
            metrics[1].textContent = formatMoney(dayProfit);
            metrics[1].className = 'metric-value ' + profitClass(dayProfit);
            metrics[2].textContent = formatMoney(totalP);
            metrics[2].className = 'metric-value ' + profitClass(totalP);
            metrics[3].textContent = (totalYieldRate>=0?'+':'') + totalYieldRate.toFixed(2) + '%';
            metrics[3].className = 'metric-value ' + profitClass(totalYieldRate);
        }
    }

    function updateSummaryFromCurrentCards() {
        const cards = document.querySelectorAll('#holdingsList .holding-card');
        let totalAsset = 0, todayProfitSum = 0, totalProfitSum = 0;
        cards.forEach(card => {
            const amount = parseFloat(card.querySelector('.holding-amount')?.textContent) || 0;
            totalAsset += amount;
            const dayProfitText = card.querySelectorAll('.metric-value')[1]?.textContent || '0';
            todayProfitSum += parseFloat(dayProfitText.replace(/[^0-9.-]/g, '')) || 0;
            const totalProfitText = card.querySelectorAll('.metric-value')[2]?.textContent || '0';
            totalProfitSum += parseFloat(totalProfitText.replace(/[^0-9.-]/g, '')) || 0;
        });
        updateSummary({ totalAsset, todayProfit: todayProfitSum, totalProfit: totalProfitSum });
    }

    function updateSummary({ totalAsset = 0, todayProfit = 0, totalProfit = 0 }) {
        document.getElementById('totalAsset').textContent = totalAsset.toFixed(2);
        document.getElementById('todayProfit').textContent = formatMoney(todayProfit);
        document.getElementById('totalProfit').textContent = formatMoney(totalProfit);
        const todayCls = todayProfit >= 0 ? 'profit-positive' : 'profit-negative';
        const totalCls = totalProfit >= 0 ? 'profit-positive' : 'profit-negative';
        document.getElementById('todayProfit').className = 'summary-value ' + todayCls;
        document.getElementById('totalProfit').className = 'summary-value ' + totalCls;
    }

    // ========== 批量编辑 ==========
    function enterBulkEditMode() {
        document.querySelectorAll('#holdingsList .holding-card').forEach(card => {
            const code = card.dataset.code;
            const h = holdings[code];
            const metrics = card.querySelector('.metrics-row');
            if (metrics) metrics.style.display = 'none';
            let editDiv = card.querySelector('.edit-controls');
            if (!editDiv) { editDiv = document.createElement('div'); editDiv.className = 'edit-controls'; card.appendChild(editDiv); }
            editDiv.innerHTML = `<input type="number" class="edit-cost" value="${h.cost}" step="any" inputmode="decimal" placeholder="成本"><input type="number" class="edit-shares" value="${h.shares}" step="any" inputmode="decimal" placeholder="份额"><button class="btn danger edit-delete-btn">删除</button>`;
            editDiv.querySelector('.edit-delete-btn').onclick = (e) => { e.stopPropagation(); if (confirm('确认删除该持仓？')) { delete holdings[code]; saveHoldings(); isBulkEditing = false; btnBulkEdit.classList.remove('edit-active'); renderHoldings(); showToast('已删除'); } };
        });
    }

    btnBulkEdit.addEventListener('click', () => {
        if (isBulkEditing) {
            document.querySelectorAll('#holdingsList .holding-card').forEach(card => {
                const code = card.dataset.code;
                const costInput = card.querySelector('.edit-cost'), shareInput = card.querySelector('.edit-shares');
                if (costInput && shareInput) {
                    const cost = parseFloat(costInput.value), shares = parseFloat(shareInput.value);
                    if (!isNaN(cost) && cost > 0 && !isNaN(shares) && shares > 0) holdings[code] = { cost, shares, name: holdings[code]?.name || '' };
                }
                card.querySelector('.edit-controls')?.remove();
                const metrics = card.querySelector('.metrics-row'); if (metrics) metrics.style.display = '';
            });
            saveHoldings(); isBulkEditing = false; btnBulkEdit.classList.remove('edit-active');
            renderHoldings(); showToast('批量保存成功');
        } else { isBulkEditing = true; btnBulkEdit.classList.add('edit-active'); enterBulkEditMode(); }
    });

    // ========== 备份导出 ==========
    function getConfigJSON() { return JSON.stringify({ watchlist, holdings, manualOrder, industryTags }, null, 2); }
    btnBackup.addEventListener('click', () => { overlay.classList.add('active'); backupSheet.classList.add('active'); });
    function closeBackupSheet() { overlay.classList.remove('active'); backupSheet.classList.remove('active'); }
    btnExportSheet.addEventListener('click', () => {
        const data = getConfigJSON(); const blob = new Blob([data], {type:'application/json'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fund_config.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); closeBackupSheet(); showToast('已导出');
    });
    btnCopyConfig.addEventListener('click', () => {
        const data = getConfigJSON();
        if (navigator.clipboard) navigator.clipboard.writeText(data).then(() => showToast('已复制'));
        else { const ta = document.createElement('textarea'); ta.value = data; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast('已复制'); }
        closeBackupSheet();
    });
    btnImportSheet.addEventListener('click', () => { importFile.click(); closeBackupSheet(); });
    importFile.addEventListener('change', e => {
        const file = e.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                if (data.watchlist) { watchlist = data.watchlist; saveWatchlist(); }
                if (data.holdings) { holdings = data.holdings; saveHoldings(); }
                if (data.manualOrder) { manualOrder = data.manualOrder; saveManualOrder(); }
                if (data.industryTags) { industryTags = data.industryTags; saveIndustryTags(); }
                renderWatchlist(); renderHoldings(); refreshAllData(); showToast('导入成功');
            } catch { showToast('文件格式错误','error'); }
        };
        reader.readAsText(file); importFile.value = '';
    });

    // ========== 添加/刷新 ==========
    function addWatchlist(code) {
        code = String(code).trim();
        if (!/^\d{6}$/.test(code)) return showToast('请输入6位数字代码','error'), false;
        if (watchlist.includes(code)) return showToast('已存在','error'), false;
        watchlist.push(code); saveWatchlist(); fundDataCache[code] = null;
        if (!manualOrder.includes(code)) { manualOrder.push(code); saveManualOrder(); }
        renderWatchlist();
        fetchAndUpdate(code).then(() => { renderWatchlist(); saveCache(); scheduleRefresh(); });
        showToast('已添加','success'); return true;
    }
    function removeWatchlist(code) {
        const idx = watchlist.indexOf(code); if (idx < 0) return;
        watchlist.splice(idx, 1); saveWatchlist(); delete fundDataCache[code]; saveCache();
        manualOrder = manualOrder.filter(c => c !== code); saveManualOrder();
        renderWatchlist(); scheduleRefresh(); showToast('已移除');
    }
    function syncHoldingsToWatchlist() {
        const codes = Object.keys(holdings);
        if (codes.length === 0) return showToast('没有持仓可同步','error');
        let added = 0;
        codes.forEach(code => { if (!watchlist.includes(code)) { watchlist.push(code); fundDataCache[code] = null; added++; } });
        if (added === 0) return showToast('持仓已在自选中');
        saveWatchlist(); renderWatchlist();
        codes.forEach(code => { if (!fundDataCache[code] || fundDataCache[code] === null) fetchAndUpdate(code); });
        scheduleRefresh(); showToast(`已同步 ${added} 只基金`);
    }
    async function fetchAndUpdate(code) {
        try {
            const d = await fetchSingle(code);
            fundDataCache[code] = { fundcode: d.fundcode, name: d.name || '未知', dwjz: d.dwjz, gsz: d.gsz, gszzl: d.gszzl, gztime: d.gztime || '' };
        } catch { fundDataCache[code] = { ...fundDataCache[code], _error: true, name: fundDataCache[code]?.name || '获取失败' }; }
    }
    async function fetchAllFunds() {
        const allCodes = [...new Set([...watchlist, ...Object.keys(holdings)])];
        if (!allCodes.length) { renderWatchlist(); renderHoldings(); return; }
        const queue = [...allCodes]; const tasks = [];
        while (queue.length) { const batch = queue.splice(0, MAX_CON); tasks.push(...batch.map(fetchAndUpdate)); await Promise.allSettled(tasks); tasks.length = 0; }
        renderWatchlist(); renderHoldings(); saveCache(); updateTimeDisplay();
    }
    function scheduleRefresh() {
        clearTimeout(refreshTimer);
        const interval = isTradingTime() ? REFRESH_TRADING : REFRESH_IDLE;
        refreshTimer = setTimeout(() => { fetchAllFunds().then(scheduleRefresh); }, interval);
    }
    function refreshAllData() { return fetchAllFunds().then(scheduleRefresh); }

    // ========== 事件绑定 ==========
    btnAddWatchlist.addEventListener('click', () => { overlay.classList.add('active'); bottomSheet.classList.add('active'); inputCode.value = ''; inputCode.focus(); });
    btnAddHolding.addEventListener('click', () => { overlay.classList.add('active'); holdingSheet.classList.add('active'); holdingCode.value = ''; holdingCost.value = ''; holdingShares.value = ''; });
    overlay.addEventListener('click', () => { overlay.classList.remove('active'); bottomSheet.classList.remove('active'); holdingSheet.classList.remove('active'); backupSheet.classList.remove('active'); });
    btnConfirmAdd.addEventListener('click', () => { const code = inputCode.value.trim(); if (addWatchlist(code)) { overlay.classList.remove('active'); bottomSheet.classList.remove('active'); } });
    confirmAddHoldingSheet.addEventListener('click', () => {
        const code = holdingCode.value.trim(); const cost = parseFloat(holdingCost.value); const shares = parseFloat(holdingShares.value);
        if (!/^\d{6}$/.test(code)) return showToast('请输入6位代码', 'error');
        if (isNaN(cost) || isNaN(shares)) return showToast('请填写完整', 'error');
        holdings[code] = { name: fundDataCache[code]?.name || '', cost, shares }; saveHoldings();
        overlay.classList.remove('active'); holdingSheet.classList.remove('active'); renderHoldings(); showToast('已添加持仓');
    });

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelector('.nav-item.active').classList.remove('active'); item.classList.add('active');
            const page = item.dataset.page;
            watchlistPage.classList.toggle('active', page === 'watchlist'); holdingsPage.classList.toggle('active', page === 'holdings');
            if (page === 'holdings') renderHoldings();
        });
    });

    const SORT_MODES = ['change-desc', 'change-asc', 'manual'];
    btnSort.addEventListener('click', () => {
        const currentIdx = SORT_MODES.indexOf(sortMode); sortMode = SORT_MODES[(currentIdx + 1) % SORT_MODES.length];
        btnSort.classList.remove('desc', 'asc', 'manual');
        if (sortMode === 'change-desc') btnSort.classList.add('desc'); else if (sortMode === 'change-asc') btnSort.classList.add('asc'); else btnSort.classList.add('manual');
        renderWatchlist();
    });
    btnEditWatchlist.addEventListener('click', () => {
        isEditMode = !isEditMode;
        btnEditWatchlist.classList.toggle('edit-active', isEditMode);
        if (isEditMode && openedSwipe) { closeSwipe(openedSwipe); openedSwipe = null; }
        renderWatchlist();
    });

    btnRefresh.addEventListener('click', () => { btnRefresh.classList.add('refreshing'); setTimeout(() => btnRefresh.classList.remove('refreshing'), 900); refreshAllData(); });
    btnRefreshHoldings.addEventListener('click', () => { btnRefreshHoldings.classList.add('refreshing'); setTimeout(() => btnRefreshHoldings.classList.remove('refreshing'), 900); refreshAllData(); });
    btnSyncHoldings.addEventListener('click', syncHoldingsToWatchlist);

    indexToggle.addEventListener('click', () => {
        indexExpanded = !indexExpanded;
        const container = indexGridContainer;
        if (indexExpanded) {
            container.style.height = 'auto'; const targetHeight = container.offsetHeight;
            container.style.height = '0px'; container.offsetHeight; container.style.height = targetHeight + 'px';
            indexToggle.classList.add('expanded');
            const onTransitionEnd = () => { container.style.height = 'auto'; container.removeEventListener('transitionend', onTransitionEnd); };
            container.addEventListener('transitionend', onTransitionEnd);
        } else {
            const currentHeight = container.offsetHeight;
            container.style.height = currentHeight + 'px'; container.offsetHeight; container.style.height = '0px';
            indexToggle.classList.remove('expanded');
        }
    });

    // ========== 左滑删除 (编辑模式下完全禁用) ==========
    fundList.addEventListener('touchstart', (e) => {
        if (isEditMode || isBulkEditing) return;
        const wrapper = e.target.closest('.swipe-wrapper');
        if (!wrapper) return;
        if (openedSwipe && openedSwipe !== wrapper) { closeSwipe(openedSwipe); openedSwipe = null; }
        const touch = e.touches[0]; swipeStartX = touch.clientX; swipeStartY = touch.clientY; swipeCurrentX = 0; isSwiping = false;
    }, { passive: false });

    fundList.addEventListener('touchmove', (e) => {
        if (isEditMode || isBulkEditing) return;
        const wrapper = e.target.closest('.swipe-wrapper');
        if (!wrapper) return;
        const touch = e.touches[0]; const deltaX = touch.clientX - swipeStartX; const deltaY = touch.clientY - swipeStartY;
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
            e.preventDefault(); isSwiping = true;
            swipeCurrentX = Math.min(0, Math.max(-80, deltaX));
            const content = wrapper.querySelector('.swipe-content');
            if (content) content.style.transform = `translateX(${swipeCurrentX}px)`;
            const delBtn = wrapper.querySelector('.swipe-delete');
            if (delBtn) { if (swipeCurrentX < -40) delBtn.classList.add('active'); else delBtn.classList.remove('active'); }
        }
    }, { passive: false });

    fundList.addEventListener('touchend', (e) => {
        if (isEditMode || isBulkEditing) return;
        const wrapper = e.target.closest('.swipe-wrapper');
        if (!wrapper || !isSwiping) return;
        isSwiping = false;
        const content = wrapper.querySelector('.swipe-content');
        if (swipeCurrentX < -40) {
            if (content) content.style.transform = 'translateX(-80px)';
            const delBtn = wrapper.querySelector('.swipe-delete'); if (delBtn) delBtn.classList.add('active');
            if (openedSwipe && openedSwipe !== wrapper) closeSwipe(openedSwipe);
            openedSwipe = wrapper;
        } else {
            if (content) content.style.transform = 'translateX(0)';
            const delBtn = wrapper.querySelector('.swipe-delete'); if (delBtn) delBtn.classList.remove('active');
            openedSwipe = null;
        }
    });

    fundList.addEventListener('click', (e) => {
        if (isEditMode || isBulkEditing) return;
        const deleteBtn = e.target.closest('.swipe-delete');
        if (deleteBtn && deleteBtn.classList.contains('active')) {
            const wrapper = deleteBtn.closest('.swipe-wrapper');
            if (wrapper) { removeWatchlist(wrapper.dataset.code); openedSwipe = null; }
        }
    });

    document.addEventListener('touchstart', (e) => {
        if (isEditMode || isBulkEditing) return;
        if (openedSwipe && !e.target.closest('.swipe-wrapper')) { closeSwipe(openedSwipe); openedSwipe = null; }
    }, { passive: true });

    function closeSwipe(wrapper) {
        if (!wrapper) return;
        const content = wrapper.querySelector('.swipe-content');
        if (content) content.style.transform = 'translateX(0)';
        const delBtn = wrapper.querySelector('.swipe-delete');
        if (delBtn) delBtn.classList.remove('active');
    }

    // ========== 时间与刷新 ==========
    function updateTimeDisplay() {
        const now = new Date();
        const timeStr = now.toLocaleString('zh-CN', { hour12: false, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
        headerTime.textContent = timeStr; holdingsUpdateTime.textContent = timeStr;
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshAllData();
    });

    // ========== 启动 ==========
    loadWatchlist(); loadHoldings(); loadCache(); loadOfficialCache(); loadManualOrder(); loadIndustryTags();
    renderWatchlist();
    refreshAllData().then(() => { updateTimeDisplay(); setInterval(updateTimeDisplay, 60000); });
    fetchIndexData();
})();