import { buildSessionModalsStackProps } from "./buildSessionModalsStackProps";
import {
  buildInspectorSessionModalCallbacks,
  buildInspectorSessionModalState,
} from "./buildInspectorSessionModalsSections";
import type { InspectorSessionModalsInput } from "./inspectorUiBuilderTypes";

export function buildInspectorSessionModalsStackProps(
  input: InspectorSessionModalsInput,
): ReturnType<typeof buildSessionModalsStackProps> {
  return buildSessionModalsStackProps({
    ...buildInspectorSessionModalState(input),
    ...buildInspectorSessionModalCallbacks(input),
  });
}
