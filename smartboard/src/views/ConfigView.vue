<template>
  <div class="config-view">
    <div v-if="!dataStore.dataSet" class="no-data">
      <p>{{ t('config.noData') }}</p>
      <button class="btn btn-sm btn-primary" @click="$router.push('/')">{{ t('config.backToUpload') }}</button>
    </div>

    <template v-else>
      <div class="config-header">
        <div class="config-header-top">
          <button class="btn btn-sm btn-ghost" @click="$router.push('/')">← {{ t('config.backToUpload') }}</button>
          <h2>{{ t('config.title') }}</h2>
          <div class="header-actions">
            <button class="btn btn-sm btn-save" :class="{ saved: allSaved }" @click="configStore.saveAll()">{{ allSaved
              ? t('config.saved') : t('config.saveAll') }}</button>
            <button class="btn btn-sm btn-reset-sec" @click="configStore.resetAllToAuto()">↺ 全部重置</button>
          </div>
        </div>
        <p class="subtitle">{{ t('config.hint') }}</p>
      </div>

      <div class="config-layout">
        <!-- 左侧：配置面板 -->
        <div class="config-panel">
          <!-- 标题 -->
          <section class="config-section">
            <div class="section-header-row">
              <h3>{{ t('config.dashboardTitle') }}</h3>
              <div class="section-actions">
                <button class="btn btn-sm btn-save" :class="{ saved: configStore.isSectionSaved('title') }"
                  @click="configStore.saveSection('title')">{{ configStore.isSectionSaved('title') ? '✅' : '💾'
                  }}</button>
                <button class="btn btn-sm btn-reset-sec" @click="configStore.resetSectionToAuto('title')">↺</button>
              </div>
            </div>
            <input v-model="configStore.config.title" class="input" :placeholder="t('config.titlePlaceholder')" />
          </section>

          <!-- {{ t('config.filters') }} -->
          <section class="config-section">
            <div class="section-header-row">
              <h3>{{ t('config.filters') }} ({{ configStore.config.filters.length }})</h3>
              <div class="section-actions">
                <button class="btn btn-sm btn-save" :class="{ saved: configStore.isSectionSaved('filters') }"
                  @click="configStore.saveSection('filters')">{{ configStore.isSectionSaved('filters') ? '✅' : '💾'
                  }}</button>
                <button class="btn btn-sm btn-reset-sec" @click="configStore.resetSectionToAuto('filters')">↺</button>
              </div>
            </div>
            <div class="filter-chips">
              <label v-for="col in dimensionCols" :key="col" class="chip"
                :class="{ active: configStore.config.filters.includes(col) }">
                <input type="checkbox" :checked="configStore.config.filters.includes(col)"
                  @change="configStore.toggleFilter(col)" hidden />
                {{ col }}
              </label>
            </div>
          </section>

          <!-- 全局指标格式默认值 -->
          <section class="config-section">
            <div class="section-header-row">
              <h3>{{ t('config.globalMetricFormat') }}</h3>
              <div class="section-actions">
                <button class="btn btn-sm btn-save" :class="{ saved: configStore.isSectionSaved('metricDefaults') }"
                  @click="saveMetricDefaults">{{ configStore.isSectionSaved('metricDefaults') ? '✅' : '💾' }}</button>
                <button class="btn btn-sm btn-reset-sec" @click="resetMetricDefaults">↺</button>
              </div>
            </div>
            <p class="sec-desc">{{ t('config.globalMetricHint') }}</p>
            <div class="metric-defaults-table">
              <div class="md-header">
                <span class="md-col-name">指标列</span>
                <span class="md-col-fmt">格式</span>
                <span class="md-col-unit">单位</span>
                <span class="md-col-prefix">前缀</span>
                <span class="md-col-dec">小数位</span>
                <span class="md-col-cb"><label>KPI</label></span>
                <span class="md-col-cb"><label>{{ t('config.sections.chart') }}</label></span>
                <span class="md-col-cb"><label>{{ t('config.sections.table') }}</label></span>
              </div>
              <div v-for="col in allMetricCols" :key="col" class="md-row">
                <span class="md-col-name">{{ col }}</span>
                <select v-model="metricDefaultsForm[col].format" class="input input-sm md-sel">
                  <option value="">{{ t('config.formatOptions.unset') }}</option>
                  <option value="number">{{ t('config.formatOptions.number') }}</option>
                  <option value="integer">{{ t('config.formatOptions.integer') }}</option>
                  <option value="percent">{{ t('config.formatOptions.percent') }}</option>
                  <option value="currency">{{ t('config.formatOptions.currency') }}</option>
                </select>
                <select v-if="metricDefaultsForm[col].format === 'currency'" v-model="metricDefaultsForm[col].unit"
                  class="input input-sm md-sel">
                  <option value="yuan">{{ t('config.unitOptions.yuan') }}</option>
                  <option value="wan">{{ t('config.unitOptions.wan') }}</option>
                  <option value="yi">{{ t('config.unitOptions.yi') }}</option>
                </select>
                <span v-else class="md-na">—</span>
                <select v-if="metricDefaultsForm[col].format === 'currency'" v-model="metricDefaultsForm[col].prefix"
                  class="input input-sm md-sel">
                  <option value="">{{ t('common.none') }}</option>
                  <option value="¥">¥</option>
                  <option value="$">$</option>
                  <option value="€">€</option>
                  <option value="£">£</option>
                </select>
                <span v-else class="md-na">—</span>
                <input v-model.number="metricDefaultsForm[col].decimals" type="number" class="input input-sm md-dec"
                  min="0" max="6" step="1" />
                <label class="md-cb" :class="{ active: hasSection(col, 'kpi') }">
                  <input type="checkbox" :checked="hasSection(col, 'kpi')" @change="toggleSection(col, 'kpi')" />
                </label>
                <label class="md-cb" :class="{ active: hasSection(col, 'chart') }">
                  <input type="checkbox" :checked="hasSection(col, 'chart')" @change="toggleSection(col, 'chart')" />
                </label>
                <label class="md-cb" :class="{ active: hasSection(col, 'table') }">
                  <input type="checkbox" :checked="hasSection(col, 'table')" @change="toggleSection(col, 'table')" />
                </label>
              </div>
            </div>
          </section>

          <!-- KPI 卡片 -->
          <section class="config-section">
            <div class="section-header-row">
              <h3>KPI 卡片 ({{ configStore.config.kpis.length }}) <span class="drag-hint">⋮⋮ 拖拽排序</span></h3>
              <div class="section-actions">
                <button class="btn btn-sm btn-save" :class="{ saved: configStore.isSectionSaved('kpis') }"
                  @click="configStore.saveSection('kpis')">{{ configStore.isSectionSaved('kpis') ? '✅' : '💾'
                  }}</button>
                <button class="btn btn-sm btn-reset-sec" @click="configStore.resetSectionToAuto('kpis')">↺</button>
              </div>
            </div>
            <div class="kpi-list" data-drag-list="kpi">
              <div v-for="(kpi, i) in configStore.config.kpis" :key="i" class="kpi-item" :data-drag-idx="i"
                :class="{ 'drag-placeholder': dragPlaceholder === i && dragList === 'kpi' }">
                <span class="drag-handle" title="拖拽排序" @pointerdown.prevent="onPointerDown($event, i, 'kpi')">⋮⋮</span>
                <div class="kpi-item-main">
                  <div class="kpi-item-row">
                    <span class="kpi-item-label">{{ kpi.label }}</span>
                    <span v-if="kpi.formula" class="kpi-formula-tag">公式</span>
                    <span v-else class="kpi-col-tag">{{ kpi.column }}</span>
                    <span class="kpi-agg-tag">{{ aggLabel(kpi.agg) }}</span>
                    <span v-if="kpi.filter" class="kpi-filter-tag" :title="kpi.filter">筛选</span>
                    <button class="btn-icon" @click="openEditKpi(i)" title="编辑">✎</button>
                    <button class="btn-icon" @click="configStore.removeKpi(i)" title="移除">✕</button>
                  </div>
                </div>
              </div>
            </div>
            <button class="btn btn-sm btn-add" @click="openAddKpi">+ 添加KPI卡片</button>
          </section>

          <!-- 图表块 -->
          <section class="config-section">
            <div class="section-header-row">
              <h3>图表 ({{ configStore.config.charts.length }}) <span class="drag-hint">⋮⋮ 拖拽排序</span></h3>
              <div class="section-actions">
                <button class="btn btn-sm btn-save" :class="{ saved: configStore.isSectionSaved('charts') }"
                  @click="configStore.saveSection('charts')">{{ configStore.isSectionSaved('charts') ? '✅' : '💾'
                  }}</button>
                <button class="btn btn-sm btn-reset-sec" @click="configStore.resetSectionToAuto('charts')">↺</button>
              </div>
            </div>
            <div class="chart-list" data-drag-list="chart">
              <div v-for="(chart, ci) in configStore.config.charts" :key="chart.id" class="chart-item"
                :data-drag-idx="ci" :class="{ 'drag-placeholder': dragPlaceholder === ci && dragList === 'chart' }">
                <span class="drag-handle" title="拖拽排序"
                  @pointerdown.prevent="onPointerDown($event, ci, 'chart')">⋮⋮</span>
                <div class="chart-item-body">
                  <div class="chart-item-header">
                    <span class="chart-type-badge">{{ chartTypeLabel(chart.type) }}</span>
                    <span class="chart-title">{{ chart.title }}</span>
                    <button class="btn-icon" @click="openEditChart(chart)" title="编辑">✎</button>
                    <button class="btn-icon" @click="configStore.removeChart(chart.id)" title="移除">✕</button>
                  </div>
                  <div class="chart-item-detail">
                    <span v-if="chart.dimension">维度: {{ chart.dimension }}</span>
                    <span v-if="chart.metrics?.length">指标: {{ chart.metrics.join(', ') }}</span>
                    <span v-if="chart.metric && !chart.metrics?.length">指标: {{ chart.metric }}</span>
                    <span v-if="chart.dateColumn">日期: {{ chart.dateColumn }}</span>
                    <span v-if="chart.k">K: {{ chart.k }}</span>
                  </div>
                </div>
              </div>
            </div>
            <button class="btn btn-sm btn-add" @click="openAddChart">+ 添加图表</button>
          </section>

          <!-- 表格配置 -->
          <section class="config-section">
            <div class="section-header-row">
              <h3>数据表</h3>
              <div class="section-actions">
                <button class="btn btn-sm btn-save" :class="{ saved: configStore.isSectionSaved('table') }"
                  @click="configStore.saveSection('table')">{{ configStore.isSectionSaved('table') ? '✅' : '💾'
                  }}</button>
                <button class="btn btn-sm btn-reset-sec" @click="configStore.resetSectionToAuto('table')">↺</button>
              </div>
            </div>
            <div class="table-config-row">
              <label>排序列</label>
              <select v-model="configStore.config.table.sortBy" class="input select-sm">
                <option v-for="col in numericCols" :key="col" :value="col">{{ col }}</option>
              </select>
              <label>行数</label>
              <input type="number" v-model.number="configStore.config.table.topN" class="input input-sm" min="5"
                max="500" />
            </div>
            <div class="table-col-header">
              <span>显示列 ({{ configStore.config.table.columns.length }}/{{ allHeaders.length }})</span>
              <button class="btn-link" @click="configStore.config.table.columns = allHeaders.slice()">全选</button>
              <button class="btn-link" @click="configStore.config.table.columns = []">清空</button>
            </div>
            <div class="filter-chips">
              <label v-for="col in allHeaders" :key="col" class="chip"
                :class="{ active: configStore.config.table.columns.includes(col) }">
                <input type="checkbox" :checked="configStore.config.table.columns.includes(col)"
                  @change="configStore.toggleTableColumn(col)" hidden />
                {{ col }}
              </label>
            </div>
          </section>
        </div>

        <!-- 右侧：预览 -->
        <div class="config-preview">
          <div class="preview-card">
            <h3>预览</h3>
            <div class="preview-stats">
              <div class="stat-item">
                <span class="stat-label">KPI 卡片</span>
                <span class="stat-value">{{ configStore.config.kpis.length }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">{{ t('config.filters') }}</span>
                <span class="stat-value">{{ configStore.config.filters.length }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">图表</span>
                <span class="stat-value">{{ configStore.config.charts.length }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">数据行</span>
                <span class="stat-value">{{ dataStore.dataSet.rows.length }}</span>
              </div>
            </div>
            <button class="btn btn-primary" @click="goToDashboard">
              生成 Dashboard →
            </button>
            <div class="save-status" v-if="allSaved">✅ 全部已保存，切换页面不会丢失</div>
            <div class="save-status unsaved" v-else>⚠️ 已保存 {{ savedCount }}/5 区域，修改后按钮自动恢复 💾</div>
          </div>
        </div>
      </div>
    </template>

    <!-- KPI 编辑器弹窗 -->
    <Teleport to="body">
      <div v-if="showKpiEditor" class="modal-overlay" @click.self="cancelKpiEdit">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>{{ editingKpiIdx >= 0 ? '编辑KPI卡片' : '新增KPI卡片' }}</h3>
            <button class="btn-icon" @click="cancelKpiEdit">✕</button>
          </div>
          <div class="modal-body">
            <!-- 模式切换 -->
            <div class="kpi-mode-toggle">
              <button class="period-btn" :class="{ active: !kpiForm.useFormula }"
                @click="kpiForm.useFormula = false">单列</button>
              <button class="period-btn" :class="{ active: kpiForm.useFormula }"
                @click="kpiForm.useFormula = true">公式组合</button>
            </div>

            <!-- 单列模式 -->
            <template v-if="!kpiForm.useFormula">
              <div class="editor-grid">
                <label>指标列</label>
                <select v-model="kpiForm.column" class="input select-sm">
                  <option value="">选择指标列...</option>
                  <option v-for="col in allNumericCols" :key="col" :value="col">{{ col }}</option>
                </select>
                <label>标签</label>
                <input v-model="kpiForm.label" class="input" placeholder="KPI显示标签" />
                <label>聚合方式</label>
                <select v-model="kpiForm.agg" class="input select-sm">
                  <option v-for="opt in KPI_AGG_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
                <label>筛选(可选)</label>
                <div class="filter-wrap">
                  <input v-model="kpiForm.filter" class="input" placeholder="留空=全部" list="filter-cols" />
                  <datalist id="filter-cols">
                    <template v-for="col in filterableColumns" :key="col">
                      <option :value="col + ' = '" />
                      <option :value="col + ' != '" />
                      <option v-if="isNumericCol(col)" :value="col + ' > '" />
                      <option v-if="isNumericCol(col)" :value="col + ' < '" />
                      <option v-if="!isNumericCol(col)" :value="col + ' in '" />
                      <option v-if="!isNumericCol(col)" :value="col + ' ~ '" />
                    </template>
                  </datalist>
                  <span class="filter-hint">格式: 列名 运算符 值。& = AND，| = OR。in = 在列表中，~ = 含有。输入列名时自动补全</span>
                </div>
              </div>
            </template>

            <!-- 公式模式 -->
            <template v-else>
              <div class="formula-section">
                <div class="formula-label">变量定义</div>
                <div v-for="(v, vi) in kpiForm.variables" :key="vi" class="formula-var-row">
                  <span class="var-index">[{{ vi }}]</span>
                  <select v-model="v.column" class="input input-sm" style="flex:1">
                    <option value="">选择列...</option>
                    <option v-for="col in allNumericCols" :key="col" :value="col">{{ col }}</option>
                  </select>
                  <select v-model="v.agg" class="input input-sm" style="width:72px">
                    <option value="sum">求和</option>
                    <option value="avg">均值</option>
                    <option value="count">计数</option>
                    <option value="min">最小</option>
                    <option value="max">最大</option>
                  </select>
                  <input v-model="v.filter" class="input input-sm formula-filter" placeholder="列筛选"
                    list="filter-cols-formula" />
                  <button v-if="kpiForm.variables.length > 1" class="btn-icon" @click="kpiForm.variables.splice(vi, 1)"
                    title="移除">✕</button>
                </div>
                <button class="btn btn-sm" @click="addVariable" style="margin-bottom:12px">+ 添加变量</button>

                <div class="formula-label">共享筛选 <span class="formula-hint">叠加在变量筛选之上</span></div>
                <div class="filter-wrap">
                  <input v-model="kpiForm.filter" class="input" placeholder="留空=全部" list="filter-cols-formula" />
                  <datalist id="filter-cols-formula">
                    <template v-for="col in filterableColumns" :key="col">
                      <option :value="col + ' = '" />
                      <option :value="col + ' != '" />
                      <option v-if="isNumericCol(col)" :value="col + ' > '" />
                      <option v-if="isNumericCol(col)" :value="col + ' < '" />
                      <option v-if="!isNumericCol(col)" :value="col + ' in '" />
                      <option v-if="!isNumericCol(col)" :value="col + ' ~ '" />
                    </template>
                  </datalist>
                  <span class="filter-hint">格式: 列名 运算符 值。& = AND，| = OR。将叠加到每个变量的列筛选之上</span>
                </div>

                <div class="formula-label">运算表达式 <span class="formula-hint">双击变量名插入</span></div>
                <div class="formula-btns">
                  <button v-for="vi in kpiForm.variables.length" :key="vi" class="period-btn"
                    @click="insertVar(vi - 1)">[{{ vi - 1
                    }}]</button>
                  <span class="toggle-sep" style="margin:0 4px"></span>
                  <button class="period-btn" @click="insertOp('+')">+</button>
                  <button class="period-btn" @click="insertOp('-')">−</button>
                  <button class="period-btn" @click="insertOp('*')">×</button>
                  <button class="period-btn" @click="insertOp('/')">÷</button>
                  <button class="period-btn" @click="insertOp('(')">(</button>
                  <button class="period-btn" @click="insertOp(')')">)</button>
                </div>
                <input v-model="kpiForm.expression" class="input formula-input"
                  placeholder="如: [0] + [1]  或  ([0] - [1]) / [0] * 100" />
              </div>
              <div class="editor-grid" style="margin-top:12px">
                <label>标签</label>
                <input v-model="kpiForm.label" class="input" placeholder="KPI显示标签" />
              </div>
            </template>

            <!-- 公共设置 -->
            <div class="editor-grid" style="margin-top:12px">
              <label>数字格式</label>
              <select v-model="kpiForm.format" class="input select-sm">
                <option v-for="opt in KPI_FORMAT_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <template v-if="kpiForm.format === 'currency'">
                <label>前缀</label>
                <input v-model="kpiForm.prefix" class="input input-sm" placeholder="¥" maxlength="4" />
                <label>单位</label>
                <select v-model="kpiForm.unit" class="input select-sm">
                  <option value="yuan">{{ t('config.unitOptions.yuan') }}</option>
                  <option value="wan">{{ t('config.unitOptions.wan') }}</option>
                  <option value="yi">{{ t('config.unitOptions.yi') }}</option>
                </select>
              </template>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" @click="saveKpi" :disabled="!canSaveKpi">保存</button>
            <button class="btn" @click="cancelKpiEdit">取消</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 图表编辑器弹窗 -->
    <Teleport to="body">
      <div v-if="showChartEditor" class="modal-overlay" @click.self="cancelChartEdit">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>{{ editingChartId ? '编辑图表' : '新增图表' }}</h3>
            <button class="btn-icon" @click="cancelChartEdit">✕</button>
          </div>
          <div class="modal-body">
            <div class="editor-grid">
              <label>类型</label>
              <select v-model="chartForm.type" class="input select-sm">
                <option v-for="opt in CHART_TYPES" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <label>标题</label>
              <input v-model="chartForm.title" class="input" placeholder="图表标题，支持 {metric} / {metrics} 动态替换" />

              <template v-if="isBasicChart(chartForm.type)">
                <label>维度</label>
                <select v-model="chartForm.dimension" class="input select-sm">
                  <option value="">(无)</option>
                  <option v-for="col in dimensionCols" :key="col" :value="col">{{ col }}</option>
                </select>
                <label>指标</label>
                <div class="metric-chips">
                  <label v-for="col in allMetricCols" :key="col" class="chip sm"
                    :class="{ active: chartForm.metrics.includes(col) }">
                    <input type="checkbox" :checked="chartForm.metrics.includes(col)" @change="toggleChartMetric(col)"
                      hidden />
                    {{ col }}
                  </label>
                </div>
                <div v-if="chartForm.metrics.length > 0" class="metric-formats">
                  <div class="mf-title">各指标聚合</div>
                  <div v-for="m in chartForm.metrics" :key="m" class="mf-row">
                    <span class="mf-name">{{ m }}</span>
                    <select v-model="chartForm.metricAggs[m]" class="input input-sm mf-agg">
                      <option value="sum">求和</option>
                      <option value="avg">均值</option>
                      <option value="count">计数</option>
                      <option value="min">最小</option>
                      <option value="max">最大</option>
                    </select>
                  </div>
                </div>
              </template>

              <template v-if="chartForm.type === 'timeseries'">
                <label>日期列</label>
                <select v-model="chartForm.dateColumn" class="input select-sm">
                  <option value="">选择日期列...</option>
                  <option v-for="col in dateCols" :key="col" :value="col">{{ col }}</option>
                </select>
                <label>指标</label>
                <div class="metric-chips">
                  <label v-for="col in allMetricCols" :key="col" class="chip sm"
                    :class="{ active: chartForm.metrics.includes(col) }">
                    <input type="checkbox" :checked="chartForm.metrics.includes(col)" @change="toggleChartMetric(col)"
                      hidden />
                    {{ col }}
                  </label>
                </div>
                <div v-if="chartForm.metrics.length > 0" class="metric-formats">
                  <div class="mf-title">各指标聚合</div>
                  <div v-for="m in chartForm.metrics" :key="m" class="mf-row">
                    <span class="mf-name">{{ m }}</span>
                    <select v-model="chartForm.metricAggs[m]" class="input input-sm mf-agg">
                      <option value="sum">求和</option>
                      <option value="avg">均值</option>
                      <option value="count">计数</option>
                      <option value="min">最小</option>
                      <option value="max">最大</option>
                    </select>
                  </div>
                </div>
              </template>

              <template v-if="chartForm.type === 'decile'">
                <label>指标</label>
                <div class="metric-chips">
                  <label v-for="col in allMetricCols" :key="col" class="chip sm"
                    :class="{ active: chartForm.metrics.includes(col) }">
                    <input type="checkbox" :checked="chartForm.metrics.includes(col)" @change="toggleChartMetric(col)"
                      hidden />
                    {{ col }}
                  </label>
                </div>
                <div v-if="chartForm.metrics.length > 0" class="metric-formats">
                  <div class="mf-title">各指标聚合</div>
                  <div v-for="m in chartForm.metrics" :key="m" class="mf-row">
                    <span class="mf-name">{{ m }}</span>
                    <select v-model="chartForm.metricAggs[m]" class="input input-sm mf-agg">
                      <option value="sum">求和</option>
                      <option value="avg">均值</option>
                      <option value="count">计数</option>
                      <option value="min">最小</option>
                      <option value="max">最大</option>
                    </select>
                  </div>
                </div>
              </template>

              <template v-if="chartForm.type === 'cluster'">
                <label>K 值</label>
                <input v-model.number="chartForm.k" type="number" class="input input-sm" min="2" max="10" />
                <label>聚类指标</label>
                <div class="metric-chips">
                  <label v-for="col in allMetricCols" :key="col" class="chip sm"
                    :class="{ active: chartForm.clusterMetrics.includes(col) }">
                    <input type="checkbox" :checked="chartForm.clusterMetrics.includes(col)"
                      @change="toggleClusterMetric(col)" hidden />
                    {{ col }}
                  </label>
                </div>
                <div v-if="chartForm.clusterMetrics.length > 0" class="metric-formats">
                  <div class="mf-title">各指标聚合</div>
                  <div v-for="m in chartForm.clusterMetrics" :key="m" class="mf-row">
                    <span class="mf-name">{{ m }}</span>
                    <select v-model="chartForm.metricAggs[m]" class="input input-sm mf-agg">
                      <option value="sum">求和</option>
                      <option value="avg">均值</option>
                      <option value="count">计数</option>
                      <option value="min">最小</option>
                      <option value="max">最大</option>
                    </select>
                  </div>
                </div>
              </template>

              <template v-if="chartForm.type === 'histogram'">
                <label>指标</label>
                <select v-model="chartForm.metric" class="input select-sm" @change="onHistogramMetricChange">
                  <option value="">选择指标...</option>
                  <option v-for="col in allMetricCols" :key="col" :value="col">{{ col }}</option>
                </select>
              </template>

              <template v-if="chartForm.type === 'line'">
                <label>日期列</label>
                <select v-model="chartForm.dateColumn" class="input select-sm">
                  <option value="">无（使用维度）</option>
                  <option v-for="col in dateCols" :key="col" :value="col">{{ col }}</option>
                </select>
                <label>维度</label>
                <select v-model="chartForm.dimension" class="input select-sm">
                  <option value="">(无)</option>
                  <option v-for="col in dimensionCols" :key="col" :value="col">{{ col }}</option>
                </select>
                <label>指标</label>
                <div class="metric-chips">
                  <label v-for="col in allMetricCols" :key="col" class="chip sm"
                    :class="{ active: chartForm.metrics.includes(col) }">
                    <input type="checkbox" :checked="chartForm.metrics.includes(col)" @change="toggleChartMetric(col)"
                      hidden />
                    {{ col }}
                  </label>
                </div>
                <div v-if="chartForm.metrics.length > 0" class="metric-formats">
                  <div class="mf-title">各指标聚合</div>
                  <div v-for="m in chartForm.metrics" :key="m" class="mf-row">
                    <span class="mf-name">{{ m }}</span>
                    <select v-model="chartForm.metricAggs[m]" class="input input-sm mf-agg">
                      <option value="sum">求和</option>
                      <option value="avg">均值</option>
                      <option value="count">计数</option>
                      <option value="min">最小</option>
                      <option value="max">最大</option>
                    </select>
                  </div>
                </div>
              </template>

              <!-- 筛选条件（通用） -->
              <label>筛选条件</label>
              <div class="filter-wrap">
                <input v-model="chartForm.filter" class="input" placeholder="留空=全部数据，如: 地区 = 北京"
                  list="chart-filter-cols" />
                <datalist id="chart-filter-cols">
                  <template v-for="col in filterableColumns" :key="col">
                    <option :value="col + ' = '" />
                    <option :value="col + ' != '" />
                    <option v-if="isNumericCol(col)" :value="col + ' > '" />
                    <option v-if="isNumericCol(col)" :value="col + ' < '" />
                    <option v-if="!isNumericCol(col)" :value="col + ' in '" />
                    <option v-if="!isNumericCol(col)" :value="col + ' ~ '" />
                  </template>
                </datalist>
                <span class="filter-hint">格式: 列名 运算符 值。& = AND，| = OR。in = 在列表中，~ = 含有。如「地区 in 北京,上海」或「名称 ~ 科技」</span>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" @click="saveChart" :disabled="!canSaveChart">保存</button>
            <button class="btn" @click="cancelChartEdit">取消</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data-store'
import { useConfigStore } from '@/stores/config-store'
import type { ConfigSection } from '@/stores/config-store'
import { CHART_TYPES, AGG_OPTIONS, KPI_FORMAT_OPTIONS } from '@/types/config'
import type { ChartFormItem } from '@/types/config'

const router = useRouter()
const { t } = useI18n()
const dataStore = useDataStore()
const configStore = useConfigStore()

// 全部区域是否都已保存（与快照一致）
const allSaved = computed(() => {
  const sections: ConfigSection[] = ['title', 'filters', 'kpis', 'charts', 'table']
  return sections.every((s) => configStore.isSectionSaved(s))
})

const savedCount = computed(() => {
  const sections: ConfigSection[] = ['title', 'filters', 'kpis', 'charts', 'table']
  return sections.filter((s) => configStore.isSectionSaved(s)).length
})

// ====== Drag state ======
const dragList = ref<'kpi' | 'chart' | null>(null)
const dragIdx = ref(-1)
const dragPlaceholder = ref(-1)
let dragGhost: HTMLElement | null = null
let dragStartY = 0
let dragOffY = 0

function onPointerDown(e: PointerEvent, idx: number, list: 'kpi' | 'chart') {
  const handle = e.currentTarget as HTMLElement
  const item = handle.closest('[data-drag-idx]') as HTMLElement
  if (!item) return
  handle.setPointerCapture(e.pointerId)

  dragList.value = list
  dragIdx.value = idx
  dragStartY = e.clientY
  dragOffY = e.clientY - item.getBoundingClientRect().top

  // create ghost
  dragGhost = item.cloneNode(true) as HTMLElement
  dragGhost.classList.add('drag-ghost')
  dragGhost.style.width = item.offsetWidth + 'px'
  dragGhost.style.left = item.getBoundingClientRect().left + 'px'
  dragGhost.style.top = item.getBoundingClientRect().top + 'px'
  document.body.appendChild(dragGhost)

  item.style.opacity = '0.3'

  handle.addEventListener('pointermove', onPointerMove)
  handle.addEventListener('pointerup', onPointerUp)
  handle.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(e: PointerEvent) {
  if (!dragGhost) return
  dragGhost.style.top = (e.clientY - dragOffY) + 'px'

  // find which item we're hovering over
  const els = document.elementsFromPoint(e.clientX, e.clientY)
  for (const el of els) {
    const item = (el as HTMLElement).closest?.('[data-drag-idx]')
    if (item) {
      const listEl = (el as HTMLElement).closest?.('[data-drag-list]')
      const list = listEl?.getAttribute('data-drag-list')
      if (list === dragList.value) {
        const targetIdx = parseInt(item.getAttribute('data-drag-idx')!)
        if (targetIdx !== dragPlaceholder.value) {
          dragPlaceholder.value = targetIdx
        }
        return
      }
    }
  }
  dragPlaceholder.value = -1
}

function onPointerUp(e: PointerEvent) {
  const handle = e.currentTarget as HTMLElement
  handle.removeEventListener('pointermove', onPointerMove)
  handle.removeEventListener('pointerup', onPointerUp)
  handle.removeEventListener('pointercancel', onPointerUp)
  handle.releasePointerCapture(e.pointerId)

  // save values before reset
  const from = dragIdx.value
  const to = dragPlaceholder.value
  const list = dragList.value as 'kpi' | 'chart' | null

  // restore source item opacity
  const listEl = document.querySelector(`[data-drag-list="${list}"]`)
  if (listEl) {
    const srcItem = listEl.querySelector(`[data-drag-idx="${from}"]`) as HTMLElement
    if (srcItem) srcItem.style.opacity = ''
  }

  // remove ghost
  if (dragGhost) { dragGhost.remove(); dragGhost = null }

  // reset
  dragList.value = null
  dragIdx.value = -1
  dragPlaceholder.value = -1

  // perform reorder
  if (from >= 0 && to >= 0 && from !== to && list) {
    if (list === 'kpi') {
      configStore.reorderKpis(from, to)
    } else if (list === 'chart') {
      configStore.reorderCharts(from, to)
    }
  }
}

const numericCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  return ds.headers.filter((h) => ds.classifications[h]?.type === 'numeric' && ds.classifications[h]?.role === 'metric' && !dataStore.excludedColumns.has(h))
})

const dimensionCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  return ds.headers.filter(
    (h) => ds.classifications[h]?.role === 'dimension' && ds.classifications[h]?.type === 'categorical' && !dataStore.excludedColumns.has(h),
  )
})

