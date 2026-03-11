export function toRevealedHexIdSet(hexes: Array<number | string> | undefined) {
  return new Set((hexes ?? []).map((value) => String(value)));
}

/**
 * If the hex is currently revealed, a positive value tells the server to cover it up.
 * If currently hidden, the negative value will instruct it to reveal it.
 *
 * @param hexId The hex to be toggled
 * @param isCurrentlyRevealed The current visible state of that hex
 */
export function getInstructionValue(
  hexId: string,
  isCurrentlyRevealed: boolean,
) {
  const numericHexId = Number(hexId);
  return isCurrentlyRevealed ? numericHexId : -numericHexId;
}

export function toggleRevealedHex(
  previousRevealedHexes: ReadonlySet<string>,
  hexId: string,
) {
  const next = new Set(previousRevealedHexes);
  if (next.has(hexId)) {
    next.delete(hexId);
  } else {
    next.add(hexId);
  }
  return next;
}
