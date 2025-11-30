import type { AstNode } from "../types/AST.js";

/**
 * 定义外部组件加载器的签名。
 */
export type ComponentLoader = (path: string) => AstNode[];

/**
 * 定义外部数据加载器的签名。
 */
export type DataLoader = (path: string) => { [key: string]: any };

/**
 * ComponentResolver 类用于解析 AST 中的指令，执行组件内联（宏展开），
 * 支持 For 循环和 If/Else If/Else 条件渲染。
 */
export class ComponentResolver {
    private componentMap: Map<string, string> = new Map();
    private dataMap: Map<string, any> = new Map();

    private componentAstCache: Map<string, AstNode[]> = new Map();
    private dataCache: Map<string, any> = new Map();

    private componentLoader: ComponentLoader;
    private dataLoader: DataLoader;

    constructor(componentLoader: ComponentLoader, dataLoader: DataLoader) {
        this.componentLoader = componentLoader;
        this.dataLoader = dataLoader;
    }

    // --- 带有缓存的内部加载器方法 (保持不变) ---

    private loadComponentAst(path: string): AstNode[] {
        if (this.componentAstCache.has(path)) {
            return JSON.parse(JSON.stringify(this.componentAstCache.get(path)!));
        }
        console.log(`[Loader] 调用外部组件加载器 (并缓存): ${path}`);
        const ast = this.componentLoader(path);
        this.componentAstCache.set(path, JSON.parse(JSON.stringify(ast)));
        return ast;
    }

    private loadData(path: string): any {
        if (this.dataCache.has(path)) {
            return this.dataCache.get(path);
        }
        console.log(`[Loader] 调用外部数据加载器 (并缓存): ${path}`);
        const data = this.dataLoader(path);
        this.dataCache.set(path, data);
        return data;
    }

    // --- 核心遍历方法 (更新 if 逻辑) ---

    private traverseAndProcessDirectives(node: AstNode, dataContext?: any): void {
        const children = node.body || node.children;
        if (!Array.isArray(children)) return;

        for (let i = 0; i < children.length; i++) {
            const child: AstNode | undefined = children[i];
            if (!child) continue;

            if (child.type === "Directive") {
                this.processDirective(child);
            } else if (child.type === "Expression" && child.content?.startsWith("for ")) {
                const endForIndex = this.findEndForIndex(children, i);

                if (endForIndex !== -1) {
                    this.executeLoopExpansion(children, i, endForIndex, dataContext);
                    i--;
                    continue;
                }
            } else if (child.type === "Expression" && child.content?.startsWith("if ")) {
                // ⚠️ 查找整个条件块，包括 else-if 和 else
                const blockInfo = this.findEndIfBlock(children, i);

                if (blockInfo.endIfIndex !== -1) {
                    this.executeIfCondition(children, blockInfo, dataContext);
                    i--; // 索引回退
                    continue;
                } else {
                    console.error("[ERROR] 发现 'if' 但找不到匹配的 'end if'。");
                }
            }

            this.traverseAndProcessDirectives(child, dataContext);
        }
    }

    // --- If 逻辑辅助方法 (新增和更新) ---

    private findEndForIndex(nodes: AstNode[], startIndex: number): number {
        for (let i = startIndex + 1; i < nodes.length; i++) {
            const node = nodes[i];
            if (node?.type === "Expression" && node.content === "end for") {
                return i;
            }
        }
        return -1;
    }

    /**
     * 查找从 startIndex 开始到匹配的 'end if' 之间的所有条件表达式索引。
     */
    private findEndIfBlock(
        nodes: AstNode[],
        startIndex: number
    ): {
        endIfIndex: number;
        dividers: { type: string; index: number; condition?: string }[];
    } {
        const dividers: { type: string; index: number; condition?: string }[] = [];
        let nestedIfCount = 0;

        for (let i = startIndex; i < nodes.length; i++) {
            const node = nodes[i];
            if (node?.type !== "Expression") continue;

            const content = node.content?.trim() || "";

            if (content.startsWith("if ")) {
                if (i > startIndex) {
                    nestedIfCount++;
                } else {
                    // 顶级 if (startIndex)
                    dividers.push({ type: "if", index: i, condition: content.substring(3).trim() });
                }
            } else if (content.startsWith("else if ") && nestedIfCount === 0) {
                dividers.push({ type: "else-if", index: i, condition: content.substring(8).trim() });
            } else if (content === "else" && nestedIfCount === 0) {
                dividers.push({ type: "else", index: i });
            } else if (content === "end if") {
                if (nestedIfCount > 0) {
                    nestedIfCount--;
                } else {
                    return { endIfIndex: i, dividers };
                }
            }
        }
        return { endIfIndex: -1, dividers };
    }

