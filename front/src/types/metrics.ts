/**
 * TypeScript types for Metrics API responses.
 * Based on backend schemas at api/src/metrics/schemas.py
 */

// ==============================================================================
// Query Parameters
// ==============================================================================

export type PeriodType = "today" | "yesterday" | "week" | "month" | "custom";
export type GranularityType = "hourly" | "daily";

export interface MetricsQueryParams {
  period: PeriodType;
  start_date?: string; // ISO 8601
  end_date?: string; // ISO 8601
  granularity?: GranularityType;
  metric_name?: string;
}

// ==============================================================================
// Response Types
// ==============================================================================

export interface DashboardMetrics {
  period: string;
  period_start: string;
  period_end: string;
  requests_total: number;
  requests_success: number;
  requests_error: number;
  avg_response_time_ms: number;
  max_response_time_ms: number | null;
  active_users: number;
  new_users: number;
  enrollments: number;
  completions: number;
  comments: number;
  requests_trend: number;
  users_trend: number;
  enrollments_trend: number;
  generated_at: string;
}

export interface RequestMetrics {
  total_requests: number;
  requests_by_status: Record<string, number>;
  requests_by_method: Record<string, number>;
  avg_response_time_ms: number;
  min_response_time_ms: number | null;
  max_response_time_ms: number | null;
  p50_response_time_ms: number | null;
  p95_response_time_ms: number | null;
  p99_response_time_ms: number | null;
  slowest_endpoints: EndpointStats[];
  busiest_endpoints: EndpointStats[];
}

export interface EndpointStats {
  path: string;
  count: number;
  avg_ms: number;
}

export interface BusinessMetrics {
  enrollments: number;
  completions: number;
  course_completions: number;
  comments: number;
  reactions: number;
  new_users: number;
  active_users: number;
}

export interface UserMetrics {
  total_active: number | null;
  new_registrations: number;
  logins: number;
  unique_logins: number | null;
  by_hour: Record<string, number>;
}

export interface CourseMetrics {
  total_views: number;
  enrollments: number;
  completions: number;
  completion_rate: number;
  top_courses: CourseStats[];
  top_lessons: LessonStats[];
}

export interface CourseStats {
  id: string;
  title: string;
  views: number;
  enrollments: number;
}

export interface LessonStats {
  id: string;
  title: string;
  views: number;
  completions: number;
}

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
  metric: string;
  dimensions?: Record<string, string>;
}

export interface TimeSeriesResponse {
  metric_name: string;
  granularity: string;
  start_time: string;
  end_time: string;
  data: TimeSeriesPoint[];
  total_count: number;
  avg_value: number;
}

export interface RealtimeCounters {
  counters: Record<string, number>;
  timestamp: string;
  bucket: string;
}

export interface MetricsHealthResponse {
  healthy: boolean;
  emitter_running: boolean;
  queue_size: number;
  queue_capacity: number;
  queue_utilization: number;
  cassandra_connected: boolean;
  redis_connected: boolean;
  events_processed_total: number;
  events_dropped_total: number;
  last_flush_at: string | null;
  uptime_seconds: number;
}

// ==============================================================================
// Component Props Types
// ==============================================================================

export interface KPICardData {
  title: string;
  value: number | string;
  trend: number;
  trendIsPositive: boolean;
  icon: string;
  period: string;
  sparklineData?: number[];
}

export interface ChartDataPoint {
  timestamp: Date;
  value: number;
  label?: string;
}
