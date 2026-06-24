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
            <button class="btn btn-sm btn-reset-sec" @click="configStore.resetAllToAuto()">{{ t('config.resetAll')
              }}</button>
          </div>
        </div>
        <p class="subtitle">{{ t('config.hint') }}</p>
      </div>

      <div class="config-layout">
        <!-- 左侧：配置栏 -->
        <div class="config-panel">
          <!-- 标题 -->
          <section class="config-section">
            <div class="section-header-row" @click="toggleConfigSection('title')">
              <span class="sec-arrow">{{ isSectionOpen('title') ? '▼' : '▶' }}</span>
              <h3>{{ t('config.dashboardTitle') }}</h3>
              <div class="section-actions" @click.stop>
                <button class="btn btn-sm btn-save" :class="{ saved: configStore.isSectionSaved('title') }"
                  @click="configStore.saveSection('title')">{{ configStore.isSectionSaved('title') ? '✅' : '💾' }}</button>
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
                  @click="configStore.saveSection('filters')">{{ configStore.isSectionSaved('filters') ? '✅' : '💾' }}</button>
                <button class="btn btn-sm btn-reset-sec" @click="configStore.resetSectionToAuto('filters')">↺</button>
              </div>
            </div>
            <div v-show="isSectionOpen('filters')" class="section-body">
              <div class="filter-chips">
                <label v-for="col in dimensionCols" :key="col" class="chip"
                  :class="{ active: configStore.config.filters.includes(col) }">
                  <input type="checkbox" :checked="configStore.config.filters.includes(col)"
                    @change="configStore.toggleFilter(col)" hidden />
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
                  @click="configStore.saveSection('dateColumn')">{{ configStore.isSectionSaved('dateColumn') ? '✅' : '💾' }}</button>
                <button class="btn btn-sm btn-reset-sec" @click="configStore.resetSectionToAuto('dateColumn')">↺</button>
              </div>
            </div>
            <div v-show="isSectionOpen('dateColumn')" class="section-body">
              <p class="sec-desc">{{ t('config.timeSliceHint') }}</p>
              <div class="filter-chips">
                <label v-for="col in dateCols" :key="col" class="chip"
                  :class="{ active: selectedDateCols.includes(col) }">
                  <input type="checkbox" :checked="selectedDateCols.includes(col)"
                    @change="toggleDateCol(col)" hidden />
                  {{ col }}
                </label>
              </div>
              <p v-if="selectedDateCols.length > 0" class="sec-desc" style="margin-top:6px">
                {{ t('config.date') }}{{ previewSpec?.dateRange?.min }} ~ {{ previewSpec?.dateRange?.max }}
              </p>
            </div>
          </section>

          <!-- 全局指标格式 -->
          <section class="config-section">
            <div class="section-header-row" @click="toggleConfigSection('metricDefaults')">
              <span class="sec-arrow">{{ isSectionOpen('metricDefaults') ? '▼' : '▶' }}</span>
              <h3>{{ t('config.globalMetricFormat') }}</h3>
              <div class="section-actions" @click.stop>
                <button class="btn btn-sm btn-save" :class="{ saved: configStore.isSectionSaved('metricDefaults') }"
                  @click="saveMetricDefaults">{{ configStore.isSectionSaved('metricDefaults') ? '✅' : '💾' }}</button>
                <button class="btn btn-sm btn-reset-sec" @click="resetMetricDefaults">↺</button>
              </div>
            </div>
            <div v-show="isSectionOpen('metricDefaults')" class="section-body">
              <p class="sec-desc">{{ t('config.globalMetricHint') }}</p>
              <div class="metric-defaults-table">
              <div class="md-header">
                <span class="md-col-name">{{ t('config.metricColumn') }}</span>
                <span class="md-col-fmt">{{ t('config.format') }}</span>
                <span class="md-col-unit">{{ t('config.unit') }}</span>
                <span class="md-col-prefix">{{ t('config.prefix') }}</span>
                <span class="md-col-dec">{{ t('config.decimals') }}</span>
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
            </div>
          </section>

          <!-- KPI -->
          <section class="config-section">
            <div class="section-header-row" @click="toggleConfigSection('kpis')">
              <span class="sec-arrow">{{ isSectionOpen('kpis') ? '▼' : '▶' }}</span>
              <h3>{{ t('config.kpiCards') }} ({{ configStore.config.kpis.length }}) <span class="drag-hint">{{ t('config.dragHint') }}</span></h3>
              <div class="section-actions" @click.stop>
                <button class="btn btn-sm btn-save" :class="{ saved: configStore.isSectionSaved('kpis') }"
                  @click="configStore.saveSection('kpis')">{{ configStore.isSectionSaved('kpis') ? '✅' : '💾' }}</button>
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
                    <span v-if="kpi.formula" class="kpi-formula-tag">公式</span>
                    <span v-else class="kpi-col-tag">{{ kpi.column }}</span>
                    <span class="kpi-agg-tag">{{ aggLabel(kpi.agg) }}</span>
                    <span v-if="kpi.filter" class="kpi-filter-tag" :title="kpi.filter">{{ t('common.filter') }}</span>
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
              <h3>{{ t('config.charts') }} ({{ configStore.config.charts.length }}) <span class="drag-hint">{{ t('config.dragHint') }}</span></h3>
              <div class="section-actions" @click.stop>
                <button class="btn btn-sm btn-save" :class="{ saved: configStore.isSectionSaved('charts') }"
                  @click="configStore.saveSection('charts')">{{ configStore.isSectionSaved('charts') ? '✅' : '💾' }}</button>
                <button class="btn btn-sm btn-reset-sec" @click="configStore.resetSectionToAuto('charts')">↺</button>
              </div>
            </div>
            <div v-show="isSectionOpen('charts')" class="section-body">
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
                    <span v-if="chart.metrics?.length">{{ t('config.metric') }}: {{ chart.metrics.join(', ') }}</span>
                    <span v-if="chart.metric && !chart.metrics?.length">{{ t('config.metric') }}: {{ chart.metric
                    }}</span>
                    <span v-if="chart.dateColumn">{{ t('config.date') }} {{ chart.dateColumn }}</span>
                    <span v-if="chart.k">K: {{ chart.k }}</span>
                  </div>
                </div>
              </div>
            </div>
            <button class="btn btn-sm btn-add" @click="openAddChart">{{ t('config.addChart') }}</button>
            </div>
          </section>

          <!-- 表格 -->
          <section class="config-section">
            <div class="section-header-row" @click="toggleConfigSection('table')">
              <span class="sec-arrow">{{ isSectionOpen('table') ? '▼' : '▶' }}</span>
              <h3>{{ t('config.sections.table') }}</h3>
              <div class="section-actions" @click.stop>
                <button class="btn btn-sm btn-save" :class="{ saved: configStore.isSectionSaved('table') }"
                  @click="configStore.saveSection('table')">{{ configStore.isSectionSaved('table') ? '✅' : '💾' }}</button>
                <button class="btn btn-sm btn-reset-sec" @click="configStore.resetSectionToAuto('table')">↺</button>
              </div>
            </div>
            <div v-show="isSectionOpen('table')" class="section-body">

            <!-- 显示列：卡片式布局（轻量化） -->
            <div class="table-col-header">
              <span>{{ t('config.displayColumns') }} ({{ configStore.config.table.columns.length }}/{{ allHeaders.length
              }})</span>
              <button class="btn-link" @click="configStore.config.table.columns = allHeaders.slice()">{{
                t('common.selectAll') }}</button>
              <button class="btn-link" @click="configStore.config.table.columns = []">{{ t('common.clearAll')
                }}</button>
            </div>
            <div class="table-col-grid">
              <div v-for="col in allHeaders" :key="col" class="table-col-card" :class="[
                'role-' + (dataStore.dataSet?.classifications[col]?.role || 'ignore'),
              ]" @click="configStore.toggleTableColumn(col)">
                <label class="tcc-cb" @click.stop>
                  <input type="checkbox" :checked="configStore.config.table.columns.includes(col)"
                    @change="configStore.toggleTableColumn(col)" />
                </label>
                <div class="tcc-row">
                  <div class="tcc-icon">
                    <span>{{ roleIcon(dataStore.dataSet?.classifications[col]?.role) }}</span>
                  </div>
                  <div class="tcc-body">
                    <div class="tcc-name">{{ col }}</div>
                    <div class="tcc-meta">
                      {{ typeLabel(dataStore.dataSet?.classifications[col]?.type) }} · {{
                        roleLabel(dataStore.dataSet?.classifications[col]?.role) }}
                    </div>
                  </div>
                  <!-- 颜色选择器：背景色 + 字体色 -->
                  <div class="tcc-color" @click.stop>
                    <input type="color" class="color-picker-mini"
                      :value="configStore.config.table.columnColors?.[col] || '#ffffff'"
                      @input="(e) => configStore.setColumnColor(col, (e.target as HTMLInputElement).value)"
                      :title="t('config.columnColor')" />
                    <input type="color" class="color-picker-mini tcc-text-color"
                      :value="configStore.config.table.columnTextColors?.[col] || '#000000'"
                      @input="(e) => configStore.setColumnTextColor(col, (e.target as HTMLInputElement).value)"
                      :title="t('config.columnTextColor')" />
                    <button v-if="configStore.config.table.columnColors?.[col] || configStore.config.table.columnTextColors?.[col]"
                      class="tcc-color-clear"
                      @click.stop="configStore.setColumnColor(col, ''); configStore.setColumnTextColor(col, '')"
                      :title="t('config.removeColor')">✕</button>
                  </div>
                </div>
                <!-- 列条件着色规则（折叠） -->
                <div class="tcc-rule-area" v-if="dataStore.dataSet?.classifications[col]?.type === 'numeric'">
                  <button class="tcc-rule-toggle"
                    :class="{ active: expandedColRules.has(col) }"
                    @click.stop="toggleColRules(col)">
                    <span class="tcc-rule-icon">{{ expandedColRules.has(col) ? '▼' : '▶' }}</span>
                    <span>{{ t('config.columnTextRule') }}</span>
                    <span v-if="ruleCount(col)" class="tcc-rule-count">{{ ruleCount(col) }}</span>
                  </button>
                  <div v-if="expandedColRules.has(col)" class="tcc-rule-list" @click.stop>
                    <div v-for="(rule, ri) in (configStore.config.table.columnTextRules?.[col] || [])" :key="ri"
                      class="tcc-rule-row">
                      <input type="text" class="input input-xs tcc-rule-cond" :value="rule.condition"
                        :placeholder="t('config.columnTextRulePlaceholder')"
                        @input="(e) => configStore.setColumnTextRule(col, ri, { condition: (e.target as HTMLInputElement).value, color: rule.color })" />
                      <input type="color" class="color-picker-mini rule-text-color" :value="rule.color"
                        @input="(e) => configStore.setColumnTextRule(col, ri, { condition: rule.condition, color: (e.target as HTMLInputElement).value })"
                        :title="t('config.columnTextColor')" />
                      <button class="btn-icon tcc-rule-remove" @click="configStore.removeColumnTextRule(col, ri)">✕</button>
                    </div>
                    <button class="btn-link tcc-rule-add"
                      @click="configStore.setColumnTextRule(col, (configStore.config.table.columnTextRules?.[col]?.length || 0), { condition: '', color: '#333333' })">
                      {{ t('config.columnTextRuleAdd') }}</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 行数限制：All / 限定数量 toggle -->
            <div class="table-config-bottom">
              <div class="table-row-limit-wrap">
                <label>{{ t('config.rowLimit') }}</label>
                <div class="row-limit-toggle" @click="configStore.config.table.rowLimit = configStore.config.table.rowLimit === 'all' ? 15 : 'all'">
                  <span class="rlt-knob" :class="{ right: configStore.config.table.rowLimit !== 'all' }"></span>
                  <span class="rlt-label left" :class="{ active: configStore.config.table.rowLimit === 'all' }">All</span>
                  <span class="rlt-label right" :class="{ active: configStore.config.table.rowLimit !== 'all' }">{{ typeof configStore.config.table.rowLimit === 'number' ? configStore.config.table.rowLimit : 15 }}</span>
                </div>
                <select v-if="typeof configStore.config.table.rowLimit === 'number'" v-model.number="configStore.config.table.rowLimit" class="input select-sm" style="width:70px">
                  <option v-for="n in [5,10,15,20,30,50,100,200,500]" :key="n" :value="n">{{ n }}</option>
                </select>
              </div>

              <!-- 行条件颜色 -->
              <div class="table-row-cond-wrap">
                <label>{{ t('config.rowConditionColor') }}</label>
                <div class="row-colors-list">
                  <div v-for="(rule, ri) in (configStore.config.table.rowConditionColors || [])" :key="'rc-' + ri" class="color-rule-row">
                    <span class="rule-index">{{ ri + 1 }}</span>
                    <input type="text" class="input input-xs rule-cond-input" :value="rule.condition"
                      :placeholder="t('config.rowConditionPlaceholder')" list="row-cond-cols"
                      @input="(e) => rule.condition = (e.target as HTMLInputElement).value" />
                    <input type="color" class="color-picker-mini" :value="rule.color"
                      @input="(e) => rule.color = (e.target as HTMLInputElement).value"
                      :title="t('config.columnColor')" />
                    <input type="color" class="color-picker-mini rule-text-color" :value="rule.textColor || '#000000'"
                      @input="(e) => rule.textColor = (e.target as HTMLInputElement).value"
                      :title="t('config.columnTextColor')" />
                    <button class="btn-icon rule-remove" @click="configStore.removeRowConditionColor(ri)" :title="t('config.removeColor')">✕</button>
                  </div>
                  <button class="btn-link tcc-rule-add"
                    @click="configStore.addRowConditionColor({ condition: '', color: '#ffff00' })">
                    {{ t('config.rowConditionColorAdd') }}</button>
                  <datalist id="row-cond-cols">
                    <template v-for="col in filterableColumns" :key="col">
                      <option :value="col + ' = '" />
                      <option :value="col + ' != '" />
                      <option v-if="isNumericCol(col)" :value="col + ' > '" />
                      <option v-if="isNumericCol(col)" :value="col + ' < '" />
                      <option v-if="!isNumericCol(col)" :value="col + ' in '" />
                      <option v-if="!isNumericCol(col)" :value="col + ' ~ '" />
                    </template>
                  </datalist>
                </div>
              </div>
            </div>
            </div>
          </section>
        </div>

        <!-- 右侧：实时预览 -->
        <div class="config-preview">
          <div class="preview-dash">
            <div class="preview-dash-header">
              <h3>{{ configStore.config.title || t('common.preview') }}</h3>
              <button class="btn btn-primary btn-sm" @click="goToDashboard">{{ t('config.generateArrow') }}</button>
            </div>
            <div class="save-status" v-if="allSaved">{{ t('config.savedAll') }}</div>
            <div class="save-status unsaved" v-else>{{ t('config.savedPartial', { n: savedCount, total: totalSections }) }}</div>

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
              <h4 class="ps-title">{{ t('config.kpiCards') }}</h4>
              <div class="preview-kpi-row">
                <div v-for="(kpi, i) in previewKpis" :key="'pk-'+i" class="preview-kpi-card">
                  <div class="pk-label">{{ kpi.label }}</div>
                  <div class="pk-value" style="font-size:16px">{{ formatPreviewValue(kpi) }}</div>
                </div>
              </div>
            </div>

            <!-- 图表占位预览 -->
            <div v-if="configStore.config.charts.length > 0" class="preview-section">
              <h4 class="ps-title">{{ t('config.charts') }}</h4>
              <div class="preview-chart-grid">
                <div v-for="(chart, i) in configStore.config.charts" :key="chart.id || i" class="preview-chart-card">
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
                <span>{{ t('config.dataRows') }}: {{ dataStore.dataSet?.rows.length || 0 }}</span>
              </div>
            </div>
          </div>
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
                  <option v-for="col in allNumericCols" :key="col" :value="col">{{ col }}</option>
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
                  <input v-model="kpiForm.filter" class="input" :placeholder="t('config.leaveEmptyAll')"
                    list="filter-cols" />
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
                  <span class="var-index">[{{ vi }}]</span>
                  <select v-model="v.column" class="input input-sm" style="flex:1">
                    <option value="">{{ t('config.selectColumnPlaceholder') }}</option>
                    <option v-for="col in allNumericCols" :key="col" :value="col">{{ col }}</option>
                  </select>
                  <select v-model="v.agg" class="input input-sm" style="width:72px">
                    <option value="sum">{{ t('config.aggSum') }}</option>
                    <option value="avg">{{ t('config.aggAvg') }}</option>
                    <option value="count">{{ t('config.aggCount') }}</option>
                    <option value="min">{{ t('config.aggMin') }}</option>
                    <option value="max">{{ t('config.aggMax') }}</option>
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
                  <input v-model="kpiForm.filter" class="input" :placeholder="t('config.leaveEmptyAll')"
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

                <div class="formula-label">{{ t('config.expression') }} <span class="formula-hint"></span></div>
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
                      <option value="min">{{ t('config.aggMin') }}</option>
                      <option value="max">{{ t('config.aggMax') }}</option>
                    </select>
                  </div>
                </div>
              </template>

              <!-- 筛选条件（通用） -->
              <label>{{ t('config.filterCondition') }}</label>
              <div class="filter-wrap">
                <input v-model="chartForm.filter" class="input" :placeholder="t('config.leaveEmptyAll')"
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
import type { ConfigSection } from '@/stores/config-store'
import { CHART_TYPES, AGG_OPTIONS, KPI_FORMAT_OPTIONS } from '@/types/config'
import type { ChartFormItem } from '@/types/config'

