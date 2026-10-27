// Content lives here, separate from the 3D code: edit this file to rebrand the site.

export const COLLECTION = [
  {
    no: '01', name: 'ARZ', ar: 'أرز', price: 165,
    family: 'Woody · Resinous',
    notes: 'Cedar of Lebanon · Oud · Amber',
    story: 'The founding scent. Cold mountain air in the Chouf, resin warming on bark.',
    liquid: { deep: '#3a1404', core: '#c9741c', top: '#f0a848' },
  },
  {
    no: '02', name: 'ZAHR', ar: 'زهر', price: 150,
    family: 'Floral · Luminous',
    notes: 'Orange blossom · Neroli · White musk',
    story: 'Mazaher on a Sunday table. Blossom water, sugar, every window open.',
    liquid: { deep: '#5e3e08', core: '#d9ad45', top: '#f5d888' },
  },
  {
    no: '03', name: 'WARD', ar: 'ورد', price: 175,
    family: 'Floral · Spiced',
    notes: 'Damask rose · Saffron · Leather',
    story: 'Roses from the Bekaa, dried in the late sun, worn with an old leather jacket.',
    liquid: { deep: '#2e030c', core: '#a82640', top: '#e86c88' },
  },
  {
    no: '04', name: 'BAHR', ar: 'بحر', price: 150,
    family: 'Aquatic · Green',
    notes: 'Sea salt · Fig leaf · Vetiver',
    story: 'The Corniche at seven. Salt on skin, a fig tree leaning over the wall.',
    liquid: { deep: '#062a33', core: '#2f969e', top: '#8fd8d6' },
  },
];

// The three strata the juice splits into in "The Notes"
export const NOTES = [
  { key: 'top', title: 'Top', time: '0 – 15 min', notes: 'Lebanese bergamot · Bitter orange · Pink pepper', glass: '#ffd23a' },
  { key: 'heart', title: 'Heart', time: '15 min – 3 h', notes: 'Orange blossom · Damask rose · Labdanum', glass: '#e8506c' },
  { key: 'base', title: 'Base', time: '3 h – 12 h +', notes: 'Cedar of Lebanon · Oud · Ambergris', glass: '#c4580c' },
];

// Exploded-view callouts. `part` is the 3D object the line points at.
export const ANATOMY = [
  { part: 'cap', no: '01', title: 'The Cap', text: 'Lacquered black, weighted, magnetic close', side: 'left' },
  { part: 'pump', no: '02', title: 'The Atomizer', text: 'Micro-mist pump · 0.09 ml per spray', side: 'right' },
  { part: 'collar', no: '03', title: 'The Collar', text: 'Polished brass, 24k gold finish', side: 'left' },
  { part: 'flacon', no: '04', title: 'The Flacon', text: 'Heavy flint crystal, polished by hand', side: 'right' },
  { part: 'juice', no: '05', title: 'The Juice', text: 'Eau de Parfum · 22% concentration', side: 'left' },
  { part: 'base', no: '06', title: 'The Base', text: '26 mm of solid crystal', side: 'right' },
];
