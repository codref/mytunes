/** Plain JSON clone for Electron IPC (Vue proxies are not structured-cloneable). */
export function toIpcPayload<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
