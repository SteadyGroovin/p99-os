/* Pizza 99 OS — data layer (public build: sample data only). */
const P99 = { code: "P99", name: "Pizza 99", pos_cutoff: "04:00", opens: "09:00" }; /* working day: 09:00 to 04:00 next morning */

const PEOPLE = [
  { id: "store", name: "P99", short: "P99", role: "master", pin: "", position: "store" },
  { id: "erica", name: "Erica", short: "Erica", role: "lead", pin: "", position: "OIC" },
  { id: "mark", name: "Mark", short: "Mark", role: "crew", pin: "", position: "Chef" },
  { id: "ray", name: "Ray", short: "Ray", role: "crew", pin: "", position: "Chef" },
  { id: "faye", name: "Faye", short: "Faye", role: "crew", pin: "", position: "Crew" },
  { id: "jerryl", name: "Jerryl", short: "Jerryl", role: "crew", pin: "", position: "Chef" },
  { id: "cherry", name: "Cherry", short: "Cherry", role: "walk", pin: "", position: "HR / walk" },
  { id: "chrisjenn", name: "Chrisjenn", short: "Chrisjenn", role: "admin", pin: "", position: "Admin" },
  { id: "stefan", name: "Stefan", short: "Stefan", role: "master", pin: "", position: "COO" },
  { id: "mike", name: "Mike", short: "Mike", role: "master", pin: "", position: "Owner" },
];

// Where stock sits. The chats show P99's chilled meat is kept at the Dragon store and pulled out as needed.
const PLACES = [
  { id: "bar", name: "Drinks chiller" }, { id: "chiller", name: "Kitchen chiller" }, { id: "dry", name: "Stock room" },
  { id: "pack", name: "Packaging" }, { id: "dc", name: "Dragon store freezer (P99 stock)" }, { id: "gas", name: "Gas & cleaning" },
];

