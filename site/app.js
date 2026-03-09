const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });

const NAME_MAP = {
  'Warren Buffett': '沃伦·巴菲特 | Warren Buffett',
  'Michael Burry': '迈克尔·伯里 | Michael Burry',
  'Bill Ackman': '比尔·阿克曼 | Bill Ackman',
  'David Tepper': '大卫·泰珀 | David Tepper',
  'Ray Dalio': '瑞·达利欧 | Ray Dalio',
  'Carl Icahn': '卡尔·伊坎 | Carl Icahn',
  'Dan Loeb': '丹·勒布 | Dan Loeb',
  'Seth Klarman': '赛斯·卡拉曼 | Seth Klarman',
  'Stanley Druckenmiller': '斯坦利·德鲁肯米勒 | Stanley Druckenmiller',
  'Bill Gates': '比尔·盖茨 | Bill Gates',
};

const state = { data: null, activeIndex: 0 };

fetch('./data/positions.json')
  .then((res) => res.json())
  .then((data) => {
    state.data = normalizeData(data);
    renderOverview(state.data);
    renderInvestorGrid(state.data.investors);
    renderInvestor(0);
    renderErrors(state.data.errors || []);
    bindModal();
  })
  .catch((err) => {
    document.body.innerHTML = `<main class="shell" style="padding:80px 0"><div class="panel"><h2>数据加载失败</h2><p>${err.message}</p></div></main>`;
  });

function normalizeData(data) {
  const investors = data.investors.map((investor) => ({
    ...investor,
    displayName: NAME_MAP[investor.name] || investor.name,
    latestHoldings: investor.latestHoldings.map((holding, index) => ({
      ...holding,
      color: palette(index),
    })),
  }));
  const rankings = data.rankings.map((item) => ({
    ...item,
    displayName: NAME_MAP[item.name] || item.name,
  }));
  const spotlightChanges = data.spotlightChanges.map((item) => ({
    ...item,
    investorDisplayName: NAME_MAP[item.investor] || item.investor,
  }));
  return { ...data, investors, rankings, spotlightChanges };
}

function palette(index) {
  const colors = ['#38bdf8', '#22c55e', '#f59e0b', '#fb7185', '#a78bfa', '#14b8a6', '#f97316', '#84cc16', '#e879f9', '#f43f5e', '#60a5fa', '#facc15'];
  return colors[index % colors.length];
}

function money(value) {
  return currency.format(value || 0);
}

function renderOverview(data) {
  document.getElementById('yearsBack').textContent = `${data.yearsBack}Y`;
  document.getElementById('investorCount').textContent = `${data.investorCount}`;
  document.getElementById('generatedAt').textContent = new Date(data.generatedAt).toLocaleString('zh-CN', { hour12: false });
  document.getElementById('changesList').innerHTML = data.spotlightChanges.map((item) => `
    <div class="change-item">
      <span class="badge ${item.status}">${labelStatus(item.status)}</span>
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <p>${escapeHtml(item.investorDisplayName)}</p>
      </div>
      <div>
        <strong>${signedMoney(item.diffValue)}</strong>
        <p>${money(item.value)}</p>
      </div>
    </div>
  `).join('');
}

function renderInvestorGrid(investors) {
  const grid = document.getElementById('investorGrid');
  grid.innerHTML = investors.map((item, index) => `
    <button class="investor-card ${index === 0 ? 'active' : ''}" data-index="${index}" style="--accent:${item.accent}">
      <span class="investor-card-top">${item.latestQuarter}</span>
      <strong>${item.displayName}</strong>
      <p>${item.entity}</p>
      <div class="investor-card-foot">
        <span>${money(item.latestPortfolioValue)}</span>
        <em>${item.latestHoldings[0]?.symbol || '-'} / ${item.latestHoldings[0]?.name || '-'}</em>
      </div>
    </button>
  `).join('');
  grid.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      grid.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');
      renderInvestor(Number(button.dataset.index));
    });
  });
}

function renderInvestor(index) {
  state.activeIndex = index;
  const investor = state.data.investors[index];
  document.getElementById('pieSubtitle').textContent = `${investor.displayName} 最近一期前 ${investor.latestHoldings.length} 大持仓占比`;
  document.getElementById('centerQuarter').textContent = `${investor.latestQuarter} / ${investor.latestDate}`;
  document.getElementById('centerName').textContent = investor.displayName;
  document.getElementById('centerValue').textContent = money(investor.latestPortfolioValue);
  renderLegend(investor);
  drawDonut(investor.latestHoldings, investor.accent);
  drawChart(investor.timeline, investor.accent);
}