const allHeaders = computed(() => {
  return dataStore.dataSet?.headers ?? []
})

/** 未排除的列（供筛选器 datalist 使用，避免引用已排除列） */
const filterableColumns = computed(() =>
  allHeaders.value.filter((h) => !dataStore.excludedColumns.has(h)),
)

/** 判断列是否为数值类型（数值列用 > < >= <=，非数值列用 in ~） */
function isNumericCol(col: string): boolean {
  return dataStore.dataSet?.classifications[col]?.type === 'numeric'
}

function chartTypeLabel(type: string): string {
  return CHART_TYPES.find((t) => t.value === type)?.label ?? type
}

// ====== KPI editor ======
const KPI_AGG_OPTIONS = [
  { value: 'sum', label: '求和' },
  { value: 'avg', label: '平均值' },
  { value: 'count', label: '计数' },
  { value: 'min', label: '最小值' },
  { value: 'max', label: '最大值' },
]

const showKpiEditor = ref(false)
const editingKpiIdx = ref(-1)

interface KpiVariable { column: string; agg: string; filter: string }
const kpiForm = reactive({
  useFormula: false,
  column: '',
  label: '',
  agg: 'sum' as string,
  format: 'global' as string,
  prefix: '',
  unit: 'yuan' as string,
  filter: '',
  variables: [] as KpiVariable[],
  expression: '',
})

const allNumericCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  return ds.headers.filter((h) => ds.classifications[h]?.type === 'numeric' && !dataStore.excludedColumns.has(h))
})

const canSaveKpi = computed(() => {
  if (!kpiForm.label.trim()) return false
  if (kpiForm.useFormula) {
    return kpiForm.variables.length >= 1 && kpiForm.variables.every(v => v.column) && kpiForm.expression.trim()
  }
  return !!kpiForm.column
})

function aggLabel(agg: string): string {
  return KPI_AGG_OPTIONS.find((o) => o.value === agg)?.label ?? agg
}

function addVariable() {
  kpiForm.variables.push({ column: '', agg: 'sum', filter: '' })
}

function insertVar(idx: number) {
  kpiForm.expression += `[${idx}]`
}

function insertOp(op: string) {
  kpiForm.expression += ` ${op} `
}

function openAddKpi() {
  editingKpiIdx.value = -1
  kpiForm.useFormula = false
  kpiForm.column = ''
  kpiForm.label = ''
  kpiForm.agg = 'sum'
  kpiForm.format = 'global'
  kpiForm.prefix = ''
  kpiForm.filter = ''
  kpiForm.variables = [{ column: '', agg: 'sum', filter: '' }, { column: '', agg: 'sum', filter: '' }]
  kpiForm.expression = '[0] + [1]'
  showKpiEditor.value = true
}

