/**
 * Lottery Math Utilities
 * Based on "La estrategia de lotería Pick 3 más precisa y que realmente funciona"
 */

export class LotteryMath {
  /**
   * Addition without carrying (Lottery Math)
   * Example: 12 + 12 = 24 -> 4 (omitting the first digit)
   * In Pick 3, we usually work with single digits 0-9.
   */
  static add(a: number, b: number): number {
    return (a + b) % 10;
  }

  static subtract(a: number, b: number): number {
    return (a - b + 10) % 10;
  }

  /**
   * Mirror numbers (Number + 5)
   */
  static mirror(n: number): number {
    return (n + 5) % 10;
  }

  /**
   * Date Sum: (Month + Day) % 10
   */
  static calculateDateSum(dateStr: string): number {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 0;
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return (month + day) % 10;
  }

  /**
   * Hit Sum (Base Sum): (n1 + n2 + n3) % 10
   */
  static calculateHitSum(result: number[]): number {
    return result.reduce((a, b) => a + b, 0) % 10;
  }

  /**
   * Root Sum: Keep adding digits until a single digit is reached
   */
  static calculateRootSum(result: number[]): number {
    let sum = result.reduce((a, b) => a + b, 0);
    while (sum >= 10) {
      sum = sum.toString().split('').reduce((a, b) => a + parseInt(b), 0);
    }
    return sum;
  }

  /**
   * Rundown +1: Add 1 to each digit repeatedly until original is reached
   */
  static rundownPlusOne(start: number[]): number[][] {
    const results: number[][] = [];
    let current = [...start];
    for (let i = 0; i < 10; i++) {
      current = current.map(n => (n + 1) % 10);
      results.push([...current]);
    }
    return results;
  }

  /**
   * Rundown 123: Add 1 to first, 2 to second, 3 to third digit
   */
  static rundown123(start: number[]): number[][] {
    const results: number[][] = [];
    let current = [...start];
    for (let i = 0; i < 10; i++) {
      current = [
        (current[0] + 1) % 10,
        (current[1] + 2) % 10,
        (current[2] + 3) % 10
      ];
      results.push([...current]);
    }
    return results;
  }

  /**
   * Rundown 317: Add 3 to first, 1 to second, 7 to third digit
   */
  static rundown317(start: number[]): number[][] {
    const results: number[][] = [];
    let current = [...start];
    for (let i = 0; i < 10; i++) {
      current = [
        (current[0] + 3) % 10,
        (current[1] + 1) % 10,
        (current[2] + 7) % 10
      ];
      results.push([...current]);
    }
    return results;
  }

  /**
   * Tic-Tac-Toe Strategy
   * Generates combinations based on a 3x3 grid
   */
  static generateTicTacToe(lastResults: number[][]): number[][] {
    if (lastResults.length < 3) return [];

    const grid = lastResults.slice(0, 3);
    const combinations: number[][] = [];

    // Horizontals
    grid.forEach(row => combinations.push([...row]));

    // Verticals
    for (let i = 0; i < 3; i++) {
      combinations.push([grid[0][i], grid[1][i], grid[2][i]]);
    }

    // Diagonals
    combinations.push([grid[0][0], grid[1][1], grid[2][2]]);
    combinations.push([grid[0][2], grid[1][1], grid[2][0]]);

    return combinations;
  }
}
