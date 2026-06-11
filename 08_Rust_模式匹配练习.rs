// ============================================================
// AI 辅助 Rust · 练习篇：模式匹配实战训练
// 运行：rustc 08_Rust_模式匹配练习.rs && ./08_Rust_模式匹配练习
// ============================================================

use std::collections::HashMap;

fn main() {
    println!("╔══════════════════════════════════════════════════════╗");
    println!("║  🎯 Rust 模式匹配 — 6 个实战练习场景                ║");
    println!("╚══════════════════════════════════════════════════════╝\n");

    exercise1_traffic_light();
    exercise2_http_handler();
    exercise3_expression_eval();
    exercise4_result_option();
    exercise5_destructure();
    exercise6_guard_patterns();
}

// ============================================================
// 练习1：🚦 交通灯状态机（枚举 + match）
// ============================================================
#[derive(Debug, PartialEq)]
enum TrafficLight {
    Red,            // 红灯：停止
    Yellow,         // 黄灯：准备
    Green,          // 绿灯：通行
    FlashingYellow, // 黄闪：谨慎通过
}

impl TrafficLight {
    fn action(&self) -> &str {
        match self {
            TrafficLight::Red => "🛑 停车等待",
            TrafficLight::Yellow => "⚠️  准备停车",
            TrafficLight::Green => "✅ 可以通行",
            TrafficLight::FlashingYellow => "⚠️  减速慢行，注意观察",
        }
    }

    fn duration(&self) -> u32 {
        match self {
            TrafficLight::Red => 60,
            TrafficLight::Yellow => 3,
            TrafficLight::Green => 45,
            TrafficLight::FlashingYellow => 0, // 持续闪烁
        }
    }

    fn next(&self) -> TrafficLight {
        match self {
            TrafficLight::Red => TrafficLight::Green,
            TrafficLight::Yellow => TrafficLight::Red,
            TrafficLight::Green => TrafficLight::Yellow,
            // 通配符：匹配所有剩余情况
            other => {
                println!("   💡 黄闪模式下保持不变");
                TrafficLight::FlashingYellow
            }
        }
    }
}

fn exercise1_traffic_light() {
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("🚦 练习1：交通灯状态机");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    let lights = vec![
        TrafficLight::Red,
        TrafficLight::Green,
        TrafficLight::Yellow,
        TrafficLight::FlashingYellow,
    ];

    for light in &lights {
        println!(
            "  灯态={:?} | 动作={} | 持续{}秒 | 下一状态={:?}",
            light,
            light.action(),
            light.duration(),
            light.next()
        );
    }

    // 💡 AI 提示：match 是穷尽的，编译器会检查你是否处理了所有枚举变体
    // 如果新增 TrafficLight::Blue，编译就会报错，防止遗漏
    println!("\n✅ 关键收获：match + enum = 编译器保证的状态机\n");
}

// ============================================================
// 练习2：🌐 HTTP 响应处理器（多模式匹配）
// ============================================================
fn exercise2_http_handler() {
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("🌐 练习2：HTTP 响应处理器");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    let responses = vec![
        (200, "OK"),
        (301, "Moved Permanently"),
        (404, "Not Found"),
        (500, "Internal Server Error"),
        (418, "I'm a teapot"), // 🫖 彩蛋
    ];

    for (code, msg) in responses {
        let action = match code {
            200..=299 => format!("✅ 成功：{}", msg),
            300..=399 => format!("🔀 重定向到：{}", msg),
            400..=499 => format!("❌ 客户端错误({})：{}", code, msg),
            500..=599 => format!("💥 服务端错误({})：{}", code, msg),
            other => format!("❓ 未知状态码 {}: {}", other, msg),
        };
        println!("  HTTP {} → {}", code, action);
    }

    // 同时匹配多个值
    let status = 403;
    let desc = match status {
        200 => "OK",
        301 | 302 | 307 | 308 => "重定向",
        401 | 403 => "权限不足",
        404 => "页面不存在",
        500 | 502 | 503 => "服务器故障",
        _ => "其他状态",
    };
    println!("\n  {} → {}\n", status, desc);
    println!("✅ 关键收获：match 支持范围（200..=299）、多值匹配（|）、通配符（_）\n");
}

