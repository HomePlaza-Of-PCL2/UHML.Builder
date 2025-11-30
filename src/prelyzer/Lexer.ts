import { type Token, TokenType } from "../types/Lexer.js";

export class Lexer {
    private pos = 0;
    private input: string;

    constructor(input: string) {
        this.input = input;
    }

    tokenize(): Token[] {
        const tokens: Token[] = [];
        while (this.pos < this.input.length) {
            const char = this.input[this.pos];

            // 跳过空白
            if (/\s/.test(char!)) {
                this.pos++;
                continue;
            }

            // 1. Expression {{ ... }}
            if (this.input.startsWith("{{", this.pos)) {
                const start = this.pos;
                let end = this.input.indexOf("}}", start);
                if (end === -1) throw new Error("Unclosed expression {{");
                end += 2;
                tokens.push({ type: TokenType.Expression, value: this.input.slice(start, end), pos: start });
                this.pos = end;
                continue;
            }

            // 2. Directive @...
            if (char === "@") {
                const start = this.pos;
                this.pos++;
                while (this.pos < this.input.length && /[a-zA-Z0-9]/.test(this.input[this.pos]!)) {
                    this.pos++;
                }
                tokens.push({ type: TokenType.Directive, value: this.input.slice(start, this.pos), pos: start });
                continue;
            }

            // 3. String "..."
            if (char === '"') {
                const start = this.pos;
                this.pos++; // skip open quote
                let val = "";
                while (this.pos < this.input.length && this.input[this.pos] !== '"') {
                    // 简单的转义处理
                    if (this.input[this.pos] === "\\") {
                        val += this.input[this.pos]; // 添加反斜杠
                        this.pos++;
                    }
                    val += this.input[this.pos];
                    this.pos++;
                }
                this.pos++; // skip close quote
                tokens.push({ type: TokenType.String, value: val, pos: start });
                continue;
            }

            // 4. Symbols
            if (["{", "}", "(", ")", "=", ","].includes(char!)) {
                tokens.push({ type: TokenType.Symbol, value: char!, pos: this.pos });
                this.pos++;
                continue;
            }

            // 5. Identifier (包含点、冒号、井号、中划线，用于 local:Name, Border.Background, #Component)
            if (/[a-zA-Z0-9_#.:\-]/.test(char!)) {
                const start = this.pos;
                while (this.pos < this.input.length && /[a-zA-Z0-9_#.:\-]/.test(this.input[this.pos]!)) {
                    this.pos++;
                }
                let val = this.input.slice(start, this.pos);
                // 数字处理
                if (
                    !isNaN(Number(val)) &&
                    !val.includes(":") &&
                    !val.includes("#") &&
                    !val.includes(".") &&
                    !val.includes("-")
                ) {
                    tokens.push({ type: TokenType.Number, value: val, pos: start });
                } else {
                    tokens.push({ type: TokenType.Identifier, value: val, pos: start });
                }
                continue;
            }

            throw new Error(`Unexpected character: ${char} at position ${this.pos}`);
        }
        tokens.push({ type: TokenType.EOF, value: "", pos: this.pos });
        return tokens;
    }
}