// unit = what is counted. pack = base units per case/box/sack (verify:false = not confirmed by the store yet). pos = the UTAK item sold 1:1.
const ITEMS = [
  { id: "bda-blonde", name: "BDA Blonde", place: "bar", cat: "drink", unit: "btl", packUnit: "case", pack: 24, verify: true, par: 24, nightly: true, pos: "Blonde", supplier: "Boracay Mini Mart" },
  { id: "bda-triple", name: "BDA Triple", place: "bar", cat: "drink", unit: "btl", packUnit: "case", pack: 24, verify: true, par: 24, nightly: true, pos: "Triple", supplier: "Boracay Mini Mart" },
  { id: "bda-ipa", name: "BDA IPA", place: "bar", cat: "drink", unit: "btl", packUnit: "case", pack: 24, verify: true, par: 24, nightly: true, pos: "IPA", supplier: "Boracay Mini Mart" },
  { id: "bda-00", name: "BDA 0% Alcohol", place: "bar", cat: "drink", unit: "btl", packUnit: "case", pack: 24, verify: true, par: 12, nightly: true, pos: "00 % alc free", supplier: "Boracay Mini Mart" },
  { id: "pilsen", name: "Pilsen", place: "bar", cat: "drink", unit: "btl", packUnit: "case", pack: 24, verify: true, par: 48, nightly: true, pos: "SMB", supplier: "Inter-Island" },
  { id: "sm-apple", name: "San Mig Apple", place: "bar", cat: "drink", unit: "btl", packUnit: "case", pack: 24, verify: true, par: 24, nightly: true, pos: "SM Apple", supplier: "Inter-Island" },
  { id: "sml", name: "San Mig Light", place: "bar", cat: "drink", unit: "btl", packUnit: "case", pack: 24, verify: true, par: 48, nightly: true, pos: "SML", supplier: "Inter-Island" },
  { id: "red-horse", name: "Red Horse", place: "bar", cat: "drink", unit: "btl", packUnit: "case", pack: 24, verify: true, par: 48, nightly: true, pos: "Red Horse", supplier: "Inter-Island" },
  { id: "coke", name: "Coca-Cola 12oz", place: "bar", cat: "drink", unit: "can", packUnit: "case", pack: 24, verify: true, par: 48, nightly: true, pos: "Coca Cola", supplier: "Inter-Island" },
  { id: "royal", name: "Royal 12oz", place: "bar", cat: "drink", unit: "can", packUnit: "case", pack: 24, verify: true, par: 24, nightly: true, pos: "Royal", supplier: "Inter-Island" },
  { id: "sprite", name: "Sprite 12oz", place: "bar", cat: "drink", unit: "can", packUnit: "case", pack: 24, verify: true, par: 24, nightly: true, pos: "Sprite", supplier: "Inter-Island" },
  { id: "coke-zero", name: "Coke Zero", place: "bar", cat: "drink", unit: "can", packUnit: "case", pack: 24, verify: true, par: 48, nightly: true, pos: "Coke Zero", supplier: "Inter-Island" },
  { id: "water", name: "Le Mineral water", place: "bar", cat: "drink", unit: "btl", packUnit: "box", pack: 24, verify: true, par: 72, nightly: true, pos: "Le Mineral", supplier: "Le Mineral" },
  { id: "wine", name: "House wine", place: "bar", cat: "drink", unit: "btl", par: 2, pos: "Glas" },

  { id: "mozz", name: "Mozzarella Conaprole 5 kg block", place: "chiller", cat: "ingredient", unit: "block", par: 4, nightly: true, supplier: "Global Pacific" },
  { id: "dough", name: "Dough balls", place: "chiller", cat: "prep", unit: "pc", par: 40, nightly: true },
  { id: "sauce", name: "Pizza sauce (prepared)", place: "chiller", cat: "prep", unit: "tub", par: 2 },
  { id: "ham", name: "Farmer's ham", place: "chiller", cat: "ingredient", unit: "kg", par: 3, nightly: true, supplier: "Werdenberg" },
  { id: "bacon", name: "Bacon (sliced)", place: "chiller", cat: "ingredient", unit: "pack", par: 6, nightly: true, supplier: "SRB Cargo" },
  { id: "pepperoni", name: "Pepperoni", place: "chiller", cat: "ingredient", unit: "pack", par: 6, nightly: true, supplier: "Euro-Swiss" },
  { id: "sausage", name: "Sausage", place: "chiller", cat: "ingredient", unit: "pack", par: 2, supplier: "Euro-Swiss" },
  { id: "chicken", name: "Chicken breast", place: "chiller", cat: "ingredient", unit: "pack", par: 3, nightly: true, supplier: "SRB Cargo" },
  { id: "parmesan", name: "Parmesan, grated", place: "chiller", cat: "ingredient", unit: "kg", par: 1, supplier: "Belcris" },
  { id: "mushroom", name: "Mushrooms, canned", place: "dry", cat: "ingredient", unit: "can", par: 12, supplier: "Boracay Mini Mart" },
  { id: "pineapple", name: "Pineapple tidbits, canned", place: "dry", cat: "ingredient", unit: "can", par: 12, supplier: "Boracay Mini Mart" },
  { id: "olives", name: "Black olives, sliced", place: "dry", cat: "ingredient", unit: "can", par: 2, supplier: "Shopee" },
  { id: "tomato", name: "Peeled tomatoes, canned", place: "dry", cat: "ingredient", unit: "can", packUnit: "case", pack: 6, verify: true, par: 12, supplier: "Italian Food Specialist" },
  { id: "bellpepper", name: "Red bell pepper", place: "chiller", cat: "ingredient", unit: "kg", par: 1.5, supplier: "Danieles" },
  { id: "onion-red", name: "Red onion", place: "chiller", cat: "ingredient", unit: "kg", par: 1, supplier: "Danieles" },
  { id: "onion-white", name: "White onion", place: "chiller", cat: "ingredient", unit: "kg", par: 1, supplier: "Danieles" },
  { id: "tomato-fresh", name: "Tomato, local", place: "chiller", cat: "ingredient", unit: "kg", par: 1, supplier: "Danieles" },
  { id: "cherry-tomato", name: "Cherry tomato", place: "chiller", cat: "ingredient", unit: "kg", par: 0.5, supplier: "Danieles" },
  { id: "basil", name: "Basil leaves", place: "chiller", cat: "ingredient", unit: "g", par: 200, supplier: "Talipapa" },
  { id: "eggplant", name: "Eggplant", place: "chiller", cat: "ingredient", unit: "kg", par: 0.5, supplier: "Danieles" },
  { id: "zucchini", name: "Zucchini", place: "chiller", cat: "ingredient", unit: "kg", par: 0.5, supplier: "Danieles" },
  { id: "tuna", name: "Tuna, canned", place: "dry", cat: "ingredient", unit: "can", par: 6, supplier: "Boracay Mini Mart" },
  { id: "flour-ws", name: "Flour Wooden Spoon 25 kg", place: "dry", cat: "ingredient", unit: "sack", par: 2, supplier: "Boracay Mini Mart" },
  { id: "flour-kt", name: "Flour Kutitap 25 kg", place: "dry", cat: "ingredient", unit: "sack", par: 1, supplier: "Boracay Mini Mart" },
  { id: "flour-ap", name: "Flour all-purpose 25 kg", place: "dry", cat: "ingredient", unit: "sack", par: 1, supplier: "Boracay Mini Mart" },
  { id: "semolina", name: "Semolina", place: "dry", cat: "ingredient", unit: "pack", par: 2, supplier: "Italian Food Specialist" },
  { id: "oil", name: "Pomace olive oil 25 L", place: "dry", cat: "ingredient", unit: "L", par: 10, supplier: "Bares and Estrellas" },
  { id: "hotsauce", name: "Ram hot sauce", place: "dry", cat: "ingredient", unit: "gal", par: 1, supplier: "Boracay Mini Mart" },
  { id: "hickory", name: "Hickory BBQ sauce", place: "dry", cat: "ingredient", unit: "btl", par: 1, supplier: "Boracay Mini Mart" },
  { id: "sugar", name: "White sugar", place: "dry", cat: "ingredient", unit: "kg", par: 3, supplier: "Boracay Mini Mart" },
  { id: "salt", name: "Iodized salt", place: "dry", cat: "ingredient", unit: "kg", par: 1, supplier: "Boracay Mini Mart" },
  { id: "oregano", name: "Oregano flakes", place: "dry", cat: "ingredient", unit: "btl", par: 1, supplier: "Boracay Mini Mart" },
  { id: "peanut", name: "Peanuts, skinless", place: "dry", cat: "ingredient", unit: "kg", par: 0.5, supplier: "Talipapa" },
  { id: "water-gal", name: "Mineral water, gallon (kitchen)", place: "dry", cat: "ingredient", unit: "gal", par: 3, supplier: "Frost 'N Cone" },

  { id: "box14", name: "Pizza box", place: "pack", cat: "packaging", unit: "pc", packUnit: "bundle", pack: 50, verify: true, par: 150, nightly: true, supplier: "Newfrust" },
  { id: "foil", name: "Aluminum foil", place: "pack", cat: "packaging", unit: "box", par: 2, supplier: "Office" },
  { id: "saucecup", name: "Sauce cups 1oz", place: "pack", cat: "packaging", unit: "pack", par: 2, supplier: "Office" },
  { id: "bag", name: "Brown paper bags", place: "pack", cat: "packaging", unit: "bundle", par: 1, supplier: "Office" },
  { id: "container", name: "Plastic containers", place: "pack", cat: "packaging", unit: "pack", par: 1, supplier: "Newfrust" },

  { id: "dc-bacon", name: "Bacon (at Dragon store)", place: "dc", cat: "ingredient", unit: "pack", par: 10, supplier: "SRB Cargo" },
  { id: "dc-chicken", name: "Chicken breast (at Dragon store)", place: "dc", cat: "ingredient", unit: "pack", par: 6, supplier: "SRB Cargo" },

  { id: "lpg", name: "LPG tank", place: "gas", cat: "gas", unit: "tank", par: 2, nightly: true, supplier: "Southern Gas" },
  { id: "dishwash", name: "Dishwashing liquid", place: "gas", cat: "cleaning", unit: "gal", par: 1, supplier: "Sanitary Care" },
  { id: "papertowel", name: "Paper towel", place: "gas", cat: "cleaning", unit: "pack", par: 3, supplier: "Sanitary Care" },
  { id: "sponge", name: "Sponges", place: "gas", cat: "cleaning", unit: "pc", par: 3, supplier: "Sanitary Care" },
  { id: "trashbag", name: "Garbage bags", place: "gas", cat: "cleaning", unit: "pack", par: 2, supplier: "Sanitary Care" },
];