function openEditKpi(idx: number) {
  editingKpiIdx.value = idx
  const kpi = configStore.config.kpis[idx]
  if (kpi.formula) {
    kpiForm.useFormula = true
    kpiForm.variables = kpi.formula.variables.map(v => ({ column: v.column, agg: v.agg, filter: v.filter || '' }))
    kpiForm.expression = kpi.formula.expression
    kpiForm.filter = kpi.formula.filter || ''
    kpiForm.column = ''
    kpiForm.agg = 'sum'
  } else {
    kpiForm.useFormula = false
    kpiForm.column = kpi.column
    kpiForm.agg = kpi.agg
    kpiForm.filter = kpi.filter || ''
    kpiForm.variables = [{ column: '', agg: 'sum', filter: '' }, { column: '', agg: 'sum', filter: '' }]
    kpiForm.expression = '[0] + [1]'
  }
  kpiForm.label = kpi.label
  kpiForm.format = kpi.format
  kpiForm.prefix = kpi.prefix
  kpiForm.unit = kpi.unit || 'yuan'
  showKpiEditor.value = true
}

function saveKpi() {
  if (!canSaveKpi.value) return
  const data: any = {
    column: kpiForm.useFormula ? '' : kpiForm.column,
    label: kpiForm.label.trim(),
    agg: kpiForm.useFormula ? 'sum' : kpiForm.agg,
    format: kpiForm.format,
    prefix: kpiForm.prefix,
    unit: kpiForm.format === 'currency' ? kpiForm.unit : undefined,
    filter: kpiForm.useFormula ? undefined : (kpiForm.filter.trim() || undefined),
  }
  if (kpiForm.useFormula) {
    data.formula = {
      variables: kpiForm.variables.filter(v => v.column).map(v => ({
        column: v.column,
        agg: v.agg,
        filter: v.filter.trim() || undefined,
      })),
      expression: kpiForm.expression.trim(),
      filter: kpiForm.filter.trim() || undefined,
    }
  } else {
    // 从公式切换为单列时，清除旧的 formula
    data.formula = undefined
  }
  if (editingKpiIdx.value >= 0) {
    configStore.updateKpi(editingKpiIdx.value, data)
  } else {
    configStore.addKpi(data)
  }
  showKpiEditor.value = false
}

