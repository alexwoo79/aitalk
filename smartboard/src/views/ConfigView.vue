<template>
  <div class="config-view">
    <div v-if="!dataStore.dataSet && dataStore.tableCount === 0" class="no-data">
      <p>{{ t('config.noData') }}</p>
      <button class="btn btn-sm btn-primary" @click="$router.push('/')">{{ t('config.backToUpload') }}</button>
    </div>

    <div v-else-if="!dataStore.dataSet && dataStore.tableCount > 0" class="no-data">
      <p>数据加载中...</p>
      <button class="btn btn-sm btn-primary" @click="recoverData">{{ t('common.confirm') }}</button>
    </div>

    <template v-else>
      <div class="config-header">
        <div class="config-header-top">
          <button class="btn btn-sm btn-ghost" @click="$router.push('/')">← {{ t('config.backToUpload') }}</button>
          <h2>{{ t('config.title') }}</h2>
          <div class="header-actions">
            <button class="btn btn-sm btn-export" @click="exportConfig">{{ t('config.exportConfig') }}</button>
            <label class="btn btn-sm btn-import">
              {{ t('config.importConfig') }}
              <input type="file" accept=".json" style="display:none" @change="importConfig" />
            </label>
            <button class="btn btn-sm btn-save" :class="{ saved: allSaved }" @click="configStore.saveAll()">{{ allSaved
              ? t('config.saved') : t('config.saveAll') }}</button>
            <span class="reset-wrap">
              <button class="btn btn-sm btn-reset-sec" @click="configStore.resetAllToAuto()">{{ t('config.resetAll')
              }}</button>
              <button class="reset-info-btn" @click.stop="toggleResetHint" :title="t('config.resetHint')">💡</button>
              <div v-if="showResetHint" class="reset-popup">
                {{ t('config.resetHint') }}
              </div>
            </span>
          </div>
        </div>
        <div v-if="configMsg" class="config-toast">{{ configMsg }}</div>
        <p class="subtitle">{{ t('config.hint') }}</p>
      </div>

      <div class="config-bottom-head">
        <button class="btn btn-primary btn-sm" @click="goToDashboard">{{ t('config.generateArrow') }}</button>
      </div>
      <div class="config-layout">
        <div class="config-panel">
          <!-- 标题 -->
          <section class="config-section">
            <div class="section-header-row" @click="toggleConfigSection('title')">
              <span class="sec-arrow">{{ isSectionOpen('title') ? '▼' : '▶' }}</span>
              <h3>{{ t('config.dashboardTitle') }}</h3>
              <div class="section-actions" @click.stop>
                <button class="btn btn-sm btn-save" :class="{ saved: configStore.isSectionSaved('title') }"
                  @click="configStore.saveSection('title')">{{ configStore.isSectionSaved('title') ? '✅' : '💾'
                  }}</button>
                <button class="btn btn-sm btn-reset-sec" @click="configStore.resetSectionToAuto('title')">↺</button>
              </div>
            </div>
            <div v-show="isSectionOpen('title')" class="section-body">
              <input v-model="configStore.config.title" class="input" :placeholder="t('config.titlePlaceholder')" />
            </div>
          </section>

          <!-- 筛选 -->
          <section class="config-section">
            <div class="section-header-row" @click="toggleConfigSection('filters')">
              <span class="sec-arrow">{{ isSectionOpen('filters') ? '▼' : '▶' }}</span>
              <h3>{{ t('config.filters') }} ({{ configStore.config.filters.length }})</h3>
              <div class="section-actions" @click.stop>
                <button class="btn btn-sm btn-save" :class="{ saved: configStore.isSectionSaved('filters') }"
                  @click="configStore.saveSection('filters')">{{ configStore.isSectionSaved('filters') ? '✅' : '💾'
                  }}</button>
                <button class="btn btn-sm btn-reset-sec" @click="configStore.resetSectionToAuto('filters')">↺</button>
              </div>
            </div>
            <div v-show="isSectionOpen('filters')" class="section-body">
              <div class="filter-chips">
                <label v-for="col in dimensionCols" :key="col" class="chip"
                  :class="{ active: configStore.config.filters.includes(col) }">
                  <input type="checkbox" :checked="configStore.config.filters.includes(col)"
                    @change="configStore.toggleFilter(col)" class="sr-only" />
                  {{ col }}
                </label>
              </div>
            </div>
          </section>

          <!-- 时间切片 -->
          <section class="config-section" v-if="dateCols.length > 0">
            <div class="section-header-row" @click="toggleConfigSection('dateColumn')">
              <span class="sec-arrow">{{ isSectionOpen('dateColumn') ? '▼' : '▶' }}</span>
              <h3>{{ t('config.timeSlice') }} ({{ selectedDateCols.length || dateCols.length }})</h3>
              <div class="section-actions" @click.stop>
                <button class="btn btn-sm btn-save" :class="{ saved: configStore.isSectionSaved('dateColumn') }"
                  @click="configStore.saveSection('dateColumn')">{{ configStore.isSectionSaved('dateColumn') ? '✅' :
                    '💾'
                  }}</button>
                <button class="btn btn-sm btn-reset-sec"
                  @click="configStore.resetSectionToAuto('dateColumn')">↺</button>
              </div>
            </div>
            <div v-show="isSectionOpen('dateColumn')" class="section-body">
              <p class="sec-desc">{{ t('config.timeSliceHint') }}</p>
              <div class="filter-chips">
                <label v-for="col in dateCols" :key="col" class="chip"
                  :class="{ active: selectedDateCols.includes(col) }">
                  <input type="checkbox" :checked="selectedDateCols.includes(col)" @change="toggleDateCol(col)"
                    class="sr-only" />
                  {{ col }}
                </label>
              </div>
              <p v-if="selectedDateCols.length > 0" class="sec-desc" style="margin-top:6px">
                {{ t('config.date') }}{{ previewSpec?.dateRange?.min }} ~ {{ previewSpec?.dateRange?.max }}
              </p>
            </div>
          </section>

          <!-- KPI 指标卡片 -->
          <section class="config-section">
            <div class="section-header-row" @click="toggleConfigSection('kpis')">
              <span class="sec-arrow">{{ isSectionOpen('kpis') ? '▼' : '▶' }}</span>
              <h3>{{ t('config.kpiCards') }} ({{ configStore.config.kpis.length }})</h3>
              <div class="section-actions" @click.stop>
                <button class="btn btn-sm btn-save" :class="{ saved: configStore.isSectionSaved('kpis') }"
                  @click="configStore.saveSection('kpis')">{{ configStore.isSectionSaved('kpis') ? '✅' : '💾'
                  }}</button>
                <button class="btn btn-sm btn-reset-sec" @click="configStore.resetSectionToAuto('kpis')">↺</button>
              </div>
            </div>
            <div v-show="isSectionOpen('kpis')" class="section-body">
              <div class="kpi-list" data-drag-list="kpi">
                <div v-for="(kpi, i) in configStore.config.kpis" :key="i" class="kpi-item" :data-drag-idx="i"
                  :class="{ 'drag-placeholder': dragPlaceholder === i && dragList === 'kpi' }">
                  <span class="drag-handle" :title="t('config.dragTitle')"
                    @pointerdown.prevent="onPointerDown($event, i, 'kpi')">⋮⋮</span>
                  <div class="kpi-item-main">
                    <div class="kpi-item-row">
                      <span class="kpi-item-label">{{ kpi.label }}</span>
                      <span v-if="kpi.formula" class="kpi-formula-tag">{{ t('config.formula') }}</span>
                      <span v-else class="kpi-col-tag">{{ kpi.column }}</span>
                      <span class="kpi-agg-tag">{{ aggLabel(kpi.agg) }}</span>
                      <button class="btn-icon" @click="openEditKpi(i)" :title="t('config.edit')">✎</button>
                      <button class="btn-icon" @click="configStore.removeKpi(i)" :title="t('config.remove')">✕</button>
                    </div>
                  </div>
                </div>
              </div>
              <button class="btn btn-sm btn-add" @click="openAddKpi">{{ t('config.addKPICard') }}</button>
            </div>
          </section>

          <!-- 图表 -->
          <section class="config-section">
            <div class="section-header-row" @click="toggleConfigSection('charts')">
              <span class="sec-arrow">{{ isSectionOpen('charts') ? '▼' : '▶' }}</span>
              <h3>{{ t('config.charts') }} ({{ configStore.config.charts.length }}) <span class="drag-hint">{{
                t('config.dragHint') }}</span></h3>
              <div class="section-actions" @click.stop>
                <button class="btn btn-sm btn-save" :class="{ saved: configStore.isSectionSaved('charts') }"
                  @click="configStore.saveSection('charts')">{{ configStore.isSectionSaved('charts') ? '✅' : '💾'
                  }}</button>
                <button class="btn btn-sm btn-reset-sec" @click="configStore.resetSectionToAuto('charts')">↺</button>
              </div>
            </div>
            <div v-show="isSectionOpen('charts')" class="section-body">
              <div class="chart-quick-actions">
                <span>{{ t('config.displayColumns') }} ({{ selectedChartCount }}/{{ configStore.config.charts.length
                  }})</span>
                <button class="btn-link" @click="configStore.selectAllCharts()">{{ t('common.selectAll') }}</button>
                <button class="btn-link" @click="configStore.clearAllCharts()">{{ t('common.clearAll') }}</button>
              </div>
              <div class="chart-list" data-drag-list="chart">
                <div v-for="(chart, ci) in configStore.config.charts" :key="chart.id" class="chart-item"
                  :data-drag-idx="ci" :class="{ 'drag-placeholder': dragPlaceholder === ci && dragList === 'chart' }">
                  <span class="drag-handle" :title="t('config.dragTitle')"
                    @pointerdown.prevent="onPointerDown($event, ci, 'chart')">⋮⋮</span>
                  <div class="chart-item-body">
                    <div class="chart-item-header">
                      <span class="chart-type-badge">{{ chartTypeLabel(chart.type) }}</span>
                      <span class="chart-title">{{ chart.title }}</span>
                      <button class="btn-icon" @click="openEditChart(chart)" :title="t('config.edit')">✎</button>
                      <button class="btn-icon" @click="configStore.removeChart(chart.id)"
                        :title="t('config.remove')">✕</button>
                    </div>
                    <div class="chart-item-detail">
                      <span v-if="chart.dimension">{{ t('config.dimension') }}: {{ chart.dimension }}</span>
                      <span v-if="chart.metrics?.length">{{ t('config.metric') }}: {{ chart.metrics.join(', ')
                        }}</span>
                      <span v-if="chart.metric && !chart.metrics?.length">{{ t('config.metric') }}: {{ chart.metric
                        }}</span>
                      <span v-if="chart.dateColumn">{{ t('config.date') }} {{ chart.dateColumn }}</span>
                      <span v-if="chart.k">K: {{ chart.k }}</span>
                    </div>
                    <label class="chart-select-cb" @click.stop>
                      <input type="checkbox" :checked="chart.selected !== false"
                        @change="configStore.toggleChartSelected(chart.id)" />
                    </label>
                  </div>
                </div>
              </div>
              <button class="btn btn-sm btn-add" @click="openAddChart">{{ t('config.addChart') }}</button>
            </div>
          </section>

        </div>

        <!-- 右侧：实时预览 -->
        <div class="config-preview">
          <div class="preview-dash">
            <div class="preview-dash-header">
              <h3>{{ configStore.config.title || t('common.preview') }}</h3>
            </div>
            <div class="save-status" v-if="allSaved">{{ t('config.savedAll') }}</div>
            <div class="save-status unsaved" v-else>{{ t('config.savedPartial', {
              n: savedCount, total: totalSections
            })
              }}
            </div>

            <!-- 筛选条件预览 -->
            <div v-if="configStore.config.filters.length > 0" class="preview-section">
              <h4 class="ps-title">{{ t('config.filters') }}</h4>
              <div class="preview-filters">
                <span v-for="f in configStore.config.filters" :key="f" class="pf-chip">{{ f }}</span>
              </div>
            </div>

            <!-- 时间切片预览 -->
            <div v-if="previewSpec?.dateRange" class="preview-section">
              <h4 class="ps-title">{{ t('config.timeSlice') }}</h4>
              <div class="preview-filters">
                <span class="pf-chip">{{ previewSpec!.dateRange!.min }} ~ {{ previewSpec!.dateRange!.max }}</span>
              </div>
            </div>

            <!-- KPI 预览 -->
            <div v-if="previewKpis.length > 0" class="preview-section">
              <h4 class="ps-title">{{ t('config.kpiCards') }} ({{ previewKpis.length }})</h4>
              <div class="preview-kpi-row">
                <div v-for="(kpi, i) in previewKpis" :key="'pk-' + i" class="preview-kpi-card">
                  <div class="pk-label">{{ kpi.label }}</div>
                  <div class="pk-value" style="font-size:16px">{{ formatPreviewValue(kpi) }}</div>
                </div>
              </div>
            </div>

            <!-- 图表占位预览 -->
            <div v-if="selectedCharts.length > 0" class="preview-section">
              <h4 class="ps-title">{{ t('config.charts') }} ({{ selectedCharts.length }})</h4>
              <div class="preview-chart-grid">
                <div v-for="(chart, i) in selectedCharts" :key="chart.id || i" class="preview-chart-card">
                  <span class="pc-type">{{ chartTypeLabel(chart.type) }}</span>
                  <span class="pc-title">{{ chart.title }}</span>
                </div>
              </div>
            </div>

            <!-- 数据表摘要 -->
            <div v-if="configStore.config.table.columns.length > 0" class="preview-section">
              <h4 class="ps-title">{{ t('config.sections.table') }}</h4>
              <div class="preview-table-info">
                <span>{{ t('config.displayColumns') }}: {{ configStore.config.table.columns.length }}</span>
                <span>{{ t('config.dataRows') }}: {{ previewStore.effectiveRows.length }}</span>
              </div>
              <div class="preview-table-mini-wrap">
                <table class="preview-table-mini">
                  <thead>
                    <tr>
                      <th v-for="col in previewTableCols" :key="col" :style="getAssocColStyle(col, true)">{{ col }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, ri) in previewTableRows" :key="ri">
                      <td v-for="col in previewTableCols" :key="col" :style="getAssocColStyle(col, false)">{{
                        previewCellValue(row[col], col) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <button class="btn btn-refresh-preview" @click="refreshPreview" :title="t('common.refresh')">↻ {{
            t('common.refresh')
            }}</button>
        </div>
      </div>
    </template>

    <!-- KPI 编辑器弹窗 -->
    <Teleport to="body">
      <div v-if="showKpiEditor" class="modal-overlay" @click.self="cancelKpiEdit">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>{{ editingKpiIdx >= 0 ? t('config.editKPI') : t('config.addKPICard') }}</h3>
            <button class="btn-icon" @click="cancelKpiEdit">✕</button>
          </div>
          <div class="modal-body">
            <!-- 模式切换 -->
            <div class="kpi-mode-toggle">
              <button class="period-btn" :class="{ active: !kpiForm.useFormula }" @click="kpiForm.useFormula = false">{{
                t('config.singleColumn') }}</button>
              <button class="period-btn" :class="{ active: kpiForm.useFormula }" @click="kpiForm.useFormula = true">{{
                t('config.formulaCombo') }}</button>
            </div>

            <!-- 单列模式 -->
            <template v-if="!kpiForm.useFormula">
              <div class="editor-grid">
                <label>{{ t('config.metricColumn') }}</label>
                <select v-model="kpiForm.column" class="input select-sm">
                  <option value="">{{ t('config.selectMetricPlaceholder') }}</option>
                  <option v-for="col in allDataCols" :key="col" :value="col">{{ col }}</option>
                </select>
                <label>{{ t('common.label') }}</label>
                <input v-model="kpiForm.label" class="input" :placeholder="t('config.kpiLabelPlaceholder')" />
                <label>{{ t('config.aggregationLabel') }}</label>
                <select v-model="kpiForm.agg" class="input select-sm">
                  <option v-for="opt in KPI_AGG_OPTIONS" :key="opt.value" :value="opt.value">{{ t(opt.labelKey) }}
                  </option>
                </select>
                <label>{{ t('config.filterOptional') }}</label>
                <div class="filter-wrap">
                  <textarea v-model="kpiForm.filter" class="input filter-textarea"
                    :placeholder="t('config.leaveEmptyAll')" rows="1" />
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
                  <span class="filter-hint">{{ t('config.filterSyntax') }}</span>
                </div>
              </div>
            </template>

            <!-- 公式模式 -->
            <template v-else>
              <div class="formula-section">
                <div class="formula-label">{{ t('config.variables') }}</div>
                <div v-for="(v, vi) in kpiForm.variables" :key="vi" class="formula-var-row">
                  <span class="var-alias">{{ v.alias }}</span>
                  <select v-model="v.column" class="input input-sm" style="flex:1">
                    <option value="">{{ t('config.selectColumnPlaceholder') }}</option>
                    <option v-if="calculatedParams.length > 0" disabled>── {{ t('config.savedParams') }} ──</option>
                    <option v-for="p in calculatedParams" :key="'🔢' + p.label" :value="'🔢' + p.label">🔢 {{ p.label }}
                    </option>
                    <option disabled>── {{ t('config.dataColumns') }} ──</option>
                    <option v-for="col in allDataCols" :key="col" :value="col">{{ col }}</option>
                  </select>
                  <input v-model="v.filter" class="input input-sm formula-filter"
                    :placeholder="t('config.columnFilter')" list="filter-cols-formula" />
                  <button v-if="kpiForm.variables.length > 1" class="btn-icon" @click="kpiForm.variables.splice(vi, 1)"
                    :title="t('config.remove')">✕</button>
                </div>
                <button class="btn btn-sm" @click="addVariable" style="margin-bottom:12px">{{ t('config.addVariable')
                }}</button>

                <div class="formula-label">{{ t('config.sharedFilter') }} <span class="formula-hint">{{
                  t('config.sharedFilterHint') }}</span></div>
                <div class="filter-wrap">
                  <input v-model="kpiForm.filter" class="input filter-input" :placeholder="t('config.leaveEmptyAll')"
                    list="filter-cols-formula" />
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
                  <span class="filter-hint">{{ t('config.expressionHint') }}</span>
                </div>

                <div class="formula-label">{{ t('config.expression') }}</div>
                <div class="formula-btns">
                  <button v-for="v in kpiForm.variables" :key="v.alias" class="period-btn"
                    @click="insertAlias(v.alias)">{{ v.alias
                    }}</button>
                  <span class="toggle-sep" style="margin:0 4px"></span>
                  <button class="period-btn func-btn" @click="insertFunc('SUM')">SUM</button>
                  <button class="period-btn func-btn" @click="insertFunc('AVG')">AVG</button>
                  <button class="period-btn func-btn" @click="insertFunc('COUNT')">CNT</button>
                  <button class="period-btn func-btn" @click="insertFunc('UNIQUE_COUNT')">UNIQ</button>
                  <button class="period-btn func-btn" @click="insertFunc('MIN')">MIN</button>
                  <button class="period-btn func-btn" @click="insertFunc('MAX')">MAX</button>
                  <span class="toggle-sep" style="margin:0 4px"></span>
                  <button class="period-btn" @click="insertOp('+')">+</button>
                  <button class="period-btn" @click="insertOp('-')">−</button>
                  <button class="period-btn" @click="insertOp('*')">×</button>
                  <button class="period-btn" @click="insertOp('/')">÷</button>
                  <button class="period-btn" @click="insertOp('(')">(</button>
                  <button class="period-btn" @click="insertOp(')')">)</button>
                </div>
                <input v-model="kpiForm.expression" class="input formula-input"
                  :placeholder="t('config.formulaPlaceholder')" />
                <div class="formula-mode-hint">{{ t('config.formulaModeHint') }}</div>
              </div>
              <div class="editor-grid" style="margin-top:12px">
                <label>{{ t('common.label') }}</label>
                <input v-model="kpiForm.label" class="input" :placeholder="t('config.kpiLabelPlaceholder')" />
              </div>
            </template>

            <!-- 公共设置 -->
            <div class="editor-grid" style="margin-top:12px">
              <label>{{ t('config.format') }}</label>
              <select v-model="kpiForm.format" class="input select-sm">
                <option v-for="opt in KPI_FORMAT_OPTIONS" :key="opt.value" :value="opt.value">{{ t(opt.labelKey) }}
                </option>
              </select>
              <template v-if="kpiForm.format === 'currency'">
                <label>{{ t('config.prefix') }}</label>
                <input v-model="kpiForm.prefix" class="input input-sm" placeholder="¥" maxlength="4" />
                <label>{{ t('config.unit') }}</label>
                <select v-model="kpiForm.unit" class="input select-sm">
                  <option value="yuan">{{ t('config.unitOptions.yuan') }}</option>
                  <option value="wan">{{ t('config.unitOptions.wan') }}</option>
                  <option value="yi">{{ t('config.unitOptions.yi') }}</option>
                </select>
              </template>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" @click="saveKpi" :disabled="!canSaveKpi">{{ t('common.save') }}</button>
            <button class="btn" @click="cancelKpiEdit">{{ t('common.cancel') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 图表编辑器弹窗 -->
    <Teleport to="body">
      <div v-if="showChartEditor" class="modal-overlay" @click.self="cancelChartEdit">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>{{ editingChartId ? t('config.editChart') : t('config.addChart') }}</h3>
            <button class="btn-icon" @click="cancelChartEdit">✕</button>
          </div>
          <div class="modal-body">
            <div class="editor-grid">
              <label>{{ t('config.chartType') }}</label>
              <select v-model="chartForm.type" class="input select-sm">
                <option v-for="opt in CHART_TYPES" :key="opt.value" :value="opt.value">{{ t(opt.labelKey) }}</option>
              </select>
              <label>{{ t('config.dashboardTitle') }}</label>
              <input v-model="chartForm.title" class="input" placeholder="Chart title, {metric}/{metrics} supported" />

              <template v-if="isBasicChart(chartForm.type)">
                <label>{{ t('config.dimension') }}</label>
                <select v-model="chartForm.dimension" class="input select-sm">
                  <option value="">{{ t('common.none') }}</option>
                  <option v-for="col in dimensionCols" :key="col" :value="col">{{ col }}</option>
                </select>
                <label>{{ t('config.metric') }}</label>
                <div class="metric-chips">
                  <label v-for="col in allMetricCols" :key="col" class="chip sm"
                    :class="{ active: chartForm.metrics.includes(col) }">
                    <input type="checkbox" :checked="chartForm.metrics.includes(col)" @change="toggleChartMetric(col)"
                      hidden />
                    {{ col }}
                  </label>
                </div>
                <div v-if="chartForm.metrics.length > 0" class="metric-formats">
                  <div class="mf-title">{{ t('config.perMetricAgg') }}</div>
                  <div v-for="m in chartForm.metrics" :key="m" class="mf-row">
                    <span class="mf-name">{{ m }}</span>
                    <select v-model="chartForm.metricAggs[m]" class="input input-sm mf-agg">
                      <option value="sum">{{ t('config.aggSum') }}</option>
                      <option value="avg">{{ t('config.aggAvg') }}</option>
                      <option value="count">{{ t('config.aggCount') }}</option>
                      <option value="unique_count">{{ t('config.aggUniqueCount') }}</option>
                      <option value="min">{{ t('config.aggMin') }}</option>
                      <option value="max">{{ t('config.aggMax') }}</option>
                    </select>
                  </div>
                </div>
              </template>

              <template v-if="chartForm.type === 'timeseries'">
                <label>{{ t('config.dateColumn') }}</label>
                <select v-model="chartForm.dateColumn" class="input select-sm">
                  <option value="">{{ t('config.selectDateColumn') }}</option>
                  <option v-for="col in dateCols" :key="col" :value="col">{{ col }}</option>
                </select>
                <label>{{ t('config.metric') }}</label>
                <div class="metric-chips">
                  <label v-for="col in allMetricCols" :key="col" class="chip sm"
                    :class="{ active: chartForm.metrics.includes(col) }">
                    <input type="checkbox" :checked="chartForm.metrics.includes(col)" @change="toggleChartMetric(col)"
                      hidden />
                    {{ col }}
                  </label>
                </div>
                <div v-if="chartForm.metrics.length > 0" class="metric-formats">
                  <div class="mf-title">{{ t('config.perMetricAgg') }}</div>
                  <div v-for="m in chartForm.metrics" :key="m" class="mf-row">
                    <span class="mf-name">{{ m }}</span>
                    <select v-model="chartForm.metricAggs[m]" class="input input-sm mf-agg">
                      <option value="sum">{{ t('config.aggSum') }}</option>
                      <option value="avg">{{ t('config.aggAvg') }}</option>
                      <option value="count">{{ t('config.aggCount') }}</option>
                      <option value="unique_count">{{ t('config.aggUniqueCount') }}</option>
                      <option value="min">{{ t('config.aggMin') }}</option>
                      <option value="max">{{ t('config.aggMax') }}</option>
                    </select>
                  </div>
                </div>
              </template>

              <template v-if="chartForm.type === 'decile'">
                <label>{{ t('config.metric') }}</label>
                <div class="metric-chips">
                  <label v-for="col in allMetricCols" :key="col" class="chip sm"
                    :class="{ active: chartForm.metrics.includes(col) }">
                    <input type="checkbox" :checked="chartForm.metrics.includes(col)" @change="toggleChartMetric(col)"
                      hidden />
                    {{ col }}
                  </label>
                </div>
                <div v-if="chartForm.metrics.length > 0" class="metric-formats">
                  <div class="mf-title">{{ t('config.perMetricAgg') }}</div>
                  <div v-for="m in chartForm.metrics" :key="m" class="mf-row">
                    <span class="mf-name">{{ m }}</span>
                    <select v-model="chartForm.metricAggs[m]" class="input input-sm mf-agg">
                      <option value="sum">{{ t('config.aggSum') }}</option>
                      <option value="avg">{{ t('config.aggAvg') }}</option>
                      <option value="count">{{ t('config.aggCount') }}</option>
                      <option value="unique_count">{{ t('config.aggUniqueCount') }}</option>
                      <option value="min">{{ t('config.aggMin') }}</option>
                      <option value="max">{{ t('config.aggMax') }}</option>
                    </select>
                  </div>
                </div>
              </template>

              <template v-if="chartForm.type === 'cluster'">
                <label>{{ t('config.kValue') }}</label>
                <input v-model.number="chartForm.k" type="number" class="input input-sm" min="2" max="10" />
                <label>{{ t('config.clusterMetricsLabel') }}</label>
                <div class="metric-chips">
                  <label v-for="col in allMetricCols" :key="col" class="chip sm"
                    :class="{ active: chartForm.clusterMetrics.includes(col) }">
                    <input type="checkbox" :checked="chartForm.clusterMetrics.includes(col)"
                      @change="toggleClusterMetric(col)" hidden />
                    {{ col }}
                  </label>
                </div>
                <div v-if="chartForm.clusterMetrics.length > 0" class="metric-formats">
                  <div class="mf-title">{{ t('config.perMetricAgg') }}</div>
                  <div v-for="m in chartForm.clusterMetrics" :key="m" class="mf-row">
                    <span class="mf-name">{{ m }}</span>
                    <select v-model="chartForm.metricAggs[m]" class="input input-sm mf-agg">
                      <option value="sum">{{ t('config.aggSum') }}</option>
                      <option value="avg">{{ t('config.aggAvg') }}</option>
                      <option value="count">{{ t('config.aggCount') }}</option>
                      <option value="unique_count">{{ t('config.aggUniqueCount') }}</option>
                      <option value="min">{{ t('config.aggMin') }}</option>
                      <option value="max">{{ t('config.aggMax') }}</option>
                    </select>
                  </div>
                </div>
              </template>

              <template v-if="chartForm.type === 'histogram'">
                <label>{{ t('config.metric') }}</label>
                <select v-model="chartForm.metric" class="input select-sm" @change="onHistogramMetricChange">
                  <option value="">{{ t('config.selectMetricPlaceholder') }}</option>
                  <option v-for="col in allMetricCols" :key="col" :value="col">{{ col }}</option>
                </select>
              </template>

              <template v-if="chartForm.type === 'line'">
                <label>{{ t('config.dateColumn') }}</label>
                <select v-model="chartForm.dateColumn" class="input select-sm">
                  <option value="">{{ t('config.noDateUseDimension') }}</option>
                  <option v-for="col in dateCols" :key="col" :value="col">{{ col }}</option>
                </select>
                <label>{{ t('config.dimension') }}</label>
                <select v-model="chartForm.dimension" class="input select-sm">
                  <option value="">{{ t('common.none') }}</option>
                  <option v-for="col in dimensionCols" :key="col" :value="col">{{ col }}</option>
                </select>
                <label>{{ t('config.metric') }}</label>
                <div class="metric-chips">
                  <label v-for="col in allMetricCols" :key="col" class="chip sm"
                    :class="{ active: chartForm.metrics.includes(col) }">
                    <input type="checkbox" :checked="chartForm.metrics.includes(col)" @change="toggleChartMetric(col)"
                      hidden />
                    {{ col }}
                  </label>
                </div>
                <div v-if="chartForm.metrics.length > 0" class="metric-formats">
                  <div class="mf-title">{{ t('config.perMetricAgg') }}</div>
                  <div v-for="m in chartForm.metrics" :key="m" class="mf-row">
                    <span class="mf-name">{{ m }}</span>
                    <select v-model="chartForm.metricAggs[m]" class="input input-sm mf-agg">
                      <option value="sum">{{ t('config.aggSum') }}</option>
                      <option value="avg">{{ t('config.aggAvg') }}</option>
                      <option value="count">{{ t('config.aggCount') }}</option>
                      <option value="unique_count">{{ t('config.aggUniqueCount') }}</option>
                      <option value="min">{{ t('config.aggMin') }}</option>
                      <option value="max">{{ t('config.aggMax') }}</option>
                    </select>
                  </div>
                </div>
              </template>

              <!-- 筛选条件（通用） -->
              <label>{{ t('config.filterCondition') }}</label>
              <div class="filter-wrap">
                <input v-model="chartForm.filter" class="input filter-input" :placeholder="t('config.leaveEmptyAll')"
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
                <span class="filter-hint">{{ t('config.filterSyntax') }}</span>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" @click="saveChart" :disabled="!canSaveChart">{{ t('common.save') }}</button>
            <button class="btn" @click="cancelChartEdit">{{ t('common.cancel') }}</button>
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
import { usePreviewStore } from '@/stores/preview-store'
import { augmentComputedCols } from '@/core/formula-engine'
import type { ConfigSection } from '@/stores/config-store'
import { CHART_TYPES, AGG_OPTIONS, KPI_FORMAT_OPTIONS } from '@/types/config'
import type { ChartFormItem } from '@/types/config'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'

const router = useRouter()
import { storeToRefs } from 'pinia'

const { t } = useI18n()
const dataStore = useDataStore()
const configStore = useConfigStore()
const previewStore = usePreviewStore()

// Extract reactive refs for role overrides
const { roleOverrides } = storeToRefs(dataStore)

// 全部区域是否都已保存（与快照一致）
const allSaved = computed(() => {
  const sections: ConfigSection[] = ['title', 'filters', 'dateColumn', 'kpis', 'charts', 'table', 'computedCols']
  return sections.every((s) => configStore.isSectionSaved(s))
})

const savedCount = computed(() => {
  const sections: ConfigSection[] = ['title', 'filters', 'dateColumn', 'kpis', 'charts', 'table', 'computedCols']
  return sections.filter((s) => configStore.isSectionSaved(s)).length
})
const totalSections = 7

// Reset hint popup — shown on first visit, toggleable via icon
const RESET_HINT_KEY = 'smartboard-reset-hint-dismissed'
const showResetHint = ref(!localStorage.getItem(RESET_HINT_KEY))
function toggleResetHint() {
  showResetHint.value = !showResetHint.value
  localStorage.setItem(RESET_HINT_KEY, '1')
}

// Config export/import
const configMsg = ref('')
async function exportConfig() {
  try {
    const json = configStore.exportFullConfig()
    // Tauri native save dialog
    const filePath = await save({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      defaultPath: (configStore.config.title || 'smartboard-config') + '.json',
    })
    if (!filePath) return
    await writeTextFile(filePath, json)
    configMsg.value = t('config.exportSuccess')
    setTimeout(() => { configMsg.value = '' }, 2000)
  } catch {
    const json = configStore.exportFullConfig()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (configStore.config.title || 'smartboard-config') + '.json'
    a.click()
    URL.revokeObjectURL(url)
  }
}

async function importConfig(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const result = configStore.importFullConfig(text)
    configMsg.value = result.ok
      ? result.message
      : t('config.importError')
    setTimeout(() => { configMsg.value = '' }, 3000)
  } catch {
    configMsg.value = t('config.importError')
    setTimeout(() => { configMsg.value = '' }, 3000)
  } finally {
    input.value = ''
  }
}

// ====== Accordion state ======
const expandedSections = ref(new Set<ConfigSection>(['title', 'filters', 'dateColumn', 'kpis', 'charts', 'table', 'computedCols']))
function toggleConfigSection(section: ConfigSection) {
  if (expandedSections.value.has(section)) {
    expandedSections.value.delete(section)
  } else {
    expandedSections.value.add(section)
  }
  expandedSections.value = new Set(expandedSections.value)
}
function isSectionOpen(section: ConfigSection): boolean {
  return expandedSections.value.has(section)
}

// ====== Preview computed ======
const previewSpec = computed(() => previewStore.buildSpec())

type KpiPreview = { label: string; value: number; format: string; prefix: string; unit?: string; decimals?: number }
const previewKpis = computed((): KpiPreview[] => {
  const spec = previewSpec.value
  if (!spec) return []
  return spec.kpis.map((k) => {
    const val = previewStore.computeKpiValue(k)
    return { label: k.label, value: val, format: k.format || '', prefix: k.prefix || '', unit: k.unit, decimals: k.decimals }
  })
})

function formatPreviewValue(kpi: KpiPreview): string {
  const n = kpi.value
  if (kpi.format === 'percent') return n.toFixed(kpi.decimals ?? 1) + '%'
  if (kpi.format === 'integer') return Math.round(n).toLocaleString()
  if (kpi.format === 'currency') {
    const p = kpi.prefix || ''
    if (kpi.unit === 'wan') return p + (n / 10000).toFixed(kpi.decimals ?? 2).toLocaleString() + '万'
    if (kpi.unit === 'yi') return p + (n / 100000000).toFixed(kpi.decimals ?? 2).toLocaleString() + '亿'
    return p + n.toFixed(kpi.decimals ?? 2).toLocaleString()
  }
  return n.toFixed(kpi.decimals ?? 2).toLocaleString()
}

/** 关联列颜色调色板（按关联表顺序：淡蓝 → 淡粉 → 浅绿） */
const ASSOC_PALETTE = [
  { headerBg: '#c5dcff', cellBg: '#e3efff' },  // 淡蓝
  { headerBg: '#ffcdd9', cellBg: '#ffe3ea' },  // 淡粉
  { headerBg: '#c5ecc5', cellBg: '#e3f6e3' },  // 浅绿
]

/** 关联表列 → 表序号映射（带 "表名." 前缀的列，用于按表着色） */
const associatedColumnMap = computed(() => {
  const map = new Map<string, number>()
  if (!dataStore.hasRelations) return map
  const ds = dataStore.dataSet
  if (!ds) return map
  const mainHeaders = new Set(ds.headers)
  let relIdx = 0
  for (const rel of dataStore.relations) {
    const rightDs = dataStore.tables[rel.rightTableId]
    if (!rightDs) { relIdx++; continue }
    const prefix = dataStore.getTableDisplayName(rightDs)
    for (const rh of rightDs.headers) {
      if (rh === rel.rightColumn && mainHeaders.has(rh)) continue
      if (mainHeaders.has(rh)) {
        map.set(prefix + '.' + rh, relIdx)
      }
    }
    relIdx++
  }
  return map
})

function getAssocColStyle(col: string, isHeader: boolean): Record<string, string> {
  const style: Record<string, string> = {}
  // 用户自定义列颜色（优先级高于关联表着色）
  const userBg = configStore.config.table.columnColors?.[col]
  const userFg = configStore.config.table.columnTextColors?.[col]
  if (userBg) {
    style.backgroundColor = isHeader ? userBg : (userBg + '40')
  } else {
    const idx = associatedColumnMap.value.get(col)
    if (idx !== undefined) {
      const p = ASSOC_PALETTE[idx % ASSOC_PALETTE.length]
      style.backgroundColor = isHeader ? p.headerBg : p.cellBg
    }
  }
  if (userFg) style.color = isHeader ? userFg : (userFg + 'c0')
  return style
}

/** 预览表格的排序列 */
const previewTableCols = computed(() => {
  const cols = [...configStore.config.table.columns]
  // 追加已选中的计算列
  const cc = configStore.config.table.computedColumns
  if (cc) {
    for (const c of cc) {
      if (c.selected !== false && c.name && !cols.includes(c.name)) {
        cols.push(c.name)
      }
    }
  }
  const order = configStore.config.table.columnOrder
  if (!order || order.length === 0) return cols
  const rank = new Map(order.map((c, i) => [c, i]))
  return [...cols].sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity))
})

/** 前 3 行数据预览（含计算列），优先 Rust 后端数据 */
const previewTableRows = computed(() => {
  const rows = previewStore.effectiveRows.slice(0, 3)
  const rustCC = previewStore.computedColumnData
  if (rustCC && Object.keys(rustCC).length > 0) {
    return rows.map((row, idx) => {
      const aug = { ...row }
      for (const [col, values] of Object.entries(rustCC)) {
        aug[col] = values[idx] ?? 0
      }
      return aug
    })
  }
  return augmentComputedCols(rows, configStore.config.table.computedColumns || [])
})

function previewCellValue(val: any, col?: string): string {
  if (val === undefined || val === null || val === '') return '—'
  if (typeof val === 'number') {
    if (col) {
      const fmt = configStore.config.table.columnFormats?.[col]
      if (fmt?.format) {
        if (fmt.format === 'integer') return Math.round(val).toLocaleString()
        if (fmt.format === 'percent') return val.toFixed(fmt.decimals ?? 1) + '%'
        if (fmt.format === 'currency') {
          const prefix = fmt.prefix || ''
          if (fmt.unit === 'wan') return prefix + (val / 10000).toFixed(fmt.decimals ?? 2).toLocaleString() + '万'
          if (fmt.unit === 'yi') return prefix + (val / 100000000).toFixed(fmt.decimals ?? 2).toLocaleString() + '亿'
          return prefix + val.toFixed(fmt.decimals ?? 2).toLocaleString()
        }
        return val.toFixed(fmt.decimals ?? 2).toLocaleString()
      }
    }
    const s = val.toLocaleString(undefined, { maximumFractionDigits: 4 })
    return s.length > 30 ? s.slice(0, 28) + '…' : s
  }
  const s = String(val)
  return s.length > 30 ? s.slice(0, 28) + '…' : s
}

// ====== Drag state ======
const dragList = ref<'kpi' | 'chart' | 'table' | null>(null)
const dragIdx = ref(-1)
const dragPlaceholder = ref(-1)
let dragGhost: HTMLElement | null = null
let dragStartY = 0
let dragOffY = 0

function onPointerDown(e: PointerEvent, idx: number, list: 'kpi' | 'chart' | 'table') {
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

  // 临时隐藏幽灵，确保 elementsFromPoint 不会返回幽灵元素
  dragGhost.style.display = 'none'
  const els = document.elementsFromPoint(e.clientX, e.clientY)
  dragGhost.style.display = ''

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
    } else if (list === 'table') {
      configStore.reorderTableColumns(from, to)
    }
  }
}

const numericCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  const headers = dataStore.hasRelations ? allHeaders.value : ds.headers
  return headers.filter((h) => {
    const cls = dataStore.getEffectiveClassification(h) || ds.classifications[h]
    return cls?.type === 'numeric' && effRole(h) === 'metric' && !dataStore.excludedColumns.has(h)
  })
})

const dimensionCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  const headers = dataStore.hasRelations ? allHeaders.value : ds.headers
  return headers.filter(
    (h) => effRole(h) === 'dimension' && !dataStore.excludedColumns.has(h),
  )
})

const allHeaders = computed(() => {
  // Phase 4: 多表时使用预览存储的有效列头（与 buildEffectiveDS 一致）
  if (dataStore.hasRelations) return previewStore.effectiveHeaders
  return dataStore.dataSet?.headers ?? []
})

/** 表格列配置的排序列表（支持拖拽重排，含计算列） */
const orderedTableCols = computed(() => {
  const headers = [...allHeaders.value]
  // 追加已选中的计算列
  const cc = configStore.config.table.computedColumns
  if (cc) {
    for (const c of cc) {
      if (c.selected !== false && c.name && !headers.includes(c.name)) {
        headers.push(c.name)
      }
    }
  }
  const order = configStore.config.table.columnOrder
  if (!order || order.length === 0) return headers
  const seen = new Set(order)
  const result = order.filter(h => headers.includes(h))
  for (const h of headers) {
    if (!seen.has(h)) result.push(h)
  }
  return result
})

