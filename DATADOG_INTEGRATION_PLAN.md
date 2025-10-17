# Datadog Integration - Wave-Based Implementation Plan

## Executive Summary

This document outlines a comprehensive, wave-based approach to building dynamic, well-structured Datadog monitoring tools that adhere to official Datadog APIs. The plan addresses critical issues in the current implementation and provides a roadmap for full APM, RUM, and service intelligence capabilities.

---

## Current State Analysis

### Critical Issues Found

1. **Incorrect Spans API Type Structures**
   - Using plain objects instead of proper `v2.SpansCompute` types
   - Missing type assertions for `groupBy` and `compute` parameters
   - Results in API errors or incorrect data

2. **No Filtering for Service Entry Spans**
   - Querying ALL spans instead of just service-level operations
   - Should filter to `span.kind:entry` for top-level service requests
   - Current approach returns internal spans, database calls, etc.

3. **Hardcoded Metric Names**
   - Assumes `trace.servlet.request.*` patterns
   - Breaks for non-Servlet services (Netty, WebFlux, GraphQL, etc.)
   - Metric discovery helps but doesn't solve root cause

4. **No RUM Support**
   - Zero frontend monitoring capabilities
   - Can't track browser performance, JavaScript errors, user sessions

5. **Limited APM Coverage**
   - No trace sampling
   - No service dependency mapping
   - No SLO tracking
   - No service catalog integration

---

## Implementation Waves

### **Wave 1: Fix Core APM Foundation** ⚡ CRITICAL

**Priority**: START IMMEDIATELY
**Timeline**: 1-2 days
**Goal**: Fix broken tools and establish correct patterns

#### Tasks

##### 1.1 Fix DatadogClient.aggregateSpans()
**File**: `electron/mcp-server/datadog-client.ts`

**Current Problem**:
```typescript
// WRONG - plain objects without proper types
compute: [
  { aggregation: 'count' },
  { aggregation: 'pc95', metric: '@duration' }
]
```

**Solution**:
```typescript
// CORRECT - proper v2 types with assertions
import { v2 } from '@datadog/datadog-api-client';

compute: [
  {
    aggregation: 'count' as v2.SpansAggregationFunction,
    type: 'total' as v2.SpansComputeType
  } as v2.SpansCompute,
  {
    aggregation: 'pc95' as v2.SpansAggregationFunction,
    metric: '@duration',
    type: 'total' as v2.SpansComputeType
  } as v2.SpansCompute
]
```

**Changes**:
- Import proper types: `SpansCompute`, `SpansGroupBy`, `SpansAggregateSort`, `SpansQueryFilter`
- Add type assertions throughout
- Fix `groupBy` structure with proper nested objects
- Add validation and error handling

##### 1.2 Rewrite get-service-operations (THE CRITICAL TOOL)
**File**: `electron/mcp-server/tools/get-service-operations.ts`

**Strategy**: Hybrid approach with intelligent fallback

**Approach 1 - Trace Metrics (Primary, Fast)**:
```typescript
async function tryTraceMetricsApproach(input: GetServiceOperationsInput) {
  // Use existing metric discovery to find trace metrics
  const discovered = await discoverServiceMetrics(input.service, input.environment);

  if (discovered) {
    // Query trace.*.request.* metrics grouped by resource_name tag
    // This is FAST and pre-computed by Datadog
    const response = await datadogClient.queryMetrics({
      query: `${discovered.metrics.latency}{service:${input.service}} by {resource_name}`,
      from,
      to
    });

    return parseTraceMetricsResponse(response);
  }

  return null;
}
```

