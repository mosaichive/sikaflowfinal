import { useBusinessFinancials } from '@/context/BusinessFinancialsContext';

export function useFinancialEngine() {
  return useBusinessFinancials();
}
