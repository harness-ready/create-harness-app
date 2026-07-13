// ─────────────────────────────────────────────────
// Language & framework configuration data
// ─────────────────────────────────────────────────

export const LANGUAGES = {
  typescript: {
    label: 'TypeScript',
    extensions: ['.ts', '.tsx'],
    defaultFramework: 'express',
    packageManagers: [
      { value: 'pnpm', label: 'pnpm', lockfile: 'pnpm-lock.yaml' },
      { value: 'npm', label: 'npm', lockfile: 'package-lock.json' },
      { value: 'yarn', label: 'yarn', lockfile: 'yarn.lock' },
      { value: 'bun', label: 'bun', lockfile: 'bun.lockb' },
    ],
    frameworks: [
      { value: 'nextjs', label: 'Next.js (App Router)' },
      { value: 'express', label: 'Express' },
      { value: 'nest', label: 'Nest.js' },
      { value: 'none', label: 'None (vanilla TypeScript)' },
    ],
    lintTool: 'biome',
    testFramework: 'vitest',
    testCommand: 'npx vitest --run',
    testDevCommand: 'npx vitest',
    testFastCommand: 'npx vitest --run --reporter=verbose',
    testChangedCommand: 'npx vitest --run --changed',
    typeCheckCommand: 'npx tsc --noEmit',
    buildCommand: 'npx tsc',
    devCommand: 'npx tsx watch src/index.ts',
    installCommand: (pm) => `${pm} install`,
    addCommand: (pm, pkg) => `${pm} add ${pkg}`,
    addDevCommand: (pm, pkg) => `${pm} add -D ${pkg}`,
    gitignorePatterns: ['node_modules/', 'dist/', '.env', '.env.local', '*.tsbuildinfo', '.next/'],
    editorconfigLang: 'typescript',
  },

  python: {
    label: 'Python',
    extensions: ['.py'],
    defaultFramework: 'fastapi',
    packageManagers: [
      { value: 'uv', label: 'uv (fast, recommended)', lockfile: 'uv.lock' },
      { value: 'poetry', label: 'Poetry', lockfile: 'poetry.lock' },
      { value: 'pip', label: 'pip + venv', lockfile: null },
    ],
    frameworks: [
      { value: 'fastapi', label: 'FastAPI' },
      { value: 'django', label: 'Django' },
      { value: 'flask', label: 'Flask' },
      { value: 'none', label: 'None (vanilla Python)' },
    ],
    lintTool: 'ruff',
    testFramework: 'pytest',
    testCommand: 'python -m pytest',
    testDevCommand: 'python -m pytest -f',
    testFastCommand: 'python -m pytest -x --tb=short',
    typeCheckCommand: 'python -m pyright',
    buildCommand: null,
    devCommand: null,
    installCommand: (pm) => pm === 'uv' ? 'uv sync' : pm === 'poetry' ? 'poetry install' : 'pip install -e ".[dev]"',
    addCommand: (pm, pkg) => pm === 'uv' ? `uv add ${pkg}` : pm === 'poetry' ? `poetry add ${pkg}` : `pip install ${pkg}`,
    addDevCommand: (pm, pkg) => pm === 'uv' ? `uv add --dev ${pkg}` : pm === 'poetry' ? `poetry add --group dev ${pkg}` : `pip install ${pkg}`,
    gitignorePatterns: ['__pycache__/', '*.pyc', '.venv/', '*.egg-info/', '.env', '.ruff_cache/', '.pytest_cache/', 'dist/', 'build/'],
    editorconfigLang: 'python',
  },

  go: {
    label: 'Go',
    extensions: ['.go'],
    defaultFramework: 'standard',
    packageManagers: [
      { value: 'go', label: 'Go modules (go mod)', lockfile: 'go.sum' },
    ],
    frameworks: [
      { value: 'standard', label: 'Standard library' },
      { value: 'gin', label: 'Gin (HTTP framework)' },
      { value: 'fiber', label: 'Fiber (HTTP framework)' },
      { value: 'none', label: 'None (minimal)' },
    ],
    lintTool: 'golangci-lint',
    testFramework: 'go-test',
    testCommand: 'go test ./...',
    testDevCommand: 'go test -v ./...',
    testFastCommand: 'go test -short ./...',
    typeCheckCommand: null,
    buildCommand: 'go build ./...',
    devCommand: 'go run ./cmd/server',
    installCommand: () => 'go mod download',
    addCommand: (_pm, pkg) => `go get ${pkg}`,
    addDevCommand: (_pm, pkg) => `go get ${pkg}`,
    gitignorePatterns: ['vendor/', '.env', 'bin/', '*.exe'],
    editorconfigLang: 'go',
  },

  java: {
    label: 'Java',
    extensions: ['.java'],
    defaultFramework: 'spring-boot',
    packageManagers: [
      { value: 'maven', label: 'Maven', lockfile: null },
      { value: 'gradle', label: 'Gradle (Kotlin DSL)', lockfile: null },
    ],
    frameworks: [
      { value: 'spring-boot', label: 'Spring Boot' },
      { value: 'quarkus', label: 'Quarkus' },
      { value: 'none', label: 'None (vanilla Java)' },
    ],
    lintTool: 'checkstyle',
    testFramework: 'junit',
    testCommand: null, // depends on build tool
    testDevCommand: null,
    testFastCommand: null,
    typeCheckCommand: null,
    buildCommand: null,
    devCommand: null,
    installCommand: () => null,
    addCommand: () => null, // managed by build tool
    addDevCommand: () => null,
    gitignorePatterns: ['target/', '.env', '*.class', '.idea/', '*.iml', 'build/'],
    editorconfigLang: 'java',
  },

  rust: {
    label: 'Rust',
    extensions: ['.rs'],
    defaultFramework: 'standard',
    packageManagers: [
      { value: 'cargo', label: 'Cargo', lockfile: 'Cargo.lock' },
    ],
    frameworks: [
      { value: 'standard', label: 'Standard library' },
      { value: 'actix', label: 'Actix-web (HTTP framework)' },
      { value: 'axum', label: 'Axum (HTTP framework)' },
      { value: 'none', label: 'None (minimal)' },
    ],
    lintTool: 'clippy',
    testFramework: 'cargo-test',
    testCommand: 'cargo test',
    testDevCommand: 'cargo test -- --nocapture',
    testFastCommand: 'cargo test -- --test-threads=1',
    typeCheckCommand: null,
    buildCommand: 'cargo build',
    devCommand: 'cargo run',
    installCommand: () => 'cargo fetch',
    addCommand: (_pm, pkg) => `cargo add ${pkg}`,
    addDevCommand: (_pm, pkg) => `cargo add --dev ${pkg}`,
    gitignorePatterns: ['target/', '.env'],
    editorconfigLang: 'rust',
  },
};

