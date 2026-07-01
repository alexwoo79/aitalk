# ============================================================
# SmartBoard Makefile — macOS only
# Vue 3 + Vite + Tauri 2 (Rust)
# ============================================================

APP_NAME   := smartboard

# --------------- ANSI colors ---------------
GREEN  := \033[0;32m
YELLOW := \033[1;33m
BLUE   := \033[0;34m
RED    := \033[0;31m
CYAN   := \033[0;36m
BOLD   := \033[1m
NC     := \033[0m

.PHONY: help dev frontend preview build build-save build-release \
        check check-rust check-all lint lint-rust lint-all \
        fmt fmt-rust fmt-all \
        clean clean-ios clean-all \
        install update setup \
        diff size stats \
        ios-rust ios-device-deploy ios-device-deploy-release ios-ipa-install \
        release release-arm64 release-all

.DEFAULT_GOAL := help

# ============================================================
# 帮助
# ============================================================
help:
	@echo ""
	@echo "$(BOLD)SmartBoard 构建命令$(NC)"
	@echo ""
	@echo "$(BOLD)── 开发$(NC)"
	@echo "  dev             开发模式（Vite HMR + Tauri 热重载）"
	@echo "  frontend        仅构建前端（Vite）"
	@echo "  preview         预览前端构建"
	@echo ""
	@echo "$(BOLD)── 构建$(NC)"
	@echo "  build           完整构建（Vite + Rust debug）"
	@echo "  build-save      构建 standalone renderer"
	@echo "  build-release   发布构建（Rust --release）"
	@echo ""
	@echo "$(BOLD)── 质量$(NC)"
	@echo "  check           TypeScript 类型检查"
	@echo "  check-rust      Rust 编译检查"
	@echo "  lint            ESLint"
	@echo "  lint-rust       Clippy"
	@echo ""
	@echo "$(BOLD)── 风格$(NC)"
	@echo "  fmt             Prettier"
	@echo "  fmt-rust        cargo fmt"
	@echo ""
	@echo "$(BOLD)── 清理$(NC)"
	@echo "  clean           清理构建产物"
	@echo "  clean-ios       清理 iOS 构建产物"
	@echo "  clean-all       深度清理（含 node_modules）"
	@echo ""
	@echo "$(BOLD)── 依赖$(NC)"
	@echo "  install         npm install"
	@echo "  update          npm + cargo update"
	@echo "  setup           首次初始化"
	@echo ""
	@echo "$(BOLD)── iOS$(NC)"
	@echo "  ios-rust        仅编译 Rust → iOS"
	@echo "  ios-device-deploy          构建+部署 Debug 到真机"
	@echo "  ios-device-deploy-release  构建+部署 Release 到真机"
	@echo "  ios-ipa-install            安装 IPA 到真机"
	@echo ""
	@echo "$(BOLD)── 发布$(NC)"
	@echo "  release         一键发布 (x86_64 + iOS)"
	@echo "  release-arm64   arm64 发布包"
	@echo "  release-all     全部平台"
	@echo ""

# ============================================================
# 开发
# ============================================================
dev: build-save
	@echo "$(GREEN)▶ 启动 Tauri 开发模式...$(NC)"
	npm run tauri dev

frontend: build-save
	@echo "$(GREEN)▶ 构建前端...$(NC)"
	npm run build

preview:
	@echo "$(GREEN)▶ 预览前端构建...$(NC)"
	npm run preview

# ============================================================
# 构建
# ============================================================
build-save:
	@echo "$(GREEN)▶ 构建 save 渲染器...$(NC)"
	npm run build:save

build: build-save
	@echo "$(GREEN)▶ 完整构建...$(NC)"
	npm run tauri build

build-release: build-save
	@echo "$(GREEN)▶ 发布构建...$(NC)"
	cd src-tauri && cargo build --release
	@echo "$(GREEN)📦 Release 产物: src-tauri/target/release/$(APP_NAME)$(NC)"

# ============================================================
# 质量检查
# ============================================================
check: build-save
	@echo "$(GREEN)▶ TypeScript 类型检查...$(NC)"
	npx vue-tsc --noEmit

check-rust:
	@echo "$(GREEN)▶ Cargo check...$(NC)"
	cd src-tauri && cargo check

check-all: check check-rust

lint:
	@echo "$(GREEN)▶ ESLint...$(NC)"
	@if [ -f node_modules/.bin/eslint ]; then npx eslint src/ --ext .ts,.vue; else echo "$(YELLOW)⚠ ESLint 未安装，跳过$(NC)"; fi

lint-rust:
	@echo "$(GREEN)▶ Clippy...$(NC)"
	cd src-tauri && cargo clippy -- -D warnings

lint-all: lint lint-rust

# ============================================================
# 代码风格
# ============================================================
fmt:
	@echo "$(GREEN)▶ Prettier 格式化...$(NC)"
	@if [ -f node_modules/.bin/prettier ]; then npx prettier --write "src/**/*.{ts,vue,css}"; else echo "$(YELLOW)⚠ Prettier 未安装，跳过$(NC)"; fi

fmt-rust:
	@echo "$(GREEN)▶ cargo fmt...$(NC)"
	cd src-tauri && cargo fmt

fmt-all: fmt fmt-rust

# ============================================================
# 清理
# ============================================================
clean:
	@echo "$(GREEN)▶ 清理构建产物...$(NC)"
	rm -rf dist src-tauri/target
	@echo "$(GREEN)✅ 清理完成$(NC)"

clean-ios:
	@echo "$(GREEN)▶ 清理 iOS 构建产物...$(NC)"
	rm -rf src-tauri/gen/apple/build src-tauri/gen/apple/Externals 2>/dev/null || true
	@echo "$(GREEN)✅ iOS 清理完成$(NC)"

clean-all: clean clean-ios
	@echo "$(GREEN)▶ 深度清理...$(NC)"
	rm -rf node_modules
	@echo "$(YELLOW)⚠ node_modules 已删除，请运行 make install 重新安装$(NC)"

# ============================================================
# 依赖管理
# ============================================================
install:
	@echo "$(GREEN)▶ 安装前端依赖...$(NC)"
	npm install
	@echo "$(GREEN)✅ 依赖安装完成$(NC)"

update:
	@echo "$(GREEN)▶ 更新前端依赖...$(NC)"
	npm update
	@echo "$(GREEN)▶ 更新 Rust 依赖...$(NC)"
	cd src-tauri && cargo update
	@echo "$(GREEN)✅ 依赖更新完成$(NC)"

setup: install
	@echo "$(GREEN)▶ 类型检查...$(NC)"
	npx vue-tsc --noEmit || echo "$(YELLOW)⚠ 类型检查有警告$(NC)"
	@echo ""
	@echo "$(BOLD)$(GREEN)✅ SmartBoard 初始化完成！$(NC)"
	@echo "$(CYAN)   运行 make dev 启动开发模式$(NC)"

# ============================================================
# 信息
# ============================================================
diff:
	@git diff --stat 2>/dev/null || echo "$(YELLOW)非 git 仓库或无变更$(NC)"

size:
	@echo "$(BOLD)📏 构建产物大小$(NC)"
	@echo "──────────────────────────────"
	@du -sh dist 2>/dev/null || echo "dist:      (未构建)"
	@du -sh src-tauri/target/debug 2>/dev/null || echo "debug:     (未构建)"
	@du -sh src-tauri/target/release 2>/dev/null || echo "release:   (未构建)"
	@du -sh node_modules 2>/dev/null || echo "node_modules: (未安装)"

stats:
	@echo "$(BOLD)📈 代码统计$(NC)"
	@echo "──────────────────────────────"
	@echo "Vue 组件:   $$(find src -name '*.vue' 2>/dev/null | wc -l | tr -d ' ')"
	@echo "TypeScript: $$(find src -name '*.ts' 2>/dev/null | wc -l | tr -d ' ')"
	@echo "CSS:        $$(find src -name '*.css' 2>/dev/null | wc -l | tr -d ' ')"
	@echo "Rust:       $$(find src-tauri/src -name '*.rs' 2>/dev/null | wc -l | tr -d ' ')"
	@echo "──────────────────────────────"
	@echo "总行数:     $$(find src src-tauri/src -name '*.vue' -o -name '*.ts' -o -name '*.css' -o -name '*.rs' 2>/dev/null | xargs wc -l 2>/dev/null | tail -1 | awk '{print $$1}')"

# ============================================================
# iOS
# ============================================================

# 版本号（git tag 或默认值）
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo 0.1.0)

ios-rust:
	@echo "$(GREEN)▶ 编译 Rust → iOS (aarch64)...$(NC)"
	cd src-tauri && cargo build --target aarch64-apple-ios --release -p $(APP_NAME)

# ---- iOS 真机部署 ----
_IOS_DEVICE := $(shell xcrun devicectl list devices 2>/dev/null | grep -vi unavailable | grep -iE 'iphone|ipad' | head -1)
_IOS_DEVICE_ID := $(shell echo "$(_IOS_DEVICE)" | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' | head -1)

ios-device-deploy: build-save
	@echo '========================================'
	@echo '  iOS 真机部署 Debug'
	@echo '========================================'
	@if [ -z "$(_IOS_DEVICE_ID)" ]; then echo '❌ 未检测到可用的 iOS 设备'; exit 1; fi; \
	echo "📱 目标设备: $(_IOS_DEVICE_ID)"; \
	echo '🔨 Step 1/2: Tauri iOS 构建 (Debug)...'; \
	npx tauri ios build --debug || { echo '❌ 构建失败'; exit 1; }; \
	echo '✅ 构建成功'; \
	echo '🚀 Step 2/2: 安装到设备...'; \
	ipa=$$(find src-tauri/gen/apple/build -name '*.ipa' -type f 2>/dev/null | head -1); \
	if [ -z "$$ipa" ]; then app=$$(find src-tauri/gen/apple/build -name '*.app' -type d 2>/dev/null | head -1); fi; \
	if [ -n "$$ipa" ]; then xcrun devicectl device install app --device "$(_IOS_DEVICE_ID)" "$$ipa"; \
	elif [ -n "$$app" ]; then xcrun devicectl device install app --device "$(_IOS_DEVICE_ID)" "$$app"; \
	else echo '❌ 找不到构建产物'; exit 1; fi; \
	echo '✅ 部署完成！'

ios-device-deploy-release: build-save
	@echo '========================================'
	@echo '  iOS 真机部署 Release'
	@echo '========================================'
	@if [ -z "$(_IOS_DEVICE_ID)" ]; then echo '❌ 未检测到可用的 iOS 设备'; exit 1; fi; \
	echo "📱 目标设备: $(_IOS_DEVICE_ID)"; \
	echo '🔨 Step 1/2: Tauri iOS 构建 (Release)...'; \
	npx tauri ios build || { echo '❌ 构建失败'; exit 1; }; \
	echo '✅ 构建成功'; \
	echo '🚀 Step 2/2: 安装到设备...'; \
	ipa=$$(find src-tauri/gen/apple/build -name '*.ipa' -type f 2>/dev/null | head -1); \
	if [ -z "$$ipa" ]; then echo '❌ 找不到 IPA'; exit 1; fi; \
	xcrun devicectl device install app --device "$(_IOS_DEVICE_ID)" "$$ipa"; \
	echo '✅ 部署完成！'

ios-ipa-install:
	@if [ -z "$(IPA)" ]; then echo '用法: make ios-ipa-install IPA=/path/to/app.ipa'; exit 1; fi
	@if [ -z "$(_IOS_DEVICE_ID)" ]; then echo '❌ 未检测到可用的 iOS 设备'; exit 1; fi; \
	xcrun devicectl device install app --device "$(_IOS_DEVICE_ID)" "$(IPA)"

# ============================================================
# 发布
# ============================================================
release: check build-save
	@echo "$(GREEN)=== 构建桌面 Release (x86_64) ===$(NC)"
	npm run tauri build
	@echo "$(GREEN)=== 构建 iOS Release ===$(NC)"
	npm run tauri ios build
	@echo "$(GREEN)=== 发布完成 版本 $(VERSION) ===$(NC)"

release-arm64: build-save
	@echo "$(GREEN)=== 构建桌面 Release (arm64) ===$(NC)"
	@rustup target list --installed 2>/dev/null | grep -q aarch64-apple-darwin || (echo "$(YELLOW)⚠ 安装 arm64 target...$(NC)" && rustup target add aarch64-apple-darwin)
	npm run tauri build -- --target aarch64-apple-darwin
	@echo "$(GREEN)=== arm64 发布完成 版本 $(VERSION) ===$(NC)"

release-all: build-save
	@echo "$(GREEN)=== 构建桌面 Release (x86_64) ===$(NC)"
	npm run tauri build
	@echo "$(GREEN)=== 构建桌面 Release (arm64) ===$(NC)"
	@rustup target list --installed 2>/dev/null | grep -q aarch64-apple-darwin || (echo "$(YELLOW)⚠ 安装 arm64 target...$(NC)" && rustup target add aarch64-apple-darwin)
	npm run tauri build -- --target aarch64-apple-darwin
	@echo "$(GREEN)=== 构建 iOS Release ===$(NC)"
	npm run tauri ios build
	@echo "$(GREEN)=== 全部发布完成 版本 $(VERSION) ===$(NC)"
