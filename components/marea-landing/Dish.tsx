import { Button } from "@/components/ui/Button";
import { Placeholder } from "./Placeholder";
import type { Dish as DishData } from "./content";

export function Dish({
  dish,
  cta,
  onPreorder,
}: {
  dish: DishData;
  cta: string;
  onPreorder: () => void;
}) {
  return (
    <article className="ml-dish">
      <div className="ml-dish-img">
        <Placeholder label={dish.img} />
      </div>
      <div className="ml-dish-body">
        <h3>{dish.name}</h3>
        <p>{dish.desc}</p>
        <div className="ml-dish-foot">
          <span className="ml-price">{dish.price}</span>
          <Button variant="primary" type="button" onClick={onPreorder}>
            {cta}
          </Button>
        </div>
      </div>
    </article>
  );
}
