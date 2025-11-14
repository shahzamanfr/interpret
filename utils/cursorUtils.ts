export interface CursorPosition {
  x: number;
  y: number;
  username: string;
  color: string;
}

export function interpolateCursorPosition(
  start: CursorPosition,
  end: CursorPosition,
  progress: number
): CursorPosition {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
    username: end.username,
    color: end.color,
  };
}
