(async function () {
  let models, updatedAt;
  try {
    const resp = await fetch('model-info.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    models = data.models;
    updatedAt = data.updated_at;
    if (!Array.isArray(models)) throw new Error('missing "models" array in JSON');
  } catch (e) {
    document.getElementById('error').style.display = 'block';
    return;
  }
  document.getElementById('updated-at').textContent = updatedAt;

  let shiftDown = false;
  window.addEventListener('keydown', e => { if (e.key === 'Shift') shiftDown = true; });
  window.addEventListener('keyup', e => { if (e.key === 'Shift') shiftDown = false; });

  // Short display name = part after the org prefix, e.g. "moonshotai/Kimi-K3" -> "Kimi-K3"
  models.forEach(m => { m.short = m.model_id.split('/').pop(); });

  // One series per org so the chart gets per-org colors + a filterable legend for free
  const orgs = [...new Set(models.map(m => m.model_id.split('/')[0]))];

  const fmtPrice = v => '$' + (v < 1 ? v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : v.toFixed(2));

  // Context window is stored in K tokens: 200 -> "200K", 1024 -> "1M"
  const fmtCtx = k => (k >= 1024 ? (k / 1024) + 'M' : k + 'K');

  // Bubble area proportional to param count (size ~ sqrt), wide scaling so big models stand out
  // e.g. 30B -> ~14px, 1000B -> ~66px, 2800B (Kimi-K3) -> ~109px
  const bubbleSize = params => Math.min(3 + Math.sqrt(params) * 2, 120);

  // X-axis price metrics selectable via dropdown
  const METRICS = {
    pricing_blended_1m: 'Pricing blended (1M)',
    price_input_1m: 'Pricing input (1M)',
    price_output_1m: 'Pricing output (1M)'
  };

  // Theme comes from the inline head script (localStorage or prefers-color-scheme)
  let theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  let chart, chart2, chart3;

  function initCharts() {
    if (chart) chart.dispose();
    if (chart2) chart2.dispose();
    if (chart3) chart3.dispose();
    // ECharts' built-in 'dark' theme re-themes axes, legend and tooltip automatically
    chart = echarts.init(document.getElementById('chart'), theme === 'dark' ? 'dark' : null);
    chart.setOption(buildOption());
    chart2 = echarts.init(document.getElementById('chart2'), theme === 'dark' ? 'dark' : null);
    chart2.setOption(buildOptionRelease());
    chart3 = echarts.init(document.getElementById('chart3'), theme === 'dark' ? 'dark' : null);
    chart3.setOption(buildOptionContext());
  }

  // Shift+click a legend family to isolate it; Shift+click it again to restore all.
  // Items in `alwaysVisible` (e.g. the frontier line) stay shown through isolations.
  function enableShiftIsolate(chart, alwaysVisible = []) {
    let applying = false;
    chart.on('legendselectchanged', params => {
      if (applying || !shiftDown) return;
      applying = true;

      const allNames = Object.keys(params.selected);
      const familyNames = allNames.filter(n => !alwaysVisible.includes(n));
      const visibleFamilies = familyNames.filter(n => params.selected[n]);

      if (visibleFamilies.length === 0) {
        // The clicked family was the only one showing (or nothing was) -> restore everything.
        chart.dispatchAction({ type: 'legendAllSelect' });
      } else {
        // Isolate the clicked family while keeping always-visible items on.
        allNames.forEach(name => {
          if (name !== params.name && !alwaysVisible.includes(name)) {
            chart.dispatchAction({ type: 'legendUnSelect', name });
          }
        });
        chart.dispatchAction({ type: 'legendSelect', name: params.name });
      }

      applying = false;
    });
  }

  let priceMetric = 'pricing_blended_1m';
  let minIntel = Math.min(...models.map(m => m.aa_intelligence_index));
  let minContext = 0; // set after slider is configured so defaults reflect the snap grid
  let showLabels = true;
  let sizeByParams = true;
  let showLabels2 = true;
  let sizeByParams2 = true;
  let showLabels3 = true;
  let sizeByParams3 = true;

  // Shared tooltip for all charts
  function tooltipFormatter(p) {
    if (p.data && p.data.frontier) {
      if (!p.data.date) return '';
      return [
        `Largest context available: <b>${fmtCtx(p.value[1])}</b> tokens`,
        `Since <b>${p.data.date}</b> (${p.data.modelId})`
      ].join('<br>');
    }
    const m = p.data.model;
    return [
      `<b>${m.model_id}</b>`,
      `AA intelligence index: <b>${m.aa_intelligence_index}</b>`,
      `Pricing (1M blended): <b>${fmtPrice(m.pricing_blended_1m)}</b>`,
      `Pricing (1M input): <b>${fmtPrice(m.price_input_1m)}</b>`,
      `Pricing (1M output): <b>${fmtPrice(m.price_output_1m)}</b>`,
      `Parameters: <b>${m.param_count} B</b>`,
      `Context: <b>${fmtCtx(m.context_window_K)} tokens</b>`,
      `Released: <b>${m.model_release_date}</b>`
    ].join('<br>');
  }

  function buildSeries() {
    return orgs.map(org => ({
      name: org,
      type: 'scatter',
      clip: false, // big bubbles near the edge should not be cut off
      symbolSize: sizeByParams ? (val, p) => bubbleSize(p.data.model.param_count) : 16,
      itemStyle: { opacity: 0.85 }, // keep overlapping big bubbles readable
      emphasis: { focus: 'series', scale: 1.15 }, // gentle grow; 1.4 on a ~109px bubble is overwhelming
      labelLayout: { hideOverlap: true },
      label: {
        show: showLabels,
        position: 'right',
        fontSize: 11,
        color: theme === 'dark' ? '#8b94a3' : '#666',
        formatter: p => p.data.model.short
      },
      data: models.filter(m => m.model_id.startsWith(org + '/') && m.aa_intelligence_index >= minIntel && m.context_window_K >= minContext).map(m => ({
        value: [m[priceMetric], m.aa_intelligence_index],
        model: m
      }))
    }));
  }

  function buildOption() {
    return {
      animationDuration: 400,
      backgroundColor: 'transparent', // let the CSS card color show through in both themes
      grid: { left: 70, right: 110, top: 60, bottom: 60 },
      legend: { top: 12, type: 'scroll' },
      tooltip: { trigger: 'item', formatter: tooltipFormatter },
      xAxis: {
        type: 'value',
        name: METRICS[priceMetric],
        nameLocation: 'middle',
        nameGap: 34,
        axisLabel: { formatter: v => fmtPrice(v) },
        splitLine: { lineStyle: { type: 'dashed' } }
      },
      yAxis: {
        type: 'value',
        name: 'AA Intelligence Index (max)\n(higher is better)',
        nameLocation: 'middle',
        nameGap: 44,
        splitLine: { lineStyle: { type: 'dashed' } }
      },
      series: buildSeries()
    };
  }

  // Parse 'YYYY-MM-DD' as a LOCAL timestamp so time-axis tick labels don't shift by a day in US timezones
  const parseDate = s => { const [y, mo, d] = s.split('-').map(Number); return new Date(y, mo - 1, d).getTime(); };
  const DAY = 86400000;
  const releaseTimes = models.map(m => parseDate(m.model_release_date));
  const timeMin = Math.min(...releaseTimes) - 7 * DAY; // pad so edge bubbles aren't clipped
  const timeMax = Math.max(...releaseTimes) + 7 * DAY;

  // Release-time chart: one series per org, no intelligence filter
  function buildSeriesRelease() {
    return orgs.map(org => ({
      name: org,
      type: 'scatter',
      clip: false, // big bubbles near the edge should not be cut off
      symbolSize: sizeByParams2 ? (val, p) => bubbleSize(p.data.model.param_count) : 16,
      itemStyle: { opacity: 0.85 }, // keep overlapping big bubbles readable
      emphasis: { focus: 'series', scale: 1.15 }, // gentle grow; 1.4 on a ~109px bubble is overwhelming
      labelLayout: { hideOverlap: true },
      label: {
        show: showLabels2,
        position: 'right',
        fontSize: 11,
        color: theme === 'dark' ? '#8b94a3' : '#666',
        formatter: p => p.data.model.short
      },
      data: models.filter(m => m.model_id.startsWith(org + '/')).map(m => ({
        value: [parseDate(m.model_release_date), m.aa_intelligence_index],
        model: m
      }))
    }));
  }

  function buildOptionRelease() {
    return {
      animationDuration: 400,
      backgroundColor: 'transparent',
      grid: { left: 70, right: 110, top: 60, bottom: 60 },
      legend: { top: 12, type: 'scroll' },
      tooltip: { trigger: 'item', formatter: tooltipFormatter },
      xAxis: {
        type: 'time',
        name: 'Release date',
        nameLocation: 'middle',
        nameGap: 34,
        min: timeMin,
        max: timeMax,
        splitLine: { lineStyle: { type: 'dashed' } }
      },
      yAxis: {
        type: 'value',
        name: 'AA Intelligence Index\n(higher is better)',
        nameLocation: 'middle',
        nameGap: 44,
        splitLine: { lineStyle: { type: 'dashed' } }
      },
      series: buildSeriesRelease()
    };
  }

  // Frontier: running max of context window over release dates (+ a zero-size end
  // point so the final step line extends to the right edge of the chart)
  const sortedByDate = [...models].sort((a, b) => parseDate(a.model_release_date) - parseDate(b.model_release_date));
  const frontierData = [];
  let runMax = 0;
  for (const m of sortedByDate) {
    if (m.context_window_K > runMax) {
      runMax = m.context_window_K;
      frontierData.push({ value: [parseDate(m.model_release_date), runMax], frontier: true, date: m.model_release_date, modelId: m.model_id });
    }
  }
  if (frontierData.length) frontierData.push({ value: [timeMax, runMax], frontier: true });

  // Context frontier chart: one scatter series per org + a step line for the running max
  function buildSeriesContext() {
    return orgs.map(org => ({
      name: org,
      type: 'scatter',
      clip: false,
      symbolSize: sizeByParams3 ? (val, p) => bubbleSize(p.data.model.param_count) : 16,
      itemStyle: { opacity: 0.85 },
      emphasis: { focus: 'series', scale: 1.15 },
      labelLayout: { hideOverlap: true },
      label: {
        show: showLabels3,
        position: 'right',
        fontSize: 11,
        color: theme === 'dark' ? '#8b94a3' : '#666',
        formatter: p => p.data.model.short
      },
      data: models.filter(m => m.model_id.startsWith(org + '/')).map(m => ({
        value: [parseDate(m.model_release_date), m.context_window_K],
        model: m
      }))
    })).concat([{
      name: 'Frontier (largest context)',
      type: 'line',
      step: 'end',
      z: 5,
      symbol: 'circle',
      symbolSize: (val, p) => (p.data.date ? 7 : 0), // hide the padded end point so it gets no hover target
      color: '#e8590c', // orange reads well on both light and dark themes
      lineStyle: { width: 2.5 },
      emphasis: { scale: 1.4 },
      data: frontierData
    }]);
  }

  function buildOptionContext() {
    return {
      animationDuration: 400,
      backgroundColor: 'transparent',
      grid: { left: 70, right: 110, top: 60, bottom: 60 },
      legend: { top: 12, type: 'scroll' },
      tooltip: { trigger: 'item', formatter: tooltipFormatter },
      xAxis: {
        type: 'time',
        name: 'Release date',
        nameLocation: 'middle',
        nameGap: 34,
        min: timeMin,
        max: timeMax,
        splitLine: { lineStyle: { type: 'dashed' } }
      },
      yAxis: {
        type: 'log',
        logBase: 2,
        // Power-of-two bounds from the data: 128K..2048K for the current 200K..1024K range,
        // and a future 2M+ model expands the axis instead of falling off it
        min: Math.pow(2, Math.floor(Math.log2(Math.min(...models.map(m => m.context_window_K))))),
        max: Math.pow(2, Math.ceil(Math.log2(Math.max(...models.map(m => m.context_window_K)))) + 1),
        name: 'Context window (tokens)\nlarger is better',
        nameLocation: 'middle',
        nameGap: 44,
        axisLabel: { formatter: v => fmtCtx(v) },
        splitLine: { lineStyle: { type: 'dashed' } }
      },
      series: buildSeriesContext()
    };
  }

  initCharts();

  const FRONTIER_LINE = 'Frontier (largest context)';
  enableShiftIsolate(chart);
  enableShiftIsolate(chart2);
  enableShiftIsolate(chart3, [FRONTIER_LINE]);

  const selMetric = document.getElementById('sel-metric');
  const sliderIntel = document.getElementById('slider-intel');
  const intelVal = document.getElementById('intel-val');
  const sliderCtx = document.getElementById('slider-ctx');
  const ctxVal = document.getElementById('ctx-val');
  const btnLabels = document.getElementById('btn-labels');
  const btnBubbles = document.getElementById('btn-bubbles');
  const btnLabels2 = document.getElementById('btn-labels2');
  const btnBubbles2 = document.getElementById('btn-bubbles2');
  const btnLabels3 = document.getElementById('btn-labels3');
  const btnBubbles3 = document.getElementById('btn-bubbles3');
  const btnTheme = document.getElementById('btn-theme');

  function renderThemeBtn() {
    btnTheme.textContent = 'Theme: ' + (theme === 'dark' ? 'Dark' : 'Light');
    btnTheme.classList.toggle('active', theme === 'dark');
  }
  renderThemeBtn();

  btnTheme.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('tf-theme', theme);
    renderThemeBtn();
    initCharts();
  });

  btnBubbles2.addEventListener('click', () => {
    sizeByParams2 = !sizeByParams2;
    btnBubbles2.innerHTML = 'Size &prop; params: ' + (sizeByParams2 ? 'ON' : 'OFF');
    btnBubbles2.classList.toggle('active', sizeByParams2);
    chart2.setOption(buildOptionRelease());
  });

  btnBubbles.addEventListener('click', () => {
    sizeByParams = !sizeByParams;
    btnBubbles.innerHTML = 'Size &prop; params: ' + (sizeByParams ? 'ON' : 'OFF');
    btnBubbles.classList.toggle('active', sizeByParams);
    chart.setOption(buildOption());
  });

  btnLabels3.addEventListener('click', () => {
    showLabels3 = !showLabels3;
    btnLabels3.textContent = 'Labels: ' + (showLabels3 ? 'ON' : 'OFF');
    btnLabels3.classList.toggle('active', showLabels3);
    chart3.setOption(buildOptionContext());
  });

  btnBubbles3.addEventListener('click', () => {
    sizeByParams3 = !sizeByParams3;
    btnBubbles3.innerHTML = 'Size &prop; params: ' + (sizeByParams3 ? 'ON' : 'OFF');
    btnBubbles3.classList.toggle('active', sizeByParams3);
    chart3.setOption(buildOptionContext());
  });

  // Slider bounds from the data (currently 14..57)
  const intelValues = models.map(m => m.aa_intelligence_index);
  sliderIntel.min = Math.min(...intelValues);
  sliderIntel.max = Math.max(...intelValues);
  sliderIntel.value = sliderIntel.min; // default to minimum so all models show on every graph
  intelVal.textContent = sliderIntel.min;

  sliderIntel.addEventListener('input', () => {
    minIntel = +sliderIntel.value;
    intelVal.textContent = minIntel;
    chart.setOption(buildOption());
  });

  // Context slider: log-scale ticks where each unit = a doubling, so 128K, 256K, 512K, 1M, ...
  // land on integer ticks and each step visibly drops the next bucket of models.
  const ctxValues = models.map(m => m.context_window_K);
  const ctxMinPow = Math.floor(Math.log2(Math.min(...ctxValues)));
  const ctxMaxPow = Math.ceil(Math.log2(Math.max(...ctxValues)));
  sliderCtx.min = ctxMinPow;
  sliderCtx.max = ctxMaxPow;
  sliderCtx.step = 1;
  sliderCtx.value = sliderCtx.min; // default to minimum so all models show
  minContext = Math.pow(2, +sliderCtx.value);
  ctxVal.textContent = fmtCtx(minContext);

  sliderCtx.addEventListener('input', () => {
    minContext = Math.pow(2, +sliderCtx.value);
    ctxVal.textContent = fmtCtx(minContext);
    chart.setOption(buildOption());
  });

  selMetric.addEventListener('change', () => {
    priceMetric = selMetric.value;
    chart.setOption(buildOption());
  });

  btnLabels.addEventListener('click', () => {
    showLabels = !showLabels;
    btnLabels.textContent = 'Labels: ' + (showLabels ? 'ON' : 'OFF');
    btnLabels.classList.toggle('active', showLabels);
    chart.setOption(buildOption());
  });

  btnLabels2.addEventListener('click', () => {
    showLabels2 = !showLabels2;
    btnLabels2.textContent = 'Labels: ' + (showLabels2 ? 'ON' : 'OFF');
    btnLabels2.classList.toggle('active', showLabels2);
    chart2.setOption(buildOptionRelease());
  });

  window.addEventListener('resize', () => {
    chart && chart.resize();
    chart2 && chart2.resize();
    chart3 && chart3.resize();
  });
})();
