# 面向开发者的 Harness Engineering 实践指南

> 当你使用 Claude Code、Cursor、Codex 等 AI 编程助手做开发时，你准备的项目环境就是"用户线束"——它决定了智能体有多少概率一次做对、多少错误能被自动捕获和自纠正。本指南告诉你该创建哪些文件、配置哪些工具、遵循什么流程，让智能体在你的项目中表现得最好。

---

## 核心心智模型

Martin Fowler 的文章给出了最精确的框架 [[Fowler/Böckeler, 2026]](https://martinfowler.com/articles/harness-engineering.html)：

**智能体 = 模型 + 线束**。线束有三层：
- **内层（厂商线束）**：系统提示词、编排逻辑——由 Claude Code / Cursor 厂商构建，你改不了
- **外层（用户线束）**：**你为你的项目构建的一切**——项目文档、代码规范、lint 配置、git hooks、测试——这是你的责任

用户线束有两种控制机制：

| 机制 | 方向 | 作用 | 例子 |
|------|------|------|------|
| **Guide（引导）** | 前馈 | 在智能体行动*之前*告诉它该怎么做 | AGENTS.md、架构文档、代码规范 |
| **Sensor（传感器）** | 反馈 | 在智能体行动*之后*检测并让它自纠 | pre-commit hook、linter、测试套件 |

**关键原则：你需要两者都有。** 只有引导没有传感器，智能体会反复犯同一个错——它做了但不知道对不对。只有传感器没有引导，智能体不知道什么是对的——它被纠错但不理解规则 [[Fowler/Böckeler, 2026]](https://martinfowler.com/articles/harness-engineering.html)。

传感器的执行方式也有两种 [[Fowler/Böckeler, 2026]](https://martinfowler.com/articles/harness-engineering.html)：

| 类型 | 特点 | 适用场景 |
|------|------|---------|
| **计算型传感器** | 确定性、快（毫秒~秒）、可靠 | linter、类型检查、测试、结构分析 → 每次变更都跑 |
| **推理型传感器** | 非确定性、慢、贵 | AI 代码审查、语义分析 → 在集成后或需要语义判断时使用 |

---

## 场景一：从零初始化一个新项目

### 总览

```
第一天就要做的事（按顺序）:

1. 创建 AGENTS.md          — 所有工具都读的通用指令
2. 配置 AGENTS.md.tool-    — 告诉智能体怎么构建、测试、lint
   specific 内容
3. 设置 lint + formatter   — 计算型传感器
4. 设置 pre-commit hooks    — 让传感器在每次 commit 前自动触发
5. 写第一个测试            — 让智能体有东西可以验证
6. 创建 architecture.md    — 引导：告诉智能体项目长什么样
```

### 第 1 步：创建 AGENTS.md

**AGENTS.md** 是一个跨工具的标准——Claude Code、Cursor、Codex、Augment 等 30+ 工具都支持读取 [[AGENTS.md]](https://agents.md/)。把它放在仓库根目录，作为"给智能体看的 README"。

一个新项目的 AGENTS.md 最小模板：

```markdown
# 项目名称

## 项目概述
一句话描述这个项目做什么、给谁用。

## 技术栈
- 语言：TypeScript 5.x
- 框架：Next.js 15 (App Router)
- 包管理：pnpm
- 测试：Vitest + React Testing Library
- Lint：Biome（lint + format 统一）
- 类型检查：tsc --noEmit

## 常用命令
- 安装依赖：pnpm install
- 启动开发服务器：pnpm dev
- 运行测试：pnpm test
- 运行 lint：pnpm lint
- 运行格式化：pnpm format
- 类型检查：pnpm typecheck
- 构建：pnpm build

## 代码规范
- 使用 Biome 进行 lint 和格式化，不要手动调整格式
- 组件使用 PascalCase，工具函数使用 camelCase
- 每个 public 函数必须有 JSDoc 注释
- 优先使用 TypeScript 严格模式（strict: true）
- 禁止使用 any 类型

## 测试规范
- 每个模块至少一个测试文件，命名规则：[模块名].test.ts
- 测试文件与源文件同目录
- 优先写集成测试而非单元测试
- mock 外部 API 调用

## 架构
- src/app/         — Next.js App Router 页面
- src/components/  — React 组件
- src/lib/         — 业务逻辑和工具函数
- src/types/       — TypeScript 类型定义
- src/api/         — API 调用封装
```

**关键设计原则** [[Augment]](https://www.augmentcode.com/guides/how-to-build-agents-md)；[[Fowler]](https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html)：

- **和 README 分开**。README 给人看的（badge、截图、安装指南），AGENTS.md 给智能体看的（命令、规范、结构）。内容不同，优化目标不同。
- **保持精炼**。AGENTS.md 在每次会话启动时加载到上下文窗口里。太长会浪费 token 并稀释有效信息。Martin Fowler 建议"逐步构建，而非一开始就塞满" [[Fowler]](https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html)。
- **可执行**。写 `pnpm test` 而非"运行测试"——命令可以直接复制执行。

### 第 2 步：配置 lint + formatter（计算型传感器）

Lint 和 formatter 是最廉价、最可靠的传感器 [[Fowler/Böckeler, 2026]](https://martinfowler.com/articles/harness-engineering.html)。它们的错误信息就是智能体的自纠正信号。

选择一个工具并配置好：

```jsonc
// biome.json (如果用 Biome)
{
  "$schema": "https://biomejs.dev/schemas/2.0/schema.json",
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "error"     // 禁止 any — 智能体会遵守
      },
      "style": {
        "useConst": "error",
        "noVar": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "lineWidth": 100
  }
}
```

**一个重要的实践技巧** [[Fowler/Böckeler, 2026]](https://martinfowler.com/articles/harness-engineering.html)：自定义 linter 规则的错误信息应该是**面向 LLM 优化的**——不只是说"这里错了"，还要说"你应该怎么改"。这是一种"正向的提示词注入"——把修正建议直接嵌入错误信息中，智能体读到后就能自纠正。

### 第 3 步：设置 pre-commit hooks（让传感器自动触发）

Lint 规则写了但没人跑，等于没写。Pre-commit hook 确保每次 commit 之前自动运行检查 [[Jones Russell, 2026]](https://jonesrussell.github.io/blog/git-hooks-ai-agents/)。

最小配置（用 Husky）：

```bash
pnpm add -D husky lint-staged
npx husky init
```

```jsonc
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "biome check --write",
      "biome format --write"
    ]
  }
}
```

```bash
# .husky/pre-commit
npx lint-staged
pnpm typecheck
pnpm test --run  # 只跑一次，不 watch
```

**这就是反馈循环的核心** [[Jones Russell, 2026]](https://jonesrussell.github.io/blog/git-hooks-ai-agents/)：

```
智能体写代码 → pre-commit hook 触发 → linter 报错
→ 错误信息返回给智能体（告诉它哪里错了、该怎么改）
→ 智能体自纠正 → 重新 commit → hook 通过
→ 全程无需人工介入（对于机械性错误）
```

这个闭环对于"格式错误""类型错误""遗漏 import"这类机械性问题的效果非常好。人类开发者只关注架构和业务逻辑层面的审查。

**另一个强有力的替代方案** [[Evil Martians, 2026]](https://evilmartians.com/chronicles/stop-writing-rules-in-agents-md-use-agent-hooks-and-nano-staged-instead)：不要把机械性规则写在 AGENTS.md 里让智能体"遵守"，而是用 agent hooks 和 nano-staged 来自动验证。AGENTS.md 应该只放需要智能体理解*语义*的规则。

### 第 4 步：写第一个测试

测试是验证智能体修改是否正确的主要传感器。即使是一个新项目，在让智能体开始开发功能之前，先写一个能跑通的测试（哪怕只是最基础的 smoke test）。

确保：
- 测试命令在 AGENTS.md 中明确列出（`pnpm test`）
- 测试能快速执行（<10 秒跑完一个模块的测试）
- 测试失败时的输出是可读的（智能体能从输出中理解哪里错了）

### 第 5 步：创建架构文档

为智能体创建一个精简的架构文档，告诉它项目的技术决策和模块边界：

```markdown
# docs/architecture.md

## 技术决策
- 为什么选 Next.js 而非 Remix：团队已有 Next.js 经验，且需要 SSR + App Router
- 为什么选 Biome 而非 ESLint：统一的 lint + format 配置，性能更好

## 模块边界
- src/app/ 只做路由和页面编排，不包含业务逻辑
- src/lib/ 包含所有业务逻辑，且每个函数应可独立测试
- src/api/ 中的每个函数封装一个外部 API 调用，不暴露 HTTP 细节

## 禁止事项
- 不要在 src/app/ 中直接调用外部 API
- 不要在组件中写业务逻辑
- 不要绕过 Biome 的 lint 规则（即使加了 // biome-ignore 也需要 review）
```

这份文档的作用是**前馈控制**——防止智能体把代码放在错误的位置或违反架构约定。

### 第 6 步（可选但推荐）：Claude Code 专用配置

如果你主要使用 Claude Code，可以创建 **CLAUDE.md** 和 `.claude/` 目录结构来提供更精细的控制 [[Claude Code Docs]](https://code.claude.com/docs/en/memory)；[[Claude Code .claude]](https://code.claude.com/docs/en/claude-directory)：

```
项目根目录/
├── CLAUDE.md                    # Claude Code 专用指令（会自动加载）
├── AGENTS.md                    # 所有工具都能读的通用指令
├── .claude/
│   ├── rules/
│   │   ├── typescript.mdc       # 仅作用于 *.ts 文件的规则
│   │   └── sql.mdc              # 仅作用于 *.sql 文件的规则
│   └── memory/
│       └── project-knowledge.md  # 跨会话持久化记忆
└── src/
    ├── components/
    │   └── CLAUDE.md             # 子目录级指令（仅当智能体读该目录时加载）
    └── ...
```

Claude Code 的加载机制 [[Anthropic GitHub]](https://github.com/anthropics/claude-code/issues/2571)：
- **根目录 CLAUDE.md**：每次会话启动时加载 → 保持精炼
- **子目录 CLAUDE.md**：仅当智能体用 Read 工具读取该目录下的文件时才加载 → 可以放该目录特有的规则（如"components/ 目录的组件必须用 forwardRef"）
- **`.claude/rules/`**：按文件 glob 作用域加载（如 `*.ts` 规则只在编辑 TS 文件时加载）

在 CLAUDE.md 的顶部可以用 `@import` 语法引入 AGENTS.md，避免重复：

```markdown
# CLAUDE.md
@import AGENTS.md

## Claude Code 专用指令
- 使用 Claude Code 的 plan mode 来规划复杂任务
- 在编辑文件之前，先用 Read 工具查看当前内容
- 每次修改后运行 pnpm test 验证
```

### 场景一的完整文件清单

初始化一个新项目时，你至少应该创建：

```
必选:
  ✅ AGENTS.md              — 通用智能体指令
  ✅ [lint 配置文件]         — biome.json / .eslintrc / pyproject.toml 等
  ✅ pre-commit hook 配置    — .husky/pre-commit 或 .pre-commit-config.yaml
  ✅ 一个能跑通的测试        — 让智能体有验证手段

推荐:
  ✅ CLAUDE.md               — 如果你主要用 Claude Code
  ✅ .cursor/rules/          — 如果你主要用 Cursor
  ✅ docs/architecture.md   — 架构决策和模块边界

加分项（按需添加）:
  ○ .claude/rules/*.mdc     — 按文件类型分区的精细规则
  ○ 子目录 CLAUDE.md        — 针对特定目录的规则
  ○ docs/how-to-test.md     — 测试编写的详细指引（可以作为"skill"按需加载）
  ○ MCP server 配置           — 连接团队知识库或外部工具
```

---

## 场景二：改进已有项目的线束

已有的项目没有线束配置，或者配置不完善。你需要评估现状，找到差距，然后逐步补齐。

### 第 1 步：现状评估

检查以下项目是否存在，以及质量如何：

#### A. 智能体指令文件

| 检查项 | 有/无 | 质量评估 |
|--------|-------|---------|
| AGENTS.md（根目录） | | 内容是否可执行？是否包含常用命令？ |
| CLAUDE.md（如果用 Claude Code） | | 是否精炼？是否和 AGENTS.md 重复？ |
| .cursor/rules/（如果用 Cursor） | | 是否有按文件类型分区的规则？ |
| 子目录级指令文件 | | 关键子目录是否有针对性规则？ |

#### B. 传感器配置（lint + formatter + 类型检查）

| 检查项 | 有/无 | 质量评估 |
|--------|-------|---------|
| Linter 配置（ESLint / Biome / Ruff / etc.） | | 规则是否严格？是否自定义了面向 LLM 的错误信息？ |
| Formatter 配置（Prettier / Biome / Black / etc.） | | 是否统一（不要同时有 Prettier 和 Biome）？ |
| 类型检查（TypeScript strict / pyright / etc.） | | 是否开启严格模式？ |
| 这些工具是否在 pre-commit hook 中自动运行？ | | hook 是否快速可靠？ |

#### C. 测试基础设施

| 检查项 | 有/无 | 质量评估 |
|--------|-------|---------|
| 测试框架和基础配置 | | 测试命令是否明确（AGENTS.md 里有写）？ |
| CI 中有测试步骤 | | 智能体能否通过 CI 验证修改？ |
| 测试运行速度 | | 单个模块测试 <10 秒？全量测试 <5 分钟？ |
| 测试覆盖率报告 | | 智能体能知道哪些代码缺乏测试？ |

#### D. 项目文档（智能体可读的）

| 检查项 | 有/无 | 质量评估 |
|--------|-------|---------|
| README（项目概述和安装） | | 智能体能从中理解项目是做什么的吗？ |
| 架构文档或 ADR | | 智能体能从中理解模块边界吗？ |
| CONTRIBUTING.md（贡献指南） | | 有代码规范说明吗？ |

#### E. Git hooks 和 CI

| 检查项 | 有/无 | 质量评估 |
|--------|-------|---------|
| pre-commit hook | | 是否跑 lint + format + 快速测试？ |
| pre-push hook | | 是否跑完整测试套件？ |
| CI pipeline | | 是否有 lint、测试、构建步骤？ |

### 第 2 步：按优先级补齐

#### P0：没有这些，智能体就是盲飞的

**1. 创建 AGENTS.md（如果没有的话）**

即使是一个已有的复杂项目，你也需要一份 AGENTS.md 告诉智能体项目的关键信息。为已有项目写 AGENTS.md 时，重点关注：

```markdown
# AGENTS.md

## 项目概述
[一句话 + 一段话，描述项目做什么]

## 技术栈
[语言、框架、包管理器、数据库、部署方式]

## 常用命令
[构建、测试、lint、dev server — 从 Makefile / package.json / scripts 中提取]

## 代码规范
[从 CONTRIBUTING.md 或团队规范中提取最关键的 5-10 条]
[重点：模块边界、命名约定、禁止事项]

## 项目结构
[只列前 2-3 层，并标注每个目录的职责]
[例如：src/services/ — 业务服务层，每个子目录是一个独立服务]
```

**2. 确保 lint + formatter 存在且在 CI 中运行**

如果没有 lint 配置，根据你的语言选择一个并配置好。最关键的是让它**能在 pre-commit hook 中自动运行**。

**3. 确保测试命令明确且可执行**

AGENTS.md 中必须有明确的测试命令。如果现有测试很慢，创建一个快速测试子集：

```jsonc
// package.json
{
  "scripts": {
    "test": "vitest",           // 完整测试（watch 模式）
    "test:fast": "vitest --run --reporter=verbose",  // 快速测试（CI/agent 用）
    "test:changed": "vitest --run --changed"          // 只测改动的文件
  }
}
```

#### P1：有了这些，智能体的正确率会显著提升

**4. 配置 pre-commit hooks**

如果还没有 pre-commit hook，参照场景一的第 3 步设置。这是让传感器自动触发的关键。

**5. 补充架构文档**

告诉智能体项目的模块边界和关键决策：

```markdown
# docs/architecture.md

## 关键架构决策
- [ADR-001: 为什么选了 X 而非 Y]
- [ADR-002: 模块间通信方式]

## 模块边界
- [模块 A] 和 [模块 B] 的接口是什么
- 哪些目录可以互相 import，哪些不行

## 智能体注意事项
- 修改 [某模块] 时需要同时更新 [某接口]
- [某目录] 的代码是自动生成的，不要手动修改
```

**6. 为关键子目录添加针对性规则**

如果项目很大，在关键子目录放置 CLAUDE.md 或 `.claude/rules/` 文件，提供该目录特有的指导。

#### P2：锦上添花

**7. 自定义 linter 规则（面向 LLM 优化）**

为团队特有的编码规范创建自定义 linter 规则，并在错误信息中嵌入修正建议 [[Fowler/Böckeler, 2026]](https://martinfowler.com/articles/harness-engineering.html)。

**8. 结构性测试（ArchUnit / 等价物）**

用测试来强制执行架构约束——例如"service 层不能直接 import view 层"。这比写在 AGENTS.md 里有效得多，因为它是计算型传感器，100% 确定性执行 [[Fowler/Böckeler, 2026]](https://martinfowler.com/articles/harness-engineering.html)。

**9. 智能体可用的 MCP server**

如果团队有内部知识库、设计系统或 API 文档，配置 MCP server 让智能体按需访问 [[Fowler/Böckeler, 2026]](https://martinfowler.com/articles/harness-engineering.html)。

### 第 3 步：持续迭代（转向循环）

线束不是一次性配置完就不管了。Fowler 把它定义为一种持续的工程实践 [[Fowler/Böckeler, 2026]](https://martinfowler.com/articles/harness-engineering.html)。

**转向循环（Steering Loop）的运作方式**：

```
使用智能体开发 → 智能体犯了错
→ 这个错误是第一次出现吗？
  → 是：手动修正，继续
  → 否（反复出现）：在线束中添加一条 guide 或 sensor 来预防
→ 用智能体本身来帮助写新的控制（测试、linter、文档）
→ 继续开发 → 重复
```

**实用操作**：

- 智能体反复把代码放在错误的目录？→ 在 AGENTS.md 中加一条明确的规则 + 在架构文档中强化
- 智能体反复遗漏某个 import？→ 让 pre-commit hook 中的 linter 抓住这个问题（计算型传感器，比写规则有效）
- 智能体反复不理解某个模块的职责？→ 在该模块的子目录放一个 CLAUDE.md，专门解释这个模块
- 智能体反复写出不符合团队风格的代码？→ 补充或强化 formatter 配置

**一个有趣的建议** [[Fowler/Böckeler, 2026]](https://martinfowler.com/articles/harness-engineering.html)：让智能体来帮你写它自己的线束。需要新的结构性测试？让智能体帮你生成。需要更新 AGENTS.md？让智能体根据代码库的现状来起草。需要新的自定义 linter 规则？让智能体帮你写。

---

## 附录：不同工具的配置文件对照

| 你用的工具 | 需要创建的文件 | 加载时机 | 备注 |
|-----------|--------------|---------|------|
| **所有工具** | `AGENTS.md` | 每次会话启动 | 跨工具标准，优先创建 |
| **Claude Code** | `CLAUDE.md` + `.claude/` | 会话启动 + 按需 | CLAUDE.md 中可用 `@import AGENTS.md` |
| **Cursor** | `.cursor/rules/*.mdc` | 按文件类型匹配 | 新版规则目录取代旧的 `.cursorrules` |
| **OpenAI Codex** | `AGENTS.md` | 自动读取 | 支持多层级：全局 → 项目 → 子目录 |
| **Augment** | `AGENTS.md` | 自动读取 | 支持模块化拆分 |

**策略**：以 AGENTS.md 为基础（所有工具都读），然后按主要工具加一层工具专用的精细配置（CLAUDE.md 或 .cursor/rules/），避免信息重复。

## 附录：优先级检查清单（快速版）

从零开始或改进现有项目时，按此顺序：

```
□  AGENTS.md 存在且包含：项目概述、技术栈、常用命令、代码规范
□  Lint + formatter 已配置
□  Pre-commit hook 已设置（lint + format + 快速测试）
□  测试命令可执行且结果可读
□  AGENTS.md 中有"怎么验证修改"的指引
□  架构文档存在（至少说明模块边界和禁止事项）

□  CLAUDE.md 或 .cursor/rules/ 已配置（按主工具）
□  Pre-push hook 已设置（完整测试）
□  CI pipeline 包含 lint + 测试 + 构建
□  子目录级规则已设置（关键目录）
□  自定义 linter 规则（面向 LLM 优化的错误信息）
□  结构性测试（强制架构约束）
□  转向循环已建立（反复出现的问题会反馈到线束中）
```

上半部分是"没有就不及格"的底线，下半部分是"越做越好"的加分项。

---

## 参考来源

- Fowler / Böckeler — *Harness engineering for coding agent users* — https://martinfowler.com/articles/harness-engineering.html
- Fowler / Böckeler — *Context Engineering for Coding Agents* — https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html
- AGENTS.md 官方站点 — https://agents.md/
- OpenAI Codex — *Custom Instructions with AGENTS.md* — https://developers.openai.com/codex/guides/agents-md
- Claude Code Docs — *Memory* — https://code.claude.com/docs/en/memory
- Claude Code Docs — *.claude Directory* — https://code.claude.com/docs/en/claude-directory
- Cursor Docs — *Rules* — https://cursor.com/docs/rules
- Augment Code — *How to Build Your AGENTS.md* — https://www.augmentcode.com/guides/how-to-build-agents-md
- Jones Russell — *Git Hooks Are Your Best Defense Against AI-Generated Mess* — https://jonesrussell.github.io/blog/git-hooks-ai-agents/
- Evil Martians — *Stop Writing Rules in AGENTS.md: Use Agent Hooks and nano-staged Instead* — https://evilmartians.com/chronicles/stop-writing-rules-in-agents-md-use-agent-hooks-and-nano-staged-instead
- Anthropic GitHub Issue #2571 — *Subdirectory CLAUDE.md Loading Behavior* — https://github.com/anthropics/claude-code/issues/2571
- OpenAI — *Harness engineering: leveraging Codex in an agent-first world* — https://openai.com/index/harness-engineering/
- Anthropic — *Effective harnesses for long-running agents* — https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Stripe — *Minions: Stripe's one-shot, end-to-end coding agents* — https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents
- *Codified Context: Infrastructure for AI Agents in a Complex Codebase* (arXiv) — https://arxiv.org/html/2602.20478v1
- *Decoding the Configuration of AI Coding Agents* (arXiv) — https://arxiv.org/html/2511.09268v2
