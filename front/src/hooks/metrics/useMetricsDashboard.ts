/**
 * TanStack Query hooks for metrics dashboard.
 */

import { metricsApi } from "@/lib/metrics-api";
import type { GranularityType, PeriodType } from "@/types/metrics";
import { useQuery } from "@tanstack/react-query";

// ==============================================================================
// Query Keys
// ==============================================================================

export const metricsKeys = {
  all: ["metrics"] as const,
  dashboard: (period: PeriodType) => [...metricsKeys.all, "dashboard", period] as const,
  requests: (period: PeriodType) => [...metricsKeys.all, "requests", period] as const,
  business: (period: PeriodType) => [...metricsKeys.all, "business", period] as const,
  users: (period: PeriodType) => [...metricsKeys.all, "users", period] as const,
  courses: (period: PeriodType) => [...metricsKeys.all, "courses", period] as const,
  timeseries: (metric: string, period: PeriodType, granularity: GranularityType) =>
    [...metricsKeys.all, "timeseries", metric, period, granularity] as const,
  realtime: () => [...metricsKeys.all, "realtime"] as const,
  health: () => [...metricsKeys.all, "health"] as const,
};

// ==============================================================================
// Hooks
// ==============================================================================

interface UseMetricsOptions {
  period: PeriodType;
  startDate?: Date;
  endDate?: Date;
  enabled?: boolean;
}

/**
 * Hook for dashboard metrics.
 */
export function useDashboardMetrics({
  period,
  startDate,
  endDate,
  enabled = true,
}: UseMetricsOptions) {
  return useQuery({
    queryKey: metricsKeys.dashboard(period),
    queryFn: () => metricsApi.getDashboardMetrics(period, startDate, endDate),
    enabled,
    refetchInterval: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook for request metrics.
 */
export function useRequestMetrics({
  period,
  startDate,
  endDate,
  enabled = true,
}: UseMetricsOptions) {
  return useQuery({
    queryKey: metricsKeys.requests(period),
    queryFn: () => metricsApi.getRequestMetrics(period, startDate, endDate),
    enabled,
  });
}

/**
 * Hook for business metrics.
 */
export function useBusinessMetrics({
  period,
  startDate,
  endDate,
  enabled = true,
}: UseMetricsOptions) {
  return useQuery({
    queryKey: metricsKeys.business(period),
    queryFn: () => metricsApi.getBusinessMetrics(period, startDate, endDate),
    enabled,
  });
}

/**
 * Hook for user metrics.
 */
export function useUserMetrics({ period, startDate, endDate, enabled = true }: UseMetricsOptions) {
  return useQuery({
    queryKey: metricsKeys.users(period),
    queryFn: () => metricsApi.getUserMetrics(period, startDate, endDate),
    enabled,
  });
}

/**
 * Hook for course metrics.
 */
export function useCourseMetrics({
  period,
  startDate,
  endDate,
  enabled = true,
}: UseMetricsOptions) {
  return useQuery({
    queryKey: metricsKeys.courses(period),
    queryFn: () => metricsApi.getCourseMetrics(period, startDate, endDate),
    enabled,
  });
}

interface UseTimeSeriesOptions extends UseMetricsOptions {
  metricName: string;
  granularity?: GranularityType;
}

/**
 * Hook for time series data.
 */
export function useTimeSeries({
  metricName,
  period,
  granularity = "hourly",
  startDate,
  endDate,
  enabled = true,
}: UseTimeSeriesOptions) {
  return useQuery({
    queryKey: metricsKeys.timeseries(metricName, period, granularity),
    queryFn: () => metricsApi.getTimeSeries(metricName, period, granularity, startDate, endDate),
    enabled,
  });
}

/**
 * Hook for realtime counters.
 */
export function useRealtimeCounters(enabled = true) {
  return useQuery({
    queryKey: metricsKeys.realtime(),
    queryFn: () => metricsApi.getRealtimeCounters(),
    enabled,
    refetchInterval: 5 * 1000, // 5 seconds
  });
}

/**
 * Hook for metrics system health.
 */
export function useMetricsHealth(enabled = true) {
  return useQuery({
    queryKey: metricsKeys.health(),
    queryFn: () => metricsApi.getMetricsHealth(),
    enabled,
    refetchInterval: 10 * 1000, // 10 seconds
  });
}