**Approach 2 - Spans API (Fallback, Detailed)**:
```typescript
async function spansApiApproach(input: GetServiceOperationsInput) {
  // Build dynamic query with proper filtering
  const query = buildSpansQuery({
    service: input.service,
    environment: input.environment,
    filters: ['span.kind:entry'] // CRITICAL: Only service entry spans!
  });

  const response = await datadogClient.aggregateSpans({
    query,
    from,
    to,
    compute: createStandardComputes(), // Helper function with proper types
    groupBy: [
      {
        facet: 'resource_name',
        limit: 100,
        sort: {
          aggregation: 'count' as v2.SpansAggregationFunction,
          order: 'desc',
          type: 'measure' as v2.SpansAggregateSortType
        } as v2.SpansAggregateSort
      } as v2.SpansGroupBy
    ]
  });

  return parseSpansResponse(response);
}
```

**Dynamic Query Builder**:
```typescript
interface QueryBuilderOptions {
  service: string;
  environment?: string;
  operation?: string;
  status?: 'ok' | 'error';
  spanKind?: 'entry' | 'client' | 'server' | 'producer' | 'consumer';
  minDuration?: number;
  customFilters?: string[];
}

function buildSpansQuery(options: QueryBuilderOptions): string {
  const parts: string[] = [];

  // Service filter (required)
  parts.push(`service:${options.service}`);

  // Environment (support both env: and environment: tags)
  if (options.environment) {
    parts.push(`(env:${options.environment} OR environment:${options.environment})`);
  }

  // Span kind (critical for filtering to entry spans)
  if (options.spanKind) {
    parts.push(`span.kind:${options.spanKind}`);
  }

  // Specific operation/resource
  if (options.operation) {
    parts.push(`resource_name:"${options.operation}"`);
  }

  // Status filtering
  if (options.status) {
    parts.push(`status:${options.status}`);
  }

  // Duration filtering
  if (options.minDuration) {
    const durationNs = options.minDuration * 1000000; // Convert ms to ns
    parts.push(`@duration:>=${durationNs}`);
  }

  // Custom filters
  if (options.customFilters) {
    parts.push(...options.customFilters);
  }

  return parts.join(' ');
}
```

**Reusable Compute Helpers**:
```typescript
function createStandardComputes(): v2.SpansCompute[] {
  return [
    {
      aggregation: 'count' as v2.SpansAggregationFunction,
      type: 'total' as v2.SpansComputeType
    },
    {
      aggregation: 'count' as v2.SpansAggregationFunction,
      metric: '@error',
      type: 'total' as v2.SpansComputeType
    },
    {
      aggregation: 'pc50' as v2.SpansAggregationFunction,
      metric: '@duration',
      type: 'total' as v2.SpansComputeType
    },
    {
      aggregation: 'pc95' as v2.SpansAggregationFunction,
      metric: '@duration',
      type: 'total' as v2.SpansComputeType
    },
    {
      aggregation: 'pc99' as v2.SpansAggregationFunction,
      metric: '@duration',
      type: 'total' as v2.SpansComputeType
    }
  ] as v2.SpansCompute[];
}
```

##### 1.3 Create query-apm-traces Tool (NEW)
**File**: `electron/mcp-server/tools/query-apm-traces.ts`

**Purpose**: Get actual trace samples with flexible filtering

**Input Schema**:
```typescript
interface QueryTracesInput {
  service: string;
  environment?: string;
  operation?: string;        // Filter by specific operation/resource
  status?: 'ok' | 'error';   // Filter by status
  minDuration?: number;      // Minimum duration in milliseconds
  maxDuration?: number;      // Maximum duration in milliseconds
  timeRange?: string;        // e.g., "1h", "24h"
  sortBy?: 'duration' | 'timestamp';  // Sort order
  limit?: number;            // Number of traces to return (default: 10)
}
```

**Features**:
- Returns actual trace IDs
- Provides deep links to Datadog UI
- Shows trace duration, span count, error status
- Supports complex filtering combinations

**Example Query**:
```typescript
// Get 10 slowest error traces for specific operation
queryAPMTraces({
  service: 'mcu-claims-aggregate-api',
  environment: 'production',
  operation: 'GET /api/claims/:id',
  status: 'error',
  minDuration: 500,
  sortBy: 'duration',
  limit: 10
})
```

##### 1.4 Enhance get-service-health
**File**: `electron/mcp-server/tools/get-service-health.ts`

