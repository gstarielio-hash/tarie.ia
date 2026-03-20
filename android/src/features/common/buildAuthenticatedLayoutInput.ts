import type {
  AuthenticatedLayoutInput,
  BuildAuthenticatedLayoutInputParams,
} from "./inspectorUiBuilderTypes";

export function buildAuthenticatedLayoutInput({
  composer,
  history,
  session,
  shell,
  thread,
}: BuildAuthenticatedLayoutInputParams): AuthenticatedLayoutInput {
  return {
    ...shell,
    ...history,
    ...thread,
    ...composer,
    ...session,
  };
}