// 列头变化时同步 columnOrder（不在 computed 内 mutate）
watch([orderedTableCols, () => configStore.config.table.columnOrder], () => {
  const order = configStore.config.table.columnOrder
  const cols = orderedTableCols.value
  if (!order || order.length === 0) return
  if (cols.length !== order.length || cols.some((h, i) => h !== order[i])) {
    configStore.config.table.columnOrder = [...cols]
  }
}, { flush: 'sync' })

/** 未排除的列（供筛选器 datalist 使用，避免引用已排除列） */
const filterableColumns = computed(() =>
  allHeaders.value.filter((h) => !dataStore.excludedColumns.has(h)),
)

/** 判断列是否为数值类型（数值列用 > < >= <=，非数值列用 in ~） */
function isNumericCol(col: string): boolean {
  if (isComputedCol(col)) return true
  return (dataStore.getEffectiveClassification(col) || dataStore.dataSet?.classifications[col])?.type === 'numeric'
}

function chartTypeLabel(type: string): string {
  return t(CHART_TYPES.find((ct) => ct.value === type)?.labelKey ?? type)
}

// ====== KPI editor ======

const KPI_AGG_OPTIONS = [
  { value: 'sum', labelKey: 'config.aggSum' },
  { value: 'avg', labelKey: 'config.aggAvg' },
  { value: 'count', labelKey: 'config.aggCount' },
  { value: 'unique_count', labelKey: 'config.aggUniqueCount' },
  { value: 'min', labelKey: 'config.aggMin' },
  { value: 'max', labelKey: 'config.aggMax' },
]