const SUPPLIERS = ["Global Pacific", "Boracay Mini Mart", "Inter-Island", "Le Mineral", "Southern Gas", "Italian Food Specialist", "Euro-Swiss", "Werdenberg", "Alternatives Food", "Bares and Estrellas", "Danieles", "Sanitary Care", "Frost 'N Cone", "SRB Cargo", "JabaCore", "Newfrust", "Belcris", "Monterey", "Talipapa", "Shopee", "Office"];
const RECEIPT_KINDS = [["delivery", "Delivery"], ["purchase", "Bought with cash"], ["pullout", "Pull-out (office / other store)"]];

// REAL deliveries as posted in Pizza99 GC New (crew photos + text), 18 Aug – 9 Sep 2026. qty in the item's unit. No prices: the chat carries none.
const SEED_RECEIPTS = [
  { id: "r-0818a", day: "2026-08-18", kind: "pullout", supplier: "Office", by: "faye", lines: [{ item: "foil", qty: 2 }, { item: "saucecup", qty: 2 }, { item: "bag", qty: 1 }] },
  { id: "r-0818b", day: "2026-08-18", kind: "delivery", supplier: "Global Pacific", by: "faye", lines: [{ item: "mozz", qty: 4 }] },
  { id: "r-0818c", day: "2026-08-18", kind: "delivery", supplier: "Frost 'N Cone", by: "faye", lines: [{ item: "water-gal", qty: 3 }] },
  { id: "r-0819a", day: "2026-08-19", kind: "delivery", supplier: "Boracay Mini Mart", by: "mark", lines: [{ item: "flour-ws", qty: 1 }, { item: "flour-kt", qty: 1 }, { item: "oregano", qty: 1 }] },
  { id: "r-0819b", day: "2026-08-19", kind: "delivery", supplier: "Danieles", by: "faye", lines: [{ item: "cherry-tomato", qty: 0.56 }, { item: "basil", qty: 500 }, { item: "bellpepper", qty: 1.08 }, { item: "tomato-fresh", qty: 1 }] },
  { id: "r-0820a", day: "2026-08-20", kind: "delivery", supplier: "Boracay Mini Mart", by: "faye", lines: [{ item: "mushroom", qty: 15 }] },
  { id: "r-0820b", day: "2026-08-20", kind: "delivery", supplier: "Le Mineral", by: "faye", lines: [{ item: "water", qty: 120, text: "5 boxes" }] },
  { id: "r-0821a", day: "2026-08-21", kind: "delivery", supplier: "Italian Food Specialist", by: "faye", lines: [{ item: "tomato", qty: 6 }] },
  { id: "r-0821b", day: "2026-08-21", kind: "delivery", supplier: "Inter-Island", by: "faye", lines: [{ item: "coke", qty: 24, text: "1 case" }, { item: "royal", qty: 24, text: "1 case" }, { item: "sprite", qty: 24, text: "1 case" }, { item: "coke-zero", qty: 24 }] },
  { id: "r-0821c", day: "2026-08-21", kind: "delivery", supplier: "Danieles", by: "faye", lines: [{ item: "bellpepper", qty: 1 }, { item: "zucchini", qty: 0.4 }] },
  { id: "r-0822a", day: "2026-08-22", kind: "delivery", supplier: "JabaCore", by: "faye", lines: [{ item: "chicken", qty: 2.09, text: "2.09 kg" }] },
  { id: "r-0822b", day: "2026-08-22", kind: "delivery", supplier: "Global Pacific", by: "faye", lines: [{ item: "mozz", qty: 4 }] },
  { id: "r-0823a", day: "2026-08-23", kind: "delivery", supplier: "Danieles", by: "faye", lines: [{ item: "cherry-tomato", qty: 0.5 }, { item: "onion-red", qty: 1.14 }, { item: "tomato-fresh", qty: 1 }] },
  { id: "r-0823b", day: "2026-08-23", kind: "purchase", supplier: "Newfrust", by: "mark", lines: [{ item: "box14", qty: 50, text: "1 bundle" }] },
  { id: "r-0823c", day: "2026-08-23", kind: "delivery", supplier: "Danieles", by: "faye", lines: [{ item: "eggplant", qty: 0.54 }] },
  { id: "r-0824a", day: "2026-08-24", kind: "purchase", supplier: "Talipapa", by: "ray", lines: [{ item: "onion-white", qty: 0.44 }, { item: "basil", qty: 220 }] },
  { id: "r-0824b", day: "2026-08-24", kind: "delivery", supplier: "Boracay Mini Mart", by: "erica", lines: [{ item: "mushroom", qty: 24 }, { item: "sugar", qty: 5 }, { item: "hickory", qty: 2 }] },
  { id: "r-0824c", day: "2026-08-24", kind: "delivery", supplier: "Boracay Mini Mart", by: "erica", lines: [{ item: "pineapple", qty: 12 }, { item: "hotsauce", qty: 1 }] },
  { id: "r-0824d", day: "2026-08-24", kind: "delivery", supplier: "Italian Food Specialist", by: "erica", lines: [{ item: "semolina", qty: 2 }, { item: "tomato", qty: 6, text: "1 case" }] },
  { id: "r-0824e", day: "2026-08-24", kind: "delivery", supplier: "Belcris", by: "erica", lines: [{ item: "parmesan", qty: 2 }] },
  { id: "r-0825", day: "2026-08-25", kind: "delivery", supplier: "Inter-Island", by: "erica", lines: [{ item: "coke", qty: 24, text: "1 case" }] },
  { id: "r-0826a", day: "2026-08-26", kind: "delivery", supplier: "Southern Gas", by: "ray", lines: [{ item: "lpg", qty: 2 }] },
  { id: "r-0826b", day: "2026-08-26", kind: "pullout", supplier: "MCC", by: "ray", lines: [{ item: "ham", qty: 2, text: "2 packs" }] },
  { id: "r-0827", day: "2026-08-27", kind: "delivery", supplier: "Werdenberg", by: "ray", lines: [{ item: "ham", qty: 5.15 }, { item: "bacon", qty: 5.15, text: "5.15 kg sliced" }] },
  { id: "r-0828", day: "2026-08-28", kind: "delivery", supplier: "Boracay Mini Mart", by: "erica", lines: [{ item: "flour-kt", qty: 1 }, { item: "flour-ap", qty: 1 }] },
  { id: "r-0829a", day: "2026-08-29", kind: "delivery", supplier: "Danieles", by: "erica", lines: [{ item: "bellpepper", qty: 1.5 }, { item: "onion-red", qty: 1 }, { item: "onion-white", qty: 0.5 }, { item: "tomato-fresh", qty: 1 }] },
  { id: "r-0829b", day: "2026-08-29", kind: "delivery", supplier: "Global Pacific", by: "erica", lines: [{ item: "mozz", qty: 4 }] },
  { id: "r-0829c", day: "2026-08-29", kind: "delivery", supplier: "SRB Cargo", by: "erica", lines: [{ item: "dc-bacon", qty: 10, text: "10 of 30 packs are P99's" }, { item: "dc-chicken", qty: 6, text: "1 box = 6 packs" }] },
  { id: "r-0829d", day: "2026-08-29", kind: "delivery", supplier: "Boracay Mini Mart", by: "erica", lines: [{ item: "oregano", qty: 1 }] },
  { id: "r-0830", day: "2026-08-30", kind: "purchase", supplier: "Newfrust", by: "mark", lines: [{ item: "box14", qty: 50 }, { item: "sponge", qty: 3 }, { item: "container", qty: 1 }] },
  { id: "r-0831", day: "2026-08-31", kind: "delivery", supplier: "Frost 'N Cone", by: "faye", lines: [{ item: "water-gal", qty: 3 }] },
  { id: "r-0901a", day: "2026-09-01", kind: "delivery", supplier: "Boracay Mini Mart", by: "erica", lines: [{ item: "sugar", qty: 5 }, { item: "salt", qty: 1 }] },
  { id: "r-0901b", day: "2026-09-01", kind: "delivery", supplier: "Danieles", by: "faye", lines: [{ item: "tomato-fresh", qty: 1 }, { item: "eggplant", qty: 0.5 }] },
  { id: "r-0901c", day: "2026-09-01", kind: "delivery", supplier: "Italian Food Specialist", by: "erica", lines: [{ item: "tomato", qty: 12, text: "2 cases NOVI" }] },
  { id: "r-0903a", day: "2026-09-03", kind: "delivery", supplier: "Boracay Mini Mart", by: "ray", lines: [{ item: "flour-ws", qty: 1 }, { item: "hotsauce", qty: 3 }] },
  { id: "r-0903b", day: "2026-09-03", kind: "delivery", supplier: "Global Pacific", by: "ray", lines: [{ item: "mozz", qty: 4 }] },
  { id: "r-0904", day: "2026-09-04", kind: "delivery", supplier: "Euro-Swiss", by: "faye", lines: [{ item: "pepperoni", qty: 10 }, { item: "sausage", qty: 3 }] },
  { id: "r-0905", day: "2026-09-05", kind: "delivery", supplier: "Danieles", by: "faye", lines: [{ item: "cherry-tomato", qty: 1 }, { item: "eggplant", qty: 0.4 }, { item: "tomato-fresh", qty: 0.5 }] },
  { id: "r-0906a", day: "2026-09-06", kind: "purchase", supplier: "Talipapa", by: "ray", lines: [{ item: "peanut", qty: 1 }, { item: "basil", qty: 215 }] },
  { id: "r-0906b", day: "2026-09-06", kind: "purchase", supplier: "Danieles", by: "ray", lines: [{ item: "bellpepper", qty: 1 }, { item: "onion-red", qty: 1 }] },
  { id: "r-0907", day: "2026-09-07", kind: "delivery", supplier: "Sanitary Care", by: "faye", lines: [{ item: "papertowel", qty: 3 }, { item: "sponge", qty: 1, text: "1 box" }, { item: "dishwash", qty: 3 }, { item: "trashbag", qty: 2 }] },
  { id: "r-0908a", day: "2026-09-08", kind: "delivery", supplier: "Danieles", by: "ray", lines: [{ item: "tomato-fresh", qty: 1 }, { item: "onion-white", qty: 1 }] },
  { id: "r-0908b", day: "2026-09-08", kind: "pullout", supplier: "Dragon store", by: "erica", lines: [{ item: "bacon", qty: 3 }, { item: "chicken", qty: 1 }] },
  { id: "r-0909a", day: "2026-09-09", kind: "delivery", supplier: "Global Pacific", by: "ray", lines: [{ item: "mozz", qty: 4 }] },
  { id: "r-0909b", day: "2026-09-09", kind: "purchase", supplier: "Talipapa", by: "ray", lines: [{ item: "basil", qty: 140 }] },
];

