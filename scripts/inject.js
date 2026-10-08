// Temu 商家中心销售管理页注入函数库
// 用法：agent 用 bu.js() 执行本文件内容（一次注入全部函数）。
// 注意：页面刷新 / 会话过期后全部丢失，需重新注入。
// 页面：https://agentseller.temu.com/stock/fully-mgt/sale-manage/main
// 前置：已进入「销售管理」→ 高级排序筛选：近30天销量、降序；销售趋势分SKU展示。

(function () {
  // ---------- 通用 fiber 遍历 ----------
  function __walkFiber(root, pred, maxDepth) {
    var stack = [{ n: root, d: 0 }];
    while (stack.length) {
      var cur = stack.pop();
      if (!cur.n) continue;
      if (cur.d > (maxDepth || 200)) continue;
      var p = cur.n.memoizedProps;
      if (p && pred(p)) return p;
      stack.push({ n: cur.n.sibling, d: cur.d });
      stack.push({ n: cur.n.child, d: cur.d + 1 });
    }
    return null;
  }
  function __anyEl(pred) {
    var all = document.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      var k = Object.keys(all[i]).find(function (x) { return x.indexOf("__reactFiber$") === 0; });
      if (k) {
        var p = __walkFiber(all[i][k], pred);
        if (p) return p;
      }
    }
    return null;
  }
  // ---------- SKC 记录提取（列表页） ----------
  // 命中条件：p.record 且 record.skuQuantityDetailList 数组且 productSkcId
  window.__extractPage = function () {
    var out = [];
    var all = document.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      var k = Object.keys(all[i]).find(function (x) { return x.indexOf("__reactFiber$") === 0; });
      if (!k) continue;
      var p = __walkFiber(all[i][k], function (p) {
        return p.record && Array.isArray(p.record.skuQuantityDetailList) && p.record.productSkcId;
      });
      if (p) {
        var r = p.record;
        var skus = (r.skuQuantityDetailList || []).map(function (s) {
          return {
            className: s.className,
            skuId: String(s.productSkuId),
            today: s.todaySaleVolume || 0,
            d7: s.lastSevenDaysSaleVolume || 0,
            d30: s.lastThirtyDaysSaleVolume || 0,
            total: s.totalSaleVolume || 0,
          };
        });
        var rec = {
          skcId: String(r.productSkcId),
          name: r.productName || "",
          skus: skus,
        };
        if (!out.some(function (x) { return x.skcId === rec.skcId; })) out.push(rec);
      }
    }
    return out;
  };
  // ---------- 分页 ----------
  window.__curPage = function () {
    var a = document.querySelector(".PGT_pagerItemActive");
    return a ? parseInt(a.textContent, 10) : null;
  };
  window.__pageCount = function () {
    var items = document.querySelectorAll(".PGT_pagerItem");
    var nums = [];
    items.forEach(function (i) {
      var n = parseInt(i.textContent, 10);
      if (!isNaN(n)) nums.push(n);
    });
    return nums.length ? Math.max.apply(null, nums) : null;
  };
  window.__clickPageNum = function (n) {
    var items = document.querySelectorAll(".PGT_pagerItem");
    for (var i = 0; i < items.length; i++) {
      if (parseInt(items[i].textContent, 10) === n) { items[i].click(); return true; }
    }
    // 下一页按钮
    var next = document.querySelector(".PGT_next");
    if (next) { next.click(); return true; }
    return false;
  };
  // ---------- 逐日数据（销售趋势弹窗图表） ----------
  // 命中：.rox-charts-for-react 元素 fiber 链上，hooks 状态里长度=31×SKU数的数组
  // 元素形如 {date:"YYYY-MM-DD", prodSkuId, salesNumber, isPredict, soldOut}
  window.__extractDaily = function () {
    var chart = document.querySelector(".rox-charts-for-react");
    if (!chart) return { ok: false, msg: "no chart" };
    var k = Object.keys(chart).find(function (x) { return x.indexOf("__reactFiber$") === 0; });
    if (!k) return { ok: false, msg: "no fiber" };
    var f = chart[k];
    // 沿 hook 链收集所有数组，找符合日期结构的
    var hooks = [];
    var node = f.memoizedState;
    while (node) {
      var v = node.memoizedState;
      if (Array.isArray(v) && v.length && v[0] && typeof v[0] === "object" && v[0].date && "salesNumber" in v[0]) {
        hooks.push(v);
      }
      node = node.next;
    }
    if (!hooks.length) return { ok: false, msg: "no daily array" };
    hooks.sort(function (a, b) { return b.length - a.length; });
    return { ok: true, arr: hooks[0], len: hooks[0].length };
  };
  // ---------- 销售趋势弹窗控制 ----------
  window.__clickTrend = function (i) {
    // 点击第 i 个商品行的「销售趋势」操作（列表页行内按钮文本含"销售趋势"）
    var btns = document.querySelectorAll("button, span, a");
    var hit = null, cnt = 0;
    btns.forEach(function (b) {
      if (/销售趋势/.test(b.textContent || "")) {
        if (cnt === i) hit = b;
        cnt++;
      }
    });
    if (hit) { hit.click(); return true; }
    return false;
  };
  window.__ensureSplit = function () {
    // 勾选「分SKU展示」复选框
    var labels = document.querySelectorAll("label, span, div");
    var hit = null;
    labels.forEach(function (l) {
      if (/分SKU展示|分SKU/.test(l.textContent || "") && l.querySelector("input[type=checkbox]")) hit = l.querySelector("input[type=checkbox]");
    });
    if (hit) { if (!hit.checked) hit.click(); return true; }
    return false;
  };
  window.__closeModal = function () {
    var close = document.querySelector(".rox-modal-close, .ant-modal-close, [class*=close]");
    if (close) { close.click(); return true; }
    return false;
  };
  // ---------- 产品主图提取（列表页） ----------
  window.__extractPageImages = function () {
    var out = {};
    var imgs = document.querySelectorAll("img");
    var best = {}; // skcId -> {area, url}
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.width < 30 || img.height < 30) continue;
      var k = Object.keys(img).find(function (x) { return x.indexOf("__reactFiber$") === 0; });
      if (!k) continue;
      var p = __walkFiber(img[k], function (p) {
        return p.record && p.record.productSkcId && Array.isArray(p.record.skuQuantityDetailList);
      });
      if (!p) continue;
      var skc = String(p.record.productSkcId);
      var area = (img.width || 0) * (img.height || 0);
      if (!best[skc] || area > best[skc].area) {
        best[skc] = { area: area, url: img.currentSrc || img.src || "" };
      }
    }
    for (var s in best) if (best[s].url) out[s] = best[s].url;
    return out;
  };
  // ---------- 排序指标切换（高级排序筛选） ----------
  // metric: "今日销量" | "近7天销量" | "近30天销量" | "累计销量"
  // 用法：先 __setSortMetric("近7天销量")，等待列表刷新后再 __extractPage()
  window.__setSortMetric = function (metric) {
    var candidates = ["今日销量", "近7天销量", "近30天销量", "累计销量"];
    if (candidates.indexOf(metric) < 0) return { ok: false, msg: "bad metric: " + metric };
    var all = document.querySelectorAll("div, span, button");
    var trigger = null;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var t = (el.textContent || "").trim();
      // 触发器：文本恰为某个排序项（当前选中值），元素本身轻量（无深层子节点）
      if (t && candidates.indexOf(t) >= 0 && el.children.length <= 2) {
        trigger = el;
        break;
      }
    }
    if (!trigger) return { ok: false, msg: "sort trigger not found" };
    trigger.click();
    // 展开后点击目标选项（文本完全匹配且不是触发器本身）
    var opts = document.querySelectorAll("li, div, span, [class*=option], [class*=select], [class*=dropdown]");
    for (var j = 0; j < opts.length; j++) {
      var o = opts[j];
      if (o === trigger) continue;
      if ((o.textContent || "").trim() === metric) { o.click(); return { ok: true, metric: metric }; }
    }
    return { ok: false, msg: "option not found: " + metric };
  };
  // ---------- 分页（v2：类名带版本后缀，用属性包含选择器） ----------
  // 2026-10 起类名形如 PGT_pagerItem_5-120-1，旧 .PGT_pagerItem 精确选择器失效
  window.__curPage2 = function () {
    var a = document.querySelector("[class*=PGT_pagerItemActive]");
    return a ? parseInt(a.textContent, 10) : null;
  };
  window.__clickPageNum2 = function (n) {
    var items = document.querySelectorAll("[class*=PGT_pagerItem]");
    for (var i = 0; i < items.length; i++) {
      var t = items[i].textContent.trim();
      if (/^\d+$/.test(t) && parseInt(t, 10) === n) { items[i].click(); return true; }
    }
    var next = document.querySelector("[class*=PGT_next]");
    if (next) { next.click(); return true; }
    return false;
  };
  // ---------- 销售趋势点击（v2：只点 <a> 标签文本恰好"销售趋势"） ----------
  // 旧 __clickTrend 用 button/span/a 模糊匹配会命中弹窗内干扰元素；
  // 翻页后当前页只有 10 个 a 标签，索引用 idx % 10
  window.__clickTrend2 = function (i) {
    var links = document.querySelectorAll("a");
    var cnt = 0;
    for (var j = 0; j < links.length; j++) {
      if ((links[j].textContent || "").trim() === "销售趋势") {
        if (cnt === i) { links[j].click(); return cnt; }
        cnt++;
      }
    }
    return -1;
  };
  // ---------- 逐日数据提取（v3：只查最后一个 modal） ----------
  // 2026-10 起每次点"销售趋势"都新开一个 modal 层叠，Escape 关不掉；
  // __extractDaily 从 document 全局找会命中旧弹窗数据。v3 只查最后一个 modal，
  // 并沿 fiber return 链向上 20 层找含 {date, salesNumber} 的最长数组。
  window.__extractDaily3 = function () {
    var modals = document.querySelectorAll("[class*=MDL_modal]");
    if (!modals.length) return { ok: false, msg: "no modal" };
    var modal = modals[modals.length - 1];
    var all = modal.querySelectorAll("*");
    var best = null;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var k = Object.keys(el).find(function (x) { return x.indexOf("__reactFiber$") === 0; });
      if (!k) continue;
      var f = el[k];
      for (var up = 0; up < 20 && f; up++) {
        var node = f.memoizedState;
        var hd = 0;
        while (node && hd < 40) {
          var v = node.memoizedState;
          if (Array.isArray(v) && v.length && v[0] && typeof v[0] === "object" && v[0].date && "salesNumber" in v[0]) {
            if (!best || v.length > best.length) best = v;
          }
          node = node.next; hd++;
        }
        f = f.return;
      }
    }
    if (!best) return { ok: false, msg: "no array" };
    return { ok: true, arr: best, len: best.length };
  };
  // ---------- 关闭弹窗（v2：点 MDL_iconWrapper，旧 [class*=close] 失效） ----------
  // 2026-10 弹窗关闭按钮类名为 MDL_iconWrapper_5-120-1；遍历所有 modal 从最上层点
  window.__closeAllModals = function () {
    var modals = document.querySelectorAll("[class*=MDL_modal]");
    for (var i = modals.length - 1; i >= 0; i--) {
      var icon = modals[i].querySelector("[class*=MDL_iconWrapper]");
      if (icon) { icon.click(); break; }
    }
    return modals.length;
  };
  // ---------- 整页数据归档 ----------
  window.__allRecords = window.__allRecords || [];
  window.__dailyAll = window.__dailyAll || {};
  window.__appendPage = function () {
    var recs = window.__extractPage();
    window.__allRecords = window.__allRecords.concat(recs);
    return recs.length;
  };
  window.__getPageSkcs = function () {
    return window.__extractPage().map(function (r) { return r.skcId; });
  };
  return "injected";
})();
