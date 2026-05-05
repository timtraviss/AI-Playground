// Prepends basePath for client-side fetch calls.
// NEXT_PUBLIC_BASE_PATH is set to '/ddp' when running under the parent app proxy.
// Unset (or empty) for standalone development.
export const apiUrl = (path: string): string =>
  `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`
