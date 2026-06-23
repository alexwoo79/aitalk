/**
 * 图表下载 composable — 使用 Tauri 原生对话框保存 PNG/CSV
 */
import { save, message } from '@tauri-apps/plugin-dialog'
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs'

/** 从 ECharts option 提取 CSV 文本 */
function optionToCSV(opt: any): string {
  const series = opt.series || []
  const isPie = series[0]?.type === 'pie'
  if (isPie) {
    const data = series[0]?.data || []
    return '类别,数值\n' + data.map((d: any) => `"${d.name || ''}",${d.value ?? ''}`).join('\n')
  }
  const isScatter = series[0]?.type === 'scatter'
  if (isScatter) {
    const xName = opt.xAxis?.[0]?.name || 'X'
    const yName = opt.yAxis?.[0]?.name || 'Y'
    let csv = `序号,${xName},${yName},聚类\n`
    series.forEach((s: any) => {
      s.data?.forEach((pt: any, i: number) => {
        if (Array.isArray(pt)) csv += `${i + 1},${pt[0]},${pt[1]},${s.name || ''}\n`
      })
    })
    return csv
  }
  // Cartesian: xAxis/yAxis category data
  const xData = opt.xAxis?.[0]?.data || []
  const yData = opt.yAxis?.[0]?.data || []
  const catData = xData.length ? xData : yData
  let csv = '维度,' + series.map((s: any) => s.name || '').join(',') + '\n'
  catData.forEach((cat: string, i: number) => {
    csv += `"${cat}",` + series.map((s: any) => s.data?.[i] ?? '').join(',') + '\n'
  })
  return csv
}

export function useChartDownload() {
  async function downloadPNG(chartInstance: any) {
    try {
      // Canvas 渲染器不支持 SVG，用 3x 高清 PNG
      const dataUrl = chartInstance.getDataURL({ type: 'png', pixelRatio: 3, backgroundColor: '#fff' })
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const filePath = await save({
        defaultPath: `chart_${Date.now()}.png`,
        filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      })
      if (filePath) {
        await writeFile(filePath, bytes)
      }
    } catch (e: any) {
      await message(`保存失败: ${e?.message || e}`, { title: 'PNG 保存失败', kind: 'error' })
    }
  }

  async function downloadCSV(chartInstance: any, opt: any) {
    try {
      const csv = optionToCSV(opt)
      const filePath = await save({
        defaultPath: `chart_data_${Date.now()}.csv`,
        filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
      })
      if (filePath) {
        await writeTextFile(filePath, '\uFEFF' + csv) // BOM for Excel UTF-8
        await message(`已保存到:\n${filePath}`, { title: 'CSV 保存成功', kind: 'info' })
      }
    } catch (e: any) {
      await message(`保存失败: ${e?.message || e}`, { title: 'CSV 保存失败', kind: 'error' })
    }
  }

  return { downloadPNG, downloadCSV }
}
