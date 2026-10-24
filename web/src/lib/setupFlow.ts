export const SETUP_PARAM = 'setup'

export const SETUP_STEPS = ['roster', 'matches'] as const

export type SetupStep = (typeof SETUP_STEPS)[number]

export function setupStepOf(value: string | null): SetupStep | null {
  return SETUP_STEPS.includes(value as SetupStep) ? (value as SetupStep) : null
}

export function eventSetupPath(eventId: number, step: SetupStep): string {
  return `/events/${eventId}?${SETUP_PARAM}=${step}`
}
