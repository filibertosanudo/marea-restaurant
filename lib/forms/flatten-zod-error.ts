/** Every Server Action's zod-issues-to-fieldErrors shape, in one place going forward. */
export function flattenZodError(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[issue.path.join(".")] = issue.message;
  return out;
}
