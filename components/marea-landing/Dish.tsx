import { Placeholder } from "./Placeholder";
import type { Dish as DishData } from "./content";

export function Dish({ dish }: { dish: DishData }) {
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
        </div>
      </div>
    </article>
  );
}
