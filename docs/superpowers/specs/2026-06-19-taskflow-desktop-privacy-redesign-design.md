# TaskFlow 桌面端隐私重塑设计文档

## 1. 产品概述

TaskFlow 将从「跨平台待办应用」重新定位为「本地优先、端到端加密的个人日程与敏感信息管理桌面应用」。

**产品名**：TaskFlow  
**一句话定位**：本地优先、端到端加密的个人日程与敏感信息管理桌面应用  
**目标平台**：桌面端优先（Windows / macOS / Linux），未来扩展到 Web 与移动端  
**目标用户**：
- 年轻职场人：注重效率与隐私，希望一个工具同时管理日程和密码/证件
- 商务人群：需要安全的任务/项目追踪，同时保护商业敏感信息

## 2. 价值主张与差异化

### 2.1 核心价值
- **一个工具管两件事**：日常任务 + 敏感信息，无需在待办应用和密码管理器之间切换
- **本地优先，不注册也能用**：数据默认只存在本地，没有账户、没有追踪
- **离开本机就是密文**：数据库文件全盘加密，被拷贝也无法读取
- **随时可隐藏**：隐私模式、隐藏空间、自动锁屏，应对共用电脑/突然被注视等场景

### 2.2 与竞品的差异
| 产品 | 定位 | 劣势 | TaskFlow 优势 |
|---|---|---|---|
| 微软 To Do / Todoist | 任务管理 | 无本地加密、隐私能力弱 | 全本地加密 + 保险库 |
| 1Password / Bitwarden | 密码管理 | 功能单一、界面偏工具化 | 与日程深度整合、界面更轻 |
| Notion / Obsidian | 笔记/知识管理 | 隐私依赖账号和云端 | 本地优先、无需账号 |

## 3. 1.0 功能范围

### 3.1 日程任务
- 任务列表：今日 / 未来 / 已完成 / 全部
- 快速添加任务：支持快捷键 Cmd/Ctrl + N
- 任务属性：标题、描述、截止日期、重复规则、优先级、分类、标签
- 日历视图：周视图 / 月视图
- 本地提醒：到期提醒、重复任务提醒
- 分类与标签：可设置为「隐藏」，进入需二次验证

### 3.2 加密保险库
- 密码条目：名称、账号、密码、网址、备注、密码生成器
- 证件/卡片：身份证、银行卡、护照等自定义字段
- 安全备注：密钥、密语等长文本敏感信息
- 条目级隐藏/伪装：特定条目默认不显示，需二次验证
- 剪贴板保护：复制密码后 N 秒自动清空

### 3.3 隐私外壳（贯穿全部模块）
- 启动锁：主密码 / PIN / 系统生物识别（Touch ID / Windows Hello）
- 本地全盘加密：SQLCipher AES-256 加密数据库
- 自动锁屏：闲置 N 分钟后锁定，需重新验证
- 隐私模式：一键切换到「普通待办」界面，隐藏保险库入口和敏感分类
- 隐藏空间：特定分类/保险库条目需要二次验证才显示
- 截图保护：敏感界面模糊或禁止截图（平台能力允许时）
- 主密钥零持久化：用户密码只存在于内存，不写入磁盘

### 3.4 明确 1.0 不做
以下模块写入路线图，不在 1.0 实现：
- 多端同步
- 笔记/日记模块
- 目标/习惯模块
- 团队协作/分享
- 插件系统

## 4. 技术架构

### 4.1 整体结构
```
┌─────────────────────────────────────────┐
│           Electron 桌面壳               │
│  ┌─────────────┐    ┌─────────────────┐ │
│  │  渲染进程    │◄──►│   主进程         │ │
│  │ React + TS  │ IPC│ 数据库 + 加密服务 │ │
│  └─────────────┘    └─────────────────┘ │
└─────────────────────────────────────────┘
              │
              ▼
      SQLite + SQLCipher
      （本地加密数据库文件）
```

### 4.2 技术选型
- **桌面框架**：Electron + Vite + React + TypeScript
- **状态管理**：Zustand（沿用现有仓库技术栈）
- **本地数据库**：SQLite + SQLCipher
- **主密钥派生**：PBKDF2-SHA256（1.0 使用 Node.js 原生支持，Argon2 作为后续升级项）
- **字段级加密**：Node.js crypto / Web Crypto API
- **跨进程通信**：Electron IPC
- **UI 组件库**：待设计专家团队输出后确定；推荐方向为 Tailwind CSS + Headless UI / Radix UI，以保持高度自定义和轻量化

### 4.3 安全模型
1. 应用启动时要求输入主密码
2. 主密码通过 PBKDF2-SHA256 派生主密钥（仅保存在内存）
3. 主密钥解开 SQLCipher 数据库密钥
4. 渲染进程不直接接触数据库文件，所有读写通过主进程 IPC
5. 自动锁屏或退出时清空内存中的主密钥
6. 数据库文件被拷贝后无法读取

### 4.4 多端同步预留
- 数据层抽象为 Repository 接口
- 1.0 仅实现 LocalRepository
- 2.0 新增 SyncRepository，同步数据使用端到端加密

## 5. 数据模型

