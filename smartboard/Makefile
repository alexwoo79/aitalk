# ============================================================
# SmartBoard Makefile
# Vue 3 + Vite + Tauri 2 (Rust) 项目构建脚本
# ============================================================

.PHONY: help dev build build-release check check-rust check-all \
        lint lint-rust fmt fmt-rust fmt-all \
        clean clean-all deep-clean \
        install update setup \
        frontend preview tauri-dev \
        diff size stats

# ---- 颜色输出 ----
GREEN  := \033[0;32m
YELLOW := \033[0;33m
BLUE   := \033[0;34m
RED    := \033[0;31m
CYAN   := \033[0;36m
BOLD   := \033[1m
NC     := \033[0m

# ---- 默认目标 ----
.DEFAULT_GOAL := help

# ============================================================
# 帮助
# ============================================================
help: ## 📖 显示此帮助信息
	@echo ""
	@echo "$(BOLD)$(CYAN)╔══════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BOLD)$(CYAN)║           SmartBoard 构建命令                        ║$(NC)"
	@echo "$(BOLD)$(CYAN)╚══════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BOLD)$(BLUE)── 开发 ────────────────────────────────────────────$(NC)"
	@awk '/^dev:|^frontend:|^preview:|^tauri-dev:/{printf "  $(GREEN)%-18s$(NC) %s\n", substr($$1,1,index($$1,":")-1), substr($$0,index($$0,"## ")+3)}' $(MAKEFILE_LIST)
	@echo ""
	@echo "$(BOLD)$(BLUE)── 构建 ────────────────────────────────────────────$(NC)"
	@awk '/^build:|^build-release:/{printf "  $(GREEN)%-18s$(NC) %s\n", substr($$1,1,index($$1,":")-1), substr($$0,index($$0,"## ")+3)}' $(MAKEFILE_LIST)
	@echo ""
	@echo "$(BOLD)$(BLUE)── 质量检查 ────────────────────────────────────────$(NC)"
	@awk '/^check:|^check-rust:|^check-all:|^lint:|^lint-rust:|^lint-all:/{printf "  $(GREEN)%-18s$(NC) %s\n", substr($$1,1,index($$1,":")-1), substr($$0,index($$0,"## ")+3)}' $(MAKEFILE_LIST)
	@echo ""
	@echo "$(BOLD)$(BLUE)── 代码风格 ────────────────────────────────────────$(NC)"
	@awk '/^fmt:|^fmt-rust:|^fmt-all:/{printf "  $(GREEN)%-18s$(NC) %s\n", substr($$1,1,index($$1,":")-1), substr($$0,index($$0,"## ")+3)}' $(MAKEFILE_LIST)
	@echo ""
	@echo "$(BOLD)$(BLUE)── 清理 ────────────────────────────────────────────$(NC)"
	@awk '/^clean:|^clean-all:|^deep-clean:/{printf "  $(GREEN)%-18s$(NC) %s\n", substr($$1,1,index($$1,":")-1), substr($$0,index($$0,"## ")+3)}' $(MAKEFILE_LIST)
	@echo ""
	@echo "$(BOLD)$(BLUE)── 依赖管理 ────────────────────────────────────────$(NC)"
	@awk '/^install:|^update:|^setup:/{printf "  $(GREEN)%-18s$(NC) %s\n", substr($$1,1,index($$1,":")-1), substr($$0,index($$0,"## ")+3)}' $(MAKEFILE_LIST)
	@echo ""
	@echo "$(BOLD)$(BLUE)── 信息 ────────────────────────────────────────────$(NC)"
	@awk '/^diff:|^size:|^stats:/{printf "  $(GREEN)%-18s$(NC) %s\n", substr($$1,1,index($$1,":")-1), substr($$0,index($$0,"## ")+3)}' $(MAKEFILE_LIST)
	@echo ""

# ============================================================
# 开发
# ============================================================
dev: ## 🚀 启动开发模式（Vite HMR + Tauri 热重载）
	@echo "$(GREEN)▶ 启动 Tauri 开发模式...$(NC)"
	npm run tauri dev

frontend: ## 🎨 仅构建前端（Vite）
	@echo "$(GREEN)▶ 构建前端...$(NC)"
	npm run build

preview: ## 🔍 预览前端构建产物
	@echo "$(GREEN)▶ 启动预览服务器...$(NC)"
	npm run preview

tauri-dev: dev ## 🚀 同 dev，快捷别名
	@true

# ============================================================
# 构建
# ============================================================
build: ## 📦 完整构建（前端类型检查 + Vite + Rust debug）
	@echo "$(GREEN)▶ 完整构建...$(NC)"
	npm run tauri build

build-release: ## 📦 发布构建（优化 + 剥离符号 + LTO）
	@echo "$(GREEN)▶ 发布构建...$(NC)"
	cd src-tauri && cargo build --release
	@echo "$(YELLOW)📦 Release 产物: src-tauri/target/release/smartboard$(NC)"

# ============================================================
# 质量检查
# ============================================================
check: ## ✅ 前端 TypeScript 类型检查
	@echo "$(GREEN)▶ Vue TypeScript 类型检查...$(NC)"
	npx vue-tsc --noEmit

check-rust: ## 🦀 Rust 类型/编译检查（不生成二进制）
	@echo "$(GREEN)▶ Cargo check...$(NC)"
	cd src-tauri && cargo check

check-all: check check-rust ## ✅ 全部检查（前端 + Rust）

lint: ## 🔍 前端 ESLint 检查
	@echo "$(GREEN)▶ ESLint...$(NC)"
	@if [ -f node_modules/.bin/eslint ]; then \
		npx eslint src/ --ext .ts,.vue; \
	else \
		echo "$(YELLOW)⚠ ESLint 未安装，跳过$(NC)"; \
	fi

lint-rust: ## 🦀 Rust Clippy 检查
	@echo "$(GREEN)▶ Clippy...$(NC)"
	cd src-tauri && cargo clippy -- -D warnings

lint-all: lint lint-rust ## 🔍 全部 Lint（前端 + Rust）

# ============================================================
# 代码风格
# ============================================================
fmt: ## 🎨 格式化前端代码（Prettier）
	@echo "$(GREEN)▶ Prettier 格式化...$(NC)"
	@if [ -f node_modules/.bin/prettier ]; then \
		npx prettier --write "src/**/*.{ts,vue,css}"; \
	else \
		echo "$(YELLOW)⚠ Prettier 未安装，跳过$(NC)"; \
	fi

fmt-rust: ## 🦀 格式化 Rust 代码（cargo fmt）
	@echo "$(GREEN)▶ Cargo fmt...$(NC)"
	cd src-tauri && cargo fmt

fmt-all: fmt fmt-rust ## 🎨 格式化全部代码（前端 + Rust）

# ============================================================
# 清理
# ============================================================
clean: ## 🧹 清理构建产物（保留 node_modules）
	@echo "$(GREEN)▶ 清理构建产物...$(NC)"
	rm -rf dist
	rm -rf src-tauri/target
	@echo "$(GREEN)✅ 清理完成$(NC)"

clean-all: clean ## 🧹 深度清理（含 node_modules）
	@echo "$(GREEN)▶ 深度清理...$(NC)"
	rm -rf node_modules
	@echo "$(YELLOW)⚠ node_modules 已删除，请运行 make install 重新安装$(NC)"

deep-clean: clean-all ## 🧹 同 clean-all

# ============================================================
# 依赖管理
# ============================================================
install: ## 📥 安装全部依赖（npm + Cargo 自动处理）
	@echo "$(GREEN)▶ 安装前端依赖...$(NC)"
	npm install
	@echo "$(GREEN)✅ 依赖安装完成（Cargo 依赖在首次构建时自动下载）$(NC)"

update: ## 🔄 更新全部依赖到最新兼容版本
	@echo "$(GREEN)▶ 更新前端依赖...$(NC)"
	npm update
	@echo "$(GREEN)▶ 更新 Rust 依赖...$(NC)"
	cd src-tauri && cargo update
	@echo "$(GREEN)✅ 依赖更新完成$(NC)"

setup: install ## 🏗️ 首次初始化（安装依赖 + 类型检查）
	@echo "$(GREEN)▶ 运行类型检查...$(NC)"
	npx vue-tsc --noEmit || echo "$(YELLOW)⚠ 类型检查有警告，正常$(NC)"
	@echo ""
	@echo "$(BOLD)$(GREEN)✅ SmartBoard 初始化完成！$(NC)"
	@echo "$(CYAN)   运行 $(BOLD)make dev$(NC)$(CYAN) 启动开发模式$(NC)"

# ============================================================
# 信息
# ============================================================
diff: ## 📊 显示未提交的 git diff 统计
	@git diff --stat 2>/dev/null || echo "$(YELLOW)非 git 仓库或无变更$(NC)"

size: ## 📏 显示构建产物大小
	@echo "$(BOLD)📏 构建产物大小$(NC)"
	@echo "──────────────────────────────"
	@printf "dist:           "; if [ -d dist ]; then du -sh dist 2>/dev/null | cut -f1; else echo "(未构建)"; fi
	@printf "target/debug:   "; if [ -d src-tauri/target/debug ]; then du -sh src-tauri/target/debug 2>/dev/null | cut -f1; else echo "(未构建)"; fi
	@printf "target/release: "; if [ -d src-tauri/target/release ]; then du -sh src-tauri/target/release 2>/dev/null | cut -f1; else echo "(未构建)"; fi
	@printf "node_modules:   "; if [ -d node_modules ]; then du -sh node_modules 2>/dev/null | cut -f1; else echo "(未安装)"; fi

stats: ## 📈 显示项目代码统计
	@echo "$(BOLD)📈 代码统计$(NC)"
	@echo "──────────────────────────────"
	@printf "Vue 组件:   "; find src -name '*.vue' 2>/dev/null | wc -l | tr -d ' '
	@printf "TypeScript: "; find src -name '*.ts' 2>/dev/null | wc -l | tr -d ' '
	@printf "CSS:        "; find src -name '*.css' 2>/dev/null | wc -l | tr -d ' '
	@printf "Rust:       "; find src-tauri/src -name '*.rs' 2>/dev/null | wc -l | tr -d ' '
	@echo "──────────────────────────────"
	@printf "总行数:     "; find src src-tauri/src -type f \( -name '*.vue' -o -name '*.ts' -o -name '*.css' -o -name '*.rs' \) 2>/dev/null | xargs wc -l 2>/dev/null | tail -1 | awk '{print $$1}'

