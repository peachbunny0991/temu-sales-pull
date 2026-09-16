# temu-sales-pull

从 **Temu 商家中心**（agentseller.temu.com）自动化拉取店铺分 SKU 销售数据的可复用 Skill/工具集。

平台没有销量导出入口、逐日数据需鼠标悬浮图表才能查看，人工记录成本高——本工具通过浏览器自动化一次性全量提取，生成可直接使用的 Excel 报表。

## 功能特性

- **分 SKU 近 30 天销量降序导出**：自动翻页提取 SKC/SKU 明细（今日/近7天/近30天/累计销量），**遇整页零销量自动停止**（跳过滞销/停售品）
- **逐日销量**：从图表组件内部状态直接提取 31 天×每 SKU 的逐日销量，**无需鼠标悬浮**
- **产品主图**：自动提取 SKC 主图并高清化（800×800）填入报表
- **两店铺支持**：Golf Sports Factory Shop / Towel Manufacturer，可切换
- **年度台账**：每月一个工作表存于同一 xlsx（不新建文件），带产品图、SKC 编号、总结行
- **可复用**：安装为 Agent Skill 后，每次说"拉取销量数据"即可全自动执行

## 目录结构

```
temu-sales-pull/
├── SKILL.md                      # Skill 主文档（操作手册）
├── scripts/
│   ├── inject.js                 # 浏览器注入函数库（列表/翻页/逐日/图片提取）
│   ├── build_temu_xlsx.py        # raw JSON → 分SKU近30天销量降序汇总表
│   ├── build_annual_workbook.py  # 月度数据 → 年度每日销量台账（自动插图 + 总结行公式）
│   └── download_images.py        # SKC 产品主图批量下载（高清化）
└── references/
    ├── extraction-logic.md       # 提取逻辑详解（DOM/fiber、数据 schema）
    └── troubleshooting.md        # 故障排查与验证清单
```

## 环境要求

- macOS（本工具基于 macOS 开发；Windows/Linux 需适配路径）
- Python 3.10+，依赖：`openpyxl`、`Pillow`
- 已登录 Temu 商家中心的浏览器会话

## 使用方法

### 方式一：作为 Agent Skill 使用（推荐，全自动）

把本目录安装为 Agent Skill 后（豆包工作：放入 `.user_skills/`），直接对助手说：

> 拉取销量数据 / 更新销量表 / 拉Temu销量 / Temu每日销量

助手会自动执行完整流程：浏览器提取列表 → 逐日销量 → 产品主图 → 生成两份 Excel。你只需在两种情况人工配合：

1. 登录过期时接管浏览器完成登录
2. 页面无店铺切换下拉时，手动切换到目标店铺

**触发前后需要你确认的设置**：

| 设置 | 默认值 | 说明 |
|---|---|---|
| 店铺 | `golf`（Golf Sports Factory Shop） | 切 Towel Manufacturer 时说明即可 |
| 销量指标 | 近30天（`d30`） | 需要近7天时说明，自动切换并生成 `分SKU近7天销量降序` 表 |
| 输出目录 | 必须指定（`TEMU_OUT_DIR` 或 `--out-dir`） | 例：`/Users/<你>/Desktop/临时/2026销量表` |
| 数据目录 | Skill 上级 `data/` | 例：`--data-dir /Users/<你>/path/to/data` |
| 模板 | 必须指定（`TEMU_TPL` 或 `--template`） | `2026每日销量模板（空白）.xlsx` |

### 方式二：脚本独立运行（无需浏览器，用已有数据生成报表）

**0. 准备环境**

```bash
pip install openpyxl Pillow
export PYTHONPATH="$HOME/.artifact-preview-pylibs"   # 插图需要 Pillow
export TEMU_OUT_DIR="/Users/<你>/Desktop/临时/2026销量表"  # 产物输出目录
export TEMU_TPL="/Users/<你>/Desktop/临时/2026销量表/2026每日销量模板（空白）.xlsx"
```

**1. 浏览器拉取原始数据**（需要登录 Temu 商家中心）

