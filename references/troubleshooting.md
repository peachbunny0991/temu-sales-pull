# Temu 销售数据拉取 - 故障排查

## 登录 / 会话

- **现象**：页面跳 `https://agentseller.temu.com/auth/authentication?...`
- **处理**：`interaction.request_action(type="browserControl")` 请用户登录；完成后重新注入函数
- **注入函数丢失**：页面刷新/会话过期后 `window.__extractPage` 等全部消失，**每次刷新后必须重新 `bu.js()` 注入** `scripts/inject.js`

## 提取失败

| 现象 | 原因 | 处理 |
|---|---|---|
| `__extractPage()` 返回空 | 未在销售管理列表页 / fiber 结构变更 | 确认页面路径与排序筛选；打印 `document.querySelectorAll("*")` 首个 fiber 抽查 |
| `__extractDaily()` 无数组 | 未勾选「分SKU展示」/ 弹窗未开 | 先 `__ensureSplit()`；确认 `.rox-charts-for-react` 存在 |
| 逐日之和 ≠ 近30天销量 | 数据窗口边界（当天未结束）| 核对 `isPredict` 字段；日期窗口以弹窗为准 |
| 翻页后提取重复/缺页 | 翻页竞态 | 翻页后校验 `__curPage2()` 再提取 |
| `__setSortMetric()` 返回 not found | 排序下拉 DOM 结构变了 | 用 bu.js 打印排序区域元素结构（含文本/类名）后按真实类名调整注入函数 |
| 切换排序后提取到旧数据 | 列表未刷新完成即提取 | 切换后 `bu.wait_for_load()`，校验 `__curPage2()`/首行 SKC 变化后再提取 |
| 合成事件无法触发 tooltip | 图表只响应真实鼠标 | **不要走 tooltip 路线**，直接用 fiber 提取（见 extraction-logic.md） |
| **翻页点不动 / 页码找不到**（2026-10 起） | 分页器类名带版本后缀（`PGT_pagerItem_5-120-1`），旧 `.PGT_pagerItem` 精确选择器失效 | 用 `__clickPageNum2(n)` / `__curPage2()`（属性包含选择器 `[class*=PGT_pagerItem]`） |
| **弹窗关不掉 / 越开越多**（2026-10 起） | 关闭按钮类名改为 `MDL_iconWrapper_5-120-1`，旧 `[class*=close]` 找不到；每次点"销售趋势"都新开 modal 层叠，Escape 无效 | 用 `__closeAllModals()`（点 `MDL_iconWrapper`）；每提取完一个 SKC 立即关 |
| **逐日数据取到旧弹窗 / 张冠李戴**（2026-10 起） | `__extractDaily` 从 document 全局找图表，会命中之前没关掉的旧弹窗 | 用 `__extractDaily3()`：只查最后一个 `[class*=MDL_modal]` DOM，沿 fiber return 链向上 20 层找含 `{date, salesNumber}` 的最长数组 |
| **翻页后点错 SKC**（2026-10 起） | 当前页只有 10 个"销售趋势" `<a>`，全局 idx 跨页失效 | 用 `__clickTrend2(i % 10)`：只点文本恰好"销售趋势"的 a 标签，索引按当前页 0-9 |
| **批量提取 tool 超时** | 弹窗层叠导致 DOM 过大 / 单次 cell 跑 30+ SKC | 每批 6-8 个 SKC，每批之间 `__closeAllModals()` + 落盘一次 |

## 生成阶段

- **openpyxl 重存丢图**：对含图 xlsx 任何 `load_workbook` + `save` 都会丢失全部嵌入图片（load 不解析 drawing）。**含图文件一律用 `build_annual_workbook.py` 全量重建**，禁止手工 openpyxl 编辑后保存
- **openpyxl delete_rows 坑**（build_annual_workbook.py 已内置修复，勿回退）：
  - `delete_rows` 不清理 `row_dimensions` → 残留空行元素（max_row 虚高），脚本已手动清理
  - `delete_rows` 不平移合并单元格 → 总结行 merge 停在原行号，脚本已重建 `merged_cells`
- **QuickLook 渲染 xlsx 不可信**：`qlmanage -t` 会渲染出文件里不存在的幽灵内容（如 SKU00000000、¥100），仅用于肉眼粗看，**验证以 zip 内部结构 + openpyxl 文本为准**
- 缺 Pillow：`pip install --target "$HOME/.artifact-preview-pylibs" Pillow openpyxl`，运行插图脚本时 `export PYTHONPATH="$HOME/.artifact-preview-pylibs"`

## 验证清单（交付前）

1. 汇总表：有销量 SKU 数 / SKC 数、近30天降序
2. 年度台账 zip：`xl/media/` 图片数 = 有销量 SKC 数；`xl/drawings/drawing1.xml` pic 数一致
3. 月份 sheet：总结行存在（9月版在 72-75，空白版在 325-328）；D 列 `SKC: <编号>` 置顶；G2 统计月份正确
4. 图片名 `<store>_<skcId>.jpg` 与 raw 的 skcId 一一对应（缺图补下载）

## 店铺切换

页面无通用店铺下拉。切换需用户手动操作：
`interaction.request_action(type="browserControl")` 提示用户在页面切换店铺（顶部店铺区域），切换后排序/筛选自动保持。切完重新校验顶部店铺名。
