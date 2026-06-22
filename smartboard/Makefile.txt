# ============================================================
#  Any Calculator — Tauri (Vue + Vite + Rust)  Makefile
# ============================================================

.PHONY: help typecheck check dev dev-android build build-debug build-android build-android-debug ios-rust ios-device-deploy ios-device-deploy-release ios-ipa-install release clean clean-rust clean-frontend clean-android clean-ios clean-all

help:
	@echo "Any Calculator — 可用目标:"
	@echo ""
	@echo "  代码检查:"
	@echo "    make typecheck         TypeScript 类型检查 (vue-tsc)"
	@echo "    make check             类型检查 + 前端构建 (快速验证)"
	@echo ""
	@echo "  开发调试:"
	@echo "    make dev              启动桌面开发模式 (热更新)"
	@echo "    make dev-android      启动 Android 开发模式"
	@echo ""
	@echo "  构建发布:"
	@echo "    make build            桌面 Release 构建 (macOS .dmg)"
	@echo "    make build-debug      桌面 Debug 构建"
	@echo "    make build-android    Android Release APK/AAB"
	@echo "    make build-android-debug  Android Debug (免签名)"
	@echo "    make release          一键发布 (check → 桌面 + Android + iOS)"
	@echo ""
	@echo "  iOS 专用:"
	@echo "    make ios-rust         仅编译 Rust → iOS (aarch64-apple-ios)"
	@echo ""
	@echo "  iOS 真机直连 (绕过 Xcode GUI，解决连接报错):"
	@echo "    make ios-device-deploy    ★ 一键构建+部署 (devicectl 原生)"
	@echo "    make ios-device-deploy-release  构建 Release + 部署到真机"
	@echo "    make ios-ipa-install IPA=path   将指定 IPA 安装到真机"
	@echo ""
	@echo "  清理:"
	@echo "    make clean            清理所有构建产物"
	@echo "    make clean-rust       清理 Rust target/"
	@echo "    make clean-frontend   清理前端 dist/ node_modules/"
	@echo "    make clean-android    清理 Android 构建产物"
	@echo "    make clean-ios        清理 iOS 构建产物 + Externals"
	@echo "    make clean-all        深度清理 (含 node_modules)"
	@echo ""

# ==================== 代码检查 ====================

typecheck:
	@echo "=== TypeScript 类型检查 ==="
	npx vue-tsc --noEmit
	@echo "=== 类型检查通过 ==="

check: typecheck
	@echo "=== 前端构建 (Vite) ==="
	npm run build
	@echo "=== 检查全部通过 ==="

# ==================== 开发调试 ====================

dev:
	npm run tauri dev

dev-android:
	npm run tauri android dev
ios-rust:
	cd src-tauri && cargo build --target aarch64-apple-ios --release -p calculator-tauri

build:
	npm run tauri build

build-debug:
	npm run tauri build -- --debug

# Android Release 构建（签名需在 src-tauri/gen/android/ 下配置 key.properties）
build-android:
	npm run tauri android build

build-android-debug:
	npm run tauri android build -- --debug

# ==================== iOS 真机直连 (绕过 Xcode GUI) ====================
# 核心思路:
#   构建: xcodebuild 命令行 (无需 Xcode GUI)
#   部署: devicectl (Apple CoreDevice 原生, 不需要 lockdown 配对)
#   备用: ios-deploy (传统 lockdown 方式, 需 Xcode 配对)