// One seed count so the variance has a base. The pieces are NOT real: replace with the first real closing count.
const SEED_COUNTS = [{ id: "c-seed", day: "2026-10-14", kind: "closing", by: "erica", submitted: "2026-10-14T23:48", seed: true, lines: {
  "bda-blonde": 11, "bda-triple": 9, "bda-ipa": 7, "bda-00": 5, "pilsen": 31, "sm-apple": 14, "sml": 26, "red-horse": 22, "coke": 38, "royal": 9, "sprite": 17, "water": 44, "coke-zero": 29,
  "mozz": 3, "dough": 36, "ham": 2.5, "bacon": 4, "pepperoni": 5, "chicken": 2, "box14": 120, "lpg": 1 } }];

/* The day at Pizza 99, as the crew reports it in the chat (18 Aug – 9 Sep 2026):
   ~09:30 water + electricity meter reading (photo) · morning-shift cleaning report with the weekday task · deliveries 10:00–17:00 with qty
   · ~01:00 closing-shift cleaning report with the weekday task, nearly always "rinse and brush the floor". */
const ROTA = { // weekday: [morning task, closing task] — from the crew's own reports; Thu/Fri morning were never named, Erica sets them
  1: ["Chiller area · wipe frames · menu board", "Wash down floor · pizza display · chiller, top to bottom"],
  2: ["Storage area / stock room", "Signage & menu board inside and outside · dough mixer · kitchen sink"],
  3: ["Signage, menu board, display · chairs", "Rinse and brush the floor"],
  4: ["(set by Erica)", "Wipe tables · wash down floor · chiller · pizza display"],
  5: ["(set by Erica)", "Stock room area · rinse and brush the floor"],
  6: ["Walls, display · drawers · slicing table", "Grease trap · rinse and brush the floor"],
  0: ["Condiment chiller · chiller", "General cleaning"],
};
const CHECKLISTS = [
  { id: "open", name: "Opening", from: "09:00", to: "11:00", tasks: [
    { id: "o-meter", t: "Water and electricity meter reading", values: ["Water m³", "Electricity kWh"], photo: true },
    { id: "o-oven", t: "Oven on, at temperature", values: ["Oven °C"] },
    { id: "o-chiller", t: "Chiller temperature", values: ["Chiller °C"] },
    { id: "o-dough", t: "Dough balls ready for the day", values: ["Dough balls"] },
    { id: "o-rota", rota: 0, t: "Morning cleaning task", photo: "before/after" },
    { id: "o-front", t: "Front, display and tables wiped" } ] },
  { id: "close", name: "Closing", from: "23:00", to: "01:30", tasks: [
    { id: "c-rota", rota: 1, t: "Closing cleaning task", photo: "before/after" },
    { id: "c-floor", t: "Rinse and brush the floor", photo: true },
    { id: "c-dough", t: "Dough balls left, wrapped and dated", values: ["Dough balls"], countItem: "dough" },
    { id: "c-top", t: "Toppings covered and dated", photo: true },
    { id: "c-chiller", t: "Chiller temperature", values: ["Chiller °C"] },
    { id: "c-trash", t: "Trash out, bins washed" },
    { id: "c-count", t: "Stock count sent", link: "#/count" },
    { id: "c-cash", t: "Cash count sent", link: "#/cash" },
    { id: "c-off", t: "Gas off, oven off, lights off, door locked" } ] },
];