**Keep**:
- Current metric discovery (works well!)
- Overall health metrics

**Add**:
- 5 slowest traces (samples)
- 5 error traces (samples)
- Detailed monitor information
- Service metadata from Service Definition API

**Deliverables**:
- [ ] Fixed DatadogClient with proper types
- [ ] Rewritten get-service-operations with hybrid approach
- [ ] New query-apm-traces tool
- [ ] Enhanced get-service-health with trace samples
- [ ] Dynamic query builder utility
- [ ] Reusable compute/groupBy helpers

**Success Criteria**:
- ✅ Can query operations for ANY service type (Netty, Servlet, WebFlux, etc.)
- ✅ Returns real data (not zeros)
- ✅ No TypeScript type errors
- ✅ Graceful fallback when metrics unavailable
- ✅ Can filter traces by any combination of criteria

---

### **Wave 2: RUM Support** 🌐 Frontend Monitoring

**Priority**: HIGH
**Timeline**: After Wave 1
**Goal**: Add comprehensive Real User Monitoring

#### Tasks

##### 2.1 Add RUM Methods to DatadogClient
**File**: `electron/mcp-server/datadog-client.ts`

```typescript
async aggregateRUMEvents(params: {
  query: string;
  from: number;
  to: number;
  compute?: Array<v2.RUMCompute>;
  groupBy?: Array<v2.RUMGroupBy>;
}): Promise<v2.RUMAnalyticsAggregateResponse> {
  const config = await this.getConfiguration();
  const rumApi = new v2.RUMApi(config);

  const body: v2.RUMAggregateRequest = {
    data: {
      type: 'aggregate_request',
      attributes: {
        filter: {
          query: params.query,
          from: new Date(params.from).toISOString(),
          to: new Date(params.to).toISOString()
        },
        compute: params.compute,
        groupBy: params.groupBy
      }
    }
  };

  return await rumApi.aggregateRUMEvents({ body });
}

async searchRUMEvents(params: {
  query: string;
  from: number;
  to: number;
  sort?: string;
  limit?: number;
}): Promise<v2.RUMEventsResponse>
```

##### 2.2 Create get-rum-application-health Tool (NEW)
**File**: `electron/mcp-server/tools/get-rum-application-health.ts`

**Input**:
```typescript
interface GetRUMHealthInput {
  applicationId: string;
  environment?: string;
  viewName?: string;     // Filter by specific page/view
  country?: string;      // Filter by geography
  browser?: string;      // Filter by browser (Chrome, Firefox, etc.)
  device?: string;       // Filter by device type (mobile, desktop, tablet)
  timeRange?: string;
}
```

**Metrics Tracked**:
- **Session Metrics**:
  - Total sessions
  - Active users
  - Session duration (avg, p50, p95)

- **Page Performance**:
  - Page load time (p50, p75, p95, p99)
  - First Contentful Paint (FCP)
  - Largest Contentful Paint (LCP)
  - First Input Delay (FID)
  - Cumulative Layout Shift (CLS)
  - Time to Interactive (TTI)

- **Errors**:
  - JavaScript errors count
  - Network errors count
  - Error rate percentage

- **Views**:
  - Page views count
  - Views per session
  - Bounce rate

**Dynamic Query Example**:
```typescript
// Get Core Web Vitals for mobile users in US
const query = buildRUMQuery({
  applicationId: 'abc123',
  device: 'mobile',
  country: 'US'
});

aggregateRUMEvents({
  query,
  from,
  to,
  compute: [
    { aggregation: 'pc75', metric: '@view.largest_contentful_paint' },
    { aggregation: 'pc75', metric: '@view.first_input_delay' },
    { aggregation: 'avg', metric: '@view.cumulative_layout_shift' }
  ],
  groupBy: [{ facet: '@view.name' }]
});
```

##### 2.3 Create get-rum-errors Tool (NEW)
**File**: `electron/mcp-server/tools/get-rum-errors.ts`

