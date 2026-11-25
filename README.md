# 星枢研发舱 (Schema Cockpit)

多项目表结构资产管理、交互式 ER 关系拓扑与多语言代码生成平台。

## 核心能力

- **研发总览与全局字段检索**：跨项目汇总表结构与字段资产规模，支持任意表名、字段名与注释的全局模糊检索，实时追踪研发审计动态。
- **表结构工作台与代码生成器**：按项目/模块维护数据表与字段元数据（主键、可空性、默认值、索引类型、外键引用），支持一键动态生成 **MySQL 8 DDL**、**TypeScript + Zod Schema**、**Java 21 Spring Data JPA `@Entity`** 与 **MyBatis CRUD XML**。
- **交互式 ER 关系拓扑图**：基于 SVG 实现的可拖拽、可缩放实体关系拓扑画布，自动解析 `ref_table` 外键连线，支持节点高亮与自动排布。
- **需求与变更排期看板**：研发需求与受影响数据表联动管理，支持按项目、状态（待评审 / 开发中 / 联调中 / 已上线）筛选与内联状态流转。

## 技术栈与端口

| 模块 | 技术栈 | 默认端口 |
| --- | --- | --- |
| 后端服务 (`backend/`) | Node.js 20 + TypeScript (`tsx`) + Fastify 5 + Zod + `sql.js` | `8092` |
| 前端应用 (`frontend/`) | React 18 + TypeScript + Vite 6 + Ant Design 5 + Redux Toolkit | `9022` |

> 数据库使用纯 JS/WASM 实现的 `sql.js`，持久化至 `backend/data/schema-cockpit.sqlite`，无需本地编译 C++ 原生模块。

## 快速启动

### 1. 启动后端服务 (Port 8092)

```bash
cd backend
pnpm install
pnpm dev
```

### 2. 启动前端应用 (Port 9022)

```bash
cd frontend
pnpm install
pnpm dev
```

访问 `http://localhost:9022`，Vite 开发服务器会自动将 `/api` 请求代理至 `http://localhost:8092`。

## 作者信息

- **作者**：曹杰 / caojie (calmjade)
- **邮箱**：calmjade@foxmail.com
- **GitHub**：https://github.com/calmjade
- **Gitee**：https://gitee.com/jiejie12315
- **协议**：[MIT License](./LICENSE)
