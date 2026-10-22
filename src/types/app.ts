// Short, friendly names for the database types we use a lot.
// Where it's used: data functions (src/lib/data/) and components.
//
// src/types/database.ts is made by `npm run gen:types` (never edit it by hand;
// re-run that command after every new migration). This file only gives
// nicknames to parts of it, so components don't need long type paths.

import type { Database } from "./database";

// The database's "public" section (tables, functions and enums).
type PublicSchema = Database["public"];

// One row from get_open_sessions(): a dated class with its live seats left.
export type OpenSession =
  PublicSchema["Functions"]["get_open_sessions"]["Returns"][number];

// One editable block of page text from the site_content table.
export type SiteContentRow = PublicSchema["Tables"]["site_content"]["Row"];

// All 10 booking statuses (pending_payment, confirmed, ...).
export type BookingStatus = PublicSchema["Enums"]["booking_status"];
