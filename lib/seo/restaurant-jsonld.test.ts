import { describe, it, expect } from "vitest";
import { buildRestaurantJsonLd } from "./restaurant-jsonld";

const BASE = {
  name: "Marea",
  description: "Boutique seafood",
  url: "https://marea.example.com",
  image: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  country: null,
  phone: null,
  email: null,
  openingHours: [],
  menuUrl: "https://marea.example.com/menu",
};

describe("buildRestaurantJsonLd", () => {
  it("never includes aggregateRating or review", () => {
    const result = buildRestaurantJsonLd(BASE);
    expect(result).not.toHaveProperty("aggregateRating");
    expect(result).not.toHaveProperty("review");
  });

  it("builds a minimal record with just the required fields", () => {
    const result = buildRestaurantJsonLd(BASE);

    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "Restaurant",
      name: "Marea",
      url: "https://marea.example.com",
      hasMenu: "https://marea.example.com/menu",
      description: "Boutique seafood",
    });
  });

  it("combines both address lines into one streetAddress", () => {
    const result = buildRestaurantJsonLd({
      ...BASE,
      addressLine1: "142 Harbour Pier Road",
      addressLine2: "Marina District",
      city: "Portside",
      country: "MX",
    });

    expect(result.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "142 Harbour Pier Road, Marina District",
      addressLocality: "Portside",
      addressCountry: "MX",
    });
  });

  it("omits address entirely when there's no address data at all", () => {
    const result = buildRestaurantJsonLd(BASE);
    expect(result).not.toHaveProperty("address");
  });

  it("omits openingHours when the business has none configured", () => {
    const result = buildRestaurantJsonLd(BASE);
    expect(result).not.toHaveProperty("openingHours");
  });

  it("includes formatted openingHours when configured", () => {
    const result = buildRestaurantJsonLd({
      ...BASE,
      openingHours: [{ dayOfWeek: 2, opensAt: 720, closesAt: 1380, isClosed: false }],
    });

    expect(result.openingHours).toEqual(["Tu 12:00-23:00"]);
  });
});