打开 `https://agentseller.temu.com/stock/fully-mgt/sale-manage/main`，确认店铺/排序（近30天销量降序、分SKU展示）后，注入 `scripts/inject.js` 循环提取：

- 列表：`__extractPage()` → `__clickPageNum(n+1)` 翻页，**整页近30天销量全为 0 立即停止**（不拉滞销/停售品）
- 逐日：每个有销量 SKC 打开趋势弹窗，`__ensureSplit()` 后 `__extractDaily()` 一次提取 31 天（无需鼠标悬浮）
- 主图：`__extractPageImages()` 取 URL 并替换为 800×800

落盘到数据目录：`data/<store>/raw_<YYYYMM>.json`、`daily_<YYYYMM>.json`、`imgs/<store>_<skcId>.jpg`

**2. 生成分SKU销量汇总表**

```bash
python3 scripts/build_temu_xlsx.py data/golf/raw_202609.json "Golf Sports Factory Shop"
# 近7天版本加 --metric d7，文件名自动变为「分SKU近7天销量降序」
```

**3. 下载产品主图**（如第 1 步未下载）

```bash
python3 scripts/download_images.py --urls <skc_urls.json> --out data/golf/imgs --store golf
```

**4. 生成年度每日销量台账**

```bash
python3 scripts/build_annual_workbook.py --store golf --year 2026 \
    --template "$TEMU_TPL" --out-dir "$TEMU_OUT_DIR" [--data-dir <数据目录>]
```

自动扫描该年全部月份数据，每月一个工作表（`2026-01` … `2026-12`）存入同一 xlsx；有数据月份填数+插图，无数据月份为空白表。**总结行公式自动预填**（日销量/周销量/周平均/月总销量），随数据联动重算，后续月份填数后无需再手动补公式。

### 输出产物

| 产物 | 文件名 | 内容 |
|---|---|---|
| 汇总表 | `<店名> 分SKU近30天(近7天)销量降序.xlsx` | 分SKU明细 + SKC汇总，降序 |
| 年度台账 | `<店名> 每日销量<年>.xlsx` | 月度工作表 + 产品图 + SKC编号 + 总结行公式 |

## 已封装的坑（重要）

- **openpyxl 重存丢图**：对含图 xlsx 的编辑必须走 `build_annual_workbook.py` 全量重建，禁止手工 load+save
- **openpyxl `delete_rows` 不平移合并单元格/行高**：脚本已内置修复（重建 merged_cells + 清理 row_dimensions）
- **QuickLook 渲染 xlsx 不可信**（会显示幽灵内容），验证以 zip 内部结构 + openpyxl 文本为准
- **逐日数据不在 ECharts option 中**，在图表组件 React fiber 的 hooks 状态里（详见 references/extraction-logic.md）

## 安全与合规

- **数据范围**：仅提取店铺商品维度的销量数据（SKC/SKU、日销量、近7/30天、累计），**不涉及买家个人信息、订单明细或支付数据**
- **存储**：数据只写入你指定的本地数据目录与输出目录，工具**不会自动上传任何数据**；`data/` 已在 `.gitignore` 排除，不会进入版本控制
- **凭据**：仓库不含任何 token/密码/cookie；登录态仅存在于浏览器会话，不入库、不落盘
- **执行模式**：人工触发、本地运行；失败即停止（遇整页零销量停拉、数据校验不一致报警），不无人值守
- **账号与条款**：使用商家账号登录执行只读操作；使用前请自行确认平台服务条款是否允许自动化访问，如平台提供官方 API 建议优先走官方通道
- **提示注入**：提取逻辑为固定白名单字段，不执行页面文案中的任何指令

## 兼容性规划

- 当前执行层绑定豆包工作的浏览器工具（`mac_computer_use_tool` / `bu` API）
- 脚本层（Python + inject.js）为跨工具通用实现
- 规划中：适配 **Claude Code**（Playwright 驱动）与 **Codex**（CLI 工具）的执行层

## License

MIT
