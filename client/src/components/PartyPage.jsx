import GuestRequest from './GuestRequest'
import GuestCards from './GuestCards'

// Party day: handle last-minute requests and give each guest one personal recommendation.
export default function PartyPage({ saved, onBack, onMatch, onUpdateGuest, onAddGuest, onRemoveGuest, onRecommend, onNewParty }) {
  return (
    <div className="screen">
      <div className="party-head">
        <h2>Party time</h2>
        <button type="button" onClick={onBack}>
          Back to my plan
        </button>
      </div>

      <GuestRequest plan={saved.plan} onMatch={onMatch} />

      <section className="block">
        <h2>Make every guest feel remembered</h2>
        <p className="hint">
          Tell Qlooful a little about a guest and choose what to recommend. You get one solid pick that makes the evening
          personal for them. Notes are only saved on this device; they are sent to the AI and Qlooful to make the pick and are
          not stored there.
        </p>
        <GuestCards
          guests={saved.guests}
          onUpdate={onUpdateGuest}
          onAdd={onAddGuest}
          onRemove={onRemoveGuest}
          onRecommend={onRecommend}
        />
      </section>

      <section className="block new-party">
        <button
          type="button"
          className="new-party-btn"
          onClick={() => {
            if (window.confirm('Plan another party? This clears the current plan and your guests on this device.')) onNewParty()
          }}
        >
          🥳 Plan another party
        </button>
      </section>
    </div>
  )
}
