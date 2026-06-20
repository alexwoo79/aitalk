.PHONY: dev build release check clean

# 开发模式
dev:
	npm run tauri dev

# 构建（前端 + Rust）
build:
	npm run tauri build

# 前端类型检查
check:
	npx vue-tsc --noEmit

# 仅构建前端
frontend:
	npm run build

# 清理构建产物
clean:
	rm -rf dist
	rm -rf src-tauri/target

# 安装依赖
install:
	npm install
