declare module '#shared/hexes' {
  type IsNegative<T extends number> = `${T}` extends `-${string}` ? true : false;
  type IsZero<T extends number> = `${T}` extends '0' ? true : false;
  type IsDecimal<T extends number> = `${T}` extends `${number}.${number}` ? true : false;

  type PositiveInteger<T extends number> = IsNegative<T> extends true
    ? never
    : IsZero<T> extends true
      ? never
      : IsDecimal<T> extends true
        ? never
        : T;

  type NonZeroInteger<T extends number> = IsZero<T> extends true
    ? never
    : IsDecimal<T> extends true
      ? never
      : T;

  export type HexId<T extends number = number> = PositiveInteger<T>;
  export type HexInstruction<T extends number = number> = NonZeroInteger<T>;

  export interface HexInstructionPayload<T extends number = number> {
    value: HexInstruction<T>;
  }

  export type RevealedHexes<T extends number = number> = { hexes: HexId<T>[] };
}