    /**
     * 简单条件求值器：只检查属性路径在 dataContext 中是否为 Truthy。
     */
    private evaluateCondition(conditionStr: string, dataContext?: any): boolean {
        if (!dataContext || !conditionStr) return false;

        try {
            const parts = conditionStr.split(".");
            let currentData = dataContext;

            // 查找逻辑：处理嵌套路径，并跳过可能的父循环变量（例如 'item.'）
            let startPartIndex = 0;
            // 检查 dataContext 是否已经包含路径的第一部分，否则可能需要跳过它
            if (parts.length > 1 && dataContext[parts[0]!] === undefined) {
                startPartIndex = 1;
            }

            for (let i = startPartIndex; i < parts.length; i++) {
                currentData = currentData?.[parts[i]!];
                if (currentData === undefined) return false; // 路径中断
            }

            // 最终求值：任何非 null, 非 undefined, 非 0, 且不为 false 的值视为 true
            return !!currentData;
        } catch (e) {
            console.warn(`[WARN] 条件求值失败: ${conditionStr}. Error: ${e}`);
            return false;
        }
    }

    /**
     * 执行 If / Else-If / Else 逻辑。
     */
    private executeIfCondition(
        nodes: AstNode[],
        blockInfo: { endIfIndex: number; dividers: { type: string; index: number; condition?: string }[] },
        dataContext?: any
    ): void {
        const { endIfIndex, dividers } = blockInfo;

        // 1. 遍历条件链条，找到第一个为真的块
        let passingDividerIndex = -1;

        for (let k = 0; k < dividers.length; k++) {
            const divider = dividers[k];
            let conditionPasses = false;

            if (divider?.type === "else") {
                // else 块总是为真，除非前面的 if/else-if 已经通过
                if (passingDividerIndex === -1) {
                    conditionPasses = true;
                }
            } else {
                // 'if' 或 'else-if'
                // 仅检查属性是否存在且为 Truthy
                conditionPasses = this.evaluateCondition(divider?.condition!, dataContext);
            }

            if (conditionPasses && passingDividerIndex === -1) {
                passingDividerIndex = k;
                break; // 找到第一个通过的块，停止检查
            }
        }

        // 2. 确定要保留的节点的范围
        const startIndex = dividers[0]!.index; // 整个块的起始索引 ('if')
        const totalLength = endIfIndex - startIndex + 1;

        let keptNodes: AstNode[] = [];

        if (passingDividerIndex !== -1) {
            const keepStart = dividers[passingDividerIndex]!.index + 1;
            const nextDividerIndex =
                passingDividerIndex < dividers.length - 1 ? dividers[passingDividerIndex + 1]!.index : endIfIndex;
            const keepEnd = nextDividerIndex;

            // 获取要保留的节点数组（中间内容）
            keptNodes = nodes.slice(keepStart, keepEnd);

            const condition = dividers[passingDividerIndex]!.condition || "TRUE";
            console.log(
                `[If Pass] 条件链通过: ${dividers[passingDividerIndex]!.type} (${condition})。保留 ${
                    keptNodes.length
                } 个节点。`
            );
        } else {
            console.log(`[If Skip] 条件链全部为假。移除了整个条件块。`);
        }

        // 3. 执行替换：用保留的节点替换整个块
        nodes.splice(startIndex, totalLength, ...keptNodes);
    }

    // --- 原有 For 循环、组件和数据绑定逻辑 (保持不变) ---

    private processDirective(node: AstNode): void {
        // ... (保持不变)
        if (!node.args) return;
        if (node.name === "@useComponents") {
            for (const arg of node.args) {
                this.componentMap.set(arg.key, arg.value);
                console.log(`[Map] 组件映射: ${arg.key} -> ${arg.value}`);
            }
        } else if (node.name === "@useData") {
            for (const arg of node.args) {
                const loadedData = this.loadData(arg.value);
                const dataArray = loadedData?.[arg.key];

                if (dataArray && Array.isArray(dataArray)) {
                    this.dataMap.set(arg.key, dataArray);
                    console.log(`[Map] 数据映射: ${arg.key} -> (Array of ${dataArray.length})`);
                } else {
                    console.warn(`[WARN] 数据文件 ${arg.value} 中缺少键: ${arg.key} 或它不是数组。`);
                }
            }
        }
    }