### 5.1 核心实体
```typescript
// 任务
interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: Date;
  reminderAt?: Date;
  repeatRule?: RepeatRule;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'done' | 'archived';
  categoryId?: string;
  tagIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

// 分类
interface Category {
  id: string;
  name: string;
  color: string;
  isHidden: boolean;
  unlockCode?: string; // 隐藏分类的二次验证
  createdAt: Date;
}

// 标签
interface Tag {
  id: string;
  name: string;
  color: string;
}

// 保险库条目
interface VaultItem {
  id: string;
  type: 'password' | 'card' | 'secureNote';
  title: string;
  fields: VaultField[];
  isHidden: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface VaultField {
  id: string;
  name: string;
  value: string;
  isSensitive: boolean; // 是否默认掩码显示
}

// 用户安全设置
interface SecuritySettings {
  lockMethod: 'password' | 'pin' | 'biometric';
  autoLockMinutes: number;
  clipboardClearSeconds: number;
  screenshotProtection: boolean;
  privacyModeEnabled: boolean;
}
```

### 5.2 加密策略
- 数据库整体由 SQLCipher 加密
- VaultItem 中的 `value` 字段可额外做字段级 AES-256-GCM 加密
- 隐藏分类/条目的「是否隐藏」元数据以明文存储，但内容加密

## 6. UI/UX 设计方向

### 6.1 设计原则
- **极简**：侧边栏只放最高频入口，内容区留白充足
- **安全感**：锁定、加密、隐藏状态始终可见（小图标/颜色提示）
- **专业**：无 emoji，使用线性图标；字体清晰，间距规整
- **年轻**：支持深色模式、毛玻璃效果、流畅过渡动画
- **快捷**：全局快捷键（新建、搜索、锁定、隐私模式）

### 6.2 主要界面
- **锁定界面**：中央品牌 + 密码输入 + 生物识别提示
- **主布局**：左侧固定侧边栏 + 右侧内容区
- **任务视图**：列表 + 日历双模式，顶部快速添加
- **保险库视图**：分类筛选 + 卡片列表，复制/显示按钮
- **隐私模式**：一键隐藏保险库入口和敏感分类
- **设置页**：安全、外观、数据导入导出

### 6.3 全局快捷键
| 快捷键 | 功能 |
|---|---|
| Cmd/Ctrl + N | 新建任务 |
| Cmd/Ctrl + Shift + N | 新建保险库条目 |
| Cmd/Ctrl + F | 全局搜索 |
| Cmd/Ctrl + L | 立即锁定 |
| Esc | 切换隐私模式 |

## 7. 团队角色建议

为了让专家团队高效分工，建议 1.0 阶段配置以下角色：

| 角色 | 职责 | 产出 |
|---|---|---|
| 产品经理 | 需求确认、优先级排序、验收标准 | PRD、用户故事 |
| UI/UX 设计师 | 高保真界面、交互流程、设计系统 | Figma/设计稿、组件规范 |
| 前端工程师 | Electron 渲染层、React 组件、状态管理 | 可运行前端代码 |
| 安全工程师 | 加密方案、密钥管理、安全审计 | 加密服务实现、安全评审 |
| Electron/桌面工程师 | 主进程、IPC、系统集成（生物识别、截图保护） | 主进程与系统能力代码 |
| 测试工程师 | 功能测试、安全测试、跨平台测试 | 测试用例、测试报告 |

## 8. 路线图

### 8.1 1.0（当前阶段）
- 桌面端 MVP
- 日程任务 + 加密保险库
- 完整隐私外壳
- Windows / macOS / Linux 安装包

### 8.2 2.0
- 端到端加密同步
- Web 端和移动端适配
- 笔记/日记模块
- 目标/习惯模块

### 8.3 3.0
- 插件系统
- AI 智能建议（本地统计）
- 高级自动化（IFTTT 式规则）

## 9. 风险与注意事项

### 9.1 技术风险
- **SQLCipher 与 Electron 集成**：需要正确编译原生模块，跨平台构建可能复杂
- **生物识别集成**：Windows Hello / Touch ID 需要平台特定代码和测试
- **截图保护**：Electron 本身能力有限，可能需要操作系统级方案

### 9.2 安全风险
- 主密码丢失无法找回，需要明确提示用户
- 自动锁屏时间过短影响体验，过长影响安全，需可配置
- 剪贴板清空依赖系统能力，可能存在延迟

### 9.3 体验风险
- 过度加密可能影响启动速度
- 隐私模式切换需要自然不突兀

## 10. 成功标准

1. **功能**：1.0 必须实现任务管理、保险库、全部隐私功能
2. **安全**：数据库文件被拷走后无法读取；锁屏后内存中无密钥残留
3. **性能**：冷启动时间 < 3 秒；任务列表 1000 条无卡顿
4. **体验**：完成一次「添加任务 → 设置提醒」流程不超过 4 步
5. **质量**：TypeScript 0 错误，ESLint 0 错误，核心安全逻辑有单元测试

## 11. 附录：相关文件

- 现有仓库：[README.md](../../../README.md)
- 现有架构：[ARCHITECTURE.md](../../../ARCHITECTURE.md)
- 现有桌面模板：[desktop/package.json](../../../desktop/package.json)
- 视觉伴侣线框图：[.superpowers/brainstorm/](../../../.superpowers/brainstorm/)
