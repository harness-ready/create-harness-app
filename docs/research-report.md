# Harness Engineering: The Scaffolding Layer That Turns LLMs Into Agents

*A cited research briefing for practitioners — July 2026*

---

## Executive summary

"Harness engineering" is emerging as the named discipline for designing the software layer that wraps a large language model and makes it act as an agent — the loop that calls the model, parses and executes its tool calls, manages what sits in context, decides when to stop, and keeps the system inside guardrails. The field has converged on a simple identity — **an agent is a model plus a harness** — and a harder, now well-evidenced claim: *the harness matters roughly as much as the model.* The same frontier model can score 12% or 50%+ on a coding benchmark depending purely on how the surrounding harness is built, and a weaker model in a better harness can beat a stronger model in a worse one. This briefing covers the terminology, the anatomy of a harness, the empirical case for why it matters, the landscape of real systems, and the open problems the field is currently wrestling with.

---

## 1. What "harness engineering" actually means

The vocabulary is still settling, and that settling is itself the story. Three terms are in play, and the sharpest practitioners now draw explicit lines between them.

**Scaffolding** is the *model-perceivable, behavior-defining* layer: the system prompt, the tool descriptions, the rules for how the model's output is parsed, and the policy for what the model "remembers" across steps. It is what the model works *from*. Hugging Face's agent glossary — the clearest terminological source to date — defines it as exactly this: "the behavior-defining layer around the model" [[HF, 2026]](https://huggingface.co/blog/agent-glossary).

**The harness** is the *execution* layer: the code that calls the model, handles its tool calls, executes those calls against the environment, feeds results back, and decides when the run is over. The same glossary puts it crisply: "The harness is what makes the agent run. Scaffolding is what the model works from: its instructions, its tools, its format" [[HF, 2026]](https://huggingface.co/blog/agent-glossary). Lee Han Chung's widely cited treatment gives the formal version: the agent harness is "the orchestration layer that sits between the model and the environments that the model is operating in," yielding the compact identity **agent = harness + foundation model** [[Lee, 2026]](https://leehanchung.github.io/blogs/2026/05/08/hidden-technical-debt-agent-harness/).

**The runtime** is where the harness *lives* — the sandbox, process, browser, or VM that actually executes tool calls. Conflating harness and runtime is a common mistake; one is orchestration logic, the other is the execution environment [[Credal, 2025]](https://www.credal.ai/blog/agent-harness-vs-agent-runtime).

In practice, the boundary blurs. Shipped products frequently use "harness" to mean *the whole wrapper* — Claude Code's own documentation calls itself "the agentic harness around Claude" [[HF, 2026]](https://huggingface.co/blog/agent-glossary), collapsing the scaffold/harness distinction. That broad usage is increasingly common and worth tolerating, but the precise three-way split (scaffold = what the model sees; harness = the loop that runs it; runtime = where it runs) is the more useful mental model for engineering work.

One more term that gets bundled in: **"harness engineering"** as a practice. Martin Fowler's site, in a 2026 piece by Birgitta Böckeler, frames it as an ongoing engineering discipline rather than a one-time setup, describing the harness as "a cybernetic governor, combining feed-forward and feedback to regulate the codebase towards its desired state" [[Fowler/Böckeler, 2026]](https://martinfowler.com/articles/harness-engineering.html). That framing — feed-forward guides that prevent errors before the model acts, plus feedback sensors that detect and correct them after — is a useful design vocabulary that several of the major labs have independently converged on [[OpenAI, 2026]](https://openai.com/index/harness-engineering/); [[Anthropic, 2025]](https://www.anthropic.com/engineering/harness-design-long-running-apps).

A related but distinct concept is the **evaluation harness** (or "eval harness"). In the LLM world this term originates with EleutherAI's `lm-evaluation-harness`, a unified framework for running a model through a battery of benchmark tasks to score its raw capability [[EleutherAI]](https://github.com/EleutherAI/lm-evaluation-harness); [[Biderman et al., 2024]](https://arxiv.org/abs/2405.14782). An *eval harness* measures a model; an *agent harness* makes a model into an agent. The two are easily confused because the same benchmark infrastructure (SWE-bench's test harness, for example) can sit on either side of the line.

---

## 2. The anatomy of an agent harness

A production agent harness is built from a recognizable set of components. None is exotic on its own; the engineering difficulty is in how they compose.

**The agentic loop.** The spine of any harness is a control loop: send the system prompt and history to the model, receive a response, check whether it contains a tool call, execute that call, append the result to context, and repeat until the model emits a terminal response or a stop condition fires. Anthropic's engineering guidance recommends implementing this as a simple `while`-loop wrapping alternating model and tool-execution calls — one loop per task — and warns against reaching for elaborate orchestration before the basic loop is working [[Anthropic, 2024]](https://www.anthropic.com/engineering/building-effective-agents); [[Anthropic, 2025]](https://www.anthropic.com/engineering/writing-tools-for-agents). The conceptual ancestor of this loop is ReAct, which formalized interleaving reasoning traces ("Thought") with actions ("Act") in a single trajectory [[Yao et al., 2022]](https://arxiv.org/abs/2210.03629).

**System prompt and tool definitions.** The scaffold the model works from. This is where "prompt engineering" lives, but in an agent context it expands well beyond a single instruction: it includes the system message, every tool's name and description and JSON schema, any injected retrieved knowledge, and the format conventions the model must follow. Tool design is treated as a first-class lever — SWE-agent's central thesis is that the *interface* the agent sees (what tools exist, what they're called, how their output is formatted) is as important as the model itself [[Yang et al., 2024]](https://arxiv.org/abs/2405.15793).

**Context and memory management.** This has become the most active area of harness engineering. The model has a finite context window; the harness decides what fills it. The dominant mental model, popularized by LangChain, treats the LLM as a CPU and the context window as its working RAM — and the harness's job as managing what occupies that RAM [[LangChain, 2025]](https://www.langchain.com/blog/context-engineering-for-agents). In practice this means three sub-problems: *compaction* (summarizing old turns so the window doesn't overflow), *retrieval* (pulling in external facts only when needed), and *working-memory hygiene* (dropping stale tool outputs). The empirical evidence — covered in section 4 — is that active context management beats naive full-history retention on both reliability *and* cost.

**Planning and reasoning scaffolding.** The harness can force the model to reason in structured ways before acting: chain-of-thought, ReAct-style thought-before-action, plan-and-execute decomposition, reflection on failures, or full tree-search over reasoning branches. Reflexion introduced self-critique stored in an episodic memory buffer, so the agent verbally learns from its own failed attempts across trials without any weight updates [[Shinn et al., 2023]](https://arxiv.org/abs/2303.11366). Tree of Thoughts generalized chain-of-thought into an explicit search problem with self-evaluation and backtracking [[Yao et al., 2023]](https://arxiv.org/abs/2305.10601). A useful caveat: an empirical study of self-reflection found it can be neutral or even harmful depending on task and model, so reflection is not a free win [[Renze et al., 2024]](https://arxiv.org/pdf/2405.06682).

**Orchestration.** For anything beyond a single agent in a single loop, the harness must orchestrate: parallel tool calls, sub-agents, or multi-agent topologies (supervisor, swarm, hierarchical). LangGraph models these as stateful cyclic directed graphs with explicit state objects and human-in-the-loop interrupts [[LangChain]](https://github.com/langchain-ai/langgraph); AutoGen pioneered the multi-agent conversation pattern [[Microsoft Research]](https://www.microsoft.com/en-us/research/publication/autogen-enabling-next-gen-llm-applications-via-multi-agent-conversation-framework/). Anthropic draws a useful line between *workflows* (LLMs orchestrated through predefined code paths) and *agents* (the model directs its own process), and recommends starting with the simplest workflow that solves the problem [[Anthropic, 2024]](https://www.anthropic.com/engineering/building-effective-agents).

**Structured outputs and function calling.** To drive the loop deterministically, the harness must reliably parse the model's tool-call arguments. This is what OpenAI's Structured Outputs API guarantees — schema-adherent JSON rather than merely valid JSON — and the analogous mechanism in Anthropic's and Google's tool-use APIs is what lets a harness trust its own parsing [[OpenAI]](https://developers.openai.com/api/docs/guides/structured-outputs); [[Anthropic]](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview).

**Guardrails, retries, and error handling.** The harness catches tool-call failures, parses malformed outputs, enforces stop conditions, and gates destructive actions behind human approval. This is the least-glamorous and least-documented component; primary treatments are rare and it is usually discussed as an aside inside engineering blogs [[Anthropic, 2024]](https://www.anthropic.com/engineering/building-effective-agents). Practitioner evidence suggests that *informed* retries — feeding the precise parse error back to the model — materially outperform blind retries [[community benchmark, 2025]](https://www.reddit.com/r/Python/comments/1tagc2g/i_tested_structured_output_from_288_llm_calls_and/).

---

## 3. How harness engineering differs from model training and prompt engineering

It is worth being precise about what harness engineering is *not*, because the boundaries are where confusion lives.

**Model training** changes the model's weights — pretraining, post-training, reinforcement learning, or fine-tuning. It is expensive, slow, and done by a handful of labs. It changes the model's underlying capability distribution.

**Prompt engineering** operates within a single model invocation: crafting the instruction, examples, and framing to get the best one-shot answer. It is a property of the *input* to one call.

**Harness engineering** operates *across* many model invocations: it designs the loop, the tools, the memory policy, the error handling, and the stopping logic that determine what the model sees on each call and how its outputs are used. A harness is a property of the *system* around the model.

The distinction matters because the three levers have very different cost structures and payoff profiles. Harness changes can be made in days by an engineering team, ship immediately, and — as the next section shows — can move capability by tens of percentage points. Training a better model takes months and millions of dollars. The frontier insight of the last two years is that, for agentic tasks, the harness lever has frequently delivered *more* capability per dollar than the training lever. That is the practical reason "harness engineering" has acquired a name.

---

## 4. The empirical case: why the harness matters as much as the model

This is the heart of the matter, and the evidence is now strong.

**The SWE-agent result.** The foundational data point. Yang et al. showed that redesigning the *agent-computer interface* (ACI) — the tools and observations the agent works with — using the *same* GPT-4 Turbo model roughly tripled performance on SWE-bench, from a prior state-of-the-art of **3.8%** to **12.47%** resolved issues, beating a baseline agent that used the default Linux shell. The paper's framing, borrowed deliberately from human-computer interaction: just as good HCI helps humans use computers, good ACI helps agents use them [[Yang et al., 2024]](https://arxiv.org/abs/2405.15793). The model did not change. The harness did.

**Reflection's double-digit gains.** Adding a self-reflection loop — the agent verbally critiques its own failed attempts and carries the lessons forward in episodic memory, with no weight updates — lifted GPT-4 from **80% to 91% pass@1** on HumanEval [[Shinn et al., 2023]](https://arxiv.org/abs/2303.11366). Again, pure harness effect.

**Test-time compute can substitute for model scale.** Snell et al. (UC Berkeley / Google DeepMind) showed that on prompts where a smaller model has non-trivial success, optimally scaling *test-time* compute (search, process reward models, verification) can outperform a model **14× larger** trained with the equivalent FLOPs, and that an adaptive "compute-optimal" strategy improves efficiency by more than **4×** over naive best-of-N sampling [[Snell et al., 2024]](https://arxiv.org/abs/2408.03314). The harness — its sampling, branching, and verification logic — is the system that mediates this compute-for-accuracy trade.

**The same model scores very differently under different harnesses.** A 2025 study dissecting all SWE-bench submissions found that harness and scaffolding choices alone produce **10%+ swings** on SWE-bench Verified and **10–20 point swings** on SWE-bench Pro for the *same underlying model*, and argued that leaderboard rankings "conflate model capability with agent/engineering sophistication" [[Martinez et al., 2025]](https://arxiv.org/abs/2506.17208). This is precisely why the official SWE-bench team now standardizes on a single harness (`mini-SWE-agent`) to enable apples-to-apples model comparison — and using it, the same models score materially lower than under vendors' optimized self-reported scaffolding [[SWE-bench]](https://www.swebench.com/verified.html). There is also weaker, single-source evidence that a deliberately strong scaffold can let a cheaper model outpoint a more expensive one; that direction is promising but the specific headline numbers should be treated cautiously until replicated [[cf. Confucius Code Agent, 2025]](https://arxiv.org/abs/2512.10398).

**A cleaner cost-and-reliability result.** Perhaps the most actionable recent finding: on a 50-task enterprise tool-use benchmark (Microsoft Dynamics 365, MCP tools, GPT-5, five runs averaged), naive full-history retention achieved **71.0%** task completion while burning **1.48M tokens and 14.56 hours** per benchmark. Pruning context to the last five tool calls *improved* completion to **79.0%** while cutting tokens to 535K and runtime to 5.39 hours. Adding automated summarization of pruned content hit **91.6%** completion — better reliability *and* ~63% fewer tokens than full-context retention, with cross-model confirmation on Claude Sonnet 4.5 [[Lodha et al., 2026]](https://arxiv.org/abs/2606.10209). The takeaway: more context is not better context, and harness-level context management is simultaneously a reliability lever and a cost lever.

**The honest caveat.** Some apparent harness gains on SWE-bench may be inflated by benchmark contamination and memorization — one analysis estimates roughly **6–7 percentage points** of inflation [[SWE-bench Illusion, 2025]](https://arxiv.org/abs/2506.12286). The core finding — that the harness is a first-class capability lever — survives this caveat, but any single headline number from a coding benchmark deserves skepticism.

The pattern across these results is consistent and worth stating plainly: **for agentic tasks, the harness and the model are co-equal determinants of measured capability, and a poor harness can waste a good model.**

---

## 5. The landscape: notable harnesses and frameworks

The field has produced a recognizable lineage of harnesses, both as shipped products and as research artifacts.

### Product and research agent harnesses

The 2023 wave — **AutoGPT** and **BabyAGI** — popularized the autonomous agent loop (plan → act → observe → repeat) and the task-creation/prioritization queue, and catalyzed the broader "agentic AI" moment [[AutoGPT]](https://github.com/significant-gravitas/autogpt); [[BabyAGI]](https://github.com/yoheinakajima/babyagi). Lilian Weng's "LLM Powered Autonomous Agents" remains the best synthesis of the planning + memory + tool-use architecture this wave crystallized [[Weng, 2023]](https://lilianweng.github.io/posts/2023-06-23-agent/). **Voyager** demonstrated the same ideas in an embodied setting, with an automatic curriculum, a reusable skill library, and an iterative prompting loop that let an LLM agent achieve open-ended competence in Minecraft without any weight updates [[Wang et al., 2023]](https://arxiv.org/abs/2305.16291).

**SWE-agent** (Princeton) introduced the Agent-Computer Interface thesis and remains the canonical reference for treating tool/interface design as the primary lever [[Yang et al., 2024]](https://arxiv.org/abs/2405.15793). **Devin** (Cognition) popularized the "AI software engineer" as a product: a fully autonomous long-horizon harness with a persistent sandbox (editor, browser, terminal) for multi-hour tasks [[Cognition, 2024]](https://cognition.com/blog/swe-bench-technical-report). **OpenAI's Codex / ChatGPT Agent** evolved Code Interpreter — originally a sandboxed Python tool-use loop — into a cloud-native parallel agent family integrated into ChatGPT [[OpenAI, 2025]](https://openai.com/index/introducing-chatgpt-agent/). **Claude's computer-use and Claude Code** introduced a distinct paradigm: exposing screen-level GUI control (screenshots, cursor, clicks) as a first-class tool, so the agent operates an uninstrumented desktop rather than calling typed APIs [[Anthropic, 2024]](https://www.anthropic.com/news/3-5-models-and-computer-use).

On the framework side — harnesses *for building* harnesses — **LangGraph** (stateful cyclic graphs, the dominant open-source orchestration primitive) [[LangChain]](https://github.com/langchain-ai/langgraph), **Microsoft AutoGen** (multi-agent conversation) [[Microsoft]](https://github.com/microsoft/autogen), and **CrewAI** (role-based multi-agent crews) [[CrewAI]](https://github.com/crewaiinc/crewai) are the most-used runtimes for custom agent systems.

### Evaluation harnesses

A parallel lineage exists for *measuring* agents. **SWE-bench** defines the coding-agent eval space: given a real GitHub issue and repo, the system must produce a patch verified by the repo's hidden test suite — execution-grounded grading rather than text similarity [[Jimenez et al., 2024]](https://arxiv.org/abs/2310.06770). **GAIA** is a benchmark of questions easy for humans (~92% success) but hard for an LLM *without* proper harness scaffolding, directly measuring the value of the agent layer [[Mialon et al., 2023]](https://arxiv.org/abs/2311.12983). **WebArena** provides a self-hostable interactive web environment for end-to-end evaluation of browser agents [[Zhou et al., 2023]](https://arxiv.org/abs/2307.13854). **τ-bench** (Sierra Research) measures both task success and policy adherence under a simulated user that talks back — testing real-world tool-agent-user interaction [[Sierra, 2024]](https://arxiv.org/abs/2406.12045). **HELM** (Stanford CRFM) provides the holistic, multi-metric transparency methodology on the model-eval side [[Liang et al., 2022]](https://arxiv.org/abs/2211.09110), and **AgentBench** spans eight distinct environments for broader multi-domain agent eval [[Liu et al., 2023]](https://arxiv.org/abs/2308.03688).

A through-line across both lineages: the eval harnesses are increasingly designed to measure *the harness*, not just the model — which is itself a recognition of how central harness engineering has become.

---

## 6. Open problems and where the field is heading

**Context-window saturation is not solved by bigger windows.** The "lost in the middle" finding — that model performance follows a U-shaped curve, degrading sharply for information placed in the middle of a long context, even for "long-context" models — means that simply enlarging the window does not obviate harness-level context management [[Liu et al., 2023]](https://arxiv.org/abs/2307.03172). Active context engineering (compaction, selective retention, summarization) remains essential, and as shown above, can improve both reliability and cost simultaneously [[Lodha et al., 2026]](https://arxiv.org/abs/2606.10209).

**Long-horizon reliability and compounding error.** Multi-step agents drift, and the common assumption is that this is simply compounding of a small per-step error rate over many steps. Recent work interrogates that assumption directly, providing methodology to diagnose *where and why* agents break down over long horizons rather than assuming a single cause [[Illusion of Diminishing Returns, 2025]](https://arxiv.org/abs/2509.09677). Relatedly, METR's measurement of "task length agents can complete" has become a key metric for tracking real autonomous capability over time [[METR, 2025]](https://arxiv.org/abs/2503.14499).

**Harness brittleness.** Small changes to prompts, tool descriptions, or context ordering can produce large behavior changes — a fragility that the Natural-Language Agent Harnesses work documents explicitly, noting that "gains from complex prompt engineering can diminish or become brittle in some settings," and proposing editable natural-language harness policies as a way to make the harness an analyzable rather than opaque artifact [[Pan et al., 2026]](https://arxiv.org/abs/2603.25723).

**Cost and latency tradeoffs.** Tokens are the core economic primitive of agentic systems, and exponential token consumption over long runs is the central scalability bottleneck [[Chen et al., 2026]](https://arxiv.org/abs/2605.09104). The dominant cost lever is model cascading / routing — sending each call to the cheapest capable model — which is widely reported to cut bills dramatically, though at the cost of added latency on escalations [[routing survey, 2026]](https://arxiv.org/abs/2603.04445). Caching, parallelization, and budget-constrained factor substitution are all harness-level decisions.

**Memory architectures for long-running agents.** Standard retrieval-augmented generation is increasingly argued to be structurally inadequate for long-horizon agents because it treats memory as a stateless lookup table — read-only, with no temporal continuity or mutation. Continuum memory architectures with persistent storage, selective retention, and temporal chaining are an active research direction [[Logan, 2026]](https://arxiv.org/abs/2601.09913), with practitioner infrastructure guides emerging on the implementation side [[Redis, 2025]](https://redis.io/blog/long-term-memory-architectures-ai-agents/).

**Safety and control.** Agentic systems inherit a threat surface distinct from both traditional AI safety and conventional software security, because agents *act* — executing tool calls, writing files, making bookings — rather than merely generating text. Prompt injection remains the OWASP #1 LLM vulnerability two editions running, and agentic use (where injected instructions can trigger real actions) sharpens it considerably [[OWASP, 2025]](https://genai.owasp.org/llmrisk/llm01-prompt-injection/). The academic survey of agentic AI security covers the full taxonomy — prompt injection, tool abuse, overeager autonomous action — alongside oversight and stopping-condition design [[Chhabra et al., 2025]](https://arxiv.org/abs/2510.23883). Privilege separation, tool allow-listing, and human-in-the-loop gates on destructive actions are the prevailing practitioner defenses.

**The central open question: is harness complexity growing or shrinking?** This is the most consequential debate in the field. One view holds that as models get natively better at tool use, reflection, and long-context reasoning, the scaffolding that once required external engineering migrates *into the model*, and harness complexity shrinks — a "scaffolding trap" where teams over-engineer structure the model is about to outgrow [[Deconinck, 2025]](https://shanedeconinck.be/posts/ai-agent-scaffolding-trap/). The opposing view, now endorsed by both major labs in published harness posts, is that complexity is not shrinking but *shifting and becoming explicit* — from incidental prompt-tuning into deliberate, analyzable control-system design. OpenAI writes that its hardest challenges now "center on designing environments, feedback loops, and control systems" [[OpenAI, 2026]](https://openai.com/index/harness-engineering/); Anthropic ties harness design directly to long-running-application effectiveness [[Anthropic, 2025]](https://www.anthropic.com/engineering/harness-design-long-running-apps). The Fowler synthesis argues the labs' own posts show complexity is being formalized, not eliminated [[Fowler/Böckeler, 2026]](https://martinfowler.com/articles/harness-engineering.html).

The most defensible synthesis: *some* scaffolding (hand-written reflection prompts, fragile output parsers, manual context-trimming heuristics) is indeed being absorbed by the model and will disappear. But the *harness* — the loop, the tools, the memory policy, the guardrails, the control system — is becoming a larger and more deliberate engineering surface as agents take on longer, higher-stakes, real-world tasks. The discipline is consolidating, not dissolving.

---

## 7. Best practices and emerging consensus

Several recommendations recur across the primary sources and are worth collecting:

Start with the simplest loop that could work — a single agent in a `while`-loop with a few well-named tools — and add complexity only when measured behavior demands it [[Anthropic, 2024]](https://www.anthropic.com/engineering/building-effective-agents). Treat tool and interface design as a first-class lever comparable to model selection, following the SWE-agent ACI thesis [[Yang et al., 2024]](https://arxiv.org/abs/2405.15793). Manage context actively: prune, summarize, and retrieve rather than retaining full history, since the evidence shows this improves both reliability and cost [[Lodha et al., 2026]](https://arxiv.org/abs/2606.10209). Prefer informed retries (feeding the precise error back) over blind retries. Gate destructive actions behind human approval and separate privileges to contain prompt-injection risk [[OWASP, 2025]](https://genai.owasp.org/llmrisk/llm01-prompt-injection/). Use execution-grounded evals (real tests, real browsers, real users) rather than text-similarity scoring [[SWE-bench]](https://arxiv.org/abs/2310.06770); [[WebArena]](https://arxiv.org/abs/2307.13854). And when comparing models, hold the harness constant — or you are measuring the harness as much as the model [[Martinez et al., 2025]](https://arxiv.org/abs/2506.17208).

---

## 8. Conclusion

Harness engineering is the discipline of designing the software layer that turns a language model into an effective agent. The terminology is still settling around a useful three-way split — scaffold (what the model sees), harness (the loop that runs it), runtime (where it executes) — even as shipped products use "harness" loosely to mean the whole wrapper. The engineering is concrete: a control loop, tool definitions, context and memory management, reasoning scaffolding, orchestration, structured outputs, and guardrails. The empirical case is now strong that for agentic tasks this layer is co-equal with the model in determining measured capability, that good harnessing can let a weaker model beat a stronger one, and that active context management beats naive full-history retention on both reliability and cost. The open problems — long-horizon reliability, brittleness, cost economics, memory architectures, and safety — are exactly the problems of building reliable autonomous systems, and both major labs have now formally committed to harness design as a primary engineering surface. The field's central bet is that as agents take on longer and more consequential tasks, the engineering of the wrapper matters more, not less — even as individual pieces of old scaffolding get absorbed by ever more capable models.

---

## Sources

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
- SWE-bench (Verified leaderboard) — https://www.swebench.com/verified.html
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

*Note on evidence quality: figures from SWE-agent (12.47%), Reflexion (91%), the Lodha et al. context-management results (71.0% → 91.6%), and the "lost in the middle" finding were verified directly against primary sources. The single-source Confucius Code Agent "weaker-beats-stronger" number (52.7%) and the SWE-bench contamination estimate (~6–7 pts) are reported cautiously as they remain less independently corroborated.*