const router = useRouter()
const { t } = useI18n()
const dataStore = useDataStore()
const configStore = useConfigStore()
const previewStore = usePreviewStore()

// 全部区域是否都已保存（与快照一致）
const allSaved = computed(() => {
  const sections: ConfigSection[] = ['title', 'filters', 'dateColumn', 'metricDefaults', 'kpis', 'charts', 'table']
  return sections.every((s) => configStore.isSectionSaved(s))
})

const savedCount = computed(() => {
  const sections: ConfigSection[] = ['title', 'filters', 'dateColumn', 'metricDefaults', 'kpis', 'charts', 'table']
  return sections.filter((s) => configStore.isSectionSaved(s)).length
})
const totalSections = 7

// ====== Accordion state ======
const expandedSections = ref(new Set<ConfigSection>(['title', 'filters', 'dateColumn', 'kpis', 'charts', 'table', 'metricDefaults']))
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

// ====== Column conditional text rules ======
const expandedColRules = ref(new Set<string>())
function toggleColRules(col: string) {
  if (expandedColRules.value.has(col)) {
    expandedColRules.value.delete(col)
  } else {
    expandedColRules.value.add(col)
  }
  // trigger reactivity
  expandedColRules.value = new Set(expandedColRules.value)
}
function ruleCount(col: string): number {
  return configStore.config.table.columnTextRules?.[col]?.length || 0
}

