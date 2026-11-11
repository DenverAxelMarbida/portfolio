/**
 * Hero entrance policy, shared by the controller component and its CSS so the
 * numeric contract from the 01-04 plan (8–12px over 300–450ms, 50–70ms
 * stagger) lives in exactly one testable place.
 */
export const HERO_ENTRANCE_DISPLACEMENT_PX = 18; //displacement: more noticeable upward movement
export const HERO_ENTRANCE_DURATION_MS = 500; // duration: slower, smoother entrance
export const HERO_ENTRANCE_DELAY_MS = 100; // stagger: more separation between elements

/** Stagger delay in ms for each entrance item, in markup (DOM) order. */
export function heroEntranceSchedule(count: number): number[] {
  const items: number[] = [];
  for (let index = 0; index < Math.max(0, count); index += 1) {
    items.push(index * HERO_ENTRANCE_DELAY_MS);
  }
  return items;
}