export const CODING_AGENTS = [
  { value: 'claude-code', label: 'Claude Code (Anthropic)' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'codex', label: 'Codex (OpenAI)' },
  { value: 'copilot', label: 'GitHub Copilot' },
  { value: 'multiple', label: 'Multiple (generate configs for all)' },
];

export const TEAM_MODES = [
  { value: 'solo', label: 'Solo developer' },
  { value: 'small', label: 'Small team (2-5 people)' },
  { value: 'large', label: 'Large team with PR-based workflow' },
];

export const CI_PROVIDERS = [
  { value: 'github', label: 'GitHub Actions' },
  { value: 'gitlab', label: 'GitLab CI' },
  { value: 'none', label: 'None (skip CI pipeline)' },
];

// Coding conventions per language. English is the default locale; Chinese
// (`zh`) is opt-in via the `--locale zh` CLI flag. Both sets carry the same
// intent. See `conventionsFor(language, locale)` below for resolution.
const CODING_CONVENTIONS_ZH = {
  typescript: {
    style: [
      '使用 TypeScript 严格模式 (strict: true)',
      '禁止使用 any 类型',
      '优先使用 interface 而非 type',
      '组件使用 PascalCase，工具函数使用 camelCase',
      '常量使用 UPPER_SNAKE_CASE',
      '每个 public 函数必须有 JSDoc 注释',
      '优先使用 const/let，禁止使用 var',
      '优先使用可选链 (?.) 和空值合并 (??)',
    ],
    importStyle: '使用绝对路径 import，不使用相对路径 (../)',
    testing: [
      '测试文件与源文件同目录，命名为 [模块名].test.ts',
      '优先写集成测试而非单元测试',
      '使用 describe/it 组织测试',
      'mock 外部 API 调用',
    ],
  },
  python: {
    style: [
      '遵循 PEP 8 规范（由 Ruff 自动格式化）',
      '使用 type hints 标注所有函数签名',
      '优先使用 dataclass 或 Pydantic model 而非裸 dict',
      '常量使用 UPPER_SNAKE_CASE',
      '私有函数/属性使用 _ 前缀',
      '每个 public 函数必须有 docstring (Google style)',
      '使用 f-string 而非 .format() 或 %',
      '优先使用 pathlib.Path 而非 os.path',
    ],
    importStyle: '使用绝对 import，遵循 isort 规范（由 Ruff 自动排序）',
    testing: [
      '测试文件命名为 test_*.py，位于 tests/ 目录',
      '使用 pytest fixtures 管理测试依赖',
      'mock 外部 API 调用 (pytest-mock)',
      '每个测试函数以 test_ 开头',
    ],
  },
  go: {
    style: [
      '遵循 Effective Go 和 Go Code Review Comments',
      '使用 gofmt 格式化（由 goimports 自动处理）',
      '错误优先使用 fmt.Errorf("...: %w", err) 包装',
      '接口命名以 -er 结尾（如 Reader, Writer）',
      '使用camelCase，不要用 snake_case',
      '每个导出的函数/类型必须有 doc comment',
      '包级别必须有 package comment',
      '优先使用组合而非继承',
    ],
    importStyle: '使用 goimports 管理导入分组（标准库 / 第三方 / 本地）',
    testing: [
      '测试文件与源文件同目录，命名为 *_test.go',
      '使用 table-driven tests',
      '使用 t.Helper() 在辅助函数中',
      '测试失败信息应包含实际值和期望值',
    ],
  },
  java: {
    style: [
      '遵循 Oracle Java Code Conventions',
      '使用 final 修饰不可变字段',
      '优先使用 Optional 而非 null',
      '类名使用 PascalCase，方法/变量使用 camelCase',
      '常量使用 UPPER_SNAKE_CASE',
      '每个 public 方法必须有 Javadoc',
      '优先使用 record (Java 16+) 替代 POJO',
      '优先使用 sealed class 处理受限类型层次',
    ],
    importStyle: 'IDE 管理导入排序，遵循 Google Java Style Guide',
    testing: [
      '测试类命名为 *Test.java，位于 src/test/java 对应包下',
      '使用 JUnit 5 + AssertJ',
      '使用 @BeforeEach / @AfterEach 管理测试状态',
      '使用 @MockBean (Spring) 或 Mockito mock 依赖',
    ],
  },
  rust: {
    style: [
      '遵循 Rust API Guidelines',
      '使用 rustfmt 格式化',
      '使用 clippy 检查常见错误',
      '优先使用 &str / &[T] 接收字符串/切片参数',
      '错误类型实现 std::error::Error',
      '使用 Result<T, E> 而非 panic!',
      '公共 API 使用 /// 文档注释',
      '优先使用迭代器和函数式风格',
    ],
    importStyle: '使用 rustfmt 管理导入（自动排序和分组）',
    testing: [
      '测试写在 #[cfg(test)] mod tests { ... } 中',
      '使用 #[test] 标注测试函数',
      '使用 assert!, assert_eq!, assert_ne! 做断言',
      '使用 #[should_panic] 测试 panic 路径',
    ],
  },
};

