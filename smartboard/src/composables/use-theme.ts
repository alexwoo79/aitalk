import { ref, watchEffect } from 'vue'

const THEME_KEY = 'smartboard-theme'

const theme = ref<'light' | 'dark'>(
  (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light',
)

function applyTheme(t: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', t)
  localStorage.setItem(THEME_KEY, t)
}

watchEffect(() => applyTheme(theme.value))

export function useTheme() {
  function toggle() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
  }

  return { theme, toggle }
}
