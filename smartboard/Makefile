# ============================================================
# SmartBoard Makefile
# Vue 3 + Vite + Tauri 2 (Rust) 项目构建脚本
# 兼容: Windows (cmd.exe) / macOS / Linux
# 用法: make [target]   (需安装 GNU Make for Windows)
# ============================================================

# ---- 辅助：检测操作系统 ----
IS_MACOS := $(shell uname -s | grep -qi darwin && echo 1 || echo 0)
IS_LINUX := $(shell uname -s | grep -qi linux && echo 1 || echo 0)
IS_WIN   := $(shell uname -s | grep -qi mingw\\|msys\\|cygwin && echo 1 || echo 0)

# ---- 辅助：调用 PowerShell 处理复杂操作 ----
_PS := powershell -NoProfile -Command

.PHONY: help dev build build-release check check-rust check-all \
        lint lint-rust fmt fmt-rust fmt-all \
        clean clean-all deep-clean \
        install update setup \
        frontend preview tauri-dev \
        diff size stats \
        ios-rust ios-device-deploy ios-device-deploy-release ios-ipa-install \
        release clean-ios

# ---- 颜色 (Windows cmd.exe 下 echo 不支持 ANSI，置空) ----
GREEN  :=
YELLOW :=
BLUE   :=
RED    :=
CYAN   :=
BOLD   :=
NC     :=

# ---- 默认目标 ----
.DEFAULT_GOAL := help

# ============================================================
# 帮助
# ============================================================
help: ## 📖 显示此帮助信息
	@echo.
	@echo ╔══════════════════════════════════════════════════════╗
	@echo ║           SmartBoard 构建命令                        ║
	@echo ╚══════════════════════════════════════════════════════╝
	@echo.
	@echo ── 开发 ────────────────────────────────────────────
	@echo   dev              启动开发模式（Vite HMR + Tauri 热重载）
	@echo   frontend         仅构建前端（Vite）
	@echo   preview          预览前端构建产物
	@echo.
	@echo ── 构建 ────────────────────────────────────────────
	@echo   build            完整构建（类型检查 + Vite + Rust debug）
	@echo   build-save       构建 standalone renderer（供 save 功能）
	@echo   build-release    发布构建（优化 + 剥离符号 + LTO）
	@echo.
	@echo ── 质量检查 ────────────────────────────────────────
	@echo   check            前端 TypeScript 类型检查
	@echo   check-rust       Rust 编译检查（不生成二进制）
	@echo   check-all        全部检查（前端 + Rust）
	@echo   lint             前端 ESLint 检查
	@echo   lint-rust        Rust Clippy 检查
	@echo   lint-all         全部 Lint
	@echo.
	@echo ── 代码风格 ────────────────────────────────────────
	@echo   fmt              格式化前端代码（Prettier）
	@echo   fmt-rust         格式化 Rust 代码（cargo fmt）
	@echo   fmt-all          格式化全部代码
	@echo.
	@echo ── 清理 ────────────────────────────────────────────
	@echo   clean            清理构建产物（保留 node_modules）
	@echo   clean-ios        清理 iOS 构建产物
	@echo   clean-all        深度清理（含 node_modules）
	@echo.
	@echo ── 依赖管理 ────────────────────────────────────────
	@echo   install          安装全部依赖
	@echo   update           更新全部依赖
	@echo   setup            首次初始化
	@echo.
	@echo ── 信息 ────────────────────────────────────────────
	@echo   diff             显示 git diff 统计
	@echo   size             显示构建产物大小
	@echo   stats            显示项目代码统计
	@echo.
	@echo ── iOS (仅 macOS) ──────────────────────────────────
	@echo   ios-rust         仅编译 Rust -^> iOS
	@echo   ios-device-deploy      构建+部署 Debug 到真机
	@echo   ios-device-deploy-release  构建+部署 Release 到真机
	@echo   ios-ipa-install  安装指定 IPA 到真机
	@echo.
	@echo ── 发布 ────────────────────────────────────────────
	@echo   release          一键发布 (x86_64 + iOS)
	@echo   release-arm64    构建桌面 arm64 发布包
	@echo   release-all      发布全部平台
	@echo   用法: make release VERSION=1.2.3
	@echo.

