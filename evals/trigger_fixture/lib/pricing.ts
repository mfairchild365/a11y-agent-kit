export function calculateShipping(subtotal: number, country: string): number {
  if (country === "US") return subtotal >= 50 ? 0 : 5;
  return 25;
}
