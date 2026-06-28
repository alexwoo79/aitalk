// 简单算术表达式 → Polars Expr 转换器
//
// 支持：+, -, *, /, 括号, 数字常量, 列引用（可附带筛选条件）
// 示例： "(A + B) / C * 100" → ((col("收入") + col("支出")) / col("数量")) * lit(100.0)

use polars::prelude::*;

/// 变量元信息（列名 + 可选筛选条件）
pub struct VarInfo {
    pub column: String,
    /// 筛选条件字符串，如 "类别 = 设计"
    pub filter: Option<String>,
}

/// 将前端计算列表达式转换为 Polars Expr（基础版，无筛选）
pub fn parse_to_expr(
    expression: &str,
    var_map: &std::collections::HashMap<String, String>,
) -> Result<Expr, String> {
    let tokens = tokenize(expression)?;
    let (expr, _) = parse_expr(&tokens, 0, var_map, &HashMap::new())?;
    Ok(expr)
}

/// 将前端计算列表达式转换为 Polars Expr（带变量筛选）
///
/// * `expression` - 如 "(A + B) / C"
/// * `var_map` - 变量别名 → VarInfo 的映射
pub fn parse_to_expr_with_filters(
    expression: &str,
    var_map: &std::collections::HashMap<String, VarInfo>,
    df_cols: &[String],
) -> Result<Expr, String> {
    let tokens = tokenize(expression)?;
    // 先将 VarInfo 转为 (column, filter_expr) 形式
    let mut col_map: HashMap<String, String> = HashMap::new();
    let mut filter_map: HashMap<String, Expr> = HashMap::new();
    for (alias, info) in var_map {
        col_map.insert(alias.clone(), info.column.clone());
        if let Some(ref f) = info.filter {
            if !f.is_empty() {
                if let Some(expr) = crate::commands::compute::parse_condition_expr(f, df_cols) {
                    filter_map.insert(alias.clone(), expr);
                }
            }
        }
    }
    let (expr, _) = parse_expr(&tokens, 0, &col_map, &filter_map)?;
    Ok(expr)
}

use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Ident(String),
    Number(f64),
    Plus,
    Minus,
    Star,
    Slash,
    LParen,
    RParen,
}

fn tokenize(s: &str) -> Result<Vec<Token>, String> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            ' ' | '\t' | '\n' | '\r' => {
                i += 1;
                continue;
            }
            '+' => {
                tokens.push(Token::Plus);
                i += 1
            }
            '-' => {
                tokens.push(Token::Minus);
                i += 1
            }
            '*' => {
                tokens.push(Token::Star);
                i += 1
            }
            '/' => {
                tokens.push(Token::Slash);
                i += 1
            }
            '(' => {
                tokens.push(Token::LParen);
                i += 1
            }
            ')' => {
                tokens.push(Token::RParen);
                i += 1
            }
            '0'..='9' | '.' => {
                let start = i;
                while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                    i += 1
                }
                let num_s: String = chars[start..i].iter().collect();
                match num_s.parse::<f64>() {
                    Ok(v) => tokens.push(Token::Number(v)),
                    Err(_) => return Err(format!("无效数字: {num_s}")),
                }
            }
            c if c.is_alphabetic() || c == '_' => {
                let start = i;
                while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_') {
                    i += 1
                }
                let ident: String = chars[start..i].iter().collect();
                tokens.push(Token::Ident(ident));
            }
            _ => return Err(format!("表达式包含非法字符: '{c}'")),
        }
    }
    Ok(tokens)
}

/// 解析 expr → term (('+' | '-') term)*
fn parse_expr(
    tokens: &[Token],
    pos: usize,
    var_map: &HashMap<String, String>,
    filter_map: &HashMap<String, Expr>,
) -> Result<(Expr, usize), String> {
    let (mut left, mut pos) = parse_term(tokens, pos, var_map, filter_map)?;
    while pos < tokens.len() {
        match &tokens[pos] {
            Token::Plus => {
                let (right, next) = parse_term(tokens, pos + 1, var_map, filter_map)?;
                left = left + right;
                pos = next;
            }
            Token::Minus => {
                let (right, next) = parse_term(tokens, pos + 1, var_map, filter_map)?;
                left = left - right;
                pos = next;
            }
            _ => break,
        }
    }
    Ok((left, pos))
}

