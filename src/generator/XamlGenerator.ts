import type { AstNode } from "../types/AST.js";

/**
 * XamlResolver 类：将 AST JSON 结构转换为 XAML 代码字符串。
 */
export class XamlGenerator {
    /**
     * 将 AST 属性对象转换为 XAML 属性字符串。
     * @param properties 节点的属性对象。
     * @returns XAML 属性字符串 (e.g., 'Width="100" Margin="10,0,0,0"')
     */
    private formatProperties(properties: { [key: string]: any }): string {
        if (!properties) return "";

        let xamlProps: string[] = [];
        for (const key in properties) {
            if (properties.hasOwnProperty(key)) {
                let value = properties[key];

                // 确保值是字符串，并进行转义或格式化
                if (typeof value === "object" && value !== null) {
                    // 忽略对象类型的复杂属性或进一步处理，这里只处理简单类型
                    value = JSON.stringify(value);
                } else if (typeof value !== "string") {
                    value = String(value);
                }

                // 简单的属性赋值
                xamlProps.push(`${key}="${value}"`);
            }
        }
        return xamlProps.length > 0 ? " " + xamlProps.join(" ") : "";
    }

    /**
     * 递归解析 AST 节点并生成 XAML 字符串。
     * @param node 当前 AST 节点。
     * @param indent 当前缩进级别。
     * @returns 节点的 XAML 字符串表示。
     */
    private generateNode(node: AstNode, indent: number): string {
        const space = "    ".repeat(indent);
        const children = node.body || node.children;

        switch (node.type) {
            case "Root":
                // 根节点，通常是整个 XAML 文件的容器
                let rootContent = children ? children.map((child) => this.generateNode(child, indent)).join("\n") : "";
                return rootContent;

            case "Element":
                const tagName = node.tagName || "Container"; // 默认标签名
                const properties = this.formatProperties(node.properties || {});

                if (children && children.length > 0) {
                    // 开放标签，有子内容
                    const childContent = children.map((child) => this.generateNode(child, indent + 1)).join("\n");

                    return `${space}<${tagName}${properties}>\n${childContent}\n${space}</${tagName}>`;
                } else if (node.content) {
                    // 开放标签，有文本内容（假设 XAML 标签内嵌文本）
                    const content = node.content.trim();
                    return `${space}<${tagName}${properties}>${content}</${tagName}>`;
                } else {
                    // 自闭合标签
                    return `${space}<${tagName}${properties} />`;
                }

            case "Text":
                // 文本节点，通常直接输出内容
                return `${space}${node.value || node.content || ""}`;

            case "Expression":
                // 表达式节点，在最终 AST 中，这通常是已被解析的字面量文本
                if (node.content && node.content.trim()) {
                    return `${space}${node.content.trim()}`;
                }
                return ""; // 忽略空的表达式节点

            case "Directive":
                // 在最终 AST 中，指令应该已经被 ComponentResolver 处理掉，这里应忽略
                return ``;

            case "Program":
                // 程序节点，忽略
                return ``;

            default:
                console.warn(`[WARN] 发现未处理的 AST 节点类型: ${node.type}`);
                return ``;
        }
    }

    /**
     * 启动 AST 到 XAML 的转换过程。
     * @param ast 经过 ComponentResolver 展开后的最终 AST 结构。
     * @returns 格式化的 XAML 字符串。
     */
    public generate(ast: AstNode): string {
        // 遍历 AST 根节点内的内容
        return this.generateNode(ast, 1).trim();
    }
}
