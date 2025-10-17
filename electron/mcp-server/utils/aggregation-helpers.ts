/**
 * Reusable aggregation helpers for Datadog Spans API
 * Provides properly-typed compute and groupBy functions
 */

import { v2 } from '@datadog/datadog-api-client';

/**
 * Create latency percentile computes
 */
export function createLatencyComputes(metric: string = '@duration'): v2.SpansCompute[] {
  return [
    {
      aggregation: 'pc50' as v2.SpansAggregationFunction,
      metric,
      type: 'total' as v2.SpansComputeType
    } as v2.SpansCompute,
    {
      aggregation: 'pc75' as v2.SpansAggregationFunction,
      metric,
      type: 'total' as v2.SpansComputeType
    } as v2.SpansCompute,
    {
      aggregation: 'pc95' as v2.SpansAggregationFunction,
      metric,
      type: 'total' as v2.SpansComputeType
    } as v2.SpansCompute,
    {
      aggregation: 'pc99' as v2.SpansAggregationFunction,
      metric,
      type: 'total' as v2.SpansComputeType
    } as v2.SpansCompute
  ];
}

/**
 * Create error count computes
 */
export function createErrorComputes(): v2.SpansCompute[] {
  return [
    {
      aggregation: 'count' as v2.SpansAggregationFunction,
      type: 'total' as v2.SpansComputeType
    } as v2.SpansCompute,
    {
      aggregation: 'count' as v2.SpansAggregationFunction,
      metric: '@error',
      type: 'total' as v2.SpansComputeType
    } as v2.SpansCompute
  ];
}

/**
 * Create standard operation metrics computes
 * Returns: request count, error count, p50/p95/p99 latency
 */
export function createStandardComputes(): v2.SpansCompute[] {
  return [
    // Total request count
    {
      aggregation: 'count' as v2.SpansAggregationFunction,
      type: 'total' as v2.SpansComputeType
    } as v2.SpansCompute,
    // Error count
    {
      aggregation: 'count' as v2.SpansAggregationFunction,
      metric: '@error',
      type: 'total' as v2.SpansComputeType
    } as v2.SpansCompute,
    // p50 latency
    {
      aggregation: 'pc50' as v2.SpansAggregationFunction,
      metric: '@duration',
      type: 'total' as v2.SpansComputeType
    } as v2.SpansCompute,
    // p95 latency
    {
      aggregation: 'pc95' as v2.SpansAggregationFunction,
      metric: '@duration',
      type: 'total' as v2.SpansComputeType
    } as v2.SpansCompute,
    // p99 latency
    {
      aggregation: 'pc99' as v2.SpansAggregationFunction,
      metric: '@duration',
      type: 'total' as v2.SpansComputeType
    } as v2.SpansCompute
  ];
}

/**
 * Create average/sum/max/min computes for a metric
 */
export function createStatisticalComputes(metric: string): v2.SpansCompute[] {
  return [
    {
      aggregation: 'avg' as v2.SpansAggregationFunction,
      metric,
      type: 'total' as v2.SpansComputeType
    } as v2.SpansCompute,
    {
      aggregation: 'sum' as v2.SpansAggregationFunction,
      metric,
      type: 'total' as v2.SpansComputeType
    } as v2.SpansCompute,
    {
      aggregation: 'min' as v2.SpansAggregationFunction,
      metric,
      type: 'total' as v2.SpansComputeType
    } as v2.SpansCompute,
    {
      aggregation: 'max' as v2.SpansAggregationFunction,
      metric,
      type: 'total' as v2.SpansComputeType
    } as v2.SpansCompute
  ];
}

/**
 * Create a simple count compute
 */
export function createCountCompute(): v2.SpansCompute {
  return {
    aggregation: 'count' as v2.SpansAggregationFunction,
    type: 'total' as v2.SpansComputeType
  } as v2.SpansCompute;
}

/**
 * Create a cardinality compute (unique count)
 */
export function createCardinalityCompute(metric: string): v2.SpansCompute {
  return {
    aggregation: 'cardinality' as v2.SpansAggregationFunction,
    metric,
    type: 'total' as v2.SpansComputeType
  } as v2.SpansCompute;
}

/**
 * Create a groupBy for resource_name (operations/endpoints)
 */