function cancelKpiEdit() {
  showKpiEditor.value = false
}

function goToDashboard() {
  router.push('/dashboard')
}

// ====== Chart editor ======
const showChartEditor = ref(false)
const editingChartId = ref<string | null>(null)

const chartForm = reactive({
  type: 'bar' as string,
  title: '',
  dimension: '',
  metric: '',
  metrics: [] as string[],
  dateColumn: '',
  agg: 'sum',
  k: 3,
  clusterMetrics: [] as string[],
  filter: '',
  format: 'global' as string,
  unit: 'yuan' as string,
  metricFormats: {} as Record<string, { format: string; unit: string; prefix?: string; decimals?: number }>,
  metricAggs: {} as Record<string, string>,
})

const allMetricCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  return ds.headers.filter((h) => ds.classifications[h]?.role === 'metric' && !dataStore.excludedColumns.has(h))
})

const dateCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  return ds.headers.filter((h) => ds.classifications[h]?.type === 'date' && !dataStore.excludedColumns.has(h))
})

// ====== 全局指标聚合 ======
function initMetricDefaultsForm() {
  const form: Record<string, { format: string; unit: string; prefix: string; decimals: number; sections: string[] }> = {}
  const cfg = configStore.config.metricDefaults || {}
  for (const col of allMetricCols.value) {
    const d = cfg[col] || {}
    form[col] = {
      format: d.format || 'global',
      unit: d.unit || 'yuan',
      prefix: d.prefix || '',
      decimals: d.decimals !== undefined ? d.decimals : 2,
      sections: d.sections ? [...d.sections] : [],
    }
  }
  return form
}
const metricDefaultsForm = reactive(initMetricDefaultsForm())
// Re-init when data changes (new columns)
watch(allMetricCols, () => {
  const newForm = initMetricDefaultsForm()
  for (const key of Object.keys(newForm)) {
    if (!metricDefaultsForm[key]) {
      metricDefaultsForm[key] = newForm[key]
    }
  }
})

