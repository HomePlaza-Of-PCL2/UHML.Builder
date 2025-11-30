import * as fs from "fs";
import * as path from "path";
import { ComponentResolver, type ComponentLoader, type DataLoader } from "./resolver/ComponentResolver.js";
import { UhmlxParser } from "./prelyzer/Parser.js";
import { findStaticResourceStyles } from "./prelyzer/Concluser.js";
import type { AstNode, ElementNode } from "./types/AST.js";
import { XamlGenerator } from "./generator/XamlGenerator.js";
import { Command } from "commander";

// --- 文件路径定义 ---
const ENCODING = "utf-8";

// --- 核心加载器实现 (保持不变) ---
function uhmlxToAst(filePath: string): AstNode {
    console.log(`\n[Step 1] 正在读取并解析主文件: ${filePath}`);
    const content = fs.readFileSync(filePath, ENCODING);
    const initialAst = new UhmlxParser(content).parse();
    console.log(`[Step 1] 主文件 ${filePath} AST 解析完成。`);
    return initialAst;
}

const externalComponentLoader: ComponentLoader = (astPath: string): AstNode[] => {
    const fullPath = path.resolve(process.cwd(), astPath);
    console.log(`[Loader: Component] 正在读取组件文件: ${fullPath}`);
    const content = fs.readFileSync(fullPath, ENCODING);
    const compAst = new UhmlxParser(content).parse();
    return Array.isArray(compAst) ? compAst : [compAst];
};

const externalDataLoader: DataLoader = (dataPath: string): { [key: string]: any } => {
    const fullPath = path.resolve(process.cwd(), dataPath);
    console.log(`[Loader: Data] 正在读取数据文件: ${fullPath}`);
    try {
        const content = fs.readFileSync(fullPath, ENCODING);
        const fileNameKey = dataPath.trim().split("/").pop()?.replace(".json", "")!;
        const parsedData = JSON.parse(content);

        if (Array.isArray(parsedData)) {
            return { [fileNameKey]: parsedData };
        }
        return parsedData;
    } catch (e) {
        console.error(`[Loader: Data ERROR] 无法读取或解析数据文件 ${fullPath}.`, e);
        throw new Error(`Failed to load data from ${dataPath}`);
    }
};

// --- 样式 AST 替换函数 (保留，因为这是目前最简单实现注入的方式) ---

function replaceStyleNode(node: AstNode, styleNodesMap: Map<string, ElementNode[]>): void {
    const childrenKey = node.body ? "body" : "children";
    const children = node[childrenKey];

    if (!Array.isArray(children)) return;

    for (let i = 0; i < children.length; i++) {
        const child = children[i];

        if (child && child.type === "Element" && child.tagName === "#__Style__") {
            const replacement = styleNodesMap.get("#__Style__");

            if (replacement) {
                children.splice(i, 1, ...replacement);
                i += replacement.length - 1;
                console.log(`[Step 6] 成功将 #${child.tagName} 替换为 ${replacement.length} 个样式节点。`);
            } else {
                console.warn(`[Step 6] 警告: 找到 #${child.tagName} 节点，但没有找到样式 AST 进行替换。`);
            }
        } else {
            if (child) replaceStyleNode(child, styleNodesMap);
        }
    }
}

// --- 节点过滤函数 ---
function filterAstNodes(nodes: AstNode[]): AstNode[] {
    return nodes.filter((node) => node.type !== "Directive");
}

// --- 递归清理函数 ---

function deepCleanupAst(node: AstNode): void {
    const childrenKey = node.body ? "body" : "children";
    let children = node[childrenKey];

    if (!Array.isArray(children)) return;

    // 1. 深度遍历子节点进行清理
    for (const child of children) {
        if (child.type === "Element") {
            deepCleanupAst(child);
        }
    }

    // 2. 扁平化当前层级的 Program 节点
    children = children.flatMap((child) => {
        if (child.type === "Program" && Array.isArray(child.body)) {
            // 递归清理 Program 节点的 body，防止嵌套 Program
            for (const bodyChild of child.body) {
                deepCleanupAst(bodyChild);
            }
            return child.body; // 替换 Program 节点为其 body 内容
        }
        return child;
    });

    // 3. 过滤当前层级的 Directive 节点 (确保所有指令都被移除)
    children = children.filter((child) => child.type !== "Directive" && child.type !== "Expression");

    // 将清理后的数组赋回给节点
    node[childrenKey] = children;
}

// --- 入口点主函数 ---

