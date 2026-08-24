import { ArrowIcon } from "./icons";

type Offer = { title: string; tag: string; desc: string };

export function OfferCard({ offer, onArrowClick }: { offer: Offer; onArrowClick?: () => void }) {
  return (
    <div className="ml-offer-card">
      <div className="ml-oc-head">
        <h3>{offer.title}</h3>
        <span className="ml-oc-price">{offer.tag}</span>
      </div>
      <p>{offer.desc}</p>
      <button
        className="ml-arrow-btn"
        type="button"
        aria-label="Reserve a table for this offer"
        onClick={onArrowClick}
      >
        <ArrowIcon />
      </button>
    </div>
  );
}