function hasSection(col: string, section: string): boolean {
  return metricDefaultsForm[col]?.sections.includes(section)
}
function toggleSection(col: string, section: string) {
  const arr = metricDefaultsForm[col].sections
  const idx = arr.indexOf(section)
  if (idx !== -1) arr.splice(idx, 1)
  else arr.push(section)
}

// ====== 保存/重置全局格式 ======
function saveMetricDefaults() {
  const cfg: Record<string, any> = {}
  for (const col of allMetricCols.value) {
    const f = metricDefaultsForm[col]
    if (!f || !f.format || f.format === 'global') continue
    cfg[col] = {
      format: f.format,
      unit: f.format === 'currency' ? f.unit : undefined,
      prefix: f.format === 'currency' ? (f.prefix || '') : undefined,
      decimals: f.decimals,
      sections: f.sections.length > 0 ? [...f.sections] : undefined,
    }
  }
  configStore.config.metricDefaults = Object.keys(cfg).length > 0 ? cfg : undefined
  configStore.saveSection('metricDefaults')
}
function resetMetricDefaults() {
  configStore.resetSectionToAuto('metricDefaults')
  const newForm = initMetricDefaultsForm()
  for (const key of Object.keys(newForm)) {
    metricDefaultsForm[key] = { ...newForm[key] }
  }
}

function isBasicChart(type: string): boolean {
  return ['bar', 'horizontal_bar', 'doughnut'].includes(type)
}

const canSaveChart = computed(() => {
  const f = chartForm
  if (!f.title.trim()) return false
  switch (f.type) {
    case 'bar': case 'horizontal_bar': case 'doughnut':
      return !!f.dimension && f.metrics.length > 0
    case 'histogram': case 'decile':
      return !!f.metric || f.metrics.length > 0
    case 'line': case 'timeseries':
      return (!!f.dateColumn || !!f.dimension) && (!!f.metric || f.metrics.length > 0)
    case 'cluster':
      return f.clusterMetrics.length >= 2
    default: return false
  }
})

