export interface DashboardLabelCount {
  label: string
  count: number
}

export const normalizeDashboardLabel = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi')
    .replace(/\s+/g, ' ')
    .trim()

export function countDashboardLabels(values: string[], emptyLabel: string, locale = 'vi'): DashboardLabelCount[] {
  const grouped = new Map<string, DashboardLabelCount>()
  values.forEach(value => {
    const label = value.trim() || emptyLabel
    const key = normalizeDashboardLabel(label) || '__empty__'
    const current = grouped.get(key)
    if (current) current.count += 1
    else grouped.set(key, { label, count: 1 })
  })
  return [...grouped.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, locale))
}

export const dashboardLabelsEqual = (left: string, right: string) =>
  normalizeDashboardLabel(left) === normalizeDashboardLabel(right)
