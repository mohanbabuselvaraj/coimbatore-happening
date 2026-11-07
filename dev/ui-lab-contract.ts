export const UI_CASES = [
  ['demo','Demo data'], ['worst','Worst case'], ['empty','Empty'], ['one','One'],
  ['page','100 posts'], ['page-plus','101 posts'], ['huge','1,000 posts'],
  ['loading','Loading'], ['error','API error'], ['map-error','Map error'],
  ['slow-current','Slow Current'], ['stale','Stale weather'],
] as const;
export type UiCase = typeof UI_CASES[number][0];
export function isUiCase(value: unknown): value is UiCase {
  return UI_CASES.some(([key]) => key === value);
}
