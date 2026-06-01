import { ALL_MODULES, modulesForRole, type ModuleKey } from '@/lib/permissions';

const KNOWN_MODULES = new Set<ModuleKey>(ALL_MODULES.map((module) => module.key));

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === 'string' && KNOWN_MODULES.has(value as ModuleKey);
}

export function resolveStaffModules(role: string, modules: unknown): ModuleKey[] {
  if (Array.isArray(modules)) {
    return modules.filter(isModuleKey);
  }

  return modulesForRole(role);
}