function renderLegend(investor) {
  const total = investor.latestHoldings.reduce((sum, item) => sum + item.value, 0) || 1;
  document.getElementById('legendList').innerHTML = investor.latestHoldings.map((item) => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${item.color}"></span>
      <div>
        <strong>${item.symbol || item.name}</strong>
        <p>${item.name}</p>
      </div>
      <div class="legend-metrics">
        <strong>${((item.value / total) * 100).toFixed(1)}%</strong>
        <p>${money(item.value)}</p>
      </div>
    </div>
  `).join('');
}

function drawDonut(holdings) {
  const canvas = document.getElementById('donutChart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(canvas.clientWidth || 520, 520) * dpr;
  canvas.width = size;
  canvas.height = size;
  ctx.clearRect(0, 0, size, size);

  const total = holdings.reduce((sum, item) => sum + item.value, 0) || 1;
  const center = size / 2;
  const radius = size * 0.38;
  const inner = radius * 0.58;
  let start = -Math.PI / 2;

  holdings.forEach((item) => {
    const angle = (item.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(center, center, radius, start, start + angle);
    ctx.arc(center, center, inner, start + angle, start, true);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(7,17,31,.9)';
    ctx.lineWidth = 3 * dpr;
    ctx.stroke();
    start += angle;
  });

  ctx.beginPath();
  ctx.arc(center, center, inner - 8 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8,18,34,.92)';
  ctx.shadowColor = 'rgba(56,189,248,.18)';
  ctx.shadowBlur = 24 * dpr;
  ctx.fill();
}

function drawChart(points, accent) {
  const canvas = document.getElementById('timelineChart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth * dpr;
  const height = canvas.clientHeight * dpr;
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  const pad = 44 * dpr;
  const values = points.map((item) => item.portfolioValue);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(max - min, 1);

  ctx.strokeStyle = 'rgba(148,163,184,.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = pad + ((height - pad * 2) / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  const xy = points.map((item, index) => {
    const x = pad + ((width - pad * 2) / Math.max(points.length - 1, 1)) * index;
    const y = height - pad - ((item.portfolioValue - min) / span) * (height - pad * 2);
    return { x, y };
  });

  const gradient = ctx.createLinearGradient(0, pad, 0, height - pad);
  gradient.addColorStop(0, `${accent}cc`);
  gradient.addColorStop(1, 'rgba(56,189,248,.06)');

  ctx.beginPath();
  xy.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3 * dpr;
  ctx.stroke();

  ctx.lineTo(xy[xy.length - 1].x, height - pad);
  ctx.lineTo(xy[0].x, height - pad);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.fillStyle = '#edf6ff';
  ctx.font = `${12 * dpr}px Space Grotesk`;
  ctx.fillText(points[0].quarter, pad, height - 14 * dpr);
  ctx.fillText(points[points.length - 1].quarter, width - pad - 76 * dpr, height - 14 * dpr);
  ctx.fillText(compact.format(max), pad, pad - 10 * dpr);
}

function bindModal() {
  const openBtn = document.getElementById('openModalButton');
  const closeBtn = document.getElementById('closeModalButton');
  const backdrop = document.getElementById('modalBackdrop');
  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });
}

function openModal() {
  const investor = state.data.investors[state.activeIndex];
  document.getElementById('modalEntity').textContent = investor.entity;
  document.getElementById('modalName').textContent = investor.displayName;
  document.getElementById('modalQuarter').textContent = `${investor.latestQuarter} · ${investor.latestDate}`;
  document.getElementById('modalValue').textContent = money(investor.latestPortfolioValue);
  document.getElementById('modalTable').innerHTML = `
    <table>
      <thead>
        <tr><th>序号</th><th>代码 / 持仓</th><th>市值</th><th>权重</th><th>股数</th></tr>
      </thead>
      <tbody>
        ${investor.latestHoldings.map((item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>
              <strong>${item.symbol || '-'}</strong>
              <div>${item.name}</div>
              <div class="cusip">${item.cusip || '-'}</div>
            </td>
            <td>${money(item.value)}</td>
            <td>${item.weight.toFixed(1)}%</td>
            <td>${compact.format(item.shares || 0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  document.getElementById('modal').classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function renderErrors(errors) {
  if (!errors.length) return;
  document.getElementById('errorsSection').classList.remove('hidden');
  document.getElementById('errorsList').innerHTML = errors.map((item) => `<p>${item.investor}: ${item.error}</p>`).join('');
}

function labelStatus(status) {
  return {
    new: '新进',
    increased: '增持',
    reduced: '减持',
    exited: '清仓',
    flat: '持平',
  }[status] || status;
}

function signedMoney(value) {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${currency.format(Math.abs(value || 0))}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
