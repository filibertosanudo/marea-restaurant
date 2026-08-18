import { Button } from "@/components/ui/Button";
import { Placeholder } from "./Placeholder";

type DishData = { price: string; img: string; name: string; desc: string };

export function Dish({ dish, cta }: { dish: DishData; cta: string }) {
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
          <Button variant="primary">{cta}</Button>
        </div>
      </div>
    </article>
  );
}