    private executeLoopExpansion(nodes: AstNode[], startIndex: number, endIndex: number, dataContext?: any): void {
        // ... (保持不变)
        const startNode = nodes[startIndex];
        if (!startNode || !startNode.content) return;

        const match = startNode.content.match(/for\s+(\w+)\s+in\s+(\w+(\.\w+)*)/);
        if (!match) return;

        const loopVar = match[1]!;
        const dataVar = match[2]!;

        const componentNode = nodes[startIndex + 1];

        if (!componentNode || componentNode.type !== "Element") {
            console.error("[ERROR] 循环体中没有找到 Element 节点。");
            return;
        }

        let dataArray = this.dataMap.get(dataVar);

        if (!dataArray && dataContext) {
            let effectiveDataVar = dataVar;
            if (dataVar.includes(".") && dataContext[dataVar.split(".")[0]!] === undefined) {
                const firstDotIndex = dataVar.indexOf(".");
                effectiveDataVar = dataVar.substring(firstDotIndex + 1);
            }

            try {
                let currentData = dataContext;
                const parts = effectiveDataVar.split(".");

                for (const part of parts) {
                    currentData = currentData?.[part!];
                    if (currentData === undefined) break;
                }

                if (currentData !== undefined && Array.isArray(currentData)) {
                    dataArray = currentData;
                    console.log(`[Context Hit] 通过上下文解析出数组: ${dataVar}`);
                }
            } catch (e) {
                console.warn(`[WARN] 上下文解析失败: ${dataVar}`, e);
            }
        }

        if (!dataArray || !Array.isArray(dataArray)) {
            console.warn(`[WARN] 无法找到或数据不是数组: ${dataVar}`);
            return;
        }

        const newNodes: AstNode[] = [];
        let componentAstSource: AstNode[] | undefined;
        let itemPropName: string | null = null;
        let componentName: string | null = null;

        if (componentNode.tagName?.startsWith("#")) {
            componentName = componentNode.tagName.substring(1);
            const componentPath = this.componentMap.get(componentName);
            if (!componentPath) {
                console.warn(`[WARN] 找不到组件路径: ${componentName}`);
                return;
            }
            componentAstSource = this.loadComponentAst(componentPath);
            itemPropName = Object.keys(componentNode.properties || {})[0]!;
        } else {
            componentAstSource = [JSON.parse(JSON.stringify(componentNode))];
        }

        if (!componentAstSource) return;

        dataArray.forEach((dataItem: any) => {
            const componentInstance = JSON.parse(JSON.stringify(componentAstSource!));

            this.inlineDataBinding(componentInstance, dataItem, loopVar, itemPropName);

            for (const instanceNode of componentInstance) {
                // 递归处理嵌套指令、循环、IF
                this.traverseAndProcessDirectives(instanceNode, dataItem);
            }

            newNodes.push(...componentInstance);
        });

        nodes.splice(startIndex, endIndex - startIndex + 1, ...newNodes);
        console.log(`[Expansion] 成功展开 ${dataArray.length} 个 ${componentName || "Element"} 实例.`);
    }

