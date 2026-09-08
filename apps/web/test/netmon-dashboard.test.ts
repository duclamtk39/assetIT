import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hourLabel,
  linePoints,
  niceScale,
  outageDuration,
  ringDash,
  share,
} from '../src/features/netmon/netmon-dashboard'

test('a share of nothing is zero rather than NaN on the card', () => {
  assert.equal(share(3, 12), 25)
  assert.equal(share(1, 3), 33.3)
  assert.equal(share(0, 0), 0)
  assert.equal(share(5, 0), 0)
})

test('an outage reads as a duration in the largest useful unit', () => {
  assert.equal(outageDuration(7), '7 phút')
  assert.equal(outageDuration(135), '2 giờ 15 phút')
  assert.equal(outageDuration(1500), '1 ngày 1 giờ')
})

test('the axis rounds up to readable steps', () => {
  assert.equal(niceScale([12, 45, 88]).max, 100)
  assert.deepEqual(niceScale([12, 45, 88]).ticks, [0, 20, 40, 60, 80, 100])
  assert.equal(niceScale([3, 5]).max >= 20, true)
})

test('an all-zero series still gets a real axis instead of collapsing', () => {
  // Without a floor the maximum is 0, every point divides by zero and the line is drawn along the
  // top of the box - a 0 ms response would read as the worst reading on the chart.
  const scale = niceScale([0, 0, 0])
  assert.ok(scale.max > 0)
  assert.ok(Number.isFinite(scale.max))
  const points = linePoints([0, 0], scale, 100, 50)
  assert.equal(points, '0,50 100,50', 'không có độ trễ thì đường nằm ở đáy')
})

test('a series of only gaps produces no line at all', () => {
  const scale = niceScale([null, null])
  assert.equal(linePoints([null, null], scale, 100, 50), '')
  assert.equal(linePoints([], scale, 100, 50), '')
  assert.equal(linePoints([42], scale, 100, 50), '', 'một điểm thì không vẽ được đường')
})

test('gaps are skipped rather than plotted as zero', () => {
  // An hour where nothing answered is unknown, not instant. Plotting it at 0 ms would invent a
  // perfect reading in the middle of an outage.
  const scale = niceScale([100])
  const points = linePoints([100, null, 50], scale, 100, 50).split(' ')
  assert.equal(points.length, 2)
  assert.equal(points[0], '0,0')
  assert.equal(points[1], '100,25')
})

test('a value above the axis maximum is clamped instead of drawn off the chart', () => {
  const scale = { max: 100, ticks: [0, 50, 100] }
  assert.equal(linePoints([500, 0], scale, 100, 50), '0,0 100,50')
})

test('the health ring is bounded and empty at zero', () => {
  const full = ringDash(100, 52)
  assert.equal(Math.round(full.offset), 0)
  const empty = ringDash(0, 52)
  assert.equal(Math.round(empty.offset), Math.round(empty.circumference))
  assert.equal(Math.round(ringDash(150, 52).offset), 0, 'quá 100% vẫn là vòng đầy')
  assert.equal(Math.round(ringDash(-5, 52).offset), Math.round(empty.circumference))
})

test('hour labels come out in the local clock and survive bad input', () => {
  const label = hourLabel('2026-09-08T03:00:00.000Z')
  assert.match(label, /^\d{2}:00$/)
  assert.equal(hourLabel('không phải ngày'), '')
})
