type BuildAuthenticatedLayoutInputParams = {
  composer: Record<string, any>;
  history: Record<string, any>;
  session: Record<string, any>;
  shell: Record<string, any>;
  thread: Record<string, any>;
};

export function buildAuthenticatedLayoutInput({
  composer,
  history,
  session,
  shell,
  thread,
}: BuildAuthenticatedLayoutInputParams) {
  return {
    ...shell,
    ...history,
    ...thread,
    ...composer,
    ...session,
  };
}
