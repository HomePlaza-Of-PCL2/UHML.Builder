import * as fs from "fs";
import * as path from "path";
import type { Node, ElementNode, ProgramNode, DirectiveNode } from "../types/AST.js";

const STYLES_PREFIX = "styles/"; // 定义需要移除的前缀

/**
 * 遍历 AST，查找所有属性中带有 StaticResource 绑定的值，
 * 并筛选出在 {cwd}/styles/ 下存在对应文件的资源。
 *
 * 新增功能：处理 @useStyle 指令转换后的 AST。
 */
export function findStaticResourceStyles(node: Node, results: Set<string>, stylesDir: string): void {
    // --------------------------------------------------------------------
    // 1. 核心逻辑：检查当前 Element 节点的所有属性 (StaticResource 属性)
    // --------------------------------------------------------------------
    if (node.type === "Element") {
        const elementNode = node as ElementNode;
        const tagName = elementNode.tagName?.replace(/:/g, "-") || "UnknownElement";
        const properties = elementNode.properties;

        if (properties) {
            for (const prop in properties) {
                const propValue = properties[prop];

                // 检查属性值是否为字符串且包含 "StaticResource"
                if (typeof propValue === "string" && propValue.includes("StaticResource")) {
                    const srMatch = propValue.match(/StaticResource\s+([a-zA-Z0-9_.-]+)/);

                    if (srMatch && srMatch[1]) {
                        const resourceKey = srMatch[1]; // 资源键名

                        // 构造预期的文件路径：{stylesDir}/{TagName}.{ResourceKey}.uhmls
                        const expectedFilePath = path.join(stylesDir, `${tagName}.${resourceKey}.uhmls`);

                        if (fs.existsSync(expectedFilePath)) {
                            results.add(`${tagName}.${resourceKey}`);
                        } else {
                        }
                    }
                }
            }
        }
    }

    // --------------------------------------------------------------------
    // 2. 新功能：检查静态样式引用 (@useStyle 指令)
    // --------------------------------------------------------------------
    if (node.type === "Directive" && (node as DirectiveNode).name === "@useStyle") {
        const directiveNode = node as DirectiveNode;
        const args = directiveNode.args;

        if (Array.isArray(args)) {
            for (const arg of args) {
                const stylePathValue = arg.value;

                if (typeof stylePathValue === "string" && stylePathValue.startsWith(STYLES_PREFIX)) {
                    // 移除 styles/ 前缀，并移除 .uhmls 后缀，得到资源键名 (ResourceKey)
                    // 例如 "styles/FlowDocument.uhmls" -> "FlowDocument"
                    const resourceKey = stylePathValue.substring(STYLES_PREFIX.length).replace(/\.uhmls$/, "");

                    // 构造预期文件路径：{stylesDir}/{ResourceKey}.uhmls
                    const expectedFilePath = path.join(stylesDir, `${resourceKey}.uhmls`);

                    if (fs.existsSync(expectedFilePath)) {
                        // 🎯 将静态引用结果添加到列表中。这里直接添加 ResourceKey，
                        // 假设 Step 5 需要它作为文件名的一部分。
                        results.add(resourceKey);
                    }
                }
            }
        }
    }

    // --------------------------------------------------------------------
    // 3. 递归遍历逻辑：遍历所有子孙节点
    // --------------------------------------------------------------------

    const elementChildren = (node as ElementNode).children;
    const programBody = (node as ProgramNode).body;

    const childrenToTraverse = elementChildren || programBody;

    if (Array.isArray(childrenToTraverse)) {
        for (const child of childrenToTraverse) {
            if (child) {
                // 递归调用继续遍历所有子孙节点
                findStaticResourceStyles(child, results, stylesDir);
            }
        }
    }
}
