import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { setToolboxLocale } from './core/chart-options'
import './assets/main.css'

// Sync toolbox locale with i18n
setToolboxLocale(i18n.global.locale.value)
i18n.global.locale.value && setToolboxLocale(i18n.global.locale.value)

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)
// Watch locale changes for toolbox
import { watch } from 'vue'
watch(() => i18n.global.locale.value, (l: string) => setToolboxLocale(l))
app.mount('#app')
