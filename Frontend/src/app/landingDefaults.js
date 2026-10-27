// Default content for the public landing page. Admin overrides are stored in
// GlobalSettings.landingPage and merged on top of these values.
export const LANDING_DEFAULTS = {
  playStoreUrl: "#",
  logo: "",
  hero: {
    badge: "Food & grocery delivery in one app",
    titleLead: "Everything you need,",
    titleHighlight: "Superfast",
    subtitle: "Order food and shop groceries in minutes. Track every order live and pay securely.",
    images: [
      "/food/chicken_biryani_deluxe.png",
      "/super-app/grocery.png",
      "/food/paneer_tikka_masala.png",
      "/superfast_mart_delivery_bag.png",
    ],
  },
  apps: {
    food: {
      name: "Superfast Food",
      tagline: "Craving something? It's on the way.",
      text: "Order biryani, snacks, curries and more from restaurants near you, delivered hot and fast.",
      images: [
        "/food/chicken_biryani_deluxe.png",
        "/food/paneer_tikka_masala.png",
        "/food/mutton_biryani_royal.png",
        "/food/chicken_65_crispy.png",
        "/food/masala_kulcha.png",
        "/food/veg_biryani_aromatic.png",
      ],
      benefits: [
        { title: "Hot & fast delivery", desc: "Fresh from the kitchen to your door in minutes." },
        { title: "Live order tracking", desc: "Follow your order on the map in real time." },
        { title: "Daily offers & coupons", desc: "Save on every order with deals and collections." },
        { title: "Genuine ratings", desc: "Pick the best dishes using real customer reviews." },
      ],
    },
    grocery: {
      name: "Superfast Mart",
      tagline: "Groceries in minutes, not hours.",
      text: "Daily essentials, fresh produce and dairy delivered in about 10 minutes. No more waiting in line.",
      images: [
        "/super-app/grocery.png",
        "/superfast_mart_delivery_bag.png",
        "/milk_bottle_premium.png",
        "/milk_bottle_blue.png",
        "/quick_delivery_icon.png",
      ],
      benefits: [
        { title: "10-minute delivery", desc: "Essentials at your door before you know it." },
        { title: "Fresh & quality assured", desc: "Farm-fresh produce and dairy, handpicked." },
        { title: "Best prices", desc: "Everyday low prices with extra member savings." },
        { title: "Easy secure payments", desc: "UPI, cards and wallet, all in one checkout." },
      ],
    },
  },
  footer: {
    about: "Food and grocery, delivered superfast.",
    copyright: "",
    links: [
      { label: "About", url: "/profile/about" },
      { label: "Terms", url: "/profile/terms" },
      { label: "Privacy", url: "/profile/privacy" },
      { label: "Refund", url: "/profile/refund" },
      { label: "Support", url: "/profile/support" },
    ],
  },
}

const str = (v, d) => (typeof v === "string" && v.trim() ? v : d)
const imgs = (v, d) => {
  const list = Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []
  return list.length ? list : d
}

/** Merge admin-saved landing content over defaults, falling back per field. */
export function mergeLanding(remote) {
  const r = remote && typeof remote === "object" ? remote : {}
  const D = LANDING_DEFAULTS
  const apps = {}
  for (const key of Object.keys(D.apps)) {
    const d = D.apps[key]
    const a = r.apps?.[key] || {}
    apps[key] = {
      name: str(a.name, d.name),
      tagline: str(a.tagline, d.tagline),
      text: str(a.text, d.text),
      images: imgs(a.images, d.images),
      benefits: d.benefits.map((b, i) => ({
        title: str(a.benefits?.[i]?.title, b.title),
        desc: str(a.benefits?.[i]?.desc, b.desc),
      })),
    }
  }
  const links = Array.isArray(r.footer?.links)
    ? r.footer.links.filter((l) => l && l.label && l.url)
    : null
  return {
    playStoreUrl: str(r.playStoreUrl, D.playStoreUrl),
    logo: str(r.logo, D.logo),
    hero: {
      badge: str(r.hero?.badge, D.hero.badge),
      titleLead: str(r.hero?.titleLead, D.hero.titleLead),
      titleHighlight: str(r.hero?.titleHighlight, D.hero.titleHighlight),
      subtitle: str(r.hero?.subtitle, D.hero.subtitle),
      images: imgs(r.hero?.images, D.hero.images),
    },
    apps,
    footer: {
      about: str(r.footer?.about, D.footer.about),
      copyright: typeof r.footer?.copyright === "string" ? r.footer.copyright : D.footer.copyright,
      links: links && links.length ? links : D.footer.links,
    },
  }
}
