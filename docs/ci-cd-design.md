# CI/CD Design: GitHub Actions 自动化编译、测试与发布

> **日期**: 2026-06-27
> **状态**: 待实施
> **范围**: `.github/workflows/ci.yml` + `package.json` engines + `package-lock.json`

## 目标

为 spec-superflow 建立 GitHub Actions CI/CD 管线，实现：

1. **CI**: 每次 push/PR 自动编译 TypeScript + 跑集成测试
2. **CD**: 打 git tag（`v*`）时自动创建 GitHub Release + 发布到 npm

## 设计决策

### 单 workflow 文件

一个 `.github/workflows/ci.yml` 包含两个 Job，不用拆成两个文件。理由：

- 项目零依赖，CI/CD 逻辑简单（build + test + publish）
- 共享相同的 build 步骤，拆文件反而增加维护成本
- 一个文件能一眼看完全貌

### CD Job 自包含（不用 artifact 传递）

release job 重新跑 build+test，不从 build-and-test job 下载产物。理由：

- GitHub Actions 不同 Job 运行在不同 runner 上，artifact upload/download 需要额外配置
- 项目编译+测试总耗时 ~30 秒，重复跑的成本可忽略
- 保证 release 产物和测试通过的代码完全一致（同一次 runner 上产出）

### Node 22+ 单版本

CI 只测 Node 22（latest），不设置版本矩阵。理由：

- `--experimental-strip-types` 需要 Node 22.6+
- 零外部依赖，不存在跨版本兼容问题
- 在 `package.json` 的 `engines` 字段声明 `>=22`

## 工作流结构

```
ci.yml
├── Job: build-and-test
│   ├── 触发: push(main) / pull_request(main)
│   ├── strategy: matrix node-version [22]
│   ├── steps:
│   │   ├── actions/checkout@v4
│   │   ├── actions/setup-node@v4 (node-version, cache: npm)
│   │   ├── npm ci
│   │   ├── npm run build
│   │   └── npm test
│
└── Job: release
    ├── 触发: push refs/tags/v*
    ├── needs: (无，自包含)
    ├── permissions: contents: write, id-token: write
    ├── steps:
    │   ├── actions/checkout@v4
    │   ├── actions/setup-node@v4 (node-version: 22, registry-url: https://registry.npmjs.org)
    │   ├── npm ci
    │   ├── npm run build
    │   ├── npm test
    │   ├── gh release create (tag, 自动生成笔记, 不附额外文件)
    │   └── npm publish --provenance --access public
```

## 文件变更清单

| 文件 | 动作 | 说明 |
|------|------|------|
| `.github/workflows/ci.yml` | 新建 | CI/CD 工作流定义 |
| `package.json` | 修改 | 添加 `engines: { "node": ">=22" }` |
| `package-lock.json` | 新建 | `npm install` 生成，`npm ci` 依赖此文件 |

## 前置条件

### NPM_TOKEN Secret

用户需要在 GitHub repo → Settings → Secrets and variables → Actions 中创建 `NPM_TOKEN`：

1. 登录 npmjs.com → Access Tokens → Generate New Token（Publish 类型）
2. 复制 token 值
3. 在 GitHub repo settings 添加为 Actions secret，名称 `NPM_TOKEN`

工作流引用方式：`${{ secrets.NPM_TOKEN }}`，通过 `setup-node` 的 `registry-url` 自动配置。

### git tag 发布流程

```bash
# 确保 package.json version 已更新
git tag v0.2.0
git push origin v0.2.0
# → 自动触发 release job
```

## 边界与约束

- **不自动管理版本号**：用户手动更新 `package.json` version + 打 tag，不引入 changesets 等工具
- **不附 dist/ 到 Release**：GitHub 自动生成的 source tarball + npm 包已经足够，dist/ 由 npm 分发
- **不做 lint**：当前项目无 ESLint 配置，不在本次范围
- **不做多平台测试**：纯 TypeScript 逻辑，无平台相关代码
