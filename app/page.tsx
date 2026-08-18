import { Nav } from "@/components/ui/Nav";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MenuCard } from "@/components/ui/MenuCard";
import { TestimonialCard } from "@/components/ui/TestimonialCard";
import { OfferBadge } from "@/components/ui/OfferBadge";
import { StatItem } from "@/components/ui/StatItem";

const menu = [
  { name: "Lobster Thermidor", price: "$28.00" },
  { name: "Seared Sea Bass", price: "$22.00" },
  { name: "Garlic Butter Mussels", price: "$18.00" },
];

const testimonials = [
  {
    quote:
      "The freshest seafood I've had — the ambiance matched the flavor perfectly.",
    name: "Elena Petrenko",
  },
  {
    quote: "Every dish tastes like it came straight from the ocean.",
    name: "Andriy Kovalenko",
  },
];

export default function Home() {
  return (
    <main>
      <header className="rounded-b-xl bg-gradient-to-br from-primary to-primary-hover px-lg py-xl text-on-primary">
        <div className="mx-auto flex max-w-[1040px] flex-col gap-2xl">
          <Nav />
          <div className="mt-lg max-w-[640px]">
            <h1 className="font-display text-[40px] font-semibold leading-[1.1] sm:text-[56px]">
              Seafood Delicacies That Unveil the Flavor
            </h1>
            <p className="mt-md text-lg font-light text-surface-ocean">
              Dive into freshness — an ocean of flavors awaits at our
              restaurant.
            </p>
            <div className="mt-xl flex gap-md">
              <Button variant="primary" className="bg-surface text-primary hover:bg-surface-ocean">
                Book a Table
              </Button>
              <Button
                variant="secondary"
                className="border-white/30 bg-transparent text-on-primary hover:bg-white/10"
              >
                View Full Menu
              </Button>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1040px] px-lg py-4xl">
        <h2 className="font-display text-[28px] font-semibold text-primary">
          About Us
        </h2>
        <p className="mt-xs max-w-[560px] text-on-surface-muted">
          Fresh, delicately prepared seafood sourced daily from local waters.
        </p>
        <div className="mt-xl grid grid-cols-2 gap-md sm:grid-cols-4">
          <StatItem value="25+" label="Years of Experience" />
          <StatItem value="100%" label="Fresh Ingredients" />
          <StatItem value="10K+" label="Happy Customers" />
          <StatItem value="50+" label="Exclusive Recipes" />
        </div>
      </section>

      <section className="mx-auto max-w-[1040px] px-lg py-4xl">
        <h2 className="font-display text-[28px] font-semibold text-primary">
          Our Menu
        </h2>
        <div className="mt-xl flex flex-wrap gap-lg">
          {menu.map((item) => (
            <MenuCard key={item.name} name={item.name} price={item.price} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1040px] px-lg py-4xl">
        <h2 className="font-display text-[28px] font-semibold text-primary">
          Exclusive Offers Just for You!
        </h2>
        <div className="mt-lg flex flex-wrap gap-sm">
          <OfferBadge>20% OFF · Weekends</OfferBadge>
          <OfferBadge>Free dessert with reservation</OfferBadge>
        </div>
      </section>

      <section className="mx-auto max-w-[1040px] px-lg py-4xl">
        <h2 className="font-display text-[28px] font-semibold text-primary">
          Testimonials
        </h2>
        <div className="mt-xl flex flex-wrap gap-lg">
          {testimonials.map((t) => (
            <TestimonialCard key={t.name} quote={t.quote} name={t.name} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1040px] px-lg py-4xl">
        <h2 className="font-display text-[28px] font-semibold text-primary">
          Reservation
        </h2>
        <form className="mt-xl grid max-w-[480px] gap-md">
          <Input id="name" label="Name" placeholder="Tu nombre" />
          <Input id="email" label="Email" type="email" placeholder="tu@email.com" />
          <Input id="date" label="Date" type="date" />
          <Button variant="primary" type="submit" className="w-fit">
            Reservation
          </Button>
        </form>
      </section>

      <footer className="border-t border-border px-lg py-xl text-center text-sm text-on-surface-muted">
        © {new Date().getFullYear()} Marea Seafood Restaurant
      </footer>
    </main>
  );
}