interface KpiVariable { alias: string; column: string; filter: string }
const showKpiEditor = ref(false)
const editingKpiIdx = ref(-1)
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

const ALIAS_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

// 已保存的 KPI 标签（可复用参数：含公式和单列计算）
const calculatedParams = computed(() => {
  return configStore.config.kpis
    .filter(k => k.label && (k.formula || k.column))
    .map(k => ({ label: k.label, formula: k.formula, column: k.column }))
})

const allNumericCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  return ds.headers.filter((h) => ds.classifications[h]?.type === 'numeric' && !dataStore.excludedColumns.has(h))
})

const allDataCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  if (dataStore.hasRelations) return allHeaders.value.filter((h) => !dataStore.excludedColumns.has(h))
  let cols = ds.headers.filter((h) => !dataStore.excludedColumns.has(h))
  // 追加已选中的计算列
  const cc = configStore.config.table.computedColumns
  if (cc) {
    for (const c of cc) {
      if (c.selected !== false && c.name && !cols.includes(c.name)) {
        cols.push(c.name)
      }
    }
  }
  return cols
})

const canSaveKpi = computed(() => {
  if (!kpiForm.label.trim()) return false
  if (kpiForm.useFormula) {
    return kpiForm.variables.length >= 1 && kpiForm.variables.every(v => v.column) && kpiForm.expression.trim()
  }
  return !!kpiForm.column
})

