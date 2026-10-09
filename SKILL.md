---
name: temu-sales-pull
description: "从 Temu 商家中心（agentseller.temu.com）自动化拉取两个店铺（默认 Golf Sports Factory Shop，可切 Towel Manufacturer）的分SKU近30天销量、逐日销量、产品主图，并生成「分SKU近30天销量降序」汇总表和「每日销量」年度台账（按月份工作表）。触发词：拉Temu销量/拉销量数据/更新销量表/Temu每日销量/Temu销售数据导出。页面无导出入口、数据需鼠标悬浮图表才能看时使用本技能。"
---

# Temu 销售数据拉取

## 概览

浏览器驱动 Temu 商家中心「销售管理」页（`https://agentseller.temu.com/stock/fully-mgt/sale-manage/main`），按**指定销量指标（默认近30天，可切近7天）**降序、分SKU展示，逐页提取 SKC/SKU 销量；对每个有销量 SKC 打开销售趋势弹窗，从图表组件 React fiber 状态一次性提取 31 天逐日销量（**无需鼠标悬浮**）；同时提取 SKC 产品主图（去缩略图参数换 800×800 高清）。最终生成：
- `<店名> 分SKU近30天(或近7天)销量降序.xlsx`（分SKU明细 + SKC汇总）
- `<店名> 每日销量<年>.xlsx`（年度台账，每月一个工作表，从空白模板生成）

## 关键约束（用户明确要求）

1. **只拉有销量**：分页列表遇整页指定指标（近30天或近7天）销量全为 0 立即停止，不拉余下滞销/停售品
2. **排序指标可选**：默认近30天销量降序；需要近7天时先 `__setSortMetric("近7天销量")`，切换后列表刷新再提取；生成汇总表时传 `--metric d7`
2. **文件名带店名**：两店 Golf Sports Factory Shop / Towel Manufacturer
3. **月度表放同一 xls 的工作表**，不新建 xls；从模板「2026每日销量模板（空白）.xlsx」生成，无数据字段留空，保留表头+末尾总结行（日销量/周销量/周平均/月总销量）
4. **产品主图**填 B:C 列（表头「sku/产品图」），SKC 编号在商品名称单元格**置顶显示**（`SKC: <编号>\n<商品名>`，wrap_text）
5. 产物输出目录**由使用者指定**：`--out-dir` 参数或环境变量 `TEMU_OUT_DIR`（默认无，必须显式给出）

## 店铺与参数

- 默认店铺：**golf**（Golf Sports Factory Shop）；切换：`--store towel`（Towel Manufacturer）
- 店铺切换在页面上无通用下拉，需 `interaction.request_action(type="browserControl")` 请用户手动切换，切换后排序自动保持
- 登录过期会跳 `https://agentseller.temu.com/auth/authentication`：立即 `interaction.request_action(type="browserControl")` 请用户登录

## 执行流程

### 1. 准备

```bash
export PYTHONPATH="$HOME/.artifact-preview-pylibs"   # openpyxl 插图需 Pillow
```
数据目录约定：`data/<store>/` 下存 `raw_<YYYYMM>.json`（列表汇总）、`daily_<YYYYMM>.json`（逐日）、`imgs/<store>_<skcId>.jpg`（产品图）。
**数据目录由使用者通过 `--data-dir` 指定**（不指定时默认 skill 目录上级的 `data/`）。示例：`--data-dir /Users/<你>/path/to/data`。

### 2. 浏览器提取列表（分页，遇0停）

1. 打开销售管理页，确认店铺名与目标一致（顶部显示）；确认排序=目标指标（近30天或近7天）销量降序、分SKU展示；需要切换指标时用 `__setSortMetric("近7天销量")`（或"近30天销量"/"今日销量"/"累计销量"），等待列表刷新后校验 `__curPage2()` 再继续
2. 用 `bu.js()` 注入 `scripts/inject.js`（页面刷新/会话过期后注入函数全部丢失，必须重新注入）
3. 循环：`__extractPage()` 提取当前页 → `__clickPageNum2(n+1)` 翻页 → 校验 `__curPage2()` 后再提取 → **当前页所有 SKC 的近30天销量全为 0 时停止**
   - **必须用 v2 函数**（`__clickPageNum2`/`__curPage2`）：2026-10 起分页器类名带版本后缀（`PGT_pagerItem_5-120-1`），旧的 `.PGT_pagerItem` 精确选择器已失效
4. 落盘 `data/<store>/raw_<YYYYMM>.json`（schema 见 references/extraction-logic.md）

### 3. 生成汇总表

```bash
export TEMU_OUT_DIR="<你的输出目录>"   # 产物输出目录（也可每次传 --out-dir）
python3 scripts/build_temu_xlsx.py data/<store>/raw_<YYYYMM>.json "<店名>" [--metric d7|d30]
# 默认 d30（近30天）；近7天表加 --metric d7，文件名自动变「分SKU近7天销量降序」
```

### 4. 逐日销量提取（每个有销量 SKC）

1. 对 raw 中每个 `d30>0` 的 SKC：
   - `__clickTrend2(i % 10)` 打开销售趋势弹窗（**翻页后当前页只有 10 个 a 标签，索引用 `idx % 10`**，不要用全局 idx）
   - `__ensureSplit()` 勾选「分SKU展示」
   - `__extractDaily3()` 提取逐日数组（**只查最后一个 modal**，从最后一个弹窗 DOM 沿 fiber return 链向上 20 层找含 `{date, salesNumber}` 的最长数组）
     - **返回结构**：`{arr: 原始数组, real: 仅真实值, predictCount: 预测条数, predictDates: 预测日期列表}`
     - **写入台账/校验一律用 `real`**，不要用 `arr`（`arr` 含 `isPredict=true` 的未来预测值，会污染日销量台账）
   - `__closeAllModals()` 关闭弹窗（点 `MDL_iconWrapper`）
