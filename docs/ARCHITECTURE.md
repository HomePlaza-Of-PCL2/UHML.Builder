# UHML Builder 架构文档

## 1. 项目概述

UHML Builder 是一个用于将 UHMLX (Universal Homeplaza Markup Language Extended) 文件编译为 XAML (Extensible Application Markup Language) 的命令行工具。它提供了组件化开发、数据绑定、条件渲染和循环渲染等功能，帮助开发者更高效地构建 XAML 界面。

## 2. 技术栈

-   **开发语言**: TypeScript
-   **运行环境**: Node.js
-   **CLI 框架**: Commander
-   **构建工具**: TypeScript Compiler (tsc)
-   **包管理器**: pnpm

## 3. 架构分层

UHML Builder 采用了清晰的分层架构，将编译过程分解为多个独立的阶段，每个阶段由专门的模块负责。这种设计使得代码具有良好的可维护性和可扩展性。

### 3.1 核心架构图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           UHML Builder                                          │
├─────────────────┬─────────────────┬────────────────────────┬────────────────────┤
│   CLI Layer     │  Parser Layer   │  Resolver Layer        │  Generator Layer   │
├─────────────────┼─────────────────┼────────────────────────┼────────────────────┤
│   index.ts      │  Lexer.ts       │  ComponentResolver.ts  │  XamlResolver.ts   │
│                 │  Parser.ts      │  XamlResolver.ts       │                    │
│                 │  Concluser.ts   │                        │                    │
└─────────────────┴─────────────────┴────────────────────────┴────────────────────┘
        │               │                   │                     │
        ▼               ▼                   ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            类型定义层                                    │
├─────────────────┬───────────────────────────────────────────────────────┤
│   lexer.ts      │  ast.ts                                               │
└─────────────────┴───────────────────────────────────────────────────────┘
```

## 4. 模块详解

### 4.1 CLI 层 (index.ts)

CLI 层是 UHML Builder 的入口点，负责处理命令行参数并协调各个模块的执行。它实现了以下功能：

-   解析命令行参数（输入文件、输出目录）
-   调用 Parser 层解析 UHMLX 文件
-   调用 Resolver 层处理 AST 转换
-   调用 Generator 层生成 XAML 输出
-   输出编译结果和日志信息

### 4.2 Parser 层

Parser 层负责将 UHMLX 文本转换为抽象语法树 (AST)，并进行初步的分析。它包含以下核心模块：

#### 4.2.1 Lexer.ts

词法分析器，将 UHMLX 文本分解为标记流。它识别并生成以下类型的标记：

-   表达式 (`{{ ... }}`)
-   指令 (`@...`)
-   字符串 (`"..."`)
-   符号 (`{`, `}`, `(`, `)`, `=`, `,`)
-   标识符和数字

#### 4.2.2 Parser.ts

语法分析器，将标记流转换为结构化的 AST。它实现了以下核心功能：

-   解析指令块 (`@useComponents`, `@useData`, `@useStyle`, `@props`)
-   解析元素节点（标签、属性、子节点）
-   解析表达式和文本节点
-   生成符合 AST 类型定义的节点树

#### 4.2.3 Concluser.ts

分析器，从 AST 中提取静态资源样式信息。它实现了以下功能：

-   遍历 AST 查找带有 `StaticResource` 绑定的属性
-   检查对应的样式文件是否存在
-   收集需要导入的样式文件名

### 4.3 Resolver 层

Resolver 层负责处理 AST 的转换和宏展开，包括组件引用、数据绑定、条件渲染和循环渲染等。它包含以下核心模块：

#### 4.3.1 ComponentResolver.ts

组件解析器，处理 AST 中的指令和宏，实现以下功能：

-   处理 `@useComponents` 和 `@useData` 指令
-   实现 `for` 循环渲染
-   实现 `if / else if / else` 条件渲染
-   组件内联和数据绑定
-   AST 转换和宏展开

#### 4.3.2 XamlResolver.ts

XAML 解析器，将最终的 AST 转换为 XAML 字符串。它实现了以下功能：

-   将 AST 节点转换为对应的 XAML 标签
-   处理属性格式化和转义
-   生成缩进良好的 XAML 输出
-   处理不同类型的 AST 节点

### 4.4 类型定义层

类型定义层包含了整个项目使用的类型定义，确保类型安全和代码一致性。它包含以下核心模块：

#### 4.4.1 Lexer.ts

词法分析器的类型定义，包括标记类型 (`TokenType`) 和标记接口 (`Token`)。

#### 4.4.2 AST.ts

抽象语法树的类型定义，包括各种节点类型：

-   `ProgramNode`: 程序节点
-   `ElementNode`: 元素节点
-   `TextNode`: 文本节点
-   `ExpressionNode`: 表达式节点
-   `DirectiveNode`: 指令节点

## 5. 编译流程

UHML Builder 的编译流程分为以下几个主要阶段：

### 5.1 阶段 1: 解析 UHMLX 文件

1. 读取输入的 UHMLX 文件
2. 调用 Lexer 将文本转换为标记流
3. 调用 Parser 将标记流转换为初始 AST

### 5.2 阶段 2: AST 转换和宏展开

1. 实例化 ComponentResolver，注入文件系统加载器
2. 执行 AST 转换和宏展开：
    - 处理 `@useComponents` 和 `@useData` 指令
    - 展开 `for` 循环
    - 处理 `if / else if / else` 条件
    - 实现组件内联和数据绑定

### 5.3 阶段 3: 样式处理

1. 从 `@useStyle` 指令获取固定导入文件名
2. 从最终 AST 获取需要的样式文件名
3. 合并两个文件名列表，读取并解析样式文件
4. 替换 AST 中的 `#__Style__` 组件