function aggLabel(agg: string): string {
  return t(KPI_AGG_OPTIONS.find((o) => o.value === agg)?.labelKey ?? agg)
}

function addVariable() {
  const idx = kpiForm.variables.length
  kpiForm.variables.push({ alias: idx < 26 ? ALIAS_POOL[idx] : 'V' + idx, column: '', filter: '' })
}

function insertAlias(alias: string) {
  kpiForm.expression += alias
}

function insertFunc(func: string) {
  kpiForm.expression += func + '()'
}

function insertOp(op: string) {
  kpiForm.expression += ` ${op} `
}

function openAddKpi() {
  editingKpiIdx.value = -1
  kpiForm.useFormula = false
  kpiForm.column = allDataCols.value[0] || ''
  kpiForm.label = ''
  kpiForm.agg = 'sum'
  kpiForm.format = 'global'
  kpiForm.prefix = ''
  kpiForm.filter = ''
  kpiForm.variables = [{ alias: 'A', column: '', filter: '' }, { alias: 'B', column: '', filter: '' }]
  kpiForm.expression = 'SUM(A*B)'
  showKpiEditor.value = true
}

function openEditKpi(idx: number) {
  editingKpiIdx.value = idx
  const kpi = configStore.config.kpis[idx]
  if (kpi.formula) {
    kpiForm.useFormula = true
    // 兼容旧格式（无 alias 字段）→ 自动转换
    if (kpi.formula.variables.length > 0 && (kpi.formula.variables[0] as any).alias === undefined) {
      const ALIAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      kpiForm.variables = (kpi.formula.variables as any[]).map((v: any, i: number) => ({
        alias: ALIAS[i] || 'V' + i,
        column: v.column || '',
        filter: v.filter || '',
      }))
      kpiForm.expression = (kpi.formula.expression || '').replace(/\[(\d+)\]/g, (_, idx: string) => ALIAS[Number(idx)] || 'V' + idx)
    } else {
      kpiForm.variables = kpi.formula.variables.map(v => ({ alias: v.alias, column: v.column, filter: v.filter || '' }))
      kpiForm.expression = kpi.formula.expression
    }
    kpiForm.filter = kpi.formula.filter || ''
    kpiForm.column = ''
    kpiForm.agg = 'sum'
  } else {
    kpiForm.useFormula = false
    kpiForm.column = kpi.column
    kpiForm.agg = kpi.agg
    kpiForm.filter = kpi.filter || ''
    kpiForm.variables = [{ alias: 'A', column: '', filter: '' }, { alias: 'B', column: '', filter: '' }]
    kpiForm.expression = 'SUM(A*B)'
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
        alias: v.alias,
        column: v.column,
        filter: v.filter.trim() || undefined,
      })),
      expression: kpiForm.expression.trim(),
      filter: kpiForm.filter.trim() || undefined,
    }
  } else {
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

// Phase 5: 数据恢复（从 tables 中恢复 dataSet）
function recoverData() {
  const keys = Object.keys(dataStore.tables)
  if (keys.length > 0) {
    dataStore.switchTable(keys[0])
  }
}

function refreshPreview() {
  previewStore.applyFilters()
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

function effRole(col: string): string {
  const override = roleOverrides.value[col]
  if (override) return override
  // 计算列默认视为指标
  if (isComputedCol(col)) return 'metric'
  // 跨表列：优先用 getEffectiveClassification 查找所有表的分类
  const cls = dataStore.getEffectiveClassification(col)
  if (cls?.role) return cls.role
  return dataStore.dataSet?.classifications[col]?.role || 'ignore'
}

/** 判断是否为计算列 */
function isComputedCol(col: string): boolean {
  return (configStore.config.table.computedColumns || []).some(c => c.name === col && c.selected !== false)
}

const allMetricCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  const ro = roleOverrides.value
  const headers = dataStore.hasRelations ? allHeaders.value : ds.headers
  const cols = headers.filter((h) => {
    const cls = dataStore.getEffectiveClassification(h) || ds.classifications[h]
    return (ro[h] || cls?.role) === 'metric' && !dataStore.excludedColumns.has(h)
  })
  // 追加已选中的计算列（计算列默认视为指标类型）
  const cc = configStore.config.table.computedColumns
  if (cc) {
    for (const c of cc) {
      if (c.selected !== false && c.name && !cols.includes(c.name)) {
        cols.push(c.name)
      }
    }
  }
  return cols
})

const dateCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  const headers = dataStore.hasRelations ? allHeaders.value : ds.headers
  return headers.filter((h) => {
    const cls = dataStore.getEffectiveClassification(h) || ds.classifications[h]
    return cls?.type === 'date' && !dataStore.excludedColumns.has(h)
  })
})

// ====== Chart selection ======
const selectedCharts = computed(() =>
  configStore.config.charts.filter((c) => c.selected !== false)
)
const selectedChartCount = computed(() => selectedCharts.value.length)

const selectedKpiCount = computed(() =>
  configStore.config.kpis.filter((k) => k.selected !== false).length
)

// ====== Date column multi-select ======
// undefined = 全选（默认状态），[] = 不选任何列，[...] = 显式选中列表
const selectedDateCols = computed({
  get: () => {
    const d = configStore.config.dateColumns
    return d === undefined ? dateCols.value : d
  },
  set: (v) => { configStore.config.dateColumns = v },
})
function toggleDateCol(col: string) {
  const current = configStore.config.dateColumns // undefined | string[]
  if (current === undefined) {
    // 全选状态 → 取消当前列，其余保持选中
    const arr = dateCols.value.filter(c => c !== col)
    configStore.config.dateColumns = arr.length === dateCols.value.length ? undefined : arr
    return
  }
  const arr = [...current]
  const idx = arr.indexOf(col)
  if (idx !== -1) arr.splice(idx, 1)
  else arr.push(col)
  // 全部重新选中 → 回到 undefined（全选）
  if (arr.length === dateCols.value.length) {
    configStore.config.dateColumns = undefined
  } else {
    configStore.config.dateColumns = arr
  }
}

// ====== 图表编辑器相关 ======

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
  chartForm.dimension = dimensionCols.value[0] || ''
  chartForm.metric = allMetricCols.value[0] || ''
  chartForm.metrics = allMetricCols.value.length > 0 ? [allMetricCols.value[0]] : []
  chartForm.dateColumn = dateCols.value[0] || ''
  chartForm.agg = 'sum'
  chartForm.k = 3
  chartForm.clusterMetrics = allMetricCols.value.slice(0, 2)
  chartForm.filter = ''
  chartForm.format = 'global'
  chartForm.unit = 'yuan'
  chartForm.metricFormats = {}
  chartForm.metricAggs = {}
  // 初始化选中指标的聚合默认值
  initMetricAggs()
}

/** 为 chartForm.metrics / clusterMetrics 中没有 agg 的指标补充默认 'sum' */
function initMetricAggs() {
  for (const m of chartForm.metrics) {
    if (!chartForm.metricAggs[m]) chartForm.metricAggs[m] = 'sum'
  }
  for (const m of chartForm.clusterMetrics) {
    if (!chartForm.metricAggs[m]) chartForm.metricAggs[m] = 'sum'
  }
  if (chartForm.metric && !chartForm.metricAggs[chartForm.metric]) {
    chartForm.metricAggs[chartForm.metric] = 'sum'
  }
}

// 图表类型切换时重置相关字段默认值（仅在新建/手动切换时生效，编辑时不重置）
let _editingChart = false
watch(() => chartForm.type, (newType) => {
  if (_editingChart) return
  // 重置 metric/metrics/clusterMetrics 避免旧类型数据残留
  chartForm.metrics = allMetricCols.value.length > 0 ? [allMetricCols.value[0]] : []
  chartForm.clusterMetrics = allMetricCols.value.slice(0, 2)
  chartForm.metric = allMetricCols.value[0] || ''
  chartForm.dimension = dimensionCols.value[0] || ''
  chartForm.dateColumn = dateCols.value[0] || ''
  chartForm.metricFormats = {}
  chartForm.metricAggs = {}
  initMetricAggs()
})

function openAddChart() {
  resetChartForm()
  editingChartId.value = null
  showChartEditor.value = true
}

function openEditChart(chart: ChartFormItem) {
  _editingChart = true
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
  _editingChart = false
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
  max-width: 1200px;
  margin: 0 auto;
}

.no-data {
  text-align: center;
  padding: 64px;
  color: var(--text-secondary);
}

.config-header {
  margin-bottom: 16px;
  text-align: center;
  position: relative;
}

.config-header-top {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 4px;
  min-height: 36px;
}

.config-header-top .btn-ghost {
  position: absolute;
  left: 0;
}

.header-actions {
  position: absolute;
  right: 0;
  top: 0;
  display: flex;
  gap: 6px;
  align-items: center;
}

.header-actions .btn-save,
.header-actions .btn-reset-sec,
.header-actions .btn-export,
.header-actions .btn-import {
  width: auto;
  height: auto;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 5px;
  white-space: nowrap;
}

.btn-export,
.btn-import {
  background: transparent;
  border: 1px dashed var(--border);
  color: var(--text-secondary);
  cursor: pointer;
}

.btn-export:hover,
.btn-import:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.config-toast {
  text-align: right;
  font-size: 12px;
  padding: 2px 0;
  color: #065f46;
}

.config-header h2 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 0;
  line-height: 36px;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 14px;
  text-align: center;
}

/* Reset hint popup */
.reset-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.reset-info-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 4px;
  line-height: 1;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.reset-info-btn:hover {
  opacity: 1;
}

.reset-popup {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  width: 320px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 12px;
  color: #92400e;
  line-height: 1.6;
  box-shadow: 0 4px 16px rgba(0, 0, 0, .12);
  z-index: 100;
  text-align: left;
}

.reset-popup::before {
  content: '';
  position: absolute;
  top: -6px;
  right: 18px;
  width: 10px;
  height: 10px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-right: none;
  border-bottom: none;
  transform: rotate(45deg);
}

@media (prefers-color-scheme: dark) {
  .reset-popup {
    background: #292524;
    border-color: #78350f;
    color: #fde68a;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .4);
  }

  .reset-popup::before {
    background: #292524;
    border-color: #78350f;
  }
}

.config-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}

.config-top {
  margin-bottom: 12px;
}

/* Tab 切换 */
.config-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 12px;
  border-bottom: 2px solid var(--border);
}

.config-tab {
  padding: 6px 16px;
  border: none;
  background: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: color 0.2s, border-color 0.2s;
}

.config-tab:hover {
  color: var(--text-primary);
}

