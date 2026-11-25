import { Media } from "./Media";
import type { Dish as DishData } from "./content";

export function Dish({ dish }: { dish: DishData }) {
  return (
    <article className="ml-dish">
      <div className="ml-dish-img">
        <Media src={dish.imageUrl} label={dish.img} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px" />
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