# ============================================================
# 开发
# ============================================================
dev: build-save ## 🚀 启动开发模式（Vite HMR + Tauri 热重载）
	@echo $(GREEN)▶ 启动 Tauri 开发模式...$(NC)
	npm run tauri dev

frontend: build-save ## 🎨 仅构建前端（Vite）
	@echo $(GREEN)▶ 构建前端...$(NC)
	npm run build

preview: ## 🔍 预览前端构建产物
	@echo $(GREEN)▶ 启动预览服务器...$(NC)
	npm run preview

tauri-dev: dev ## 🚀 同 dev，快捷别名

# ============================================================
# 构建
# ============================================================
build-save: ## 📦 构建 standalone renderer（供 save 功能使用）
	@echo $(GREEN)▶ 构建 save 渲染器...$(NC)
	npm run build:save

build: build-save ## 📦 完整构建（前端类型检查 + Vite + Rust debug）
	@echo $(GREEN)▶ 完整构建...$(NC)
	npm run tauri build

build-release: build-save ## 📦 发布构建（优化 + 剥离符号 + LTO）
	@echo $(GREEN)▶ 发布构建...$(NC)
	cd src-tauri && cargo build --release
	@echo $(YELLOW)📦 Release 产物: src-tauri\target\release\smartboard.exe$(NC)

# ============================================================
# iOS
# ============================================================
# ⚠️  APP_NAME 取自 Cargo.toml [package].name (小写)
#     tauri ios init 生成的 Xcode 项目/目标名基于此，而非 productName
# ---- 版本（可通过 make release VERSION=x.y.z 覆盖） ----
# 使用 cmd.exe 内置命令 / PowerShell 处理复杂逻辑
_VERSION_RAW := $(shell git describe --tags --always --dirty 2>nul & if errorlevel 1 echo 0.1.0)
_HAS_TAG     := $(shell $(_PS) "if ('$(_VERSION_RAW)' -match '^\d+\.\d+') { '1' } else { '0' }")
ifeq ($(_HAS_TAG),1)
VERSION ?= $(_VERSION_RAW)
else
VERSION ?= 0.1.0
endif
VERSION := $(VERSION)-$(shell $(_PS) "$$d=Get-Date; $$d.Month*100+$$d.Day")

# ---- 版本号设置/恢复 (使用 PowerShell 处理 JSON 正则替换) ----
define set_version
	@$(_PS) "Write-Host '$$( [char]27 )[0;34m🏷  设定版本: $(VERSION)$$( [char]27 )[0m'"
	@if exist src-tauri\tauri.conf.json \
		$(_PS) "$$c=Get-Content src-tauri\tauri.conf.json -Raw; Copy-Item src-tauri\tauri.conf.json src-tauri\tauri.conf.json.bak -Force; $$c=$$c -replace '\""version\"":\s*\""[^\""]*\""', '\""version\"": \""$(VERSION)\""'; Set-Content src-tauri\tauri.conf.json -Value $$c -NoNewline"
	@if exist package.json \
		$(_PS) "$$c=Get-Content package.json -Raw; Copy-Item package.json package.json.bak -Force; $$c=$$c -replace '\""version\"":\s*\""[^\""]*\""', '\""version\"": \""$(VERSION)\""'; Set-Content package.json -Value $$c -NoNewline"
endef

define restore_version
	@if exist src-tauri\tauri.conf.json.bak move /y src-tauri\tauri.conf.json.bak src-tauri\tauri.conf.json
	@if exist package.json.bak move /y package.json.bak package.json
endef

APP_NAME   := smartboard
IOS_PROJ   := src-tauri/gen/apple/$(APP_NAME).xcodeproj
IOS_SCHEME := $(APP_NAME)_iOS
IOS_DST    := generic/platform=iOS
PROJ_ROOT  := $(shell cd)

ios-rust: ## 🦀 仅编译 Rust → iOS (aarch64-apple-ios)
ifeq ($(IS_MACOS),1)
	@cd src-tauri && cargo build --target aarch64-apple-ios --release -p smartboard
else
	@echo "❌ iOS 构建仅支持 macOS"
endif