.config-tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.config-top-inner {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.config-top-row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.config-right-col {
  width: 100%;
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.config-right-col .config-section {
  flex: 1;
  min-width: 0;
  margin-bottom: 0;
}

.config-col-stack {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-top-row .config-section {
  min-width: 0;
  margin-bottom: 0;
}

.config-top-row>.config-section {
  width: 100%;
}

.config-top-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.config-top-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.config-top-head .config-top-title {
  margin-bottom: 0;
}

.config-bottom-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.config-bottom-head {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.config-bottom-head .config-bottom-title {
  margin-bottom: 0;
}

.config-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100vh - 140px);
  overflow-y: auto;
  padding-right: 4px;
}

.config-section {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
}

/* Section header with per-section save/reset */
.section-header-row {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  padding: 1px 0;
}

.section-header-row h3 {
  margin-bottom: 0;
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.sec-arrow {
  font-size: 9px;
  color: var(--text-secondary);
  width: 12px;
  flex-shrink: 0;
}

.sec-tag {
  font-size: 10px;
  font-weight: 400;
  color: var(--primary);
  background: var(--primary-light, #eff6ff);
  padding: 1px 6px;
  border-radius: 8px;
  margin-left: 2px;
}

.section-actions {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}

.section-body {
  padding-top: 8px;
}

.config-section h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.btn-save {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  padding: 0;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.btn-save:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.btn-save.saved {
  color: #16a34a;
  border-color: transparent;
}

.btn-reset-sec {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  padding: 0;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
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

.section-body .input {
  width: 100%;
  box-sizing: border-box;
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
  gap: 5px;
  margin-bottom: 8px;
}

.kpi-item {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 5px 8px;
  background: var(--bg);
  border-radius: 6px;
  border: 1px solid transparent;
  transition: border-color 0.15s;
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

.var-alias {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--primary);
  color: white;
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
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

.func-btn {
  background: #e8f0fe;
  color: #1a73e8;
  border-color: #c4d7f2;
  font-weight: 600;
  font-size: 11px;
  padding: 3px 8px;
}

.formula-mode-hint {
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.7;
  margin-top: 6px;
  line-height: 1.4;
}

.filter-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-input {
  width: 100%;
  min-height: 34px;
  height: auto;
  line-height: 1.4;
  padding: 6px 10px;
  box-sizing: border-box;
}

.filter-hint {
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.7;
}

.calc-mode-toggle {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
}

.calc-mode-hint {
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.75;
  margin-bottom: 10px;
  line-height: 1.4;
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

/* Chart list */
.chart-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chart-item {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 4px 8px;
  background: var(--bg);
  border-radius: 6px;
  border: 1px solid transparent;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.tct-row.drag-placeholder {
  outline: 2px dashed var(--primary);
  outline-offset: -2px;
  background: rgba(59, 130, 246, 0.06);
}

.chart-item.drag-placeholder {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, .25);
  background: rgba(59, 130, 246, .06);
}

.chart-item-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.chart-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.chart-type-badge {
  display: inline-flex;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  background: var(--primary-light);
  color: var(--primary);
}

.chart-title {
  flex: 1;
  font-weight: 500;
  font-size: 13px;
}

.chart-item-detail {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--text-secondary);
  flex-wrap: wrap;
  align-items: center;
}

/* Chart select checkbox (bottom-right) */
.chart-select-cb {
  margin-left: auto;
  margin-top: auto;
  cursor: pointer;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.chart-select-cb input[type="checkbox"] {
  width: 14px;
  height: 14px;
  accent-color: var(--primary);
  cursor: pointer;
  margin: 0;
}

/* Chart quick actions bar */
.chart-quick-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-secondary);
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

.modal-sm {
  width: 440px;
}

.modal-sm .modal-body {
  padding: 16px 20px;
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

/* Table config - Column Table (参考全局指标格式) */
.table-col-table {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow-x: auto;
  overflow-y: visible;
  margin-bottom: 16px;
}

.tct-header,
.tct-row {
  display: grid;
  grid-template-columns: 24px 1fr 0.3fr 0.3fr 0.25fr 0.25fr 0.5fr 0.4fr 0.25fr;
  gap: 4px;
  padding: 8px 10px;
  align-items: center;
}

.tct-col-drag {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.tct-drag {
  cursor: grab;
  color: var(--text-secondary);
  font-size: 12px;
  letter-spacing: -2px;
  user-select: none;
  opacity: 0.4;
}

.tct-drag:active {
  cursor: grabbing;
}

.tct-row:hover .tct-drag {
  opacity: 0.8;
}

.tct-header {
  background: var(--bg-hover);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  position: sticky;
  top: 0;
  z-index: 1;
}

.tct-header span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tct-row {
  border-top: 1px solid var(--border-light);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.tct-row:hover {
  background: var(--bg-hover);
}

.tct-row.role-ignore {
  opacity: 0.55;
}

.tct-col-cb {
  display: flex;
  align-items: center;
  justify-content: center;
}

.tct-col-cb input[type="checkbox"] {
  width: 14px;
  height: 14px;
  accent-color: var(--primary);
  cursor: pointer;
  margin: 0;
}

.tct-col-name {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--text-primary);
}

.tct-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  background: rgba(128, 128, 128, .10);
  font-size: 12px;
  flex-shrink: 0;
}

.tct-col-type,
.tct-col-role {
  font-size: 11px;
  color: var(--text-secondary);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tct-col-bgcolor,
.tct-col-txtcolor {
  display: flex;
  align-items: center;
  gap: 2px;
  justify-content: center;
}

.tct-col-format {
  min-width: 56px;
  display: flex;
  gap: 2px;
  align-items: center;
}

.tct-color-clear {
  width: 16px;
  height: 16px;
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
}

.tct-color-clear:hover {
  color: #ef4444;
}

.tct-col-summary {
  display: flex;
  justify-content: center;
}

.tct-summary-sel {
  font-size: 11px;
  padding: 1px 4px;
  height: 22px;
  width: 64px;
  border-radius: 4px;
  border: 1px solid var(--border-light);
  background: var(--bg);
  color: var(--text-secondary);
  cursor: pointer;
}

.tct-fmt-sel {
  font-size: 10px;
  padding: 0 4px;
  height: 22px;
  min-width: 70px;
  max-width: 90px;
  border-radius: 4px;
  border: 1px solid var(--border-light);
  background: var(--bg);
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}

.tct-unit-sel {
  font-size: 9px;
  padding: 0 2px;
  height: 20px;
  width: 38px;
  border-radius: 3px;
  border: 1px solid var(--border-light);
  background: var(--bg);
  color: var(--text-secondary);
  cursor: pointer;
}

.tct-dec-input {
  font-size: 9px;
  padding: 0 2px;
  height: 20px;
  width: 28px;
  border-radius: 3px;
  border: 1px solid var(--border-light);
  background: var(--bg);
  color: var(--text-secondary);
  text-align: center;
}

.tct-dec-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
}

.tct-col-rules {
  display: flex;
  align-items: center;
  justify-content: center;
}

.tct-rule-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-light);
  background: var(--bg);
  border-radius: 4px;
  width: 28px;
  height: 22px;
  cursor: pointer;
  padding: 0;
  font-size: 11px;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.tct-rule-toggle:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.tct-rule-toggle.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.tct-rule-count {
  font-size: 10px;
  font-weight: 600;
}

.tct-rule-add-icon {
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
}

.tct-na {
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.4;
}

/* Column conditional text rules (expand row) */
.tct-rule-expand {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 10px 8px 10px;
  margin-left: auto;
  width: fit-content;
  min-width: 120px;
  border-top: 1px dashed var(--border-light);
  background: var(--bg);
  font-size: 11px;
}

.tct-rule-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tct-rule-cond {
  flex: 1;
  font-size: 11px;
  padding: 3px 6px;
  height: 24px;
}

.tct-rule-remove {
  font-size: 10px;
  opacity: 0.4;
}

.tct-rule-remove:hover {
  opacity: 1;
  color: #ef4444;
}

.tct-rule-add-btn {
  font-size: 11px;
  padding: 2px 0;
  text-align: left;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  margin-top: 2px;
}

/* Shared: mini color picker (table + row condition) */
.color-picker-mini {
  width: 18px;
  height: 18px;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px;
  cursor: pointer;
  background: transparent;
  flex-shrink: 0;
}

.color-picker-mini.rule-text-color {
  border-style: dashed;
}

/* Shared table config rows (row limit, row condition color) */
.table-config-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.table-config-bottom {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.computed-cols-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.computed-cols-section>label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.cc-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cc-modal-chips {
  margin-top: 8px;
}

.cc-modal-chips-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
  display: block;
}

.cc-modal-cb {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 13px;
  cursor: pointer;
}

.cc-field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.cc-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-light);
}

.cc-modal-cb input {
  margin: 0;
}

.cc-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cc-name {
  width: 56px;
  flex-shrink: 0;
}

.cc-expr {
  flex: 1;
  min-width: 0;
}

.cc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding-left: 60px;
}

.cc-chip {
  display: inline-flex;
  padding: 1px 5px;
  font-size: 10px;
  border-radius: 3px;
  border: 1px solid var(--border);
  background: var(--bg-hover);
  color: var(--text-secondary);
  cursor: pointer;
  line-height: 1.4;
  white-space: nowrap;
}

.cc-chip:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-light);
}

.cc-add-btn {
  font-size: 13px;
}

.cc-help {
  font-size: 10px;
  color: var(--text-secondary);
  opacity: 0.7;
}

.table-row-limit-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.table-row-cond-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.table-row-cond-wrap>label {
  flex-shrink: 0;
  padding-top: 3px;
}

.table-row-cond-wrap>label,
.table-row-limit-wrap label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.table-col-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--text-secondary);
}

.row-limit-toggle {
  display: flex;
  align-items: center;
  width: 64px;
  height: 28px;
  border-radius: 14px;
  background: var(--bg-hover);
  border: 1px solid var(--border);
  cursor: pointer;
  position: relative;
  user-select: none;
}

.rlt-knob {
  position: absolute;
  left: 2px;
  width: 30px;
  height: 22px;
  border-radius: 11px;
  background: var(--primary);
  transition: left 0.2s;
}

.rlt-knob.right {
  left: 30px;
}

.rlt-label {
  flex: 1;
  text-align: center;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-secondary);
  z-index: 1;
  transition: color 0.2s;
}

