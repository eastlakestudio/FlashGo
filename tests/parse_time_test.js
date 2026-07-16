const assert = require('assert');

function parseRecurringTime(recurringTimeStr) {
  if (!recurringTimeStr) return { hours: 0, minutes: 0 };
  const isPM = /pm/i.test(recurringTimeStr);
  const isAM = /am/i.test(recurringTimeStr);
  const cleanStr = recurringTimeStr.replace(/[a-zA-Z]/g, '').trim();
  let [hours, minutes] = cleanStr.split(':').map(Number);
  if (isNaN(hours)) hours = 0;
  if (isNaN(minutes)) minutes = 0;
  if (isPM && hours < 12) {
    hours += 12;
  } else if (isAM && hours === 12) {
    hours = 0;
  }
  return { hours, minutes };
}

describe('parseRecurringTime Tests', () => {
  it('should parse 12-hour PM correctly', () => {
    const result = parseRecurringTime('01:30 PM');
    assert.strictEqual(result.hours, 13);
    assert.strictEqual(result.minutes, 30);
  });

  it('should parse 12-hour AM correctly', () => {
    const result = parseRecurringTime('12:00 AM');
    assert.strictEqual(result.hours, 0);
    assert.strictEqual(result.minutes, 0);
  });

  it('should parse 12-hour PM noon correctly', () => {
    const result = parseRecurringTime('12:15 PM');
    assert.strictEqual(result.hours, 12);
    assert.strictEqual(result.minutes, 15);
  });

  it('should parse 12-hour morning correctly', () => {
    const result = parseRecurringTime('09:45 AM');
    assert.strictEqual(result.hours, 9);
    assert.strictEqual(result.minutes, 45);
  });

  it('should parse 24-hour style correctly', () => {
    const result = parseRecurringTime('14:20');
    assert.strictEqual(result.hours, 14);
    assert.strictEqual(result.minutes, 20);
  });

  it('should handle empty or invalid input gracefully', () => {
    assert.deepStrictEqual(parseRecurringTime(''), { hours: 0, minutes: 0 });
    assert.deepStrictEqual(parseRecurringTime(null), { hours: 0, minutes: 0 });
    assert.deepStrictEqual(parseRecurringTime('invalid'), { hours: 0, minutes: 0 });
  });
});