// ====== Column card helpers (参考首页列信息卡片) ======
const roleIcons: Record<string, string> = {
  metric: '📊',
  dimension: '📋',
  time_axis: '📅',
  label: '🏷️',
  ignore: '—',
}
function roleIcon(role?: string): string {
  return role ? (roleIcons[role] ?? '') : ''
}
function typeLabel(type?: string): string {
  if (!type) return ''
  const map: Record<string, string> = {
    numeric: t('classification.type.numeric'),
    categorical: t('classification.type.categorical'),
    date: t('classification.type.date'),
    text: t('classification.type.text'),
  }
  return map[type] ?? type
}
function roleLabel(role?: string): string {
  if (!role) return ''
  const map: Record<string, string> = {
    metric: t('classification.role.metric'),
    dimension: t('classification.role.dimension'),
    time_axis: t('classification.role.time_axis'),
    label: t('classification.role.label'),
    ignore: t('classification.role.ignore'),
  }
  return map[role] ?? role
}

function chartTypeLabel(type: string): string {
  return t(CHART_TYPES.find((ct) => ct.value === type)?.labelKey ?? type)
}

// ====== KPI editor ======
const KPI_AGG_OPTIONS = [
  { value: 'sum', labelKey: 'config.aggSum' },
  { value: 'avg', labelKey: 'config.aggAvg' },
  { value: 'count', labelKey: 'config.aggCount' },
  { value: 'min', labelKey: 'config.aggMin' },
  { value: 'max', labelKey: 'config.aggMax' },
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
  return t(KPI_AGG_OPTIONS.find((o) => o.value === agg)?.labelKey ?? agg)
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
  kpiForm.column = allNumericCols.value[0] || ''
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

// ====== Date column multi-select ======
const selectedDateCols = computed({
  get: () => configStore.config.dateColumns || dateCols.value,
  set: (v) => { configStore.config.dateColumns = v },
})
function toggleDateCol(col: string) {
  const arr = [...selectedDateCols.value]
  const idx = arr.indexOf(col)
  if (idx !== -1) arr.splice(idx, 1)
  else arr.push(col)
  configStore.config.dateColumns = arr.length > 0 ? arr : undefined
}

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
  chartForm.dimension = dimensionCols.value[0] || ''
  chartForm.metric = allMetricCols.value[0] || ''
  chartForm.metrics = allMetricCols.value.length > 0 ? [allMetricCols.value[0]] : []
  chartForm.dateColumn = dateCols.value[0] || ''
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
.header-actions .btn-reset-sec {
  width: auto;
  height: auto;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 5px;
  white-space: nowrap;
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

.config-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
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
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.section-header-row h3 {
  margin-bottom: 0;
  flex: 1;
  font-size: 13px;
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
  padding: 6px 10px;
  background: var(--bg);
  border-radius: 6px;
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

/* Table config - Column Card Grid (参考首页列信息卡片) */
.table-col-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.table-col-card {
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
  user-select: none;
}

.tcc-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-right: 14px;
}

.table-col-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.07);
}

