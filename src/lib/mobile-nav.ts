import type { ModuleKey } from '@/lib/permissions';

export type MobileNavPermissionItem = {
  module?: ModuleKey;
  alwaysVisible?: boolean;
};

export function getVisibleMobileNavItems<T extends MobileNavPermissionItem>(
  items: readonly T[],
  hasModule: (module: ModuleKey) => boolean,
) {
  return items.filter((item) => item.alwaysVisible || (item.module ? hasModule(item.module) : true));
}
