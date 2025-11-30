// --- 3. 语法分析器 (Parser) ---

import type { ProgramNode, Node, TextNode, DirectiveNode, ElementNode, ExpressionNode } from "../types/AST.js";
import { type Token, TokenType } from "../types/Lexer.js";
import { Lexer } from "./Lexer.js";

export class UhmlxParser {
    private tokens: Token[];
    private current = 0;

    constructor(input: string) {
        const lexer = new Lexer(input);
        this.tokens = lexer.tokenize();
    }

    parse(): ProgramNode {
        const body: Node[] = [];
        while (!this.isAtEnd()) {
            body.push(this.parseStatement());
        }
        return { type: "Program", body };
    }

    private parseStatement(): Node {
        const token = this.peek();

        if (token.type === TokenType.Directive) {
            return this.parseDirective();
        }

        if (token.type === TokenType.Expression) {
            return this.parseExpression();
        }

        if (token.type === TokenType.Identifier) {
            return this.parseElement();
        }

        if (token.type === TokenType.String) {
            return this.parseText();
        }

        // 允许纯文本节点，虽然在 uhmlx 的块中不常见，但可以作为 children
        if (token.type === TokenType.Number) {
            this.advance();
            return { type: "Text", value: token.value } as TextNode;
        }

        throw new Error(
            `Unexpected token at top level: ${token.value} (Type: ${TokenType[token.type]}) at ${token.pos}`
        );
    }

    // --- 核心方法：解析指令 ---
    private parseDirective(): DirectiveNode {
        const name = this.advance().value;
        const args: any[] = [];

        if (this.check(TokenType.Symbol, "{")) {
            this.advance(); // 吃掉 '{'

            if (["@useComponents", "@useData", "@useStyle"].includes(name)) {
                // 规则: Key "Path" Key "Path"
                while (this.check(TokenType.Identifier) && !this.isAtEnd()) {
                    const key = this.advance().value;
                    const val = this.consume(
                        TokenType.String,
                        `Expect string value (e.g., "path/to/file") after key in ${name} block`
                    ).value;

                    args.push({ key, value: val });
                }
            } else if (name === "@props") {
                // 规则: item anotherProp thirdProp (简单标识符列表)
                while (this.check(TokenType.Identifier) && !this.isAtEnd()) {
                    const propName = this.advance().value;
                    args.push(propName);
                }
            } else {
                // 遇到未知的块级指令，跳过内容直到 '}'
                console.warn(`Encountered unknown directive block: ${name}. Skipping content.`);
                while (!this.check(TokenType.Symbol, "}") && !this.isAtEnd()) {
                    this.advance();
                }
            }

            this.consume(TokenType.Symbol, `Expect '}' after ${name} block`, "}");
        }

        return { type: "Directive", name, args };
    }

    // --- 核心方法：解析元素 ---
    private parseElement(): ElementNode {
        const tagName = this.advance().value;
        const properties: Record<string, any> = {};
        const children: Node[] = [];

        // 1. 解析属性 (Props) -> (Key="Val", Key=123)
        if (this.match(TokenType.Symbol, "(")) {
            if (!this.check(TokenType.Symbol, ")")) {
                do {
                    const key = this.consume(TokenType.Identifier, "Expect property name").value;
                    this.consume(TokenType.Symbol, "Expect '=' after property name", "=");

                    let value: any;
                    // 值可能是 String, Number, Expression, 或布尔/枚举 Identifier
                    if (
                        this.match(TokenType.String) ||
                        this.match(TokenType.Number) ||
                        this.match(TokenType.Expression) ||
                        this.match(TokenType.Identifier)
                    ) {
                        value = this.previous().value;
                        // 尝试转换为布尔或数字类型
                        if (typeof value === "string") {
                            if (value.toLowerCase() === "true") value = true;
                            else if (value.toLowerCase() === "false") value = false;
                            else if (!isNaN(Number(value))) value = Number(value);
                        }
                    } else {
                        throw new Error(`Expect property value, got ${this.peek().value}`);
                    }

                    properties[key] = value;
                } while (this.match(TokenType.Symbol, ","));
            }
            this.consume(TokenType.Symbol, "Expect ')' after properties", ")");
        }

        // 2. 解析子节点 (Children) -> { ... }
        if (this.match(TokenType.Symbol, "{")) {
            while (!this.check(TokenType.Symbol, "}") && !this.isAtEnd()) {
                children.push(this.parseStatement());
            }
            this.consume(TokenType.Symbol, "Expect '}' after element body", "}");
        }

        return { type: "Element", tagName, properties, children };
    }

    private parseExpression(): ExpressionNode {
        const token = this.advance();
        // 去除 {{ }}
        const content = token.value.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "");
        return { type: "Expression", content };
    }

    private parseText(): TextNode {
        const token = this.advance();
        return { type: "Text", value: token.value };
    }

    // --- 辅助函数 (已修复严格模式下的问题) ---

    private match(type: TokenType, value?: string): boolean {
        if (this.check(type, value)) {
            this.advance();
            return true;
        }
        return false;
    }

    private check(type: TokenType, value?: string): boolean {
        if (this.isAtEnd()) return false;
        const token = this.peek();
        if (token.type !== type) return false;
        if (value !== undefined && token.value !== value) return false;
        return true;
    }

    private advance(): Token {
        if (!this.isAtEnd()) this.current++;
        return this.previous();
    }

    private isAtEnd(): boolean {
        return this.peek().type === TokenType.EOF;
    }

    // 确保 peek 永远返回 Token，而不是 undefined (严格模式修复)
    private peek(): Token {
        const token = this.tokens[this.current];
        if (!token) {
            return { type: TokenType.EOF, value: "", pos: -1 };
        }
        return token;
    }

    // 确保 previous 永远返回 Token (严格模式修复)
    private previous(): Token {
        const token = this.tokens[this.current - 1];
        if (!token) {
            return { type: TokenType.EOF, value: "", pos: -1 };
        }
        return token;
    }

    // 修复参数顺序，方便调用
    private consume(type: TokenType, message: string, value?: string): Token {
        if (this.check(type, value)) {
            return this.advance();
        }
        throw new Error(
            message + ` (Expected ${value || TokenType[type]}, got ${this.peek().value} at ${this.peek().pos})`
        );
    }
}
