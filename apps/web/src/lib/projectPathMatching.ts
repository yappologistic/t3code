function buildNormalizedSegments(rawPath: string, clampAboveRoot: boolean): string[] {
  const segments: string[] = [];

  for (const segment of rawPath.split(/\/+/)) {
    if (segment.length === 0 || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..") {
        segments.pop();
      } else if (!clampAboveRoot) {
        segments.push(segment);
      }
      continue;
    }
    segments.push(segment);
  }

  return segments;
}

export function normalizeWorkspacePathForComparison(
  path: string | null | undefined,
): string | null {
  if (typeof path !== "string") {
    return null;
  }

  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }

  const normalizedSeparators = trimmed.replace(/\\+/g, "/");
  const isUncPath = normalizedSeparators.startsWith("//");
  const driveMatch = normalizedSeparators.match(/^([A-Za-z]:)(?:\/|$)/);
  const isWindowsStyle = isUncPath || driveMatch !== null || trimmed.includes("\\");

  let prefix = "";
  let remainder = normalizedSeparators;

  if (driveMatch) {
    prefix = driveMatch[1]!.toLowerCase();
    remainder = normalizedSeparators.slice(driveMatch[0].length);
  } else if (isUncPath) {
    const uncBody = normalizedSeparators.slice(2);
    const [server = "", share = "", ...rest] = uncBody.split(/\/+/);
    prefix = `//${server}/${share}`;
    remainder = rest.join("/");
  } else if (normalizedSeparators.startsWith("/")) {
    prefix = "/";
    remainder = normalizedSeparators.slice(1);
  }

  const normalizedSegments = buildNormalizedSegments(remainder, prefix.length > 0);
  const joinedSegments = normalizedSegments.join("/");

  let normalizedPath = prefix;
  if (prefix === "/") {
    normalizedPath = joinedSegments.length > 0 ? `/${joinedSegments}` : "/";
  } else if (prefix.length > 0) {
    normalizedPath = joinedSegments.length > 0 ? `${prefix}/${joinedSegments}` : `${prefix}/`;
  } else {
    normalizedPath = joinedSegments.length > 0 ? joinedSegments : ".";
  }

  return isWindowsStyle ? normalizedPath.toLowerCase() : normalizedPath;
}

export function workspacePathsLikelyMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalizedLeft = normalizeWorkspacePathForComparison(left);
  const normalizedRight = normalizeWorkspacePathForComparison(right);
  return normalizedLeft !== null && normalizedLeft === normalizedRight;
}
