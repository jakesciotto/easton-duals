export class MatchStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MatchStateError'
  }
}