2. **分批提取**：每批 6-8 个 SKC，避免弹窗层叠导致超时；每批之间落盘一次
3. **校验**：每个 SKU 逐日之和（`real` 数组）≈ 列表页近30天销量（允许 ±5 误差，滚动窗口错位所致）；若 `predictCount > 0`，打印提示
4. 落盘 `data/<store>/daily_<YYYYMM>.json`（含原始 `arr`，保留 `isPredict` 字段便于追溯；`build_annual_workbook.py` 重建时会自动过滤预测值）

### 5. 产品主图下载

1. 列表页 `__extractPageImages()` 提取 SKC 主图 URL → 把 `imageMogr2/thumbnail/120x` 换成 `800x`
2. 下载到 `data/<store>/imgs/<store>_<skcId>.jpg`（800×800）
3. 下载全部完成（缺图补拉）再进下一步

### 6. 生成年度台账

```bash
python3 scripts/build_annual_workbook.py --store golf|towel \
    --template "<模板xlsx路径>" --out-dir "<输出目录>" [--data-dir <数据目录>]
```
脚本自动扫描 `data/<store>/` 下该年全部月份数据，从模板重建年度工作簿：有数据月份填数+插图，无数据月份为空白模板表；月份 sheet 命名 `YYYY-MM`，统计月份 G2 自动设置。
**总结行公式自动预填**：每个月份 sheet（含无数据空白月）的总结行会自动写入联动公式——日销量=每列 `=SUM(该列数据行)`、周销量=每 5 天一组 `=SUM`（1-5/6-10/11-15/16-20/21-25/26-30/31）、周平均=每 8 天一组 `=IFERROR(AVERAGE(...),"")`、月总销量=`=SUM(L:AP)`，随数据自动重算；无数据组显示空白（`IFERROR` 兜底）。

### 7. flow-grow 全店日销量核对

每次拉取完成后，自动从 flow-grow 页面提取全店逐日销量作为基准，和台账对比：

1. 导航到 `https://agentseller.temu.com/main/flow-grow`
2. 等待「近期店铺销量走势」图表加载完成
3. 注入 `scripts/inject.js`（含 `__extractFlowGrow()`）
4. 调用 `__extractFlowGrow()` 提取 30 天全店日销量（`{date, num}` 数组）
5. 落盘 `data/<store>/flowgrow_<YYYYMMDD>.json`
6. 跑核对脚本：
   ```bash
   python3 scripts/reconcile_flowgrow.py "<年度台账.xlsx>" "data/<store>/flowgrow_<YYYYMMDD>.json"
   ```
7. 查看差异：
   - 差异 ≤2 件：正常滚动窗口错位，无需处理
   - 差异 >5 件：检查是否漏拉/多拉 SKU，或 isPredict 未过滤

### 8. 校验与交付

- 汇总表：SKU 数、SKC 数、降序正确
- 年度台账：zip 内 `xl/media/` 图片数 = 有销量 SKC 数；各月份 sheet 总结行在；9 月版应 rows=75
- `present_files` 交付两个 xlsx

## 脚本

| 脚本 | 用途 |
|---|---|
| `scripts/build_temu_xlsx.py` | raw JSON → 分SKU销量降序汇总表（`--metric d7|d30` 选近7天/近30天，默认近30天） |
| `scripts/build_annual_workbook.py` | raw+daily+imgs → 年度每日销量台账（月份工作表，自动插图 + 总结行公式预填） |
| `scripts/download_images.py` | SKC 图片 URL JSON → 高清图批量下载 |
| `scripts/inject.js` | 浏览器注入函数库（页面提取/翻页/趋势/逐日/图片） |

## 陷阱（务必遵守）

- **openpyxl 重存会丢图**：对含图工作簿的编辑，load+save 后必须重新走 `build_annual_workbook.py` 全量重建
- **QuickLook 渲染 xlsx 不可信**（出幽灵内容），验证以 zip 内部结构 + openpyxl 文本为准
- **openpyxl delete_rows 不平移合并/行高**：build_annual_workbook.py 已处理（手动清理 row_dimensions + 重建 merged_cells），勿改回
- 逐日数据**不在** ECharts option 里（option 只有汇总序列），在图表组件 fiber 的 hooks 状态中，见 references/extraction-logic.md
- **2026-10 页面结构变更（必须用 v2/v3 函数）**：
  - 分页器类名带版本后缀：`PGT_pagerItem_5-120-1`，旧 `.PGT_pagerItem` 选择器失效 → 用 `[class*=PGT_pagerItem]`（`__clickPageNum2`/`__curPage2`）
  - 弹窗关闭按钮是 `MDL_iconWrapper_5-120-1`，旧 `.rox-modal-close`/`[class*=close]` 点不动 → 用 `__closeAllModals()`
  - 每次点"销售趋势"都新开一个 modal 层叠，Escape 关不掉 → `__extractDaily3` 只查最后一个 modal，不要用 `__extractDaily`
  - 翻页后当前页只有 10 个"销售趋势" a 标签 → `__clickTrend2(i % 10)`，不要用全局 idx
  - 批量提取需分批（每批 6-8 个 SKC），避免弹窗层叠导致 tool 超时
- 详见 references/troubleshooting.md