/// 解析 term → factor (('*' | '/') factor)*
fn parse_term(
    tokens: &[Token],
    pos: usize,
    var_map: &HashMap<String, String>,
    filter_map: &HashMap<String, Expr>,
) -> Result<(Expr, usize), String> {
    let (mut left, mut pos) = parse_factor(tokens, pos, var_map, filter_map)?;
    while pos < tokens.len() {
        match &tokens[pos] {
            Token::Star => {
                let (right, next) = parse_factor(tokens, pos + 1, var_map, filter_map)?;
                left = left * right;
                pos = next;
            }
            Token::Slash => {
                let (right, next) = parse_factor(tokens, pos + 1, var_map, filter_map)?;
                left = left / right;
                pos = next;
            }
            _ => break,
        }
    }
    Ok((left, pos))
}

/// 解析 factor → '(' expr ')' | Number | Ident
fn parse_factor(
    tokens: &[Token],
    pos: usize,
    var_map: &HashMap<String, String>,
    filter_map: &HashMap<String, Expr>,
) -> Result<(Expr, usize), String> {
    if pos >= tokens.len() {
        return Err("表达式意外结束".into());
    }
    match &tokens[pos] {
        Token::LParen => {
            let (inner, next) = parse_expr(tokens, pos + 1, var_map, filter_map)?;
            if next >= tokens.len() || tokens[next] != Token::RParen {
                return Err("缺少右括号 ')'".into());
            }
            Ok((inner, next + 1))
        }
        Token::Number(v) => Ok((lit(*v), pos + 1)),
        Token::Ident(alias) => {
            // 通过 var_map 将 alias 映射为实际列名
            let col_name = var_map.get(alias).cloned().unwrap_or_else(|| alias.clone());
            // 优先尝试转数字，否则作为列引用
            let base_expr = if let Ok(n) = col_name.parse::<f64>() {
                lit(n)
            } else {
                col(&col_name).cast(DataType::Float64)
            };
            // 有变量筛选 → when(filter).then(col).otherwise(0)
            let expr = if let Some(filter_expr) = filter_map.get(alias) {
                when(filter_expr.clone())
                    .then(base_expr)
                    .otherwise(lit(0.0))
            } else {
                base_expr
            };
            Ok((expr, pos + 1))
        }
        _ => Err(format!("表达式意外符号: {:?}", tokens[pos])),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_simple_add() {
        let mut m = HashMap::new();
        m.insert("A".into(), "收入".into());
        m.insert("B".into(), "支出".into());
        let _expr = parse_to_expr("A + B", &m).unwrap();
        // 验证格式: col("收入").cast(Float64) + col("支出").cast(Float64)
        let s = format!("{:?}", _expr);
        assert!(s.contains("收入"));
        assert!(s.contains("支出"));
    }

    #[test]
    fn test_complex() {
        let mut m = HashMap::new();
        m.insert("A".into(), "收入".into());
        m.insert("B".into(), "支出".into());
        m.insert("C".into(), "数量".into());
        // (A+B)/C
        let expr = parse_to_expr("(A + B) / C", &m).unwrap();
        let s = format!("{:?}", expr);
        assert!(
            s.contains("收入") && s.contains("支出") && s.contains("数量"),
            "expr: {s}"
        );
    }

    #[test]
    fn test_with_number() {
        let mut m = HashMap::new();
        m.insert("A".into(), "金额".into());
        let expr = parse_to_expr("A * 1.13", &m).unwrap();
        let s = format!("{:?}", expr);
        assert!(s.contains("金额") && s.contains("1.13"), "expr: {s}");
    }
}
