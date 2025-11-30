// --- 1. AST 类型定义 ---

export type NodeType = "Program" | "Directive" | "Element" | "Text" | "Expression" | "ControlFlow";

/**
 * AST 节点接口定义
 */
export interface AstNode {
    type: string;
    name?: string;
    args?: Array<{ key: string; value: string }>;
    content?: string;
    tagName?: string;
    properties?: { [key: string]: any };
    body?: AstNode[];
    children?: AstNode[];
    [key: string]: any;
}

export interface Node {
    type: NodeType;
    start?: number; // 可选的位置信息
    end?: number;
}

export interface ProgramNode extends Node {
    type: "Program";
    body: Node[];
}

// 指令节点 (如 @props, @useComponents)
export interface DirectiveNode extends Node {
    type: "Directive";
    name: string;
    // @props: args = ["item", "Title"]
    // @useComponents: args = [{ key: "SingleCard", value: "path" }]
    args: any[];
}

// 元素节点 (如 StackPanel, Border.Background)
export interface ElementNode extends Node {
    type: "Element";
    tagName: string;
    properties: Record<string, string | number | boolean>;
    children: Node[];
}

export interface TextNode extends Node {
    type: "Text";
    value: string;
}

export interface ExpressionNode extends Node {
    type: "Expression";
    content: string; // 去除了 {{ }} 的内容
}