function resetChartForm() {
  chartForm.type = 'bar'
  chartForm.title = ''
  chartForm.dimension = ''
  chartForm.metric = ''
  chartForm.metrics = []
  chartForm.dateColumn = ''
  chartForm.agg = 'sum'
  chartForm.k = 3
  chartForm.clusterMetrics = []
  chartForm.filter = ''
  chartForm.format = 'global'
  chartForm.unit = 'yuan'
  chartForm.metricFormats = {}
  chartForm.metricAggs = {}
}

function openAddChart() {
  resetChartForm()
  editingChartId.value = null
  showChartEditor.value = true
}

function openEditChart(chart: ChartFormItem) {
  editingChartId.value = chart.id
  chartForm.type = chart.type
  chartForm.title = chart.title
  chartForm.dimension = chart.dimension || ''
  chartForm.metric = chart.metric || ''
  chartForm.metrics = chart.metrics ? [...chart.metrics] : []
  chartForm.dateColumn = chart.dateColumn || ''
  chartForm.agg = chart.agg || 'sum'
  chartForm.k = chart.k || 3
  chartForm.clusterMetrics = chart.clusterMetrics ? [...chart.clusterMetrics] : []
  chartForm.filter = chart.filter || ''
  chartForm.format = chart.format || 'global'
  chartForm.unit = chart.unit || 'yuan'
  chartForm.metricFormats = chart.metricFormats ? JSON.parse(JSON.stringify(chart.metricFormats)) : {}
  chartForm.metricAggs = chart.metricAggs ? JSON.parse(JSON.stringify(chart.metricAggs)) : {}
  // 确保已选指标都有条目，旧数据中 '' 或 'number' 统一修正为 'global'
  chartForm.metrics.forEach((m) => {
    if (!chartForm.metricFormats[m] || !chartForm.metricFormats[m].format || chartForm.metricFormats[m].format === 'number') {
      chartForm.metricFormats[m] = { format: 'global', unit: 'yuan', prefix: '' }
    }
    if (!chartForm.metricAggs[m]) chartForm.metricAggs[m] = 'sum'
  })
  chartForm.clusterMetrics.forEach((m) => {
    if (!chartForm.metricFormats[m] || !chartForm.metricFormats[m].format || chartForm.metricFormats[m].format === 'number') {
      chartForm.metricFormats[m] = { format: 'global', unit: 'yuan', prefix: '' }
    }
    if (!chartForm.metricAggs[m]) chartForm.metricAggs[m] = 'sum'
  })
  // histogram single metric
  if (chartForm.metric && !chartForm.metrics.includes(chartForm.metric)) {
    if (!chartForm.metricFormats[chartForm.metric] || !chartForm.metricFormats[chartForm.metric].format || chartForm.metricFormats[chartForm.metric].format === 'number') {
      chartForm.metricFormats[chartForm.metric] = { format: 'global', unit: 'yuan', prefix: '' }
    }
    if (!chartForm.metricAggs[chartForm.metric]) chartForm.metricAggs[chartForm.metric] = 'sum'
  }
  showChartEditor.value = true
}

function toggleChartMetric(col: string) {
  const idx = chartForm.metrics.indexOf(col)
  if (idx !== -1) {
    chartForm.metrics.splice(idx, 1)
    delete chartForm.metricFormats[col]
  } else {
    chartForm.metrics.push(col)
    if (!chartForm.metricFormats[col]) {
      chartForm.metricFormats[col] = { format: 'global', unit: 'yuan', prefix: '' }
    }
    if (!chartForm.metricAggs[col]) {
      chartForm.metricAggs[col] = 'sum'
    }
  }
  if (chartForm.metrics.length > 0 && !chartForm.metric) {
    chartForm.metric = chartForm.metrics[0]
  }
}

function toggleClusterMetric(col: string) {
  const idx = chartForm.clusterMetrics.indexOf(col)
  if (idx !== -1) {
    chartForm.clusterMetrics.splice(idx, 1)
    delete chartForm.metricFormats[col]
  } else {
    chartForm.clusterMetrics.push(col)
    if (!chartForm.metricFormats[col]) {
      chartForm.metricFormats[col] = { format: 'global', unit: 'yuan', prefix: '' }
    }
    if (!chartForm.metricAggs[col]) {
      chartForm.metricAggs[col] = 'sum'
    }
  }
}

function onHistogramMetricChange() {
  const m = chartForm.metric
  if (m) {
    if (!chartForm.metricFormats[m]) chartForm.metricFormats[m] = { format: 'global', unit: 'yuan', prefix: '' }
    if (!chartForm.metricAggs[m]) chartForm.metricAggs[m] = 'sum'
  }
}

function saveChart() {
  if (!canSaveChart.value) return
  const ds = dataStore.dataSet!
  const base: ChartFormItem = {
    id: editingChartId.value || crypto.randomUUID(),
    type: chartForm.type as ChartFormItem['type'],
    title: chartForm.title.trim(),
  }

  if (isBasicChart(chartForm.type)) {
    base.dimension = chartForm.dimension
    base.metrics = chartForm.metrics
    base.metric = chartForm.metrics[0] || chartForm.metric
    base.agg = chartForm.agg
  } else if (chartForm.type === 'histogram') {
    base.metric = chartForm.metric || chartForm.metrics[0]
  } else if (chartForm.type === 'line') {
    base.dateColumn = chartForm.dateColumn || undefined
    base.dimension = chartForm.dimension || undefined
    base.metrics = chartForm.metrics
    base.metric = chartForm.metrics[0] || chartForm.metric
  } else if (chartForm.type === 'timeseries') {
    base.dateColumn = chartForm.dateColumn
    base.metric = chartForm.metrics[0] || chartForm.metric
    base.metrics = chartForm.metrics
  } else if (chartForm.type === 'decile') {
    base.metric = chartForm.metrics[0] || chartForm.metric
    base.metrics = chartForm.metrics
  } else if (chartForm.type === 'cluster') {
    base.metrics = chartForm.clusterMetrics
    base.clusterMetrics = chartForm.clusterMetrics
    base.k = chartForm.k
  }

  // 通用：筛选条件
  base.filter = chartForm.filter.trim() || undefined
  // 各指标聚合（保留聚合设定，格式统一走全局）
  const ma: Record<string, string> = {}
  const allM: string[] = [...chartForm.metrics]
  if (chartForm.metric && !allM.includes(chartForm.metric)) allM.push(chartForm.metric)
  for (const m of chartForm.clusterMetrics) { if (!allM.includes(m)) allM.push(m) }
  for (const m of allM) {
    const a = chartForm.metricAggs[m]
    if (a && a !== 'sum') ma[m] = a
  }
  base.metricAggs = Object.keys(ma).length > 0 ? ma : undefined
  // 格式不再独立保存，统一走全局默认
  base.format = undefined
  base.unit = undefined
  base.metricFormats = undefined

  if (editingChartId.value) {
    configStore.updateChart(editingChartId.value, base)
  } else {
    configStore.addChart(base)
  }
  showChartEditor.value = false
}

