# Temu 销售数据提取逻辑详解

## 页面与入口

- 销售管理（全球）：`https://agentseller.temu.com/stock/fully-mgt/sale-manage/main`
- 进入路径：销售管理 → 高级排序筛选 → 排序方式=近30天销量、降序 → 销售趋势 → 分SKU展示
- 店铺显示名在页面顶部：Towel Manufacturer / Golf Sports Factory Shop（以页面实际为准）
- 登录过期跳 `https://agentseller.temu.com/auth/authentication?...` → 立即请求用户接管登录

## 列表页 SKC/SKU 提取（React fiber）

**核心**：任何 DOM 元素上有 `__reactFiber$<hash>` 键，沿 fiber 链（memoizedProps 遍历 child/sibling）向上找，命中条件：
```
p.record && Array.isArray(p.record.skuQuantityDetailList) && p.record.productSkcId
```
命中的 `p.record` 即该 SKC 记录（`inject.js` 的 `__extractPage()` 实现）。

**SKU 字段映射**：
| 字段 | 来源 |
|---|---|
| skcId | `record.productSkcId`（String） |
| name | `record.productName` |
| className | `s.className`（颜色/SKU规格名） |
| skuId | `s.productSkuId`（String） |
| today / d7 / d30 / total | `s.todaySaleVolume / lastSevenDaysSaleVolume / lastThirtyDaysSaleVolume / totalSaleVolume` |

**raw JSON schema**：
```json
[{"skcId":"80000000001","name":"Example Towel (示例商品名),...","skus":[
  {"className":"white","skuId":"90000000001","today":7,"d7":81,"d30":545,"total":1287}]}]
```

## 分页

- 页码元素：`.PGT_pagerItem`（含 `.PGT_pagerItemActive` 当前页），上一页/下一页 `.PGT_prev / .PGT_next`
- 翻页后**必须**校验 `__curPage()` 为新页再提取（防竞态）
- 停止条件：当前页所有 SKC 的 `d30` 全为 0 → 不再翻页（余下是滞销/停售品）

## 逐日销量提取（关键突破）

**误区**：逐日数据**不在** ECharts `option.series` 里（option 只有汇总「销量」序列 31 天）。合成 MouseEvent 无法触发 tooltip（图表只响应真实鼠标）。

**正解**：图表容器 `.rox-charts-for-react` 元素的 `__reactFiber$*` 链上，**函数组件 hooks 状态**里有一个数组，长度 = 31天 × 当前 SKU 数，元素形如：
```js
{date:"YYYY-MM-DD", prodSkuId:"90000000001", salesNumber:9, isPredict:false, soldOut:false}
```
`__extractDaily()` 沿 `memoizedState` hook 链收集所有「数组元素含 date + salesNumber」的数组，取最长者。

**前置**：必须先勾选弹窗内「分SKU展示」复选框（`__ensureSplit()`），否则该数组不出现。

**校验**：每个 SKU 逐日之和 = 列表页该 SKU 近30天销量；每日各 SKU 之和 = 图表汇总序列当日值。

## 产品主图

- 列表页 `<img>`（≥30px）经 fiber 找 SKC id（同上），同 SKC 多图取最大面积者
- URL 形如 `https://img.kwcdn.com/product/fancy/<uuid>.jpg?imageMogr2/thumbnail/120x`
- **高清化**：把 `imageMogr2/thumbnail/120x` 替换为 `800x` → 800×800
- 落盘 `data/<store>/imgs/<store>_<skcId>.jpg`

## 年度台账结构（build_annual_workbook.py）

- 模板：使用者指定（`--template` 或环境变量 `TEMU_TPL`），形如 `2026每日销量模板（空白）.xlsx`
  - 行1 标题；行2 门店 B2、统计月份 G2（Excel序列号，2026-09-01=46266）
  - 行3 表头：A=序号、B:C=sku/产品图、D:F=商品名称、G=规格型号、H=单位、I=颜色、J=单价、K=累计金额（`=SUM(Ln:APn)*Jn`）、L~AP=1~31日（datetime，number_format `d`）
  - 行4 星期；行5~324 数据区；行325~328 总结行（日销量/周销量/周平均/月总销量，含多段列合并）
- 月份 sheet：`YYYY-MM`；G2=该月1日序列号；数据行：D=`SKC: <id>\n<商品名>`（wrap_text，SKC置顶）、I=颜色、L起=当月已有数据的天、K=公式；行高 64；B:C 插产品图（每 SKC 一张居中）
- 输出 `<店名> 每日销量<年>.xlsx`（年度台账，多月份工作表）

## 数据落盘约定

```
data/<store>/
├── raw_<YYYYMM>.json      # 列表汇总（SKC/SKU + 四个销量指标）
├── daily_<YYYYMM>.json    # 逐日 {skcId: [{date, prodSkuId, salesNumber, isPredict, soldOut}]}
└── imgs/<store>_<skcId>.jpg  # 产品主图
```
每月拉取新增一个 `raw_<YYYYMM>.json` + `daily_<YYYYMM>.json`，台账脚本自动聚合全年。