function main(inputFile: string = "Custom.uhmlx", outputDir: string = "output") {
    console.log(`--- ComponentResolver 编译流程启动 ---`);
    console.log(`CWD: ${process.cwd()}`);

    try {
        // 1. 读取并解析主文件到初始 AST
        const initialAst = uhmlxToAst(inputFile);

        // 2. 实例化 ComponentResolver
        console.log(`\n[Step 2] 实例化 Resolver，注入文件系统加载器...`);
        const resolver = new ComponentResolver(externalComponentLoader, externalDataLoader);

        // 3. 执行 AST 转换和宏展开 (此时 `#Style__` 仍存在，但其他循环/组件已展开)
        console.log(`[Step 3] 执行 AST 转换和宏展开...`);
        const finalAst = resolver.resolve(initialAst);
        console.log(`[Step 3] AST 转换完成。`);

        // 4. 从最终 AST 获取需要的样式文件名
        console.log(`[Step 4] 从最终 AST 获取需要的样式组件文件名...`);
        const styleFileNames: Set<string> = new Set();
        findStaticResourceStyles(finalAst as any, styleFileNames, path.resolve(process.cwd(), "styles"));
        console.log(`[Step 4] 找到的样式组件文件名: ${Array.from(styleFileNames).join(", ")}`);

        // 5. 从所有样式文件名中获取其对应 AST 节点
        console.log(`[Step 5] 从样式文件中获取其对应 AST 节点...`);
        const styleNodes: ElementNode[] = [];
        styleFileNames.forEach((name) => {
            const stylePath = path.resolve(process.cwd(), "styles", name + ".uhmls");
            const content = fs.readFileSync(stylePath, ENCODING);
            const parsedStyleAst = new UhmlxParser(content).parse();
            styleNodes.push(parsedStyleAst.body[0] as ElementNode);
        });
        const styleNodesMap = new Map<string, ElementNode[]>([["#__Style__", styleNodes]]);
        console.log(`[Step 5] 样式 AST 节点获取完成，共 ${styleNodes.length} 个。`);

        // 6. 替换 AST 中的 #__Style__ 组件
        console.log(`\n[Step 6] 替换 finalAst 中的 #__Style__ 组件...`);
        replaceStyleNode(finalAst, styleNodesMap);
        console.log(`[Step 6] 样式替换完成。`);

        // 7. 深度清理 AST：扁平化 Program 节点，并移除所有 Directive/Expression
        console.log(`\n[Step 7] 深度清理 AST (Program 扁平化/指令过滤)...`);
        deepCleanupAst(finalAst); // 递归清理整个 AST 树
        console.log(`[Step 7] 深度清理完成。`);

        // 8. 过滤 AST 中的残留指令和不需要的根节点
        console.log(`\n[Step 8] 过滤残留指令并准备 XAML 转换...`);
        const resolvedNodes = finalAst.body || finalAst.children || [];
        const filteredNodes = filterAstNodes(resolvedNodes);

        if (filteredNodes.length === 0) {
            throw new Error("Resolved AST body is empty or contains only directives.");
        }

        // 9. 实例化 XamlResolver 并将最终 AST 转换为 XAML
        console.log(`[Step 9] 将最终 AST 转换为 XAML 代码...`);
        const xamlResolver = new XamlGenerator();

        // 传入一个只包含有效节点的根 AST 对象，让 XamlResolver 正确构造 XAML
        // (避免 XamlResolver 在外部调用时出现 <Root>...</Root> 标签)
        const rootNode: AstNode = { type: "Root", children: filteredNodes };
        // 传入静态字符串替换 #__StaticString__ 组件
        const statisString = fs.readFileSync(path.resolve(process.cwd(), "data", "StaticStrings.xaml"), ENCODING);
        // 一步到位
        const xamlOutput = xamlResolver.generate(rootNode).replace("<#__StaticString />", statisString);

        console.log(`[Step 9] XAML 转换完成。`);

        // 9. 输出最终 XAML 文件和最终 AST 抽象语法树文件
        fs.mkdirSync(path.resolve(process.cwd(), outputDir + "/"), { recursive: true }); // 确保输出目录存在
        const xamlOutputPath = path.resolve(process.cwd(), outputDir, path.basename(inputFile, ".uhmlx") + ".xaml");
        fs.writeFileSync(xamlOutputPath, xamlOutput, ENCODING);
        const astOutputPath = path.resolve(process.cwd(), outputDir, path.basename(inputFile, ".uhmlx") + ".AST.json");
        fs.writeFileSync(astOutputPath, JSON.stringify(finalAst, null, 4), ENCODING);
        const xamlInitPath = path.resolve(process.cwd(), outputDir, path.basename(inputFile, ".uhmlx") + ".xaml.ini");
        fs.writeFileSync(xamlInitPath, Math.random().toString(36).substring(2), ENCODING);
        console.log(`\n[SUCCESS] 编译、展开和 XAML 生成完成。`);
        console.log(`最终 XAML 已输出到: ${xamlOutputPath}`);
        console.log(`最终 AST 抽象语法树已输出到: ${astOutputPath}`);
    } catch (error) {
        console.error(`\n[Fatal Error] 编译处理失败:`, error);
    }
}

// --- CLI 应用程序配置 ---

const program = new Command();

program
    .name("uhmlbuilder")
    .description("UHML Builder - 编译 UHMLX 文件为 XAML")
    .version("1.0.0")
    .argument("[input]", "输入 UHMLX 文件路径", "Custom.uhmlx")
    .argument("[output]", "输出文件夹路径", "output")
    .action((input, output) => {
        main(input, output);
    });

// 解析命令行参数并执行
program.parse(process.argv);