# === iOS 真机直连 (仅 macOS) ===
ios-device-deploy: ## 📱 一键构建 + 部署 Debug 到真机（仅 macOS）
ifeq ($(IS_MACOS),1)
	@echo '========================================'
	@echo '  iOS 真机部署 (tauri build + devicectl)'
	@echo '========================================'
	@devLine=$$(xcrun devicectl list devices 2>/dev/null | grep -i 'iphone\|ipad' | grep -v 'unavailable' | head -1); \
	if [ -z "$$devLine" ]; then echo '❌ 未检测到可用的 iOS 设备'; exit 1; fi; \
	devId=$$(echo "$$devLine" | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' | head -1); \
	echo "📱 目标设备: $$devId"; \
	if echo "$$devLine" | grep -qi 'paired'; then echo '🔐 ✅ 已配对'; else echo '🔐 ❌ 未配对 - 请在 Xcode → Window → Devices and Simulators 中配对'; exit 1; fi; \
	echo '🔨 Step 1/2: Tauri iOS 构建 (Debug)...'; \
	npx tauri ios build --debug || { echo '❌ tauri ios build 失败'; exit 1; }; \
	echo '✅ 构建成功'; \
	echo '🚀 Step 2/2: 安装到设备...'; \
	ipa=$$(find src-tauri/gen/apple/build -name '*.ipa' -type f 2>/dev/null | head -1); \
	if [ -z "$$ipa" ]; then app=$$(find src-tauri/gen/apple/build -name '*.app' -type d 2>/dev/null | head -1); fi; \
	if [ -n "$$ipa" ]; then xcrun devicectl device install app --device "$$devId" "$$ipa"; \
	elif [ -n "$$app" ]; then xcrun devicectl device install app --device "$$devId" "$$app"; \
	else echo '❌ 找不到构建产物'; exit 1; fi; \
	echo '✅ 部署完成！App 已在设备上'
else
	@echo "❌ iOS 部署仅支持 macOS"
endif

ios-device-deploy-release: ## 📱 一键构建 Release + 部署到真机（仅 macOS）
ifeq ($(IS_MACOS),1)
	@echo '========================================'
	@echo '  iOS 真机部署 Release'
	@echo '========================================'
	@devLine=$$(xcrun devicectl list devices 2>/dev/null | grep -i 'iphone\|ipad' | grep -v 'unavailable' | head -1); \
	if [ -z "$$devLine" ]; then echo '❌ 未检测到可用的 iOS 设备'; exit 1; fi; \
	devId=$$(echo "$$devLine" | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' | head -1); \
	echo "📱 目标设备: $$devId"; \
	if echo "$$devLine" | grep -qi 'paired'; then echo '🔐 ✅ 已配对'; else echo '🔐 ❌ 未配对 - 请在 Xcode → Window → Devices and Simulators 中配对'; exit 1; fi; \
	echo '🔨 Step 1/2: Tauri iOS 构建 (Release)...'; \
	npx tauri ios build || { echo '❌ tauri ios build 失败'; exit 1; }; \
	echo '✅ 构建成功'; \
	echo '🚀 Step 2/2: 安装到设备...'; \
	ipa=$$(find src-tauri/gen/apple/build -name '*.ipa' -type f 2>/dev/null | head -1); \
	if [ -z "$$ipa" ]; then echo '❌ 找不到 IPA'; exit 1; fi; \
	xcrun devicectl device install app --device "$$devId" "$$ipa"; \
	echo '✅ 部署完成！'
else
	@echo "❌ iOS 部署仅支持 macOS"
endif

ios-ipa-install: ## 📦 将指定 IPA 安装到真机（仅 macOS; 用法: make ios-ipa-install IPA=/path/to/app.ipa）
ifeq ($(IS_MACOS),1)
	@if [ -z "$(IPA)" ]; then echo '用法: make ios-ipa-install IPA=/path/to/app.ipa'; exit 1; fi
	@devLine=$$(xcrun devicectl list devices 2>/dev/null | grep -i 'iphone\|ipad' | grep -v 'unavailable' | head -1); \
	if [ -z "$$devLine" ]; then echo '❌ 未检测到可用的 iOS 设备'; exit 1; fi; \
	devId=$$(echo "$$devLine" | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' | head -1); \
	xcrun devicectl device install app --device "$$devId" "$(IPA)"
else
	@echo "❌ iOS 部署仅支持 macOS"
endif

# ============================================================
# 发布
# ============================================================
release: check build-save ## 🚀 一键发布 (check → 桌面 x86_64 + iOS)
	$(call set_version)
	@echo === 构建桌面 Release (x86_64) ===
	npm run tauri build
	@echo === 构建 iOS Release ===
	npm run tauri ios build
	$(call restore_version)
	@echo === 发布完成 版本 $(VERSION) ===

release-arm64: build-save ## 🍎 构建桌面 arm64 (Apple Silicon) 发布包
	$(call set_version)
	@echo === 构建桌面 Release (arm64) ===
	@rustup target list --installed | findstr "aarch64-apple-darwin" >nul || (echo ⚠ 未安装 arm64 target，正在安装... & rustup target add aarch64-apple-darwin)
	npm run tauri build -- --target aarch64-apple-darwin
	$(call restore_version)
	@echo === arm64 发布完成 版本 $(VERSION) ===

release-all: build-save ## 🚀 发布全部平台 (x86_64 + arm64 + iOS)
	$(call set_version)
	@echo === 构建桌面 Release (x86_64) ===
	npm run tauri build
	@echo === 构建桌面 Release (arm64) ===
	@rustup target list --installed | findstr "aarch64-apple-darwin" >nul || (echo ⚠ 未安装 arm64 target，正在安装... & rustup target add aarch64-apple-darwin)
	npm run tauri build -- --target aarch64-apple-darwin
	@echo === 构建 iOS Release ===
	npm run tauri ios build
	$(call restore_version)
	@echo === 全部发布完成 版本 $(VERSION) ===

# ============================================================
# 质量检查
# ============================================================
check: build-save ## ✅ 前端 TypeScript 类型检查
	@echo $(GREEN)▶ Vue TypeScript 类型检查...$(NC)
	npx vue-tsc --noEmit

check-rust: ## 🦀 Rust 类型/编译检查（不生成二进制）
	@echo $(GREEN)▶ Cargo check...$(NC)
	cd src-tauri && cargo check

check-all: check check-rust ## ✅ 全部检查（前端 + Rust）

lint: ## 🔍 前端 ESLint 检查
	@echo $(GREEN)▶ ESLint...$(NC)
	@if exist node_modules\.bin\eslint (npx eslint src/ --ext .ts,.vue) else (echo $(YELLOW)⚠ ESLint 未安装，跳过$(NC))

lint-rust: ## 🦀 Rust Clippy 检查
	@echo $(GREEN)▶ Clippy...$(NC)
	cd src-tauri && cargo clippy -- -D warnings

lint-all: lint lint-rust ## 🔍 全部 Lint（前端 + Rust）

# ============================================================
# 代码风格
# ============================================================
fmt: ## 🎨 格式化前端代码（Prettier）
	@echo $(GREEN)▶ Prettier 格式化...$(NC)
	@if exist node_modules\.bin\prettier (npx prettier --write "src/**/*.{ts,vue,css}") else (echo $(YELLOW)⚠ Prettier 未安装，跳过$(NC))

fmt-rust: ## 🦀 格式化 Rust 代码（cargo fmt）
	@echo $(GREEN)▶ Cargo fmt...$(NC)
	cd src-tauri && cargo fmt

fmt-all: fmt fmt-rust ## 🎨 格式化全部代码（前端 + Rust）

# ============================================================
# 清理
# ============================================================
clean: ## 🧹 清理构建产物（保留 node_modules）
	@echo $(GREEN)▶ 清理构建产物...$(NC)
	@if exist dist rmdir /s /q dist
	@if exist src-tauri\target rmdir /s /q src-tauri\target
	@echo $(GREEN)✅ 清理完成$(NC)

clean-ios: ## 🧹 清理 iOS 构建产物
	@echo $(GREEN)▶ 清理 iOS 构建产物...$(NC)
	@if exist src-tauri\gen\apple\build rmdir /s /q src-tauri\gen\apple\build
	@if exist src-tauri\gen\apple\Externals rmdir /s /q src-tauri\gen\apple\Externals
	@echo $(GREEN)✅ iOS 清理完成$(NC)

clean-all: clean clean-ios ## 🧹 深度清理（含 node_modules）
	@echo $(GREEN)▶ 深度清理...$(NC)
	@if exist node_modules rmdir /s /q node_modules
	@echo $(YELLOW)⚠ node_modules 已删除，请运行 make install 重新安装$(NC)

deep-clean: clean-all ## 🧹 同 clean-all

# ============================================================
# 依赖管理
# ============================================================
install: ## 📥 安装全部依赖（npm + Cargo 自动处理）
	@echo $(GREEN)▶ 安装前端依赖...$(NC)
	npm install
	@echo $(GREEN)✅ 依赖安装完成（Cargo 依赖在首次构建时自动下载）$(NC)

update: ## 🔄 更新全部依赖到最新兼容版本
	@echo $(GREEN)▶ 更新前端依赖...$(NC)
	npm update
	@echo $(GREEN)▶ 更新 Rust 依赖...$(NC)
	cd src-tauri && cargo update
	@echo $(GREEN)✅ 依赖更新完成$(NC)

setup: install ## 🏗️ 首次初始化（安装依赖 + 类型检查）
	@echo $(GREEN)▶ 运行类型检查...$(NC)
	@npx vue-tsc --noEmit || echo $(YELLOW)⚠ 类型检查有警告，正常$(NC)
	@echo.
	@echo $(BOLD)$(GREEN)✅ SmartBoard 初始化完成！$(NC)
	@echo $(CYAN)   运行 make dev 启动开发模式$(NC)

# ============================================================
# 信息
# ============================================================
diff: ## 📊 显示未提交的 git diff 统计
	@git diff --stat 2>nul || echo $(YELLOW)非 git 仓库或无变更$(NC)

size: ## 📏 显示构建产物大小
	@echo $(BOLD)📏 构建产物大小$(NC)
	@echo ──────────────────────────────
	@$(_PS) "function Get-Size($$p) { \
		if (Test-Path $$p) { \
			$$bytes = (Get-ChildItem -Path $$p -Recurse -File -EA SilentlyContinue | Measure-Object -Property Length -Sum).Sum; \
			if ($$bytes -gt 1GB) { '{0:N1} GB' -f ($$bytes/1GB) } \
			elseif ($$bytes -gt 1MB) { '{0:N1} MB' -f ($$bytes/1MB) } \
			else { '{0:N1} KB' -f ($$bytes/1KB) } \
		} else { '(未构建)' } }; \
		Write-Host ('dist:           ' + (Get-Size dist)); \
		Write-Host ('target/debug:   ' + (Get-Size src-tauri/target/debug)); \
		Write-Host ('target/release: ' + (Get-Size src-tauri/target/release)); \
		Write-Host ('node_modules:   ' + (Get-Size node_modules))"

stats: ## 📈 显示项目代码统计
	@echo $(BOLD)📈 代码统计$(NC)
	@echo ──────────────────────────────
	@$(_PS) "$$vue  = if (Test-Path src) { (Get-ChildItem -Path src -Recurse -Filter *.vue -File -EA SilentlyContinue).Count } else { 0 }; \
		$$ts   = if (Test-Path src) { (Get-ChildItem -Path src -Recurse -Filter *.ts  -File -EA SilentlyContinue).Count } else { 0 }; \
		$$css  = if (Test-Path src) { (Get-ChildItem -Path src -Recurse -Filter *.css -File -EA SilentlyContinue).Count } else { 0 }; \
		$$rust = if (Test-Path src-tauri/src) { (Get-ChildItem -Path src-tauri/src -Recurse -Filter *.rs -File -EA SilentlyContinue).Count } else { 0 }; \
		Write-Host ('Vue 组件:   ' + $$vue); \
		Write-Host ('TypeScript: ' + $$ts); \
		Write-Host ('CSS:        ' + $$css); \
		Write-Host ('Rust:       ' + $$rust); \
		Write-Host '──────────────────────────────'; \
		$$lines = 0; \
		Get-ChildItem -Path src,src-tauri/src -Recurse -Include *.vue,*.ts,*.css,*.rs -File -EA SilentlyContinue | ForEach-Object { \
			$$lines += (Get-Content $$_.FullName | Measure-Object -Line).Lines \
		}; \
		Write-Host ('总行数:     ' + $$lines)"

