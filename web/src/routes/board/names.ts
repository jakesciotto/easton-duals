export interface BoardNameParts { first: string; last: string }

export function boardName(full: string): BoardNameParts {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '' }
  if (parts.length === 1) return { first: parts[0], last: '' }
  const surname = parts[parts.length - 1]
  return { first: parts[0], last: `${surname.charAt(0).toUpperCase()}.` }
}

export function boardNameText(full: string): string {
  const { first, last } = boardName(full)
  return last ? `${first} ${last}` : first
}
