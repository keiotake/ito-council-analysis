// 「数字で見る伊東市」のグラフ描画（データは window.NUMBERS。build_pages.js が埋め込む）
(function () {
  'use strict';
  var data = window.NUMBERS;
  if (!data || !window.Chart) {
    document.querySelectorAll('.chartbox').forEach(function (b) {
      b.innerHTML = '<p style="padding:1em">グラフを表示できませんでした。下の「表で見る」から数値を確認できます。</p>';
    });
    return;
  }
  var COLORS = ['#0f766e', '#2563eb', '#c2410c', '#7c3aed'];
  var PROJ = '#c2410c';
  var charts = {};

  Chart.defaults.font.family = '-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,sans-serif';
  Chart.defaults.font.size = 13;
  Chart.defaults.color = '#404040';

  // 画像保存時に背景を白にする
  var whiteBg = {
    id: 'whiteBg',
    beforeDraw: function (c) {
      var ctx = c.canvas.getContext('2d');
      ctx.save(); ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.restore();
    }
  };

  function fmt(v, unit) {
    if (v == null) return '値なし';
    return Number(v).toLocaleString('ja-JP') + (unit ? ' ' + unit : '');
  }

  function baseOptions(c, extra) {
    var o = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10 } },
        tooltip: { callbacks: { label: function (it) { return it.dataset.label + '：' + fmt(it.raw == null ? null : Math.abs(it.raw), c.unit); } } }
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, ticks: { callback: function (v) { return Number(v).toLocaleString('ja-JP'); } } }
      }
    };
    return Object.assign(o, extra || {});
  }

  function lineDatasets(c) {
    return c.datasets.map(function (d) {
      var proj = d.style === 'projection';
      var col = proj ? PROJ : COLORS[d.color != null ? d.color : 1];
      return {
        label: d.label, data: d.data, borderColor: col, backgroundColor: col,
        borderWidth: 2.5, borderDash: proj ? [6, 5] : [], pointRadius: 3,
        pointStyle: proj ? 'triangle' : 'circle', spanGaps: false, tension: 0
      };
    });
  }

  function barDatasets(c) {
    return c.datasets.map(function (d, i) {
      var col = COLORS[d.color != null ? d.color : i];
      return { label: d.label, data: d.data, backgroundColor: col, borderColor: col };
    });
  }

  function pyramidConfig(c, year) {
    var p = c.pyramid[year];
    var ages = c.ages.slice().reverse();
    var male = p.male.slice().reverse().map(function (v) { return v == null ? null : -v; });
    var female = p.female.slice().reverse();
    var max = 0;
    c.years.forEach(function (y) { c.pyramid[y].male.concat(c.pyramid[y].female).forEach(function (v) { if (v > max) max = v; }); });
    max = Math.ceil(max / 500) * 500;
    var o = baseOptions(c, { indexAxis: 'y' });
    o.scales = {
      x: { stacked: true, min: -max, max: max, ticks: { callback: function (v) { return Math.abs(v).toLocaleString('ja-JP'); } } },
      y: { stacked: true, ticks: { autoSkip: false, font: { size: 11 } } }
    };
    o.interaction = { mode: 'index', intersect: false, axis: 'y' };
    var tag = year + '年' + (p.actual ? '・実績' : '・推計');
    return {
      type: 'bar',
      data: { labels: ages, datasets: [
        { label: '男性（' + tag + '）', data: male, backgroundColor: COLORS[1] },
        { label: '女性（' + tag + '）', data: female, backgroundColor: COLORS[2] }
      ] },
      options: o, plugins: [whiteBg]
    };
  }

  function config(c) {
    if (c.type === 'pyramid') return pyramidConfig(c, c.years[0]);
    if (c.type === 'line') return { type: 'line', data: { labels: c.labels, datasets: lineDatasets(c) }, options: baseOptions(c), plugins: [whiteBg] };
    if (c.type === 'bar') return { type: 'bar', data: { labels: c.labels, datasets: barDatasets(c) }, options: baseOptions(c), plugins: [whiteBg] };
    if (c.type === 'stacked') {
      var o = baseOptions(c); o.scales.x.stacked = true; o.scales.y.stacked = true;
      return { type: 'bar', data: { labels: c.labels, datasets: barDatasets(c) }, options: o, plugins: [whiteBg] };
    }
    if (c.type === 'hbar') {
      var h = baseOptions(c, { indexAxis: 'y' });
      h.scales = { x: { beginAtZero: true, ticks: { callback: function (v) { return Number(v).toLocaleString('ja-JP'); } } }, y: { ticks: { autoSkip: false } } };
      h.plugins.legend.display = false;
      h.interaction = { mode: 'index', intersect: false, axis: 'y' };
      return { type: 'bar', data: { labels: c.labels, datasets: barDatasets(c) }, options: h, plugins: [whiteBg] };
    }
  }

  data.charts.forEach(function (c) {
    var cv = document.getElementById('cv-' + c.id);
    if (cv) charts[c.id] = new Chart(cv, config(c));
  });

  // ピラミッドの年切り替え
  document.querySelectorAll('.yearbtns button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = btn.closest('.card'); var id = card.id;
      var c = data.charts.find(function (x) { return x.id === id; });
      card.querySelectorAll('.yearbtns button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      charts[id].data = pyramidConfig(c, btn.getAttribute('data-year')).data;
      charts[id].update();
    });
  });

  function safeName(c) { return '伊東市_' + c.title.replace(/[\\/:*?"<>|（）()・\s]/g, ''); }
  function download(name, href) {
    var a = document.createElement('a'); a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // CSV保存（表と同じ内容。Excelで文字化けしないようBOM付き）
  document.querySelectorAll('[data-csv]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var c = data.charts.find(function (x) { return x.id === btn.getAttribute('data-csv'); });
      var q = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var lines = [c.table.head.map(q).join(',')].concat(c.table.rows.map(function (r) { return r.map(q).join(','); }));
      lines.push('');
      lines.push(q('出典：' + c.sources.map(function (s) { return s.org + '「' + s.stat + '」'; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join('、')));
      var url = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
      download(safeName(c) + '.csv', url);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  });

  // 画像保存
  document.querySelectorAll('[data-png]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-png');
      var c = data.charts.find(function (x) { return x.id === id; });
      download(safeName(c) + '.png', charts[id].toBase64Image('image/png', 1));
    });
  });
})();