**Features**:
- List top errors by occurrence
- Group by error message, source file, browser, view
- Show error trends over time
- Return stack traces and error context

**Deliverables**:
- [ ] RUM methods in DatadogClient
- [ ] get-rum-application-health tool
- [ ] get-rum-errors tool
- [ ] RUM query builder utility

**Success Criteria**:
- ✅ Can monitor any RUM application
- ✅ Core Web Vitals tracked
- ✅ Frontend errors captured with stack traces
- ✅ Can filter by geography, browser, device

---

### **Wave 3: Service Dependencies** 🔗 Architecture Mapping

**Priority**: MEDIUM
**Timeline**: After Wave 2
**Goal**: Understand service relationships and call patterns

#### Tasks

##### 3.1 Create get-service-dependencies Tool (NEW)
**File**: `electron/mcp-server/tools/get-service-dependencies.ts`

**Approach**:
Query spans where current service is the caller and extract downstream services

```typescript
// Query spans from this service calling others
const response = await aggregateSpans({
  query: `service:${serviceName} span.kind:client`,
  compute: [
    { aggregation: 'count' },
    { aggregation: 'count', metric: '@error' },
    { aggregation: 'pc95', metric: '@duration' }
  ],
  groupBy: [{ facet: 'peer.service' }] // Downstream service name
});
```

**Output**:
```typescript
{
  service: "mcu-claims-aggregate-api",
  totalDownstreamServices: 3,
  dependencies: [
    {
      downstreamService: "auth-service",
      callCount: 15000,
      errorCount: 15,
      errorRate: 0.1,
      p95Latency: 45.2,
      callsPerMinute: 250
    },
    {
      downstreamService: "claims-database",
      callCount: 30000,
      errorCount: 690,
      errorRate: 2.3,
      p95Latency: 125.8,
      callsPerMinute: 500
    }
  ]
}
```

##### 3.2 Create get-service-callers Tool (NEW)
**File**: `electron/mcp-server/tools/get-service-callers.ts`

**Approach**:
Find services that call THIS service (reverse dependencies)

```typescript
// Query for spans where this service is the peer.service
const response = await aggregateSpans({
  query: `peer.service:${serviceName}`,
  compute: createStandardComputes(),
  groupBy: [{ facet: 'service' }] // Upstream service name
});
```

**Deliverables**:
- [ ] get-service-dependencies tool
- [ ] get-service-callers tool
- [ ] Dependency graph visualization data

**Success Criteria**:
- ✅ Can map full service dependency graph
- ✅ Shows bidirectional dependencies
- ✅ Includes health metrics per dependency

---

### **Wave 4: Service Catalog & SLO** 📊 Business Context

**Priority**: MEDIUM
**Timeline**: After Wave 3
**Goal**: Add business context and reliability tracking

#### Tasks

##### 4.1 Create get-service-catalog Tool (NEW)
**File**: `electron/mcp-server/tools/get-service-catalog.ts`

**Features**:
- Service metadata (team, owner, tier, lifecycle)
- Links to documentation, runbooks, source code
- Service tags and annotations
- Related services and dependencies

**API**: Already available via `getServiceDefinition()` in DatadogClient

##### 4.2 Create get-service-slos Tool (NEW)
**File**: `electron/mcp-server/tools/get-service-slos.ts`

**Features**:
- List all SLOs for a service
- SLO compliance percentage
- Error budget remaining
- Burn rate (how fast error budget is consumed)
- Time to SLO violation
- Historical SLO performance

**API**: Use `v1.ServiceLevelObjectivesApi`

**Deliverables**:
- [ ] get-service-catalog tool
- [ ] get-service-slos tool
- [ ] SLO visualization data

**Success Criteria**:
- ✅ Service metadata retrieved
- ✅ SLO compliance tracked
- ✅ Error budget calculated

---

### **Wave 5: Advanced Analytics** 🔍 Intelligence Layer

**Priority**: LOW
**Timeline**: After Waves 1-4 stable
**Goal**: Provide intelligent analysis and recommendations

#### Tasks

