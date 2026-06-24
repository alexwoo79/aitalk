import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'upload',
      component: () => import('@/views/UploadView.vue'),
    },
    {
      path: '/config',
      name: 'config',
      component: () => import('@/views/ConfigView.vue'),
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    // CanvasTest 暂未就绪（依赖 vue3-grid-layout）
    // {
    //   path: '/canvas-test',
    //   name: 'canvasTest',
    //   component: () => import('@/views/CanvasTest.vue'),
    // },
  ],
})

export default router