.rlt-label.active {
  color: #fff;
}

.rule-cond-input {
  flex: 1;
  min-width: 140px;
  font-size: 11px;
  height: 24px;
  padding: 2px 6px;
}

.color-rule-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
  padding: 2px 4px;
  background: var(--bg);
  border-radius: 5px;
  border: 1px solid var(--border-light);
}

.rule-index {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 14px;
  text-align: center;
  font-family: monospace;
}

.rule-remove {
  flex-shrink: 0;
  opacity: 0.5;
  transition: opacity 0.15s;
  font-size: 10px;
}

.rule-remove:hover {
  opacity: 1;
}

.color-picker {
  width: 32px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px;
  cursor: pointer;
  background: transparent;
}

.row-colors-list {
  display: flex;
  flex-direction: column;
}

.flex-1 {
  flex: 1;
}

/* Preview panel */
.config-preview {
  min-width: 0;
  position: relative;
}

.btn-refresh-preview {
  position: absolute;
  bottom: 8px;
  right: 8px;
  color: #fff;
  background: #10B981;
  border: 1px solid #10B981;
  border-radius: 5px;
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.2s;
  z-index: 10;
}

.btn-refresh-preview:hover {
  opacity: 1;
  background: #059669;
  border-color: #059669;
}

.preview-dash {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 14px 40px 14px;
  min-height: 240px;
  width: 100%;
  box-sizing: border-box;
}

.preview-dash-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.preview-dash-header h3 {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-refresh {
  color: #fff;
  background: #10B981;
  border-color: #10B981;
}

.btn-refresh:hover {
  background: #059669;
  border-color: #059669;
}

.preview-filters {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.pf-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.pf-chip {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 12px;
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Preview section labels */
.preview-section {
  margin-bottom: 14px;
}

.ps-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 8px 0;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-light);
}

.preview-kpi-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.preview-kpi-card {
  flex: 1;
  min-width: 100px;
  background: var(--bg);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 10px 12px;
  text-align: center;
}

.pk-label {
  font-size: 10px;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.pk-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.preview-chart-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

.preview-canvas {
  min-height: 100px;
  margin-bottom: 12px;
  width: 100%;
}

.preview-chart-card {
  background: var(--bg);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pc-type {
  font-size: 10px;
  font-weight: 600;
  color: var(--primary);
  text-transform: uppercase;
}

.pc-title {
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-table-info {
  display: flex;
  gap: 20px;
  font-size: 12px;
  color: var(--text-secondary);
}

.preview-table-mini-wrap {
  margin-top: 8px;
  overflow-x: auto;
  border: 1px solid var(--border-light);
  border-radius: 6px;
}

.preview-table-mini {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.preview-table-mini th {
  background: var(--bg-hover);
  padding: 5px 8px;
  text-align: left;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  border-bottom: 1px solid var(--border-light);
}

.preview-table-mini td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-primary);
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-table-mini tr:last-child td {
  border-bottom: none;
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

.md-header,
.md-row {
  display: grid;
  grid-template-columns: 1fr 80px 54px 46px 46px 42px 50px 60px;
  gap: 4px;
  align-items: center;
}

.md-header {
  padding: 8px 10px;
  background: var(--bg-hover);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.md-row {
  padding: 6px 10px;
  border-top: 1px solid var(--border-light);
  font-size: 12px;
  transition: background 0.15s;
}

.md-row:hover {
  background: var(--bg-hover);
}

.md-col-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.md-col-cb {
  text-align: center;
  font-size: 11px;
  white-space: nowrap;
}

.md-na {
  color: var(--text-secondary);
  font-size: 11px;
  text-align: center;
}

.md-sel {
  width: 100%;
  font-size: 11px;
}

.md-dec {
  width: 100%;
  text-align: center;
  font-size: 12px;
  height: 26px;
  line-height: 24px;
  box-sizing: border-box;
  -moz-appearance: textfield;
}

.md-dec::-webkit-outer-spin-button,
.md-dec::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.md-prefix {
  width: 100%;
  text-align: center;
  font-size: 11px;
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
  width: 14px;
  height: 14px;
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

/* ====== Column Card Grid（参考 Upload 页面 DataPreview 风格） ====== */
.col-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.col-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}

.col-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.col-card.is-expanded {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, .2);
}

.col-card.role-metric {
  background: var(--role-metric-bg);
}

.col-card.role-dimension {
  background: var(--role-dimension-bg);
}

.col-card.role-time_axis {
  background: var(--role-time-bg);
}

.col-card.role-label {
  background: var(--role-label-bg);
}

.col-card.role-ignore {
  background: var(--role-ignore-bg);
  opacity: 0.6;
}

.col-card.is-computed {
  border-left: 3px solid #f59e0b;
}

/* 虚拟卡片：新增计算列 */
.col-card-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 2px dashed var(--border);
  background: transparent !important;
  cursor: pointer;
  min-height: 64px;
  transition: all 0.15s;
}

.col-card-add:hover {
  border-color: var(--primary);
  background: rgba(59, 130, 246, .04) !important;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.col-add-icon {
  font-size: 20px;
  color: var(--text-secondary);
  line-height: 1;
}

.col-add-text {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.col-card.drag-placeholder {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, .25);
  background: rgba(59, 130, 246, .06);
}

.col-drag {
  cursor: grab;
  color: var(--text-secondary);
  font-size: 12px;
  user-select: none;
  opacity: 0.3;
  flex-shrink: 0;
  padding: 0 2px;
  line-height: 1;
}

.col-drag:hover {
  opacity: 0.7;
}

.col-drag:active {
  cursor: grabbing;
}

.col-icon {
  font-size: 16px;
  flex-shrink: 0;
  width: 24px;
  text-align: center;
}

.col-text {
  flex: 1;
  min-width: 0;
}

.col-name {
  font-weight: 600;
  font-size: 13px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-computed-badge {
  display: inline-flex;
  padding: 1px 5px;
  border-radius: 3px;
  background: #f59e0b;
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  margin-left: 4px;
  vertical-align: middle;
  flex-shrink: 0;
}

.col-meta {
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  display: block;
  margin-top: 1px;
}

.col-meta:hover {
  color: var(--primary);
}

.col-vis-cb {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  cursor: pointer;
}

.col-vis-cb input[type="checkbox"] {
  width: 14px;
  height: 14px;
  accent-color: var(--primary);
  cursor: pointer;
  margin: 0;
}

.col-expand-icon {
  font-size: 10px;
  color: var(--text-secondary);
  flex-shrink: 0;
  opacity: 0.4;
  transition: opacity 0.15s;
}

.col-expand-icon.is-edit {
  font-size: 13px;
  opacity: 0.5;
}

.col-card:hover .col-expand-icon {
  opacity: 0.7;
}

.col-card:hover .col-expand-icon.is-edit {
  opacity: 0.9;
}

/* ====== 卡片原位展开的设置面板（绝对定位） ====== */
.col-card-wrap {
  position: relative;
}

.col-settings-inline {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 100%;
  width: max-content;
  max-width: 340px;
  z-index: 20;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  animation: csp-slide-down 0.15s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

@keyframes csp-slide-down {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.csi-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-light);
}

.csi-icon {
  font-size: 15px;
}

.csi-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.csi-meta {
  font-size: 11px;
  color: var(--text-secondary);
  margin-left: 4px;
}

.csi-close {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
}

.csi-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.csi-body {
  padding: 10px 12px;
}

/* ====== 纵向设置行 ====== */
.col-card-settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ccs-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ccs-label {
  width: 48px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
}

.ccs-control {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ccs-control-inline {
  flex-wrap: wrap;
}

.color-picker-sm {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 2px;
  cursor: pointer;
  background: transparent;
  flex-shrink: 0;
}

.ccs-clear {
  width: 18px;
  height: 18px;
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
  border-radius: 3px;
}

.ccs-clear:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, .08);
}

.ccs-select {
  font-size: 12px;
  padding: 4px 24px 4px 8px;
  height: 28px;
  line-height: 28px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: #ffffff !important;
  color: #1a1a1a !important;
  -webkit-text-fill-color: #1a1a1a !important;
  cursor: pointer;
  width: 120px;
  flex-shrink: 0;
}

.ccs-select-sm {
  width: 64px;
  min-width: 64px;
}

.ccs-input-sm {
  font-size: 12px;
  padding: 4px 8px;
  height: 28px;
  line-height: 28px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: #ffffff !important;
  color: #1a1a1a !important;
  -webkit-text-fill-color: #1a1a1a !important;
  width: 64px;
  text-align: center;
  box-sizing: border-box;
  flex-shrink: 0;
}

.ccs-input-sm::placeholder {
  color: #999;
}

.ccs-input-sm::-webkit-inner-spin-button {
  -webkit-appearance: none;
}

/* ====== 条件着色规则面板 ====== */
.col-card-rules-panel {
  margin-top: 14px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg);
}

.ccrp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  transition: background 0.12s;
  border-bottom: 1px solid var(--border-light);
}

.ccrp-header:hover {
  background: var(--bg-hover);
}

.ccrp-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
}

.ccrp-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: var(--primary);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  padding: 0 5px;
}

.ccrp-arrow {
  font-size: 10px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.ccrp-body {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ccrp-rule-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ccrp-cond {
  flex: 1;
  min-width: 120px;
}

.ccrp-add-btn {
  font-size: 12px;
  padding: 4px 0;
  text-align: left;
}
</style>
