import { useMemo } from "react";
import { readNativeApi } from "../session-logic";

export function useNativeApi() {
  return useMemo(() => readNativeApi(), []);
}
