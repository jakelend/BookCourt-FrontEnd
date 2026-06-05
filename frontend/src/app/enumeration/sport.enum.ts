export const SPORTS = ['CALCETTO', 'TENNIS', 'PADEL'] as const;

export type Sport = (typeof SPORTS)[number];

export function isSport(value: string | null | undefined): value is Sport {
  return SPORTS.includes(value as Sport);
}