function cancelChartEdit() {
  showChartEditor.value = false
}
</script>

<style scoped>
.config-view {
  max-width: 1400px;
  margin: 0 auto;
}

.no-data {
  text-align: center;
  padding: 64px;
  color: var(--text-secondary);
}

.config-header {
  margin-bottom: 24px;
  text-align: center;
}

.config-header-top {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 4px;
  position: relative;
}

.config-header-top .btn-ghost {
  position: absolute;
  left: 0;
}

.header-actions {
  position: absolute;
  right: 0;
  display: flex;
  gap: 8px;
}

.config-header h2 {
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 0;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 14px;
  text-align: center;
}

.config-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  align-items: start;
}

.config-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-section {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
}

/* Section header with per-section save/reset */
.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 8px;
}

.section-header-row h3 {
  margin-bottom: 0;
  flex-shrink: 0;
}

.section-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.config-section h3 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.btn-save {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.25s ease;
}

.btn-save:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.btn-save.saved {
  background: #16a34a;
  color: white;
  border-color: #16a34a;
}

.btn-save.saved:hover {
  background: #15803d;
  border-color: #15803d;
  color: white;
}

.btn-reset-sec {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-reset-sec:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--text-secondary);
}

.btn-save:disabled,
.btn-reset-sec:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.select-sm {
  flex: 1;
}

.input-sm {
  width: 80px;
}

/* KPI list */
.kpi-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.kpi-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 12px;
  background: var(--bg);
  border-radius: 8px;
  border: 1px solid transparent;
  transition: border-color 0.15s, box-shadow 0.15s;
  cursor: default;
}

.kpi-item.drag-placeholder {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, .25);
  background: rgba(59, 130, 246, .06);
}

.drag-ghost {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.85;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .18);
  transform: rotate(1deg);
  cursor: grabbing;
}

.drag-handle {
  display: flex;
  align-items: center;
  cursor: grab;
  color: var(--text-secondary);
  font-size: 14px;
  padding: 0 2px;
  user-select: none;
  line-height: 1;
  margin-top: 2px;
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-hint {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 400;
  margin-left: 8px;
  opacity: 0.6;
}

.kpi-item-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kpi-item-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.kpi-item-label {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.kpi-agg-tag {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--primary-light);
  color: var(--primary);
  font-size: 11px;
  white-space: nowrap;
}

.kpi-col-tag {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 11px;
  white-space: nowrap;
}

.kpi-formula-tag {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 4px;
  background: #fef3c7;
  color: #92400e;
  font-size: 11px;
  white-space: nowrap;
  font-weight: 500;
}

.kpi-filter-tag {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 4px;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 11px;
  white-space: nowrap;
  cursor: help;
}

.kpi-mode-toggle {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
}

.formula-section {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  background: var(--bg);
  margin-bottom: 4px;
}

.formula-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.formula-hint {
  font-weight: 400;
  opacity: 0.5;
  font-size: 11px;
}

.formula-var-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.formula-filter {
  flex: 1;
  min-width: 130px;
}

.var-index {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  min-width: 24px;
  font-family: monospace;
}

.formula-btns {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.formula-input {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
}

.filter-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-hint {
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.7;
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Chart list */
.chart-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chart-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 12px;
  background: var(--bg);
  border-radius: 8px;
  border: 1px solid transparent;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.chart-item.drag-placeholder {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, .25);
  background: rgba(59, 130, 246, .06);
}

.chart-item-body {
  flex: 1;
}

.chart-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.chart-type-badge {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background: var(--primary-light);
  color: var(--primary);
}

.chart-title {
  flex: 1;
  font-weight: 500;
  font-size: 14px;
}

.chart-item-detail {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary);
  flex-wrap: wrap;
}

/* Modal overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, .35);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-dialog {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  width: 620px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, .18);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
}

/* Chart editor */
.chart-editor {
  margin-top: 14px;
  padding: 16px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.chart-editor h4 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}

.editor-grid {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 10px 14px;
  align-items: center;
}

.editor-grid label {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
}

.editor-grid .input {
  max-width: 320px;
}

.metric-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.metric-chips .chip {
  transition: all 0.15s;
}

.metric-chips .chip.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.no-metric-hint {
  font-size: 12px;
  color: #f59e0b;
  padding: 4px 0;
}

.metric-formats {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 0;
  margin-left: 94px;
}

.mf-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.mf-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mf-name {
  font-size: 12px;
  color: var(--text-primary);
  width: 60px;
  text-align: right;
  font-weight: 500;
  flex-shrink: 0;
}

.mf-sel {
  width: 84px;
}

.mf-agg {
  width: 72px;
}

.mf-unit {
  width: 72px;
}

.mf-prefix {
  width: 48px;
  text-align: center;
}

/* Table config */
.table-config-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.table-config-row label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.table-col-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

/* Preview panel */
.config-preview {
  position: sticky;
  top: 24px;
}

.preview-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
}

.preview-card h3 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
}

.preview-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

/* Save status indicator */
.save-status {
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  text-align: center;
  background: #ecfdf5;
  color: #065f46;
}

.save-status.unsaved {
  background: #fffbeb;
  color: #92400e;
}

/* Buttons — ConfigView-specific overrides */
.btn-add {
  margin-top: 10px;
}

.btn-icon:hover {
  color: var(--error);
}

/* ====== Global Metric Defaults Table ====== */
.metric-defaults-table {
  margin-top: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.md-header {
  display: grid;
  grid-template-columns: 1fr 90px 64px 52px 56px 28px 28px 28px;
  gap: 6px;
  padding: 8px 12px;
  background: var(--bg-hover);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.md-row {
  display: grid;
  grid-template-columns: 1fr 90px 64px 52px 56px 28px 28px 28px;
  gap: 6px;
  padding: 6px 12px;
  align-items: center;
  border-top: 1px solid var(--border-light);
  font-size: 13px;
}

.md-col-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.md-col-cb {
  text-align: center;
  font-size: 12px;
  white-space: nowrap;
}

.md-na {
  color: var(--text-secondary);
  font-size: 12px;
  text-align: center;
}

.md-sel {
  width: 100%;
  font-size: 12px;
}

.md-dec {
  width: 100%;
  text-align: center;
  font-size: 13px;
  padding: 4px 2px;
}

.md-prefix {
  width: 100%;
  text-align: center;
  font-size: 12px;
  padding: 4px 2px;
}

.md-cb {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin: 0;
}

.md-cb input[type="checkbox"] {
  width: 15px;
  height: 15px;
  accent-color: var(--primary);
  cursor: pointer;
  margin: 0;
}

.sec-desc {
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: -4px;
  margin-bottom: 4px;
}
</style>
