import { buildSessionModalsStackProps } from "./buildSessionModalsStackProps";
import {
  buildInspectorSessionModalCallbacks,
  buildInspectorSessionModalState,
} from "./buildInspectorSessionModalsSections";

type BuildInspectorSessionModalsStackPropsInput = Record<string, any>;

export function buildInspectorSessionModalsStackProps(
  input: BuildInspectorSessionModalsStackPropsInput,
): ReturnType<typeof buildSessionModalsStackProps> {
  return buildSessionModalsStackProps({
    ...buildInspectorSessionModalState(input),
    ...buildInspectorSessionModalCallbacks(input),
  });
}