    private inlineDataBinding(nodes: AstNode[], dataItem: any, loopVar: string, itemPropName: string | null): void {
        for (const node of nodes) {
            // --- 1. 属性替换逻辑 (处理 node.properties) ---
            if (node.properties) {
                for (const prop in node.properties) {
                    let value = node.properties[prop];

                    if (typeof value === "string") {
                        // 场景 A: itemPropName.property 绑定 (例如: Title="{{ item.Title }}")
                        if (itemPropName) {
                            const regex = new RegExp(`^\\{\\{\\s*${itemPropName}\\.(\\w+)\\s*\\}\\}$`);
                            const match = value.match(regex);

                            if (match) {
                                const propToReplace = match[1]!;
                                const actualData = dataItem[propToReplace];

                                if (actualData !== undefined) {
                                    node.properties[prop] = actualData;
                                    console.log(`[Bind SUCCESS] 替换 ${prop} (循环变量: ${loopVar}) 为: ${actualData}`);
                                } else {
                                    console.warn(`[Bind WARNING] 替换失败：数据项中缺少属性 ${propToReplace}`);
                                }
                                continue;
                            }
                        }

                        // 场景 B: 纯循环变量绑定 (例如: Tag="{{ desp }}"，当 itemPropName 为 null 时)
                        if (dataItem && !itemPropName) {
                            const simpleRegex = new RegExp(`^\\{\\{\\s*${loopVar}\\s*\\}\\}$`);
                            const simpleMatch = value.match(simpleRegex);

                            if (simpleMatch) {
                                const actualData = dataItem;
                                node.properties[prop] = actualData;
                                console.log(`[Bind SUCCESS] 替换 ${prop} (内层变量: ${loopVar}) 为: ${actualData}`);
                                continue;
                            }
                        }
                    }
                }
            }

            // --- 2. Element 节点的 content 替换逻辑 (处理 node.content) ---
            if (node.content && typeof node.content === "string" && dataItem) {
                const content = node.content.trim();
                const simpleContentRegex = new RegExp(`^\\{\\{\\s*${loopVar}\\s*\\}\\}$`);
                const pathContentRegex = new RegExp(`^\\{\\{\\s*(\\w+(\\.\\w+)*)\\s*\\}\\}$`);

                const simpleMatch = content.match(simpleContentRegex);
                const pathMatch = content.match(pathContentRegex);

                if (simpleMatch) {
                    // 场景 1: 纯变量绑定 (e.g., {{ desp }})
                    node.content = dataItem;
                    console.log(`[Bind SUCCESS] 替换内容 (内层变量: ${loopVar}) 为: ${dataItem}`);
                } else if (pathMatch && itemPropName) {
                    // 场景 2: 点号路径绑定 (e.g., {{ item.Title }})
                    const fullPath = pathMatch[1]!;
                    let targetPath = fullPath;

                    if (fullPath.startsWith(`${loopVar}.`)) {
                        targetPath = fullPath.substring(loopVar.length + 1);
                    } else if (fullPath.startsWith(`${itemPropName}.`)) {
                        targetPath = fullPath.substring(itemPropName.length + 1);
                    }

                    const propToReplace = targetPath.split(".")[0]!;
                    const actualData = dataItem[propToReplace];

                    if (actualData !== undefined) {
                        node.content = actualData;
                        console.log(`[Bind SUCCESS] 替换内容 (路径: ${fullPath}) 为: ${actualData}`);
                    } else {
                        console.warn(`[Bind WARNING] 内容替换失败：数据项中缺少属性 ${propToReplace}`);
                    }
                }
            }

            // --- 3. Text 子节点替换逻辑 (处理 children 中的 Text 节点) ---
            const childrenArray = node.body || node.children;

            if (childrenArray && Array.isArray(childrenArray)) {
                for (const childNode of childrenArray) {
                    // 仅针对 Text 节点且其内容在 'value' 字段中进行处理
                    if (childNode.type === "Text" && typeof childNode.value === "string" && dataItem) {
                        const textValue = childNode.value.trim();

                        // 检查是否是纯循环变量绑定: {{ desp }}
                        const simpleContentRegex = new RegExp(`^\\{\\{\\s*${loopVar}\\s*\\}\\}$`);
                        const simpleMatch = textValue.match(simpleContentRegex);

                        // 检查是否是点号路径绑定: {{ item.Title }}
                        const pathContentRegex = new RegExp(`^\\{\\{\\s*(\\w+(\\.\\w+)*)\\s*\\}\\}$`);
                        const pathMatch = textValue.match(pathContentRegex);

                        // --- 场景 1: 纯变量绑定 (例如 {{ desp }}) ---
                        if (simpleMatch) {
                            childNode.value = dataItem;
                            console.log(`[Bind SUCCESS] 替换 Text (纯变量: ${loopVar}) 为: ${dataItem}`);
                            continue;
                        }

                        // --- 场景 2: 点号路径绑定 (例如 {{ item.Title }}) ---
                        if (pathMatch && itemPropName) {
                            const fullPath = pathMatch[1]!;
                            let targetPath = fullPath;

                            if (fullPath.startsWith(`${loopVar}.`)) {
                                targetPath = fullPath.substring(loopVar.length + 1);
                            } else if (fullPath.startsWith(`${itemPropName}.`)) {
                                targetPath = fullPath.substring(itemPropName.length + 1);
                            }

                            const propToReplace = targetPath.split(".")[0]!;
                            const actualData = dataItem[propToReplace];

                            if (actualData !== undefined) {
                                childNode.value = actualData;
                                console.log(`[Bind SUCCESS] 替换 Text (路径: ${fullPath}) 为: ${actualData}`);
                            } else {
                                console.warn(`[Bind WARNING] Text 内容替换失败：数据项中缺少属性 ${propToReplace}`);
                            }
                            continue;
                        }
                    }
                }

                // --- 4. 递归调用 (处理子元素和更深层的 Text 节点) ---
                this.inlineDataBinding(childrenArray, dataItem, loopVar, itemPropName);
            }
        }
    }

    /**
     * 启动 AST 转换过程。
     */
    public resolve(ast: AstNode): AstNode {
        const resolvedAst = JSON.parse(JSON.stringify(ast));
        this.traverseAndProcessDirectives(resolvedAst, undefined);
        return resolvedAst;
    }
}
