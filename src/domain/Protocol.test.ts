
import { checkCompatibility } from './Protocol';

describe('checkCompatibility', () => {
  test('returns unknown when protocol missing', () => {
    expect(checkCompatibility(undefined, undefined)).toBe('unknown');
  });

  test('returns upgrade_required when below min protocol', () => {
    expect(checkCompatibility(0, '1.0.0')).toBe('upgrade_required');
  });

  test('returns compatible when matching latest version', () => {
    expect(checkCompatibility(1, '2.0.1', '2.0.1')).toBe('compatible');
  });

  test('returns update_available when older version but protocol compatible', () => {
    expect(checkCompatibility(1, '2.0.0', '2.0.1')).toBe('update_available');
  });
});
