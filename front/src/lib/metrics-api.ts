/**
 * Metrics API client.
 * Endpoints for admin metrics dashboard.
 */

import type {
  BusinessMetrics,
  CourseMetrics,
  DashboardMetrics,
  GranularityType,
  MetricsHealthResponse,
  MetricsQueryParams,
  PeriodType,
  RealtimeCounters,
  RequestMetrics,
  TimeSeriesResponse,
  UserMetrics,
} from "@/types/metrics";
import { api } from "./api";

// ==============================================================================
// Query Params Builder
// ==============================================================================

function buildQueryString(params: Partial<MetricsQueryParams>): string {
  const searchParams = new URLSearchParams();

  if (params.period) {
    searchParams.set("period", params.period);
  }
  if (params.start_date) {
    searchParams.set("start_date", params.start_date);
  }
  if (params.end_date) {
    searchParams.set("end_date", params.end_date);
  }
  if (params.granularity) {
    searchParams.set("granularity", params.granularity);
  }
  if (params.metric_name) {
    searchParams.set("metric", params.metric_name);
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

// ==============================================================================
// API Functions
// ==============================================================================

/**
 * Get dashboard overview metrics.
 */
export async function getDashboardMetrics(
  period: PeriodType = "today",
  startDate?: Date,
  endDate?: Date,
): Promise<DashboardMetrics> {
  const params: Partial<MetricsQueryParams> = { period };

  if (period === "custom" && startDate && endDate) {
    params.start_date = startDate.toISOString();
    params.end_date = endDate.toISOString();
  }

  const query = buildQueryString(params);
  const response = await api.get<DashboardMetrics>(`/admin/metrics${query}`);
  return response.data;
}

/**
 * Get detailed request metrics.
 */
export async function getRequestMetrics(
  period: PeriodType = "today",
  startDate?: Date,
  endDate?: Date,
): Promise<RequestMetrics> {
  const params: Partial<MetricsQueryParams> = { period };

  if (period === "custom" && startDate && endDate) {
    params.start_date = startDate.toISOString();
    params.end_date = endDate.toISOString();
  }

  const query = buildQueryString(params);
  const response = await api.get<RequestMetrics>(`/admin/metrics/requests${query}`);
  return response.data;
}

/**
 * Get business metrics.
 */
export async function getBusinessMetrics(
  period: PeriodType = "today",
  startDate?: Date,
  endDate?: Date,
): Promise<BusinessMetrics> {
  const params: Partial<MetricsQueryParams> = { period };

  if (period === "custom" && startDate && endDate) {
    params.start_date = startDate.toISOString();
    params.end_date = endDate.toISOString();
  }

  const query = buildQueryString(params);
  const response = await api.get<BusinessMetrics>(`/admin/metrics/business${query}`);
  return response.data;
}

/**
 * Get user activity metrics.
 */
export async function getUserMetrics(
  period: PeriodType = "today",
  startDate?: Date,
  endDate?: Date,
): Promise<UserMetrics> {
  const params: Partial<MetricsQueryParams> = { period };

  if (period === "custom" && startDate && endDate) {
    params.start_date = startDate.toISOString();
    params.end_date = endDate.toISOString();
  }

  const query = buildQueryString(params);
  const response = await api.get<UserMetrics>(`/admin/metrics/users${query}`);
  return response.data;
}

/**
 * Get course metrics.
 */
export async function getCourseMetrics(
  period: PeriodType = "today",
  startDate?: Date,
  endDate?: Date,
): Promise<CourseMetrics> {
  const params: Partial<MetricsQueryParams> = { period };

  if (period === "custom" && startDate && endDate) {
    params.start_date = startDate.toISOString();
    params.end_date = endDate.toISOString();
  }

  const query = buildQueryString(params);
  const response = await api.get<CourseMetrics>(`/admin/metrics/courses${query}`);
  return response.data;
}

/**
 * Get time series data for charts.
 */
export async function getTimeSeries(
  metricName: string,
  period: PeriodType = "today",
  granularity: GranularityType = "hourly",
  startDate?: Date,
  endDate?: Date,
): Promise<TimeSeriesResponse> {
  const params: Partial<MetricsQueryParams> = {
    period,
    granularity,
    metric_name: metricName,
  };

  if (period === "custom" && startDate && endDate) {
    params.start_date = startDate.toISOString();
    params.end_date = endDate.toISOString();
  }

  const query = buildQueryString(params);
  const response = await api.get<TimeSeriesResponse>(`/admin/metrics/timeseries${query}`);
  return response.data;
}

/**
 * Get real-time counters from Redis.
 */
export async function getRealtimeCounters(): Promise<RealtimeCounters> {
  const response = await api.get<RealtimeCounters>("/admin/metrics/realtime");
  return response.data;
}

/**
 * Get metrics system health status.
 */
export async function getMetricsHealth(): Promise<MetricsHealthResponse> {
  const response = await api.get<MetricsHealthResponse>("/admin/metrics/health");
  return response.data;
}

// ==============================================================================
// Exports
// ==============================================================================

export const metricsApi = {
  getDashboardMetrics,
  getRequestMetrics,
  getBusinessMetrics,
  getUserMetrics,
  getCourseMetrics,
  getTimeSeries,
  getRealtimeCounters,
  getMetricsHealth,
};
