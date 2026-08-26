"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/ui/Nav";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { TestimonialCard } from "@/components/ui/TestimonialCard";
import { StatItem } from "@/components/ui/StatItem";
import { STR, type Dish as DishData, type Lang } from "./content";
import type { PublicMenuByLang } from "@/lib/menu/public-menu";
import { Controls } from "./Controls";
import { SectionHead } from "./SectionHead";
import { Placeholder } from "./Placeholder";
import { OfferCard } from "./OfferCard";
import { Dish } from "./Dish";
import { Highlight } from "./Highlight";
import { PreorderModal } from "./PreorderModal";
import { ReservationForm } from "./ReservationForm";
import { scrollToId } from "./scroll";
import { ArrowIcon } from "./icons";
import "./marea-landing.css";

type Theme = "light" | "dark";

export function MareaLandingPage({
  menuByLang,
  maxPartySize,
}: {
  menuByLang: PublicMenuByLang;
  maxPartySize: number;
}) {
  const [cat, setCat] = useState("mains");
  const [lang, setLang] = useState<Lang>("en");
  const [theme, setTheme] = useState<Theme>("light");
  const [preorderDish, setPreorderDish] = useState<DishData | null>(null);

  useEffect(() => {
    const storedLang = localStorage.getItem("marea-lang") as Lang | null;
    const storedTheme = localStorage.getItem("marea-theme") as Theme | null;
    if (storedLang) setLang(storedLang);
    if (storedTheme) setTheme(storedTheme);
  }, []);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    localStorage.setItem("marea-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem("marea-lang", lang);
  }, [lang]);

  const t = STR[lang];

  return (
    <>
      <Controls theme={theme} setTheme={setTheme} lang={lang} setLang={setLang} />
      <div className="ml-navbar">
        <Nav
          links={[
            { id: "home", label: t.nav.home },
            { id: "about", label: t.nav.about },
            { id: "menu", label: t.nav.menu },
            { id: "testimonials", label: t.nav.testimonials },
            { id: "contact", label: t.nav.contact },
          ]}
          ctaLabel={t.nav.book}
          onCtaClick={() => scrollToId("reservation")}
          onLinkClick={scrollToId}
        />
      </div>

      {/* HERO */}
      <header className="ml-hero ml-section" id="home">
        <div className="ml-hero-bg">
          <Placeholder label={t.hero.photo} navy />
        </div>
        <div className="ml-hero-inner">
          <div className="ml-hero-right">
            <div className="ml-eyebrow">{t.hero.eyebrow}</div>
            <h1 className="ml-disp">
              {t.hero.h1Before}
              <Highlight>{t.hero.h1Highlight}</Highlight>
              {t.hero.h1After}
            </h1>
            <div className="ml-hero-row">
              <p>{t.hero.sub}</p>
              <Button variant="primary" onClick={() => scrollToId("reservation")}>
                {t.hero.book}
              </Button>
            </div>
            <div className="ml-promo">
              <h3>{t.hero.promoTitle}</h3>
              <p>{t.hero.promoBody}</p>
              <a className="promo-cta" href="#menu">
                {t.hero.viewMenu}
                <span className="pc-arrow">
                  <ArrowIcon />
                </span>
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ABOUT */}
      <section className="ml-band ml-section" id="about">
        <div className="ml-wrap ml-about-grid">
          <div>
            <SectionHead eyebrow={t.about.eyebrow} title={t.about.title} />
            <p className="ml-lead" style={{ marginTop: 20 }}>
              {t.about.body}
            </p>
          </div>
          <div className="ml-stat-grid">
            {t.stats.map((s) => (
              <StatItem key={s.l} value={s.v} label={s.l} />
            ))}
          </div>
        </div>
      </section>

      {/* MENU */}
      <section className="ml-band subtle ml-section" id="menu">
        <div className="ml-wrap">
          <SectionHead center eyebrow={t.menu.eyebrow} title={t.menu.title} lead={t.menu.lead} />
          <div className="ml-menu-tabs">
            <Tabs items={menuByLang[lang].categories} value={cat} onChange={setCat} />
          </div>
          <div className="ml-menu-grid" key={cat}>
            {menuByLang[lang].dishes
              .filter((d) => d.category === cat)
              .map((d) => (
                <Dish
                  key={d.name}
                  dish={d}
                  cta={t.menu.preorder}
                  onPreorder={() => setPreorderDish(d)}
                />
              ))}
          </div>
          <div className="ml-menu-actions">
            <Button variant="primary" onClick={() => scrollToId("reservation")}>
              {t.menu.book}
            </Button>
          </div>
        </div>
      </section>

      {/* OFFERS */}
      <section className="ml-band ocean ml-section" id="offers">
        <div className="ml-wrap">
          <SectionHead
            center
            eyebrow={t.offers.eyebrow}
            title={
              <>
                {t.offers.titleBefore}
                <Highlight>{t.offers.titleHighlight}</Highlight>
                {t.offers.titleAfter}
              </>
            }
          />
          <div className="ml-offer-stage">
            <div className="ml-offer-media">
              <Placeholder label={t.offers.dish} />
            </div>
            {[t.offers.left[0], t.offers.right[0], t.offers.left[1], t.offers.right[1]].map(
              (o, i) => (
                <div className={`ml-offer-pos ml-offer-pos-${i + 1}`} key={o.title}>
                  <OfferCard offer={o} onArrowClick={() => scrollToId("reservation")} />
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="ml-band ml-section" id="testimonials">
        <div className="ml-wrap">
          <SectionHead center eyebrow={t.tmls.eyebrow} title={t.tmls.title} />
          <div className="ml-tmls-media">
            <Placeholder label={t.tmls.media} />
          </div>
          <div className="ml-tmls-track-wrap">
            <div className="ml-tmls-track">
              {[...t.tmls.items, ...t.tmls.items].map((it, i) => (
                <TestimonialCard key={`${it.name}-${i}`} quote={it.quote} name={it.name} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* RESERVATION */}
      <section className="ml-band subtle ml-section ml-reserve-section" id="reservation">
        <div className="ml-reserve-media">
          <Placeholder label={t.reserve.media} />
        </div>
        <div className="ml-reserve-inner">
          <div className="ml-reserve-form-wrap">
            <SectionHead eyebrow={t.reserve.eyebrow} title={t.reserve.title} />
            <div style={{ marginTop: 28 }}>
              <ReservationForm lang={lang} maxPartySize={maxPartySize} />
            </div>
          </div>
        </div>
      </section>

      <footer className="ml-footer ml-section" id="contact">
        <div className="ml-wrap">
          <div className="ml-foot-top">
            <h3>{t.footer.connect}</h3>
            <form className="ml-news" onSubmit={(e) => e.preventDefault()}>
              <div className="field">
                <Input id="news-email" label="" placeholder={t.footer.emailPh} type="email" />
              </div>
              <Button variant="secondary" type="submit">
                {t.footer.subscribe}
              </Button>
            </form>
          </div>
          <div className="ml-foot-mid">
            <div>
              <div className="brand">Marea</div>
              <p>{t.footer.blurb}</p>
            </div>
            <div>
              <h4>{t.footer.visit}</h4>
              <p>
                {t.footer.address}
                <br />
                {t.footer.address2}
              </p>
              <p>{t.footer.hours}</p>
            </div>
            <div>
              <h4>{t.footer.contact}</h4>
              <a href="tel:+15551234567">+1 (555) 123-4567</a>
              <a href="mailto:hello@marea.com">hello@marea.com</a>
              <a href="#menu">{t.footer.ourMenu}</a>
              <a href="#reservation">{t.footer.reservations}</a>
            </div>
          </div>
          <div className="ml-foot-bottom">
            <div>{t.footer.copyright}</div>
            <div>{t.footer.tagline}</div>
          </div>
        </div>
      </footer>

      <PreorderModal dish={preorderDish} lang={lang} onClose={() => setPreorderDish(null)} />
    </>
  );
}
