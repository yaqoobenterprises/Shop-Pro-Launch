import { useMemo } from "react";
import { useTheme } from "../../design-system/useTheme";
import { readChartTheme } from "./echartsOptions";
export function useChartTheme() {
  const [appearance] = useTheme();
  return useMemo(() => ({ ...readChartTheme(), appearance }), [appearance]);
}