// From HR's to-do doc (17 Oct 2026) + what the build needs.
const SEED_TASKS = [
  { id: "k-5", title: "Confirm pack sizes (drinks per case, boxes per bundle)", detail: "Until then counts stay in cases + loose.", owner: "erica", due: "2026-10-21", status: "open", source: "P99 OS" },
  { id: "k-6", title: "Weigh the 16 pizza recipes with Mark and Ray", detail: "Worksheet in tools/p99-os/recipes.", owner: "stefan", due: null, status: "open", source: "P99 OS" },
  { id: "k-7", title: "Name the Thursday and Friday morning cleaning tasks", detail: "The chat reports never say what they were.", owner: "erica", due: "2026-10-20", status: "open", source: "P99 OS" },
];

const DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];
const HYG_AREAS = ["Refrigeration", "Shelves & Workstations", "Waste & Recycling", "Floors", "Ceiling & Fans", "Furniture & Fixtures", "Outside Area", "Staff Toilet", "Storage Areas"];
const HYG_GUIDE = [
  ["Inside clean, no spills, no water pooling", "Drinks and cream feel cold, ice cream is hard", "Food covered and dated, no frost, seals clean"],
  ["Surfaces wiped, not sticky", "Tools and boards clean and put away", "No old food or crumbs"],
  ["Bins closed, not overflowing", "Bags changed, no smell", "Recyclables separated"],
  ["Swept and mopped, dry", "Corners and under counters clean", "No grease or debris"],
  ["No cobwebs, no dust on fan blades", "No leaks or stains", "Lights working"],
  ["Tables and chairs wiped", "Nothing broken or wobbly", "Menus, signs and POS clean"],
  ["Entrance swept, no litter", "Signage and plants tidy", "Outside bins closed"],
  ["Toilet and sink clean, flush works", "Soap, tissue, bin with lid", "Floor dry, no smell"],
  ["Stock off the floor, oldest used first", "Everything dated and closed", "No pests, chemicals away from food"],
];
function hygBand(total) { return total >= 41 ? ["excellent", "ok", ""] : total >= 32 ? ["good", "ok", ""] : total >= 23 ? ["acceptable", "warn", "supervisor reports it in the management chat"] : total >= 14 ? ["unacceptable", "bad", "free staff meal cancelled both days"] : ["critical", "bad", "Notice to Explain to the person in charge"]; }
const FIRST5 = ["No sale", "1 sale", "2 sales", "3 sales", "4 sales", "5 sales", "Not checked"];
const FUND = 3000;

