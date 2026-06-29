/**
 * SmartBoard 程序版本号
 *
 * 从 package.json 读取版本号，供 UI 显示及保存报表时嵌入元数据。
 * 在非 Vite 环境（如 save 渲染器）中返回 undefined。
 */
import { ref, readonly } from 'vue'
import pkg from '@/../package.json'

export type VersionInfo = {
    /** 完整版本号，如 "0.1.0-628" */
    full: string
    /** 语义化版本，如 "0.1.0" */
    semver: string
    /** 构建号，如 "628"（可能为空） */
    build: string
}

function parseVersion(v: string): VersionInfo {
    const parts = v.split('-')
    return {
        full: v,
        semver: parts[0] || v,
        build: parts[1] || '',
    }
}

const rawVersion: string = (pkg as any).default?.version ?? (pkg as any).version ?? '0.0.0'
const versionInfo = ref<VersionInfo>(parseVersion(rawVersion))

export function useVersion() {
    return {
        version: readonly(versionInfo),
    }
}
