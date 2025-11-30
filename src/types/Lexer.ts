// --- 2. 词法分析器 (Lexer) ---

export enum TokenType {
    Identifier,
    String,
    Number,
    Symbol, // { } ( ) = ,
    Directive, // @word
    Expression, // {{ ... }}
    EOF,
}

export interface Token {
    type: TokenType;
    value: string; // 确保 value 始终是 string
    pos: number;
}
