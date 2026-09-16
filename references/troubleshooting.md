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
| 翻页后提取重复/缺页 | 翻页竞态 | 翻页后校验 `__curPage()` 再提取 |
| 合成事件无法触发 tooltip | 图表只响应真实鼠标 | **不要走 tooltip 路线**，直接用 fiber 提取（见 extraction-logic.md） |

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
