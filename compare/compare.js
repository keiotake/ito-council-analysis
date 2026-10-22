// 「他のまちと比べる」の画面（データは window.COMPARE。build_pages.js が埋め込む）
//   - 市の並びはいつも同じ（値で並べ替えない）。順位は出さない
//   - 値がない年・市は null のまま「値なし」と表示する
//   - 条件は URL（?i=指標&c=市コード,…&y=年）に入れて、リンクで同じ比較を共有できる
(function () {
  'use strict';
  var data = window.COMPARE;
  var $ = function (id) { return document.getElementById(id); };
  if (!data || !window.Chart) {
    document.querySelectorAll('.chartbox').forEach(function (b) {
      b.innerHTML = '<p style="padding:1em">グラフを表示できませんでした。下の「表で見る」から数値を確認できます。</p>';
    });
    if (!data) return;
  }
  var ITO = data.cities[0].code;
  // 市ごとの色は固定（伊東市を濃い青で目立たせる）。色だけに頼らないよう線の形も変える
  var COLORS = { 22208: '#1d4ed8', 22205: '#0f766e', 22219: '#c2410c', 22222: '#7c3aed', 22225: '#a16207' };
  var DASH = { 22208: [], 22205: [6, 4], 22219: [2, 3], 22222: [10, 4, 2, 4], 22225: [4, 2] };
  var POINT = { 22208: 'circle', 22205: 'rect', 22219: 'triangle', 22222: 'rectRot', 22225: 'crossRot' };
  var nameOf = {}; data.cities.forEach(function (c) { nameOf[c.code] = c.name; });

  // ---------- 状態（URLから復元） ----------
  var q = new URLSearchParams(location.search);
  var state = {
    ind: data.indicators.some(function (i) { return i.key === q.get('i'); }) ? q.get('i') : data.indicators[0].key,
    cities: q.has('c') ? q.get('c').split(',').filter(function (c) { return nameOf[c] && c !== ITO; }) : data.cities.slice(1).map(function (c) { return c.code; }),
    year: q.get('y') ? Number(q.get('y')) : null
  };
  var indOf = function (key) { return data.indicators.find(function (i) { return i.key === key; }); };
  var shown = function () { return data.cities.map(function (c) { return c.code; }).filter(function (c) { return c === ITO || state.cities.indexOf(c) >= 0; }); };

  function fmt(v, unit) {
    if (v == null) return '値なし';
    return Number(v).toLocaleString('ja-JP') + (unit && unit !== '指数' && unit !== '2005年＝100' ? ' ' + unit : '');
  }
  function yLabel(i, y) { return y + (i.period === '年度' ? '年度' : '年'); }
  // 表示中のすべての市に値がある、いちばん新しい年
  function latestCommon(i) {
    var cs = shown();
    for (var k = i.years.length - 1; k >= 0; k--) {
      if (cs.every(function (c) { return i.values[c][k] != null; })) return i.years[k];
    }
    return i.years[i.years.length - 1];
  }

  // ---------- 操作パネル ----------
  data.cities.forEach(function (c) {
    var lab = document.createElement('label');
    var cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = c.code;
    cb.checked = c.code === ITO || state.cities.indexOf(c.code) >= 0;
    if (c.code === ITO) cb.disabled = true;
    cb.addEventListener('change', function () {
      state.cities = Array.prototype.slice.call(document.querySelectorAll('#cities input:checked')).map(function (x) { return x.value; }).filter(function (x) { return x !== ITO; });
      state.year = null; render();
    });
    var sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = COLORS[c.code]; sw.setAttribute('aria-hidden', 'true');
    lab.appendChild(cb); lab.appendChild(sw); lab.appendChild(document.createTextNode(c.name));
    $('cities').appendChild(lab);
  });
  var groups = {};
  data.indicators.forEach(function (i) {
    if (!groups[i.group]) { groups[i.group] = document.createElement('optgroup'); groups[i.group].label = i.group; $('ind').appendChild(groups[i.group]); }
    var o = document.createElement('option'); o.value = i.key; o.textContent = i.name + (i.calc ? '（計算値）' : '');
    groups[i.group].appendChild(o);
  });
  $('ind').value = state.ind;
  $('ind').addEventListener('change', function () { state.ind = $('ind').value; state.year = null; render(); });
  $('year').addEventListener('change', function () { state.year = Number($('year').value); render(); });

  // ---------- グラフ ----------
  var whiteBg = {
    id: 'whiteBg',
    beforeDraw: function (c) {
      var ctx = c.canvas.getContext('2d');
      ctx.save(); ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.restore();
    }
  };
  var lineChart = null, barChart = null;
  if (window.Chart) {
    Chart.defaults.font.family = '-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,sans-serif';
    Chart.defaults.font.size = 13;
    Chart.defaults.color = '#404040';
  }
  function opts(unit) {
    return {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10 } },
        tooltip: { callbacks: { label: function (it) { return (it.dataset.label || it.label) + '：' + fmt(it.raw, unit); } } }
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, ticks: { callback: function (v) { return Number(v).toLocaleString('ja-JP'); } } }
      }
    };
  }

  function drawLine(i, cs) {
    if (!window.Chart) return;
    var cfg = {
      type: 'line',
      data: {
        labels: i.years.map(function (y) { return yLabel(i, y); }),
        datasets: cs.map(function (c, k) {
          return {
            label: nameOf[c], data: i.values[c], borderColor: COLORS[c], backgroundColor: COLORS[c],
            borderWidth: c === ITO ? 3.5 : 2, borderDash: DASH[c], pointStyle: POINT[c],
            pointRadius: c === ITO ? 4 : 3, spanGaps: false, tension: 0, order: c === ITO ? 0 : k + 1
          };
        })
      },
      options: opts(i.unit), plugins: [whiteBg]
    };
    // 凡例の印は線の太さに引きずられないよう同じ大きさにそろえる
    cfg.options.plugins.legend.labels.generateLabels = function (ch) {
      return Chart.defaults.plugins.legend.labels.generateLabels(ch).map(function (l) { l.lineWidth = 1; return l; });
    };
    if (lineChart) lineChart.destroy();
    lineChart = new Chart($('cv-line'), cfg);
  }

  function drawBar(i, cs, year) {
    if (!window.Chart) return;
    var k = i.years.indexOf(year);
    var o = opts(i.unit);
    o.plugins.legend.display = false;
    // 横向きの棒にして、スマホでも市の名前がすべて見えるようにする（並びは上から固定順）
    o.indexAxis = 'y';
    o.interaction = { mode: 'nearest', intersect: true, axis: 'y' };
    o.scales = {
      x: { beginAtZero: true, ticks: { callback: function (v) { return Number(v).toLocaleString('ja-JP'); } } },
      y: { ticks: { autoSkip: false } }
    };
    o.plugins.tooltip.callbacks.label = function (it) { return yLabel(i, year) + '：' + fmt(it.raw, i.unit); };
    var cfg = {
      type: 'bar',
      data: {
        labels: cs.map(function (c) { return nameOf[c] + (i.values[c][k] == null ? '（値なし）' : ''); }),
        datasets: [{ label: yLabel(i, year), data: cs.map(function (c) { return i.values[c][k]; }), backgroundColor: cs.map(function (c) { return COLORS[c]; }) }]
      },
      options: o, plugins: [whiteBg]
    };
    if (barChart) barChart.destroy();
    barChart = new Chart($('cv-bar'), cfg);
  }

  // ---------- 表・注意・出典 ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function drawTable(i, cs) {
    var h = '<table><thead><tr><th scope="col">' + (i.period === '年度' ? '年度' : '年') + '</th>' + cs.map(function (c) { return '<th scope="col">' + esc(nameOf[c]) + '</th>'; }).join('') + '</tr></thead><tbody>';
    i.years.forEach(function (y, k) {
      h += '<tr><th scope="row">' + y + '</th>' + cs.map(function (c) {
        var v = i.values[c][k];
        return v == null ? '<td class="na">値なし</td>' : '<td>' + Number(v).toLocaleString('ja-JP') + '</td>';
      }).join('') + '</tr>';
    });
    $('table').innerHTML = h + '</tbody></table><p class="unitnote">単位：' + esc(i.unit) + '</p>';
  }

  function render() {
    var i = indOf(state.ind);
    var cs = shown();
    if (!state.year || i.years.indexOf(state.year) < 0) state.year = latestCommon(i);
    $('indDesc').innerHTML = esc(i.desc) + (i.calc ? '<span class="calc">計算値</span>' : '');
    $('lineLead').textContent = i.name + '（' + yLabel(i, i.years[0]) + '〜' + yLabel(i, i.years[i.years.length - 1]) + '）。線が途切れている所は、値が公表されていない年です。';
    $('unitLine').textContent = $('unitBar').textContent = '単位：' + i.unit;
    $('year').innerHTML = i.years.slice().reverse().map(function (y) { return '<option value="' + y + '">' + yLabel(i, y) + '</option>'; }).join('');
    $('year').value = String(state.year);
    $('cautions').innerHTML = i.cautions.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') +
      '<li>市の並び順は固定で、値の大きい順ではありません。人口の規模や地形、観光客の多さなど、まちの条件は市ごとに違います。</li>';
    $('sources').innerHTML = i.sources.map(function (s) {
      return '<li><strong>' + esc(s.label) + '</strong>：' + esc(s.org) + '「' + esc(s.stat) + '」／単位 ' + esc(s.unit || '—') + '／期間 ' + esc(s.period) + '／取得 ' + esc(s.fetchedAt) +
        '　<a href="' + esc(s.url) + '" target="_blank" rel="noopener">出典を開く</a>' +
        (s.definition ? '<br><span class="def">定義：' + esc(s.definition) + '</span>' : '') +
        (s.annotation ? '<br><span class="def">注記：' + esc(s.annotation) + '</span>' : '') + '</li>';
    }).join('');
    drawLine(i, cs);
    drawBar(i, cs, state.year);
    drawTable(i, cs);
    $('shareMsg').textContent = '';
    var p = new URLSearchParams({ i: state.ind, c: state.cities.join(','), y: String(state.year) });
    history.replaceState(null, '', location.pathname + '?' + p.toString());
  }

  // ---------- 保存・共有 ----------
  function download(name, href) {
    var a = document.createElement('a'); a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function fileBase() { return '伊豆5市の比較_' + indOf(state.ind).name.replace(/[\\/:*?"<>|（）()＝・\s]/g, ''); }
  $('csv').addEventListener('click', function () {
    var i = indOf(state.ind), cs = shown();
    var qv = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [[i.period === '年度' ? '年度' : '年'].concat(cs.map(function (c) { return nameOf[c]; })).map(qv).join(',')];
    i.years.forEach(function (y, k) { lines.push([y].concat(cs.map(function (c) { var v = i.values[c][k]; return v == null ? '値なし' : v; })).map(qv).join(',')); });
    lines.push('');
    lines.push(qv('指標：' + i.name + (i.calc ? '（このページで計算した値）' : '') + '／単位：' + i.unit));
    lines.push(qv('出典：' + i.sources.map(function (s) { return s.org + '「' + s.stat + '」' + s.label; }).join('、') + '／取得 ' + i.sources[0].fetchedAt));
    var url = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    download(fileBase() + '.csv', url);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  $('pngLine').addEventListener('click', function () { if (lineChart) download(fileBase() + '_推移.png', lineChart.toBase64Image('image/png', 1)); });
  $('pngBar').addEventListener('click', function () { if (barChart) download(fileBase() + '_' + state.year + '.png', barChart.toBase64Image('image/png', 1)); });
  $('copy').addEventListener('click', function () {
    var done = function () { $('shareMsg').textContent = 'リンクをコピーしました。開いた人にも同じ比較が表示されます。'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(location.href).then(done, function () { $('shareMsg').textContent = 'コピーできませんでした。アドレス欄のURLをそのまま共有してください。'; });
    } else {
      $('shareMsg').textContent = 'アドレス欄のURLをそのまま共有すると、同じ比較が表示されます。';
    }
  });

  render();
})();
