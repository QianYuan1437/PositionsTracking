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

const state = {
  data: null,
  activeIndex: 0,
  chart: {
    points: [],
    accent: '#38bdf8',
    raf: null,
  },
  donut: {
    slices: [],
    hoverIndex: -1,
  },
};

fetch('./data/positions.json')
  .then((res) => res.json())
  .then((data) => {
    state.data = normalizeData(data);
    renderOverview(state.data);
    renderInvestorGrid(state.data.investors);
    bindChartEvents();
    bindDonutEvents();
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
  state.donut.hoverIndex = -1;
  const investor = state.data.investors[index];
  document.getElementById('pieSubtitle').textContent = `${investor.displayName} 最近一期前 ${investor.latestHoldings.length} 大持仓占比`;
  document.getElementById('centerQuarter').textContent = `${investor.latestQuarter} / ${investor.latestDate}`;
  document.getElementById('centerName').textContent = investor.displayName;
  document.getElementById('centerValue').textContent = money(investor.latestPortfolioValue);
  renderLegend(investor);
  renderHoldingDetail(investor, 0);
  drawDonut(investor.latestHoldings, investor.accent, -1);
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

function drawDonut(holdings, accent, hoverIndex = -1) {
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
  state.donut.slices = [];

  holdings.forEach((item, index) => {
    const angle = (item.value / total) * Math.PI * 2;
    const active = index === hoverIndex;
    const outerRadius = active ? radius + 10 * dpr : radius;
    ctx.beginPath();
    ctx.arc(center, center, outerRadius, start, start + angle);
    ctx.arc(center, center, inner, start + angle, start, true);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    ctx.strokeStyle = active ? '#f8fafc' : 'rgba(7,17,31,.9)';
    ctx.lineWidth = active ? 4 * dpr : 3 * dpr;
    ctx.stroke();
    state.donut.slices.push({
      start,
      end: start + angle,
      outerRadius: outerRadius / dpr,
      innerRadius: inner / dpr,
      item,
      index,
      center: center / dpr,
    });
    start += angle;
  });

  ctx.beginPath();
  ctx.arc(center, center, inner - 8 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8,18,34,.92)';
  ctx.shadowColor = `${accent}30`;
  ctx.shadowBlur = 18 * dpr;
  ctx.fill();
}

function drawChart(points, accent, hoverIndex = -1) {
  const canvas = document.getElementById('timelineChart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth * dpr;
  const height = canvas.clientHeight * dpr;
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  const leftPad = 72 * dpr;
  const rightPad = 28 * dpr;
  const topPad = 24 * dpr;
  const bottomPad = 34 * dpr;
  const values = points.map((item) => item.portfolioValue);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(max - min, 1);

  const xy = points.map((item, index) => {
    const x = leftPad + ((width - leftPad - rightPad) / Math.max(points.length - 1, 1)) * index;
    const y = height - bottomPad - ((item.portfolioValue - min) / span) * (height - topPad - bottomPad);
    return { x, y, item };
  });

  ctx.strokeStyle = 'rgba(148,163,184,.24)';
  ctx.lineWidth = 1;
  ctx.fillStyle = 'rgba(142,165,197,.78)';
  ctx.font = `${11 * dpr}px Space Grotesk`;

  for (let i = 0; i < 5; i += 1) {
    const ratio = i / 4;
    const y = topPad + (height - topPad - bottomPad) * ratio;
    const value = max - span * ratio;
    ctx.beginPath();
    ctx.moveTo(leftPad, y);
    ctx.lineTo(width - rightPad, y);
    ctx.stroke();
    ctx.fillText(compact.format(value), 8 * dpr, y + 4 * dpr);
  }

  ctx.strokeStyle = 'rgba(125,211,252,.2)';
  ctx.beginPath();
  ctx.moveTo(leftPad, topPad - 4 * dpr);
  ctx.lineTo(leftPad, height - bottomPad);
  ctx.lineTo(width - rightPad, height - bottomPad);
  ctx.stroke();

  const gradient = ctx.createLinearGradient(0, topPad, 0, height - bottomPad);
  gradient.addColorStop(0, `${accent}b8`);
  gradient.addColorStop(1, 'rgba(56,189,248,.03)');

  ctx.beginPath();
  ctx.moveTo(xy[0].x, xy[0].y);
  for (let i = 0; i < xy.length - 1; i += 1) {
    const current = xy[i];
    const next = xy[i + 1];
    const cp1x = current.x + (next.x - current.x) / 2;
    const cp1y = current.y;
    const cp2x = current.x + (next.x - current.x) / 2;
    const cp2y = next.y;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, next.x, next.y);
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3 * dpr;
  ctx.stroke();

  ctx.lineTo(xy[xy.length - 1].x, height - bottomPad);
  ctx.lineTo(xy[0].x, height - bottomPad);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.fillStyle = '#edf6ff';
  ctx.font = `${11 * dpr}px Space Grotesk`;
  ctx.fillText(points[0].quarter, leftPad, height - 10 * dpr);
  ctx.fillText(points[points.length - 1].quarter, width - rightPad - 80 * dpr, height - 10 * dpr);

  xy.forEach((point, index) => {
    const active = index === hoverIndex;
    ctx.beginPath();
    ctx.arc(point.x, point.y, active ? 5 * dpr : 3.2 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#f8fafc' : accent;
    ctx.fill();
    if (active) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 10 * dpr, 0, Math.PI * 2);
      ctx.strokeStyle = `${accent}88`;
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
    }
  });

  state.chart.points = xy.map((point) => ({
    x: point.x / dpr,
    y: point.y / dpr,
    item: point.item,
  }));
  state.chart.accent = accent;
}

function renderHoldingDetail(investor, index) {
  const holding = investor.latestHoldings[index] || investor.latestHoldings[0];
  const total = investor.latestHoldings.reduce((sum, item) => sum + item.value, 0) || 1;
  const weight = holding.weight || (holding.value / total) * 100;
  document.getElementById('holdingDetailCard').innerHTML = `
    <div class="detail-top">
      <div>
        <strong>${escapeHtml(holding.symbol || holding.name)}</strong>
        <p>${escapeHtml(holding.name)}</p>
      </div>
      <div class="detail-meta">
        <strong>${weight.toFixed(1)}%</strong>
        <p>组合占比</p>
      </div>
    </div>
    <div class="detail-bottom">
      <div>
        <strong>${money(holding.value)}</strong>
        <p>持仓市值</p>
      </div>
      <div>
        <strong>${compact.format(holding.shares || 0)}</strong>
        <p>持有股数</p>
      </div>
      <div>
        <strong>${escapeHtml(holding.cusip || '-')}</strong>
        <p>CUSIP</p>
      </div>
    </div>
  `;
}

function bindDonutEvents() {
  const canvas = document.getElementById('donutChart');
  const updateHover = (event) => {
    if (!state.donut.slices.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const dx = x - state.donut.slices[0].center;
    const dy = y - state.donut.slices[0].center;
    const distance = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dy, dx);
    if (angle < -Math.PI / 2) angle += Math.PI * 2;

    const found = state.donut.slices.find((slice) => distance >= slice.innerRadius && distance <= slice.outerRadius && angle >= slice.start && angle <= slice.end);
    const investor = state.data?.investors?.[state.activeIndex];
    if (!investor) return;

    if (!found) {
      state.donut.hoverIndex = -1;
      canvas.classList.remove('hovering');
      renderHoldingDetail(investor, 0);
      drawDonut(investor.latestHoldings, investor.accent, -1);
      return;
    }

    canvas.classList.add('hovering');
    if (state.donut.hoverIndex === found.index) return;
    state.donut.hoverIndex = found.index;
    renderHoldingDetail(investor, found.index);
    drawDonut(investor.latestHoldings, investor.accent, found.index);
  };

  canvas.addEventListener('mousemove', updateHover);
  canvas.addEventListener('mouseleave', () => {
    const investor = state.data?.investors?.[state.activeIndex];
    if (!investor) return;
    state.donut.hoverIndex = -1;
    canvas.classList.remove('hovering');
    renderHoldingDetail(investor, 0);
    drawDonut(investor.latestHoldings, investor.accent, -1);
  });
}

function bindChartEvents() {
  const canvas = document.getElementById('timelineChart');
  const tooltip = document.getElementById('chartTooltip');

  const handleMove = (event) => {
    if (!state.chart.points.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let nearest = -1;
    let best = Infinity;

    state.chart.points.forEach((point, index) => {
      const dx = point.x - x;
      const dy = point.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < best) {
        best = dist;
        nearest = index;
      }
    });

    if (best > 22) {
      tooltip.classList.add('hidden');
      requestChartRedraw(-1);
      return;
    }

    const active = state.chart.points[nearest];
    tooltip.innerHTML = `<strong>${active.item.quarter}</strong><p>组合市值：${money(active.item.portfolioValue)}</p><p>持仓数量：${active.item.holdingsCount}</p>`;
    tooltip.style.left = `${active.x}px`;
    tooltip.style.top = `${active.y}px`;
    tooltip.classList.remove('hidden');
    requestChartRedraw(nearest);
  };

  canvas.addEventListener('mousemove', handleMove);
  canvas.addEventListener('mouseleave', () => {
    tooltip.classList.add('hidden');
    requestChartRedraw(-1);
  });
  window.addEventListener('resize', () => requestChartRedraw(-1));
}

function requestChartRedraw(hoverIndex) {
  if (state.chart.raf) cancelAnimationFrame(state.chart.raf);
  state.chart.raf = requestAnimationFrame(() => {
    const investor = state.data?.investors?.[state.activeIndex];
    if (!investor) return;
    drawChart(investor.timeline, investor.accent, hoverIndex);
  });
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
