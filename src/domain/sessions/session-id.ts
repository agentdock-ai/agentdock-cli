const sessionIdPattern = /^[a-zA-Z0-9-]+$/;

export function isValidSessionId(value: string): boolean {
  return sessionIdPattern.test(value);
}
