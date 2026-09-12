import { integer, sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";

export const properties = sqliteTable("properties", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  destination: text("destination").notNull(),
  area: text("area").notNull(),
  description: text("description").notNull(),
  taxPercent: integer("tax_percent").notNull(),
});

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  propertyId: text("property_id")
    .notNull()
    .references(() => properties.id),
  name: text("name").notNull(),
  roomType: text("room_type").notNull(),
  nightlyRate: integer("nightly_rate").notNull(),
  extraAdultFee: integer("extra_adult_fee").notNull(),
  includedGuests: integer("included_guests").notNull(),
  maxAdults: integer("max_adults").notNull(),
  maxChildren: integer("max_children").notNull(),
  maxGuests: integer("max_guests").notNull(),
  isPrivate: integer("is_private").notNull(),
  description: text("description").notNull(),
});

export const amenities = sqliteTable("amenities", {
  roomId: text("room_id")
    .notNull()
    .references(() => rooms.id),
  name: text("name").notNull(),
});

export const policies = sqliteTable("policies", {
  propertyId: text("property_id")
    .notNull()
    .references(() => properties.id),
  kind: text("kind").notNull(),
  body: text("body").notNull(),
});

export const addons = sqliteTable("addons", {
  id: text("id").primaryKey(),
  propertyId: text("property_id")
    .notNull()
    .references(() => properties.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  priceInr: integer("price_inr").notNull(),
  priceType: text("price_type").notNull(),
});

export const inventory = sqliteTable(
  "inventory",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    date: text("date").notNull(),
    available: integer("available").notNull(),
  },
  (table) => [primaryKey({ columns: [table.roomId, table.date] })],
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  bookingState: text("booking_state").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const bookingHolds = sqliteTable("booking_holds", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  roomId: text("room_id")
    .notNull()
    .references(() => rooms.id),
  checkIn: text("check_in").notNull(),
  checkOut: text("check_out").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  status: text("status").notNull().default("held"),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

export const schema = {
  properties,
  rooms,
  amenities,
  policies,
  addons,
  inventory,
  sessions,
  bookingHolds,
  messages,
};

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  destination TEXT NOT NULL,
  area TEXT NOT NULL,
  description TEXT NOT NULL,
  tax_percent INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  room_type TEXT NOT NULL,
  nightly_rate INTEGER NOT NULL,
  extra_adult_fee INTEGER NOT NULL,
  included_guests INTEGER NOT NULL,
  max_adults INTEGER NOT NULL,
  max_children INTEGER NOT NULL,
  max_guests INTEGER NOT NULL,
  is_private INTEGER NOT NULL,
  description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS amenities (
  room_id TEXT NOT NULL REFERENCES rooms(id),
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS policies (
  property_id TEXT NOT NULL REFERENCES properties(id),
  kind TEXT NOT NULL,
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS addons (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_inr INTEGER NOT NULL,
  price_type TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory (
  room_id TEXT NOT NULL REFERENCES rooms(id),
  date TEXT NOT NULL,
  available INTEGER NOT NULL,
  PRIMARY KEY (room_id, date)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  booking_state TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS booking_holds (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  room_id TEXT NOT NULL REFERENCES rooms(id),
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'held'
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;