export function createGroupByResource(limit: number = 100): v2.SpansGroupBy {
  return {
    facet: 'resource_name',
    limit,
    sort: {
      aggregation: 'count' as v2.SpansAggregationFunction,
      order: 'desc',
      type: 'measure' as v2.SpansAggregateSortType
    } as v2.SpansAggregateSort
  } as v2.SpansGroupBy;
}

/**
 * Create a groupBy for service name
 */
export function createGroupByService(limit: number = 50): v2.SpansGroupBy {
  return {
    facet: 'service',
    limit,
    sort: {
      aggregation: 'count' as v2.SpansAggregationFunction,
      order: 'desc',
      type: 'measure' as v2.SpansAggregateSortType
    } as v2.SpansAggregateSort
  } as v2.SpansGroupBy;
}

/**
 * Create a groupBy for operation name
 */
export function createGroupByOperation(limit: number = 100): v2.SpansGroupBy {
  return {
    facet: 'operation_name',
    limit,
    sort: {
      aggregation: 'count' as v2.SpansAggregationFunction,
      order: 'desc',
      type: 'measure' as v2.SpansAggregateSortType
    } as v2.SpansAggregateSort
  } as v2.SpansGroupBy;
}

/**
 * Create a groupBy for peer service (downstream dependencies)
 */
export function createGroupByPeerService(limit: number = 50): v2.SpansGroupBy {
  return {
    facet: 'peer.service',
    limit,
    sort: {
      aggregation: 'count' as v2.SpansAggregationFunction,
      order: 'desc',
      type: 'measure' as v2.SpansAggregateSortType
    } as v2.SpansAggregateSort
  } as v2.SpansGroupBy;
}

/**
 * Create a groupBy for error type
 */
export function createGroupByErrorType(limit: number = 20): v2.SpansGroupBy {
  return {
    facet: '@error.type',
    limit,
    sort: {
      aggregation: 'count' as v2.SpansAggregationFunction,
      order: 'desc',
      type: 'measure' as v2.SpansAggregateSortType
    } as v2.SpansAggregateSort
  } as v2.SpansGroupBy;
}

/**
 * Create a groupBy for HTTP status code
 */
export function createGroupByHttpStatus(limit: number = 20): v2.SpansGroupBy {
  return {
    facet: '@http.status_code',
    limit,
    sort: {
      aggregation: 'count' as v2.SpansAggregationFunction,
      order: 'desc',
      type: 'measure' as v2.SpansAggregateSortType
    } as v2.SpansAggregateSort
  } as v2.SpansGroupBy;
}

/**
 * Create a custom groupBy with specific facet
 */
export function createCustomGroupBy(
  facet: string,
  limit: number = 100,
  sortBy: v2.SpansAggregationFunction = 'count' as v2.SpansAggregationFunction
): v2.SpansGroupBy {
  return {
    facet,
    limit,
    sort: {
      aggregation: sortBy,
      order: 'desc',
      type: 'measure' as v2.SpansAggregateSortType
    } as v2.SpansAggregateSort
  } as v2.SpansGroupBy;
}

/**
 * Helper to extract value from computes result
 */
export function extractComputeValue(computes: any, index: number): number {
  if (!computes) return 0;

  const key = `c${index}`;
  return computes[key] !== undefined ? computes[key] : 0;
}

/**
 * Helper to parse operation metrics from aggregated response
 */
export interface ParsedOperationMetrics {
  requestCount: number;
  errorCount: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  errorRate: number;
}

export function parseOperationMetrics(computes: any): ParsedOperationMetrics {
  // Assumes standard computes: [count, error_count, pc50, pc95, pc99]
  const requestCount = extractComputeValue(computes, 0);
  const errorCount = extractComputeValue(computes, 1);
  const p50Latency = extractComputeValue(computes, 2) / 1000000; // ns to ms
  const p95Latency = extractComputeValue(computes, 3) / 1000000;
  const p99Latency = extractComputeValue(computes, 4) / 1000000;
  const errorRate = requestCount > 0 ? (errorCount / requestCount) * 100 : 0;

  return {
    requestCount,
    errorCount,
    p50Latency: Number(p50Latency.toFixed(2)),
    p95Latency: Number(p95Latency.toFixed(2)),
    p99Latency: Number(p99Latency.toFixed(2)),
    errorRate: Number(errorRate.toFixed(2))
  };
}
