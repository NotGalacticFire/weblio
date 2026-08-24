/* ============================================================================
   Site content and metadata.

   TRUTHFULNESS RULE: nothing in this file may assert a client, a testimonial,
   an award, a headcount, a revenue figure, or a year of experience. There are
   no clients yet, and the site says so plainly. The work is the evidence.
   ========================================================================= */

export const site = {
  name: 'Weblio',
  domain: 'weblio.design',
  url: 'https://weblio.design',
  person: 'Ravi',
  email: import.meta.env.PUBLIC_CONTACT_EMAIL || 'ravi@weblio.design',

  title: 'Weblio — websites that survive a second look',
  description:
    'Weblio designs and builds fast, precise websites for businesses whose current site is quietly costing them work. Built by Ravi.',
} as const;

export const nav = [
  { label: 'Difference', href: '/#difference' },
  { label: 'Services', href: '/#services' },
  { label: 'Process', href: '/#process' },
] as const;

/* --- 00 hero ------------------------------------------------------------- */
export const hero = {
  eyebrow: 'Web design & development',
  /* Split across lines deliberately — the line break is compositional. */
  lines: ['Websites that', 'survive a', 'second look.'],
  /* Device-agnostic: "move your cursor" is wrong on the half of visitors
     arriving on a phone. The hint below the CTA carries the instruction. */
  lede:
    "I'm Ravi. I design and build websites for businesses whose current one is quietly costing them work. Every detail here is drawn on purpose. Look closer.",
  cta: { label: 'Start a project', href: '/contact' },
  hint: 'Drag the glass',
} as const;

/* --- 01 positioning ------------------------------------------------------ */
export const positioning = {
  folio: '01',
  label: 'The situation',
  statement: [
    'Most small business websites',
    'were built once,',
    'in a hurry,',
    'a long time ago.',
  ],
  body: [
    'They load slowly. They were never really designed for a phone. The copy is whatever fit the template. Nothing about them suggests the business is any good at what it does.',
    'That is a strange thing to leave in place, because for most people it is the only version of the business they will ever see.',
  ],
} as const;

/* --- 02 the difference --------------------------------------------------- */
export const difference = {
  folio: '02',
  label: 'The difference',
  heading: 'The same business, twice.',
  lede:
    'One invented roofing company, given the treatment most small businesses get, and then the treatment they should get. The difference is not decoration — it is hierarchy, typography, spacing and intent.',
  /* Only shown where the handle actually exists; the panels stack on phones. */
  hint: 'Drag the handle to give either one more room.',
  disclaimer:
    'Halliday & Sons is invented, and both sides were built for this page. Not a client, not a real project, and not a before-and-after of anyone’s actual website.',

  /* The fictional business both treatments are built from. Deliberately
     unglamorous: this is exactly the kind of business the site is pitched at. */
  business: {
    name: 'Halliday & Sons',
    trade: 'Roofing & guttering',
    town: 'Est. 1994 · Yorkshire',
    /* Ofcom's reserved drama range (01632 960000-960999). The previous number
       used 01423 — the real Harrogate code — and "555" is a US fiction
       convention with no UK equivalent, so it could have routed to a real
       person's line. */
    phone: '01632 960180',
  },

  before: {
    tag: 'Typical',
    /* 2012 template voice: exclamation marks, "welcome to our website", and
       three cramped columns of undifferentiated text. */
    hero: 'Welcome To Our Website!',
    blurb:
      'Halliday & Sons are your number one choice for all your roofing needs. We have been serving the local area for over 25 years with quality workmanship at competitive prices. Please browse our site and contact us for a free quote today!',
    cta: 'Click Here For A Free Quote',
    nav: ['Home', 'About Us', 'Services', 'Gallery', 'Testimonials', 'Contact Us'],
    columns: [
      { title: 'Quality Work', body: 'We pride ourselves on our high standards and attention to detail on every job.' },
      { title: 'Free Quotes', body: 'Contact us today for a no obligation quote for your roofing project.' },
      { title: 'Fully Insured', body: 'All of our work is fully insured and guaranteed for your peace of mind.' },
    ],
    footer: 'Copyright © 2012 Halliday & Sons. All Rights Reserved. Site by WebDesignCo.',
  },

  after: {
    tag: 'Weblio',
    hero: 'Roofs that outlast the mortgage.',
    blurb:
      'Thirty years on Yorkshire roofs. Slate, tile, flat and gutter work, done once and done properly.',
    cta: 'Get a quote',
    nav: ['Work', 'Services', 'Contact'],
    facts: [
      { k: 'Since', v: '1994' },
      { k: 'Covering', v: 'Yorkshire' },
      { k: 'Guarantee', v: '20 years' },
    ],
  },
} as const;

/* --- 03 services --------------------------------------------------------- */
export const services = {
  folio: '03',
  label: 'What I do',
  heading: 'Four things, properly.',
  items: [
    {
      n: '01',
      title: 'Custom websites',
      body: 'Designed and built from nothing, for the business it belongs to. No template, no page builder, no theme with the serial numbers filed off.',
    },
    {
      n: '02',
      title: 'Redesigns',
      body: 'You already have a site and it is holding you back. I keep what works, throw out what does not, and rebuild it to load fast and read clearly.',
    },
    {
      n: '03',
      title: 'Interactive work',
      body: 'The kind of thing on this page — WebGL, motion, and interaction used where it makes something clearer or more memorable, and nowhere else.',
    },
    {
      n: '04',
      title: 'Performance & accessibility',
      body: 'Making an existing site fast, usable on a phone, and operable by keyboard and screen reader. Often the highest-value work there is.',
    },
  ],
} as const;

/* --- 04 process ---------------------------------------------------------- */
export const process = {
  folio: '04',
  label: 'How it works',
  heading: 'Four steps. No surprises.',
  steps: [
    {
      n: '01',
      title: 'Tell me what you need',
      body: 'A short conversation about the business, who you want to reach, and what the current site is failing to do.',
    },
    {
      n: '02',
      title: 'See a direction',
      body: 'I show you a real design in the browser, not a flat picture of one. You will know early whether it is right.',
    },
    {
      n: '03',
      title: 'Build and refine',
      body: 'I build it properly and we adjust together. You see progress on a live link the whole way through.',
    },
    {
      n: '04',
      title: 'Launch',
      body: 'It goes live, it is fast, and I make sure you can actually keep it up to date afterwards.',
    },
  ],
} as const;

/* --- 05 contact ---------------------------------------------------------- */
export const contact = {
  folio: '05',
  label: 'Start here',
  heading: ['Tell me what', 'you need.'],
  lede:
    'A few lines is plenty. I read everything myself and reply within a day or two.',
  cta: { label: 'Start a project', href: '/contact' },
} as const;

/* --- the honest proof section -------------------------------------------- */
export const proof = {
  folio: '—',
  label: 'Evidence',
  heading: ['No client logos.', 'This page is the portfolio.'],
  body:
    'Weblio is new, so there is no wall of logos to show you and I am not going to invent one. What I can show you is the thing you are looking at: the optics in the header, the type responding under the glass, and under 10 KB of JavaScript doing all of it.',
  points: [
    { k: 'Fonts', v: 'Three variable faces, subset to 110 KB with every axis intact' },
    { k: 'Header', v: 'Procedural WebGL — no textures, no models, one triangle' },
    { k: 'Motion', v: 'Stops entirely when nothing is moving, and when you ask it to' },
    { k: 'Access', v: 'Keyboard operable, AA contrast, works with JavaScript off' },
  ],
} as const;
