/**
 * Demo data for local development: a fictional setup in Jhansi, Uttar Pradesh.
 * Every business, brand, licence, prescription and payment here is SIMULATED and labelled as demo.
 * Refuses to run in production.
 */
import { PrismaClient, type Prisma, type UnitType, type Vertical, type OrderStatus, type PaymentMethod, type DrugSchedule } from '@prisma/client';
import { computeOrderTotals, commissionFor, splitInclusiveTax } from '@padosi/shared';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashPassword } from '../src/lib/crypto';
import { DEFAULT_SETTINGS } from '../src/lib/settings';

const rupees = (r: number) => Math.round(r * 100);

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type V = [suffix: string, name: string, unit: UnitType, qty: number, mrp: number, unitsPerCase?: number];
interface P {
  key: string;
  name: string;
  cat: string;
  brand?: string;
  local?: string[];
  tax: number; // percent
  hsn: string;
  regional?: boolean;
  desc?: string;
  variants: V[];
  rx?: { schedule: DrugSchedule; generic?: string; strength?: string; form?: string };
}

// ───────────── Catalogue definition ─────────────
const CATEGORIES: { key: string; vertical: Vertical; name: string; icon: string }[] = [
  { key: 'veg', vertical: 'GROCERY', name: 'Fruits & Vegetables', icon: '🥬' },
  { key: 'dairy', vertical: 'GROCERY', name: 'Dairy, Bread & Eggs', icon: '🥛' },
  { key: 'staples', vertical: 'GROCERY', name: 'Atta, Rice & Dal', icon: '🌾' },
  { key: 'masala', vertical: 'GROCERY', name: 'Oils, Masala & Essentials', icon: '🫙' },
  { key: 'snacks', vertical: 'GROCERY', name: 'Snacks & Packaged Food', icon: '🍪' },
  { key: 'bev', vertical: 'GROCERY', name: 'Beverages', icon: '🧃' },
  { key: 'personal', vertical: 'GROCERY', name: 'Personal Care', icon: '🧴' },
  { key: 'home', vertical: 'GROCERY', name: 'Home Care & Cleaning', icon: '🧽' },
  { key: 'baby', vertical: 'GROCERY', name: 'Baby Care', icon: '🍼' },
  { key: 'local', vertical: 'GROCERY', name: 'Local & Regional', icon: '🏺' },
  { key: 'h-veg', vertical: 'HORECA', name: 'Bulk Fruits & Vegetables', icon: '🧺' },
  { key: 'h-grain', vertical: 'HORECA', name: 'Rice, Flour, Grains & Pulses', icon: '🌾' },
  { key: 'h-oil', vertical: 'HORECA', name: 'Edible Oils & Spices', icon: '🛢️' },
  { key: 'h-dairy', vertical: 'HORECA', name: 'Dairy & Frozen', icon: '🧊' },
  { key: 'h-bev', vertical: 'HORECA', name: 'Beverages', icon: '🥤' },
  { key: 'h-bakery', vertical: 'HORECA', name: 'Bakery & Food Ingredients', icon: '🥖' },
  { key: 'h-clean', vertical: 'HORECA', name: 'Cleaning & Housekeeping', icon: '🧹' },
  { key: 'h-pack', vertical: 'HORECA', name: 'Packaging & Disposables', icon: '📦' },
  { key: 'c-first', vertical: 'CHEMIST', name: 'First Aid', icon: '🩹' },
  { key: 'c-health', vertical: 'CHEMIST', name: 'Vitamins & Wellness', icon: '💊' },
  { key: 'c-devices', vertical: 'CHEMIST', name: 'Health Devices', icon: '🌡️' },
  { key: 'c-hygiene', vertical: 'CHEMIST', name: 'Hygiene Essentials', icon: '🧼' },
  { key: 'c-rx', vertical: 'CHEMIST', name: 'Prescription Medicines', icon: '📋' },
];