IOS_PROJ    := src-tauri/gen/apple/calculator-tauri.xcodeproj
IOS_SCHEME  := calculator-tauri_iOS
IOS_DST     := generic/platform=iOS
PROJ_ROOT   := $(CURDIR)
# === 一键构建+部署到真机 (devicectl) ===
# 构建: tauri ios build
# 部署: devicectl
ios-device-deploy:
	@echo "========================================"
	@echo "  iOS 真机部署 (xcodegen + xcodebuild + devicectl)"
	@echo "========================================"
	@DEV_LINE=$$(xcrun devicectl list devices 2>/dev/null | grep -iE 'iphone|ipad' | grep -v 'unavailable' | sort -r -t'(' -k2 | head -1); \
	if [ -z "$$DEV_LINE" ]; then \
		echo "❌ 未检测到可用的 iOS 设备"; \
		echo "   请: 1) 解锁设备  2) 插 USB  3) 信任此电脑"; \
		exit 1; \
	fi; \
	DEV_ID=$$(echo "$$DEV_LINE" | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' | head -1); \
	IS_IPHONE=$$(echo "$$DEV_LINE" | grep -qi 'iphone' && echo '📱' || echo '📟'); \
	IS_PAIRED=$$(echo "$$DEV_LINE" | grep -q "(paired)" && echo "yes" || echo "no"); \
	echo "$$IS_IPHONE 目标设备: $$DEV_ID"; \
	echo "🔐 配对状态: $$([ \"$$IS_PAIRED\" = \"yes\" ] && echo '✅ 已配对' || echo '❌ 未配对')"; \
	if [ "$$IS_PAIRED" = "no" ]; then \
		echo ""; \
		echo "⚠️  首次需要配对! 只需做一次:"; \
		echo "   1. 打开 Xcode → Window → Devices and Simulators"; \
		echo "   2. 解锁 iPhone, 插 USB, Xcode 会自动完成配对"; \
		echo "   3. 以后就可以永久使用 make ios-device-deploy 了"; \
		echo ""; \
		exit 1; \
	fi; \
	echo ""; \
	echo "🔨 Step 1/2: Tauri iOS 构建 (含前端+Rust+原生)..."; \
	cd $(PROJ_ROOT) && npx tauri ios build --debug 2>&1 | tail -15; \
	BUILD_EXIT=$$?; \
	if [ $$BUILD_EXIT -ne 0 ]; then \
		echo "❌ tauri ios build 失败 (退出码: $$BUILD_EXIT)"; \
		echo "尝试 xcodebuild 备用方案..."; \
		cd $(PROJ_ROOT)/src-tauri/gen/apple && \
		xcodebuild -project calculator-tauri.xcodeproj \
			-scheme calculator-tauri_iOS \
			-configuration Debug \
			-derivedDataPath build/DerivedData \
			-allowProvisioningUpdates \
			ENABLE_PREVIEWS=NO \
			build 2>&1 | tail -15; \
		BUILD_EXIT=$$?; \
		if [ $$BUILD_EXIT -ne 0 ]; then \
			echo "❌ xcodebuild 也失败"; \
			exit 1; \
		fi; \
	fi; \
	echo "✅ 构建成功"; \
	echo ""; \
	echo "🚀 安装到设备..."; \
	APP_PATH="$$(find $(PROJ_ROOT)/src-tauri/gen/apple/build -name '*.ipa' -maxdepth 3 2>/dev/null | head -1)"; \
	if [ -z "$$APP_PATH" ]; then \
		APP_PATH="$$(find $(PROJ_ROOT)/src-tauri/gen/apple/build/DerivedData/Build/Products -name '*.app' -maxdepth 3 -type d 2>/dev/null | head -1)"; \
	fi; \
	if [ -z "$$APP_PATH" ]; then \
		echo "❌ 找不到构建产物"; \
		exit 1; \
	fi; \
	echo "   产物: $$APP_PATH"; \
	xcrun devicectl device install app --device "$$DEV_ID" "$$APP_PATH"; \
	echo ""; \
	echo "========================================"; \
	echo "  ✅ 部署完成！App 已在设备上"

ios-device-deploy-release:
	@echo "========================================"
	@echo "  iOS 真机部署 Release (tauri build + devicectl)"
	@echo "========================================"
	@DEV_LINE=$$(xcrun devicectl list devices 2>/dev/null | grep -iE 'iphone|ipad' | grep -v 'unavailable' | sort -r -t'(' -k2 | head -1); \
	if [ -z "$$DEV_LINE" ]; then \
		echo "❌ 未检测到可用的 iOS 设备"; \
		exit 1; \
	fi; \
	DEV_ID=$$(echo "$$DEV_LINE" | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' | head -1); \
	IS_PAIRED=$$(echo "$$DEV_LINE" | grep -q "(paired)" && echo "yes" || echo "no"); \
	echo "📱 目标设备: $$DEV_ID ($$([ "$$IS_PAIRED" = "yes" ] && echo '已配对' || echo '未配对'))"; \
	if [ "$$IS_PAIRED" = "no" ]; then \
		echo ""; \
		echo "⚠️  首次需要配对! 只需做一次:"; \
		echo "   1. 打开 Xcode → Window → Devices and Simulators"; \
		echo "   2. 解锁 iPhone, 插 USB, Xcode 会自动完成配对"; \
		echo "   3. 以后就可以永久使用 make"; \
		echo ""; \
		exit 1; \
	fi; \
	echo "📱 设备已配对，开始构建..."; \
	echo ""; \
	echo "🔨 Step 1/2: Tauri iOS 构建 (Release)..."; \
	npx tauri ios build 2>&1 | tail -5; \
	BUILD_EXIT=$$?; \
	if [ $$BUILD_EXIT -ne 0 ]; then \
		echo "❌ 构建失败"; \
		exit 1; \
	fi; \
	echo "✅ 构建成功"; \
	echo ""; \
	echo "🚀 Step 2/2: devicectl 安装到设备..."; \
	IPA_PATH="$$(find $(PROJ_ROOT)/src-tauri/gen/apple/build -name '*.ipa' -maxdepth 3 | head -1)"; \
	if [ -z "$$IPA_PATH" ]; then \
		echo "❌ 找不到 IPA, 请确认构建成功"; \
		exit 1; \
	fi; \
	xcrun devicectl device install app --device "$$DEV_ID" "$$IPA_PATH"; \
	echo ""; \
	echo "========================================"; \
	echo "  ✅ 部署完成！"
	@echo "========================================"
ios-ipa-install:
	@if [ -z "$(IPA)" ]; then \
		echo "用法: make ios-ipa-install IPA=/path/to/app.ipa"; \
		exit 1; \
	fi
	@DEV_LINE=$$(xcrun devicectl list devices 2>/dev/null | grep -iE 'iphone|ipad' | grep -v 'unavailable' | head -1); \
	if [ -z "$$DEV_LINE" ]; then \
		echo "❌ 未检测到可用的 iOS 设备"; \
		exit 1; \
	fi; \
	DEV_ID=$$(echo "$$DEV_LINE" | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' | head -1); \
	echo "📦 安装 $(IPA) → $$DEV_ID..."; \
	xcrun devicectl device install app --device "$$DEV_ID" "$(IPA)"

# 一键发布：先检查再构建各平台
release: check
	@echo "=== 构建桌面 Release ==="
	npm run tauri build
	@echo "=== 构建 Android Release ==="
	npm run tauri android build
	@echo "=== 构建 iOS Release ==="
	npm run tauri ios build
	@echo "=== 发布完成 ==="

# ==================== 清理 ====================

clean: clean-rust clean-frontend clean-android clean-ios
	@echo "=== 构建产物已全部清理 ==="

clean-rust:
	@echo "=== 清理 Rust target/ ==="
	cd src-tauri && cargo clean

clean-frontend:
	@echo "=== 清理前端 ==="
	rm -rf dist/ dist-ssr/ .vite/ tsconfig.tsbuildinfo tsconfig.node.tsbuildinfo
	@echo "=== 前端清理完成 ==="

clean-android:
	@echo "=== 清理 Android 构建产物 ==="
	rm -rf src-tauri/gen/android/app/build/
	rm -rf src-tauri/gen/android/buildSrc/build/
	rm -rf src-tauri/gen/android/build/
	rm -rf src-tauri/gen/android/.gradle/
	rm -rf src-tauri/gen/android/.cxx/
	rm -rf src-tauri/gen/android/.tauri/

clean-ios:
	@echo "=== 清理 iOS 构建产物 ==="
	rm -rf src-tauri/gen/apple/build/
	rm -rf src-tauri/gen/apple/Externals/
	rm -rf src-tauri/gen/apple/calculator-tauri.xcodeproj/
	rm -rf src-tauri/gen/apple/calculator-tauri_iOS.xcworkspace/
	@echo "=== iOS 构建产物已清理 ==="

clean-all: clean
	@echo "=== 清理 node_modules/ ==="
	rm -rf node_modules/
	@echo "=== 深度清理完成，运行 npm install 恢复依赖 ==="
