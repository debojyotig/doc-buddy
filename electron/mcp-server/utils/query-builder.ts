/**
 * Dynamic Datadog Query Builder
 * Provides a fluent API for building Datadog queries for Spans, RUM, and Logs
 */

export interface QueryBuilderOptions {
  service?: string;
  environment?: string;
  operation?: string;
  status?: 'ok' | 'error';
  spanKind?: 'entry' | 'client' | 'server' | 'producer' | 'consumer';
  spanType?: 'web' | 'db' | 'cache' | 'http' | 'grpc';
  minDuration?: number;      // milliseconds
  maxDuration?: number;      // milliseconds
  errorType?: string;
  customFilters?: string[];
}

export class DatadogQueryBuilder {
  private filters: string[] = [];

  /**
   * Add service filter
   */
  service(name: string): this {
    this.filters.push(`service:${name}`);
    return this;
  }

  /**
   * Add environment filter (supports both env: and environment: tags)
   */
  environment(env: string): this {
    this.filters.push(`(env:${env} OR environment:${env})`);
    return this;
  }

  /**
   * Add operation/resource name filter
   */
  operation(op: string): this {
    this.filters.push(`resource_name:"${op}"`);
    return this;
  }

  /**
   * Add status filter
   */
  status(status: 'ok' | 'error'): this {
    this.filters.push(`status:${status}`);
    return this;
  }

  /**
   * Add span kind filter
   * - entry: Service entry spans (incoming requests)
   * - client: Outbound calls to other services
   * - server: Server handling a request
   * - producer: Message queue producer
   * - consumer: Message queue consumer
   */
  spanKind(kind: 'entry' | 'client' | 'server' | 'producer' | 'consumer'): this {
    this.filters.push(`span.kind:${kind}`);
    return this;
  }

  /**
   * Add span type filter
   */
  spanType(type: 'web' | 'db' | 'cache' | 'http' | 'grpc'): this {
    this.filters.push(`span.type:${type}`);
    return this;
  }

  /**
   * Add minimum duration filter
   */
  durationGreaterThan(ms: number): this {
    const durationNs = ms * 1000000; // Convert milliseconds to nanoseconds
    this.filters.push(`@duration:>=${durationNs}`);
    return this;
  }

  /**
   * Add maximum duration filter
   */
  durationLessThan(ms: number): this {
    const durationNs = ms * 1000000;
    this.filters.push(`@duration:<${durationNs}`);
    return this;
  }

  /**
   * Add duration range filter
   */
  durationBetween(minMs: number, maxMs: number): this {
    const minNs = minMs * 1000000;
    const maxNs = maxMs * 1000000;
    this.filters.push(`@duration:[${minNs} TO ${maxNs}]`);
    return this;
  }

  /**
   * Add error type filter
   */
  errorType(type: string): this {
    this.filters.push(`@error.type:"${type}"`);
    return this;
  }

  /**
   * Add error message filter
   */
  errorMessage(message: string): this {
    this.filters.push(`@error.message:"${message}"`);
    return this;
  }

  /**
   * Add HTTP status code filter
   */
  httpStatusCode(code: number): this {
    this.filters.push(`@http.status_code:${code}`);
    return this;
  }

  /**
   * Add HTTP method filter
   */
  httpMethod(method: string): this {
    this.filters.push(`@http.method:${method.toUpperCase()}`);
    return this;
  }

  /**
   * Add HTTP URL path filter
   */
  httpUrl(url: string): this {
    this.filters.push(`@http.url:"${url}"`);
    return this;
  }

  /**
   * Add peer service filter (for downstream service calls)
   */
  peerService(service: string): this {
    this.filters.push(`peer.service:${service}`);
    return this;
  }

  /**
   * Add custom filter string
   */
  custom(filter: string): this {
    this.filters.push(filter);
    return this;
  }

  /**
   * Build the final query string
   */
  build(): string {
    return this.filters.join(' ');
  }

  /**
   * Reset the builder
   */
  reset(): this {
    this.filters = [];
    return this;
  }

  /**
   * Get current filters
   */
  getFilters(): string[] {
    return [...this.filters];
  }
}

/**
 * Build a query from options object (convenience method)
 */
export function buildQueryFromOptions(options: QueryBuilderOptions): string {
  const builder = new DatadogQueryBuilder();

  if (options.service) {
    builder.service(options.service);
  }

  if (options.environment) {
    builder.environment(options.environment);
  }

  if (options.operation) {
    builder.operation(options.operation);
  }

  if (options.status) {
    builder.status(options.status);
  }

  if (options.spanKind) {
    builder.spanKind(options.spanKind);
  }

  if (options.spanType) {
    builder.spanType(options.spanType);
  }

  if (options.minDuration !== undefined && options.maxDuration !== undefined) {
    builder.durationBetween(options.minDuration, options.maxDuration);
  } else {
    if (options.minDuration !== undefined) {
      builder.durationGreaterThan(options.minDuration);
    }
    if (options.maxDuration !== undefined) {
      builder.durationLessThan(options.maxDuration);
    }
  }

  if (options.errorType) {
    builder.errorType(options.errorType);
  }

  if (options.customFilters) {
    options.customFilters.forEach(filter => builder.custom(filter));
  }

  return builder.build();
}

/**
 * Build a query for service entry spans (service-level operations)
 */
export function buildServiceEntryQuery(service: string, environment?: string): string {
  return new DatadogQueryBuilder()
    .service(service)
    .spanKind('entry')
    .environment(environment || '')
    .build()
    .trim();
}

/**
 * Build a query for service-to-service calls
 */
export function buildServiceToServiceQuery(
  callerService: string,
  calleeService: string,
  environment?: string
): string {
  const builder = new DatadogQueryBuilder()
    .service(callerService)
    .spanKind('client')
    .peerService(calleeService);

  if (environment) {
    builder.environment(environment);
  }

  return builder.build();
}

/**
 * Build a query for error spans
 */
export function buildErrorQuery(service: string, environment?: string): string {
  const builder = new DatadogQueryBuilder()
    .service(service)
    .status('error');

  if (environment) {
    builder.environment(environment);
  }

  return builder.build();
}