const GROCERY: P[] = [
  { key: 'tomato', name: 'Tomato (Desi)', cat: 'veg', brand: 'GaonFresh', local: ['tamatar'], tax: 0, hsn: '0702', variants: [['500G', '500 g', 'G', 500, 25], ['1KG', '1 kg', 'KG', 1, 45]] },
  { key: 'onion', name: 'Onion', cat: 'veg', brand: 'GaonFresh', local: ['pyaz', 'pyaaz', 'kanda'], tax: 0, hsn: '0703', variants: [['1KG', '1 kg', 'KG', 1, 40], ['2KG', '2 kg', 'KG', 2, 78]] },
  { key: 'potato', name: 'Potato', cat: 'veg', brand: 'GaonFresh', local: ['aloo', 'alu'], tax: 0, hsn: '0701', variants: [['1KG', '1 kg', 'KG', 1, 30], ['5KG', '5 kg', 'KG', 5, 140]] },
  { key: 'banana', name: 'Banana (Robusta)', cat: 'veg', brand: 'GaonFresh', local: ['kela'], tax: 0, hsn: '0803', variants: [['DZ', '1 dozen', 'DOZEN', 1, 60]] },
  { key: 'chilli', name: 'Green Chilli', cat: 'veg', brand: 'GaonFresh', local: ['mirchi', 'mirch'], tax: 0, hsn: '0709', variants: [['100G', '100 g', 'G', 100, 12]] },
  { key: 'coriander', name: 'Coriander Leaves', cat: 'veg', brand: 'GaonFresh', local: ['dhaniya', 'dhania'], tax: 0, hsn: '0709', variants: [['100G', '100 g', 'G', 100, 10]] },
  { key: 'milk', name: 'Toned Milk', cat: 'dairy', brand: 'Sunrise Dairy', local: ['doodh', 'dudh'], tax: 0, hsn: '0401', variants: [['500ML', '500 ml', 'ML', 500, 28], ['1L', '1 L', 'L', 1, 54]] },
  { key: 'paneer', name: 'Fresh Paneer', cat: 'dairy', brand: 'Sunrise Dairy', local: ['paneer'], tax: 5, hsn: '0406', variants: [['200G', '200 g', 'G', 200, 90]] },
  { key: 'curd', name: 'Curd', cat: 'dairy', brand: 'Sunrise Dairy', local: ['dahi'], tax: 5, hsn: '0403', variants: [['400G', '400 g', 'G', 400, 45]] },
  { key: 'bread', name: 'Brown Bread', cat: 'dairy', brand: 'Roti Ghar Bakery', local: ['bread', 'double roti'], tax: 0, hsn: '1905', variants: [['400G', '400 g', 'G', 400, 45]] },
  { key: 'eggs', name: 'Farm Eggs', cat: 'dairy', brand: 'GaonFresh', local: ['anda', 'ande'], tax: 0, hsn: '0407', variants: [['6PC', '6 pieces', 'PIECE', 6, 48], ['12PC', '12 pieces', 'PIECE', 12, 90]] },
  { key: 'atta', name: 'Whole Wheat Atta', cat: 'staples', brand: 'Bundeli Harvest', local: ['atta', 'aata', 'gehun'], tax: 5, hsn: '1101', variants: [['5KG', '5 kg', 'KG', 5, 285], ['10KG', '10 kg', 'KG', 10, 550]] },
  { key: 'rice', name: 'Basmati Rice (Everyday)', cat: 'staples', brand: 'Bundeli Harvest', local: ['chawal'], tax: 5, hsn: '1006', variants: [['1KG', '1 kg', 'KG', 1, 120], ['5KG', '5 kg', 'KG', 5, 560]] },
  { key: 'toor', name: 'Toor Dal', cat: 'staples', brand: 'Bundeli Harvest', local: ['arhar', 'dal', 'daal'], tax: 5, hsn: '0713', variants: [['1KG', '1 kg', 'KG', 1, 165]] },
  { key: 'chana', name: 'Chana Dal', cat: 'staples', brand: 'Bundeli Harvest', local: ['chana', 'dal', 'daal'], tax: 5, hsn: '0713', variants: [['1KG', '1 kg', 'KG', 1, 110]] },
  { key: 'mustard', name: 'Kachi Ghani Mustard Oil', cat: 'masala', brand: 'Desi Rasoi', local: ['sarson', 'tel', 'tail'], tax: 5, hsn: '1514', variants: [['1L', '1 L', 'L', 1, 185], ['5L', '5 L', 'L', 5, 880]] },
  { key: 'haldi', name: 'Turmeric Powder', cat: 'masala', brand: 'Desi Rasoi', local: ['haldi'], tax: 5, hsn: '0910', variants: [['200G', '200 g', 'G', 200, 62]] },
  { key: 'redchilli', name: 'Red Chilli Powder', cat: 'masala', brand: 'Desi Rasoi', local: ['lal', 'mirch'], tax: 5, hsn: '0904', variants: [['200G', '200 g', 'G', 200, 70]] },
  { key: 'garam', name: 'Garam Masala', cat: 'masala', brand: 'Desi Rasoi', local: ['masala'], tax: 5, hsn: '0910', variants: [['100G', '100 g', 'G', 100, 75]] },
  { key: 'salt', name: 'Iodised Salt', cat: 'masala', brand: 'Desi Rasoi', local: ['namak'], tax: 0, hsn: '2501', variants: [['1KG', '1 kg', 'KG', 1, 28]] },
  { key: 'sugar', name: 'Sugar', cat: 'masala', brand: 'Bundeli Harvest', local: ['cheeni', 'chini', 'shakkar'], tax: 5, hsn: '1701', variants: [['1KG', '1 kg', 'KG', 1, 48]] },
  { key: 'namkeen', name: 'Masala Namkeen Mix', cat: 'snacks', brand: 'Crunchies', local: ['namkeen'], tax: 12, hsn: '2106', variants: [['200G', '200 g', 'G', 200, 50]] },
  { key: 'biscuit', name: 'Glucose Biscuits', cat: 'snacks', brand: 'Crunchies', local: ['biscuit'], tax: 18, hsn: '1905', variants: [['250G', '250 g', 'G', 250, 30]] },
  { key: 'noodles', name: 'Masala Instant Noodles', cat: 'snacks', brand: 'Crunchies', local: ['maggi', 'noodles'], tax: 12, hsn: '1902', variants: [['4PK', 'Pack of 4', 'PACK', 4, 56]] },
  { key: 'tea', name: 'Assam CTC Tea', cat: 'bev', brand: 'ChaiWala Co.', local: ['chai', 'patti', 'chaipatti'], tax: 5, hsn: '0902', variants: [['250G', '250 g', 'G', 250, 140]] },
  { key: 'mango', name: 'Mango Fruit Drink', cat: 'bev', brand: 'Tazgi', local: ['aam'], tax: 12, hsn: '2202', variants: [['600ML', '600 ml', 'ML', 600, 40], ['1.2L', '1.2 L', 'L', 1.2, 70]] },
  { key: 'water', name: 'Packaged Drinking Water', cat: 'bev', brand: 'Tazgi', local: ['pani', 'paani'], tax: 18, hsn: '2201', variants: [['1L', '1 L', 'L', 1, 20]] },
  { key: 'soap', name: 'Neem Bath Soap', cat: 'personal', brand: 'Nirmal Care', local: ['sabun'], tax: 18, hsn: '3401', variants: [['4X100G', 'Pack of 4 × 100 g', 'PACK', 4, 140]] },
  { key: 'toothpaste', name: 'Herbal Toothpaste', cat: 'personal', brand: 'Nirmal Care', local: ['manjan'], tax: 18, hsn: '3306', variants: [['150G', '150 g', 'G', 150, 95]] },
  { key: 'hairoil', name: 'Coconut Hair Oil', cat: 'personal', brand: 'Nirmal Care', local: ['nariyal', 'tel'], tax: 18, hsn: '3305', variants: [['200ML', '200 ml', 'ML', 200, 90]] },
  { key: 'detergent', name: 'Detergent Powder', cat: 'home', brand: 'SaafSafai', local: ['surf', 'sarf'], tax: 18, hsn: '3402', variants: [['1KG', '1 kg', 'KG', 1, 110]] },
  { key: 'dishbar', name: 'Dishwash Bar', cat: 'home', brand: 'SaafSafai', local: ['bartan'], tax: 18, hsn: '3402', variants: [['3PC', 'Pack of 3', 'PACK', 3, 45]] },
  { key: 'floor', name: 'Floor Cleaner (Lemon)', cat: 'home', brand: 'SaafSafai', local: ['phenyl'], tax: 18, hsn: '3808', variants: [['1L', '1 L', 'L', 1, 150]] },
  { key: 'diapers', name: 'Baby Diapers (Medium)', cat: 'baby', brand: 'NannhaCare', local: ['diaper'], tax: 12, hsn: '9619', variants: [['20PC', '20 pieces', 'PIECE', 20, 399]] },
  { key: 'wipes', name: 'Baby Wipes', cat: 'baby', brand: 'NannhaCare', local: ['wipes'], tax: 12, hsn: '3307', variants: [['72PC', '72 wipes', 'PIECE', 72, 149]] },
  { key: 'gud', name: 'Jhansi Desi Gud (Jaggery)', cat: 'local', brand: 'Bundeli Harvest', local: ['gud', 'gur'], tax: 0, hsn: '1701', regional: true, desc: 'Traditional jaggery from Bundelkhand cane crushers. Demo product.', variants: [['1KG', '1 kg', 'KG', 1, 90]] },
  { key: 'laddoo', name: 'Bundeli Besan Laddoo', cat: 'local', brand: 'Bundeli Harvest', local: ['laddu', 'ladoo'], tax: 5, hsn: '2106', regional: true, desc: 'Made by a local mithai shop. Demo product.', variants: [['500G', '500 g', 'G', 500, 220]] },
  { key: 'bajra', name: 'Bajra Atta (Local Chakki)', cat: 'local', brand: 'Bundeli Harvest', local: ['bajra'], tax: 0, hsn: '1102', regional: true, variants: [['1KG', '1 kg', 'KG', 1, 55]] },
  { key: 'papad', name: 'Bundelkhandi Kachri Papad', cat: 'local', brand: 'Bundeli Harvest', local: ['papad'], tax: 5, hsn: '1905', regional: true, variants: [['200G', '200 g', 'G', 200, 80]] },
];

// HoReCa wholesale catalogue. MRP is per pack; wholesale prices are GST-exclusive.
const HORECA: P[] = [
  { key: 'b-onion', name: 'Onion (Bulk Bag)', cat: 'h-veg', brand: 'GaonFresh', local: ['pyaz', 'kanda'], tax: 0, hsn: '0703', variants: [['25KG', '25 kg bag', 'KG', 25, 900]] },
  { key: 'b-potato', name: 'Potato (Bulk Bag)', cat: 'h-veg', brand: 'GaonFresh', local: ['aloo'], tax: 0, hsn: '0701', variants: [['50KG', '50 kg bag', 'KG', 50, 1300]] },
  { key: 'b-tomato', name: 'Tomato (Crate)', cat: 'h-veg', brand: 'GaonFresh', local: ['tamatar'], tax: 0, hsn: '0702', variants: [['25KG', '25 kg crate', 'KG', 25, 950]] },
  { key: 'b-rice', name: 'Basmati Rice (Bulk)', cat: 'h-grain', brand: 'Bundeli Harvest', local: ['chawal'], tax: 5, hsn: '1006', variants: [['25KG', '25 kg bag', 'KG', 25, 2600]] },
  { key: 'b-atta', name: 'Whole Wheat Atta (Bulk)', cat: 'h-grain', brand: 'Bundeli Harvest', local: ['atta', 'gehun'], tax: 5, hsn: '1101', variants: [['50KG', '50 kg bag', 'KG', 50, 2500]] },
  { key: 'b-toor', name: 'Toor Dal (Bulk)', cat: 'h-grain', brand: 'Bundeli Harvest', local: ['arhar', 'dal'], tax: 5, hsn: '0713', variants: [['30KG', '30 kg bag', 'KG', 30, 4600]] },
  { key: 'b-soy', name: 'Refined Soybean Oil', cat: 'h-oil', brand: 'Desi Rasoi', local: ['tel', 'refined'], tax: 5, hsn: '1507', variants: [['15L', '15 L tin', 'L', 15, 2100]] },
  { key: 'b-mustard', name: 'Mustard Oil (Bulk Tin)', cat: 'h-oil', brand: 'Desi Rasoi', local: ['sarson', 'tel'], tax: 5, hsn: '1514', variants: [['15L', '15 L tin', 'L', 15, 2500]] },
  { key: 'b-chilli', name: 'Red Chilli Powder (Bulk)', cat: 'h-oil', brand: 'Desi Rasoi', local: ['mirch'], tax: 5, hsn: '0904', variants: [['5KG', '5 kg pack', 'KG', 5, 1250]] },
  { key: 'b-haldi', name: 'Turmeric Powder (Bulk)', cat: 'h-oil', brand: 'Desi Rasoi', local: ['haldi'], tax: 5, hsn: '0910', variants: [['5KG', '5 kg pack', 'KG', 5, 1050]] },
  { key: 'b-salt', name: 'Iodised Salt (Case)', cat: 'h-oil', brand: 'Desi Rasoi', local: ['namak'], tax: 0, hsn: '2501', variants: [['CASE25', 'Case of 25 × 1 kg', 'CASE', 25, 600, 25]] },
  { key: 'b-sugar', name: 'Sugar (Bulk Bag)', cat: 'h-grain', brand: 'Bundeli Harvest', local: ['cheeni'], tax: 5, hsn: '1701', variants: [['50KG', '50 kg bag', 'KG', 50, 2150]] },
  { key: 'b-paneer', name: 'Paneer Block', cat: 'h-dairy', brand: 'Sunrise Dairy', local: ['paneer'], tax: 5, hsn: '0406', variants: [['1KG', '1 kg block', 'KG', 1, 380]] },
  { key: 'b-fries', name: 'Frozen French Fries', cat: 'h-dairy', brand: 'Sunrise Dairy', local: ['fries'], tax: 12, hsn: '2004', variants: [['2.5KG', '2.5 kg pack', 'KG', 2.5, 520]] },
  { key: 'b-butter', name: 'Table Butter (Bulk)', cat: 'h-dairy', brand: 'Sunrise Dairy', local: ['makhan'], tax: 12, hsn: '0405', variants: [['500G', '500 g', 'G', 500, 280]] },
  { key: 'b-water', name: 'Packaged Water (Case)', cat: 'h-bev', brand: 'Tazgi', local: ['pani'], tax: 18, hsn: '2201', variants: [['CASE12', 'Case of 12 × 1 L', 'CASE', 12, 180, 12]] },
  { key: 'b-premix', name: 'Tea Premix', cat: 'h-bev', brand: 'ChaiWala Co.', local: ['chai'], tax: 18, hsn: '2101', variants: [['1KG', '1 kg pack', 'KG', 1, 450]] },
  { key: 'b-maida', name: 'Refined Flour (Maida)', cat: 'h-bakery', brand: 'Bundeli Harvest', local: ['maida'], tax: 5, hsn: '1101', variants: [['50KG', '50 kg bag', 'KG', 50, 1900]] },
  { key: 'b-bakingpowder', name: 'Baking Powder', cat: 'h-bakery', brand: 'Roti Ghar Bakery', local: ['baking'], tax: 18, hsn: '2102', variants: [['1KG', '1 kg', 'KG', 1, 220]] },
  { key: 'b-floor', name: 'Floor Cleaner (5 L Can)', cat: 'h-clean', brand: 'SaafSafai', local: ['phenyl'], tax: 18, hsn: '3808', variants: [['5L', '5 L can', 'L', 5, 550]] },
  { key: 'b-dishliquid', name: 'Dishwash Liquid (5 L Can)', cat: 'h-clean', brand: 'SaafSafai', local: ['bartan'], tax: 18, hsn: '3402', variants: [['5L', '5 L can', 'L', 5, 480]] },
  { key: 'b-garbage', name: 'Garbage Bags (Large)', cat: 'h-clean', brand: 'KhaasPack', local: ['polythene'], tax: 18, hsn: '3923', variants: [['PK30', 'Pack of 30', 'PACK', 30, 180]] },
  { key: 'b-napkin', name: 'Paper Napkins', cat: 'h-pack', brand: 'KhaasPack', local: ['tissue'], tax: 18, hsn: '4818', variants: [['CARTON20', 'Carton of 20 packs', 'CARTON', 20, 800, 20]] },
  { key: 'b-container', name: 'Aluminium Containers 750 ml', cat: 'h-pack', brand: 'KhaasPack', local: ['container', 'foil'], tax: 18, hsn: '7615', variants: [['PK100', 'Pack of 100', 'PACK', 100, 650]] },
  { key: 'b-kraft', name: 'Kraft Paper Bags (Medium)', cat: 'h-pack', brand: 'KhaasPack', local: ['thaila', 'bag'], tax: 18, hsn: '4819', variants: [['PK100', 'Pack of 100', 'PACK', 100, 400]] },
  { key: 'b-cups', name: 'Paper Cups 200 ml', cat: 'h-pack', brand: 'KhaasPack', local: ['cup', 'glass'], tax: 18, hsn: '4823', variants: [['PK500', 'Pack of 500', 'PACK', 500, 600]] },
];

