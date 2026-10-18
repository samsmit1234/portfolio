export type OrderStatus = "preparing" | "ready" | "done";
export type AlertSound = "chime" | "beep" | "siren";
export type Lang = "fr" | "ar" | "en";

export interface Restaurant {
  id: string;
  name: string;
  logo_url: string | null;
  owner_id: string;
  alert_sound: AlertSound;
  language: Lang;
  created_at: string;
}

export interface Order {
  id: string;
  restaurant_id: string;
  number: string;
  status: OrderStatus;
  created_at: string;
  ready_at: string | null;
}

export interface PublicOrder {
  id: string;
  number: string;
  status: OrderStatus;
  created_at: string;
  ready_at: string | null;
  restaurant_name: string;
  restaurant_logo_url: string | null;
  alert_sound: AlertSound;
  language: Lang;
}
