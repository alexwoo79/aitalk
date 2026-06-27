// src-tauri/src/commands/analysis.rs
// 高级分析命令 — 时序 / 十分位 / K-means 聚类
// 在 spawn_blocking 中执行，不阻塞 async 线程

use crate::types::ApiResult;
use serde::Serialize;
use std::collections::HashMap;

// ──────────────── 数据结构 ────────────────

#[derive(Debug, Serialize)]
pub struct TimeseriesResult {
    pub labels: Vec<String>,
    pub values: Vec<f64>,
    pub ma: Vec<Option<f64>>,
    pub mom: Vec<Option<f64>>,
    pub yoy: Vec<Option<f64>>,
    pub trend: Vec<f64>,
    pub forecast_labels: Vec<String>,
    pub forecast_values: Vec<f64>,
}

#[derive(Debug, Serialize)]
pub struct DecileResult {
    pub labels: Vec<String>,
    pub counts: Vec<usize>,
    pub sums: Vec<f64>,
    pub avgs: Vec<f64>,
    pub ranges: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ClusterPoint {
    pub x: f64,
    pub y: f64,
    pub cluster: usize,
    pub label: String,
}

#[derive(Debug, Serialize)]
pub struct ClusterResult {
    pub points: Vec<ClusterPoint>,
    pub centroids: Vec<(f64, f64)>,
    pub col_x: String,
    pub col_y: String,
}

// ──────────────── 辅助函数 ────────────────

fn parse_row_value(row: &HashMap<String, serde_json::Value>, col: &str) -> Option<f64> {
    row.get(col).and_then(|v| {
        if v.is_null() {
            None
        } else if let Some(n) = v.as_f64() {
            Some(n)
        } else if let Some(s) = v.as_str() {
            s.replace(',', "")
                .replace('%', "")
                .trim()
                .parse::<f64>()
                .ok()
        } else {
            None
        }
    })
}

fn get_period_key(date_str: &str, period: &str) -> Option<String> {
    let s = date_str.trim();
    if s.len() < 7 {
        return None;
    }
    let y = s[..4].parse::<i32>().ok()?;
    let mo = s[5..7].parse::<i32>().ok()?;
    match period {
        "year" => Some(format!("{}", y)),
        "quarter" => Some(format!("{}-Q{}", y, (mo + 2) / 3)),
        _ => Some(format!("{}-{:02}", y, mo)),
    }
}

fn next_period_keys(last: &str, period: &str, count: usize) -> Vec<String> {
    let mut result = Vec::new();
    let parts: Vec<&str> = last.split('-').collect();
    if period == "year" {
        let mut y: i32 = last.parse().unwrap_or(0);
        for _ in 0..count {
            y += 1;
            result.push(format!("{}", y));
        }
    } else if period == "quarter" {
        let y = parts[0].parse::<i32>().unwrap_or(0);
        let q_part = parts.last().unwrap_or(&"1");
        let q = q_part.trim_start_matches("Q").parse::<i32>().unwrap_or(1);
        let mut yr = y;
        let mut qt = q;
        for _ in 0..count {
            qt += 1;
            if qt > 4 {
                qt = 1;
                yr += 1;
            }
            result.push(format!("{}-Q{}", yr, qt));
        }
    } else {
        let y = parts[0].parse::<i32>().unwrap_or(0);
        let m = parts[1].parse::<i32>().unwrap_or(1);
        let mut yr = y;
        let mut mo = m;
        for _ in 0..count {
            mo += 1;
            if mo > 12 {
                mo = 1;
                yr += 1;
            }
            result.push(format!("{}-{:02}", yr, mo));
        }
    }
    result
}

fn fmt_compact(n: f64) -> String {
    let a = n.abs();
    if a >= 1e8 {
        format!("{:.1}亿", n / 1e8)
    } else if a >= 1e4 {
        format!("{:.1}万", n / 1e4)
    } else {
        format!("{:.1}", n)
    }
}

// ──────────────── Tauri commands ────────────────

#[tauri::command]
pub async fn compute_timeseries(
    rows_json: String,
    date_col: String,
    metric_col: String,
    period: String,
) -> ApiResult<TimeseriesResult> {
    tokio::task::spawn_blocking(move || {
        let rows: Vec<HashMap<String, serde_json::Value>> = match serde_json::from_str(&rows_json) {
            Ok(r) => r,
            Err(e) => return ApiResult::failure(format!("JSON解析失败: {e}")),
        };

        let mut groups: HashMap<String, f64> = HashMap::new();
        for row in &rows {
            let dv = row.get(&date_col).and_then(|v| v.as_str()).unwrap_or("");
            let key = match get_period_key(dv, &period) {
                Some(k) => k,
                None => continue,
            };
            if let Some(v) = parse_row_value(row, &metric_col) {
                *groups.entry(key).or_default() += v;
            }
        }

        let mut sorted: Vec<(String, f64)> = groups.into_iter().collect();
        sorted.sort_by(|a, b| a.0.cmp(&b.0));
        if sorted.len() < 2 {
            return ApiResult::failure("数据点不足");
        }

        let labels: Vec<String> = sorted.iter().map(|(k, _)| k.clone()).collect();
        let values: Vec<f64> = sorted.iter().map(|(_, v)| *v).collect();
        let n = values.len();

        // MA3
        let ma: Vec<Option<f64>> = (0..n)
            .map(|i| {
                if i < 2 {
                    None
                } else {
                    Some((values[i - 2] + values[i - 1] + values[i]) / 3.0)
                }
            })
            .collect();

        // MoM
        let mom: Vec<Option<f64>> = (0..n)
            .map(|i| {
                if i == 0 || values[i - 1] == 0.0 {
                    None
                } else {
                    Some((values[i] - values[i - 1]) / values[i - 1].abs() * 100.0)
                }
            })
            .collect();

        // YoY (monthly only)
        let yoy: Vec<Option<f64>> = if period == "month" && n > 12 {
            (0..n)
                .map(|i| {
                    if i < 12 || values[i - 12] == 0.0 {
                        None
                    } else {
                        Some((values[i] - values[i - 12]) / values[i - 12].abs() * 100.0)
                    }
                })
                .collect()
        } else {
            vec![None; n]
        };

        // Linear regression
        let mean_x = (n - 1) as f64 / 2.0;
        let mean_y = values.iter().sum::<f64>() / n as f64;
        let mut num = 0.0;
        let mut den = 0.0;
        for i in 0..n {
            let dx = i as f64 - mean_x;
            num += dx * (values[i] - mean_y);
            den += dx * dx;
        }
        let slope = if den != 0.0 { num / den } else { 0.0 };
        let intercept = mean_y - slope * mean_x;
        let trend: Vec<f64> = (0..n).map(|i| intercept + slope * i as f64).collect();

        let forecast_labels = next_period_keys(&labels[n - 1], &period, 3);
        let forecast_values: Vec<f64> =
            (0..3).map(|i| intercept + slope * (n + i) as f64).collect();

        ApiResult::success(TimeseriesResult {
            labels,
            values,
            ma,
            mom,
            yoy,
            trend,
            forecast_labels,
            forecast_values,
        })
    })
    .await
    .unwrap_or_else(|e| ApiResult::failure(format!("spawn_blocking error: {e}")))
}

#[tauri::command]
pub async fn compute_deciles(rows_json: String, metric_col: String) -> ApiResult<DecileResult> {
    tokio::task::spawn_blocking(move || {
        let rows: Vec<HashMap<String, serde_json::Value>> = match serde_json::from_str(&rows_json) {
            Ok(r) => r,
            Err(e) => return ApiResult::failure(format!("JSON解析失败: {e}")),
        };

        let mut nums: Vec<f64> = rows
            .iter()
            .filter_map(|r| parse_row_value(r, &metric_col))
            .filter(|n| !n.is_nan())
            .collect();

        if nums.len() < 10 {
            return ApiResult::failure("数据点不足（至少需要10个）");
        }

        nums.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let bucket_size = nums.len() / 10;

        let mut labels = Vec::new();
        let mut counts = Vec::new();
        let mut sums = Vec::new();
        let mut avgs = Vec::new();
        let mut ranges = Vec::new();

        for i in 0..10 {
            let start = i * bucket_size;
            let end = if i == 9 {
                nums.len()
            } else {
                (i + 1) * bucket_size
            };
            let bucket = &nums[start..end];
            let sum: f64 = bucket.iter().sum();

            labels.push(format!("D{:02}", i + 1));
            counts.push(bucket.len());
            sums.push(sum);
            avgs.push(if bucket.len() > 0 {
                sum / bucket.len() as f64
            } else {
                0.0
            });
            ranges.push(format!(
                "{}–{}",
                fmt_compact(bucket[0]),
                fmt_compact(bucket[bucket.len() - 1])
            ));
        }

        ApiResult::success(DecileResult {
            labels,
            counts,
            sums,
            avgs,
            ranges,
        })
    })
    .await
    .unwrap_or_else(|e| ApiResult::failure(format!("spawn_blocking error: {e}")))
}

#[tauri::command]
pub async fn compute_clusters(
    rows_json: String,
    metric_cols: Vec<String>,
    k: usize,
    x_col: Option<String>,
    y_col: Option<String>,
) -> ApiResult<ClusterResult> {
    tokio::task::spawn_blocking(move || {
        let rows: Vec<HashMap<String, serde_json::Value>> = match serde_json::from_str(&rows_json) {
            Ok(r) => r,
            Err(e) => return ApiResult::failure(format!("JSON解析失败: {e}")),
        };

        let col_x = x_col.unwrap_or_else(|| metric_cols.get(0).cloned().unwrap_or_default());
        let col_y = y_col.unwrap_or_else(|| {
            metric_cols
                .get(1)
                .or(metric_cols.get(0))
                .cloned()
                .unwrap_or_default()
        });
        if col_x.is_empty() || col_y.is_empty() {
            return ApiResult::failure("缺少指标列");
        }

        let k = k.max(1).min(10);
        let mut points: Vec<(f64, f64, String)> = Vec::new();
        for row in &rows {
            if let (Some(x), Some(y)) = (parse_row_value(row, &col_x), parse_row_value(row, &col_y))
            {
                let label = row
                    .values()
                    .next()
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                points.push((x, y, label));
            }
        }
        if points.len() < k {
            return ApiResult::failure("数据点不足");
        }

        // Init centroids
        let step = points.len() / k;
        let mut centroids: Vec<(f64, f64)> = (0..k)
            .map(|i| {
                let idx = (i * step).min(points.len() - 1);
                (points[idx].0, points[idx].1)
            })
            .collect();

        // Iterate
        let mut assignments = vec![0usize; points.len()];
        for _ in 0..20 {
            let new_assign: Vec<usize> = points
                .iter()
                .map(|(px, py, _)| {
                    let mut min_dist = f64::MAX;
                    let mut min_c = 0;
                    for (c, (cx, cy)) in centroids.iter().enumerate() {
                        let d = (px - cx).powi(2) + (py - cy).powi(2);
                        if d < min_dist {
                            min_dist = d;
                            min_c = c;
                        }
                    }
                    min_c
                })
                .collect();

            if new_assign == assignments {
                break;
            }
            assignments = new_assign;

            let mut sums: Vec<(f64, f64, usize)> = vec![(0.0, 0.0, 0); k];
            for (i, (px, py, _)) in points.iter().enumerate() {
                sums[assignments[i]].0 += px;
                sums[assignments[i]].1 += py;
                sums[assignments[i]].2 += 1;
            }
            centroids = sums
                .iter()
                .map(|(sx, sy, c)| {
                    if *c > 0 {
                        (sx / *c as f64, sy / *c as f64)
                    } else {
                        (0.0, 0.0)
                    }
                })
                .collect();
        }

        let cluster_points: Vec<ClusterPoint> = points
            .iter()
            .enumerate()
            .map(|(i, (x, y, label))| ClusterPoint {
                x: *x,
                y: *y,
                cluster: assignments[i],
                label: label.clone(),
            })
            .collect();

        ApiResult::success(ClusterResult {
            points: cluster_points,
            centroids,
            col_x,
            col_y,
        })
    })
    .await
    .unwrap_or_else(|e| ApiResult::failure(format!("spawn_blocking error: {e}")))
}
