import type { MatView, MatchView } from '@shared/types'
import { NextLine, OrderLine } from './MatRow'

export const UP_NEXT_HEAD = 'Up next'

export const NOT_DRAWN = 'Not drawn yet'

export function SetupBand({ mats, firstUp = 3 }: { mats: MatView[]; firstUp?: number }) {
  return (
    <div className="b-band">
      {mats.map(mat => (
        <section key={mat.id} aria-label={`Mat ${mat.number}`} className="b-panel">
          <div className="b-setup-head font-sans">{`Mat ${mat.number} first up`}</div>
          {mat.onDeck.length === 0
            ? <div className="b-setup-empty font-sans">{NOT_DRAWN}</div>
            : mat.onDeck.slice(0, firstUp).map(match => (
              <NextLine key={match.id} a={match.a} b={match.b} />
            ))}
        </section>
      ))}
    </div>
  )
}

export function OrderBand({ mats, matches, firstUp = 3 }: {
  mats: MatView[]
  matches: MatchView[]
  firstUp?: number
}) {
  const order = matches.filter(m => m.status === 'pending').sort((x, y) => x.orderIndex - y.orderIndex)
  const columns = order.length === 0 || firstUp === 0
    ? 1
    : Math.min(Math.max(1, mats.length), Math.ceil(order.length / firstUp))

  return (
    <div className="b-band b-band-order">
      <div className="b-setup-head font-sans">{UP_NEXT_HEAD}</div>
      <div className="b-order">
        {Array.from({ length: columns }, (_, i) => (
          <section key={i} aria-label={`Up next, column ${i + 1}`} className="b-panel">
            {order.length === 0
              ? <div className="b-setup-empty font-sans">{NOT_DRAWN}</div>
              : order.slice(i * firstUp, (i + 1) * firstUp).map(match => (
                <OrderLine key={match.id} match={match} />
              ))}
          </section>
        ))}
      </div>
    </div>
  )
}