/* ---------- Store ---------- */
const Store = {
  key: "p99os_v02", _s: null,
  load() {
    if (this._s) return this._s;
    try { this._s = JSON.parse(localStorage.getItem(this.key) || "null"); } catch (e) { this._s = null; }
    if (!this._s) this._s = { counts: SEED_COUNTS.slice(), receipts: SEED_RECEIPTS.slice(), tickets: [], tasks: SEED_TASKS.slice(), runs: {}, cash: [], walks: [], photos: {}, draft: null, me: null, theme: "light" };
    return this._s;
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this._s)); } catch (e) { toast("Storage full on this device — oldest photos dropped"); this.prunePhotos(8); try { localStorage.setItem(this.key, JSON.stringify(this._s)); } catch (e2) {} } },
  prunePhotos(n) { const ids = Object.keys(this._s.photos); ids.slice(0, Math.max(0, ids.length - n)).forEach(id => delete this._s.photos[id]); },
  reset() { localStorage.removeItem(this.key); this._s = null; },
  item(id) { return ITEMS.find(i => i.id === id); },
  person(id) { return PEOPLE.find(p => p.id === id); },
  localLast(itemId) { const cs = this.load().counts.filter(c => c.submitted && c.lines[itemId] != null).sort((a, b) => a.day < b.day ? 1 : -1); return cs[0] ? { day: cs[0].day, qty: cs[0].lines[itemId], seed: !!cs[0].seed } : null; },
  walkLast(itemId) { const rows = (window.WALK_ROWS || []).filter(r => r.item_key === itemId); return rows.length ? rows.reduce((a, b) => b.day > a.day ? b : a) : null; }, /* Cherry's morning quick counts, mirrored from the old OS (walk_quick_count) */
  /* newest of a count typed in this app and Cherry's morning count. Her count is taken ~10:00 after the business day closed at 04:00, so sales are counted from the day AFTER the previous business day (calcDay = day - 1). */
  lastCount(itemId) { const loc = this.localLast(itemId), w = this.walkLast(itemId); if (w && (!loc || w.day >= loc.day)) return { day: w.day, calcDay: addDays(w.day, -1), qty: +w.qty, seed: false, src: "walk" }; return loc; },
  receivedSince(itemId, day) { return this.load().receipts.filter(r => r.day > day).reduce((s, r) => s + r.lines.filter(l => l.item === itemId).reduce((t, l) => t + l.qty, 0), 0); },
  soldOn(itemId, day) { const it = this.item(itemId); const d = SALES_HISTORY.days[day]; if (!it || !it.pos || !d) return null; const r = d.items.find(x => x[1] === it.pos); return r ? r[2] : 0; },
  soldSince(itemId, day) { const it = this.item(itemId); if (!it || !it.pos) return null; let s = 0; Object.keys(SALES_HISTORY.days).forEach(d => { if (d > day) { const r = SALES_HISTORY.days[d].items.find(x => x[1] === it.pos); if (r) s += r[2]; } }); return s; },
  salesThrough() { return Object.keys(SALES_HISTORY.days).sort().pop(); },
  expected(itemId) { const lc = this.lastCount(itemId); if (!lc) return null; const rec = this.receivedSince(itemId, lc.calcDay || lc.day); const sold = this.soldSince(itemId, lc.calcDay || lc.day); return { base: lc, received: rec, sold, value: sold === null ? null : lc.qty + rec - sold }; },
  usageWeeks(itemId, n = 8) { const it = this.item(itemId); if (!it || !it.pos) return null; const days = Object.keys(SALES_HISTORY.days).sort(); const out = []; const last = new Date(days[days.length - 1] + "T00:00:00"); for (let w = n - 1; w >= 0; w--) { let s = 0; for (let i = 0; i < 7; i++) { const d = new Date(last); d.setDate(last.getDate() - w * 7 - i); const k = ymd(d); const dd = SALES_HISTORY.days[k]; if (dd) { const r = dd.items.find(x => x[1] === it.pos); if (r) s += r[2]; } } out.push(s); } return out; },
  prices(itemId) { return this.load().receipts.flatMap(r => r.lines.filter(l => l.item === itemId && l.price != null).map(l => ({ day: r.day, price: l.price, supplier: r.supplier }))).sort((a, b) => a.day < b.day ? -1 : 1); },
  lastPrice(itemId) { const p = this.prices(itemId); return p.length ? p[p.length - 1] : null; },
};
function band(counted, expected) {
  if (expected == null || counted == null) return { cls: "", label: "no base" };
  const v = counted - expected, a = Math.abs(v), pct = expected ? a / expected : (a ? 1 : 0);
  const cls = (a <= 1 || pct <= 0.02) ? "ok" : (a <= 2 || pct <= 0.03) ? "warn" : "bad";
  return { cls, v, pct, label: v === 0 ? "exact" : (v < 0 ? "short " : "over +") + fmt(a) };
}
function fmt(n) { if (n == null || isNaN(n)) return "—"; return Number(n).toLocaleString("en-PH", { maximumFractionDigits: 2 }); }
function peso(n) { if (n == null || isNaN(n)) return "—"; return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
