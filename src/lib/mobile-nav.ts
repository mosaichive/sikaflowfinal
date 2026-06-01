import type { ModuleKey } from '@/lib/permissions';

export type MobileNavPermissionItem = {
  module?: ModuleKey;
  alwaysVisible?: boolean;
};

export type MobileNavLayout<T extends MobileNavPermissionItem> = {
  primaryItems: T[];
  overflowItems: T[];
  showMore: boolean;
};

export function getVisibleMobileNavItems<T extends MobileNavPermissionItem>(
  items: readonly T[],
  hasModule: (module: ModuleKey) => boolean,
) {
  return items.filter((item) => item.alwaysVisible || (item.module ? hasModule(item.module) : true));
}

export function getMobileNavLayout<T extends MobileNavPermissionItem>(
  items: readonly T[],
  hasModule: (module: ModuleKey) => boolean,
  maxDirectItems = 5,
): MobileNavLayout<T> {
  const visibleItems = getVisibleMobileNavItems(items, hasModule);
  if (visibleItems.length <= maxDirectItems) {
    return {
      primaryItems: visibleItems,
      overflowItems: [],
      showMore: false,
    };
  }

  const directItemCount = Math.max(1, maxDirectItems - 1);
  return {
    primaryItems: visibleItems.slice(0, directItemCount),
    overflowItems: visibleItems.slice(directItemCount),
    showMore: true,
  };
}
