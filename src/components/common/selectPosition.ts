export function getSelectPosition(
  rect: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
) {
  const width = Math.min(Math.max(rect.width, 220), viewportWidth - 24);
  const left = Math.max(12, Math.min(rect.left, viewportWidth - width - 12));
  const below = viewportHeight - rect.bottom - 12;
  const above = rect.top - 12;
  const openBelow = below >= Math.min(280, above) || below >= above;
  const maxHeight = Math.min(280, Math.max(144, openBelow ? below : above));
  return {
    top: openBelow ? rect.bottom + 6 : Math.max(12, rect.top - maxHeight - 6),
    left,
    width,
    maxHeight,
  };
}
