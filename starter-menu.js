// ============================================================
// STARTER MENU
// The admin page has an "Add starter menu" button that copies
// these items into the database in one go.
//
// Edit freely before clicking the button:
//   - fix the MRPs (these are placeholder guesses, not real prices)
//   - change the days an item is served
//   - add or delete lines
//
// meal must be one of: breakfast, lunch, dinner, snacks, fruits
// parts (optional): the things inside a thali, each rated separately
// ============================================================

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const STARTER_MENU = [

  // ---------------- Breakfast ----------------
  { name: "Idli (2 pcs)",          meal: "breakfast", mrp: 20, days: ALL_DAYS },
  { name: "Vada (2 pcs)",          meal: "breakfast", mrp: 25, days: ALL_DAYS },
  { name: "Idli Vada Combo",       meal: "breakfast", mrp: 35, days: ALL_DAYS },
  { name: "Poha",                  meal: "breakfast", mrp: 25, days: ALL_DAYS },
  { name: "Upma",                  meal: "breakfast", mrp: 25, days: ALL_DAYS },
  { name: "Plain Dosa",            meal: "breakfast", mrp: 30, days: ALL_DAYS },
  { name: "Masala Dosa",           meal: "breakfast", mrp: 40, days: ALL_DAYS },
  { name: "Onion Dosa",            meal: "breakfast", mrp: 40, days: ALL_DAYS },
  { name: "Pesarattu",             meal: "breakfast", mrp: 35, days: ALL_DAYS },
  { name: "Bread Omelette",        meal: "breakfast", mrp: 35, days: ALL_DAYS },
  { name: "Boiled Eggs (2 pcs)",   meal: "breakfast", mrp: 20, days: ALL_DAYS },
  { name: "Aloo Paratha",          meal: "breakfast", mrp: 40, days: ALL_DAYS },
  { name: "Puri Bhaji",            meal: "breakfast", mrp: 35, days: ALL_DAYS },
  { name: "Bread Butter Jam",      meal: "breakfast", mrp: 25, days: ALL_DAYS },
  { name: "Cornflakes with Milk",  meal: "breakfast", mrp: 30, days: ALL_DAYS },

  // ---------------- Lunch ----------------
  { name: "Veg Thali",             meal: "lunch", mrp: 70,  days: ALL_DAYS,
    parts: ["Roti", "Rice", "Dal", "Sabzi", "Curd", "Pickle & Papad"] },
  { name: "Non-Veg Thali",         meal: "lunch", mrp: 100, days: ALL_DAYS,
    parts: ["Roti", "Rice", "Dal", "Chicken Curry", "Curd"] },
  { name: "Plain Rice",            meal: "lunch", mrp: 20,  days: ALL_DAYS },
  { name: "Jeera Rice",            meal: "lunch", mrp: 35,  days: ALL_DAYS },
  { name: "Roti (1 pc)",           meal: "lunch", mrp: 8,   days: ALL_DAYS },
  { name: "Dal Tadka",             meal: "lunch", mrp: 30,  days: ALL_DAYS },
  { name: "Sambar",                meal: "lunch", mrp: 20,  days: ALL_DAYS },
  { name: "Rasam",                 meal: "lunch", mrp: 15,  days: ALL_DAYS },
  { name: "Rajma Curry",           meal: "lunch", mrp: 40,  days: ALL_DAYS },
  { name: "Chole Curry",           meal: "lunch", mrp: 40,  days: ALL_DAYS },
  { name: "Paneer Butter Masala",  meal: "lunch", mrp: 70,  days: ALL_DAYS },
  { name: "Mixed Veg Curry",       meal: "lunch", mrp: 40,  days: ALL_DAYS },
  { name: "Chicken Curry",         meal: "lunch", mrp: 90,  days: ALL_DAYS },
  { name: "Egg Curry",             meal: "lunch", mrp: 50,  days: ALL_DAYS },
  { name: "Fish Curry",            meal: "lunch", mrp: 100, days: ALL_DAYS },
  { name: "Chicken Biryani",       meal: "lunch", mrp: 120, days: ALL_DAYS },
  { name: "Veg Biryani",           meal: "lunch", mrp: 80,  days: ALL_DAYS },
  { name: "Curd",                  meal: "lunch", mrp: 15,  days: ALL_DAYS },

  // ---------------- Dinner ----------------
  { name: "Veg Thali",             meal: "dinner", mrp: 70,  days: ALL_DAYS,
    parts: ["Roti", "Rice", "Dal", "Sabzi", "Curd"] },
  { name: "Non-Veg Thali",         meal: "dinner", mrp: 100, days: ALL_DAYS,
    parts: ["Roti", "Rice", "Dal", "Chicken Curry", "Curd"] },
  { name: "Roti (1 pc)",           meal: "dinner", mrp: 8,   days: ALL_DAYS },
  { name: "Plain Rice",            meal: "dinner", mrp: 20,  days: ALL_DAYS },
  { name: "Dal Fry",               meal: "dinner", mrp: 30,  days: ALL_DAYS },
  { name: "Paneer Curry",          meal: "dinner", mrp: 70,  days: ALL_DAYS },
  { name: "Chicken Curry",         meal: "dinner", mrp: 90,  days: ALL_DAYS },
  { name: "Egg Curry",             meal: "dinner", mrp: 50,  days: ALL_DAYS },
  { name: "Veg Fried Rice",        meal: "dinner", mrp: 60,  days: ALL_DAYS },
  { name: "Chicken Fried Rice",    meal: "dinner", mrp: 90,  days: ALL_DAYS },
  { name: "Veg Noodles",           meal: "dinner", mrp: 60,  days: ALL_DAYS },
  { name: "Khichdi",               meal: "dinner", mrp: 40,  days: ALL_DAYS },
  { name: "Curd Rice",             meal: "dinner", mrp: 35,  days: ALL_DAYS },

  // ---------------- Snacks & Tea ----------------
  { name: "Tea",                   meal: "snacks", mrp: 10, days: ALL_DAYS },
  { name: "Coffee",                meal: "snacks", mrp: 15, days: ALL_DAYS },
  { name: "Samosa",                meal: "snacks", mrp: 15, days: ALL_DAYS },
  { name: "Veg Puff",              meal: "snacks", mrp: 20, days: ALL_DAYS },
  { name: "Egg Puff",              meal: "snacks", mrp: 25, days: ALL_DAYS },
  { name: "Onion Pakora",          meal: "snacks", mrp: 25, days: ALL_DAYS },
  { name: "Mirchi Bajji",          meal: "snacks", mrp: 20, days: ALL_DAYS },
  { name: "Veg Sandwich",          meal: "snacks", mrp: 35, days: ALL_DAYS },
  { name: "Maggi",                 meal: "snacks", mrp: 35, days: ALL_DAYS },
  { name: "Biscuits",              meal: "snacks", mrp: 10, days: ALL_DAYS },

  // ---------------- Fruits & Juice ----------------
  { name: "Banana",                meal: "fruits", mrp: 8,  days: ALL_DAYS },
  { name: "Apple",                 meal: "fruits", mrp: 25, days: ALL_DAYS },
  { name: "Fruit Bowl",            meal: "fruits", mrp: 50, days: ALL_DAYS },
  { name: "Papaya Slices",         meal: "fruits", mrp: 30, days: ALL_DAYS },
  { name: "Watermelon Slices",     meal: "fruits", mrp: 30, days: ALL_DAYS },
  { name: "Orange Juice",          meal: "fruits", mrp: 50, days: ALL_DAYS },
  { name: "Mosambi Juice",         meal: "fruits", mrp: 45, days: ALL_DAYS },
  { name: "Watermelon Juice",      meal: "fruits", mrp: 40, days: ALL_DAYS },
  { name: "Lemon Soda",            meal: "fruits", mrp: 25, days: ALL_DAYS },
  { name: "Banana Shake",          meal: "fruits", mrp: 45, days: ALL_DAYS },
  { name: "Buttermilk",            meal: "fruits", mrp: 15, days: ALL_DAYS },
  { name: "Sweet Lassi",           meal: "fruits", mrp: 30, days: ALL_DAYS }
];
