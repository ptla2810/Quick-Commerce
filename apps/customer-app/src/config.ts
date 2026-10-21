/**
 * API base URL. Set EXPO_PUBLIC_API_URL in .env (see .env.example):
 * - iOS simulator: http://localhost:4000
 * - Android emulator: http://10.0.2.2:4000
 * - Physical phone: http://<your-computer-LAN-IP>:4000 (same Wi-Fi)
 * Use HTTPS in production.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
export const BRAND_NAME = process.env.EXPO_PUBLIC_BRAND_NAME ?? 'Padosi';
