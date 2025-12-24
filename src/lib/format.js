import { APP_CONFIG } from "../app/config";

export function formatPrice(value) {
  if (value == null) return "-";
  return `${value} ${APP_CONFIG.defaultCurrencySymbol}`;
}