// English conventions — the default locale.
const CODING_CONVENTIONS_EN = {
  typescript: {
    style: [
      'Use TypeScript strict mode (strict: true)',
      'Never use the `any` type',
      'Prefer `interface` over `type`',
      'Components in PascalCase; utility functions in camelCase',
      'Constants in UPPER_SNAKE_CASE',
      'Every public function must have a JSDoc comment',
      'Prefer `const`/`let`; never use `var`',
      'Prefer optional chaining (`?.`) and nullish coalescing (`??`)',
    ],
    importStyle: 'Use absolute path imports, not relative paths (../)',
    testing: [
      'Test files live next to the source file, named `[module].test.ts`',
      'Prefer integration tests over unit tests',
      'Organize tests with `describe`/`it`',
      'Mock external API calls',
    ],
  },
  python: {
    style: [
      'Follow PEP 8 (auto-formatted by Ruff)',
      'Annotate all function signatures with type hints',
      'Prefer dataclasses or Pydantic models over bare dicts',
      'Constants in UPPER_SNAKE_CASE',
      'Prefix private functions/attributes with `_`',
      'Every public function must have a docstring (Google style)',
      'Use f-strings, not `.format()` or `%`',
      'Prefer `pathlib.Path` over `os.path`',
    ],
    importStyle: 'Use absolute imports; follow isort ordering (auto-sorted by Ruff)',
    testing: [
      'Name test files `test_*.py` under the `tests/` directory',
      'Use pytest fixtures to manage test dependencies',
      'Mock external API calls (pytest-mock)',
      'Every test function starts with `test_`',
    ],
  },
  go: {
    style: [
      'Follow Effective Go and the Go Code Review Comments',
      'Format with gofmt (handled by goimports)',
      'Wrap errors with `fmt.Errorf("...: %w", err)`',
      'Name interfaces with an `-er` suffix (e.g. `Reader`, `Writer`)',
      'Use camelCase, not snake_case',
      'Every exported function/type must have a doc comment',
      'Every package must have a package comment',
      'Prefer composition over inheritance',
    ],
    importStyle: 'Group imports with goimports (stdlib / third-party / local)',
    testing: [
      'Test files live next to the source file, named `*_test.go`',
      'Use table-driven tests',
      'Call `t.Helper()` in test helper functions',
      'Failure messages should include the actual and expected values',
    ],
  },
  java: {
    style: [
      'Follow the Oracle Java Code Conventions',
      'Mark immutable fields `final`',
      'Prefer `Optional` over `null`',
      'Classes in PascalCase; methods/variables in camelCase',
      'Constants in UPPER_SNAKE_CASE',
      'Every public method must have Javadoc',
      'Prefer `record` (Java 16+) over POJOs',
      'Prefer `sealed` classes for restricted type hierarchies',
    ],
    importStyle: 'Order imports via the IDE; follow the Google Java Style Guide',
    testing: [
      'Name test classes `*Test.java` under the matching package in `src/test/java`',
      'Use JUnit 5 + AssertJ',
      'Use `@BeforeEach` / `@AfterEach` to manage test state',
      'Mock dependencies with `@MockBean` (Spring) or Mockito',
    ],
  },
  rust: {
    style: [
      'Follow the Rust API Guidelines',
      'Format with rustfmt',
      'Use clippy to catch common mistakes',
      'Prefer `&str` / `&[T]` for string and slice parameters',
      'Error types should implement `std::error::Error`',
      'Return `Result<T, E>` rather than calling `panic!`',
      'Public APIs use `///` doc comments',
      'Prefer iterators and a functional style',
    ],
    importStyle: 'Imports managed by rustfmt (auto-sorted and grouped)',
    testing: [
      'Put tests inside `#[cfg(test)] mod tests { ... }`',
      'Annotate test functions with `#[test]`',
      'Assert with `assert!`, `assert_eq!`, `assert_ne!`',
      'Test panic paths with `#[should_panic]`',
    ],
  },
};

