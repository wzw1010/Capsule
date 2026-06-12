/* ===== Capsule · app.js (纯净版，无小组件接口) ===== */

(function() {
    /* ── 常量 ── */
    const STORAGE_WATCHLIST = 'fund_watchlist_v2';
    const STORAGE_HOLDINGS = 'fund_holdings';
    const CACHE_KEY = 'fund_data_cache';
    const MANUAL_ORDER_KEY = 'manual_order';
    const THEME_KEY = 'app_theme';
    const FUND_API = 'https://fundgz.1234567.com.cn/js/';
    const MAX_CON = 3;
    const ACCOUNT_HISTORY_KEY = 'account_profit_history';

    /* ── DOM 引用 ── */
    const $ = (id) => document.getElementById(id);
    const fundList = $('fundList');
    const emptyState = $('emptyState');
    const overlay = $('overlay');
    const bottomSheet = $('bottomSheet');
    const inputCode = $('inputCode');
    const btnConfirmAdd = $('btnConfirmAdd');
    const toast = $('toast');
    const headerTime = $('headerTime');
    const holdingsUpdateTime = $('holdingsUpdateTime');
    const holdingsList = $('holdingsList');
    const holdingSheet = $('holdingSheet');
    const holdingCode = $('holdingCode');
    const holdingCost = $('holdingCost');
    const holdingShares = $('holdingShares');
    const confirmAddHoldingSheet = $('confirmAddHoldingSheet');
    const importFile = $('importFile');
    const indexToggle = $('indexToggle');
    const indexGridContainer = $('indexGridContainer');
    const indexGrid = $('indexGrid');
    const btnMoreWatchlist = $('btnMoreWatchlist');
    const btnMoreHoldings = $('btnMoreHoldings');
    const menuWatchlist = $('menuWatchlist');
    const menuHoldings = $('menuHoldings');
    const watchlistPage = $('watchlistPage');
    const holdingsPage = $('holdingsPage');
    const settingsPage = $('settingsPage');
    const summaryToggle = $('summaryToggle');
    const summaryContent = $('summaryContent');
    const bulkEditLabel = $('bulkEditLabel');
    const editLabel = $('editLabel');
    const btnRefreshWatchlist = $('btnRefreshWatchlist');
    const btnRefreshHoldings = $('btnRefreshHoldings');
    const themeColorMeta = $('themeColorMeta');
    const totalYieldRateEl = $('totalYieldRate');
    const unlockHint = $('unlockHint');
    const accountTrendContainer = $('accountTrendContainer');
    const accountTrendCanvas = $('accountTrendCanvas');
    const bottomNav = $('bottomNav');
    const navSlider = $('navSlider');
    const settingsWarnings = $('settingsWarningsContainer');
    const modalOverlay = $('modalOverlay');
    const modalIcon = $('modalIcon');
    const modalTitle = $('modalTitle');
    const modalDesc = $('modalDesc');
    const modalButtons = $('modalButtons');

    /* ── 全局状态 ── */
    let watchlist = [];
    let holdings = {};
    let fundDataCache = {};
    let refreshTimer = null;
    let toastTimer = null;
    let wakeUpTimer = null;
    let indexTimer = null;
    let sortMode = 'manual';
    let holdSortMode = 'market-desc';
    let isBulkEditing = false;
    let isEditMode = false;
    let manualOrder = [];
    let openedSwipe = null;
    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipeCurrentX = 0;
    let isSwiping = false;
    let saveCachePending = false;
    let currentTheme = localStorage.getItem(THEME_KEY) || 'dark';
    let trendCharts = {};
    let accountProfitHistory = [];
    let accountTrendChart = null;
    let summaryVisible = false;
    let jsonpCounter = 0;
    let lastHoldSortMode = holdSortMode;

    window.currentTheme = currentTheme;

    /* ── 工具函数 ── */
    const escapeHTML = (str) => {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    };

    const formatMoney = (val) => (val >= 0 ? '+' : '') + val.toFixed(2);

    const isWeekend = () => { const d = new Date().getDay(); return d === 0 || d === 6; };
    const isTradingDay = () => !isWeekend();

    function isTradingTime() {
        const now = new Date();
        if (!isTradingDay()) return false;
        const m = now.getHours() * 60 + now.getMinutes();
        return (m >= 570 && m <= 690) || (m >= 780 && m <= 900);
    }

    function getLatestTradeDate() {
        const d = new Date();
        while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
        const now = new Date();
        if (now.getHours() < 15 && !isWeekend()) {
            d.setDate(d.getDate() - 1);
            while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
        }
        return d.toISOString().slice(0, 10);
    }

    function isUpdated(code) {
        const d = fundDataCache[code];
        if (!d || !d.actualDate) return false;
        if (isTradingTime()) return false;
        return d.actualDate >= getLatestTradeDate();
    }

    function isNetValueUpdated() {
        const codes = Object.keys(holdings);
        if (!codes.length) return false;
        const latestDate = getLatestTradeDate();
        return codes.every(code => {
            const d = fundDataCache[code];
            return d && d.actualDate && d.actualDate >= latestDate;
        });
    }

    function cleanName(str) {
        if (!str) return '';
        return str.replace(/[^\u4e00-\u9fa5a-zA-Z0-9()（）\-、·]/g, '').trim() || '未知基金';
    }

    /* ── 主题 ── */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_KEY, theme);
        document.getElementById('themeColorMeta').setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff');
        const checkDark = document.getElementById('themeCheckDark');
        const checkLight = document.getElementById('themeCheckLight');
        if (checkDark) checkDark.style.visibility = theme === 'dark' ? 'visible' : 'hidden';
        if (checkLight) checkLight.style.visibility = theme === 'light' ? 'visible' : 'hidden';
        currentTheme = theme;
        if (typeof toggleThemeRefresh === 'function') toggleThemeRefresh();
    }

    // ===== 修复浅色模式切换 =====
    window.applyTheme = applyTheme;

    function initTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        currentTheme = (saved === 'dark' || saved === 'light') ? saved : 'dark';
        applyTheme(currentTheme);
    }

    function getCurrentThemeColor(varName) {
        return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    }

    function toggleThemeRefresh() {
        const axisColor = getCurrentThemeColor('--text-tertiary');
        const gridColor = getCurrentThemeColor('--border-subtle');
        Object.keys(trendCharts).forEach(code => {
            const chart = trendCharts[code];
            if (chart) {
                chart.options.scales.x.ticks.color = axisColor;
                chart.options.scales.x.grid.color = gridColor;
                chart.options.scales.y.ticks.color = axisColor;
                chart.options.scales.y.grid.color = gridColor;
                chart.update();
            }
        });
        if (accountTrendChart) {
            accountTrendChart.options.scales.y.ticks.color = axisColor;
            accountTrendChart.options.scales.y.grid.color = gridColor;
            accountTrendChart.update();
        }
        closeAllMenus();
        updateBreathing();
    }

    window.toggleThemeRefresh = toggleThemeRefresh;

    /* ── 行业/资产类型 ── */
    const ASSET_TYPE_MAP = {
        '股票型': ['股票','权益','指数','LOF','ETF'],
        '债券型': ['债券','债','纯债','中短债'],
        '混合型': ['混合','灵活','平衡'],
        'QDII': ['QDII','海外','纳斯达克','标普','全球','恒生'],
    };

    function getAssetType(name) {
        for (const [type, keys] of Object.entries(ASSET_TYPE_MAP))
            for (const key of keys) if (name.includes(key)) return type;
        return '其他';
    }

    const INDUSTRY_COLORS_LIGHT = { '白酒':{bg:'rgba(255,180,100,0.2)',color:'#c87a2a',border:'rgba(255,180,100,0.5)'}, '医药':{bg:'rgba(100,200,255,0.2)',color:'#3a8abf',border:'rgba(100,200,255,0.5)'}, '新能源':{bg:'rgba(100,255,150,0.2)',color:'#2e8b57',border:'rgba(100,255,150,0.5)'}, '科技':{bg:'rgba(180,130,255,0.2)',color:'#6a3fbf',border:'rgba(180,130,255,0.5)'}, '消费':{bg:'rgba(255,150,150,0.2)',color:'#c84b4b',border:'rgba(255,150,150,0.5)'}, '军工':{bg:'rgba(150,180,220,0.2)',color:'#4a6a8f',border:'rgba(150,180,220,0.5)'}, '金融':{bg:'rgba(220,200,100,0.2)',color:'#9a8530',border:'rgba(220,200,100,0.5)'}, '地产':{bg:'rgba(200,160,120,0.2)',color:'#7a5e3f',border:'rgba(200,160,120,0.5)'}, '传媒':{bg:'rgba(255,180,200,0.2)',color:'#c8687f',border:'rgba(255,180,200,0.5)'}, '汽车':{bg:'rgba(120,200,220,0.2)',color:'#3a8090',border:'rgba(120,200,220,0.5)'}, '周期':{bg:'rgba(200,180,140,0.2)',color:'#7a6e4a',border:'rgba(200,180,140,0.5)'}, '计算机':{bg:'rgba(140,160,255,0.2)',color:'#4a5ecc',border:'rgba(140,160,255,0.5)'}, '环保':{bg:'rgba(100,220,150,0.2)',color:'#2e7a4a',border:'rgba(100,220,150,0.5)'}, '教育':{bg:'rgba(255,200,120,0.2)',color:'#c87a30',border:'rgba(255,200,120,0.5)'}, '交通':{bg:'rgba(150,200,200,0.2)',color:'#4a7a7a',border:'rgba(150,200,200,0.5)'}, '能源':{bg:'rgba(255,150,100,0.2)',color:'#c85e30',border:'rgba(255,150,100,0.5)'}, '指数':{bg:'rgba(180,180,200,0.2)',color:'#6a6a7f',border:'rgba(180,180,200,0.5)'}, '债券':{bg:'rgba(200,200,160,0.2)',color:'#7a7a4a',border:'rgba(200,200,160,0.5)'}, '混合':{bg:'rgba(220,180,200,0.2)',color:'#8a6070',border:'rgba(220,180,200,0.5)'}, '量化':{bg:'rgba(160,200,180,0.2)',color:'#4a6e5a',border:'rgba(160,200,180,0.5)'}, '红利':{bg:'rgba(255,200,150,0.2)',color:'#c87a40',border:'rgba(255,200,150,0.5)'}, 'QDII':{bg:'rgba(150,180,255,0.2)',color:'#4a5ecc',border:'rgba(150,180,255,0.5)'} };
    const INDUSTRY_COLORS_DARK = { '白酒':{bg:'rgba(255,180,100,0.4)',color:'#ffb864',border:'rgba(255,180,100,0.5)'}, '医药':{bg:'rgba(100,200,255,0.4)',color:'#64c8ff',border:'rgba(100,200,255,0.5)'}, '新能源':{bg:'rgba(100,255,150,0.4)',color:'#64ff96',border:'rgba(100,255,150,0.5)'}, '科技':{bg:'rgba(180,130,255,0.4)',color:'#b482ff',border:'rgba(180,130,255,0.5)'}, '消费':{bg:'rgba(255,150,150,0.4)',color:'#ff9696',border:'rgba(255,150,150,0.5)'}, '军工':{bg:'rgba(150,180,220,0.4)',color:'#96b4dc',border:'rgba(150,180,220,0.5)'}, '金融':{bg:'rgba(220,200,100,0.4)',color:'#dcc864',border:'rgba(220,200,100,0.5)'}, '地产':{bg:'rgba(200,160,120,0.4)',color:'#c8a078',border:'rgba(200,160,120,0.5)'}, '传媒':{bg:'rgba(255,180,200,0.4)',color:'#ffb4c8',border:'rgba(255,180,200,0.5)'}, '汽车':{bg:'rgba(120,200,220,0.4)',color:'#78c8dc',border:'rgba(120,200,220,0.5)'}, '周期':{bg:'rgba(200,180,140,0.4)',color:'#c8b48c',border:'rgba(200,180,140,0.5)'}, '计算机':{bg:'rgba(140,160,255,0.4)',color:'#8ca0ff',border:'rgba(140,160,255,0.5)'}, '环保':{bg:'rgba(100,220,150,0.4)',color:'#64dc96',border:'rgba(100,220,150,0.5)'}, '教育':{bg:'rgba(255,200,120,0.4)',color:'#ffc878',border:'rgba(255,200,120,0.5)'}, '交通':{bg:'rgba(150,200,200,0.4)',color:'#96c8c8',border:'rgba(150,200,200,0.5)'}, '能源':{bg:'rgba(255,150,100,0.4)',color:'#ff9664',border:'rgba(255,150,100,0.5)'}, '指数':{bg:'rgba(180,180,200,0.4)',color:'#b4b4c8',border:'rgba(180,180,200,0.5)'}, '债券':{bg:'rgba(200,200,160,0.4)',color:'#c8c8a0',border:'rgba(200,200,160,0.5)'}, '混合':{bg:'rgba(220,180,200,0.4)',color:'#dcb4c8',border:'rgba(220,180,200,0.5)'}, '量化':{bg:'rgba(160,200,180,0.4)',color:'#a0c8b4',border:'rgba(160,200,180,0.5)'}, '红利':{bg:'rgba(255,200,150,0.4)',color:'#ffc896',border:'rgba(255,200,150,0.5)'}, 'QDII':{bg:'rgba(150,180,255,0.4)',color:'#96b4ff',border:'rgba(150,180,255,0.5)'} };
    const INDUSTRY_KEYWORDS = [
        {keys:['白酒','酒'],tag:'白酒'},{keys:['医疗','医药','健康','生物'],tag:'医药'},{keys:['新能源','光伏','锂电','电池','碳中和'],tag:'新能源'},{keys:['科技','芯片','半导体','电子','5G','通信','物联网'],tag:'科技'},{keys:['消费','食品','饮料','农业','粮食'],tag:'消费'},{keys:['军工','国防','航天','军事'],tag:'军工'},{keys:['证券','券商','银行','金融','保险'],tag:'金融'},{keys:['地产','房地产','基建','建材'],tag:'地产'},{keys:['传媒','影视','娱乐','文化'],tag:'传媒'},{keys:['汽车','整车','新能源车','智能汽车'],tag:'汽车'},{keys:['有色','钢铁','煤炭','化工','材料','稀土','石油'],tag:'周期'},{keys:['计算机','软件','人工智能','大数据','云'],tag:'计算机'},{keys:['环保','环境','低碳'],tag:'环保'},{keys:['教育','培训'],tag:'教育'},{keys:['旅游','酒店','航空','运输','物流'],tag:'交通'},{keys:['电力','公用事业','能源'],tag:'能源'},{keys:['指数','300','500','创业板','科创','深证','上证','中证','沪深'],tag:'指数'},{keys:['债','债券','纯债','中短债'],tag:'债券'},{keys:['混合','灵活'],tag:'混合'},{keys:['量化','对冲'],tag:'量化'},{keys:['红利','高股息'],tag:'红利'},{keys:['QDII','海外','纳斯达克','标普','道琼斯','全球','德国','日本','亚太','恒生'],tag:'QDII'}
    ];

    function getIndustryForCode(code, name) {
        const sorted = [...INDUSTRY_KEYWORDS].sort((a,b) => b.keys.join().length - a.keys.join().length);
        for (const item of sorted) for (const key of item.keys) if (name.includes(key)) return item.tag;
        return '';
    }

    function getIndustryColors(tag) {
        const colors = currentTheme === 'dark' ? INDUSTRY_COLORS_DARK : INDUSTRY_COLORS_LIGHT;
        const base = colors[tag];
        if (!base) return null;
        return { bg: base.bg, color: base.color, border: base.border };
    }

    /* ── 数据持久化 ── */
    function loadManualOrder() { try { manualOrder = JSON.parse(localStorage.getItem(MANUAL_ORDER_KEY)) || []; } catch { manualOrder = []; } }
    function saveManualOrder() { localStorage.setItem(MANUAL_ORDER_KEY, JSON.stringify(manualOrder)); }
    function loadWatchlist() { try { watchlist = JSON.parse(localStorage.getItem(STORAGE_WATCHLIST)) || []; } catch { watchlist = []; } watchlist = [...new Set(watchlist.filter(c => /^\d{6}$/.test(c)))]; }
    function saveWatchlist() { localStorage.setItem(STORAGE_WATCHLIST, JSON.stringify(watchlist)); }
    function loadHoldings() { try { holdings = JSON.parse(localStorage.getItem(STORAGE_HOLDINGS)) || {}; } catch { holdings = {}; } }
    function saveHoldings() { localStorage.setItem(STORAGE_HOLDINGS, JSON.stringify(holdings)); }
    function loadCache() { try { fundDataCache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch {} }
    function saveCache() { localStorage.setItem(CACHE_KEY, JSON.stringify(fundDataCache)); }
    function saveCacheThrottled() { if (saveCachePending) return; saveCachePending = true; setTimeout(() => { localStorage.setItem(CACHE_KEY, JSON.stringify(fundDataCache)); saveCachePending = false; }, 5000); }
    function loadAccountHistory() { try { accountProfitHistory = JSON.parse(localStorage.getItem(ACCOUNT_HISTORY_KEY)) || []; } catch { accountProfitHistory = []; } }
    function saveAccountHistory() { localStorage.setItem(ACCOUNT_HISTORY_KEY, JSON.stringify(accountProfitHistory)); }

    /* ── JSONP 数据获取 ── */
    function fetchSingle(code, retries = 2) {
        return new Promise((resolve, reject) => {
            const attempt = (remaining) => {
                const sid = 'jsonp-' + code + '-' + (jsonpCounter++) + '-' + Date.now();
                document.getElementById(sid)?.remove();
                const s = document.createElement('script');
                s.id = sid;
                s.src = FUND_API + code + '.js?rt=' + Date.now();
                let tid = setTimeout(() => { cleanup(); if (remaining > 0) attempt(remaining - 1); else reject(new Error('超时')); }, 8000);
                if (!window._jsonpCB) window._jsonpCB = {};
                window._jsonpCB[code] = (data) => { cleanup(); resolve(data); };
                function cleanup() { clearTimeout(tid); if (s.parentNode) s.remove(); delete window._jsonpCB[code]; }
                s.onerror = () => { cleanup(); if (remaining > 0) attempt(remaining - 1); else reject(new Error('网络错误')); };
                document.head.appendChild(s);
            };
            attempt(retries);
        });
    }
    window.jsonpgz = (d) => { if (d?.fundcode && window._jsonpCB?.[d.fundcode]) window._jsonpCB[d.fundcode](d); };

    /* ── 净值日期解析 ── */
    function parseNavDate(rawDate) {
        if (!rawDate) return null;
        const cleaned = rawDate.replace(/\D/g, '');
        if (cleaned.length >= 8) {
            const dt = cleaned.slice(0, 8);
            const y = parseInt(dt.slice(0, 4));
            const m = parseInt(dt.slice(4, 6));
            const d = parseInt(dt.slice(6, 8));
            if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
                return dt.slice(0, 4) + '-' + dt.slice(4, 6) + '-' + dt.slice(6, 8);
            }
        }
        return null;
    }

    /* ── 数据更新逻辑 ── */
    async function fetchAndUpdate(code) {
        try {
            const oldData = fundDataCache[code] || {};
            const now = new Date();
            const isTrading = !isWeekend() && ((now.getHours() >= 9 && now.getMinutes() >= 30) || now.getHours() >= 10) && now.getHours() < 15;
            let changed = false;
            if (!isTrading && isUpdated(code)) return false;
            if (isTrading) {
                const d = await fetchSingle(code);
                const newData = { ...oldData, fundcode: d.fundcode, name: d.name || oldData.name || '未知', gsz: d.gsz, gszzl: d.gszzl, jzrq: d.jzrq || oldData.jzrq || '', gztime: d.gztime || '' };
                changed = oldData.gsz !== newData.gsz || oldData.gszzl !== newData.gszzl;
                fundDataCache[code] = newData;
            } else {
                let ttData = null;
                try { ttData = await fetchSingle(code); } catch {}
                let txNav = null, txDate = null, txRate = null;
                try {
                    const resp = await fetch(`https://qt.gtimg.cn/q=jj${code}`);
                    const text = await resp.text();
                    const match = text.match(/"([^"]+)"/);
                    if (match) {
                        const fields = match[1].split('~');
                        txNav = parseFloat(fields[5]);
                        txRate = parseFloat(fields[7]);
                        txDate = parseNavDate(fields[8] || '');
                    }
                } catch {}
                const newData = { ...oldData, fundcode: ttData?.fundcode || code, name: ttData?.name || oldData.name || '未知', gsz: ttData?.gsz || oldData.gsz || '', gszzl: ttData?.gszzl || oldData.gszzl || '', gztime: ttData?.gztime || oldData.gztime || '', jzrq: ttData?.jzrq || oldData.jzrq || '', actualNav: (txNav && !isNaN(txNav)) ? String(txNav) : oldData.actualNav, actualRate: (txRate != null && !isNaN(txRate)) ? txRate : oldData.actualRate, actualDate: txDate || oldData.actualDate };
                changed = oldData.actualNav !== newData.actualNav || oldData.actualRate !== newData.actualRate || oldData.actualDate !== newData.actualDate || oldData.jzrq !== newData.jzrq;
                fundDataCache[code] = newData;
            }
            return changed;
        } catch {
            fundDataCache[code] = { ...fundDataCache[code] || {} };
            return false;
        }
    }

    /* ── 定时刷新 ── */
    function getRefreshInterval() {
        if (!isTradingDay()) {
            const now = new Date();
            const min = now.getHours() * 60 + now.getMinutes();
            if (min >= 0 && min < 120) {
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                if (yesterday.getDay() !== 0 && yesterday.getDay() !== 6) return 15 * 60 * 1000;
            }
            return null;
        }
        const min = new Date().getHours() * 60 + new Date().getMinutes();
        if (min >= 695 && min < 780) return null;
        if (min >= 900 && min < 1080) return 15 * 60 * 1000;
        if (min >= 1080) return null;
        if ((min >= 570 && min < 690) || (min >= 780 && min < 900)) return 60 * 1000;
        return null;
    }

    function getWakeUpDelay() {
        const now = new Date();
        const min = now.getHours() * 60 + now.getMinutes();
        if (min >= 120 && min < 540) {
            const target = new Date(now);
            target.setHours(9, 0, 0, 0);
            return target.getTime() - now.getTime();
        }
        if (min >= 1320) {
            const target = new Date(now);
            target.setDate(target.getDate() + 1);
            target.setHours(9, 0, 0, 0);
            return target.getTime() - now.getTime();
        }
        return 0;
    }

    function scheduleRefresh(isAuto = true) {
        clearTimeout(refreshTimer);
        clearTimeout(wakeUpTimer);
        const interval = getRefreshInterval();
        if (interval === null) {
            if (isAuto) {
                const delay = getWakeUpDelay();
                if (delay > 0) wakeUpTimer = setTimeout(() => refreshAllData(true), delay);
            }
            return;
        }
        refreshTimer = setTimeout(() => refreshAllData(true), interval);
    }

    /* ── 大盘指数 ── */
    async function fetchIndexData() {
        try {
            const INDEX_CODES = [{code:'sh000001',name:'上证指数'},{code:'sz399001',name:'深证成指'},{code:'sz399006',name:'创业板指'},{code:'sh000688',name:'科创50'},{code:'sh000300',name:'沪深300'},{code:'sh000905',name:'中证500'},{code:'sh000852',name:'中证1000'},{code:'sh000016',name:'上证50'}];
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
                const arrow = d.change > 0 ? '▲' : (d.change < 0 ? '▼' : '');
                const changeClass = d.change > 0 ? 'profit-positive' : (d.change < 0 ? 'profit-negative' : 'neutral');
                html += `<div class="index-metric-card"><div class="index-metric-name">${item.name}</div><div class="index-metric-price ${changeClass}">${d.price.toFixed(2)}</div><div class="index-metric-change ${changeClass}">${arrow} ${Math.abs(d.changePercent).toFixed(2)}%</div></div>`;
            });
            indexGrid.innerHTML = html;
        } catch (e) {
            indexGrid.innerHTML = '<div class="index-metric-card"><div class="index-metric-name">加载失败</div></div>';
        }
    }

    function scheduleIndexRefresh() {
        clearTimeout(indexTimer);
        if (!isTradingDay() || !isTradingTime()) {
            indexTimer = setTimeout(() => scheduleIndexRefresh(), 60000);
            return;
        }
        fetchIndexData();
        indexTimer = setTimeout(() => scheduleIndexRefresh(), 15000);
    }

    /* ── 呼吸动画 ── */
    function updateBreathing() {
        const isTrading = isTradingTime();
        document.querySelectorAll('.change-percent.up, .change-percent.down').forEach(el => {
            if (isTrading) el.classList.add('breathing');
            else el.classList.remove('breathing');
        });
    }

    /* ── 自选页渲染 ── */
    function getManualOrderArray() {
        return (manualOrder.length === watchlist.length && manualOrder.every(c => watchlist.includes(c))) ? [...manualOrder] : [...watchlist];
    }

    function renderWatchlist() {
        if (!watchlist.length) {
            fundList.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }
        emptyState.style.display = 'none';
        const manual = getManualOrderArray();
        let displayOrder = isEditMode ? manual : (() => {
            if (sortMode === 'change-desc' || sortMode === 'change-asc') {
                return [...manual].sort((a, b) => {
                    const za = parseFloat(fundDataCache[a]?.gszzl) || 0;
                    const zb = parseFloat(fundDataCache[b]?.gszzl) || 0;
                    return sortMode === 'change-desc' ? zb - za : za - zb;
                });
            }
            return manual;
        })();
        const html = displayOrder.map(code => {
            const d = fundDataCache[code];
            const name = d?.name || '加载中...';
            let gszzl = d?.gszzl != null ? parseFloat(d.gszzl) : null;
            if (gszzl != null && isNaN(gszzl)) gszzl = null;
            const cls = gszzl === null ? 'zero' : (gszzl > 0 ? 'up' : (gszzl < 0 ? 'down' : 'zero'));
            const tag = getIndustryForCode(code, name);
            let tagHtml = '';
            if (tag) {
                const c = getIndustryColors(tag);
                if (c) tagHtml = `<span class="industry-tag" style="background:${c.bg};color:${c.color};border-color:${c.border};">${tag}</span>`;
            }
            const editHtml = isEditMode ? `<div class="edit-actions show"><button class="edit-btn move-up-btn" data-code="${code}">▲</button><button class="edit-btn move-down-btn" data-code="${code}">▼</button></div>` : '';
            return `<div class="swipe-wrapper" data-code="${code}"><div class="swipe-content ${cls}"><div class="fund-card-left">${tagHtml}<span class="fund-name">${escapeHTML(name)}</span><span class="fund-code">${code}</span></div><span class="change-percent ${cls}">${gszzl!==null?(gszzl>=0?'+':'')+gszzl.toFixed(2)+'%':'--'}</span>${editHtml}</div><div class="swipe-delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg><span>删除</span></div></div>`;
        }).join('');
        fundList.innerHTML = html;
        updateBreathing();
        if (isEditMode) {
            fundList.querySelectorAll('.move-up-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); moveItemUp(btn.dataset.code); }));
            fundList.querySelectorAll('.move-down-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); moveItemDown(btn.dataset.code); }));
        }
    }

    function updateWatchlistCard(code) {
        const card = document.querySelector(`.swipe-wrapper[data-code="${code}"]`);
        if (!card) return;
        const d = fundDataCache[code] || {};
        const name = d.name || '未知';
        let gszzl = d.gszzl != null ? parseFloat(d.gszzl) : null;
        if (gszzl != null && isNaN(gszzl)) gszzl = null;
        const cls = gszzl === null ? 'zero' : (gszzl > 0 ? 'up' : (gszzl < 0 ? 'down' : 'zero'));
        card.querySelector('.swipe-content').className = 'swipe-content ' + cls;
        card.querySelector('.fund-name').textContent = name;
        const chgEl = card.querySelector('.change-percent');
        chgEl.textContent = gszzl !== null ? (gszzl >= 0 ? '+' : '') + gszzl.toFixed(2) + '%' : '--';
        chgEl.className = 'change-percent ' + cls;
        updateBreathing();
        const tag = getIndustryForCode(code, name);
        const leftDiv = card.querySelector('.fund-card-left');
        const existingTag = leftDiv.querySelector('.industry-tag');
        if (existingTag) existingTag.remove();
        if (tag) {
            const c = getIndustryColors(tag);
            if (c) leftDiv.insertAdjacentHTML('afterbegin', `<span class="industry-tag" style="background:${c.bg};color:${c.color};border-color:${c.border};">${tag}</span>`);
        }
    }

    function moveItemUp(code) {
        const arr = getManualOrderArray();
        const idx = arr.indexOf(code);
        if (idx <= 0) return;
        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
        manualOrder = arr;
        saveManualOrder();
        renderWatchlist();
    }

    function moveItemDown(code) {
        const arr = getManualOrderArray();
        const idx = arr.indexOf(code);
        if (idx < 0 || idx >= arr.length - 1) return;
        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
        manualOrder = arr;
        saveManualOrder();
        renderWatchlist();
    }

    /* ── 持仓汇总计算（纯函数） ── */
    function computeSummary() {
        const codes = Object.keys(holdings);
        if (!codes.length) return { totalAsset: 0, todayProfit: 0, totalProfit: 0, totalCost: 0, totalYieldRate: 0, items: [] };
        let totalAsset = 0, todayProfitSum = 0, totalProfitSum = 0, totalCost = 0;
        const items = [];
        codes.forEach(code => {
            const h = holdings[code];
            const d = fundDataCache[code] || {};
            const cost = parseFloat(h.cost) || 0;
            const shares = parseFloat(h.shares) || 0;
            const updated = isUpdated(code);
            const inTrading = isTradingTime();
            let currentNav, dayRate;
            if (updated) {
                currentNav = parseFloat(d.actualNav) || 0;
                dayRate = d.actualRate != null ? parseFloat(d.actualRate) : 0;
            } else if (inTrading) {
                currentNav = parseFloat(d.gsz) || 0;
                dayRate = parseFloat(d.gszzl) || 0;
            } else {
                const estNav = parseFloat(d.gsz);
                const actNav = parseFloat(d.actualNav);
                if (estNav > 0) { currentNav = estNav; dayRate = parseFloat(d.gszzl) || 0; }
                else if (actNav > 0) { currentNav = actNav; dayRate = d.actualRate != null ? parseFloat(d.actualRate) : 0; }
                else { currentNav = 0; dayRate = 0; }
            }
            const marketValue = currentNav * shares;
            const rate = (dayRate != null && !isNaN(dayRate)) ? (dayRate / 100) : 0;
            const prevNav = rate !== 0 ? (currentNav / (1 + rate)) : currentNav;
            const dayProfit = shares * prevNav * rate;
            const totalP = (currentNav - cost) * shares;
            totalAsset += marketValue;
            todayProfitSum += dayProfit;
            totalProfitSum += totalP;
            totalCost += cost * shares;
            items.push({ code, marketValue, dayProfit, totalP, currentNav, cost, shares });
        });
        const totalYieldRate = totalCost > 0 ? (totalProfitSum / totalCost * 100) : 0;
        return { totalAsset, todayProfit: todayProfitSum, totalProfit: totalProfitSum, totalCost, totalYieldRate, items };
    }

    function updateSummary(summary) {
        if (!summaryVisible) {
            $('totalAsset').textContent = '***';
            $('todayProfit').textContent = '***';
            $('totalProfit').textContent = '***';
            if (totalYieldRateEl) totalYieldRateEl.textContent = '***';
            return;
        }
        $('totalAsset').textContent = summary.totalAsset.toFixed(2);
        $('todayProfit').textContent = formatMoney(summary.todayProfit);
        $('totalProfit').textContent = formatMoney(summary.totalProfit);
        $('todayProfit').className = 's-value ' + (summary.todayProfit > 0 ? 'profit-positive' : (summary.todayProfit < 0 ? 'profit-negative' : 'neutral'));
        $('totalProfit').className = 's-value ' + (summary.totalProfit > 0 ? 'profit-positive' : (summary.totalProfit < 0 ? 'profit-negative' : 'neutral'));
        if (totalYieldRateEl) {
            totalYieldRateEl.textContent = (summary.totalYieldRate >= 0 ? '+' : '') + summary.totalYieldRate.toFixed(2) + '%';
            totalYieldRateEl.className = 's-value ' + (summary.totalYieldRate > 0 ? 'profit-positive' : (summary.totalYieldRate < 0 ? 'profit-negative' : 'neutral'));
        }
    }

    function calcTodayProfit() {
        return computeSummary().todayProfit;
    }

    /* ── 收益历史 ── */
    function appendAccountHistory() {
        const today = new Date().toISOString().slice(0, 10);
        const existingIndex = accountProfitHistory.findIndex(item => item.date === today);
        const profit = calcTodayProfit();
        if (existingIndex >= 0) {
            accountProfitHistory[existingIndex] = { date: today, profit, type: isTradingTime() ? 'estimated' : 'actual' };
        } else {
            if (isTradingTime() && accountProfitHistory.length > 0 && accountProfitHistory[accountProfitHistory.length - 1].date === today) return;
            if (!isTradingTime() && !isNetValueUpdated()) return;
            accountProfitHistory.push({ date: today, profit, type: isTradingTime() ? 'estimated' : 'actual' });
        }
        if (accountProfitHistory.length > 30) accountProfitHistory.shift();
        saveAccountHistory();
    }

    /* ── 账户趋势图 ── */
    function renderAccountTrendChart() {
        const isExpanded = summaryContent.classList.contains('expanded');
        if (!accountTrendContainer) return;
        if (!isExpanded) {
            if (accountTrendChart) { accountTrendChart.destroy(); accountTrendChart = null; }
            return;
        }
        if (!accountProfitHistory.length) {
            if (accountTrendChart) { accountTrendChart.destroy(); accountTrendChart = null; }
            return;
        }
        if (accountTrendChart) accountTrendChart.destroy();
        const canvas = accountTrendCanvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const upColor = getCurrentThemeColor('--up-color');
        const downColor = getCurrentThemeColor('--down-color');
        const axisColor = getCurrentThemeColor('--text-tertiary');
        const gridColor = getCurrentThemeColor('--border-subtle');
        const profits = accountProfitHistory.map(item => item.profit);
        const types = accountProfitHistory.map(item => item.type || 'actual');
        const hasEstimate = isTradingTime() && accountProfitHistory.length > 0 && accountProfitHistory[accountProfitHistory.length - 1].date !== new Date().toISOString().slice(0, 10);
        let displayProfits = [...profits];
        let bgColors = profits.map((v, i) => {
            const baseColor = v >= 0 ? upColor : downColor;
            if (types[i] === 'estimated') return v >= 0 ? 'rgba(255,94,94,0.35)' : 'rgba(76,217,100,0.35)';
            return baseColor;
        });
        if (hasEstimate) {
            const estProfit = calcTodayProfit();
            displayProfits.push(estProfit);
            bgColors.push(estProfit >= 0 ? 'rgba(255,94,94,0.35)' : 'rgba(76,217,100,0.35)');
        }
        accountTrendChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: displayProfits.map(() => ''),
                datasets: [{
                    data: displayProfits,
                    backgroundColor: bgColors,
                    borderRadius: 4,
                    borderSkipped: false,
                    barPercentage: 0.6,
                    categoryPercentage: 0.8,
                    maxBarThickness: 32,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const isEst = (hasEstimate && ctx.dataIndex === displayProfits.length - 1) || (ctx.dataIndex < types.length && types[ctx.dataIndex] === 'estimated');
                                return `${ctx.raw >= 0 ? '+' : ''}${ctx.raw.toFixed(2)}${isEst ? '（估值）' : '（实际）'}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { display: false },
                    y: {
                        ticks: { color: axisColor, font: { size: 9 }, callback: v => `${v>=0?'+':''}${v.toFixed(0)}` },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }

    /* ── 持仓分析 ── */
    function calculateAnalysis() {
        const codes = Object.keys(holdings);
        if (!codes.length) return null;
        const indMap = {}, astMap = {};
        let totalValue = 0;
        codes.forEach(code => {
            const h = holdings[code];
            const d = fundDataCache[code] || {};
            const shares = parseFloat(h.shares) || 0;
            const updated = isUpdated(code);
            const inTrading = isTradingTime();
            let nav = 0;
            if (updated) nav = parseFloat(d.actualNav) || 0;
            else if (inTrading) nav = parseFloat(d.gsz) || 0;
            else nav = parseFloat(d.actualNav) || parseFloat(d.gsz) || 0;
            const marketValue = nav * shares;
            if (marketValue <= 0) return;
            const name = h.name || d.name || code;
            const industry = getIndustryForCode(code, name) || '其他';
            const assetType = getAssetType(name);
            indMap[industry] = (indMap[industry] || 0) + marketValue;
            astMap[assetType] = (astMap[assetType] || 0) + marketValue;
            totalValue += marketValue;
        });
        if (totalValue <= 0) return null;
        const warnings = [];
        const toList = m => Object.entries(m).map(([n, v]) => ({ name: n, value: v, pct: v / totalValue * 100 })).sort((a, b) => b.value - a.value);
        const indList = toList(indMap), astList = toList(astMap);
        indList.forEach(x => { if (x.pct > 40) warnings.push(`${x.name}行业占比 ${x.pct.toFixed(1)}%，过于集中`); });
        const eqPct = ((astMap['股票型'] || 0) + (astMap['混合型'] || 0)) / totalValue * 100;
        if (eqPct > 80) warnings.push(`权益类资产 ${eqPct.toFixed(1)}%，风险偏好较高`);
        return { indList, totalValue, warnings };
    }

    function renderSettingsWarnings() {
        const data = calculateAnalysis();
        if (!data) return;
        if (!data.warnings.length) {
            if (settingsWarnings) settingsWarnings.innerHTML = '<div style="text-align:center;padding:4px 0;font-size:0.7rem;color:var(--text-tertiary);">✅ 暂未发现集中度风险</div>';
            return;
        }
        const maxPct = Math.max(...data.indList.map(i => i.pct));
        let html = '<div class="progress-list">';
        data.indList.slice(0, 6).forEach(ind => {
            const isWarn = ind.pct > 40;
            const widthPct = maxPct > 0 ? (ind.pct / maxPct * 100) : 0;
            html += `<div class="progress-row"><span class="progress-label">${ind.name}</span><div class="progress-track"><div class="progress-fill ${isWarn?'warn':'safe'}" style="width:${widthPct}%;"></div></div><span class="progress-pct">${ind.pct.toFixed(1)}%</span></div>`;
        });
        html += '</div>';
        if (data.warnings.length) {
            html += '<div class="warnings-area">';
            data.warnings.forEach(w => { html += `<div class="warning-card"><svg viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2z"/></svg><span>${w}</span></div>`; });
            html += '</div>';
        }
        if (settingsWarnings) settingsWarnings.innerHTML = html;
    }

    /* ── 持仓列表渲染 ── */
    const HOLD_SORT_MODES = ['market-desc', 'market-asc'];
    const HOLD_SORT_LABELS = { 'market-asc': '市值升序', 'market-desc': '市值降序' };

    function getSortedHoldingsCodes() {
        const codes = Object.keys(holdings);
        const arr = codes.map(code => {
            const h = holdings[code];
            const d = fundDataCache[code] || {};
            const updated = isUpdated(code);
            const inTrading = isTradingTime();
            const shares = parseFloat(h.shares) || 0;
            let nav = 0;
            if (updated) nav = parseFloat(d.actualNav) || 0;
            else if (inTrading) nav = parseFloat(d.gsz) || 0;
            else nav = parseFloat(d.actualNav) || parseFloat(d.gsz) || 0;
            return { code, marketValue: nav * shares };
        });
        arr.sort((a, b) => holdSortMode === 'market-asc' ? a.marketValue - b.marketValue : b.marketValue - a.marketValue);
        return arr.map(i => i.code);
    }

    function getCardData(code) {
        const h = holdings[code];
        const d = fundDataCache[code] || {};
        const updated = isUpdated(code);
        const inTrading = isTradingTime();
        const cost = parseFloat(h.cost) || 0;
        const shares = parseFloat(h.shares) || 0;
        let currentNav, dayRate;
        if (updated) {
            currentNav = parseFloat(d.actualNav) || 0;
            dayRate = d.actualRate != null ? parseFloat(d.actualRate) : 0;
        } else if (inTrading) {
            currentNav = parseFloat(d.gsz) || 0;
            dayRate = parseFloat(d.gszzl) || 0;
        } else {
            const estNav = parseFloat(d.gsz);
            const actNav = parseFloat(d.actualNav);
            if (estNav > 0) { currentNav = estNav; dayRate = parseFloat(d.gszzl) || 0; }
            else if (actNav > 0) { currentNav = actNav; dayRate = d.actualRate != null ? parseFloat(d.actualRate) : 0; }
            else { currentNav = 0; dayRate = 0; }
        }
        const marketValue = currentNav * shares;
        const rate = (dayRate != null && !isNaN(dayRate)) ? (dayRate / 100) : 0;
        const prevNav = rate !== 0 ? (currentNav / (1 + rate)) : currentNav;
        const dayProfit = shares * prevNav * rate;
        const totalP = (currentNav - cost) * shares;
        const totalYieldRate = (cost && currentNav) ? ((currentNav - cost) / cost * 100) : 0;
        const cls = dayRate > 0 ? 'up' : (dayRate < 0 ? 'down' : 'zero');
        const dotClass = updated ? 'updated' : 'pending';
        return { name: h.name || d.name || code, code, marketValue, dayRate, dayProfit, totalP, totalYieldRate, cls, dotClass };
    }

    function buildCardHTML(data) {
        const profitClass = (v) => v > 0 ? 'profit-positive' : (v < 0 ? 'profit-negative' : 'neutral');
        return `<div class="holding-card ${data.cls}" data-code="${data.code}">
            <div class="holding-header">
                <div class="holding-header-left">
                    <span class="update-dot ${data.dotClass}"></span>
                    <span class="holding-name">${escapeHTML(data.name)}</span>
                    <span class="holding-code">${data.code}</span>
                </div>
                <span class="holding-amount">${data.marketValue.toFixed(2)}</span>
            </div>
            <div class="metrics-row">
                <div class="metric-card"><span class="metric-label">今日涨幅</span><span class="metric-value ${profitClass(data.dayRate)}">${data.dayRate>=0?'+':''}${data.dayRate.toFixed(2)}%</span></div>
                <div class="metric-card"><span class="metric-label">日收益</span><span class="metric-value ${profitClass(data.dayProfit)}">${formatMoney(data.dayProfit)}</span></div>
                <div class="metric-card"><span class="metric-label">持有收益</span><span class="metric-value ${profitClass(data.totalP)}">${formatMoney(data.totalP)}</span></div>
                <div class="metric-card"><span class="metric-label">持有收益率</span><span class="metric-value ${profitClass(data.totalYieldRate)}">${data.totalYieldRate>=0?'+':''}${data.totalYieldRate.toFixed(2)}%</span></div>
            </div>
            <div class="trend-chart-wrapper" id="trend-${data.code}"><div class="chart-container"><canvas id="trendCanvas-${data.code}"></canvas></div></div>
        </div>`;
    }

    function updateCardInPlace(card, data) {
        card.className = 'holding-card ' + data.cls;
        const dot = card.querySelector('.update-dot');
        if (dot) { dot.className = 'update-dot ' + data.dotClass; }
        const nameEl = card.querySelector('.holding-name');
        if (nameEl) nameEl.textContent = data.name;
        const amountEl = card.querySelector('.holding-amount');
        if (amountEl) amountEl.textContent = data.marketValue.toFixed(2);
        const metricValues = card.querySelectorAll('.metric-value');
        if (metricValues.length >= 4) {
            const profitClass = (v) => v > 0 ? 'profit-positive' : (v < 0 ? 'profit-negative' : 'neutral');
            metricValues[0].textContent = (data.dayRate >= 0 ? '+' : '') + data.dayRate.toFixed(2) + '%';
            metricValues[0].className = 'metric-value ' + profitClass(data.dayRate);
            metricValues[1].textContent = formatMoney(data.dayProfit);
            metricValues[1].className = 'metric-value ' + profitClass(data.dayProfit);
            metricValues[2].textContent = formatMoney(data.totalP);
            metricValues[2].className = 'metric-value ' + profitClass(data.totalP);
            metricValues[3].textContent = (data.totalYieldRate >= 0 ? '+' : '') + data.totalYieldRate.toFixed(2) + '%';
            metricValues[3].className = 'metric-value ' + profitClass(data.totalYieldRate);
        }
    }

    function renderHoldings(forceRefresh = false) {
        Object.keys(trendCharts).forEach(code => {
            if (trendCharts[code]) { trendCharts[code].destroy(); delete trendCharts[code]; }
        });
        const codes = getSortedHoldingsCodes();
        if (!codes.length) {
            holdingsList.innerHTML = '<div class="empty-state">暂无持仓，点击右上角菜单添加</div>';
            updateSummary({ totalAsset: 0, todayProfit: 0, totalProfit: 0, totalCost: 0, totalYieldRate: 0 });
            return;
        }
        const existingCards = [...holdingsList.querySelectorAll('.holding-card')];
        const existingCodes = existingCards.map(c => c.dataset.code);
        const sortChanged = lastHoldSortMode !== holdSortMode;
        lastHoldSortMode = holdSortMode;
        if (!forceRefresh && !sortChanged && existingCodes.length === codes.length && existingCodes.every((c, i) => c === codes[i])) {
            existingCards.forEach(card => { const code = card.dataset.code; const data = getCardData(code); updateCardInPlace(card, data); });
            const summary = computeSummary();
            updateSummary(summary);
            appendAccountHistory();
            renderAccountTrendChart();
            return;
        }
        const html = codes.map(code => buildCardHTML(getCardData(code))).join('');
        holdingsList.innerHTML = html;
        bindHoldingCardEvents();
        const summary = computeSummary();
        updateSummary(summary);
        saveCacheThrottled();
        appendAccountHistory();
        renderAccountTrendChart();
    }

    function bindHoldingCardEvents() {
        document.querySelectorAll('#holdingsList .holding-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (isBulkEditing) return;
                if (e.target.closest('.edit-controls') || e.target.closest('input')) return;
                const code = card.dataset.code;
                const wrapper = card.querySelector(`#trend-${code}`);
                if (wrapper) {
                    if (wrapper.classList.contains('expanded')) {
                        wrapper.classList.remove('expanded');
                        if (trendCharts[code]) { trendCharts[code].destroy(); delete trendCharts[code]; }
                    } else {
                        Object.keys(trendCharts).forEach(c => {
                            if (c !== code && trendCharts[c]) { trendCharts[c].destroy(); delete trendCharts[c]; const otherWrapper = document.getElementById('trend-' + c); if (otherWrapper) otherWrapper.classList.remove('expanded'); }
                        });
                        wrapper.classList.add('expanded');
                        loadTrendChart(code);
                    }
                }
            });
        });
    }

    /* ── 趋势图 ── */
    function fetchTrendDataFromScript(code) {
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = `https://fund.eastmoney.com/pingzhongdata/${code}.js`;
            script.onload = () => {
                const raw = window.Data_netWorthTrend;
                if (raw && raw.length > 0) {
                    const recent = raw.slice(-20);
                    const dates = recent.map(item => { const d = new Date(item.x); return `${d.getMonth()+1}/${d.getDate()}`; });
                    const navs = recent.map(item => item.y);
                    resolve({ dates, navs });
                } else { resolve(null); }
                script.remove();
            };
            script.onerror = () => { script.remove(); resolve(null); };
            document.head.appendChild(script);
        });
    }

    async function loadTrendChart(code) {
        const canvas = document.getElementById(`trendCanvas-${code}`);
        if (!canvas) return;
        if (trendCharts[code]) trendCharts[code].destroy();
        const cacheKey = `trend_${code}`;
        let trendData = null;
        try { const cached = sessionStorage.getItem(cacheKey); if (cached) trendData = JSON.parse(cached); } catch (e) {}
        if (!trendData) {
            trendData = await fetchTrendDataFromScript(code);
            if (trendData) try { sessionStorage.setItem(cacheKey, JSON.stringify(trendData)); } catch (e) {}
        }
        if (!trendData) {
            const wrapper = document.getElementById(`trend-${code}`);
            if (wrapper) wrapper.innerHTML = '<div class="trend-error">暂无历史数据</div>';
            if (trendCharts[code]) { trendCharts[code].destroy(); delete trendCharts[code]; }
            return;
        }
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 200);
        gradient.addColorStop(0, 'rgba(0,206,202,0.3)');
        gradient.addColorStop(1, 'rgba(0,206,202,0.0)');
        const axisColor = getCurrentThemeColor('--text-tertiary');
        const gridColor = getCurrentThemeColor('--border-subtle');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: trendData.dates,
                datasets: [{
                    data: trendData.navs,
                    borderColor: '#00CECA',
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: axisColor, font: { size: 9 }, maxTicksLimit: 5 }, grid: { color: gridColor } },
                    y: { ticks: { color: axisColor, font: { size: 9 }, callback: v => v.toFixed(3) }, grid: { color: gridColor } }
                }
            }
        });
        trendCharts[code] = chart;
    }

    /* ── 页面切换 ── */
    function switchPage(page) {
        if (watchlistPage.classList.contains('active') && page !== 'watchlist' && isEditMode) { exitEditMode(); }
        if (holdingsPage.classList.contains('active') && page !== 'holdings' && isBulkEditing) { exitBulkEditMode(); }
        watchlistPage.classList.toggle('active', page === 'watchlist');
        holdingsPage.classList.toggle('active', page === 'holdings');
        settingsPage.classList.toggle('active', page === 'settings');
        const idx = { watchlist: 0, holdings: 1, settings: 2 }[page];
        document.querySelectorAll('.bottom-nav .nav-item').forEach((n, i) => n.classList.toggle('active', i === idx));
        navSlider.className = 'bottom-nav-slider pos-' + idx;
        if (page === 'holdings') { renderHoldings(false); renderSettingsWarnings(); }
        closeAllMenus();
    }

    /* ── 菜单 ── */
    function positionMenu(menuEl, btnEl) {
        const btnRect = btnEl.getBoundingClientRect();
        const menuHeight = menuEl.scrollHeight || 200;
        const spaceBelow = window.innerHeight - btnRect.bottom;
        if (spaceBelow < menuHeight + 20) {
            menuEl.style.bottom = (window.innerHeight - btnRect.top + 8) + 'px';
            menuEl.style.top = 'auto';
        } else {
            menuEl.style.top = btnRect.bottom + 8 + 'px';
            menuEl.style.bottom = 'auto';
        }
        const rightPos = window.innerWidth - btnRect.right;
        menuEl.style.right = rightPos + 'px';
        menuEl.style.left = 'auto';
    }

    function toggleMenu(menuEl, btnEl) {
        const isActive = menuEl.classList.contains('active');
        closeAllMenus();
        if (!isActive) { positionMenu(menuEl, btnEl); menuEl.classList.add('active'); btnEl.classList.add('edit-active'); }
    }

    function closeAllMenus() {
        [menuWatchlist, menuHoldings].forEach(m => m.classList.remove('active'));
        [btnMoreWatchlist, btnMoreHoldings].forEach(b => b.classList.remove('edit-active'));
    }

    /* ── 编辑状态 ── */
    function updateMenuButtonState() {
        if (isEditMode) {
            btnMoreWatchlist.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            btnMoreWatchlist.title = "完成排序";
        } else {
            btnMoreWatchlist.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="19" r="2.5"/></svg>';
            btnMoreWatchlist.title = "更多";
        }
        if (isBulkEditing) {
            btnMoreHoldings.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            btnMoreHoldings.title = "完成编辑";
        } else {
            btnMoreHoldings.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="19" r="2.5"/></svg>';
            btnMoreHoldings.title = "更多";
        }
    }

    function enterEditMode() { isEditMode = true; editLabel.textContent = '保存排序'; updateMenuButtonState(); renderWatchlist(); }
    function exitEditMode() { isEditMode = false; editLabel.textContent = '手动排序'; saveManualOrder(); updateMenuButtonState(); renderWatchlist(); }
    function enterBulkEditMode() {
        isBulkEditing = true;
        bulkEditLabel.textContent = '保存编辑';
        updateMenuButtonState();
        document.querySelectorAll('#holdingsList .holding-card').forEach(card => {
            const code = card.dataset.code;
            const h = holdings[code];
            const metrics = card.querySelector('.metrics-row');
            if (metrics) metrics.style.display = 'none';
            let editDiv = card.querySelector('.edit-controls');
            if (!editDiv) { editDiv = document.createElement('div'); editDiv.className = 'edit-controls'; card.appendChild(editDiv); }
            editDiv.innerHTML = `<input type="number" class="edit-cost" value="${h.cost}" step="any" inputmode="decimal" placeholder="成本"><input type="number" class="edit-shares" value="${h.shares}" step="any" inputmode="decimal" placeholder="份额"><button class="btn danger edit-delete-btn">删除</button>`;
            editDiv.querySelector('.edit-delete-btn').onclick = (e) => {
                e.stopPropagation();
                showModal('确认删除', '该持仓将被移除，不可恢复。', 'warning', [
                    { text: '取消', cls: '' },
                    { text: '删除', cls: 'danger', action: () => { delete holdings[code]; saveHoldings(); isBulkEditing = false; bulkEditLabel.textContent = '批量编辑'; updateMenuButtonState(); renderHoldings(false); showToast('已删除'); } }
                ]);
            };
        });
    }
    function exitBulkEditMode() {
        let changed = false;
        document.querySelectorAll('#holdingsList .holding-card').forEach(card => {
            const code = card.dataset.code;
            const costInput = card.querySelector('.edit-cost'), shareInput = card.querySelector('.edit-shares');
            if (costInput && shareInput) {
                const cost = parseFloat(costInput.value), shares = parseFloat(shareInput.value);
                if (!isNaN(cost) && cost > 0 && !isNaN(shares) && shares > 0) {
                    if (holdings[code].cost !== cost || holdings[code].shares !== shares) changed = true;
                    holdings[code] = { cost, shares, name: holdings[code]?.name || '' };
                }
            }
            card.querySelector('.edit-controls')?.remove();
            card.querySelector('.metrics-row').style.display = '';
        });
        saveHoldings();
        isBulkEditing = false;
        bulkEditLabel.textContent = '批量编辑';
        updateMenuButtonState();
        renderHoldings(false);
        if (changed) showToast('批量保存成功');
    }

    /* ── 添加/删除/同步 ── */
    async function addWatchlist(code) {
        code = String(code).trim();
        if (!/^\d{6}$/.test(code)) return showToast('请输入6位数字代码','error');
        if (watchlist.includes(code)) return showToast('已存在','error');
        try {
            const data = await fetchSingle(code);
            if (data && data.name) {
                watchlist.push(code);
                saveWatchlist();
                if (!manualOrder.includes(code)) { manualOrder.push(code); saveManualOrder(); }
                fundDataCache[code] = { ...fundDataCache[code], name: data.name };
                renderWatchlist();
                showToast(`已添加 ${data.name}`, 'success');
            } else {
                showToast('无效的基金代码', 'error');
            }
        } catch (e) {
            showToast('无效的基金代码', 'error');
        }
    }

    function removeWatchlist(code) {
        const i = watchlist.indexOf(code);
        if (i < 0) return;
        watchlist.splice(i, 1);
        saveWatchlist();
        delete fundDataCache[code];
        saveCache();
        manualOrder = manualOrder.filter(c => c !== code);
        saveManualOrder();
        if (openedSwipe) { closeSwipe(openedSwipe); openedSwipe = null; }
        renderWatchlist();
        scheduleRefresh(false);
        showToast('已移除');
    }

    function syncHoldingsToWatchlist() {
        const codes = Object.keys(holdings);
        if (!codes.length) return showToast('没有持仓可同步','error');
        let added = 0;
        codes.forEach(c => { if (!watchlist.includes(c)) { watchlist.push(c); if (!manualOrder.includes(c)) manualOrder.push(c); added++; } });
        if (!added) return showToast('持仓已在自选中');
        saveWatchlist();
        saveManualOrder();
        renderWatchlist();
        codes.forEach(c => { if (!fundDataCache[c]) fetchAndUpdate(c); });
        scheduleRefresh(false);
        showToast(`已同步 ${added} 只基金`);
    }

    /* ── 全局刷新 ── */
    async function fetchAllFunds() {
        const all = [...new Set([...watchlist, ...Object.keys(holdings)])];
        if (!all.length) { renderWatchlist(); renderHoldings(); return; }
        const changedSet = new Set();
        const queue = [...all];
        const tasks = [];
        while (queue.length) {
            const batch = queue.splice(0, MAX_CON);
            tasks.push(...batch.map(async code => { const changed = await fetchAndUpdate(code); if (changed) changedSet.add(code); }));
            await Promise.allSettled(tasks);
            tasks.length = 0;
        }
        saveCacheThrottled();
        if (changedSet.size > 0) { for (const code of changedSet) { if (watchlist.includes(code)) updateWatchlistCard(code); } }
        renderHoldings(false);
        updateTimeDisplay();
    }

    function refreshAllData(isAuto = false) { return fetchAllFunds().then(() => { scheduleRefresh(isAuto); }); }

    /* ── 时间显示 ── */
    function updateTimeDisplay() {
        const now = new Date();
        const ts = now.toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        headerTime.textContent = ts;
        holdingsUpdateTime.textContent = ts;
    }

    /* ── Toast ── */
    function showToast(msg, type = '') {
        clearTimeout(toastTimer);
        toast.textContent = msg;
        toast.className = 'toast ' + type + ' show';
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
    }

    /* ── 模态弹窗 ── */
    function showModal(title, desc, iconType, buttons) {
        modalTitle.textContent = title;
        modalDesc.textContent = desc;
        modalButtons.innerHTML = '';
        let iconHTML = '';
        if (iconType === 'success') iconHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
        else if (iconType === 'warning') iconHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        else iconHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
        modalIcon.innerHTML = iconHTML;
        buttons.forEach(btn => {
            const btnEl = document.createElement('button');
            btnEl.className = 'modal-btn ' + (btn.cls || '');
            btnEl.textContent = btn.text;
            btnEl.onclick = () => { closeModal(); if (btn.action) btn.action(); };
            modalButtons.appendChild(btnEl);
        });
        modalOverlay.classList.add('active');
    }

    function closeModal() { modalOverlay.classList.remove('active'); }

    /* ── 配置导入/导出 ── */
    function getConfigJSON() { return JSON.stringify({ watchlist, holdings, manualOrder, accountProfitHistory, fundDataCache }, null, 2); }

    window.exportConfig = function() {
        const data = getConfigJSON();
        const blob = new Blob([data], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'capsule_config.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        showModal('导出成功', '配置文件已保存为 capsule_config.json，可在手机下载目录中查看。', 'success', [{ text: '知道了', cls: 'primary' }]);
    };

    window.copyConfig = function() {
        const data = getConfigJSON();
        if (navigator.clipboard) {
            navigator.clipboard.writeText(data).then(() => { showModal('复制成功', '配置已复制到剪贴板，可粘贴到备忘录或发送给朋友。', 'success', [{ text: '知道了', cls: 'primary' }]); });
        } else {
            const ta = document.createElement('textarea'); ta.value = data; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
            showModal('复制成功', '配置已复制到剪贴板。', 'success', [{ text: '知道了', cls: 'primary' }]);
        }
    };

    window.importConfig = function() { importFile.click(); };

    importFile.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                if (Array.isArray(data.watchlist) && data.watchlist.every(c => typeof c === 'string')) { watchlist = data.watchlist; saveWatchlist(); }
                if (data.holdings && typeof data.holdings === 'object' && Object.values(data.holdings).every(h => typeof h === 'object' && h !== null)) { holdings = data.holdings; saveHoldings(); }
                if (Array.isArray(data.manualOrder) && data.manualOrder.every(c => typeof c === 'string')) { manualOrder = data.manualOrder; saveManualOrder(); }
                if (Array.isArray(data.accountProfitHistory) && data.accountProfitHistory.every(i => typeof i === 'object' && i.date && typeof i.profit === 'number')) { accountProfitHistory = data.accountProfitHistory; saveAccountHistory(); }
                if (data.fundDataCache && typeof data.fundDataCache === 'object') { fundDataCache = data.fundDataCache; saveCache(); }
                renderWatchlist(); renderHoldings(false); refreshAllData(false);
                showModal('导入成功', '自选和持仓数据已恢复，建议刷新获取最新净值。', 'success', [{ text: '知道了', cls: 'primary' }]);
            } catch { showModal('导入失败', '文件格式错误或内容损坏，请重试。', 'warning', [{ text: '知道了', cls: '' }]); }
        };
        reader.readAsText(file);
        importFile.value = '';
    });

    window.resetProfitHistory = function() {
        showModal('确认重置', '此操作将清空所有历史收益数据，不可恢复。', 'warning', [
            { text: '取消', cls: '' },
            { text: '确认重置', cls: 'danger', action: () => { accountProfitHistory = []; saveAccountHistory(); if (accountTrendChart) { accountTrendChart.destroy(); accountTrendChart = null; } renderAccountTrendChart(); showToast('收益历史已重置'); } }
        ]);
    };

    /* ── 滑动删除 ── */
    function closeSwipe(wrapper) {
        if (!wrapper) return;
        wrapper.querySelector('.swipe-content').style.transform = 'translateX(0)';
        wrapper.querySelector('.swipe-delete')?.classList.remove('active');
    }

    /* ── 数据源诊断 ── */
    const TEST_FUND = '000001';
    function setDiag(id, dotClass, text) {
        const dot = document.getElementById('dot' + id);
        const txt = document.getElementById('txt' + id);
        if (dot) { dot.className = 'status-dot ' + dotClass; }
        if (txt) { txt.textContent = text || ''; }
    }
    async function runDiag() {
        const btn = document.getElementById('btnDiagRefresh');
        if (btn) btn.classList.add('refreshing');
        setDiag('Fund', 'yellow', '检测中…'); setDiag('Tx', 'yellow', '检测中…'); setDiag('Index', 'yellow', '检测中…');
        try {
            const data = await fetchSingle(TEST_FUND);
            const today = new Date().toISOString().slice(0, 10);
            if (data.gsz && (data.jzrq || '').trim() === today) { setDiag('Fund', 'green', '正常'); }
            else if (data.gsz) { setDiag('Fund', 'yellow', '延迟'); }
            else { setDiag('Fund', 'yellow', '延迟'); }
        } catch { setDiag('Fund', 'red', '失败'); }
        try {
            const resp = await fetch(`https://qt.gtimg.cn/q=jj${TEST_FUND}`);
            const text = await resp.text();
            const match = text.match(/"([^"]+)"/);
            if (match) {
                const fields = match[1].split('~');
                const name = fields[1] || '';
                const nav = fields[5] || '';
                if (name && nav && parseFloat(nav) > 0) { setDiag('Tx', 'green', '正常'); }
                else { setDiag('Tx', 'yellow', '延迟'); }
            } else { setDiag('Tx', 'red', '失败'); }
        } catch { setDiag('Tx', 'red', '失败'); }
        try {
            const resp = await fetch('https://qt.gtimg.cn/q=s_sh000001');
            const text = await resp.text();
            const m = text.match(/v_s_(\w+)="(.+)"/);
            if (m) {
                const price = parseFloat(m[2].split('~')[3]);
                if (!isNaN(price) && price > 0) { setDiag('Index', 'green', '正常'); }
                else { setDiag('Index', 'red', '失败'); }
            } else { setDiag('Index', 'red', '失败'); }
        } catch { setDiag('Index', 'red', '失败'); }
        if (btn) btn.classList.remove('refreshing');
    }
    window.runDiag = runDiag;

    /* ── 事件绑定 ── */
    bottomNav.addEventListener('click', e => { const item = e.target.closest('.nav-item'); if (!item) return; switchPage(item.dataset.page); });

    summaryToggle.addEventListener('click', () => { toggleCollapse(summaryToggle, summaryContent); const isExpanded = summaryContent.classList.contains('expanded'); if (!isExpanded) appendAccountHistory(); renderAccountTrendChart(); });
    indexToggle.addEventListener('click', () => { toggleCollapse(indexToggle, indexGridContainer); });

    function toggleCollapse(toggleBtn, contentEl) {
        if (!contentEl.classList.contains('collapsible')) return;
        const isOpen = contentEl.classList.contains('expanded');
        if (isOpen) {
            contentEl.style.height = contentEl.scrollHeight + 'px';
            requestAnimationFrame(() => { contentEl.style.height = '0px'; });
            contentEl.classList.remove('expanded');
            toggleBtn?.classList.remove('expanded');
        } else {
            contentEl.style.height = '0px';
            const h = contentEl.scrollHeight + 'px';
            requestAnimationFrame(() => { contentEl.style.height = h; });
            contentEl.classList.add('expanded');
            toggleBtn?.classList.add('expanded');
        }
    }

    window.toggleCard = function(id) {
        const card = document.getElementById(id);
        const content = card.querySelector('.collapsible');
        const toggle = card.querySelector('.card-toggle');
        if (content) toggleCollapse(toggle, content);
    };

    document.addEventListener('click', (e) => { if (!e.target.closest('.menu-dropdown') && !e.target.closest('.btn-icon')) closeAllMenus(); });
    btnMoreWatchlist.addEventListener('click', (e) => { e.stopPropagation(); if (isEditMode) { exitEditMode(); return; } toggleMenu(menuWatchlist, btnMoreWatchlist); });
    btnMoreHoldings.addEventListener('click', (e) => { e.stopPropagation(); if (isBulkEditing) { exitBulkEditMode(); return; } toggleMenu(menuHoldings, btnMoreHoldings); });

    menuWatchlist.addEventListener('click', (e) => {
        const action = e.target.closest('.menu-item')?.dataset.action; if (!action) return;
        closeAllMenus();
        if (action === 'add') { overlay.classList.add('active'); bottomSheet.classList.add('active'); inputCode.value = ''; inputCode.focus(); }
        else if (action === 'syncHoldings') syncHoldingsToWatchlist();
        else if (action === 'sort') { const modes = ['change-desc','change-asc','manual']; const idx = modes.indexOf(sortMode); sortMode = modes[(idx+1)%3]; document.getElementById('sortCheck').textContent = {'change-desc':'跌幅降序','change-asc':'涨幅升序','manual':'手动'}[sortMode]; renderWatchlist(); }
        else if (action === 'edit') { if (isEditMode) exitEditMode(); else enterEditMode(); }
    });

    menuHoldings.addEventListener('click', (e) => {
        const action = e.target.closest('.menu-item')?.dataset.action; if (!action) return;
        if (action === 'add') { closeAllMenus(); overlay.classList.add('active'); holdingSheet.classList.add('active'); holdingCode.value = ''; holdingCost.value = ''; holdingShares.value = ''; }
        else if (action === 'sort') { const idx = HOLD_SORT_MODES.indexOf(holdSortMode); holdSortMode = HOLD_SORT_MODES[(idx+1)%HOLD_SORT_MODES.length]; document.getElementById('holdSortCheck').textContent = HOLD_SORT_LABELS[holdSortMode]; closeAllMenus(); renderHoldings(true); }
        else if (action === 'bulkEdit') { if (isBulkEditing) exitBulkEditMode(); else enterBulkEditMode(); closeAllMenus(); }
        else if (action === 'clearCache') { closeAllMenus(); localStorage.removeItem(CACHE_KEY); fundDataCache = {}; showToast('数据缓存已清除，刷新中...'); refreshAllData(false); }
    });

    overlay.addEventListener('click', () => { overlay.classList.remove('active'); bottomSheet.classList.remove('active'); holdingSheet.classList.remove('active'); });
    btnConfirmAdd.addEventListener('click', () => { const code = inputCode.value.trim(); addWatchlist(code).then(() => { overlay.classList.remove('active'); bottomSheet.classList.remove('active'); }); });
    confirmAddHoldingSheet.addEventListener('click', async () => {
        const code = holdingCode.value.trim();
        const cost = parseFloat(holdingCost.value);
        const shares = parseFloat(holdingShares.value);
        if (!/^\d{6}$/.test(code)) return showToast('请输入6位代码','error');
        if (isNaN(cost) || isNaN(shares)) return showToast('请填写完整','error');
        if (!fundDataCache[code] || !fundDataCache[code].name) {
            try { const data = await fetchSingle(code); if (data && data.name) { fundDataCache[code] = { ...fundDataCache[code], name: cleanName(data.name) }; } else { return showToast('无效的基金代码','error'); } } catch (e) { return showToast('无效的基金代码','error'); }
        }
        holdings[code] = { name: fundDataCache[code]?.name || '', cost, shares };
        saveHoldings();
        overlay.classList.remove('active');
        holdingSheet.classList.remove('active');
        renderHoldings(false);
        showToast('已添加持仓');
    });

    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

    fundList.addEventListener('touchstart', (e) => {
        if (isEditMode || isBulkEditing) return;
        const wrapper = e.target.closest('.swipe-wrapper'); if (!wrapper) return;
        if (openedSwipe && openedSwipe !== wrapper) { closeSwipe(openedSwipe); openedSwipe = null; }
        const t = e.touches[0]; swipeStartX = t.clientX; swipeStartY = t.clientY; swipeCurrentX = 0; isSwiping = false;
    }, { passive: false });

    fundList.addEventListener('touchmove', (e) => {
        if (isEditMode || isBulkEditing) return;
        const wrapper = e.target.closest('.swipe-wrapper'); if (!wrapper) return;
        const t = e.touches[0]; const dx = t.clientX - swipeStartX, dy = t.clientY - swipeStartY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 20) {
            e.preventDefault(); isSwiping = true;
            swipeCurrentX = Math.min(0, Math.max(-80, dx));
            const content = wrapper.querySelector('.swipe-content'); if (content) content.style.transform = `translateX(${swipeCurrentX}px)`;
            const delBtn = wrapper.querySelector('.swipe-delete'); if (delBtn) delBtn.classList.toggle('active', swipeCurrentX < -40);
        }
    }, { passive: false });

    fundList.addEventListener('touchend', (e) => {
        if (isEditMode || isBulkEditing) return;
        const wrapper = e.target.closest('.swipe-wrapper'); if (!wrapper || !isSwiping) return;
        isSwiping = false;
        const content = wrapper.querySelector('.swipe-content');
        if (swipeCurrentX < -40) {
            if (content) content.style.transform = 'translateX(-80px)';
            wrapper.querySelector('.swipe-delete')?.classList.add('active');
            if (openedSwipe && openedSwipe !== wrapper) closeSwipe(openedSwipe);
            openedSwipe = wrapper;
        } else {
            if (content) content.style.transform = 'translateX(0)';
            wrapper.querySelector('.swipe-delete')?.classList.remove('active');
            openedSwipe = null;
        }
    });

    fundList.addEventListener('click', (e) => {
        if (isEditMode || isBulkEditing) return;
        const delBtn = e.target.closest('.swipe-delete');
        if (delBtn && delBtn.classList.contains('active')) {
            const wrapper = delBtn.closest('.swipe-wrapper');
            if (wrapper) { removeWatchlist(wrapper.dataset.code); openedSwipe = null; }
        }
    });

    document.addEventListener('touchstart', (e) => {
        if (isEditMode || isBulkEditing) return;
        if (openedSwipe && !e.target.closest('.swipe-wrapper')) { closeSwipe(openedSwipe); openedSwipe = null; }
    }, { passive: true });

    btnRefreshWatchlist.addEventListener('click', (e) => { e.stopPropagation(); manualRefresh(); });
    btnRefreshHoldings.addEventListener('click', (e) => { e.stopPropagation(); manualRefresh(); });

    function startRefreshAnimation(btn) { if (!btn) return; btn.classList.add('refreshing'); }
    function stopRefreshAnimation(btn) { if (!btn) return; btn.classList.remove('refreshing'); }
    function flashTime(el) { if (!el) return; el.classList.remove('time-flash'); void el.offsetWidth; el.classList.add('time-flash'); }

    function manualRefresh() {
        const activePage = watchlistPage.classList.contains('active') ? 'watchlist' : 'holdings';
        const btn = activePage === 'watchlist' ? btnRefreshWatchlist : btnRefreshHoldings;
        startRefreshAnimation(btn);
        refreshAllData(false).then(() => {
            stopRefreshAnimation(btn);
            const timeEl = activePage === 'watchlist' ? headerTime : holdingsUpdateTime;
            flashTime(timeEl);
        }).catch(() => { stopRefreshAnimation(btn); showToast('刷新失败，请检查网络','error'); });
    }

    /* ── 彩蛋：点击标题显示/隐藏数据 ── */
    let easterClickCount = 0, easterTimer = null;
    $('holdingsHeaderTitle').addEventListener('click', (e) => {
        e.stopPropagation();
        easterClickCount++;
        if (easterClickCount >= 5) {
            easterClickCount = 0;
            summaryVisible = !summaryVisible;
            if (unlockHint) {
                unlockHint.textContent = summaryVisible ? '🔓 数据已显示' : '🔒 数据已隐藏';
                unlockHint.classList.add('show');
                setTimeout(() => unlockHint.classList.remove('show'), 1500);
            }
            const summary = computeSummary();
            updateSummary(summary);
            clearTimeout(easterTimer);
            return;
        }
        if (unlockHint) {
            unlockHint.textContent = `还需点击 ${5 - easterClickCount} 次`;
            unlockHint.classList.add('show');
            setTimeout(() => unlockHint.classList.remove('show'), 1500);
        }
        clearTimeout(easterTimer);
        easterTimer = setTimeout(() => { easterClickCount = 0; }, 2000);
    });

    window.addEventListener('resize', () => {
        if (menuWatchlist.classList.contains('active')) positionMenu(menuWatchlist, btnMoreWatchlist);
        if (menuHoldings.classList.contains('active')) positionMenu(menuHoldings, btnMoreHoldings);
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            refreshAllData(false);
            document.querySelectorAll('.skeleton').forEach(el => el.classList.remove('paused'));
            scheduleIndexRefresh();
            updateBreathing();
        } else {
            clearTimeout(refreshTimer);
            clearTimeout(wakeUpTimer);
            clearTimeout(indexTimer);
            document.querySelectorAll('.skeleton').forEach(el => el.classList.add('paused'));
        }
    });

    /* ── 初始化 ── */
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
    }

    initTheme();
    loadManualOrder(); loadWatchlist(); loadHoldings(); loadCache(); loadAccountHistory();
    if (Object.keys(holdings).length > 0) { summaryVisible = true; }
    renderWatchlist();
    if (Object.keys(holdings).length > 0) { renderHoldings(false); renderSettingsWarnings(); }
    refreshAllData(false).then(() => { updateTimeDisplay(); setInterval(updateTimeDisplay, 60000); updateBreathing(); });
    fetchIndexData();
    scheduleIndexRefresh();
    updateMenuButtonState();

})();