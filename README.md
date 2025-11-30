# UHML Builder

UHML Builder 是一个用于将 UHMLX (Universal Homeplaza Markup Language Extended) 文件编译为 XAML (Extensible Application Markup Language) 的命令行工具。它提供了组件化开发、数据绑定、条件渲染和循环渲染等功能，帮助开发者更高效地构建 XAML 界面。

## 技术栈

-   **开发语言**: TypeScript
-   **运行环境**: Node.js
-   **CLI 框架**: Commander
-   **构建工具**: TypeScript Compiler (tsc)
-   **包管理器**: pnpm

## 安装

### 前提条件

- Node.js 18+ 
- pnpm 10+（推荐）

### 安装步骤

1. 克隆或下载项目到本地

2. 安装依赖

```bash
pnpm install
```

3. 构建项目

```bash
pnpm run build
```

4. （可选）全局安装 UHML Builder

```bash
pnpm link --global
```

## 使用方法

### 基本用法

```bash
uhmlbuilder [input] [output]
```

### 参数说明

- `input`: 输入 UHMLX 文件路径，默认值为 `Custom.uhmlx`
- `output`: 输出文件夹路径，默认值为 `output`

### 示例

```bash
# 使用默认输入文件和输出目录
uhmlbuilder

# 指定输入文件
uhmlbuilder src/MyComponent.uhmlx

# 指定输入文件和输出目录
uhmlbuilder src/MyComponent.uhmlx dist
```

## UHMLX 语法

### 1. 组件引用

```uhmlx
@useComponents {
  ComponentName "path/to/component.uhmlx"
}
```

### 2. 数据引用

```uhmlx
@useData {
  dataName "path/to/data.json"
}
```

### 3. 组件使用

```uhmlx
ComponentName(Property1="Value1", Property2="Value2")
```

### 4. 循环渲染

```uhmlx
{{ for item in dataName }}
  ComponentName(Item="item")
{{ end for }}
```

### 5. 条件渲染

```uhmlx
{{ if condition }}
  Element(Property="Value")
{{ else if anotherCondition }}
  AnotherElement(Property="Value")
{{ else }}
  DefaultElement(Property="Value")
{{ end if }}
```

### 6. 数据绑定

```uhmlx
Element(Property="{{ item.Property }}")
```

### 7. 样式引用

```uhmlx
@useStyle {
  _ "styles/StyleName.uhmls"
}
```

## 项目结构

```
├── src/                            # 源代码目录
│   ├── prelyzer/                   # 解析器相关代码
│   │   ├── Concluser.ts            # 静态资源分析器
│   │   ├── Lexer.ts                # 词法分析器
│   │   └── Parser.ts               # 语法分析器
│   ├── resolver/                   # 解析器相关代码
│   │   ├── ComponentResolver.ts    # 组件解析器
│   │   └── XamlResolver.ts         # XAML 生成器
│   ├── types/                      # 类型定义
│   │   ├── AST.ts                  # AST 节点类型定义
│   │   └── Lexer.ts                # 词法分析器类型定义
│   └── index.ts                    # 项目入口文件
├── docs/                           # 文档
│   └── ARCHITECTURE.md             # 架构文档
├── package.json                    # 项目配置文件
├── tsconfig.json                   # TypeScript 配置文件
└── README.md                       # 项目说明文档
```

## 编译流程

1. **解析 UHMLX 文件**:
   - 读取输入的 UHMLX 文件
   - 调用 Lexer 将文本转换为标记流
   - 调用 Parser 将标记流转换为初始 AST

2. **AST 转换和宏展开**:
   - 实例化 ComponentResolver，注入文件系统加载器
   - 处理 `@useComponents` 和 `@useData` 指令
   - 展开 `for` 循环
   - 处理 `if/else if/else` 条件
   - 实现组件内联和数据绑定

3. **样式处理**:
   - 从 `@useStyle` 指令获取固定导入文件名
   - 从最终 AST 获取需要的样式文件名
   - 合并两个文件名列表，读取并解析样式文件
   - 替换 AST 中的 `#__Style__` 组件

4. **AST 清理和优化**:
   - 深度清理 AST：扁平化 Program 节点，移除所有 Directive 和 Expression 节点
   - 过滤 AST 中的残留指令和不需要的根节点

5. **生成 XAML 输出**:
   - 实例化 XamlResolver
   - 将最终 AST 转换为 XAML 字符串
   - 替换静态字符串资源
   - 输出最终 XAML 文件和 AST 抽象语法树文件

## 示例

### 输入 UHMLX 文件 (`Custom.uhmlx`)

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

### 组件文件 (`components/Item.uhmlx`)

```uhmlx
@props item

ItemElement {
  Property1="{{ item.Name }}"
  Property2="{{ item.Value }}"
}
```

### 数据文件 (`data/items.json`)

```json
{
  "items": [
    { "Name": "Item 1", "Value": "Value 1" },
    { "Name": "Item 2", "Value": "Value 2" },
    { "Name": "Item 3", "Value": "Value 3" }
  ]
}
```

### 输出 XAML 文件 (`output/Custom.xaml`)

```xaml
<Container>
    <ItemElement Property1="Item 1" Property2="Value 1" />
    <ItemElement Property1="Item 2" Property2="Value 2" />
    <ItemElement Property1="Item 3" Property2="Value 3" />
</Container>
```

## 开发

### 启动开发模式

```bash
pnpm run dev
```

### 运行测试

```bash
pnpm test
```

### 代码风格检查

```bash
pnpm run lint
```

## 贡献

欢迎提交 Issue 和 Pull Request！

### 贡献指南

1. Fork 项目
2. 创建特性分支
3. 提交更改
4. 推送到特性分支
5. 打开 Pull Request

## 许可证

本项目采用 ISC 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 联系方式

如有问题或建议，请通过以下方式联系：

- 项目地址: [https://github.com/yourusername/uhmlbuilder](https://github.com/yourusername/uhmlbuilder)
- 提交 Issue: [https://github.com/yourusername/uhmlbuilder/issues](https://github.com/yourusername/uhmlbuilder/issues)

## 致谢

感谢所有为 UHML Builder 做出贡献的开发者！

## 相关链接

- [TypeScript 官方文档](https://www.typescriptlang.org/)
- [Node.js 官方文档](https://nodejs.org/)
- [Commander.js 官方文档](https://github.com/tj/commander.js/)
- [XAML 官方文档](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/xaml/)