##### 5.1 Create compare-services Tool (NEW)
**File**: `electron/mcp-server/tools/compare-services.ts`

**Features**:
- Compare metrics across multiple services side-by-side
- Identify outliers (which service is slowest/most errors)
- Useful for "which service should I investigate?"

##### 5.2 Create analyze-service-trends Tool (NEW)
**File**: `electron/mcp-server/tools/analyze-service-trends.ts`

**Features**:
- Time-series data with multiple time buckets
- Detect spikes, drops, anomalies
- Compare current metrics vs baseline (last week, last month)
- Show trend direction (improving/degrading)
- Calculate rate of change

**Deliverables**:
- [ ] compare-services tool
- [ ] analyze-service-trends tool
- [ ] Anomaly detection logic

**Success Criteria**:
- ✅ Can compare any set of services
- ✅ Trend analysis provides actionable insights
- ✅ Anomaly detection identifies issues

---

## Common Patterns & Utilities

### Dynamic Query Builder Class
**File**: `electron/mcp-server/utils/query-builder.ts`

```typescript
export class DatadogQueryBuilder {
  private filters: string[] = [];

  service(name: string): this {
    this.filters.push(`service:${name}`);
    return this;
  }

  environment(env: string): this {
    this.filters.push(`(env:${env} OR environment:${env})`);
    return this;
  }

  operation(op: string): this {
    this.filters.push(`resource_name:"${op}"`);
    return this;
  }

  status(status: 'ok' | 'error'): this {
    this.filters.push(`status:${status}`);
    return this;
  }

  spanKind(kind: 'entry' | 'client' | 'server'): this {
    this.filters.push(`span.kind:${kind}`);
    return this;
  }

  durationGreaterThan(ms: number): this {
    this.filters.push(`@duration:>=${ms * 1000000}`);
    return this;
  }

  custom(filter: string): this {
    this.filters.push(filter);
    return this;
  }

  build(): string {
    return this.filters.join(' ');
  }
}

// Usage
const query = new DatadogQueryBuilder()
  .service('mcu-claims')
  .environment('production')
  .operation('GET /api/claims')
  .status('error')
  .durationGreaterThan(500)
  .build();
```

### Reusable Aggregation Helpers
**File**: `electron/mcp-server/utils/aggregation-helpers.ts`

```typescript
export function createLatencyComputes(metric: string = '@duration'): v2.SpansCompute[] {
  return [
    {
      aggregation: 'pc50' as v2.SpansAggregationFunction,
      metric,
      type: 'total' as v2.SpansComputeType
    },
    {
      aggregation: 'pc95' as v2.SpansAggregationFunction,
      metric,
      type: 'total' as v2.SpansComputeType
    },
    {
      aggregation: 'pc99' as v2.SpansAggregationFunction,
      metric,
      type: 'total' as v2.SpansComputeType
    }
  ] as v2.SpansCompute[];
}

export function createErrorComputes(): v2.SpansCompute[] {
  return [
    {
      aggregation: 'count' as v2.SpansAggregationFunction,
      type: 'total' as v2.SpansComputeType
    },
    {
      aggregation: 'count' as v2.SpansAggregationFunction,
      metric: '@error',
      type: 'total' as v2.SpansComputeType
    }
  ] as v2.SpansCompute[];
}

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
```

---

## Implementation Principles

1. **Type Safety First**
   - Always use proper types from `@datadog/datadog-api-client`
   - Add type assertions where TypeScript can't infer
   - No `any` types unless absolutely necessary

2. **Dynamic & Flexible**
   - All tools support flexible, composable queries
   - Use builder patterns for query construction
   - Support arbitrary filter combinations

3. **Fallback Strategies**
   - Try fast approaches first (trace metrics)
   - Fall back to detailed queries (Spans API)
   - Handle API errors gracefully

4. **Comprehensive Logging**
   - Log request bodies for debugging
   - Log response summaries
   - Include actual API responses in errors