// ============================================================
// 练习3：🧮 简单表达式求值器（递归 + match）
// ============================================================
#[derive(Debug)]
enum Expr {
    Num(i32),
    Add(Box<Expr>, Box<Expr>),
    Sub(Box<Expr>, Box<Expr>),
    Mul(Box<Expr>, Box<Expr>),
    Div(Box<Expr>, Box<Expr>),
    Neg(Box<Expr>),
}

fn eval(expr: &Expr) -> Option<i32> {
    match expr {
        Expr::Num(n) => Some(*n),
        Expr::Add(l, r) => {
            let a = eval(l)?;
            let b = eval(r)?;
            Some(a + b)
        }
        Expr::Sub(l, r) => Some(eval(l)? - eval(r)?),
        Expr::Mul(l, r) => Some(eval(l)? * eval(r)?),
        Expr::Div(l, r) => {
            let b = eval(r)?;
            if b == 0 {
                None // 除零返回 None
            } else {
                Some(eval(l)? / b)
            }
        }
        Expr::Neg(e) => Some(-eval(e)?),
    }
}

fn exercise3_expression_eval() {
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("🧮 练习3：表达式求值器（递归 AST）");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // (3 + 5) * (10 - 4) = 8 * 6 = 48
    let expr = Expr::Mul(
        Box::new(Expr::Add(Box::new(Expr::Num(3)), Box::new(Expr::Num(5)))),
        Box::new(Expr::Sub(Box::new(Expr::Num(10)), Box::new(Expr::Num(4)))),
    );

    println!("  表达式：(3 + 5) × (10 - 4)");
    match eval(&expr) {
        Some(result) => println!("  ✅ 结果 = {}", result),
        None => println!("  ❌ 计算出错"),
    }

    // 除零测试
    let div_zero = Expr::Div(Box::new(Expr::Num(10)), Box::new(Expr::Num(0)));
    match eval(&div_zero) {
        Some(_) => println!("  (不应该到这里)"),
        None => println!("  🚫 除零错误被优雅处理了"),
    }

    println!("\n✅ 关键收获：match + 递归 = 优雅的 AST 解释器\n");
}

// ============================================================
// 练习4：📦 Result 和 Option 的优雅处理
// ============================================================
fn exercise4_result_option() {
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("📦 练习4：Result & Option — Rust 没有 null！");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // --- if let：只关心一种情况 ---
    let maybe_number: Option<i32> = Some(42);
    if let Some(n) = maybe_number {
        println!("  ✅ if let 解包：找到了数字 {}", n);
    }
    // 等价于：
    match maybe_number {
        Some(n) => println!("  ✅ match 写法：找到了数字 {}", n),
        None => {} // 什么都不做
    }

    // --- while let：循环解构 ---
    let mut stack = vec![1, 2, 3];
    print!("  📚 出栈顺序：");
    while let Some(top) = stack.pop() {
        print!("{} ", top);
    }
    println!("（栈已空）");

    // --- let-else：不满足就提前返回 ---
    let config: HashMap<&str, i32> = HashMap::from([("timeout", 30), ("retries", 3)]);

    let timeout = match config.get("timeout") {
        Some(&v) => v,
        None => {
            println!("  ⚠️ 使用默认超时");
            60
        }
    };
    println!("  ⏱️  超时设置：{} 秒", timeout);

    // --- ? 运算符：错误传播 ---
    fn parse_and_double(s: &str) -> Result<i32, String> {
        let n: i32 = s.parse().map_err(|_| format!("'{}' 不是有效数字", s))?;
        Ok(n * 2)
    }

    match parse_and_double("21") {
        Ok(v) => println!("  ✅ parse_and_double(\"21\") = {}", v),
        Err(e) => println!("  ❌ {}", e),
    }
    match parse_and_double("abc") {
        Ok(v) => println!("  {}", v),
        Err(e) => println!("  ❌ parse_and_double(\"abc\"): {}", e),
    }

    println!("\n✅ 关键收获：Option<T> 替代 null，Result<T,E> 替代异常，编译器强制你处理\n");
}

