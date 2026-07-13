# 线束工程：把大语言模型变成智能体的脚手架层

*面向从业者的引用式研究简报 —— 2026 年 7 月*

---

## 执行摘要

"线束工程"（harness engineering）正在成为一个被正式命名的学科，专门研究如何设计包裹大语言模型、使其能够作为智能体（agent）行动的软件层——包括调用模型的循环、解析并执行其工具调用、管理上下文中保留的内容、决定何时停止，以及让系统保持在护栏之内。该领域已收敛到一个简洁的等式——**智能体 = 模型 + 线束**——以及一个更难、如今已有充分证据支持的主张：*线束与模型几乎同等重要。* 同一个前沿模型在编码基准测试上可能得 12%，也可能得 50%+，完全取决于周围线束是如何构建的；而一个较弱模型配上更好的线束，可以击败一个更强模型配上较差的线束。本简报涵盖术语定义、线束的解剖结构、线束为何重要的实证依据、真实系统的全景图，以及该领域当前正在攻克的开放性问题。

---

## 1. "线束工程"究竟意味着什么

相关术语仍在沉淀之中，而这个沉淀过程本身就是值得讲述的故事。目前有三个术语在使用，而最敏锐的从业者已经在它们之间划出了明确的界线。

**脚手架（scaffolding）** 是*模型可感知、定义行为的*那一层：系统提示词、工具描述、解析模型输出的规则，以及模型在各步骤之间"记住"什么的内容策略。它是模型所*依托*的东西。Hugging Face 的智能体术语表——迄今为止最清晰的术语来源——将其明确定义为"模型周围定义行为的层"[[HF, 2026]](https://huggingface.co/blog/agent-glossary)。

**线束（harness）** 是*执行*层：调用模型、处理其工具调用、对这些调用执行环境、把结果回传、并决定运行何时结束的代码。同一份术语表表述得十分精炼："线束让智能体得以运行。脚手架则是模型所依托的：它的指令、它的工具、它的格式"[[HF, 2026]](https://huggingface.co/blog/agent-glossary)。Lee Han Chung 那篇被广泛引用的文章给出了形式化版本：智能体线束是"位于模型与模型所操作的环境之间的编排层"，由此得到那个简洁的等式 **智能体 = 线束 + 基础模型** [[Lee, 2026]](https://leehanchung.github.io/blogs/2026/05/08/hidden-technical-debt-agent-harness/)。

**运行时（runtime）** 是线束*寄居*的地方——实际执行工具调用的沙箱、进程、浏览器或虚拟机。把线束和运行时混为一谈是一个常见错误；一个是编排逻辑，另一个是执行环境 [[Credal, 2025]](https://www.credal.ai/blog/agent-harness-vs-agent-runtime)。

在实践中，这些边界是模糊的。已发布的产品经常用"线束"来指代*整个封装层*——Claude Code 自己的文档就自称"Claude 周围的智能体线束"[[HF, 2026]](https://huggingface.co/blog/agent-glossary)，从而把脚手架/线束之分折叠掉了。这种宽泛用法越来越常见，也值得容忍；但对于工程工作而言，那个更精确的三分法（脚手架 = 模型所见；线束 = 运行它的循环；运行时 = 它运行的地方）是更有用的心智模型。

还有一个常被归入的概念：**"线束工程"作为一种实践**。Martin Fowler 站点上 Birgitta Böckeler 在 2026 年撰写的一篇文章，将其定义为一种持续的工程学科而非一次性配置，把线束描述为"一个控制论意义上的调节器，结合前馈与反馈，将代码库调控至期望状态"[[Fowler/Böckeler, 2026]](https://martinfowler.com/articles/harness-engineering.html)。这一框架——前馈引导在模型行动之前预防错误，加上反馈传感器在之后检测并纠正错误——是一种有用的设计词汇，几家主要实验室已经各自独立地收敛到了这套思路 [[OpenAI, 2026]](https://openai.com/index/harness-engineering/)；[[Anthropic, 2025]](https://www.anthropic.com/engineering/harness-design-long-running-apps)。

一个相关但不同的概念是**评测线束（evaluation harness，或称 eval harness）**。在大语言模型领域，这个术语起源于 EleutherAI 的 `lm-evaluation-harness`，这是一个统一框架，用于让模型跑完一组基准测试任务以评估其原始能力 [[EleutherAI]](https://github.com/EleutherAI/lm-evaluation-harness)；[[Biderman et al., 2024]](https://arxiv.org/abs/2405.14782)。*评测线束*衡量一个模型；*智能体线束*把模型变成智能体。两者很容易混淆，因为同一套基准设施（例如 SWE-bench 的测试线束）可能横跨在分界线的任一侧。

---

## 2. 智能体线束的解剖结构

一个生产级的智能体线束由一组可识别的组件构成。其中任何一个单独看都不算稀奇；工程难点在于它们如何组合。

**智能体循环（agentic loop）。** 任何线束的脊梁都是一个控制循环：把系统提示词和历史记录发给模型、接收响应、检查其中是否包含工具调用、执行该调用、把结果追加到上下文，如此反复，直到模型输出一个终止响应或某个停止条件被触发。Anthropic 的工程指南建议将其实现为一个简单的 `while` 循环，包裹交替的模型调用和工具执行调用——每个任务一个循环——并警告在基本循环跑通之前不要去碰复杂的编排 [[Anthropic, 2024]](https://www.anthropic.com/engineering/building-effective-agents)；[[Anthropic, 2025]](https://www.anthropic.com/engineering/writing-tools-for-agents)。这个循环的概念祖先是 ReAct，它形式化了在单条轨迹中交替推理痕迹（"Thought"）与动作（"Act"）的做法 [[Yao et al., 2022]](https://arxiv.org/abs/2210.03629)。

**系统提示词与工具定义。** 即模型所依托的脚手架。这是"提示词工程"栖身之处，但在智能体语境下它远超单条指令的范畴：它包括系统消息、每个工具的名称、描述和 JSON schema、任何注入的检索知识，以及模型必须遵循的格式约定。工具设计被视为一等杠杆——SWE-agent 的核心论点正是：智能体所见的*接口*（有哪些工具、叫什么、输出如何格式化）与模型本身同等重要 [[Yang et al., 2024]](https://arxiv.org/abs/2405.15793)。

**上下文与记忆管理。** 这已成为线束工程中最活跃的领域。模型拥有有限的上下文窗口；线束决定什么填充它。由 LangChain 推广的主流心智模型把 LLM 视作 CPU、把上下文窗口视作它的工作内存（RAM）——而线束的职责就是管理什么占据这块 RAM [[LangChain, 2025]](https://www.langchain.com/blog/context-engineering-for-agents)。在实践中这意味着三个子问题：*压缩*（compaction，对旧的对话轮次做摘要以免窗口溢出）、*检索*（retrieval，仅在需要时拉入外部事实）、以及*工作记忆卫生*（working-memory hygiene，丢弃过期的工具输出）。实证证据——见第 4 节——表明主动的上下文管理在可靠性*和*成本两方面都胜过朴素的完整历史保留。

**规划与推理脚手架。** 线束可以迫使模型在行动之前以结构化方式推理：思维链（chain-of-thought）、ReAct 式的"先思考再行动"、计划-执行分解（plan-and-execute）、对失败的反思（reflection），或对推理分支的完整树搜索。Reflexion 引入了存入情景记忆缓冲的自我批评，使智能体能在跨尝试中口头地从自己的失败中学习，而无需任何权重更新 [[Shinn et al., 2023]](https://arxiv.org/abs/2303.11366)。Tree of Thoughts 则把思维链推广为一个显式的搜索问题，带有自我评估和回溯 [[Yao et al., 2023]](https://arxiv.org/abs/2305.10601)。一个值得注意的警示：一项关于自我反思的实证研究发现，它的效果取决于任务和模型，可能中性、甚至有害，因此反思并非免费午餐 [[Renze et al., 2024]](https://arxiv.org/pdf/2405.06682)。

**编排（orchestration）。** 对于超出"单智能体单循环"的任何场景，线束都必须做编排：并行工具调用、子智能体、或多智能体拓扑（supervisor 主管式、swarm 群集式、hierarchical 层级式）。LangGraph 把这些建模为带显式状态对象和人机回路（human-in-the-loop）中断的有状态有向图 [[LangChain]](https://github.com/langchain-ai/langgraph)；AutoGen 开创了多智能体对话模式 [[Microsoft Research]](https://www.microsoft.com/en-us/research/publication/autogen-enabling-next-gen-llm-applications-via-multi-agent-conversation-framework/)。Anthropic 在*工作流*（workflow，通过预定义代码路径编排的 LLM）与*智能体*（agent，模型主导自己的流程）之间划出了一条有用的界线，并建议从能解决问题的最简单工作流起步 [[Anthropic, 2024]](https://www.anthropic.com/engineering/building-effective-agents)。

**结构化输出与函数调用。** 要确定性地驱动循环，线束必须能可靠地解析模型的工具调用参数。这正是 OpenAI 的 Structured Outputs API 所保证的——符合 schema 的 JSON，而不仅仅是合法的 JSON——而 Anthropic 和 Google 的工具调用 API 中的等价机制，让线束能够信任自己的解析 [[OpenAI]](https://developers.openai.com/api/docs/guides/structured-outputs)；[[Anthropic]](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)。

**护栏、重试与错误处理。** 线束要捕获工具调用失败、解析格式错误的输出、强制执行停止条件，并把破坏性操作置于人工审批之后。这是最不耀眼、也最少文档化的组件；专门的一手论述很罕见，通常只是在工程博客里作为附带内容被提及 [[Anthropic, 2024]](https://www.anthropic.com/engineering/building-effective-agents)。来自从业者的证据表明，*知情*重试——把精确的解析错误反馈给模型——在效果上明显优于盲目重试 [[社区基准测试, 2025]](https://www.reddit.com/r/Python/comments/1tagc2g/i_tested_structured_output_from_288_llm_calls_and/)。

---

## 3. 线束工程与模型训练、提示词工程有何不同

精确地界定线束工程*不是*什么，是值得的，因为混淆恰恰发生在这些边界上。

**模型训练**改变模型的权重——预训练、后训练、强化学习或微调。它昂贵、缓慢，且只由少数几家实验室完成。它改变模型底层的能力分布。

**提示词工程**作用于单次模型调用内部：精心设计指令、示例和框架，以获得最佳的一次性回答。它是*某次调用的输入*的属性。

**线束工程**则横跨*许多次*模型调用：它设计循环、工具、记忆策略、错误处理和停止逻辑，这些共同决定了模型在每次调用时看到什么、以及其输出如何被使用。线束是*模型周围系统*的属性。

这个区分之所以重要，是因为这三个杠杆有着截然不同的成本结构和收益曲线。线束的改动可以在几天内由一个工程团队完成、立即上线，而且——如下一节所示——可以把能力拉动几十个百分点。训练一个更好的模型要耗时数月、花费数百万美元。过去两年的前沿洞察是：对于智能体类任务，线束这个杠杆常常比训练杠杆带来*更多*的单位美元能力收益。这正是"线束工程"获得其名的现实原因。

---

## 4. 实证依据：为何线束与模型同等重要

这是问题的核心，而如今证据已经相当充分。

**SWE-agent 的结果。** 基础性的数据点。Yang 等人表明，在*使用相同* GPT-4 Turbo 模型的情况下，重新设计*智能体-计算机接口*（Agent-Computer Interface, ACI）——即智能体所操作的工具与观察结果——让 SWE-bench 的表现大致翻了三倍，从先前最优的 **3.8%** 提升到 **12.47%** 解决率，并击败了使用默认 Linux shell 的基线智能体。论文的框架刻意借用了人机交互的思路：正如良好的人机交互帮助人类使用计算机，良好的 ACI 帮助智能体使用计算机 [[Yang et al., 2024]](https://arxiv.org/abs/2405.15793)。模型没有变。变的是线束。

**反思带来的两位数增益。** 加入自我反思循环——智能体口头地批评自己失败的尝试，并把教训存入情景记忆向前携带，无需任何权重更新——让 GPT-4 在 HumanEval 上从 **80% 提升到 91% pass@1** [[Shinn et al., 2023]](https://arxiv.org/abs/2303.11366)。同样，这是纯粹的线束效应。

**测试时计算可以替代模型规模。** Snell 等人（UC Berkeley / Google DeepMind）表明，在一个较小模型已有一定成功率的 prompt 上，最优地扩展*测试时*计算（搜索、过程奖励模型、验证）可以击败一个用等量 FLOPs 训练出来的、**大 14 倍**的模型，并且自适应的"计算最优"策略相比朴素的 best-of-N 采样可将效率提升 **4 倍以上** [[Snell et al., 2024]](https://arxiv.org/abs/2408.03314)。线束——它的采样、分支和验证逻辑——正是调解这种"计算换准确率"交易的系统。

**同一个模型在不同线束下得分差异巨大。** 一项 2025 年的研究剖析了所有 SWE-bench 提交，发现仅仅由于线束和脚手架的选择，*同一个底层模型*在 SWE-bench Verified 上会出现 **10 个百分点以上**的波动，在 SWE-bench Pro 上出现 **10–20 分**的波动，并指出排行榜名次"把模型能力与智能体/工程水平混为一谈"[[Martinez et al., 2025]](https://arxiv.org/abs/2506.17208)。这正是为什么 SWE-bench 官方团队现在统一使用单一标准线束（`mini-SWE-agent`）以实现模型间的公平比较——而使用它时，同一个模型的得分明显低于各厂商优化过的自报脚手架下的得分 [[SWE-bench]](https://www.swebench.com/verified.html)。此外还有较弱的、单一来源的证据表明，精心设计的强脚手架可以让更便宜的模型击败更贵的模型；这个方向很有前景，但具体的头条数字在被复现之前应谨慎对待 [[参见 Confucius Code Agent, 2025]](https://arxiv.org/abs/2512.10398)。

**一个更干净的"成本与可靠性"结果。** 也许近年来最具可操作性的发现：在一个 50 任务的企业级工具调用基准上（Microsoft Dynamics 365，MCP 工具，GPT-5，五次运行取平均），朴素的完整历史保留取得了 **71.0%** 的任务完成率，同时每个基准消耗 **148 万 token 和 14.56 小时**。把上下文修剪到最近五次工具调用，*提升*了完成率至 **79.0%**，同时把 token 降至 53.5 万、运行时间降至 5.39 小时。再对修剪后的内容加上自动摘要，则达到 **91.6%** 的完成率——可靠性更好，*且* token 比完整历史保留少约 63%，并在 Claude Sonnet 4.5 上得到跨模型验证 [[Lodha et al., 2026]](https://arxiv.org/abs/2606.10209)。结论是：更多的上下文并不等于更好的上下文，而线束层面的上下文管理同时是可靠性杠杆和成本杠杆。

**诚实的警示。** SWE-bench 上某些表观上的线束增益可能因基准污染和记忆效应而被夸大——一项分析估计约有 **6–7 个百分点**的虚高 [[SWE-bench Illusion, 2025]](https://arxiv.org/abs/2506.12286)。核心结论——线束是一等的能力杠杆——在这一警示下依然成立，但任何来自编码基准的单个头条数字都值得怀疑。

这些结果中的模式是一致的，值得直言：**对于智能体类任务，线束与模型是衡量能力的同等决定因素，而糟糕的线束会浪费一个好的模型。**

---

## 5. 全景图：重要的线束与框架

该领域已产出一脉相承的线束谱系，既有已发布的产品，也有研究原型。

### 产品与研究型智能体线束

2023 年的那一波——**AutoGPT** 和 **BabyAGI**——普及了自主智能体循环（规划 → 行动 → 观察 → 重复）以及任务创建/优先级队列，并催生了更广泛的"智能体 AI"浪潮 [[AutoGPT]](https://github.com/significant-gravitas/autogpt)；[[BabyAGI]](https://github.com/yoheinakajima/babyagi)。Lilian Weng 的《LLM Powered Autonomous Agents》至今仍是这一波所结晶的"规划 + 记忆 + 工具调用"架构的最佳综述 [[Weng, 2023]](https://lilianweng.github.io/posts/2023-06-23-agent/)。**Voyager** 在具身场景中演示了同样的思路，凭借自动课程、可复用技能库和迭代式提示循环，让一个 LLM 智能体在 Minecraft 中达成开放式能力，而无需任何权重更新 [[Wang et al., 2023]](https://arxiv.org/abs/2305.16291)。

**SWE-agent**（普林斯顿）提出了"智能体-计算机接口"论点，至今仍是"把工具/接口设计视为首要杠杆"的标杆性参考 [[Yang et al., 2024]](https://arxiv.org/abs/2405.15793)。**Devin**（Cognition）把"AI 软件工程师"作为产品普及开来：一个全自主的长时程线束，配备持久沙箱（编辑器、浏览器、终端），可执行长达数小时的任务 [[Cognition, 2024]](https://cognition.com/blog/swe-bench-technical-report)。**OpenAI 的 Codex / ChatGPT Agent** 把 Code Interpreter——最初是一个沙箱化的 Python 工具调用循环——演进为一个云原生的并行智能体家族，并集成进 ChatGPT [[OpenAI, 2025]](https://openai.com/index/introducing-chatgpt-agent/)。**Claude 的 computer-use（计算机操作）与 Claude Code** 引入了一种独特的范式：把屏幕级 GUI 控制（截图、光标、点击）作为一等工具暴露出来，使智能体操作的是一个未经插桩的桌面，而非调用类型化的 API [[Anthropic, 2024]](https://www.anthropic.com/news/3-5-models-and-computer-use)。

在框架一侧——即*用于构建*线束的线束——**LangGraph**（有状态有向图，主导的开源编排原语）[[LangChain]](https://github.com/langchain-ai/langgraph)、**Microsoft AutoGen**（多智能体对话）[[Microsoft]](https://github.com/microsoft/autogen)、以及 **CrewAI**（基于角色的多智能体 crew）[[CrewAI]](https://github.com/crewaiinc/crewai)，是构建自定义智能体系统时使用最广的运行时。

### 评测线束

与之并行，还存在一条用于*衡量*智能体的谱系。**SWE-bench** 定义了编码智能体评测的空间：给定一个真实的 GitHub issue 和仓库，系统必须产出一个由仓库隐藏测试套件验证通过的补丁——这是执行级接地（execution-grounded）的评分，而非文本相似度 [[Jimenez et al., 2024]](https://arxiv.org/abs/2310.06770)。**GAIA** 是一组对人类很容易（约 92% 成功率）但对*没有*恰当脚手架的 LLM 很难的问题，直接衡量智能体层的价值 [[Mialon et al., 2023]](https://arxiv.org/abs/2311.12983)。**WebArena** 提供了一个可自托管的交互式 Web 环境，用于对浏览器智能体做端到端评测 [[Zhou et al., 2023]](https://arxiv.org/abs/2307.13854)。**τ-bench**（Sierra Research）衡量任务成功率以及在与"会顶嘴"的模拟用户交互时的策略遵循度——测试真实世界的"工具-智能体-用户"交互 [[Sierra, 2024]](https://arxiv.org/abs/2406.12045)。**HELM**（Stanford CRFM）在模型评测一侧提供了整体性、多指标的透明度方法论 [[Liang et al., 2022]](https://arxiv.org/abs/2211.09110)，而 **AgentBench** 横跨八个不同环境，用于更广泛的多领域智能体评测 [[Liu et al., 2023]](https://arxiv.org/abs/2308.03688)。

贯穿两条谱系的一条主线：评测线束越来越被设计成去衡量*线束*本身，而不仅仅是模型——这本身就说明线束工程已变得多么核心。

---

## 6. 开放性问题与领域走向

**更大的上下文窗口并不能解决上下文饱和问题。** "迷失在中间"（lost in the middle）的发现——模型表现呈 U 形曲线，对放置在长上下文中部的信息急剧退化，即便对"长上下文"模型也是如此——意味着单纯扩大窗口并不能免除线束层面的上下文管理 [[Liu et al., 2023]](https://arxiv.org/abs/2307.03172)。主动的上下文工程（压缩、选择性保留、摘要）依然不可或缺，而且如上所示，可以同时提升可靠性和降低成本 [[Lodha et al., 2026]](https://arxiv.org/abs/2606.10209)。

**长时程可靠性与误差累积。** 多步智能体会漂移，而常见的假设是这仅仅是每步一个小的恒定错误率在多步上累积的结果。近期工作直接审视了这一假设，提供了诊断智能体*在何处、为何*崩溃的方法论，而非假定单一原因 [[Illusion of Diminishing Returns, 2025]](https://arxiv.org/abs/2509.09677)。与此相关，METR 对"智能体能完成的任务长度"的度量已成为追踪真实自主能力随时间变化的关键指标 [[METR, 2025]](https://arxiv.org/abs/2503.14499)。

**线束脆弱性。** 对提示词、工具描述或上下文顺序的微小改动，可能产生巨大的行为变化——这种脆弱性被《Natural-Language Agent Harnesses》一文明确记录，指出"复杂提示词工程的收益在某些场景下可能减弱或变得脆弱"，并提出可编辑的自然语言线束策略，作为让线束成为可分析而非不透明制品的一种方式 [[Pan et al., 2026]](https://arxiv.org/abs/2603.25723)。

**成本与延迟权衡。** Token 是智能体系统的核心经济原语，而长时程运行中指数级的 token 消耗是核心的可扩展性瓶颈 [[Chen et al., 2026]](https://arxiv.org/abs/2605.09104)。主导的成本杠杆是模型级联/路由（model cascading / routing）——把每次调用发送给能胜任的最便宜模型——据广泛报道可大幅削减账单，但代价是升级时增加的延迟 [[路由综述, 2026]](https://arxiv.org/abs/2603.04445)。缓存、并行化和预算约束下的要素替代，都是线束层面的决策。

**长时程运行智能体的记忆架构。** 标准的检索增强生成（RAG）越来越被认为在结构上不适合长时程智能体，因为它把记忆当作无状态的查询表——只读、没有时间连续性、不能修改。带持久存储、选择性保留和时间链接的连续记忆架构（continuum memory architectures）是一个活跃的研究方向 [[Logan, 2026]](https://arxiv.org/abs/2601.09913)，实现一侧也出现了面向从业者的基础设施指南 [[Redis, 2025]](https://redis.io/blog/long-term-memory-architectures-ai-agents/)。

**安全与控制。** 智能体系统继承了一种既不同于传统 AI 安全、也不同于常规软件安全的威胁面，因为智能体*会行动*——执行工具调用、写文件、做预订——而非仅仅生成文本。提示词注入（prompt injection）连续两届蝉联 OWASP LLM 漏洞榜首，而智能体用途（注入的指令可能触发真实行动）使其尤为尖锐 [[OWASP, 2025]](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)。关于智能体 AI 安全的学术综述覆盖了完整分类——提示词注入、工具滥用、过度自主行动——以及监督与停止条件的设计 [[Chhabra et al., 2025]](https://arxiv.org/abs/2510.23883)。权限分离、工具白名单，以及对破坏性操作的人机回路（human-in-the-loop）把关，是当前主流的从业者防御手段。

**核心开放问题：线束复杂性是在增长还是在收缩？** 这是该领域最具影响的辩论。一种观点认为，随着模型在工具使用、反思和长上下文推理方面原生地变得更强，曾经需要外部工程的脚手架会迁移*进模型内部*，线束复杂性会收缩——这是一种"脚手架陷阱"，团队过度工程化了一个模型即将超越的结构 [[Deconinck, 2025]](https://shanedeconinck.be/posts/ai-agent-scaffolding-trap/)。对立的观点——如今两家主要实验室都在已发表的线束文章中背书——则认为复杂性并未收缩，而是在*转移并变得显式*：从偶然的提示词调校，转向审慎、可分析的控制系统设计。OpenAI 写道，其最艰难的挑战现在"集中在设计环境、反馈回路和控制系统"[[OpenAI, 2026]](https://openai.com/index/harness-engineering/)；Anthropic 则把线束设计与长时程应用的有效性直接挂钩 [[Anthropic, 2025]](https://www.anthropic.com/engineering/harness-design-long-running-apps)。Fowler 的综述指出，两家实验室自己的文章表明，复杂性正在被形式化，而非被消除 [[Fowler/Böckeler, 2026]](https://martinfowler.com/articles/harness-engineering.html)。

最站得住脚的综合判断是：*某些*脚手架（手写的反思提示、脆弱的输出解析器、手工的上下文裁剪启发式）确实正在被模型吸收并将消失。但随着智能体承担更长、更高风险、更贴近真实世界的任务，*线束*——循环、工具、记忆策略、护栏、控制系统——正在成为一个更大、更审慎的工程面。这门学科正在固化，而非消散。

---

## 7. 最佳实践与 emerging 共识

几条建议在一手来源中反复出现，值得汇总：

从可能奏效的最简单循环起步——单个智能体跑在一个 `while` 循环里，带几个命名良好的工具——仅在可衡量的行为提出要求时才增加复杂性 [[Anthropic, 2024]](https://www.anthropic.com/engineering/building-effective-agents)。把工具与接口设计视为与模型选择同等的一等杠杆，遵循 SWE-agent 的 ACI 论点 [[Yang et al., 2024]](https://arxiv.org/abs/2405.15793)。主动管理上下文：修剪、摘要、检索，而非保留完整历史，因为证据表明这能同时提升可靠性和降低成本 [[Lodha et al., 2026]](https://arxiv.org/abs/2606.10209)。优先使用知情重试（把精确错误反馈回去）而非盲目重试。把破坏性操作置于人工审批之后，并分离权限以抑制提示词注入风险 [[OWASP, 2025]](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)。使用执行级接地的评测（真实测试、真实浏览器、真实用户），而非文本相似度评分 [[SWE-bench]](https://arxiv.org/abs/2310.06770)；[[WebArena]](https://arxiv.org/abs/2307.13854)。而在比较模型时，请把线束保持不变——否则你衡量线束的成分和衡量模型一样多 [[Martinez et al., 2025]](https://arxiv.org/abs/2506.17208)。

---

## 8. 结论

线束工程是设计"把语言模型变成有效智能体的软件层"这一学科。术语仍在沉淀于一个有用的三分法周围——脚手架（模型所见）、线束（运行它的循环）、运行时（它执行的地方）——即便已发布产品已宽泛地把"线束"用作整个封装层的代称。工程本身是具体的：一个控制循环、工具定义、上下文与记忆管理、推理脚手架、编排、结构化输出，以及护栏。实证依据如今已很充分：对于智能体类任务，这一层在决定衡量能力方面与模型同等重要；好的线束能让较弱模型击败较强模型；而主动的上下文管理在可靠性和成本两方面都胜过朴素的完整历史保留。那些开放性问题——长时程可靠性、脆弱性、成本经济学、记忆架构和安全——恰恰就是构建可靠自主系统所要解决的问题，而两家主要实验室如今都已正式把线束设计作为首要工程面予以投入。该领域的核心押注是：随着智能体承担更长、更重要的任务，这个封装层的工程会变得*更重要*，而非更不重要——即便旧的脚手架碎片正一块块地被日益强大的模型所吸收。

---

## 参考来源

- Hugging Face — *Harness, Scaffold, and the AI Agent Terms Worth Getting Right* — https://huggingface.co/blog/agent-glossary
- Lee Han Chung — *Hidden Technical Debt of AI Systems: Agent Harness* — https://leehanchung.github.io/blogs/2026/05/08/hidden-technical-debt-agent-harness/
- Fowler / Böckeler — *Harness engineering for coding agent users* — https://martinfowler.com/articles/harness-engineering.html
- Credal — *Agent Harness vs Agent Runtime* — https://www.credal.ai/blog/agent-harness-vs-agent-runtime
- Addy Osmani — *Agent Harness Engineering* — https://addyosmani.com/blog/agent-harness-engineering/
- Anthropic — *Building Effective Agents* — https://www.anthropic.com/engineering/building-effective-agents
- Anthropic — *Effective Context Engineering for AI Agents* — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic — *Writing Effective Tools for AI Agents* — https://www.anthropic.com/engineering/writing-tools-for-agents
- Anthropic — *Harness design for long-running application development* — https://www.anthropic.com/engineering/harness-design-long-running-apps
- OpenAI — *Harness engineering* — https://openai.com/index/harness-engineering/
- OpenAI — *Introducing ChatGPT Agent* — https://openai.com/index/introducing-chatgpt-agent/
- OpenAI — *Structured Model Outputs* — https://developers.openai.com/api/docs/guides/structured-outputs
- Yao et al. — *ReAct: Synergizing Reasoning and Acting in Language Models* (2022) — https://arxiv.org/abs/2210.03629
- Shinn et al. — *Reflexion: Language Agents with Verbal Reinforcement Learning* (NeurIPS 2023) — https://arxiv.org/abs/2303.11366
- Yao et al. — *Tree of Thoughts* (NeurIPS 2023) — https://arxiv.org/abs/2305.10601
- Renze et al. — *Self-Reflection in LLM Agents: Effects on Problem-Solving Performance* (2024) — https://arxiv.org/pdf/2405.06682
- Yang et al. — *SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering* (NeurIPS 2024) — https://arxiv.org/abs/2405.15793
- Jimenez et al. — *SWE-bench: Can Language Models Resolve Real-World GitHub Issues?* (ICLR 2024) — https://arxiv.org/abs/2310.06770
- SWE-bench（Verified 排行榜）— https://www.swebench.com/verified.html
- Martinez et al. — *Dissecting the SWE-Bench Leaderboards* (2025) — https://arxiv.org/abs/2506.17208
- *The SWE-Bench Illusion* (2025) — https://arxiv.org/abs/2506.12286
- Snell et al. — *Scaling LLM Test-Time Compute Optimally…* (2024) — https://arxiv.org/abs/2408.03314
- Lodha et al. — *Less Context, Better Agents: Efficient Context Engineering for Long-Horizon Tool-Using LLM Agents* (2026) — https://arxiv.org/abs/2606.10209
- Liu et al. — *Lost in the Middle: How Language Models Use Long Contexts* (2023) — https://arxiv.org/abs/2307.03172
- *The Illusion of Diminishing Returns: Measuring Long Horizon Execution in LLMs* (2025) — https://arxiv.org/abs/2509.09677
- METR — *Measuring AI Ability to Complete Long Tasks* (2025) — https://arxiv.org/abs/2503.14499
- Pan et al. — *Natural-Language Agent Harnesses* (2026) — https://arxiv.org/abs/2603.25723
- Chen et al. — *Token Economics for LLM Agents* (2026) — https://arxiv.org/abs/2605.09104
- Logan — *Continuum Memory Architectures for Long-Horizon LLM Agents* (2026) — https://arxiv.org/abs/2601.09913
- Chhabra et al. — *Agentic AI Security: Threats, Defenses, Evaluation, and Open Challenges* (2025) — https://arxiv.org/abs/2510.23883
- OWASP — *LLM01:2025 Prompt Injection* — https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- LangChain — *Context Engineering for Agents* — https://www.langchain.com/blog/context-engineering-for-agents
- LangGraph — https://github.com/langchain-ai/langgraph
- Microsoft — *AutoGen* — https://github.com/microsoft/autogen
- CrewAI — https://github.com/crewaiinc/crewai
- Cognition — *Devin SWE-bench technical report* — https://cognition.com/blog/swe-bench-technical-report
- Wang et al. — *Voyager: An Open-Ended Embodied Agent with LLMs* (2023) — https://arxiv.org/abs/2305.16291
- Mialon et al. — *GAIA: A Benchmark for General AI Assistants* (2023) — https://arxiv.org/abs/2311.12983
- Zhou et al. — *WebArena* (2023) — https://arxiv.org/abs/2307.13854
- Sierra Research — *τ-bench* (2024) — https://arxiv.org/abs/2406.12045
- Liang et al. — *HELM: Holistic Evaluation of Language Models* (2022) — https://arxiv.org/abs/2211.09110
- Liu et al. — *AgentBench* (2023) — https://arxiv.org/abs/2308.03688
- Biderman et al. — *Lessons from the Trenches on Reproducible Evaluation* (2024) — https://arxiv.org/abs/2405.14782
- EleutherAI — *lm-evaluation-harness* — https://github.com/EleutherAI/lm-evaluation-harness
- Weng, L. — *LLM Powered Autonomous Agents* (2023) — https://lilianweng.github.io/posts/2023-06-23-agent/
- Redis — *Long-Term Memory Architectures for AI Agents* — https://redis.io/blog/long-term-memory-architectures-ai-agents/
- Deconinck — *The AI Agent Scaffolding Trap* — https://shanedeconinck.be/posts/ai-agent-scaffolding-trap/

*关于证据质量的说明：来自 SWE-agent（12.47%）、Reflexion（91%）、Lodha 等人上下文管理结果（71.0% → 91.6%）以及"迷失在中间"结论的数据，均已直接对照一手来源核实。单一来源的 Confucius Code Agent"较弱击败较强"数字（52.7%）以及 SWE-bench 污染估计值（约 6–7 分）由于仍缺乏独立复现，在文中以谨慎口吻呈现。*