5. **Appropriate Caching**
   - Real-time data: 30 seconds - 2 minutes
   - Service metadata: 1 hour
   - Service catalog: 24 hours

6. **Error Handling**
   - Clear error messages
   - Include troubleshooting hints
   - Suggest alternative approaches

---

## Testing Strategy

### For Each Tool:

1. **Unit Tests**
   - Query builder produces correct strings
   - Type structures are valid
   - Edge cases handled

2. **Integration Tests**
   - Test with real Datadog API (dev environment)
   - Verify response parsing
   - Test fallback logic

3. **End-to-End Tests**
   - Test with actual services
   - Verify LLM can use tools correctly
   - Test error scenarios

### Debug Logging Pattern:

```typescript
console.log('=== API Request ===');
console.log('Endpoint:', 'aggregateSpans');
console.log('Query:', query);
console.log('Body:', JSON.stringify(body, null, 2));

console.log('=== API Response ===');
console.log('Status:', response.meta?.status);
console.log('Buckets:', response.data?.buckets?.length);
console.log('First bucket:', JSON.stringify(response.data?.buckets?.[0], null, 2));

if (response.errors) {
  console.error('Errors:', response.errors);
}
```

---

## Acceptance Criteria

### Wave 1 Complete ✅
- [ ] DatadogClient uses correct v2 types throughout
- [ ] get-service-operations returns real data for ANY service type
- [ ] query-apm-traces tool works with flexible filtering
- [ ] No TypeScript compilation errors
- [ ] Graceful fallback when metrics unavailable
- [ ] Comprehensive logging for debugging

### Wave 2 Complete ✅
- [ ] RUM application health tracked
- [ ] Frontend errors captured with stack traces
- [ ] Core Web Vitals measured (LCP, FID, CLS)
- [ ] Can filter by geography, browser, device

### Wave 3 Complete ✅
- [ ] Service dependency graph available
- [ ] Bidirectional dependencies (callers + callees)
- [ ] Health metrics per dependency

### Wave 4 Complete ✅
- [ ] Service catalog integration working
- [ ] SLO compliance tracked
- [ ] Error budget calculated

### Wave 5 Complete ✅
- [ ] Can compare arbitrary services
- [ ] Trend analysis detects anomalies
- [ ] Provides actionable insights

---

## Timeline Estimate

- **Wave 1**: 2-3 days (CRITICAL)
- **Wave 2**: 2 days
- **Wave 3**: 1-2 days
- **Wave 4**: 1 day
- **Wave 5**: 2-3 days

**Total**: ~8-11 days for complete implementation

---

## Next Steps

1. ✅ **Document plan** (this file)
2. 🚀 **Start Wave 1 implementation**
   - Fix DatadogClient types
   - Rewrite get-service-operations
   - Create query-apm-traces
3. 🧪 **Test with real services**
   - Verify operations return correct data
   - Test with multiple service types (Netty, Servlet, WebFlux)
4. 📦 **Build and deploy**
5. ➡️ **Proceed to Wave 2**

---

## Questions & Decisions

### Before Starting:
- ✅ Proceed with Wave 1 immediately? **YES**
- ✅ Implement all 5 waves? **YES, sequentially**
- ✅ Any specific services for testing? **mcu-claims-aggregate-api**
- ✅ Use RUM? **YES, Wave 2**

### Decision Log:
- **Dynamic queries**: Using builder pattern for flexibility
- **Fallback strategy**: Trace metrics → Spans API
- **Type safety**: Strict typing with v2 namespace
- **Logging**: Comprehensive for debugging

---

## References

- [Datadog TypeScript Client](https://datadoghq.dev/datadog-api-client-typescript/)
- [Spans API Documentation](https://docs.datadoghq.com/api/latest/spans/)
- [RUM API Documentation](https://docs.datadoghq.com/api/latest/rum/)
- [APM Query Syntax](https://docs.datadoghq.com/tracing/trace_explorer/query_syntax/)
- [Span Tags & Facets](https://docs.datadoghq.com/tracing/trace_explorer/span_tags_attributes/)