// ============================================================
// 练习5：🔍 深度解构（结构体、元组、嵌套）
// ============================================================
fn exercise5_destructure() {
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("🔍 练习5：深度解构 — 把数据「拆开」来匹配");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    #[derive(Debug)]
    struct Point {
        x: i32,
        y: i32,
    }

    #[derive(Debug)]
    enum Shape {
        Circle {
            center: Point,
            radius: f64,
        },
        Rectangle {
            top_left: Point,
            bottom_right: Point,
        },
        Triangle(Point, Point, Point),
    }

    let shapes = vec![
        Shape::Circle {
            center: Point { x: 0, y: 0 },
            radius: 5.0,
        },
        Shape::Rectangle {
            top_left: Point { x: 0, y: 10 },
            bottom_right: Point { x: 20, y: 0 },
        },
        Shape::Triangle(
            Point { x: 0, y: 0 },
            Point { x: 5, y: 10 },
            Point { x: 10, y: 0 },
        ),
    ];

    for shape in &shapes {
        match shape {
            // 解构嵌套结构体
            Shape::Circle {
                center: Point { x, y },
                radius: r,
            } => {
                println!(
                    "  ⭕ 圆形：圆心=({},{}), 半径={}, 面积={:.2}",
                    x,
                    y,
                    r,
                    std::f64::consts::PI * r * r
                );
            }

            // @ 绑定：既匹配模式又绑定整个值
            Shape::Rectangle {
                top_left: Point { x: x1, y: y1 },
                bottom_right: p2 @ Point { .. },
            } => {
                println!(
                    "  ⬜ 矩形：({},{}) → ({:?}), 宽={}, 高={}",
                    x1,
                    y1,
                    p2,
                    p2.x - x1,
                    y1 - p2.y
                );
            }

            // 元组解构 + 忽略字段
            Shape::Triangle(Point { x: x1, y: y1 }, _, Point { x: x3, .. }) => {
                println!("  🔺 三角形：顶点A=({},{}), 顶点C=({},{})", x1, y1, x3, y1);
                // 简化：只显示两个顶点
            }
        }
    }

    println!("\n✅ 关键收获：match 可以解构任意深度的嵌套结构，@ 绑定同时保存整体和局部\n");
}

// ============================================================
// 练习6：🛡️ 守卫模式（match guard）— 在模式上加条件
// ============================================================
fn exercise6_guard_patterns() {
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("🛡️  练习6：守卫模式 — match + if 条件");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // 场景：学生成绩分级（用守卫条件细化匹配）
    let scores = vec![95, 82, 73, 60, 58, 45];

    for &score in &scores {
        let grade = match score {
            s if s >= 90 => "A+ (优秀)",
            s if s >= 80 && s < 90 => "A  (良好)",
            s if s >= 70 && s < 80 => "B  (中等)",
            s if s >= 60 && s < 70 => "C  (及格)",
            s if s >= 0 && s < 60 => "D  (不及格)",
            _ => "无效分数",
        };
        println!("  分数 {:3} → {}", score, grade);
    }

    // 场景：配对匹配 — 两个值同时满足条件
    println!();
    let pairs = vec![(3, 8), (1, 1), (5, 5), (7, 3), (0, 4)];
    for (a, b) in &pairs {
        match (a, b) {
            (x, y) if x == y => println!("  ({}, {}) → 相等", x, y),
            (x, y) if x + y == 10 => println!("  ({}, {}) → 和为 10 🎯", x, y),
            (x, y) if x > y => println!("  ({}, {}) → 前者大", x, y),
            _ => println!("  ({}, {}) → 后者大", a, b),
        }
    }

    println!("\n✅ 关键收获：守卫（if 条件）让你在模式匹配的基础上增加额外逻辑判断\n");

    println!("╔══════════════════════════════════════════════════════╗");
    println!("║  🎯 模式匹配速查表：                                 ║");
    println!("║  match 值 { 模式 => 动作 }  — 穷尽匹配              ║");
    println!("║  if let 模式 = 值 { }       — 只关心一种情况         ║");
    println!("║  while let 模式 = 值 { }    — 循环解构              ║");
    println!("║  let-else 模式 = 值 else {} — 不匹配就走             ║");
    println!("║  范围匹配  200..=299        — 连续值                ║");
    println!("║  多值匹配  A | B | C        — 或                    ║");
    println!("║  解构匹配  Struct { x, y }  — 拆开复杂类型          ║");
    println!("║  守卫匹配  模式 if 条件     — 模式 + 条件           ║");
    println!("║  通配符    _                — 匹配一切               ║");
    println!("╚══════════════════════════════════════════════════════╝");
}
