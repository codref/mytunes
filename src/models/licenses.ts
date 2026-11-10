/** SPDX ids offered in the Rights tab (plus free-text Custom). */
export const SPDX_LICENSE_OPTIONS = [
  'CC-BY-SA-4.0',
  'CC-BY-4.0',
  'CC0-1.0',
  'CC-BY-NC-SA-4.0',
  'MIT',
  'Apache-2.0',
] as const;

export type KnownSpdxLicense = (typeof SPDX_LICENSE_OPTIONS)[number];

export const DEFAULT_LICENSE_PRIMARY: KnownSpdxLicense = 'CC-BY-SA-4.0';

export const CUSTOM_LICENSE_OPTION = 'Custom…';

/** Quasar select options: known SPDX + Custom. */
export const LICENSE_SELECT_OPTIONS: string[] = [
  ...SPDX_LICENSE_OPTIONS,
  CUSTOM_LICENSE_OPTION,
];

export function isKnownSpdxLicense(id: string): id is KnownSpdxLicense {
  return (SPDX_LICENSE_OPTIONS as readonly string[]).includes(id);
}

/** Filename stem under src-electron/assets/licenses/ for a known SPDX id. */
export function licenseAssetBasename(spdxId: string): string | null {
  if (!isKnownSpdxLicense(spdxId)) return null;
  return `${spdxId}.txt`;
}

export function licenseLabel(spdxId: string): string {
  switch (spdxId) {
    case 'CC-BY-SA-4.0':
      return 'Creative Commons Attribution-ShareAlike 4.0';
    case 'CC-BY-4.0':
      return 'Creative Commons Attribution 4.0';
    case 'CC0-1.0':
      return 'Creative Commons Zero 1.0 (public domain dedication)';
    case 'CC-BY-NC-SA-4.0':
      return 'Creative Commons Attribution-NonCommercial-ShareAlike 4.0';
    case 'MIT':
      return 'MIT License';
    case 'Apache-2.0':
      return 'Apache License 2.0';
    default:
      return spdxId;
  }
}
