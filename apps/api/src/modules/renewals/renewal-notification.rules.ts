export function notificationRecipients(configured: string[], notifyOwner: boolean, ownerEmail?: string | null) {
  return [
    ...new Set(
      [...configured, ...(notifyOwner && ownerEmail ? [ownerEmail] : [])]
        .map(value => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
}

export function nextNotificationAttempt(attempts: number, now = Date.now()) {
  return new Date(now + Math.min(60, 2 ** Math.max(1, attempts)) * 60_000)
}
