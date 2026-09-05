import { Injectable } from '@nestjs/common'

@Injectable()
export class MetricsService {
  private readonly requests = new Map<string, number>()
  private readonly durations = new Map<string, { sum: number; count: number }>()
  record(method: string, status: number, durationMs: number) {
    const key = `${method}|${status}`,
      durationKey = method
    this.requests.set(key, (this.requests.get(key) || 0) + 1)
    const current = this.durations.get(durationKey) || { sum: 0, count: 0 }
    current.sum += durationMs / 1000
    current.count++
    this.durations.set(durationKey, current)
  }
  render(databaseReady: boolean) {
    const lines = [
      '# HELP assetflow_up AssetFlow API process availability.',
      '# TYPE assetflow_up gauge',
      'assetflow_up 1',
      '# HELP assetflow_database_ready PostgreSQL readiness.',
      '# TYPE assetflow_database_ready gauge',
      `assetflow_database_ready ${databaseReady ? 1 : 0}`,
      '# HELP assetflow_http_requests_total Completed HTTP requests.',
      '# TYPE assetflow_http_requests_total counter',
    ]
    for (const [key, value] of this.requests) {
      const [method, status] = key.split('|')
      lines.push(`assetflow_http_requests_total{method="${method}",status="${status}"} ${value}`)
    }
    lines.push(
      '# HELP assetflow_http_request_duration_seconds_sum Total request duration.',
      '# TYPE assetflow_http_request_duration_seconds_sum counter',
    )
    for (const [method, value] of this.durations) {
      lines.push(
        `assetflow_http_request_duration_seconds_sum{method="${method}"} ${value.sum}`,
        `assetflow_http_request_duration_seconds_count{method="${method}"} ${value.count}`,
      )
    }
    lines.push(
      '# HELP process_resident_memory_bytes Resident memory size.',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${process.memoryUsage().rss}`,
    )
    return `${lines.join('\n')}\n`
  }
}