.table-col-card.role-metric {
  background: var(--role-metric-bg, #eff6ff);
}

.table-col-card.role-dimension {
  background: var(--role-dimension-bg, #f0fdf4);
}

.table-col-card.role-time_axis {
  background: var(--role-time-bg, #fefce8);
}

.table-col-card.role-label {
  background: var(--role-label-bg, #fef2f2);
}

.table-col-card.role-ignore {
  background: var(--role-ignore-bg, #f8fafc);
  opacity: 0.65;
}

.tcc-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: rgba(128, 128, 128, .10);
  font-size: 17px;
  flex-shrink: 0;
}

.tcc-body {
  flex: 1;
  min-width: 0;
}

.tcc-name {
  font-weight: 600;
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tcc-meta {
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 1px;
}

/* Checkbox inside card — top right */
.tcc-cb {
  position: absolute;
  top: 6px;
  right: 8px;
  z-index: 2;
  cursor: pointer;
}

.tcc-cb input[type="checkbox"] {
  width: 13px;
  height: 13px;
  accent-color: var(--primary);
  cursor: pointer;
  margin: 0;
}

.tcc-color {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  margin-right: 6px;
}

.color-picker-mini {
  width: 22px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px;
  cursor: pointer;
  background: transparent;
  flex-shrink: 0;
}
.color-picker-mini.tcc-text-color,
.color-picker-mini.rule-text-color {
  border-style: dashed;
}

.tcc-color-clear {
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

.tcc-color-clear:hover {
  color: #ef4444;
}

/* Column conditional text rules (inside card) */
.tcc-rule-area {
  border-top: 1px solid var(--border-light);
  padding-top: 6px;
  margin-top: 6px;
}
.tcc-rule-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: none;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px 0;
  width: 100%;
}
.tcc-rule-toggle:hover { color: var(--primary); }
.tcc-rule-toggle.active { color: var(--primary); font-weight: 500; }
.tcc-rule-icon { font-size: 8px; width: 10px; }
.tcc-rule-count {
  background: var(--primary);
  color: #fff;
  font-size: 9px;
  padding: 0 5px;
  border-radius: 8px;
  line-height: 16px;
  min-width: 16px;
  text-align: center;
}
.tcc-rule-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 4px;
}
.tcc-rule-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tcc-rule-cond {
  flex: 1;
  font-size: 11px;
  padding: 3px 6px;
  height: 24px;
}
.tcc-rule-row .color-picker-mini {
  width: 18px;
  height: 18px;
  padding: 0;
}
.tcc-rule-remove {
  font-size: 10px;
  opacity: 0.4;
}
.tcc-rule-remove:hover { opacity: 1; color: #ef4444; }
.tcc-rule-add {
  font-size: 11px;
  padding: 2px 0;
  text-align: left;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  margin-top: 2px;
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
  gap: 8px;
  margin-top: 12px;
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

.table-row-cond-wrap > label {
  flex-shrink: 0;
  padding-top: 3px;
}
.table-row-cond-wrap > label,
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
.rlt-knob.right { left: 30px; }
.rlt-label {
  flex: 1;
  text-align: center;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-secondary);
  z-index: 1;
  transition: color 0.2s;
}
.rlt-label.active { color: #fff; }

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
}

.preview-dash {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  min-height: 300px;
  width: 100%;
  box-sizing: border-box;
}

.preview-dash-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.preview-dash-header h3 {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  min-width: 120px;
  background: var(--bg);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 14px 16px;
  text-align: center;
}

.pk-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
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
