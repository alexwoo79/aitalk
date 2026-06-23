var SmartboardRenderer = (function(exports) {
  "use strict";
  function parseFilter(filter) {
    if (!filter || !filter.trim()) return null;
    const s = filter.trim();
    const inM = s.match(/^(.+?)\s+(in)\s+(.+)$/i);
    if (inM) {
      const result = { column: inM[1].trim(), op: "in", value: inM[3].trim() };
      console.log("[filter] parseFilter IN:", JSON.stringify(s), "→", JSON.stringify(result));
      return result;
    }
    const containsM = s.match(/^(.+?)\s+(~|～|contains)\s+(.+)$/i);
    if (containsM) {
      const result = { column: containsM[1].trim(), op: "contains", value: containsM[3].trim() };
      console.log("[filter] parseFilter CONTAINS:", JSON.stringify(s), "→", JSON.stringify(result));
      return result;
    }
    const m = s.match(/^(.+?)\s*(=|!=|>=|<=|>|<)\s*(.+)$/);
    if (!m) {
      console.log("[filter] parseFilter FAILED:", JSON.stringify(s));
      return null;
    }
    const col = m[1].trim();
    const value = m[3].trim();
    const opMap = {
      "=": "eq",
      "!=": "ne",
      ">": "gt",
      ">=": "gte",
      "<": "lt",
      "<=": "lte"
    };
    return { column: col, op: opMap[m[2]] || "eq", value };
  }
  function applyFilter(rows, filter, conditions) {
    let result = rows;
    const allConds = [];
    if (conditions && conditions.trim()) allConds.push(conditions.trim());
    const fullExpr = allConds.join(" & ");
    if (!fullExpr) return result;
    const andGroups = fullExpr.split("&").map((g) => g.trim()).filter((g) => g);
    const colMap = {};
    if (result.length > 0) {
      for (const key of Object.keys(result[0])) {
        colMap[key.toLowerCase()] = key;
      }
    }
    for (const group of andGroups) {
      const orConds = group.split("|").map((c) => c.trim()).filter((c) => c);
      const parsedOrConds = orConds.map(parseFilter).filter((p) => p !== null);
      if (parsedOrConds.length === 0) continue;
      for (const p of parsedOrConds) {
        const actual = colMap[p.column.toLowerCase()];
        if (actual) p.column = actual;
      }
      result = result.filter(
        (r) => parsedOrConds.some((parsed) => matchRow$1(r, parsed))
      );
    }
    return result;
  }
  function matchRow$1(r, parsed) {
    const cellVal = String(r[parsed.column] ?? "").trim();
    const cellNum = Number(cellVal.replace(/,/g, ""));
    const filterNum = Number(parsed.value.replace(/,/g, ""));
    const useNumeric = !isNaN(cellNum) && !isNaN(filterNum);
    switch (parsed.op) {
      case "eq":
        return useNumeric ? cellNum === filterNum : cellVal === parsed.value;
      case "ne":
        return useNumeric ? cellNum !== filterNum : cellVal !== parsed.value;
      case "gt":
        return useNumeric ? cellNum > filterNum : cellVal > parsed.value;
      case "gte":
        return useNumeric ? cellNum >= filterNum : cellVal >= parsed.value;
      case "lt":
        return useNumeric ? cellNum < filterNum : cellVal < parsed.value;
      case "lte":
        return useNumeric ? cellNum <= filterNum : cellVal <= parsed.value;
      case "in": {
        const list = parsed.value.replace(/^\[|\]$/g, "").replace(/^\(|\)$/g, "").replace(/["']/g, "").split(/[,，、;\s]+/).map((s) => s.trim()).filter(Boolean);
        return list.some((item) => {
          const itemNum = Number(item.replace(/,/g, ""));
          if (!isNaN(cellNum) && !isNaN(itemNum)) return cellNum === itemNum;
          return cellVal === item;
        });
      }
      case "contains": {
        return cellVal.toLowerCase().includes(parsed.value.toLowerCase());
      }
      default:
        return true;
    }
  }
  function getNumericVal$2(v) {
    if (v === void 0 || v === null || v === "") return 0;
    if (typeof v === "number") return v;
    const s = String(v).replace(/,/g, "").replace(/%/g, "").trim();
    const n = Number(s);
    return isNaN(n) ? 0 : n;
  }
  function aggregate(rows, dimCol, metricCol, agg = "sum") {
    const groups = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const key = String(row[dimCol] ?? "").trim();
      if (!key) continue;
      const val = metricCol === "count" ? 1 : getNumericVal$2(row[metricCol]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(val);
    }
    const results = [];
    for (const [label, values] of groups) {
      let value;
      switch (agg) {
        case "sum":
          value = values.reduce((a, b) => a + b, 0);
          break;
        case "avg":
          value = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
          break;
        case "count":
          value = values.length;
          break;
        case "min":
          value = Math.min(...values);
          break;
        case "max":
          value = Math.max(...values);
          break;
        default:
          value = values.reduce((a, b) => a + b, 0);
      }
      results.push({ label, value });
    }
    return results.sort((a, b) => b.value - a.value);
  }
  function resolveTitle(title, metrics) {
    if (!title) return "";
    if (metrics.length === 0) return title;
    return title.replace("{metrics}", metrics.join("、")).replace("{metric}", metrics[0]);
  }
  const COLORS = [
    "#3B82F6",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#8B5CF6",
    "#EC4899",
    "#06B6D4",
    "#84CC16",
    "#F97316",
    "#14B8A6",
    "#6366F1",
    "#D946EF"
  ];
  function applyAgg(arr, agg) {
    if (!arr.length) return 0;
    switch (agg) {
      case "sum":
        return arr.reduce((a, b) => a + b, 0);
      case "avg":
        return arr.reduce((a, b) => a + b, 0) / arr.length;
      case "min":
        return Math.min(...arr);
      case "max":
        return Math.max(...arr);
      case "count":
        return arr.length;
      default:
        return arr.reduce((a, b) => a + b, 0);
    }
  }
  function fmt(n, dec) {
    if (n == null || isNaN(n)) return "0";
    const d = dec !== void 0 ? dec : 2;
    return Number(n).toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: d });
  }
  function fmtByChart(n, chart, metricName) {
    if (n == null || isNaN(n)) return "0";
    const mfRaw = metricName ? chart.metricFormats?.[metricName] : void 0;
    const mf = mfRaw && typeof mfRaw === "object" ? mfRaw : void 0;
    const fmtType = mf?.format || chart.format || "";
    const unitType = mf?.unit || chart.unit || "yuan";
    const prefix = mf?.prefix !== void 0 && mf.prefix !== "" ? mf.prefix : "";
    const decimals = mf?.decimals !== void 0 ? mf.decimals : chart.decimals !== void 0 ? chart.decimals : 2;
    if (!fmtType || fmtType === "number" || fmtType === "global") return fmt(n, decimals);
    if (fmtType === "integer") return fmt(n, 0);
    if (fmtType === "percent") {
      const v = n <= 1 && n >= -1 ? n * 100 : n;
      return v.toFixed(decimals) + "%";
    }
    if (fmtType === "currency") {
      let v = n;
      let suffix = "";
      if (unitType === "wan") {
        v = n / 1e4;
        suffix = "万";
      } else if (unitType === "yi") {
        v = n / 1e8;
        suffix = "亿";
      }
      return prefix + fmt(v, v >= 100 ? 0 : decimals) + suffix;
    }
    return fmt(n, decimals);
  }
  function fmtCompact$1(n) {
    if (n == null || isNaN(n)) return "0";
    const a = Math.abs(n);
    if (a >= 1e8) return (n / 1e8).toFixed(1) + "亿";
    if (a >= 1e4) return (n / 1e4).toFixed(1) + "万";
    return fmt(n);
  }
  function getNumericVal$1(v) {
    if (v === void 0 || v === null || v === "") return NaN;
    if (typeof v === "number") return v;
    let s = String(v).trim();
    if (s.endsWith("%")) s = s.slice(0, -1);
    s = s.replace(/,/g, "");
    const n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  }
  function buildToolbox() {
    if (typeof window !== "undefined" && !window._copyTable) {
      window._copyTable = function(tsv, btn) {
        navigator.clipboard.writeText(tsv).then(function() {
          btn.textContent = "✅ 已复制";
          btn.style.background = "#dcfce7";
          btn.style.borderColor = "#16a34a";
          setTimeout(function() {
            btn.textContent = "📋 复制表格";
            btn.style.background = "#f5f5f5";
            btn.style.borderColor = "#ccc";
          }, 1500);
        });
      };
    }
    const features = {
      saveAsImage: { title: "下载", pixelRatio: 2 },
      dataView: {
        title: "数据",
        readOnly: true,
        lang: ["数据表", "关闭", "刷新"],
        optionToContent: function(opt) {
          const series = opt.series || [];
          const root = document.documentElement;
          const cs = getComputedStyle(root);
          const bg = cs.getPropertyValue("--bg-surface").trim() || "#fff";
          const bd = cs.getPropertyValue("--border").trim() || "#e2e8f0";
          const txt = cs.getPropertyValue("--text-primary").trim() || "#1e293b";
          const bgHover = cs.getPropertyValue("--bg-hover").trim() || "#f1f5f9";
          const thStyle = "padding:6px 10px;border-bottom:2px solid " + bd + ";color:" + txt;
          const tdStyle = "padding:4px 10px;border-bottom:1px solid " + bd + ";color:" + txt;
          const btnStyle = "margin-top:8px;padding:4px 12px;border:1px solid " + bd + ";border-radius:4px;background:" + bgHover + ";cursor:pointer;font-size:12px;color:" + txt;
          const mfStore = { metricFormats: opt._mf || {} };
          function tf(v, metricName) {
            const n = Number(v);
            if (isNaN(n)) return String(v ?? "");
            return fmtByChart(n, mfStore, metricName);
          }
          const isPie = series[0]?.type === "pie";
          if (isPie) {
            const data = series[0]?.data || [];
            const total = data.reduce((s, d) => s + (d.value || 0), 0);
            let tsv2 = "类别	数值	占比\n";
            let html2 = '<div style="max-height:400px;overflow:auto;font-size:12px;color:' + txt + ";background:" + bg + '"><table style="width:100%;border-collapse:collapse">';
            html2 += '<thead><tr><th style="' + thStyle + ';text-align:left">类别</th><th style="' + thStyle + ';text-align:right">数值</th><th style="' + thStyle + ';text-align:right">占比</th></tr></thead><tbody>';
            data.forEach((d) => {
              const pct = total ? (d.value / total * 100).toFixed(1) + "%" : "0%";
              const fv = tf(d.value);
              html2 += '<tr><td style="' + tdStyle + '">' + (d.name || "") + '</td><td style="' + tdStyle + ';text-align:right">' + fv + '</td><td style="' + tdStyle + ';text-align:right">' + pct + "</td></tr>";
              tsv2 += (d.name || "") + "	" + fv + "	" + pct + "\n";
            });
            html2 += "</tbody></table>";
            html2 += `<button onclick="window._copyTable('` + tsv2.replace(/'/g, "\\'") + `',this)" style="` + btnStyle + '">📋 复制表格</button>';
            html2 += "</div>";
            return html2;
          }
          const isScatter = series[0]?.type === "scatter";
          if (isScatter) {
            const xName = opt.xAxis?.[0]?.name || "X";
            const yName = opt.yAxis?.[0]?.name || "Y";
            let tsv2 = "序号	" + xName + "	" + yName + "	聚类\n";
            let html2 = '<div style="max-height:400px;overflow:auto;font-size:12px;color:' + txt + ";background:" + bg + '"><table style="width:100%;border-collapse:collapse">';
            html2 += '<thead><tr><th style="' + thStyle + ';text-align:left">#</th>';
            html2 += '<th style="' + thStyle + ';text-align:right">' + xName + "</th>";
            html2 += '<th style="' + thStyle + ';text-align:right">' + yName + "</th>";
            html2 += '<th style="' + thStyle + ';text-align:left">聚类</th></tr></thead><tbody>';
            let idx = 0;
            for (const s of series) {
              const sName = s.name || "";
              for (const pt of s.data || []) {
                if (!Array.isArray(pt) || pt.length < 2) continue;
                idx++;
                const label = sName + " #" + idx;
                html2 += '<tr><td style="' + tdStyle + '">' + label + "</td>";
                html2 += '<td style="' + tdStyle + ';text-align:right">' + tf(pt[0]) + "</td>";
                html2 += '<td style="' + tdStyle + ';text-align:right">' + tf(pt[1]) + "</td>";
                html2 += '<td style="' + tdStyle + '">' + sName + "</td></tr>";
                tsv2 += label + "	" + tf(pt[0]) + "	" + tf(pt[1]) + "	" + sName + "\n";
              }
            }
            html2 += "</tbody></table>";
            html2 += `<button onclick="window._copyTable('` + tsv2.replace(/'/g, "\\'") + `',this)" style="` + btnStyle + '">📋 复制表格</button>';
            html2 += "</div>";
            return html2;
          }
          const xAxisData = opt.xAxis?.[0]?.data || [];
          const yAxisData = opt.yAxis?.[0]?.data || [];
          const isHorizontal = xAxisData.length === 0 && yAxisData.length > 0;
          const catData = isHorizontal ? yAxisData : xAxisData;
          let tsv = "维度	" + series.map((s) => s.name || "").join("	") + "\n";
          let html = '<div style="max-height:400px;overflow:auto;font-size:12px;color:' + txt + ";background:" + bg + '"><table style="width:100%;border-collapse:collapse">';
          html += '<thead><tr><th style="' + thStyle + ';text-align:left">维度</th>';
          series.forEach((s) => {
            html += '<th style="' + thStyle + ';text-align:right">' + (s.name || "") + "</th>";
          });
          html += "</tr></thead><tbody>";
          for (let i = 0; i < catData.length; i++) {
            html += "<tr>";
            html += '<td style="' + tdStyle + '">' + (catData[i] || "") + "</td>";
            const row = [String(catData[i] || "")];
            series.forEach((s) => {
              const val = tf(s.data?.[i] ?? "");
              row.push(val);
              html += '<td style="' + tdStyle + ';text-align:right">' + val + "</td>";
            });
            tsv += row.join("	") + "\n";
            html += "</tr>";
          }
          html += "</tbody></table>";
          html += `<button onclick="window._copyTable('` + tsv.replace(/'/g, "\\'") + `',this)" style="` + btnStyle + '">📋 复制表格</button>';
          html += "</div>";
          return html;
        }
      },
      restore: { title: "还原" }
    };
    return {
      show: true,
      right: 6,
      top: -2,
      itemSize: 12,
      itemGap: 6,
      iconStyle: { borderColor: "#999", borderWidth: 1 },
      feature: features
    };
  }
  function buildBarOption(chart, rows, sortOrder = "none", showLabel = true) {
    const dimCol = chart.dimension;
    const metricCols = chart.metrics || (chart.metric ? [chart.metric] : []);
    if (!dimCol || metricCols.length === 0) return {};
    const groups = {};
    for (const row of rows) {
      const key = String(row[dimCol] || "未知");
      if (!groups[key]) groups[key] = {};
      for (const m of metricCols) {
        if (!groups[key][m]) groups[key][m] = [];
        const v = getNumericVal$1(row[m]);
        if (!isNaN(v)) groups[key][m].push(v);
      }
    }
    let labels = Object.keys(groups);
    if (sortOrder !== "none") {
      const aggFn = chart.metricAggs?.[metricCols[0]] || chart.agg || "sum";
      const totals = labels.map((k) => {
        const arr = groups[k]?.[metricCols[0]] || [];
        return applyAgg(arr, aggFn);
      });
      const idx = labels.map((l, i) => ({ l, v: totals[i] }));
      idx.sort((a, b) => sortOrder === "asc" ? a.v - b.v : b.v - a.v);
      labels = idx.map((x) => x.l);
    } else {
      labels.sort();
    }
    const series = metricCols.map((m, mi) => {
      const aggFn = chart.metricAggs?.[m] || chart.agg || "sum";
      return {
        name: m,
        type: "bar",
        data: labels.map((k) => {
          const arr = groups[k]?.[m] || [];
          return applyAgg(arr, aggFn);
        }),
        label: showLabel ? { show: true, position: "top", fontSize: 11, formatter: (p) => fmtByChart(p.value, chart, p.seriesName) } : void 0,
        markPoint: showLabel ? {
          data: [
            { type: "max", name: "最大", symbolSize: 24, symbolOffset: [0, -14], itemStyle: { color: "#EF4444" }, label: { show: false } },
            { type: "min", name: "最小", symbolSize: 24, symbolOffset: [0, -14], itemStyle: { color: "#3B82F6" }, label: { show: false } }
          ]
        } : void 0,
        itemStyle: { borderRadius: [4, 4, 0, 0], color: COLORS[mi % COLORS.length] }
      };
    });
    return {
      _mf: chart.metricFormats || {},
      toolbox: buildToolbox(),
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(60,60,75,0.85)",
        borderColor: "#555",
        textStyle: { color: "#eee", fontSize: 12 },
        formatter: (params) => {
          if (!Array.isArray(params)) return "";
          return params.map((p) => `${p.seriesName}: ${fmtByChart(p.value, chart, p.seriesName)}`).join("<br/>");
        }
      },
      legend: metricCols.length > 1 ? { top: 0, textStyle: { fontSize: 11 } } : void 0,
      grid: { left: 60, right: 20, top: metricCols.length > 1 ? 40 : 32, bottom: 30 },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { rotate: labels.length > 8 ? 30 : 0, fontSize: 11 }
      },
      yAxis: {
        type: "value",
        axisLabel: { fontSize: 11, formatter: (v) => fmtCompact$1(v) }
      },
      series
    };
  }
  function buildHorizontalBarOption(chart, rows, sortOrder = "asc", showLabel = true) {
    const dimCol = chart.dimension;
    const metricCols = chart.metrics?.length ? chart.metrics : chart.metric ? [chart.metric] : [];
    if (!dimCol || metricCols.length === 0) return {};
    const groups = {};
    for (const row of rows) {
      const key = String(row[dimCol] || "未知");
      if (!groups[key]) groups[key] = {};
      for (const m of metricCols) {
        if (!groups[key][m]) groups[key][m] = [];
        const v = getNumericVal$1(row[m]);
        if (!isNaN(v)) groups[key][m].push(v);
      }
    }
    let labels = Object.keys(groups).sort();
    if (sortOrder !== "none") {
      const aggFn = chart.metricAggs?.[metricCols[0]] || chart.agg || "sum";
      const totals = labels.map((k) => {
        const arr = groups[k]?.[metricCols[0]] || [];
        return applyAgg(arr, aggFn);
      });
      const idx = labels.map((l, i) => ({ l, v: totals[i] }));
      idx.sort((a, b) => sortOrder === "desc" ? b.v - a.v : a.v - b.v);
      labels = idx.map((x) => x.l);
    }
    const series = metricCols.map((m, mi) => {
      const aggFn = chart.metricAggs?.[m] || chart.agg || "sum";
      return {
        name: m,
        type: "bar",
        data: labels.map((k) => {
          const arr = groups[k]?.[m] || [];
          return applyAgg(arr, aggFn);
        }),
        label: showLabel ? { show: true, position: "right", fontSize: 11, formatter: (p) => fmtByChart(p.value, chart, p.seriesName) } : void 0,
        itemStyle: {
          borderRadius: mi === metricCols.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0],
          color: COLORS[mi % COLORS.length]
        }
      };
    });
    const estLabelWidth = labels.reduce((m, l) => {
      let w = 0;
      for (const ch of l) w += ch.charCodeAt(0) > 127 ? 12 : 7;
      return Math.max(m, w);
    }, 0);
    const gridLeft = Math.max(40, estLabelWidth + 20);
    return {
      _mf: chart.metricFormats || {},
      toolbox: buildToolbox(),
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(60,60,75,0.85)",
        borderColor: "#555",
        textStyle: { color: "#eee", fontSize: 12 },
        formatter: (params) => {
          if (!Array.isArray(params)) return "";
          return params.map((p) => `${p.seriesName}: ${fmtByChart(p.value, chart, p.seriesName)}`).join("<br/>");
        }
      },
      legend: metricCols.length > 1 ? { top: 0, textStyle: { fontSize: 11 } } : void 0,
      grid: { left: gridLeft, right: 30, top: metricCols.length > 1 ? 30 : 10, bottom: 20 },
      xAxis: {
        type: "value",
        axisLabel: { fontSize: 11, formatter: (v) => fmtCompact$1(v) }
      },
      yAxis: {
        type: "category",
        data: labels,
        axisLabel: { fontSize: 11 }
      },
      series
    };
  }
  function buildDoughnutOption(chart, rows, showLabel = true) {
    const dimCol = chart.dimension;
    const metricCol = chart.metric;
    if (!dimCol) return {};
    let aggData;
    if (metricCol && metricCol !== "count") {
      aggData = aggregate(rows, dimCol, metricCol, chart.agg || "sum");
    } else {
      const freq = {};
      for (const row of rows) {
        const key = String(row[dimCol] || "未知");
        freq[key] = (freq[key] || 0) + 1;
      }
      aggData = Object.entries(freq).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    }
    const MAX_SLICES = 8;
    let pieData = aggData;
    if (aggData.length > MAX_SLICES) {
      const top = aggData.slice(0, MAX_SLICES - 1);
      const rest = aggData.slice(MAX_SLICES - 1);
      const otherSum = rest.reduce((s, d) => s + d.value, 0);
      pieData = [...top, { label: `其他(${rest.length}项)`, value: otherSum }];
    }
    const total = aggData.reduce((s, d) => s + d.value, 0);
    return {
      _mf: chart.metricFormats || {},
      toolbox: buildToolbox(),
      color: COLORS.slice(0, pieData.length),
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(60,60,75,0.85)",
        borderColor: "#555",
        textStyle: { color: "#eee" },
        formatter: (p) => `${p.name}: ${fmtByChart(p.value, chart, metricCol)} (${p.percent}%)`
      },
      legend: {
        bottom: 0,
        textStyle: { fontSize: 11 }
      },
      graphic: {
        type: "text",
        left: "center",
        top: "42%",
        style: {
          text: fmtByChart(total, chart, metricCol),
          textAlign: "center",
          fill: (() => {
            if (typeof document !== "undefined") {
              return getComputedStyle(document.documentElement).getPropertyValue("--text-primary").trim() || "#1e293b";
            }
            return "#1e293b";
          })(),
          fontSize: 18,
          fontWeight: "bold"
        }
      },
      series: [{
        type: "pie",
        radius: ["45%", "70%"],
        center: ["50%", "45%"],
        avoidLabelOverlap: true,
        data: pieData.map((d) => ({ name: d.label, value: d.value })),
        label: showLabel ? { show: true, fontSize: 10, formatter: "{b}\n{d}%" } : { show: false },
        itemStyle: { borderColor: "#fff", borderWidth: 2 }
      }]
    };
  }
  function buildHistogramOption(chart, rows, binCount) {
    const col = chart.metric;
    if (!col) return {};
    const values = rows.map((r) => getNumericVal$1(r[col])).filter((n) => !isNaN(n));
    if (values.length === 0) return {};
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      return {
        toolbox: buildToolbox(),
        _mf: chart.metricFormats || {},
        tooltip: { trigger: "axis" },
        grid: { left: 50, right: 20, top: 10, bottom: 30 },
        xAxis: { type: "category", data: [fmtCompact$1(min)] },
        yAxis: { type: "value", min: 0 },
        series: [{ type: "bar", data: [values.length], itemStyle: { color: COLORS[2] } }]
      };
    }
    const numBins = Math.min(10, Math.max(5, Math.ceil(Math.sqrt(values.length))));
    const step = (max - min) / numBins;
    const bins = new Array(numBins).fill(0);
    const labels = [];
    for (let i = 0; i < numBins; i++) {
      const lo = min + step * i;
      const hi = min + step * (i + 1);
      labels.push(fmtCompact$1(lo) + "–" + fmtCompact$1(hi));
    }
    for (const v of values) {
      let idx = Math.floor((v - min) / step);
      if (idx >= numBins) idx = numBins - 1;
      bins[idx]++;
    }
    const maxLabelPx = labels.reduce((m, l) => {
      let w = 0;
      for (const ch of l) w += ch.charCodeAt(0) > 127 ? 11 : 6.5;
      return Math.max(m, w);
    }, 0);
    const rotateAngle = 35;
    const projectedHeight = Math.ceil(maxLabelPx * Math.sin(rotateAngle * Math.PI / 180));
    const gridBottom = Math.max(40, projectedHeight + 16);
    return {
      _mf: chart.metricFormats || {},
      toolbox: buildToolbox(),
      tooltip: { trigger: "axis", backgroundColor: "rgba(60,60,75,0.85)", borderColor: "#555", textStyle: { color: "#eee" } },
      grid: { left: 50, right: 20, top: 10, bottom: gridBottom },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { fontSize: 10, rotate: rotateAngle }
      },
      yAxis: { type: "value", min: 0 },
      series: [{
        type: "bar",
        data: bins,
        itemStyle: { borderRadius: [2, 2, 0, 0], color: COLORS[2] }
      }]
    };
  }
  function buildLineOption(chart, rows, areaFill = true, smooth = true) {
    const metricCols = chart.metrics || (chart.metric ? [chart.metric] : []);
    if (metricCols.length === 0) return {};
    let labels = [];
    let seriesData = {};
    if (chart.dateColumn) {
      const monthsSet = /* @__PURE__ */ new Set();
      for (const row of rows) {
        const dv = String(row[chart.dateColumn] || "").trim();
        const m = dv.match(/^(\d{4})[-/.](\d{1,2})/);
        if (!m) continue;
        const ym = m[1] + "-" + m[2].padStart(2, "0");
        monthsSet.add(ym);
        if (!seriesData[ym]) seriesData[ym] = {};
        for (const mc of metricCols) {
          if (!seriesData[ym][mc]) seriesData[ym][mc] = [];
          const v = getNumericVal$1(row[mc]);
          if (!isNaN(v)) seriesData[ym][mc].push(v);
        }
      }
      labels = Array.from(monthsSet).sort();
    } else if (chart.dimension) {
      for (const row of rows) {
        const key = String(row[chart.dimension] || "未知");
        if (!seriesData[key]) seriesData[key] = {};
        for (const mc of metricCols) {
          if (!seriesData[key][mc]) seriesData[key][mc] = [];
          const v = getNumericVal$1(row[mc]);
          if (!isNaN(v)) seriesData[key][mc].push(v);
        }
      }
      labels = Object.keys(seriesData).sort();
    } else {
      return {};
    }
    if (labels.length === 0) return {};
    const series = metricCols.map((mc, mi) => ({
      name: mc,
      type: "line",
      data: labels.map((l) => {
        const arr = seriesData[l]?.[mc] || [];
        const aggFn = chart.metricAggs?.[mc] || chart.agg || "sum";
        return applyAgg(arr, aggFn);
      }),
      smooth,
      lineStyle: { color: COLORS[mi % COLORS.length], width: 2 },
      itemStyle: { color: COLORS[mi % COLORS.length] },
      markPoint: {
        data: [
          { type: "max", name: "最大", symbolSize: 36, itemStyle: { color: "#EF4444" }, label: { show: false } },
          { type: "min", name: "最小", symbolSize: 30, itemStyle: { color: "#3B82F6" }, label: { show: false } }
        ]
      },
      areaStyle: areaFill ? { color: COLORS[mi % COLORS.length] + "22" } : void 0
    }));
    return {
      _mf: chart.metricFormats || {},
      toolbox: buildToolbox(),
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(60,60,75,0.85)",
        borderColor: "#555",
        textStyle: { color: "#eee", fontSize: 12 },
        formatter: (params) => {
          if (!Array.isArray(params)) return "";
          return params.map((p) => `${p.seriesName}: ${fmtByChart(p.value, chart, p.seriesName)}`).join("<br/>");
        }
      },
      legend: metricCols.length > 1 ? { top: 0, textStyle: { fontSize: 11 } } : void 0,
      grid: { left: 60, right: 20, top: metricCols.length > 1 ? 30 : 10, bottom: 60 },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { rotate: labels.length > 8 ? 30 : 0, fontSize: 11 }
      },
      yAxis: {
        type: "value",
        axisLabel: { fontSize: 11, formatter: (v) => fmtCompact$1(v) }
      },
      dataZoom: [{ type: "inside" }],
      series
    };
  }
  function getNumericVal(v) {
    if (v === void 0 || v === null || v === "") return NaN;
    if (typeof v === "number") return v;
    let s = String(v).trim();
    if (s.endsWith("%")) s = s.slice(0, -1);
    s = s.replace(/,/g, "");
    const n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  }
  function getPeriodKey(dateStr, period) {
    const m = dateStr.match(/^(\d{4})[-/.](\d{1,2})/);
    if (!m) return null;
    const y = m[1], mo = parseInt(m[2]);
    if (period === "year") return y;
    if (period === "quarter") return `${y}-Q${Math.ceil(mo / 3)}`;
    return `${y}-${String(mo).padStart(2, "0")}`;
  }
  function nextPeriodKeys(lastKey, period, count) {
    const result = [];
    if (period === "year") {
      let y = parseInt(lastKey);
      for (let i = 0; i < count; i++) result.push(String(++y));
    } else if (period === "quarter") {
      const [y, q] = lastKey.split("-Q").map(Number);
      let yr = y, qt = q;
      for (let i = 0; i < count; i++) {
        qt++;
        if (qt > 4) {
          qt = 1;
          yr++;
        }
        result.push(`${yr}-Q${qt}`);
      }
    } else {
      const [y, m] = lastKey.split("-").map(Number);
      let yr = y, mo = m;
      for (let i = 0; i < count; i++) {
        mo++;
        if (mo > 12) {
          mo = 1;
          yr++;
        }
        result.push(`${yr}-${String(mo).padStart(2, "0")}`);
      }
    }
    return result;
  }
  function computeTimeseries(rows, dateCol, metricCol, period = "month") {
    const groups = {};
    for (const row of rows) {
      const dv = String(row[dateCol] || "").trim();
      const key = getPeriodKey(dv, period);
      if (!key) continue;
      const v = getNumericVal(row[metricCol]);
      if (!isNaN(v)) groups[key] = (groups[key] || 0) + v;
    }
    const sortedKeys = Object.keys(groups).sort();
    if (sortedKeys.length < 2) return null;
    const labels = sortedKeys;
    const values = sortedKeys.map((k) => groups[k]);
    const ma = values.map((_, i) => {
      if (i < 2) return null;
      return (values[i - 2] + values[i - 1] + values[i]) / 3;
    });
    const mom = values.map((v, i) => {
      if (i === 0 || values[i - 1] === 0) return null;
      return (v - values[i - 1]) / Math.abs(values[i - 1]) * 100;
    });
    let yoy = [];
    if (period === "month" && labels.length > 12) {
      yoy = values.map((v, i) => {
        if (i < 12 || values[i - 12] === 0) return null;
        return (v - values[i - 12]) / Math.abs(values[i - 12]) * 100;
      });
    } else {
      yoy = values.map(() => null);
    }
    const n = values.length;
    const xs = values.map((_, i) => i);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = values.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (values[i] - meanY);
      den += (xs[i] - meanX) ** 2;
    }
    const slope = den !== 0 ? num / den : 0;
    const intercept = meanY - slope * meanX;
    const trend = values.map((_, i) => intercept + slope * i);
    const forecastCount = 3;
    const forecastLabels = nextPeriodKeys(labels[labels.length - 1], period, forecastCount);
    const forecastValues = forecastLabels.map((_, i) => intercept + slope * (n + i));
    return { labels, values, ma, mom, yoy, trend, forecast: { labels: forecastLabels, values: forecastValues } };
  }
  function fmtCompact(n) {
    const a = Math.abs(n);
    if (a >= 1e8) return (n / 1e8).toFixed(1) + "亿";
    if (a >= 1e4) return (n / 1e4).toFixed(1) + "万";
    return n.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
  }
  function computeDeciles(rows, metricCol) {
    const nums = rows.map((r) => getNumericVal(r[metricCol])).filter((n) => !isNaN(n)).sort((a, b) => a - b);
    if (nums.length < 10) return null;
    const bucketSize = Math.floor(nums.length / 10);
    const labels = [];
    const counts = [];
    const sums = [];
    const avgs = [];
    const ranges = [];
    for (let i = 0; i < 10; i++) {
      const start = i * bucketSize;
      const end = i === 9 ? nums.length : (i + 1) * bucketSize;
      const bucket = nums.slice(start, end);
      const sum = bucket.reduce((a, b) => a + b, 0);
      labels.push(`D${String(i + 1).padStart(2, "0")}`);
      counts.push(bucket.length);
      sums.push(sum);
      avgs.push(bucket.length > 0 ? sum / bucket.length : 0);
      ranges.push(`${fmtCompact(bucket[0])}–${fmtCompact(bucket[bucket.length - 1])}`);
    }
    return { labels, counts, sums, avgs, ranges };
  }
  function computeClusters(rows, metricCols, k = 3, xCol, yCol) {
    const colX = metricCols[0];
    const colY = metricCols[1] || metricCols[0];
    if (!colX || !colY) return null;
    const points = [];
    for (const row of rows) {
      const x = getNumericVal(row[colX]);
      const y = getNumericVal(row[colY]);
      if (!isNaN(x) && !isNaN(y)) {
        const label = String(Object.values(row)[0] ?? "");
        points.push({ x, y, label });
      }
    }
    if (points.length < k) return null;
    let centroids = [];
    const step = Math.floor(points.length / k);
    for (let i = 0; i < k; i++) {
      const idx = Math.min(i * step, points.length - 1);
      centroids.push({ x: points[idx].x, y: points[idx].y });
    }
    let assignments = new Array(points.length).fill(0);
    for (let iter = 0; iter < 20; iter++) {
      const newAssign = points.map((p) => {
        let minDist = Infinity, minC = 0;
        for (let c = 0; c < centroids.length; c++) {
          const d = (p.x - centroids[c].x) ** 2 + (p.y - centroids[c].y) ** 2;
          if (d < minDist) {
            minDist = d;
            minC = c;
          }
        }
        return minC;
      });
      if (newAssign.every((v, i) => v === assignments[i])) break;
      assignments = newAssign;
      const sums = centroids.map(() => ({ x: 0, y: 0, count: 0 }));
      for (let i = 0; i < points.length; i++) {
        const c = assignments[i];
        sums[c].x += points[i].x;
        sums[c].y += points[i].y;
        sums[c].count++;
      }
      centroids = sums.map(
        (s, i) => s.count > 0 ? { x: s.x / s.count, y: s.y / s.count } : centroids[i]
      );
    }
    return {
      points: points.map((p, i) => ({ ...p, cluster: assignments[i] })),
      centroids,
      colX,
      colY
    };
  }
  let MSG = {};
  function t(path, params) {
    const keys = path.split(".");
    let val = MSG;
    for (const k of keys) {
      if (val == null) break;
      val = val[k];
    }
    let result = typeof val === "string" ? val : path;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(`{${k}}`, String(v));
      }
    }
    return result;
  }
  let DATA;
  let filterValues = {};
  let condFilter = "", searchText = "";
  let sortCol = "", sortDir = false;
  let tblSearch = "", tblCond = "", tblTopN = 15;
  let tblCols = [];
  let chartInstances = [];
  let dateStart = "", dateEnd = "";
  function matchRow(row, p) {
    if (!p) return true;
    const cv = String(row[p.column] ?? "").trim();
    const cn = Number(cv.replace(/,/g, ""));
    const fn = Number(p.value.replace(/,/g, ""));
    const un = !isNaN(cn) && !isNaN(fn);
    switch (p.op) {
      case "eq":
        return un ? cn === fn : cv === p.value;
      case "ne":
        return un ? cn !== fn : cv !== p.value;
      case "gt":
        return un ? cn > fn : cv > p.value;
      case "gte":
        return un ? cn >= fn : cv >= p.value;
      case "lt":
        return un ? cn < fn : cv < p.value;
      case "lte":
        return un ? cn <= fn : cv <= p.value;
      case "in": {
        const list = p.value.replace(/^\[|\]$/g, "").replace(/^\(|\)$/g, "").replace(/["']/g, "").split(/[,，、;\s]+/).map((s) => s.trim()).filter(Boolean);
        return list.some((item) => {
          const itemNum = Number(item.replace(/,/g, ""));
          if (!isNaN(cn) && !isNaN(itemNum)) return cn === itemNum;
          return cv === item;
        });
      }
      case "contains":
        return cv.toLowerCase().includes(p.value.toLowerCase());
      default:
        return true;
    }
  }
  function applyConditionFilter(rows, expr) {
    if (!expr.trim()) return rows;
    const groups = expr.split("&").map((g) => g.trim()).filter((g) => g);
    if (!groups.length) return rows;
    const colMap = {};
    if (rows.length) for (const k of Object.keys(rows[0])) colMap[k.toLowerCase()] = k;
    for (const group of groups) {
      const orConds = group.split("|").map((c) => c.trim()).filter((c) => c).map(parseFilter).filter((p) => p !== null);
      for (const c of orConds) {
        const a = colMap[c.column.toLowerCase()];
        if (a) c.column = a;
      }
      if (orConds.length) rows = rows.filter((r) => orConds.some((p) => matchRow(r, p)));
    }
    return rows;
  }
  function getFilteredRows() {
    let rows = DATA.rows.slice();
    for (const col of Object.keys(filterValues)) {
      const v = filterValues[col];
      if (v && v !== "__all__") rows = rows.filter((r) => String(r[col] ?? "").trim() === v);
    }
    if (DATA.dateRange?.column && dateStart && dateEnd) {
      const dc = DATA.dateRange.column;
      rows = rows.filter((r) => {
        const d = String(r[dc] ?? "").trim();
        return d >= dateStart && d <= dateEnd;
      });
    }
    if (condFilter.trim()) rows = applyConditionFilter(rows, condFilter);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      rows = rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(q)));
    }
    return rows;
  }
  function renderFilterBar() {
    const bar = document.getElementById("filterBar");
    bar.innerHTML = "";
    DATA.filterSpecs.forEach((f) => {
      const lb = document.createElement("label");
      lb.textContent = f.column + ":";
      bar.appendChild(lb);
      const sel = document.createElement("select");
      const uv = {};
      DATA.rows.forEach((r) => {
        const v = String(r[f.column] ?? "").trim();
        if (v) uv[v] = true;
      });
      const vs = Object.keys(uv).sort();
      const o0 = document.createElement("option");
      o0.value = "";
      o0.textContent = t("common.all");
      sel.appendChild(o0);
      vs.forEach((v) => {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = v;
        sel.appendChild(o);
      });
      sel.value = filterValues[f.column] || "";
      sel.onchange = () => {
        filterValues[f.column] = sel.value;
        refreshAll();
      };
      bar.appendChild(sel);
    });
    const cf = document.createElement("input");
    cf.type = "text";
    cf.placeholder = t("dashboard.conditionPlaceholder") || "e.g. Amount > 100 & Region = Beijing";
    cf.style.cssText = "padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;min-width:200px";
    cf.oninput = () => {
      condFilter = cf.value;
      refreshAll();
    };
    bar.appendChild(cf);
    const si = document.createElement("input");
    si.type = "text";
    si.placeholder = "搜索...";
    si.style.cssText = "padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;width:120px";
    si.oninput = () => {
      searchText = si.value;
      refreshAll();
    };
    bar.appendChild(si);
    const rb = document.createElement("button");
    rb.className = "btn";
    rb.textContent = t("dashboard.resetFilter");
    rb.onclick = () => {
      filterValues = {};
      condFilter = "";
      searchText = "";
      cf.value = "";
      si.value = "";
      refreshAll();
    };
    bar.appendChild(rb);
    const sp = document.createElement("span");
    sp.className = "filter-count";
    sp.id = "fc";
    bar.appendChild(sp);
  }
  function renderDateRangeBar() {
    const dr = DATA.dateRange;
    const bar = document.getElementById("dateRangeBar");
    if (!dr || !dr.column) {
      bar.style.display = "none";
      return;
    }
    bar.style.display = "flex";
    bar.innerHTML = "";
    const lb = document.createElement("span");
    lb.className = "dr-label";
    lb.textContent = t("dashboard.timeSlice") + ": " + dr.column;
    bar.appendChild(lb);
    const si = document.createElement("input");
    si.type = "date";
    si.className = "dr-date-inp";
    si.min = dr.min;
    si.max = dr.max;
    si.value = dateStart;
    si.onchange = () => {
      dateStart = si.value;
      refreshAll();
    };
    bar.appendChild(si);
    const sp = document.createElement("span");
    sp.className = "dr-sep";
    sp.textContent = t("dashboard.to");
    bar.appendChild(sp);
    const ei = document.createElement("input");
    ei.type = "date";
    ei.className = "dr-date-inp";
    ei.min = dr.min;
    ei.max = dr.max;
    ei.value = dateEnd;
    ei.onchange = () => {
      dateEnd = ei.value;
      refreshAll();
    };
    bar.appendChild(ei);
    const info = document.createElement("span");
    info.className = "dr-info";
    info.id = "drInfo";
    bar.appendChild(info);
    const presets = buildDatePresets(dr);
    const pw = document.createElement("div");
    pw.className = "dr-presets";
    pw.id = "drPresets";
    presets.forEach((p) => {
      const btn = document.createElement("button");
      btn.className = "dr-preset";
      btn.textContent = p.label;
      btn.onclick = () => {
        dateStart = p.start;
        dateEnd = p.end;
        si.value = dateStart;
        ei.value = dateEnd;
        pw.querySelectorAll(".dr-preset").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        refreshAll();
      };
      if (dateStart === p.start && dateEnd === p.end) btn.classList.add("active");
      pw.appendChild(btn);
    });
    bar.appendChild(pw);
    updateDrInfo();
  }
  function buildDatePresets(dr) {
    const min = new Date(dr.min), max = new Date(dr.max);
    const totalMonths = (max.getFullYear() - min.getFullYear()) * 12 + (max.getMonth() - min.getMonth());
    const presets = [];
    if (totalMonths >= 3) {
      const s = new Date(max);
      s.setMonth(s.getMonth() - 3);
      presets.push({ label: t("dashboard.datePresets.last3Months"), start: s.toISOString().slice(0, 10), end: dr.max });
    }
    if (totalMonths >= 6) {
      const s = new Date(max);
      s.setMonth(s.getMonth() - 6);
      presets.push({ label: t("dashboard.datePresets.last6Months"), start: s.toISOString().slice(0, 10), end: dr.max });
    }
    const totalYears = Math.floor(totalMonths / 12);
    for (let y = 1; y <= totalYears; y++) {
      const s = new Date(max);
      s.setFullYear(s.getFullYear() - y);
      presets.push({ label: y === 1 ? t("dashboard.datePresets.last1Year") : t("dashboard.datePresets.lastNYears", { n: String(y) }), start: s.toISOString().slice(0, 10), end: dr.max });
    }
    presets.push({ label: t("dashboard.datePresets.all"), start: dr.min, end: dr.max });
    return presets;
  }
  function updateDrInfo() {
    const info = document.getElementById("drInfo");
    if (!info) return;
    const dr = DATA.dateRange;
    if (!dr?.column) return;
    let inRange = DATA.rows.length;
    if (dateStart && dateEnd) {
      inRange = DATA.rows.filter((r) => {
        const d = String(r[dr.column] ?? "").trim();
        return d >= dateStart && d <= dateEnd;
      }).length;
    }
    info.textContent = inRange + " / " + DATA.rows.length + " " + t("common.records");
  }
  function renderKpiCards(rows) {
    const el = document.getElementById("kpiRow");
    el.innerHTML = "";
    const bg = ["#EBF5FF", "#ECFDF5", "#FFFBEB", "#FEF2F2", "#F5F3FF", "#ECFEFF"];
    const tx = ["#1e40af", "#065f46", "#92400e", "#991b1b", "#5b21b6", "#155e75"];
    const ic = ["📊", "📈", "📋", "💰", "💵", "👥"];
    DATA.kpiSpecs.forEach((k, i) => {
      const vs = rows.map((r) => {
        const v = r[k.column];
        if (v == null || v === "") return 0;
        if (typeof v === "number") return v;
        return getNumericVal$1(v) || 0;
      });
      let val = 0;
      switch (k.agg) {
        case "count":
          val = rows.length;
          break;
        case "sum":
          val = vs.reduce((a, b) => a + b, 0);
          break;
        case "avg":
          val = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
          break;
        case "min":
          val = Math.min(...vs);
          break;
        case "max":
          val = Math.max(...vs);
          break;
        default:
          val = vs.reduce((a, b) => a + b, 0);
      }
      const dc = k.decimals != null ? k.decimals : 2;
      let dv = "";
      if (k.format === "percent") {
        const v2 = val <= 1 && val >= -1 ? val * 100 : val;
        dv = v2.toFixed(dc) + "%";
      } else if (k.format === "currency") {
        let cv = val, cs = "";
        if (k.unit === "wan") {
          cv = val / 1e4;
          cs = "万";
        } else if (k.unit === "yi") {
          cv = val / 1e8;
          cs = "亿";
        }
        dv = (k.prefix || "") + (k.prefix ? "" : "¥") + fmt(cv, cv >= 100 ? 0 : dc) + cs;
      } else if (k.format === "integer") dv = (k.prefix || "") + fmt(val, 0);
      else dv = (k.prefix || "") + fmt(val, dc);
      const card = document.createElement("div");
      card.className = "kpi-card";
      card.style.cssText = `background:${bg[i % bg.length]};color:${tx[i % tx.length]}`;
      card.innerHTML = `<div class="kpi-icon"><span>${ic[i % ic.length]}</span></div><div class="kpi-content"><span class="kpi-value">${dv}</span><span class="kpi-label">${k.label}</span></div>`;
      el.appendChild(card);
    });
  }
  function disposeCharts() {
    chartInstances.forEach((c) => {
      try {
        c.dispose();
      } catch (e) {
      }
    });
    chartInstances = [];
  }
  function initChart(dom, h) {
    if (typeof echarts === "undefined" || !echarts.init) return null;
    dom.style.height = h || "320px";
    const c = echarts.init(dom);
    chartInstances.push(c);
    window.addEventListener("resize", () => c.resize());
    return c;
  }
  function replaceChart(wrap, opt, h) {
    const divs = wrap.querySelectorAll("div");
    divs.forEach((d) => {
      const dc = chartInstances.find((c2) => c2?.getDom?.() === d);
      if (dc) {
        dc.dispose();
      }
      d.remove();
    });
    if (!opt) return null;
    const nd = document.createElement("div");
    nd.style.cssText = "position:absolute;inset:0";
    wrap.appendChild(nd);
    const c = echarts.init(nd);
    chartInstances.push(c);
    c.setOption(opt);
    return c;
  }
  function buildTsOption(td, chart) {
    const allL = td.labels.concat(td.forecast.labels);
    const aD = [...td.values, ...new Array(td.forecast.labels.length).fill(null)];
    const mD = [...td.ma, ...new Array(td.forecast.labels.length).fill(null)];
    const tD = [...td.trend, ...new Array(td.forecast.labels.length).fill(null)];
    const fD = [...new Array(td.labels.length - 1).fill(null), td.values[td.values.length - 1], ...td.forecast.values];
    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(60,60,75,0.85)",
        borderColor: "#555",
        textStyle: { color: "#eee" },
        formatter: (params) => {
          if (!Array.isArray(params)) return "";
          return params.filter((x) => x.value != null).map((x) => `${x.seriesName}: ${fmtByChart(x.value, chart, x.seriesName)}`).join("<br/>");
        }
      },
      legend: { top: 0, left: "center", textStyle: { fontSize: 11 } },
      grid: { left: 60, right: 20, top: 40, bottom: 60 },
      xAxis: { type: "category", data: allL, axisLabel: { rotate: 30, fontSize: 10 } },
      yAxis: { type: "value", axisLabel: { fontSize: 11, formatter: (v) => fmtCompact$1(v) } },
      dataZoom: [{ type: "inside" }],
      toolbox: buildToolbox(),
      series: [
        { name: t("chart.series.actual"), type: "line", data: aD, lineStyle: { color: COLORS[0], width: 2 }, itemStyle: { color: COLORS[0] }, areaStyle: { color: COLORS[0] + "22" }, smooth: true },
        { name: "MA3", type: "line", data: mD, lineStyle: { color: COLORS[2], width: 2, type: "dashed" }, itemStyle: { color: COLORS[2] }, smooth: true, symbol: "none" },
        { name: t("chart.series.trend"), type: "line", data: tD, lineStyle: { color: "#6B7280", width: 1.5, type: "dotted" }, itemStyle: { color: "#6B7280" }, smooth: false, symbol: "none" },
        { name: t("chart.series.forecast"), type: "line", data: fD, lineStyle: { color: "#10B981", width: 2, type: "dashed" }, itemStyle: { color: "#10B981" }, smooth: true, symbolSize: 6 }
      ]
    };
  }
  function buildDecileOption(dd, chart) {
    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(60,60,75,0.85)",
        borderColor: "#555",
        textStyle: { color: "#eee" },
        formatter: (params) => {
          if (!Array.isArray(params)) return "";
          return params.map((x) => `${x.seriesName}: ${fmtByChart(x.value, chart, x.seriesName)}`).join("<br/>");
        }
      },
      legend: { top: 0, left: "center", textStyle: { fontSize: 11 } },
      grid: { left: 60, right: 60, top: 50, bottom: 30 },
      xAxis: { type: "category", data: dd.labels, axisLabel: { fontSize: 11 } },
      yAxis: [
        { type: "value", position: "left", name: t("chart.series.sum"), axisLabel: { fontSize: 10, formatter: (v) => fmtCompact$1(v) } },
        { type: "value", position: "right", name: t("chart.series.count"), splitLine: { show: false }, axisLabel: { fontSize: 10 } }
      ],
      toolbox: buildToolbox(),
      series: [
        { name: t("chart.series.sum"), type: "bar", yAxisIndex: 0, data: dd.sums, itemStyle: { color: COLORS[0], borderRadius: [3, 3, 0, 0] }, z: 2 },
        { name: t("chart.series.count"), type: "line", yAxisIndex: 1, data: dd.counts, lineStyle: { color: COLORS[3], width: 2 }, itemStyle: { color: COLORS[3] }, smooth: true, symbolSize: 8, z: 1 }
      ]
    };
  }
  function buildClusterOption(cd, chart) {
    const clusters = {};
    cd.points.forEach((p) => {
      if (!clusters[p.cluster]) clusters[p.cluster] = [];
      clusters[p.cluster].push([p.x, p.y]);
    });
    const cIds = Object.keys(clusters).map(Number).sort((a, b) => a - b);
    const series = cIds.map((ci) => ({
      name: t("chart.series.clusterN", { n: String(ci + 1) }),
      type: "scatter",
      data: clusters[ci],
      symbolSize: 8,
      itemStyle: { color: COLORS[ci % COLORS.length] + "99", borderColor: COLORS[ci % COLORS.length], borderWidth: 1 }
    }));
    series.push({
      name: t("chart.series.clusterCenter"),
      type: "scatter",
      data: cd.centroids.map((c) => [c.x, c.y]),
      symbolSize: 18,
      symbol: "diamond",
      itemStyle: { color: "#1a202c", borderColor: "#fff", borderWidth: 2 },
      z: 10
    });
    return {
      tooltip: { formatter: (p) => {
        const xy = p.value;
        return `${p.seriesName}<br/>X: ${fmtCompact$1(xy[0])}<br/>Y: ${fmtCompact$1(xy[1])}`;
      } },
      legend: { top: 0, left: "center", textStyle: { fontSize: 11 } },
      grid: { left: 80, right: 20, top: 40, bottom: 50 },
      xAxis: { type: "value", name: cd.colX, nameLocation: "center", nameGap: 34, nameTextStyle: { fontSize: 13, fontWeight: "bold" }, axisLabel: { fontSize: 10, formatter: (v) => fmtCompact$1(v) } },
      yAxis: { type: "value", name: cd.colY, nameLocation: "center", nameGap: 56, nameTextStyle: { fontSize: 13, fontWeight: "bold" }, axisLabel: { fontSize: 10, formatter: (v) => fmtCompact$1(v) } },
      toolbox: buildToolbox(),
      series
    };
  }
  function renderCharts(rows) {
    const grid = document.getElementById("chartsGrid");
    disposeCharts();
    grid.innerHTML = "";
    DATA.chartSpecs.forEach((ch, i) => {
      try {
        const cRows = ch.filter ? applyFilter(rows, void 0, ch.filter) : rows;
        const isAn = ch.type === "timeseries" || ch.type === "decile" || ch.type === "cluster";
        const card = document.createElement("div");
        card.className = isAn ? "chart-card chart-card-full" : "chart-card";
        card.setAttribute("data-chart-idx", String(i));
        card.ondblclick = (e) => {
          e.stopPropagation();
          toggleFullscreen(card);
        };
        const ms0 = ch.metrics && ch.metrics.length > 0 ? ch.metrics : ch.metric ? [ch.metric] : [];
        const h3 = document.createElement("h3");
        h3.textContent = resolveTitle(ch.title, ms0);
        card.appendChild(h3);
        if (ch.type === "timeseries") {
          const ms = ms0;
          const activeM = ch.metric || ms[0];
          if (ms.length > 1) {
            const mb = document.createElement("div");
            mb.className = "metric-btns";
            ms.forEach((m) => {
              const b = document.createElement("button");
              b.className = "metric-btn" + (m === activeM ? " active" : "");
              b.textContent = m;
              b.onclick = () => {
                mb.querySelectorAll(".metric-btn").forEach((bb) => bb.classList.remove("active"));
                b.classList.add("active");
                h3.textContent = resolveTitle(ch.title, [m]);
                renderTsChart(card, ch, cRows, m, "month");
              };
              mb.appendChild(b);
            });
            card.appendChild(mb);
          }
          const pt = document.createElement("div");
          pt.className = "period-toggle";
          [{ k: "month", l: "月" }, { k: "quarter", l: "季" }, { k: "year", l: "年" }].forEach((pd) => {
            const b = document.createElement("button");
            b.className = "period-btn" + (pd.k === "month" ? " active" : "");
            b.textContent = pd.l;
            b.setAttribute("data-pd", pd.k);
            b.onclick = () => {
              pt.querySelectorAll(".period-btn").forEach((bb) => bb.classList.remove("active"));
              b.classList.add("active");
              const curM = card.querySelector(".metric-btn.active");
              renderTsChart(card, ch, cRows, curM ? curM.textContent : activeM, pd.k);
            };
            pt.appendChild(b);
          });
          card.appendChild(pt);
          const tsWrap = document.createElement("div");
          tsWrap.className = "chart-body-ts";
          tsWrap.id = "chart-ts-" + i;
          card.appendChild(tsWrap);
          grid.appendChild(card);
          renderTsChart(card, ch, cRows, activeM, "month");
        } else if (ch.type === "decile") {
          const dm = ms0;
          const dActive = ch.metric || dm[0];
          const dmb = document.createElement("div");
          dmb.className = "metric-btns";
          dm.forEach((m) => {
            const b = document.createElement("button");
            b.className = "metric-btn" + (m === dActive ? " active" : "");
            b.textContent = m;
            b.onclick = () => {
              dmb.querySelectorAll(".metric-btn").forEach((bb) => bb.classList.remove("active"));
              b.classList.add("active");
              h3.textContent = resolveTitle(ch.title, [m]);
              renderDecileChartContent(card, ch, cRows, m);
            };
            dmb.appendChild(b);
          });
          card.appendChild(dmb);
          const dw = document.createElement("div");
          dw.className = "chart-body-ts";
          dw.id = "chart-dec-" + i;
          card.appendChild(dw);
          grid.appendChild(card);
          renderDecileChartContent(card, ch, cRows, dActive);
        } else if (ch.type === "cluster") {
          const cm = ch.clusterMetrics && ch.clusterMetrics.length > 0 ? ch.clusterMetrics : ch.metrics || [];
          if (cm.length > 2) {
            const as = document.createElement("div");
            as.className = "axis-selector";
            const xg = document.createElement("div");
            xg.innerHTML = "<label>X 轴</label>";
            const xs = document.createElement("select");
            cm.forEach((m) => {
              const o = document.createElement("option");
              o.value = m;
              o.textContent = m;
              xs.appendChild(o);
            });
            xs.value = cm[0];
            xg.appendChild(xs);
            as.appendChild(xg);
            const yg = document.createElement("div");
            yg.innerHTML = "<label>Y 轴</label>";
            const ys = document.createElement("select");
            cm.forEach((m) => {
              const o = document.createElement("option");
              o.value = m;
              o.textContent = m;
              ys.appendChild(o);
            });
            ys.value = cm[1] || cm[0];
            yg.appendChild(ys);
            as.appendChild(yg);
            xs.onchange = () => {
              h3.textContent = resolveTitle(ch.title, [xs.value, ys.value]);
              renderClusterChartContent(card, ch, cRows, xs.value, ys.value);
            };
            ys.onchange = () => {
              h3.textContent = resolveTitle(ch.title, [xs.value, ys.value]);
              renderClusterChartContent(card, ch, cRows, xs.value, ys.value);
            };
            card.appendChild(as);
            const cw = document.createElement("div");
            cw.className = "chart-body-cl";
            cw.id = "chart-cl-" + i;
            card.appendChild(cw);
            grid.appendChild(card);
            renderClusterChartContent(card, ch, cRows, cm[0], cm[1] || cm[0]);
          } else {
            const cw = document.createElement("div");
            cw.className = "chart-body-cl";
            cw.id = "chart-cl-" + i;
            card.appendChild(cw);
            grid.appendChild(card);
            renderClusterChartContent(card, ch, cRows, cm[0], cm[1] || cm[0]);
          }
        } else {
          const bm = ms0;
          const activeBms = bm.slice();
          if (bm.length > 1) {
            const bmb = document.createElement("div");
            bmb.className = "metric-btns";
            if (ch.type === "doughnut" || ch.type === "histogram") {
              const ms = document.createElement("select");
              ms.style.cssText = "padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px";
              bm.forEach((m) => {
                const o = document.createElement("option");
                o.value = m;
                o.textContent = m;
                ms.appendChild(o);
              });
              ms.onchange = () => {
                const mc = ms.value;
                h3.textContent = resolveTitle(ch.title, [mc]);
                let opt2 = null;
                if (ch.type === "doughnut") opt2 = buildDoughnutOption({ ...ch, metric: mc }, cRows);
                else opt2 = buildHistogramOption({ ...ch, metric: mc }, cRows);
                const wrap2 = card.querySelector(".chart-body");
                replaceChart(wrap2, opt2);
              };
              bmb.appendChild(ms);
            } else {
              bm.forEach((m) => {
                const b = document.createElement("button");
                b.className = "metric-btn active";
                b.textContent = m;
                b.onclick = () => {
                  if (activeBms.length > 1 || !b.classList.contains("active")) {
                    b.classList.toggle("active");
                  }
                  activeBms.length = 0;
                  bmb.querySelectorAll(".metric-btn.active").forEach((ab) => activeBms.push(ab.textContent));
                  h3.textContent = resolveTitle(ch.title, activeBms);
                  let opt2 = null;
                  if (ch.type === "bar") opt2 = buildBarOption({ ...ch, metrics: activeBms.slice() }, cRows, sortOrder, showLabel);
                  else if (ch.type === "horizontal_bar") opt2 = buildHorizontalBarOption({ ...ch, metrics: activeBms.slice() }, cRows, sortOrder, showLabel);
                  else opt2 = buildLineOption({ ...ch, metrics: activeBms.slice() }, cRows);
                  const wrap2 = card.querySelector(".chart-body");
                  replaceChart(wrap2, opt2);
                };
                bmb.appendChild(b);
              });
            }
            ;
            card.appendChild(bmb);
          }
          let showLabel = true, sortOrder = "none";
          if (ch.type === "bar" || ch.type === "horizontal_bar") {
            const stb = document.createElement("div");
            stb.style.cssText = "display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap";
            const sl = document.createElement("select");
            sl.style.cssText = "padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px";
            [{ v: "none", l: "自然" }, { v: "asc", l: "升序" }, { v: "desc", l: "降序" }].forEach((o) => {
              const op = document.createElement("option");
              op.value = o.v;
              op.textContent = o.l;
              sl.appendChild(op);
            });
            sl.onchange = () => {
              sortOrder = sl.value;
              const curMetrics = activeBms.length ? activeBms : bm;
              let opt2 = null;
              if (ch.type === "bar") opt2 = buildBarOption({ ...ch, metrics: curMetrics.slice() }, cRows, sortOrder, showLabel);
              else opt2 = buildHorizontalBarOption({ ...ch, metrics: curMetrics.slice() }, cRows, sortOrder, showLabel);
              const wrap2 = card.querySelector(".chart-body");
              replaceChart(wrap2, opt2);
            };
            stb.appendChild(sl);
            const lb = document.createElement("button");
            lb.textContent = "标签";
            lb.style.cssText = "padding:4px 12px;border-radius:16px;border:1px solid #e2e8f0;background:#3B82F6;color:#fff;font-size:12px;cursor:pointer";
            lb.onclick = () => {
              showLabel = !showLabel;
              lb.style.background = showLabel ? "#3B82F6" : "#fff";
              lb.style.color = showLabel ? "#fff" : "#4a5568";
              const curMetrics = activeBms.length ? activeBms : bm;
              let opt2 = null;
              if (ch.type === "bar") opt2 = buildBarOption({ ...ch, metrics: curMetrics.slice() }, cRows, sortOrder, showLabel);
              else opt2 = buildHorizontalBarOption({ ...ch, metrics: curMetrics.slice() }, cRows, sortOrder, showLabel);
              const wrap2 = card.querySelector(".chart-body");
              replaceChart(wrap2, opt2);
            };
            stb.appendChild(lb);
            card.appendChild(stb);
          }
          const wrap = document.createElement("div");
          wrap.className = "chart-body";
          wrap.id = "chart-basic-" + i;
          card.appendChild(wrap);
          grid.appendChild(card);
          let opt = null;
          if (ch.type === "bar") opt = buildBarOption({ ...ch, metrics: bm }, cRows, "none", true);
          else if (ch.type === "horizontal_bar") opt = buildHorizontalBarOption({ ...ch, metrics: bm }, cRows, "none", true);
          else if (ch.type === "doughnut") opt = buildDoughnutOption(ch, cRows);
          else if (ch.type === "histogram") opt = buildHistogramOption(ch, cRows);
          else if (ch.type === "line") opt = buildLineOption(ch, cRows);
          if (opt) {
            const c = initChart(wrap, "320px");
            if (c) c.setOption(opt);
          }
        }
      } catch (e) {
        console.error(e);
      }
    });
  }
  let fsCard = null;
  function toggleFullscreen(card) {
    if (fsCard && fsCard !== card) fsCard.classList.remove("is-fullscreen");
    card.classList.toggle("is-fullscreen");
    fsCard = card.classList.contains("is-fullscreen") ? card : null;
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && fsCard) {
      fsCard.classList.remove("is-fullscreen");
      fsCard = null;
    }
  });
  function renderTsChart(card, ch, rows, mc, pd) {
    removeOldChart(card, ".chart-body-ts");
    const wrap = document.createElement("div");
    wrap.className = "chart-body-ts";
    wrap.id = "chart-ts-" + card.getAttribute("data-chart-idx");
    card.appendChild(wrap);
    removeOldElements(card);
    const td = computeTimeseries(rows, ch.dateColumn || "", mc, pd);
    if (!td) {
      wrap.textContent = t("chart.insufficientData", { name: t("chart.timeseries") });
      return;
    }
    const opt = buildTsOption(td, ch);
    const c = initChart(wrap, "360px");
    if (c) c.setOption(opt);
    const info = document.createElement("div");
    info.className = "ts-info";
    const lastM = td.mom[td.mom.length - 1], lastY = td.yoy[td.yoy.length - 1];
    info.innerHTML = `<span>最新: <strong>${td.labels[td.labels.length - 1]}</strong></span><span>值: <strong>${fmt(td.values[td.values.length - 1])}</strong></span>` + (lastM != null ? `<span>环比: <strong style="color:${lastM >= 0 ? "#10B981" : "#EF4444"}">${lastM >= 0 ? "+" : ""}${lastM.toFixed(1)}%</strong></span>` : "") + (lastY != null ? `<span>同比: <strong style="color:${lastY >= 0 ? "#10B981" : "#EF4444"}">${lastY >= 0 ? "+" : ""}${lastY.toFixed(1)}%</strong></span>` : "") + (td.forecast.values.length > 0 ? `<span>下期预测: <strong>${fmt(td.forecast.values[0])}</strong></span>` : "");
    card.appendChild(info);
    renderTsDetailTable(card, td);
  }
  function renderTsDetailTable(card, td) {
    const dtWrap = document.createElement("div");
    dtWrap.className = "ts-detail-wrap";
    dtWrap.style.display = "none";
    let html = '<table class="detail-table"><thead><tr><th>周期</th><th>实际值</th><th title="3期移动平均：当前值与之前2期的平均值">MA3</th><th>环比%</th><th>同比%</th><th>趋势</th><th>预测</th></tr></thead><tbody>';
    td.labels.forEach((l, j) => {
      const mv = td.mom[j], yv = td.yoy[j];
      const mc = mv != null ? mv >= 0 ? "#10B981" : "#EF4444" : "", yc = yv != null ? yv >= 0 ? "#10B981" : "#EF4444" : "";
      html += `<tr><td>${l}</td><td>${fmt(td.values[j])}</td><td>${td.ma[j] != null ? fmt(td.ma[j]) : "—"}</td><td style="color:${mc}">${mv != null ? (mv >= 0 ? "+" : "") + mv.toFixed(1) + "%" : "—"}</td><td style="color:${yc}">${yv != null ? (yv >= 0 ? "+" : "") + yv.toFixed(1) + "%" : "—"}</td><td>${fmt(td.trend[j])}</td><td>—</td></tr>`;
    });
    if (td.forecast.labels.length > 0) {
      td.forecast.labels.forEach((fl, fi) => {
        html += `<tr><td>${fl} (预测)</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td class="ts-forecast">${fmt(td.forecast.values[fi])}</td></tr>`;
      });
    }
    html += "</tbody></table>";
    dtWrap.innerHTML = html;
    card.appendChild(dtWrap);
    const tg = document.createElement("button");
    tg.className = "detail-toggle";
    tg.textContent = t("common.expand");
    tg.onclick = () => {
      const s = dtWrap.style.display !== "none";
      dtWrap.style.display = s ? "none" : "";
      tg.textContent = s ? t("common.expand") : t("common.collapse");
    };
    card.appendChild(tg);
  }
  function renderDecileChartContent(card, ch, rows, mc) {
    removeOldChart(card, ".chart-body-ts");
    const wrap = document.createElement("div");
    wrap.className = "chart-body-ts";
    wrap.id = "chart-dec-" + card.getAttribute("data-chart-idx");
    card.appendChild(wrap);
    removeOldElements(card);
    const dd = computeDeciles(rows, mc);
    if (!dd) {
      wrap.textContent = t("chart.insufficientData", { name: t("chart.decile") });
      return;
    }
    const opt = buildDecileOption(dd, ch);
    const c = initChart(wrap, "360px");
    if (c) c.setOption(opt);
    const dtWrap = document.createElement("div");
    dtWrap.className = "ts-detail-wrap";
    dtWrap.style.display = "none";
    let html = '<table class="detail-table"><thead><tr><th>分组</th><th>数量</th><th>合计</th><th>平均</th><th>范围</th></tr></thead><tbody>';
    dd.labels.forEach((l, i) => {
      html += `<tr><td>${l}</td><td>${dd.counts[i]}</td><td>${fmt(dd.sums[i])}</td><td>${fmt(dd.avgs[i])}</td><td>${dd.ranges[i]}</td></tr>`;
    });
    html += "</tbody></table>";
    dtWrap.innerHTML = html;
    card.appendChild(dtWrap);
    const dg = document.createElement("button");
    dg.className = "detail-toggle";
    dg.textContent = "展开明细表 ↓";
    dg.onclick = () => {
      const s = dtWrap.style.display !== "none";
      dtWrap.style.display = s ? "none" : "";
      dg.textContent = s ? "展开明细表 ↓" : "收起明细 ↑";
    };
    card.appendChild(dg);
  }
  function renderClusterChartContent(card, ch, rows, xCol, yCol) {
    removeOldChart(card, ".chart-body-cl");
    const wrap = document.createElement("div");
    wrap.className = "chart-body-cl";
    wrap.id = "chart-cl-" + card.getAttribute("data-chart-idx");
    card.appendChild(wrap);
    removeOldElements(card);
    const k = ch.k || 3;
    const cd = computeClusters(rows, [xCol, yCol], k);
    if (!cd) {
      wrap.textContent = t("chart.insufficientData", { name: t("chart.cluster") });
      return;
    }
    const opt = buildClusterOption(cd);
    const c = initChart(wrap, "380px");
    if (c) c.setOption(opt);
    const sum = {};
    cd.points.forEach((p) => {
      if (!sum[p.cluster]) sum[p.cluster] = { count: 0, sx: 0, sy: 0 };
      sum[p.cluster].count++;
      sum[p.cluster].sx += p.x;
      sum[p.cluster].sy += p.y;
    });
    const csDiv = document.createElement("div");
    csDiv.className = "cluster-summary";
    const cIds = Object.keys(sum).map(Number).sort((a, b) => a - b);
    cIds.forEach((ci) => {
      const s = sum[ci];
      csDiv.innerHTML += `<span class="summary-chip" style="border-color:${COLORS[ci % COLORS.length]}"><strong>聚类 ${ci + 1}</strong> ${s.count} 个 · 中心 (${fmtCompact$1(s.sx / s.count)}, ${fmtCompact$1(s.sy / s.count)})</span>`;
    });
    card.appendChild(csDiv);
    const dtWrap = document.createElement("div");
    dtWrap.className = "ts-detail-wrap";
    dtWrap.style.display = "none";
    let html = `<table class="detail-table"><thead><tr><th>标签</th><th>${cd.colX}</th><th>${cd.colY}</th><th>聚类</th></tr></thead><tbody>`;
    cd.points.forEach((p) => {
      html += `<tr><td>${p.label}</td><td>${fmtCompact$1(p.x)}</td><td>${fmtCompact$1(p.y)}</td><td><span style="display:inline-block;padding:2px 8px;border-radius:4px;color:white;background:${COLORS[p.cluster % COLORS.length]}">聚类${p.cluster + 1}</span></td></tr>`;
    });
    html += "</tbody></table>";
    dtWrap.innerHTML = html;
    card.appendChild(dtWrap);
    const cg = document.createElement("button");
    cg.className = "detail-toggle";
    cg.textContent = "展开明细表 ↓";
    cg.onclick = () => {
      const s = dtWrap.style.display !== "none";
      dtWrap.style.display = s ? "none" : "";
      cg.textContent = s ? "展开明细表 ↓" : "收起明细 ↑";
    };
    card.appendChild(cg);
  }
  function removeOldChart(card, selector) {
    const old = card.querySelector(selector);
    if (old) {
      const cid = old.id;
      const oldC = chartInstances.find((c) => c?.getDom?.()?.id === cid);
      if (oldC) oldC.dispose();
      old.remove();
    }
  }
  function removeOldElements(card) {
    const els = card.querySelectorAll(".ts-info,.ts-detail-wrap,.detail-toggle,.cluster-summary");
    els.forEach((e) => e.remove());
  }
  function renderTable(rows) {
    const el = document.getElementById("tableCard");
    el.innerHTML = "";
    const tb = document.createElement("div");
    tb.style.cssText = "display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap";
    const th3 = document.createElement("h3");
    th3.style.cssText = "margin:0;font-size:15px";
    tb.appendChild(th3);
    el.appendChild(tb);
    const tbs = document.createElement("input");
    tbs.type = "text";
    tbs.placeholder = t("common.searchEllipsis");
    tbs.style.cssText = "padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;width:120px";
    tbs.oninput = () => {
      tblSearch = tbs.value;
      renderTableContent(rows, el, tb);
    };
    tb.appendChild(tbs);
    const tbc = document.createElement("input");
    tbc.type = "text";
    tbc.placeholder = t("dashboard.conditionPlaceholderShort") || "Amount > 100";
    tbc.style.cssText = "padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;width:160px";
    tbc.oninput = () => {
      tblCond = tbc.value;
      renderTableContent(rows, el, tb);
    };
    tb.appendChild(tbc);
    const tbn = document.createElement("input");
    tbn.type = "number";
    tbn.value = String(tblTopN);
    tbn.min = "5";
    tbn.max = "500";
    tbn.style.cssText = "padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;width:60px";
    tbn.onchange = () => {
      tblTopN = parseInt(tbn.value) || 15;
      renderTableContent(rows, el, tb);
    };
    tb.appendChild(tbn);
    const ccp = document.createElement("details");
    ccp.style.cssText = "font-size:12px";
    const ccs = document.createElement("summary");
    ccs.textContent = `${t("dashboard.columnsLabel")} (${tblCols.length}/${DATA.tableColumns.length})`;
    ccp.appendChild(ccs);
    const ccd = document.createElement("div");
    ccd.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin-top:4px";
    DATA.tableColumns.forEach((c) => {
      const l = document.createElement("label");
      l.style.cssText = "padding:2px 8px;border-radius:4px;font-size:11px;border:1px solid #e2e8f0;cursor:pointer;user-select:none;" + (tblCols.includes(c) ? "background:#3B82F6;color:white;border-color:#3B82F6" : "");
      l.textContent = c;
      l.onclick = () => {
        const idx = tblCols.indexOf(c);
        if (idx !== -1) tblCols.splice(idx, 1);
        else tblCols.push(c);
        ccs.textContent = `${t("dashboard.columnsLabel")} (${tblCols.length}/${DATA.tableColumns.length})`;
        renderTableContent(rows, el, tb);
      };
      ccd.appendChild(l);
    });
    ccp.appendChild(ccd);
    tb.appendChild(ccp);
    renderTableContent(rows, el, tb);
  }
  function renderTableContent(rows, el, tb) {
    const ot = el.querySelector("div:not(:first-child)");
    if (ot) ot.remove();
    let filtered = rows.slice();
    if (tblSearch.trim()) {
      const q = tblSearch.trim().toLowerCase();
      filtered = filtered.filter((r) => tblCols.some((c) => {
        const v = r[c];
        return v != null && String(v).toLowerCase().includes(q);
      }));
    }
    if (tblCond.trim()) filtered = applyConditionFilter(filtered, tblCond);
    const sorted = filtered.slice();
    if (sortCol) {
      sorted.sort((a, b) => {
        const va = getNumericVal$1(a[sortCol]), vb = getNumericVal$1(b[sortCol]);
        if (!isNaN(va) && !isNaN(vb)) return (va - vb) * (sortDir ? -1 : 1);
        return String(a[sortCol] ?? "").localeCompare(String(b[sortCol] ?? "")) * (sortDir ? -1 : 1);
      });
    }
    const sl = sorted.slice(0, tblTopN);
    const h3 = tb.querySelector("h3");
    h3.textContent = `${t("dashboard.dataTable")} · ${Math.min(sl.length, tblTopN)} / ${filtered.length} ${t("common.rows")}`;
    const tw = document.createElement("div");
    tw.style.overflowX = "auto";
    let html = '<table><thead><tr><th class="rn">#</th>';
    tblCols.forEach((c) => {
      const ind = sortCol === c ? sortDir ? " ↓" : " ↑" : "";
      html += `<th onclick="window._sortTable('${c}')">${c}${ind}</th>`;
    });
    html += "</tr></thead><tbody>";
    sl.forEach((r, i) => {
      html += `<tr><td class="rn">${i + 1}</td>`;
      tblCols.forEach((c) => {
        let v = r[c];
        if (v == null || v === "") v = "—";
        else {
          const cl = DATA.classifications[c];
          if (cl?.type === "numeric" && cl?.role === "metric") {
            const n = getNumericVal$1(v);
            if (!isNaN(n)) {
              const md = DATA.metricDefaults[c];
              if (md && md.format && md.format !== "global") v = fmtByChart(n, { metricFormats: DATA.metricDefaults }, c);
              else v = fmt(n);
            }
          }
        }
        html += `<td>${v}</td>`;
      });
      html += "</tr>";
    });
    html += "</tbody></table>";
    tw.innerHTML = html;
    el.appendChild(tw);
  }
  window._sortTable = (c) => {
    if (sortCol === c) sortDir = !sortDir;
    else {
      sortCol = c;
      sortDir = false;
    }
    refreshAll();
  };
  function refreshAll() {
    const rows = getFilteredRows();
    renderKpiCards(rows);
    renderCharts(rows);
    renderTable(rows);
    const fc = document.getElementById("fc");
    if (fc) fc.textContent = `${t("common.currentFilter")}: ${rows.length} ${t("common.records")}`;
    updateDrInfo();
  }
  function initDashboard(data) {
    DATA = data;
    MSG = typeof __I18N__ !== "undefined" ? __I18N__ : {};
    sortCol = data.tableSortBy;
    sortDir = false;
    tblTopN = data.tableTopN;
    tblCols = data.tableColumns.slice();
    dateStart = data.dateStart;
    dateEnd = data.dateEnd;
    renderFilterBar();
    renderDateRangeBar();
    refreshAll();
  }
  window.initDashboard = initDashboard;
  exports.initDashboard = initDashboard;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
})({});