const RX_NOTE = 'DEMO PRODUCT for testing the prescription workflow — not a real listing. Prescription medicine: use only as directed by a registered medical practitioner.';
const CHEMIST: P[] = [
  { key: 'ors', name: 'ORS Powder (Orange) – Demo', cat: 'c-first', brand: 'Arogya Basics', local: ['ors'], tax: 12, hsn: '3004', variants: [['SACHET', 'Sachet 21 g', 'PACK', 1, 22]], rx: { schedule: 'OTC' } },
  { key: 'antiseptic', name: 'Antiseptic Liquid – Demo', cat: 'c-first', brand: 'Arogya Basics', local: ['dettol', 'antiseptic'], tax: 18, hsn: '3808', variants: [['250ML', '250 ml', 'ML', 250, 140]], rx: { schedule: 'OTC' } },
  { key: 'bandage', name: 'Adhesive Bandages – Demo', cat: 'c-first', brand: 'Arogya Basics', local: ['bandage', 'patti'], tax: 12, hsn: '3005', variants: [['PK20', 'Pack of 20', 'PACK', 20, 60]], rx: { schedule: 'OTC' } },
  { key: 'cotton', name: 'Absorbent Cotton Roll – Demo', cat: 'c-first', brand: 'Arogya Basics', local: ['rui', 'cotton'], tax: 12, hsn: '3005', variants: [['100G', '100 g', 'G', 100, 55]], rx: { schedule: 'OTC' } },
  { key: 'vitc', name: 'Vitamin C Chewable Tablets – Demo', cat: 'c-health', brand: 'Arogya Basics', local: ['vitamin'], tax: 18, hsn: '2106', variants: [['STRIP15', 'Strip of 15', 'STRIP', 15, 40]], rx: { schedule: 'OTC' } },
  { key: 'thermo', name: 'Digital Thermometer – Demo', cat: 'c-devices', brand: 'Arogya Basics', local: ['thermometer'], tax: 12, hsn: '9025', variants: [['1PC', '1 piece', 'PIECE', 1, 250]], rx: { schedule: 'OTC' } },
  { key: 'sanitiser', name: 'Hand Sanitiser – Demo', cat: 'c-hygiene', brand: 'Arogya Basics', local: ['sanitizer', 'sanitiser'], tax: 18, hsn: '3808', variants: [['500ML', '500 ml', 'ML', 500, 220]], rx: { schedule: 'OTC' } },
  { key: 'amox', name: 'Amoxicillin 500 mg Capsule – Demo', cat: 'c-rx', brand: 'Demo Pharma Labs', local: ['amoxicillin', 'antibiotic'], tax: 12, hsn: '3004', desc: RX_NOTE, variants: [['STRIP10', 'Strip of 10 capsules', 'STRIP', 10, 95]], rx: { schedule: 'SCHEDULE_H', generic: 'Amoxicillin', strength: '500 mg', form: 'Capsule' } },
  { key: 'metformin', name: 'Metformin 500 mg Tablet – Demo', cat: 'c-rx', brand: 'Demo Pharma Labs', local: ['metformin'], tax: 12, hsn: '3004', desc: RX_NOTE, variants: [['STRIP15', 'Strip of 15 tablets', 'STRIP', 15, 40]], rx: { schedule: 'SCHEDULE_H', generic: 'Metformin Hydrochloride', strength: '500 mg', form: 'Tablet' } },
  { key: 'amlodipine', name: 'Amlodipine 5 mg Tablet – Demo', cat: 'c-rx', brand: 'Demo Pharma Labs', local: ['amlodipine'], tax: 12, hsn: '3004', desc: RX_NOTE, variants: [['STRIP15', 'Strip of 15 tablets', 'STRIP', 15, 55]], rx: { schedule: 'SCHEDULE_H', generic: 'Amlodipine Besylate', strength: '5 mg', form: 'Tablet' } },
];

