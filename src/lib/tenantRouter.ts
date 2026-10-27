/**
 * TENANT ROUTER — Direct users to correct system by tenant code.
 *
 * After universal login gate, users are directed to their project's entry point.
 * Supports: KMB, MAR, SUM (extensible).
 */

import type { Identitas } from './auth.js';

export interface TenantConfig {
  code: string;
  name: string;
  homePath: string;
  isActive: boolean;
}

const TENANT_CONFIGS: Record<string, TenantConfig> = {
  KMB: {
    code: 'KMB',
    name: 'KMB — KMB Project',
    homePath: '/monitoring',
    isActive: true,
  },
  MAR: {
    code: 'MAR',
    name: 'MAR — Mechanic Activity Report',
    homePath: '/monitoring',
    isActive: true,
  },
  SUM: {
    code: 'SUM',
    name: 'SUM — Service Unit Management',
    homePath: '/monitoring',
    isActive: true,
  },
};

/**
 * Get home path for tenant.
 * Respects role hierarchy: L1/L2 → approval, else → monitoring.
 */
export function dapatkanPathAwal(aku: Identitas): string {
  const tenantConfig = TENANT_CONFIGS[aku.tenantCode];

  if (!tenantConfig?.isActive) {
    return '/masuk';
  }

  if (aku.peran === 'supervisor' || aku.peran === 'superintendent') {
    return '/approval';
  }

  return tenantConfig.homePath;
}

/**
 * Get tenant display name.
 */
export function dapatkanNamaTenant(tenantCode: string): string {
  return TENANT_CONFIGS[tenantCode]?.name || tenantCode;
}

/**
 * List all active tenants (for admin UI).
 */
export function daftarTenant(): TenantConfig[] {
  return Object.values(TENANT_CONFIGS).filter((t) => t.isActive);
}

/**
 * Register new tenant (extend system for new projects).
 */
export function daftarkanTenant(config: TenantConfig): void {
  TENANT_CONFIGS[config.code] = config;
}
