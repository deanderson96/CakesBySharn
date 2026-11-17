/** Shared customer-facing catalogue; keep aligned with backend via catalog-parity test. */
const MENU = [
  {
    id: 'afternoon-tea',
    title: 'Afternoon tea',
    icon: '☕',
    note: 'A variety of scones, cakes & savouries. Made to order.',
    items: [
      { name: 'Individual afternoon tea', price: 9, priceType: 'fixed' },
      { name: 'Afternoon tea for 2', price: 16, priceType: 'fixed' },
    ],
  },
  {
    id: 'loaves',
    title: 'Homemade loaves',
    icon: '♧',
    items: [
      { name: 'Banana loaf', price: 5, priceType: 'fixed' },
      { name: 'Iced lemon loaf', price: 5, priceType: 'fixed' },
      { name: 'Iced carrot loaf', price: 5.5, priceType: 'fixed' },
      { name: 'Iced ginger loaf', price: 5, priceType: 'fixed' },
    ],
  },
  {
    id: 'traditional-bakes',
    title: 'Traditional bakes',
    icon: '✳',
    items: [
      { name: 'Plain scones', detail: 'Pack of 6', price: 5, priceType: 'fixed' },
      { name: 'Fruit scones', detail: 'Pack of 6', price: 5.5, priceType: 'fixed' },
      { name: 'Chocolate fudge cake slices', detail: 'Pack of 4', price: 6, priceType: 'fixed' },
      { name: 'Chocolate brownies', detail: 'Pack of 4', price: 6, priceType: 'fixed' },
      { name: 'Chocolate orange brownies', detail: 'Pack of 4', price: 8, priceType: 'fixed' },
      { name: 'Rolo brownies', detail: 'Pack of 4', price: 8, priceType: 'fixed' },
      { name: 'Baileys & Nutella brownies', detail: 'Pack of 4', price: 9, priceType: 'fixed' },
      { name: 'Chocolate chip cookies', detail: 'Milk or white chocolate · Pack of 5', price: 3.5, priceType: 'fixed' },
    ],
  },
  {
    id: 'cupcakes',
    title: 'Cupcakes',
    icon: '✦',
    items: [
      { name: 'Vanilla cupcakes', detail: 'Box of 6', price: 10, priceType: 'fixed' },
      { name: 'Red velvet cupcakes', detail: 'Box of 6', price: 10, priceType: 'fixed' },
      { name: 'Chocolate cupcakes', detail: 'Box of 6', price: 10, priceType: 'fixed' },
      { name: 'Personalised cupcakes', priceType: 'quote' },
    ],
  },
  {
    id: 'celebration-cakes',
    title: 'Celebration cakes',
    icon: '✦',
    note: 'Other celebration cakes and designs are priced on request.',
    items: [
      { name: '7-inch buttercream cake', detail: 'Three layers · starting price', price: 45, priceType: 'from' },
    ],
  },
];
