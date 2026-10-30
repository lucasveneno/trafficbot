// Note: schema versioning is already implemented via `schemaVersion: 1` in BrowserProfile.ts (z.literal(1)).
// This module provides lightweight, non-throwing cross-field consistency checks that complement
// the Zod schema by returning structured issues instead of throwing on the first failure.

import { BrowserProfile } from './BrowserProfile';

export interface ConsistencyIssue {
  field: string;
  expected: string;
  actual: string;
}

/**
 * Validates cross-field consistency of a fully-parsed BrowserProfile.
 * Returns an empty array when the profile is fully consistent.
 * Never throws — all problems are returned as structured ConsistencyIssue objects.
 */
export function validateProfileConsistency(profile: BrowserProfile): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  // 1. Mobile profiles must have a phone-width viewport (≤600 px).
  if (profile.mobile === true && profile.viewport.width > 600) {
    issues.push({
      field: 'viewport.width',
      expected: '≤600 for mobile',
      actual: String(profile.viewport.width),
    });
  }

  // 2. Windows user-agent must contain the 'Windows NT' token.
  if (profile.operatingSystem === 'windows' && !profile.userAgent.includes('Windows NT')) {
    issues.push({
      field: 'userAgent',
      expected: 'contains Windows NT',
      actual: 'missing',
    });
  }

  // 3. macOS user-agent must contain the 'Macintosh' token.
  if (profile.operatingSystem === 'macos' && !profile.userAgent.includes('Macintosh')) {
    issues.push({
      field: 'userAgent',
      expected: 'contains Macintosh',
      actual: 'missing',
    });
  }

  // 4. Android user-agent must contain the 'Android' token.
  if (profile.operatingSystem === 'android' && !profile.userAgent.includes('Android')) {
    issues.push({
      field: 'userAgent',
      expected: 'contains Android',
      actual: 'missing',
    });
  }

  // 5. iOS user-agent must contain 'iPhone' or 'iPad'.
  if (profile.operatingSystem === 'ios' && !profile.userAgent.includes('iPhone') && !profile.userAgent.includes('iPad')) {
    issues.push({
      field: 'userAgent',
      expected: 'contains iPhone or iPad',
      actual: 'missing',
    });
  }

  // 6. Safari must not expose client hints.
  if (profile.browser === 'safari' && profile.clientHints !== null) {
    issues.push({
      field: 'clientHints',
      expected: 'null for Safari',
      actual: 'non-null',
    });
  }

  // 7. Firefox must not expose client hints.
  if (profile.browser === 'firefox' && profile.clientHints !== null) {
    issues.push({
      field: 'clientHints',
      expected: 'null for Firefox',
      actual: 'non-null',
    });
  }

  // 8. Windows + Chromium: secChUaPlatform must equal the JSON-serialised string "Windows".
  if (profile.operatingSystem === 'windows' && profile.clientHints !== null) {
    if (profile.clientHints.secChUaPlatform !== '"Windows"') {
      issues.push({
        field: 'clientHints.secChUaPlatform',
        expected: '"Windows"',
        actual: profile.clientHints.secChUaPlatform,
      });
    }
  }

  // 9. macOS + Chromium: secChUaPlatform must equal the JSON-serialised string "macOS".
  if (profile.operatingSystem === 'macos' && profile.clientHints !== null) {
    if (profile.clientHints.secChUaPlatform !== '"macOS"') {
      issues.push({
        field: 'clientHints.secChUaPlatform',
        expected: '"macOS"',
        actual: profile.clientHints.secChUaPlatform,
      });
    }
  }

  // 10. Mobile profiles must have touch enabled.
  if (profile.mobile === true && profile.touch !== true) {
    issues.push({
      field: 'touch',
      expected: 'true for mobile',
      actual: 'false',
    });
  }

  // 11. iOS and Android devices must be flagged as mobile.
  if ((profile.operatingSystem === 'ios' || profile.operatingSystem === 'android') && profile.mobile !== true) {
    issues.push({
      field: 'mobile',
      expected: 'true for iOS/Android',
      actual: 'false',
    });
  }

  // 12. Desktop profiles must have a viewport wider than 600 px.
  if (profile.mobile === false && profile.viewport.width <= 600) {
    issues.push({
      field: 'viewport.width',
      expected: '>600 for desktop',
      actual: String(profile.viewport.width),
    });
  }

  return issues;
}
