import { expect, test, describe } from "vitest";
import { LotteryMath } from "./lottery.math";

describe("LotteryMath", () => {
  test("add works without carrying", () => {
    expect(LotteryMath.add(7, 5)).toBe(2);
    expect(LotteryMath.add(2, 3)).toBe(5);
  });

  test("mirror works", () => {
    expect(LotteryMath.mirror(2)).toBe(7);
    expect(LotteryMath.mirror(7)).toBe(2);
  });

  test("calculateDateSum works", () => {
    // March 27 (3 + 27 = 30 -> 0)
    expect(LotteryMath.calculateDateSum("2026-03-27")).toBe(0);
  });

  test("rundown123 works", () => {
    const start = [2, 5, 4];
    const rd = LotteryMath.rundown123(start);
    expect(rd[0]).toEqual([3, 7, 7]); // 2+1, 5+2, 4+3
    expect(rd[1]).toEqual([4, 9, 0]); // 3+1, 7+2, 7+3
  });
});
