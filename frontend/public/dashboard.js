/* ============================================================
   TITÁN TERMINAL — dashboard.js
   Handles: login flow, real-time data polling, charts,
   remote commands, terminal logs, trades table.
   ============================================================ */

(() => {
    'use strict';

    const IS_LOGIN = document.body.classList.contains('login-body');
    const IS_DASHBOARD = document.body.classList.contains('dashboard-body');

    // ============================================================
    // LOGIN PAGE LOGIC
    // ============================================================
    if (IS_LOGIN) {
        // Spawn particles
        spawnParticles();

        const state = { platform: 'binance', env: 'testnet' };

        // Platform selector
        document.querySelectorAll('.platform-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.platform-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                state.platform = card.dataset.platform;
            });
        });

        // Env toggle
        const warningEl = document.getElementById('productionWarning');
        document.querySelectorAll('.env-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.env-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                state.env = opt.dataset.env;
                warningEl.classList.toggle('visible', state.env === 'production');
            });
        });

        // Secret visibility toggle
        const secretInput = document.getElementById('apiSecret');
        document.getElementById('toggleSecret').addEventListener('click', () => {
            secretInput.type = secretInput.type === 'password' ? 'text' : 'password';
        });

        // Submit
        const form = document.getElementById('loginForm');
        const submitBtn = document.getElementById('submitBtn');
        const statusEl = document.getElementById('formStatus');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const apiKey = document.getElementById('apiKey').value.trim();
            const apiSecret = document.getElementById('apiSecret').value.trim();

            if (!apiKey || !apiSecret) {
                showStatus('error', 'Please complete both API Key and Secret');
                return;
            }

            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            statusEl.textContent = '';
            statusEl.className = 'form-status';

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        platform: state.platform,
                        api_key: apiKey,
                        api_secret: apiSecret,
                        is_testnet: state.env === 'testnet'
                    })
                });
                const data = await res.json();

                if (res.ok && data.status === 'success') {
                    showStatus('success', '✓ Credentials encrypted — launching Titán…');
                    setTimeout(() => { window.location.href = '/titan.html'; }, 900);
                } else {
                    throw new Error(data.message || 'Authentication failed');
                }
            } catch (err) {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
                showStatus('error', '✗ ' + err.message);
            }
        });

        function showStatus(type, msg) {
            statusEl.className = 'form-status ' + type;
            statusEl.textContent = msg;
        }

        function spawnParticles() {
            const container = document.getElementById('particles');
            if (!container) return;
            for (let i = 0; i < 30; i++) {
                const p = document.createElement('div');
                p.className = 'particle';
                p.style.left = Math.random() * 100 + '%';
                p.style.animationDuration = (10 + Math.random() * 20) + 's';
                p.style.animationDelay = (Math.random() * 20) + 's';
                p.style.opacity = (0.2 + Math.random() * 0.6).toString();
                container.appendChild(p);
            }
        }

        return; // do not run dashboard logic
    }

    // ============================================================
    // DASHBOARD LOGIC
    // ============================================================
    if (!IS_DASHBOARD) return;

    const PALETTE = ['#00d2ff', '#9d50bb', '#00ff88', '#ff9f43', '#ff4d8d'];
    const POLL_INTERVAL = 5000;
    const startTime = Date.now();

    let equityChart = null;
    let donutChart = null;
    let equityHistory = [];
    let lastTradeIds = new Set();
    let consecutiveErrors = 0;

    // ----------- Charts -----------
    function initCharts() {
        Chart.defaults.font.family = "'JetBrains Mono', monospace";
        Chart.defaults.color = '#5d6679';
        Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';

        // Equity chart
        const ctx1 = document.getElementById('equityChart').getContext('2d');
        const grad = ctx1.createLinearGradient(0, 0, 0, 140);
        grad.addColorStop(0, 'rgba(0, 210, 255, 0.35)');
        grad.addColorStop(1, 'rgba(0, 210, 255, 0)');

        equityChart = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    borderColor: '#00d2ff',
                    backgroundColor: grad,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHoverBackgroundColor: '#00d2ff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 19, 28, 0.95)',
                        borderColor: 'rgba(0,210,255,0.4)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        titleColor: '#9aa4b8',
                        bodyColor: '#f3f6fb',
                        callbacks: { label: (ctx) => '  $' + Number(ctx.parsed.y).toFixed(2) }
                    }
                },
                scales: {
                    x: { display: false },
                    y: {
                        position: 'right',
                        grid: { color: 'rgba(255,255,255,0.04)' },
                        ticks: { font: { size: 9 }, color: '#3d4456', maxTicksLimit: 4,
                                 callback: (v) => '$' + Number(v).toFixed(0) }
                    }
                },
                interaction: { intersect: false, mode: 'index' },
                animation: { duration: 600, easing: 'easeOutCubic' }
            }
        });

        // Donut chart
        const ctx2 = document.getElementById('portfolioDonut').getContext('2d');
        donutChart = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: ['BTC', 'ETH', 'SOL', 'DOT', 'USDT'],
                datasets: [{
                    data: [40, 25, 15, 10, 10],
                    backgroundColor: PALETTE,
                    borderColor: 'rgba(5,7,10,0.9)',
                    borderWidth: 3,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 19, 28, 0.95)',
                        borderColor: 'rgba(0,210,255,0.4)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: { label: (ctx) => '  ' + ctx.label + ': ' + ctx.parsed.toFixed(1) + '%' }
                    }
                },
                animation: { duration: 800, easing: 'easeOutCubic' }
            }
        });

        renderWeights([0.4, 0.25, 0.15, 0.1, 0.1]);
    }

    function renderWeights(weights) {
        const labels = ['BTC', 'ETH', 'SOL', 'DOT', 'USDT'];
        const wrap = document.getElementById('weightsList');
        if (!wrap) return;
        wrap.innerHTML = '';
        weights.forEach((w, i) => {
            const pct = (w * 100).toFixed(1);
            const row = document.createElement('div');
            row.className = 'weight-row';
            row.innerHTML = `
                <span class="weight-dot" style="background:${PALETTE[i]};box-shadow:0 0 8px ${PALETTE[i]}"></span>
                <span class="weight-symbol">${labels[i] || 'A' + i}</span>
                <div class="weight-bar"><div class="weight-bar-fill" style="width:${pct}%;background:${PALETTE[i]}"></div></div>
                <span class="weight-pct">${pct}%</span>
            `;
            wrap.appendChild(row);
        });
    }

    // ----------- Data polling -----------
    async function poll() {
        const t0 = performance.now();
        try {
            const res = await fetch('dashboard_data.json?_=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            const latency = Math.round(performance.now() - t0);
            updateUI(data, latency);
            if (consecutiveErrors > 0) {
                appendLog('INFO', 'Bot data stream re-established');
            }
            consecutiveErrors = 0;
        } catch (err) {
            consecutiveErrors++;
            if (consecutiveErrors === 1) {
                appendLog('WARNING', 'Awaiting bot data stream — ' + err.message);
            }
            // Keep UI in zero/idle state — do NOT generate fake data.
            // The bot must write real values into dashboard/dashboard_data.json
            setText('pillLatency', '— ms');
        }
    }

    function updateUI(d, latency) {
        // Header pills
        setText('pillMarket', d.status?.market || '—');

        const riskLevel = (d.status?.risk_level || 'LOW').toUpperCase();
        const pillRisk = document.getElementById('pillRisk');
        setText('pillRiskValue', riskLevel);
        pillRisk.className = 'status-pill ' + riskClass(riskLevel);

        const authOk = (d.status?.auth || 'OK') === 'OK';
        setText('pillAuth', authOk ? 'OK' : 'ERR');

        setText('pillUptime', formatUptime(Date.now() - startTime));
        setText('pillLatency', latency + ' ms');

        // Portfolio
        const balance = d.portfolio?.balance ?? 0;
        setText('balanceValue', formatMoney(balance));
        const change = d.portfolio?.change ?? 0;
        const changeEl = document.getElementById('balanceChange');
        const changeText = document.getElementById('balanceChangeText');
        changeText.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
        changeEl.classList.toggle('negative', change < 0);

        setText('metricSharpe', (d.portfolio?.sharpe ?? '—').toString());
        setText('metricWinRate', d.portfolio?.win_rate != null ? d.portfolio.win_rate.toFixed(1) + '%' : '—');
        setText('metricTrades', d.portfolio?.trades ?? '—');

        // Equity chart
        equityHistory.push(balance);
        if (equityHistory.length > 60) equityHistory.shift();
        equityChart.data.labels = equityHistory.map((_, i) => i);
        equityChart.data.datasets[0].data = [...equityHistory];
        equityChart.update('none');

        // Donut
        if (d.portfolio?.weights && Array.isArray(d.portfolio.weights)) {
            const w = d.portfolio.weights;
            donutChart.data.datasets[0].data = w.map(x => x * 100);
            donutChart.update('none');
            renderWeights(w);
        }

        // Intelligence
        const dec = (d.intelligence?.decision || 'HOLD').toUpperCase();
        const decEl = document.getElementById('decisionValue');
        decEl.textContent = dec;
        decEl.className = 'decision-value ' + dec.toLowerCase();

        const conf = (d.intelligence?.confidence ?? 0) * 100;
        setText('decisionConfidence', conf.toFixed(0) + '%');

        const consensus = (d.intelligence?.consensus ?? 0) * 100;
        setText('agentConsensus', consensus.toFixed(0) + '%');
        document.getElementById('agentConsensusBar').style.width = consensus + '%';

        const sentiment = d.intelligence?.sentiment || 'NEUTRAL';
        setText('agentSentiment', sentiment);
        const sentVal = sentiment === 'BULLISH' ? 85 : sentiment === 'BEARISH' ? 25 : 50;
        document.getElementById('agentSentimentBar').style.width = sentVal + '%';

        setText('agentConfidence', conf.toFixed(0) + '%');
        document.getElementById('agentConfidenceBar').style.width = conf + '%';

        const vol = (d.intelligence?.volatility ?? 0) * 100;
        setText('agentVolatility', vol.toFixed(2) + '%');
        document.getElementById('agentVolatilityBar').style.width = Math.min(vol * 10, 100) + '%';

        // Pressure gauge (-1 to +1 → -50% to +50%)
        let pressure = d.intelligence?.pressure;
        if (pressure == null) pressure = dec === 'BUY' ? 0.5 : dec === 'SELL' ? -0.5 : 0;
        pressure = Math.max(-1, Math.min(1, pressure));
        const fill = document.getElementById('gaugeFill');
        if (pressure >= 0) {
            fill.style.left = '50%';
            fill.style.width = (pressure * 50) + '%';
            fill.classList.remove('negative');
        } else {
            fill.style.left = (50 + pressure * 50) + '%';
            fill.style.width = (-pressure * 50) + '%';
            fill.classList.add('negative');
        }

        // Risk
        const varVal = d.risk?.var_95 ?? 0;
        setText('metricVaR', (varVal * 100).toFixed(2) + '%');
        const dd = d.risk?.drawdown ?? 0;
        setText('metricDrawdown', (dd * 100).toFixed(2) + '%');
        const es = d.risk?.expected_shortfall ?? 0;
        setText('metricES', (es * 100).toFixed(2) + '%');

        // Risk level bar
        const riskPct = riskLevel === 'LOW' ? 20 : riskLevel === 'MEDIUM' ? 50 :
                        riskLevel === 'HIGH' ? 78 : 95;
        document.getElementById('riskLevelFill').style.width = riskPct + '%';
        const rlt = document.getElementById('riskLevelText');
        rlt.textContent = riskLevel;
        rlt.style.color = riskLevel === 'LOW' ? 'var(--pos)' :
                          riskLevel === 'MEDIUM' ? 'var(--warn)' :
                          riskLevel === 'HIGH' ? 'var(--neg)' : 'var(--crit)';

        // Trades log
        if (d.trades_log && Array.isArray(d.trades_log)) {
            d.trades_log.forEach(tr => {
                if (!lastTradeIds.has(tr.id)) {
                    lastTradeIds.add(tr.id);
                    appendTrade(tr);
                    appendLog('INFO', `Order ${tr.id} ${tr.side} ${tr.qty} ${tr.symbol} @ $${tr.price} [${tr.algo}]`);
                }
            });
        }

        // Status logs (significant events)
        if (riskLevel === 'CRITICAL') {
            appendLogOnce('CRITICAL', 'Risk level CRITICAL — automatic risk reduction engaged');
        } else if (riskLevel === 'HIGH') {
            appendLogOnce('WARNING', 'Risk level HIGH — monitoring positions');
        }
    }

    // ----------- Trades + logs -----------
    function appendTrade(tr) {
        const tbody = document.getElementById('tradesBody');
        const empty = tbody.querySelector('.empty-row');
        if (empty) empty.remove();

        const time = new Date(tr.time * 1000).toLocaleTimeString('en-US', { hour12: false });
        const sideClass = tr.side === 'BUY' ? 'buy' : 'sell';
        const statusClass = 'status-' + (tr.status || 'pending').toLowerCase();
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${tr.id}</td>
            <td><span class="side-tag ${sideClass}">${tr.side}</span></td>
            <td>${tr.symbol}</td>
            <td class="num">${tr.qty}</td>
            <td class="num">$${Number(tr.price).toFixed(2)}</td>
            <td><span class="algo-tag">${tr.algo}</span></td>
            <td><span class="status-tag ${statusClass}">${tr.status}</span></td>
            <td class="num">${time}</td>
        `;
        tbody.prepend(row);
        // Keep max 20 rows
        while (tbody.children.length > 20) tbody.removeChild(tbody.lastChild);
    }

    const recentLogs = new Set();
    function appendLogOnce(level, msg) {
        const key = level + ':' + msg;
        if (recentLogs.has(key)) return;
        recentLogs.add(key);
        setTimeout(() => recentLogs.delete(key), 30000);
        appendLog(level, msg);
    }

    function appendLog(level, msg) {
        const term = document.getElementById('terminal');
        const line = document.createElement('div');
        line.className = 'terminal-line';
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        const lvlClass = 'log-' + level.toLowerCase();
        line.innerHTML = `<span class="log-time">${time}</span><span class="log-level ${lvlClass}">[${level}]</span><span>${escapeHtml(msg)}</span>`;
        term.appendChild(line);
        while (term.children.length > 50) term.removeChild(term.firstChild);
        term.scrollTop = term.scrollHeight;
    }

    // ----------- Commands -----------
    let paused = false;
    let aggressiveness = 1.0;

    async function sendCommand(extra) {
        const payload = Object.assign({ paused, aggressiveness, timestamp: Date.now() }, extra || {});
        const fb = document.getElementById('cmdFeedback');
        const badge = document.getElementById('cmdStatusBadge');
        fb.className = 'cmd-feedback';
        fb.textContent = '⟳ Sending command…';
        badge.textContent = 'SENDING';

        try {
            const res = await fetch('/api/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok && data.status === 'success') {
                fb.className = 'cmd-feedback success';
                fb.textContent = '✓ ' + (data.message || 'Command sent');
                badge.textContent = 'SENT';
                appendLog('INFO', 'Command dispatched: ' + JSON.stringify(payload));
            } else {
                throw new Error(data.message || 'Command failed');
            }
        } catch (err) {
            fb.className = 'cmd-feedback error';
            fb.textContent = '✗ ' + err.message;
            badge.textContent = 'ERROR';
            appendLog('ERROR', 'Command failed: ' + err.message);
        }
        setTimeout(() => { badge.textContent = 'IDLE'; fb.textContent = ''; fb.className = 'cmd-feedback'; }, 4000);
    }

    document.getElementById('resumeBtn').addEventListener('click', () => {
        paused = false;
        document.getElementById('pauseBtn').classList.remove('active');
        document.getElementById('resumeBtn').classList.add('active');
        sendCommand();
        appendLog('INFO', 'Bot resumed by operator');
    });

    document.getElementById('pauseBtn').addEventListener('click', () => {
        paused = true;
        document.getElementById('pauseBtn').classList.add('active');
        document.getElementById('resumeBtn').classList.remove('active');
        sendCommand();
        appendLog('WARNING', 'Bot paused by operator');
    });

    document.getElementById('panicBtn').addEventListener('click', () => {
        if (!confirm('⚠ PANIC MODE\n\nThis will:\n• Cancel all open orders\n• Liquidate all positions at market\n• Pause the bot\n\nProceed?')) return;
        paused = true;
        sendCommand({ panic: true, close_all_positions: true });
        appendLog('CRITICAL', 'PANIC TRIGGERED — closing all positions at market');
    });

    const aggSlider = document.getElementById('aggSlider');
    const aggValue = document.getElementById('aggValue');
    let aggDebounce = null;
    aggSlider.addEventListener('input', () => {
        aggressiveness = parseFloat(aggSlider.value);
        aggValue.textContent = aggressiveness.toFixed(2) + 'x';
        clearTimeout(aggDebounce);
        aggDebounce = setTimeout(() => sendCommand(), 500);
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        if (!confirm('Logout?\n\nYour encrypted credentials will be removed from this machine.')) return;
        try {
            await fetch('/api/logout', { method: 'POST' });
        } catch (e) {}
        window.location.href = '/login.html';
    });

    // ----------- Helpers -----------
    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
    function formatMoney(n) {
        return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function formatUptime(ms) {
        const s = Math.floor(ms / 1000);
        const h = String(Math.floor(s / 3600)).padStart(2, '0');
        const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
        const sec = String(s % 60).padStart(2, '0');
        return `${h}:${m}:${sec}`;
    }
    function riskClass(level) {
        if (level === 'LOW') return 'status-pill-good';
        if (level === 'MEDIUM') return 'status-pill-warn';
        if (level === 'HIGH') return 'status-pill-bad';
        if (level === 'CRITICAL') return 'status-pill-crit';
        return '';
    }
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // ----------- Init -----------
    document.addEventListener('DOMContentLoaded', () => {
        initCharts();
        appendLog('INFO', 'Titán Terminal v2.4.0 initialized');
        appendLog('INFO', 'Connecting to bot data stream…');
        poll();
        setInterval(poll, POLL_INTERVAL);
        // Uptime ticker
        setInterval(() => {
            setText('pillUptime', formatUptime(Date.now() - startTime));
        }, 1000);
    });
})();