### 5.4 阶段 4: AST 清理和优化

1. 深度清理 AST：
    - 扁平化 Program 节点
    - 移除所有 Directive 和 Expression 节点
2. 过滤 AST 中的残留指令和不需要的根节点

### 5.5 阶段 5: 生成 XAML 输出

1. 实例化 XamlResolver
2. 将最终 AST 转换为 XAML 字符串
3. 替换静态字符串资源
4. 输出最终 XAML 文件和 AST 抽象语法树文件

## 6. 核心数据结构

### 6.1 AST 节点结构

AST 是 UHML Builder 的核心数据结构，它代表了 UHMLX 文件的结构化表示。主要节点类型包括：

```typescript
// 程序节点
type ProgramNode = {
    type: "Program";
    body: Node[];
};

// 元素节点
type ElementNode = {
    type: "Element";
    tagName: string;
    properties: Record<string, any>;
    children: Node[];
};

// 文本节点
type TextNode = {
    type: "Text";
    value: string;
};

// 表达式节点
type ExpressionNode = {
    type: "Expression";
    content: string;
};

// 指令节点
type DirectiveNode = {
    type: "Directive";
    name: string;
    args: any[];
};
```

### 6.2 组件加载器接口

```typescript
export type ComponentLoader = (path: string) => AstNode[];
export type DataLoader = (path: string) => { [key: string]: any };
```

## 7. 编译示例

### 7.1 输入 UHMLX 文件

```uhmlx
@useComponents {
  Item "components/Item.uhmlx"
}

@useData {
  items "data/items.json"
}

Container {
  {{ for item in items }}
    Item(item="{{ item }}")
  {{ end for }}
}
```

### 7.2 输出 XAML 文件

```xaml
<Container>
    <Item Property1="Item 1" Property2="Value 1" />
    <Item Property1="Item 2" Property2="Value 2" />
    <Item Property1="Item 3" Property2="Value 3" />
</Container>
```

## 8. 扩展点

UHML Builder 设计了以下扩展点，方便未来功能扩展：

-   **自定义组件加载器**: 可以实现自定义的组件加载逻辑
-   **自定义数据加载器**: 可以实现自定义的数据加载逻辑
-   **新指令支持**: 可以扩展 Parser 支持新的指令类型
-   **新 AST 节点类型**: 可以扩展 AST 类型定义支持新的节点类型
-   **自定义 XAML 生成**: 可以扩展 XamlResolver 支持自定义的 XAML 生成逻辑

## 9. 性能优化

UHML Builder 实现了以下性能优化：

-   **组件 AST 缓存**: 避免重复解析相同的组件文件
-   **数据缓存**: 避免重复加载相同的数据文件
-   **深度克隆**: 使用 JSON 序列化/反序列化实现对象的深度克隆，避免引用问题
-   **高效遍历算法**: 实现了高效的 AST 遍历算法

## 10. 错误处理

UHML Builder 实现了完善的错误处理机制：

-   词法分析错误：提供精确的位置信息和错误描述
-   语法分析错误：提供预期的标记类型和实际遇到的标记
-   组件加载错误：提供详细的错误信息和堆栈跟踪
-   数据加载错误：提供详细的错误信息和堆栈跟踪
-   条件求值错误：提供警告信息并继续执行

## 11. 未来改进方向

-   支持更多的 XAML 特性
-   实现更强大的数据绑定功能
-   支持组件继承和组合
-   实现更高效的 AST 处理算法
-   提供更详细的编译错误和警告信息
-   支持热重载和实时预览
-   提供可视化的 AST 调试工具

## 12. 结论

UHML Builder 是一个设计良好、架构清晰的 UHMLX 到 XAML 编译工具。它采用了分层架构，各模块职责明确，具有良好的可维护性和可扩展性。通过组件化开发、数据绑定、条件渲染和循环渲染等功能，它可以帮助开发者更高效地构建 XAML 界面，提高开发效率和代码质量。
