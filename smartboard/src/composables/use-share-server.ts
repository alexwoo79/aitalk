// src/composables/use-share-server.ts
//
// 局域网分享服务器状态 — 模块级 ref，跨组件生命周期持久化

import { ref } from 'vue'

export interface ShareState {
  url: string
  port: number
  ip: string
}

/** 当前是否正在分享（模块级持久化，切换页面不丢失） */
export const shareServerInfo = ref<ShareState | null>(null)
export const shareServerUrl = ref('')
/** 分享快照的数据指纹，用于检测面板数据是否已变更 */
export const shareSnapshotFingerprint = ref('')
/** 分享时的面板名称（不随当前 spec 变化） */
export const shareSnapshotTitle = ref('')