// Locale-keyed access. English is the default; `zh` reproduces the original
// Chinese output. Kept both sets so the snapshot tests (issue #1) can cover
// each locale, and so `--locale zh` stays a faithful opt-in.
export const CODING_CONVENTIONS = {
  en: CODING_CONVENTIONS_EN,
  zh: CODING_CONVENTIONS_ZH,
};

/** Resolve conventions for a (language, locale), falling back to English. */
export function conventionsFor(language, locale) {
  const set = CODING_CONVENTIONS[locale] || CODING_CONVENTIONS.en;
  return set[language] || CODING_CONVENTIONS.en[language];
}

// Framework-specific project structure overrides
export const FRAMEWORK_DIRS = {
  typescript: {
    express: ['src/', 'src/routes/', 'src/middleware/', 'src/lib/', 'tests/', 'docs/'],
    nextjs: ['src/app/', 'src/components/', 'src/lib/', 'src/types/', 'src/api/', 'tests/', 'docs/', 'public/'],
    nest: ['src/', 'src/modules/', 'src/common/', 'src/config/', 'tests/', 'docs/'],
    none: ['src/', 'src/lib/', 'tests/', 'docs/'],
  },
  python: {
    fastapi: ['src/', 'src/api/', 'src/models/', 'src/services/', 'src/core/', 'tests/', 'docs/'],
    django: ['src/', 'src/apps/', 'src/config/', 'src/templates/', 'tests/', 'docs/'],
    flask: ['src/', 'src/routes/', 'src/models/', 'src/services/', 'tests/', 'docs/'],
    none: ['src/', 'src/lib/', 'tests/', 'docs/'],
  },
  go: {
    standard: ['cmd/', 'internal/', 'pkg/', 'api/', 'tests/', 'docs/'],
    gin: ['cmd/', 'internal/', 'internal/handler/', 'internal/middleware/', 'internal/model/', 'pkg/', 'tests/', 'docs/'],
    fiber: ['cmd/', 'internal/', 'internal/handler/', 'internal/middleware/', 'internal/model/', 'pkg/', 'tests/', 'docs/'],
    none: ['cmd/', 'pkg/', 'tests/', 'docs/'],
  },
  java: {
    'spring-boot': ['src/main/java/', 'src/main/resources/', 'src/test/java/', 'src/test/resources/', 'docs/'],
    quarkus: ['src/main/java/', 'src/main/resources/', 'src/test/java/', 'src/test/resources/', 'docs/'],
    none: ['src/main/java/', 'src/test/java/', 'docs/'],
  },
  rust: {
    standard: ['src/', 'src/bin/', 'tests/', 'benches/', 'docs/'],
    actix: ['src/', 'src/routes/', 'src/models/', 'src/services/', 'tests/', 'docs/'],
    axum: ['src/', 'src/routes/', 'src/models/', 'src/services/', 'tests/', 'docs/'],
    none: ['src/', 'tests/', 'docs/'],
  },
};