/** A one-page PDF labelled as a fake prescription, for the demo pharmacist review queue. */
function demoPrescriptionPdf(patient: string): Buffer {
  const lines = ['DEMO PRESCRIPTION - NOT A REAL MEDICAL DOCUMENT', `Patient: ${patient}`, 'Dr. Demo Practitioner (fictional), Reg. No. DEMO-0000', 'Rx: Amoxicillin 500 mg - 1 strip', 'Generated by the Padosi seed script for workflow testing only.'];
  const content = `BT /F1 14 Tf 50 780 Td ${lines.map((l, i) => `${i ? '0 -28 Td ' : ''}(${l.replace(/[()\\]/g, '')}) Tj`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

export async function seed(prisma: PrismaClient, opts: { storageDir?: string; log?: (s: string) => void } = {}) {
  const log = opts.log ?? console.log;
  const rand = rng(20261021);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const storageDir = path.resolve(opts.storageDir ?? process.env.STORAGE_DIR ?? './storage');
  const demoPassword = process.env.DEMO_USER_PASSWORD ? await hashPassword(process.env.DEMO_USER_PASSWORD) : null;

  // ── Settings ──
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.platformSetting.create({ data: { key, value: value as Prisma.InputJsonValue } });
  }

  // ── Geography ──
  const jhansi = await prisma.city.create({ data: { name: 'Jhansi', state: 'Uttar Pradesh', stateCode: '09', slug: 'jhansi', lat: 25.4484, lng: 78.5685, isActive: true } });
  // A second city configured but not launched, to show multi-city setup.
  const gwalior = await prisma.city.create({ data: { name: 'Gwalior', state: 'Madhya Pradesh', stateCode: '23', slug: 'gwalior', lat: 26.2183, lng: 78.1828, isActive: false } });
  const central = await prisma.serviceZone.create({ data: { cityId: jhansi.id, name: 'Central Jhansi', isActive: true } });
  const north = await prisma.serviceZone.create({ data: { cityId: jhansi.id, name: 'North Jhansi', isActive: true } });
  const outskirts = await prisma.serviceZone.create({ data: { cityId: jhansi.id, name: 'Outskirts (paused)', isActive: false } });
  await prisma.serviceZone.create({ data: { cityId: gwalior.id, name: 'Gwalior Pilot', isActive: false } });

  // Approximate coordinates for demo purposes only.
  const L = async (name: string, postalCode: string, lat: number, lng: number, zoneId: string | null) =>
    prisma.locality.create({ data: { cityId: jhansi.id, name, postalCode, lat, lng, zoneId } });
  const sipri = await L('Sipri Bazar', '284003', 25.4385, 78.553, central.id);
  const civil = await L('Civil Lines', '284001', 25.456, 78.577, central.id);
  const prem = await L('Prem Nagar', '284003', 25.444, 78.56, central.id);
  const sadar = await L('Sadar Bazar', '284001', 25.46, 78.572, central.id);
  const nandan = await L('Nandanpura', '284003', 25.43, 78.545, central.id);
  const gwRoad = await L('Gwalior Road', '284003', 25.47, 78.58, north.id);
  const medical = await L('Medical College Area', '284128', 25.48, 78.595, north.id);
  await L('Babina', '284401', 25.24, 78.47, outskirts.id);
  await L('Rajgarh', '284001', 25.405, 78.62, null);
  await prisma.locality.create({ data: { cityId: gwalior.id, name: 'Lashkar', postalCode: '474001', lat: 26.2, lng: 78.15 } });
  const allServed = [sipri, civil, prem, sadar, nandan, gwRoad, medical];

  // ── Categories & brands ──
  const cat = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const row = await prisma.category.create({ data: { vertical: c.vertical, name: c.name, slug: `${c.vertical.toLowerCase()}-${c.key}`, icon: c.icon, sortOrder: i } });
    cat.set(c.key, row.id);
  }
  const brand = new Map<string, string>();
  for (const name of new Set([...GROCERY, ...HORECA, ...CHEMIST].map((p) => p.brand!).filter(Boolean))) {
    const b = await prisma.brand.create({ data: { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') } });
    brand.set(name, b.id);
  }

  // ── Products ──
  const variantBy = new Map<string, { id: string; mrp: number; productId: string; tax: number; name: string; productName: string; unitType: UnitType; unitQuantity: number; hsn: string; rx: boolean }>();
  async function createProducts(list: P[], vertical: Vertical) {
    for (const p of list) {
      const prod = await prisma.product.create({
        data: {
          name: p.name,
          slug: p.key,
          brandId: p.brand ? brand.get(p.brand) : null,
          categoryId: cat.get(p.cat)!,
          vertical,
          description: p.desc ?? `${p.name} from ${p.brand ?? 'a local supplier'}. Demo catalogue item with illustrative pricing.`,
          localNames: p.local ?? [],
          taxRateBps: p.tax * 100,
          hsnCode: p.hsn,
          isRegional: !!p.regional,
          regionalCityId: p.regional ? jhansi.id : null,
          isDemo: true,
          schedule: p.rx?.schedule ?? null,
          requiresPrescription: p.rx?.schedule === 'SCHEDULE_H' || p.rx?.schedule === 'SCHEDULE_H1',
          genericName: p.rx?.generic ?? null,
          strength: p.rx?.strength ?? null,
          dosageForm: p.rx?.form ?? null,
          manufacturer: p.rx ? 'Demo Pharma Labs (fictional)' : null,
        },
      });
      for (const [suffix, name, unit, qty, mrp, upc] of p.variants) {
        const sku = `${p.key.toUpperCase()}-${suffix}`.replace(/[^A-Z0-9.-]/g, '');
        const v = await prisma.productVariant.create({
          data: { productId: prod.id, sku, name, unitType: unit, unitQuantity: qty, mrp: rupees(mrp), unitsPerCase: upc ?? null, isBulk: vertical === 'HORECA' },
        });
        variantBy.set(sku, { id: v.id, mrp: rupees(mrp), productId: prod.id, tax: p.tax * 100, name, productName: p.name, unitType: unit, unitQuantity: qty, hsn: p.hsn, rx: prod.requiresPrescription });
      }
    }
  }
  await createProducts(GROCERY, 'GROCERY');
  await createProducts(HORECA, 'HORECA');
  await createProducts(CHEMIST, 'CHEMIST');

  // ── Users ──
  async function user(name: string, phone: string, roles: ('CUSTOMER' | 'BUSINESS_BUYER' | 'SELLER' | 'DELIVERY_PARTNER' | 'ADMIN' | 'SUPER_ADMIN')[], email?: string) {
    return prisma.user.create({
      data: {
        name,
        phone,
        email: email ?? null,
        phoneVerifiedAt: new Date(),
        passwordHash: demoPassword,
        isDemo: true,
        roles: { create: roles.map((role) => ({ role })) },
        customerProfile: { create: { marketingConsent: roles.includes('CUSTOMER') } },
      },
    });
  }
  // Fictional people. 90000000xx numbers are placeholders; the mock SMS provider never sends real messages.
  const aarti = await user('Aarti Verma', '9000000001', ['CUSTOMER'], 'customer@demo.padosi.example');
  const rohit = await user('Rohit Yadav', '9000000002', ['CUSTOMER']);
  const vikram = await user('Vikram Singh (Hotel Bundela – Demo)', '9000000003', ['CUSTOMER', 'BUSINESS_BUYER'], 'horeca@demo.padosi.example');
  const ramesh = await user('Ramesh Sharma', '9000000011', ['CUSTOMER', 'SELLER'], 'seller@demo.padosi.example');
  const neha = await user('Neha Gupta', '9000000012', ['CUSTOMER', 'SELLER']);
  const imran = await user('Imran Khan', '9000000013', ['CUSTOMER', 'SELLER'], 'wholesale@demo.padosi.example');
  const sunil = await user('Sunil Agarwal', '9000000014', ['CUSTOMER', 'SELLER']);
  const pooja = await user('Pooja Mishra (Demo Pharmacist)', '9000000015', ['CUSTOMER', 'SELLER'], 'pharmacist@demo.padosi.example');
  const manoj = await user('Manoj Kumar', '9000000016', ['CUSTOMER', 'SELLER']);
  const sonu = await user('Sonu Kumar', '9000000021', ['CUSTOMER', 'DELIVERY_PARTNER'], 'rider@demo.padosi.example');
  const deepak = await user('Deepak Pal', '9000000022', ['CUSTOMER', 'DELIVERY_PARTNER']);
  const ajay = await user('Ajay Rajput', '9000000023', ['CUSTOMER', 'DELIVERY_PARTNER']);
  await user('Ops Admin (Demo)', '9000000031', ['ADMIN'], 'admin@demo.padosi.example');
  const superAdmin = await user('Super Admin (Demo)', '9000000032', ['SUPER_ADMIN'], 'superadmin@demo.padosi.example');

  // ── Addresses ──
  const addr = (u: { id: string; name: string; phone: string | null }, loc: typeof sipri, line1: string, label = 'Home', isDefault = true, dLat = 0.002, dLng = 0.002) =>
    prisma.address.create({
      data: { userId: u.id, label, contactName: u.name.replace(/ \(.*\)/, ''), contactPhone: u.phone!, line1, localityId: loc.id, postalCode: loc.postalCode, lat: loc.lat + dLat, lng: loc.lng + dLng, isDefault },
    });
  const aartiHome = await addr(aarti, prem, '14, Gali No. 3, near Hanuman Mandir');
  await addr(aarti, civil, 'Office: 2nd floor, Demo Towers', 'Work', false, -0.001, 0.001);
  const rohitHome = await addr(rohit, sipri, '22B, Shanti Colony');
  const vikramHotel = await addr(vikram, civil, 'Hotel Bundela Residency (Demo), Station Road', 'Hotel');

  // ── Sellers & stores ──
  async function sellerOrg(data: { name: string; legalName: string; type: 'GROCERY_RETAILER' | 'WHOLESALER' | 'HORECA_SUPPLIER' | 'PHARMACY'; gstin: string | null; owner: string; status?: 'APPROVED' | 'PENDING'; licences?: { type: 'DRUG_LICENCE' | 'FSSAI_LICENCE' | 'GST_CERTIFICATE'; number: string }[] }) {
    return prisma.sellerOrg.create({
      data: {
        name: data.name,
        legalName: data.legalName,
        sellerType: data.type,
        gstin: data.gstin,
        contactPhone: '9000000099',
        contactEmail: 'store@demo.padosi.example',
        verificationStatus: data.status ?? 'APPROVED',
        reviewedAt: data.status === 'PENDING' ? null : new Date(),
        reviewNotes: data.status === 'PENDING' ? null : 'Demo seller – documents simulated.',
        isDemo: true,
        members: { create: { userId: data.owner, role: 'OWNER' } },
        licences: { create: (data.licences ?? []).map((l) => ({ ...l, status: data.status === 'PENDING' ? 'PENDING' : 'APPROVED', isSimulated: true, validUntil: new Date(Date.now() + 365 * 86400_000) })) },
      },
    });
  }
  async function store(org: { id: string }, data: { name: string; slug: string; verticals: Vertical[]; loc: typeof sipri; addressLine: string; radius: number; serves: (typeof sipri)[]; open: number; close: number; minOrder: number; fee: number; freeAbove: number; prep: number; scheduled?: boolean; dLat?: number; dLng?: number }) {
    return prisma.store.create({
      data: {
        sellerOrgId: org.id,
        name: data.name,
        slug: data.slug,
        verticals: data.verticals,
        addressLine: data.addressLine,
        localityId: data.loc.id,
        postalCode: data.loc.postalCode,
        lat: data.loc.lat + (data.dLat ?? 0),
        lng: data.loc.lng + (data.dLng ?? 0),
        phone: '9000000099',
        openMinute: data.open,
        closeMinute: data.close,
        deliveryRadiusKm: data.radius,
        minOrderValue: rupees(data.minOrder),
        baseDeliveryFee: rupees(data.fee),
        freeDeliveryAbove: rupees(data.freeAbove),
        prepTimeMins: data.prep,
        scheduledDeliveryEnabled: !!data.scheduled,
        isDemo: true,
        serviceAreas: { create: data.serves.map((l) => ({ localityId: l.id })) },
      },
    });
  }

  const sharmaOrg = await sellerOrg({ name: 'Sharma Kirana (Demo)', legalName: 'Sharma Kirana Bhandar (Demo) Pvt', type: 'GROCERY_RETAILER', gstin: '09AAAAA0000A1Z5', owner: ramesh.id, licences: [{ type: 'FSSAI_LICENCE', number: 'DEMO-FSSAI-0001' }] });
  const freshOrg = await sellerOrg({ name: 'Bundelkhand Fresh Mart (Demo)', legalName: 'Bundelkhand Fresh Mart (Demo) LLP', type: 'GROCERY_RETAILER', gstin: '09BBBBB0000B1Z5', owner: neha.id, licences: [{ type: 'FSSAI_LICENCE', number: 'DEMO-FSSAI-0002' }] });
  const wholesaleOrg = await sellerOrg({ name: 'Jhansi Wholesale Traders (Demo)', legalName: 'Jhansi Wholesale Traders (Demo)', type: 'HORECA_SUPPLIER', gstin: '09CCCCC0000C1Z5', owner: imran.id, licences: [{ type: 'FSSAI_LICENCE', number: 'DEMO-FSSAI-0003' }] });
  const pharmaOrg = await sellerOrg({ name: 'Arogya Medicals – SIMULATED PHARMACY', legalName: 'Arogya Medicals (Simulation)', type: 'PHARMACY', gstin: '09DDDDD0000D1Z5', owner: sunil.id, licences: [{ type: 'DRUG_LICENCE', number: 'DEMO-UP-DL-20B/21B-0000' }] });
  await prisma.sellerMember.create({ data: { userId: pooja.id, sellerOrgId: pharmaOrg.id, role: 'PHARMACIST', pharmacistRegNumber: 'DEMO-UPPC-12345' } });
  const pendingOrg = await sellerOrg({ name: 'Naya Bazaar Store (Demo – pending)', legalName: 'Naya Bazaar Store (Demo)', type: 'GROCERY_RETAILER', gstin: null, owner: manoj.id, status: 'PENDING', licences: [{ type: 'FSSAI_LICENCE', number: 'DEMO-FSSAI-0099' }] });

  // Sharma Kirana is open 24 hours so the demo always has an orderable store.
  const sharma = await store(sharmaOrg, { name: 'Sharma Kirana (Demo)', slug: 'sharma-kirana', verticals: ['GROCERY'], loc: sipri, addressLine: 'Shop 7, Sipri Bazar Main Road', radius: 3.5, serves: [sipri, prem, nandan, civil], open: 0, close: 0, minOrder: 99, fee: 20, freeAbove: 199, prep: 10 });
  const fresh = await store(freshOrg, { name: 'Bundelkhand Fresh Mart (Demo)', slug: 'bundelkhand-fresh-mart', verticals: ['GROCERY', 'HORECA'], loc: civil, addressLine: 'Opp. Demo Park, Civil Lines', radius: 5, serves: [civil, sadar, gwRoad, medical, prem, sipri], open: 360, close: 1380, minOrder: 149, fee: 25, freeAbove: 299, prep: 12, dLat: 0.001 });
  const wholesale = await store(wholesaleOrg, { name: 'Jhansi Wholesale Traders (Demo)', slug: 'jhansi-wholesale-traders', verticals: ['HORECA'], loc: gwRoad, addressLine: 'Godown 3, Transport Nagar, Gwalior Road', radius: 10, serves: allServed, open: 300, close: 1260, minOrder: 1500, fee: 150, freeAbove: 5000, prep: 45, scheduled: true });
  const pharmacy = await store(pharmaOrg, { name: 'Arogya Medicals – SIMULATED PHARMACY', slug: 'arogya-medicals-demo', verticals: ['CHEMIST'], loc: civil, addressLine: 'Shop 2, Demo Medical Complex, Civil Lines', radius: 5, serves: [civil, sadar, prem, sipri, gwRoad, medical], open: 480, close: 1380, minOrder: 50, fee: 20, freeAbove: 299, prep: 10, dLng: -0.002 });
  await store(pendingOrg, { name: 'Naya Bazaar Store (Demo – pending)', slug: 'naya-bazaar', verticals: ['GROCERY'], loc: nandan, addressLine: 'Nandanpura Chauraha', radius: 3, serves: [nandan, sipri], open: 420, close: 1290, minOrder: 99, fee: 20, freeAbove: 199, prep: 10 });

  // ── Inventory & price lists ──
  async function stock(st: { id: string }, skus: string[], cfg: { priceFactor: [number, number]; wholesale?: boolean; moq?: number; outOfStock?: string[]; low?: string[] }) {
    const retail = await prisma.priceList.create({ data: { storeId: st.id, name: 'Retail', type: 'RETAIL', taxInclusive: true } });
    const wholesaleList = cfg.wholesale ? await prisma.priceList.create({ data: { storeId: st.id, name: 'Wholesale (GST extra)', type: 'WHOLESALE', taxInclusive: false } }) : null;
    for (const sku of skus) {
      const v = variantBy.get(sku);
      if (!v) throw new Error(`Unknown SKU ${sku}`);
      const factor = cfg.priceFactor[0] + rand() * (cfg.priceFactor[1] - cfg.priceFactor[0]);
      const price = Math.min(v.mrp, Math.round((v.mrp * factor) / 100) * 100);
      const qty = cfg.outOfStock?.includes(sku) ? 0 : cfg.low?.includes(sku) ? 3 : 15 + Math.floor(rand() * 60);
      const inv = await prisma.storeInventory.create({
        data: {
          storeId: st.id,
          variantId: v.id,
          stockQty: qty,
          lowStockThreshold: cfg.wholesale ? 3 : 5,
          batchNumber: v.rx || sku.startsWith('ORS') || sku.startsWith('VITC') ? `DEMO-B${100 + Math.floor(rand() * 900)}` : null,
          expiryDate: sku.startsWith('MILK') || sku.startsWith('PANEER') || sku.startsWith('CURD') || sku.startsWith('BREAD') ? new Date(Date.now() + 3 * 86400_000) : v.rx ? new Date(Date.now() + 400 * 86400_000) : null,
        },
      });
      await prisma.inventoryAuditLog.create({ data: { inventoryId: inv.id, reason: 'INITIAL', delta: qty, stockBefore: 0, stockAfter: qty, note: 'Seed data' } });
      await prisma.priceListItem.create({ data: { priceListId: retail.id, variantId: v.id, unitPrice: price, minOrderQty: cfg.moq ?? 1 } });
      if (wholesaleList) {
        // Wholesale list is GST-exclusive: strip GST from ~88% of MRP, then add two volume tiers.
        const { taxable } = splitInclusiveTax(Math.round(v.mrp * 0.88), v.tax);
        const base = Math.round(taxable / 100) * 100;
        const item = await prisma.priceListItem.create({ data: { priceListId: wholesaleList.id, variantId: v.id, unitPrice: base, minOrderQty: cfg.moq ?? 1 } });
        await prisma.priceTier.createMany({
          data: [
            { priceListItemId: item.id, minQty: 5, unitPrice: Math.round((base * 0.97) / 100) * 100 },
            { priceListItemId: item.id, minQty: 10, unitPrice: Math.round((base * 0.94) / 100) * 100 },
          ],
        });
      }
    }
  }
  const sku = (list: P[]) => list.flatMap((p) => p.variants.map(([s]) => `${p.key.toUpperCase()}-${s}`.replace(/[^A-Z0-9.-]/g, '')));
  const grocerySkus = sku(GROCERY);
  await stock(sharma, grocerySkus.filter((s) => !s.startsWith('BAJRA')), { priceFactor: [0.9, 0.98], outOfStock: ['CORIANDER-100G'], low: ['PANEER-200G', 'EGGS-12PC'] });
  await stock(fresh, grocerySkus.filter((s) => !s.startsWith('DIAPERS') && !s.startsWith('WIPES')), { priceFactor: [0.88, 1.0], outOfStock: ['MANGO-1.2L'], low: ['TOMATO-1KG'] });
  // Bundelkhand Fresh also supplies a few bulk vegetables to HoReCa buyers.
  await stock(wholesale, sku(HORECA), { priceFactor: [0.95, 1.0], wholesale: true, moq: 1, low: ['B-PANEER-1KG'], outOfStock: ['B-CUPS-PK500'] });
  const freshBulk = await prisma.priceList.create({ data: { storeId: fresh.id, name: 'Wholesale (GST extra)', type: 'WHOLESALE', taxInclusive: false } });
  for (const s of ['B-ONION-25KG', 'B-POTATO-50KG', 'B-TOMATO-25KG']) {
    const v = variantBy.get(s)!;
    await prisma.storeInventory.create({ data: { storeId: fresh.id, variantId: v.id, stockQty: 20, lowStockThreshold: 3 } });
    const retailList = await prisma.priceList.findFirstOrThrow({ where: { storeId: fresh.id, type: 'RETAIL' } });
    await prisma.priceListItem.create({ data: { priceListId: retailList.id, variantId: v.id, unitPrice: v.mrp } });
    await prisma.priceListItem.create({ data: { priceListId: freshBulk.id, variantId: v.id, unitPrice: Math.round((v.mrp * 0.86) / 100) * 100 } });
  }
  await stock(pharmacy, sku(CHEMIST), { priceFactor: [0.9, 0.95], low: ['THERMO-1PC'] });

  // ── Delivery partners ──
  const sonuP = await prisma.deliveryPartner.create({ data: { userId: sonu.id, cityId: jhansi.id, vehicleType: 'MOTORCYCLE', vehicleNumber: 'UP93 DEMO 0001', drivingLicenceNumber: 'DEMO-DL-0001', verificationStatus: 'APPROVED', isOnline: true, lastSeenAt: new Date() } });
  const deepakP = await prisma.deliveryPartner.create({ data: { userId: deepak.id, cityId: jhansi.id, vehicleType: 'SCOOTER', vehicleNumber: 'UP93 DEMO 0002', verificationStatus: 'APPROVED', isOnline: false } });
  await prisma.deliveryPartner.create({ data: { userId: ajay.id, cityId: jhansi.id, vehicleType: 'BICYCLE', verificationStatus: 'PENDING' } });

  // ── Business buyer ──
  const hotel = await prisma.businessProfile.create({
    data: {
      userId: vikram.id,
      businessName: 'Hotel Bundela Residency (Demo)',
      legalName: 'Bundela Hospitality (Demo) Pvt Ltd',
      businessType: 'HOTEL',
      gstin: '09EEEEE0000E1Z5',
      fssaiNumber: '12345678901234',
      billingAddress: 'Station Road, Civil Lines, Jhansi 284001',
      cityId: jhansi.id,
      contactPhone: vikram.phone!,
      verificationStatus: 'APPROVED',
      reviewNotes: 'Demo business – documents simulated.',
      creditApproved: true,
      creditLimit: rupees(50000),
      creditDays: 15,
    },
  });

  // ── Coupons ──
  const now = Date.now();
  const coupon = (c: Omit<Prisma.CouponUncheckedCreateInput, 'validFrom' | 'validTo'>) =>
    prisma.coupon.create({ data: { ...c, validFrom: new Date(now - 7 * 86400_000), validTo: new Date(now + 90 * 86400_000) } });
  await coupon({ code: 'WELCOME50', description: '₹50 off your first order above ₹199', discountType: 'FLAT', value: rupees(50), minOrderValue: rupees(199), firstOrderOnly: true });
  await coupon({ code: 'FRESH10', description: '10% off groceries above ₹299 (up to ₹75)', discountType: 'PERCENT', value: 10, maxDiscount: rupees(75), minOrderValue: rupees(299), vertical: 'GROCERY', perUserLimit: 3 });
  await coupon({ code: 'FREEDEL', description: 'Free delivery on orders above ₹149', discountType: 'FREE_DELIVERY', value: 0, minOrderValue: rupees(149), perUserLimit: 5 });
  await coupon({ code: 'SHARMA20', description: '₹20 off at Sharma Kirana (store offer)', discountType: 'FLAT', value: rupees(20), minOrderValue: rupees(150), storeId: sharma.id, perUserLimit: 2 });
  await coupon({ code: 'HORECA5', description: '5% off business orders above ₹3,000 (up to ₹500)', discountType: 'PERCENT', value: 5, maxDiscount: rupees(500), minOrderValue: rupees(3000), vertical: 'HORECA', perUserLimit: 10 });

  // ── Historical & in-flight orders ──
  const storeMeta = new Map([
    [sharma.id, { store: sharma, org: sharmaOrg, vertical: 'GROCERY' as Vertical, skus: grocerySkus.filter((s) => !['CORIANDER-100G', 'BAJRA-1KG'].includes(s)) }],
    [fresh.id, { store: fresh, org: freshOrg, vertical: 'GROCERY' as Vertical, skus: grocerySkus.filter((s) => !['MANGO-1.2L'].includes(s) && !s.startsWith('DIAPERS') && !s.startsWith('WIPES')) }],
    [wholesale.id, { store: wholesale, org: wholesaleOrg, vertical: 'HORECA' as Vertical, skus: sku(HORECA).filter((s) => s !== 'B-CUPS-PK500') }],
    [pharmacy.id, { store: pharmacy, org: pharmaOrg, vertical: 'CHEMIST' as Vertical, skus: sku(CHEMIST).filter((s) => !variantBy.get(s)!.rx) }],
  ]);
  const commissionBps = DEFAULT_SETTINGS.commissionBps;
  let orderSeq = 0;

  async function makeOrder(o: {
    customer: { id: string };
    address: typeof aartiHome;
    storeId: string;
    status: OrderStatus;
    daysAgo: number;
    method?: PaymentMethod;
    channel?: 'RETAIL' | 'BUSINESS';
    lines?: [string, number][];
    rider?: { id: string };
    prescriptionId?: string;
    cancelReason?: string;
  }) {
    const meta = storeMeta.get(o.storeId)!;
    const channel = o.channel ?? 'RETAIL';
    const lines = o.lines ?? Array.from({ length: 2 + Math.floor(rand() * 4) }, () => [pick(meta.skus), 1 + Math.floor(rand() * 3)] as [string, number]);
    const uniq = [...new Map(lines.map((l) => [l[0], l])).values()];
    const priced = [];
    for (const [s, qty] of uniq) {
      const v = variantBy.get(s)!;
      const type = channel === 'BUSINESS' ? 'WHOLESALE' : 'RETAIL';
      const item = await prisma.priceListItem.findFirst({ where: { variantId: v.id, priceList: { storeId: o.storeId, type } }, include: { priceList: true } });
      const fallback = item ?? (await prisma.priceListItem.findFirstOrThrow({ where: { variantId: v.id, priceList: { storeId: o.storeId, type: 'RETAIL' } }, include: { priceList: true } }));
      priced.push({ sku: s, v, qty, unitPrice: fallback.unitPrice, taxInclusive: fallback.priceList.taxInclusive });
    }
    const totals = computeOrderTotals(
      priced.map((p) => ({ key: p.sku, unitPrice: p.unitPrice, quantity: p.qty, taxRateBps: p.v.tax, taxInclusive: p.taxInclusive, mrp: p.v.mrp })),
      { delivery: { baseFee: meta.store.baseDeliveryFee, freeAbove: meta.store.freeDeliveryAbove, perKmFee: 500, freeKm: 2, distanceKm: 1.5 }, fulfilment: 'DELIVERY' },
    );
    const placedAt = new Date(now - o.daysAgo * 86400_000 - Math.floor(rand() * 8) * 3600_000);
    const vertical = channel === 'BUSINESS' ? 'HORECA' : meta.vertical === 'HORECA' ? 'GROCERY' : meta.vertical;
    const rate = commissionBps[vertical];
    const commission = commissionFor(totals.itemsSubtotal, rate);
    const method: PaymentMethod = o.method ?? (rand() < 0.6 ? 'COD' : 'UPI');
    const terminalPaid = o.status === 'DELIVERED';
    const paymentStatus =
      o.status === 'CANCELLED' || o.status === 'REJECTED'
        ? method === 'COD'
          ? 'VOID'
          : 'REFUNDED'
        : method === 'COD'
          ? terminalPaid
            ? 'COD_COLLECTED'
            : 'COD_PENDING'
          : method === 'BUSINESS_CREDIT'
            ? 'CREDIT_DUE'
            : o.status === 'AWAITING_RX_REVIEW'
              ? 'PENDING'
              : 'PAID';
    const path: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    const events: OrderStatus[] =
      o.status === 'AWAITING_RX_REVIEW'
        ? ['AWAITING_RX_REVIEW']
        : o.status === 'CANCELLED'
          ? ['PLACED', 'CANCELLED']
          : o.status === 'REJECTED'
            ? ['PLACED', 'REJECTED']
            : path.slice(0, path.indexOf(o.status) + 1);
    const deliveredAt = o.status === 'DELIVERED' ? new Date(placedAt.getTime() + (22 + Math.floor(rand() * 25)) * 60_000) : null;
    const lineBy = new Map(totals.lines.map((l) => [l.key, l]));
    const a = o.address;
    const loc = await prisma.locality.findUniqueOrThrow({ where: { id: a.localityId } });
    orderSeq++;
    const order = await prisma.order.create({
      data: {
        orderNumber: `PD-DEMO-${String(orderSeq).padStart(5, '0')}`,
        userId: o.customer.id,
        storeId: o.storeId,
        addressId: a.id,
        channel,
        vertical,
        status: o.status,
        paymentStatus,
        paymentMethod: method,
        idempotencyKey: randomUUID(),
        deliveryAddress: { contactName: a.contactName, contactPhone: a.contactPhone, line1: a.line1, line2: a.line2, landmark: a.landmark, locality: loc.name, city: 'Jhansi', state: 'Uttar Pradesh', postalCode: a.postalCode, lat: a.lat, lng: a.lng },
        buyerGstin: channel === 'BUSINESS' ? hotel.gstin : null,
        buyerBusinessName: channel === 'BUSINESS' ? hotel.businessName : null,
        itemsSubtotal: totals.itemsSubtotal,
        mrpTotal: totals.mrpTotal,
        deliveryFee: totals.deliveryFee,
        taxableValue: totals.taxableValue,
        taxTotal: totals.taxTotal,
        grandTotal: totals.grandTotal,
        commissionRateBps: rate,
        commissionAmount: commission,
        distanceKm: 1.5,
        etaMinMins: 20,
        etaMaxMins: 35,
        deliveryOtp: ['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status) ? null : String(1000 + Math.floor(rand() * 9000)),
        prescriptionId: o.prescriptionId ?? null,
        cancelReason: o.status === 'CANCELLED' ? o.cancelReason ?? 'Ordered by mistake' : null,
        rejectReason: o.status === 'REJECTED' ? 'Item quality not up to standard today' : null,
        placedAt,
        deliveredAt,
        items: {
          create: priced.map((p) => {
            const t = lineBy.get(p.sku)!;
            return {
              variantId: p.v.id,
              productName: p.v.productName,
              variantName: p.v.name,
              sku: p.sku,
              unitType: p.v.unitType,
              unitQuantity: p.v.unitQuantity,
              hsnCode: p.v.hsn,
              quantity: p.qty,
              unitPrice: p.unitPrice,
              mrp: p.v.mrp,
              taxInclusive: p.taxInclusive,
              taxRateBps: p.v.tax,
              lineAmount: t.lineAmount,
              netAmount: t.netAmount,
              taxableValue: t.taxableValue,
              taxAmount: t.tax,
              requiresPrescription: p.v.rx,
            };
          }),
        },
        events: {
          create: events.map((s, i) => ({
            fromStatus: i === 0 ? null : events[i - 1],
            toStatus: s,
            actorType: i === 0 ? 'CUSTOMER' : s === 'OUT_FOR_DELIVERY' || s === 'DELIVERED' ? 'DELIVERY' : 'SELLER',
            note: i === 0 ? 'Order created (demo data)' : null,
            createdAt: new Date(placedAt.getTime() + i * 5 * 60_000),
          })),
        },
        payments: {
          create: {
            method,
            provider: method === 'COD' ? 'cod' : method === 'BUSINESS_CREDIT' ? 'credit' : 'mock',
            amount: totals.grandTotal,
            status: paymentStatus === 'PAID' || paymentStatus === 'COD_COLLECTED' || paymentStatus === 'REFUNDED' ? 'SUCCEEDED' : paymentStatus === 'VOID' ? 'CANCELLED' : 'CREATED',
            idempotencyKey: randomUUID(),
            providerRef: method === 'COD' || method === 'BUSINESS_CREDIT' ? null : `mock_demo_${randomUUID()}`,
          },
        },
      },
    });
    if (paymentStatus === 'REFUNDED') await prisma.refund.create({ data: { orderId: order.id, amount: totals.grandTotal, reason: 'Order cancelled or rejected', status: 'PROCESSED', processedAt: new Date(placedAt.getTime() + 15 * 60_000) } });
    // In-flight orders hold stock, as they would after real checkout.
    if (!['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status)) {
      for (const p of priced) await prisma.storeInventory.update({ where: { storeId_variantId: { storeId: o.storeId, variantId: p.v.id } }, data: { stockQty: { decrement: p.qty } } });
    }
    if (o.status === 'DELIVERED') {
      await prisma.commissionEntry.create({ data: { orderId: order.id, sellerOrgId: meta.org.id, saleAmount: totals.itemsSubtotal, commissionRateBps: rate, commissionAmount: commission, sellerEarning: totals.itemsSubtotal - commission, createdAt: deliveredAt! } });
    }
    if (o.rider && ['OUT_FOR_DELIVERY', 'DELIVERED'].includes(o.status)) {
      await prisma.deliveryAssignment.create({
        data: {
          orderId: order.id,
          deliveryPartnerId: o.rider.id,
          status: o.status === 'DELIVERED' ? 'DELIVERED' : 'PICKED_UP',
          earningAmount: rupees(30) + 2 * rupees(5),
          assignedAt: new Date(placedAt.getTime() + 10 * 60_000),
          acceptedAt: new Date(placedAt.getTime() + 11 * 60_000),
          pickedUpAt: new Date(placedAt.getTime() + 18 * 60_000),
          completedAt: deliveredAt,
          events: { create: [{ status: 'ASSIGNED' }, { status: 'PICKED_UP' }, ...(o.status === 'DELIVERED' ? [{ status: 'DELIVERED' }] : [])] },
        },
      });
    }
    return order;
  }

  const customers = [
    { u: aarti, a: aartiHome },
    { u: rohit, a: rohitHome },
  ];
  const delivered = [];
  for (let d = 28; d >= 1; d -= 2) {
    const c = customers[d % 2];
    delivered.push(await makeOrder({ customer: c.u, address: c.a, storeId: d % 3 === 0 ? fresh.id : sharma.id, status: 'DELIVERED', daysAgo: d, rider: d % 4 === 0 ? deepakP : sonuP }));
  }
  delivered.push(await makeOrder({ customer: aarti, address: aartiHome, storeId: pharmacy.id, status: 'DELIVERED', daysAgo: 9, rider: sonuP }));
  for (const d of [20, 12, 5]) {
    delivered.push(await makeOrder({ customer: vikram, address: vikramHotel, storeId: wholesale.id, status: 'DELIVERED', daysAgo: d, channel: 'BUSINESS', method: d === 5 ? 'BUSINESS_CREDIT' : 'UPI', rider: sonuP, lines: [['B-ONION-25KG', 2], ['B-SOY-15L', 1], ['B-NAPKIN-CARTON20', 1]] }));
  }
  await makeOrder({ customer: rohit, address: rohitHome, storeId: sharma.id, status: 'CANCELLED', daysAgo: 6 });
  await makeOrder({ customer: aarti, address: aartiHome, storeId: fresh.id, status: 'REJECTED', daysAgo: 3, method: 'UPI' });
  // Live orders for the seller, delivery and tracking screens.
  await makeOrder({ customer: rohit, address: rohitHome, storeId: sharma.id, status: 'PLACED', daysAgo: 0, method: 'COD' });
  await makeOrder({ customer: aarti, address: aartiHome, storeId: sharma.id, status: 'ACCEPTED', daysAgo: 0, method: 'UPI' });
  await makeOrder({ customer: rohit, address: rohitHome, storeId: fresh.id, status: 'PREPARING', daysAgo: 0 });
  await makeOrder({ customer: aarti, address: aartiHome, storeId: sharma.id, status: 'READY_FOR_PICKUP', daysAgo: 0, method: 'COD' });
  await makeOrder({ customer: aarti, address: aartiHome, storeId: fresh.id, status: 'OUT_FOR_DELIVERY', daysAgo: 0, rider: sonuP, method: 'COD' });

  // A prescription awaiting pharmacist review.
  const pdf = demoPrescriptionPdf('Aarti Verma');
  const key = `prescription/${aarti.id}/${randomUUID()}.pdf`;
  await mkdir(path.dirname(path.join(storageDir, key)), { recursive: true });
  await writeFile(path.join(storageDir, key), pdf, { mode: 0o600 });
  const file = await prisma.storedFile.create({ data: { ownerUserId: aarti.id, purpose: 'PRESCRIPTION', storageKey: key, originalName: 'demo-prescription.pdf', mimeType: 'application/pdf', sizeBytes: pdf.length, sha256: createHash('sha256').update(pdf).digest('hex') } });
  const rx = await prisma.prescription.create({ data: { userId: aarti.id, fileId: file.id, patientName: 'Aarti Verma', doctorName: 'Dr. Demo Practitioner (fictional)', issuedOn: new Date(now - 2 * 86400_000) } });
  await makeOrder({ customer: aarti, address: aartiHome, storeId: pharmacy.id, status: 'AWAITING_RX_REVIEW', daysAgo: 0, method: 'COD', lines: [['AMOX-STRIP10', 1], ['ORS-SACHET', 2]], prescriptionId: rx.id });

  // ── Reviews, return, ticket, notifications ──
  for (const o of delivered.slice(0, 8)) {
    await prisma.review.create({ data: { userId: o.userId, orderId: o.id, storeId: o.storeId, rating: 3 + Math.floor(rand() * 3), comment: pick(['Fresh items, quick delivery.', 'Good packing.', 'Delivery partner was polite.', 'One item was missing a day ago but store fixed it.', null]) } });
  }
  for (const s of [sharma, fresh, wholesale, pharmacy]) {
    const agg = await prisma.review.aggregate({ where: { storeId: s.id }, _avg: { rating: true }, _count: true });
    await prisma.store.update({ where: { id: s.id }, data: { ratingAvg: Math.round((agg._avg.rating ?? 4.2) * 10) / 10 || 4.2, ratingCount: agg._count } });
  }
  const recentDelivered = delivered.find((o) => o.userId === aarti.id && o.storeId === sharma.id && o.placedAt.getTime() > now - 3 * 86400_000) ?? delivered[delivered.length - 5];
  const rItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: recentDelivered.id } });
  await prisma.returnRequest.create({ data: { orderId: recentDelivered.id, userId: recentDelivered.userId, reason: 'Packet was damaged on delivery (demo)', items: [{ orderItemId: rItem.id, quantity: 1 }], amount: Math.round(rItem.netAmount / rItem.quantity) } });
  await prisma.supportTicket.create({
    data: { ticketNumber: 'TK-DEMO-00001', userId: aarti.id, orderId: delivered[0].id, category: 'DELIVERY', subject: 'Delivery was later than the estimate', messages: { create: { authorId: aarti.id, body: 'My order came 20 minutes after the estimated time. Just letting you know. (demo ticket)' } } },
  });
  await prisma.notification.createMany({
    data: [
      { userId: aarti.id, type: 'PROMO', title: 'Fresh sabzi deals in Prem Nagar', body: 'Use FRESH10 for 10% off groceries above ₹299.' },
      { userId: ramesh.id, type: 'NEW_ORDER', title: 'You have new orders', body: 'Accept them from your seller dashboard.' },
    ],
  });

  // ── RFQs and quotations ──
  const rfqOpen = await prisma.rfq.create({
    data: {
      rfqNumber: 'RFQ-DEMO-00001',
      businessProfileId: hotel.id,
      userId: vikram.id,
      title: 'Weekly kitchen supplies – banquet weekend',
      notes: 'Delivery before 7 AM preferred.',
      neededBy: new Date(now + 4 * 86400_000),
      deliveryLocalityId: civil.id,
      items: {
        create: [
          { variantId: variantBy.get('B-ONION-25KG')!.id, description: 'Onion, 25 kg bag', quantity: 4, unit: 'KG' },
          { variantId: variantBy.get('B-POTATO-50KG')!.id, description: 'Potato, 50 kg bag', quantity: 2, unit: 'KG' },
          { variantId: variantBy.get('B-TOMATO-25KG')!.id, description: 'Tomato crate', quantity: 3, unit: 'KG' },
        ],
      },
    },
    include: { items: true },
  });
  for (const [st, factor] of [[wholesale, 0.84], [fresh, 0.87]] as const) {
    let subtotal = 0;
    const items = rfqOpen.items.map((it) => {
      const v = [...variantBy.values()].find((x) => x.id === it.variantId)!;
      const unitPrice = Math.round((v.mrp * factor) / 100) * 100;
      subtotal += unitPrice * Number(it.quantity);
      return { rfqItemId: it.id, variantId: it.variantId, unitPrice, taxRateBps: 0, available: true };
    });
    await prisma.quotation.create({
      data: { rfqId: rfqOpen.id, storeId: st.id, sellerOrgId: st.sellerOrgId, validUntil: new Date(now + 3 * 86400_000), deliveryFee: st.id === fresh.id ? rupees(100) : 0, subtotal, taxTotal: 0, grandTotal: subtotal + (st.id === fresh.id ? rupees(100) : 0), notes: st.id === fresh.id ? 'Morning delivery from 6 AM.' : 'Free delivery. Graded produce.', items: { create: items } },
    });
  }
  await prisma.rfq.update({ where: { id: rfqOpen.id }, data: { status: 'QUOTED' } });
  await prisma.rfq.create({
    data: {
      rfqNumber: 'RFQ-DEMO-00002',
      businessProfileId: hotel.id,
      userId: vikram.id,
      title: 'Monthly housekeeping consumables',
      deliveryLocalityId: civil.id,
      items: {
        create: [
          { variantId: variantBy.get('B-FLOOR-5L')!.id, description: 'Floor cleaner 5 L', quantity: 10, unit: 'L' },
          { variantId: variantBy.get('B-GARBAGE-PK30')!.id, description: 'Garbage bags large, pack of 30', quantity: 20, unit: 'PACK' },
          { variantId: null, description: 'Toilet cleaner 1 L (any brand)', quantity: 24, unit: 'BOTTLE' },
        ],
      },
    },
  });
  await prisma.procurementList.create({
    data: {
      businessProfileId: hotel.id,
      storeId: wholesale.id,
      name: 'Daily kitchen staples',
      recurrence: 'DAILY',
      nextDueAt: new Date(now + 86400_000),
      items: { create: [{ variantId: variantBy.get('B-ONION-25KG')!.id, quantity: 1 }, { variantId: variantBy.get('B-PANEER-1KG')!.id, quantity: 5 }, { variantId: variantBy.get('B-WATER-CASE12')!.id, quantity: 4 }] },
    },
  });

  // ── A completed (simulated) settlement for older Sharma Kirana orders ──
  const old = await prisma.commissionEntry.findMany({ where: { sellerOrgId: sharmaOrg.id, createdAt: { lt: new Date(now - 14 * 86400_000) } } });
  if (old.length) {
    const s = await prisma.settlement.create({
      data: {
        sellerOrgId: sharmaOrg.id,
        periodStart: old[0].createdAt,
        periodEnd: old[old.length - 1].createdAt,
        orderCount: old.length,
        grossSales: old.reduce((a, e) => a + e.saleAmount, 0),
        commissionAmount: old.reduce((a, e) => a + e.commissionAmount, 0),
        netPayable: old.reduce((a, e) => a + e.sellerEarning, 0),
        status: 'PAID',
        reference: 'DEMO-UTR-0001 (simulated)',
        paidAt: new Date(now - 10 * 86400_000),
      },
    });
    await prisma.commissionEntry.updateMany({ where: { id: { in: old.map((e) => e.id) } }, data: { settlementId: s.id } });
  }

  await prisma.auditLog.create({ data: { actorUserId: superAdmin.id, action: 'DEMO_SEEDED', entityType: 'Platform', metadata: { note: 'All data is fictional demo data' } } });
  log(`Seeded demo data: ${variantBy.size} SKUs, ${orderSeq} orders, ${await prisma.user.count()} demo users.`);
  if (!demoPassword) log('DEMO_USER_PASSWORD not set: demo users have no password. Use the development demo sign-in instead.');
  return { jhansi, stores: { sharma, fresh, wholesale, pharmacy }, users: { aarti, rohit, vikram, ramesh, neha, imran, sunil, pooja, manoj, sonu, deepak, ajay, superAdmin }, localities: { sipri, civil, prem, sadar, nandan, gwRoad, medical }, hotel, sonuP, deepakP, variantBy };
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    console.error('Refusing to seed demo data in production.');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    if ((await prisma.user.count()) > 0) {
      console.error('Database already has data. Run `npm run db:reset` to wipe and reseed.');
      process.exit(1);
    }
    await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join('prisma', 'seed.ts'))) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
